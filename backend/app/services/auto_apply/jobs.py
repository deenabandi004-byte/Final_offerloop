"""
auto_apply.jobs — the auto-apply filler as a durable, out-of-process job.

WHY THIS EXISTS (2026-07-12):
    The filler drives a browser via Playwright (`sync_playwright()` spawns a
    Node driver subprocess) and Browserbase. Run inside a Gunicorn WEB worker,
    starting it reliably killed the whole container ~23s in — Render restarted
    the instance, which took drafts, Scout, the feed and Gmail down with it.
    Reproduced 3/3. A secondary feature was a loaded gun pointed at the hero.

    Same lesson worker.py already learned for Loop cycles: long, heavy work does
    not belong on the web workers. This module is the importable entrypoint RQ
    calls, so the browser only ever starts in the dedicated worker process.

    The win is CONTAINMENT first, cure second: if the filler still crashes, it
    now takes down a worker (which RQ requeues) instead of the web service. The
    app keeps drafting.

Ownership note: this function — NOT the web route — owns the terminal state and
the refund, because it's the only thing still running when the filler finishes.
If the worker itself dies mid-fill, the doc is left in-flight and the READ-time
reaper in routes/auto_apply.py (_reap_if_stale) finalizes + refunds it. Belt and
braces: nothing can stay 'running' forever.

Must stay importable at a stable dotted path (RQ resolves it by string) — no
closures, no lambdas. Registered in services/rq_queue.py JOB_REGISTRY.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Hard ceiling on one fill. A real run is well under 3 min (the fillers cap
# their own steps at 60s connect / 30s networkidle), so this only ever catches
# a genuine hang. Kept BELOW the read-time reaper's staleness window so the
# in-worker guard gets first crack at writing an honest failure reason.
AUTO_APPLY_JOB_TIMEOUT_SECONDS = 240


def run_auto_apply_task(
    auto_apply_id: str,
    uid: str,
    job_id: str,
    dry_run: bool = False,
    edited_answers: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Run one auto-apply to a terminal state. Safe to run in an RQ worker."""
    # Imported lazily: keeps Playwright (and its Node driver) out of the web
    # process's import graph entirely. The web service must never load this.
    from app.extensions import get_db
    from app.config import AUTO_APPLY_CREDITS
    from app.services.auth import refund_credits_atomic
    from app.services.auto_apply.runner import run_auto_apply_job

    db = get_db()
    job_ref = (
        db.collection("users").document(uid)
        .collection("autoApplyJobs").document(auto_apply_id)
    )

    guard = ThreadPoolExecutor(max_workers=1)
    try:
        future = guard.submit(
            run_auto_apply_job,
            auto_apply_id=auto_apply_id,
            uid=uid,
            job_id=str(job_id),
            dry_run=dry_run,
            edited_answers=edited_answers,
        )
        try:
            future.result(timeout=AUTO_APPLY_JOB_TIMEOUT_SECONDS)
        except FuturesTimeout:
            logger.error(
                "auto-apply %s exceeded %ss; forcing failed",
                auto_apply_id,
                AUTO_APPLY_JOB_TIMEOUT_SECONDS,
            )
            now = datetime.utcnow().isoformat()
            try:
                job_ref.update({
                    "status": "failed",
                    "stage": "failed",
                    "failure_reason": (
                        "Timed out while filling the application. "
                        "Nothing was submitted — please try again."
                    ),
                    "failed_at": now,
                    "updated_at": now,
                })
            except Exception:
                logger.exception("could not mark auto-apply %s timed out", auto_apply_id)
    except Exception:
        logger.exception("auto-apply task crashed for %s", auto_apply_id)
    finally:
        # Never block on a hung filler.
        guard.shutdown(wait=False)
        # Refund on failure (real submits only). Idempotent via credits_refunded,
        # so the read-time reaper can't double-refund what we refund here.
        if not dry_run:
            try:
                data = job_ref.get().to_dict() or {}
                charged = int(data.get("credits_charged") or AUTO_APPLY_CREDITS)
                if (
                    data.get("status") in ("failed", "submit_failed")
                    and not data.get("credits_refunded")
                ):
                    refund_credits_atomic(uid, charged, "auto_apply_refund")
                    job_ref.update({"credits_refunded": True})
            except Exception:
                logger.exception("refund check failed for auto-apply %s", auto_apply_id)
