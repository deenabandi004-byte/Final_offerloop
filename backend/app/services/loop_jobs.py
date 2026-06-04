"""
loop_jobs — RQ worker entrypoints for Loop background work.

These functions are imported by name by the RQ worker process via
rq_queue.JOB_REGISTRY. Each one is a self-contained execution unit:
loads its own Firestore client, doesn't rely on Flask request context.

Don't import this module from request handlers — go through rq_queue.enqueue
instead. That way the dev-fallback (no Redis) still works.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def run_loop_cycle_job(uid: str, loop_id: str, cycle_id: str | None = None) -> dict:
    """RQ worker entrypoint: run one Loop cycle end-to-end.

    Steps:
      1. Load the Loop doc; bail if it's gone (deleted between enqueue and run).
      2. Build the synthetic config that the legacy _run_cycle expects.
      3. Run the cycle.
      4. Stamp the cycle doc with loopId so the activity feed can join.
      5. Atomically increment the Loop's counter fields with deltas.
      6. Flip status to 'done' (autopilot) or keep 'running' (review-first).

    Idempotency: cycles are created with a UUID, and counter writes are
    Firestore Increments — re-running this job on the same cycle_id is
    harmless on the cycle doc but WILL double-count on the Loop totals.
    RQ retries are disabled by default for that reason; if we add retries
    later we'll need a cycle-level guard.
    """
    import uuid as _uuid
    from google.cloud.firestore_v1 import Increment

    from app.extensions import get_db
    from app.services.agent_service import DEFAULT_AGENT_CONFIG, _run_cycle
    from app.services.loop_service import (
        release_cycle_lock,
        try_claim_cycle_lock,
    )

    db = get_db()
    loop_ref = (
        db.collection("users").document(uid)
          .collection("loops").document(loop_id)
    )
    loop_doc = loop_ref.get()
    if not loop_doc.exists:
        logger.info("run_loop_cycle_job: loop=%s already deleted, skipping", loop_id)
        return {"status": "skipped", "reason": "loop_deleted"}

    # Phase 9.1 — per-Loop concurrency lock. Refuses to start a second
    # cycle when one is already running. Stale recovery handled inside
    # try_claim_cycle_lock — a crashed prior run won't strand the Loop.
    if not try_claim_cycle_lock(uid, loop_id):
        logger.info(
            "run_loop_cycle_job: loop=%s cycle already running — skipping",
            loop_id,
        )
        return {"status": "skipped", "reason": "cycle_already_running"}

    loop = loop_doc.to_dict() or {}
    bp = loop.get("briefParsed") or {}
    # Old Loop docs predate loopMode — default to "people" to preserve today's
    # behavior. loop_service writes "people" on create, so this default only
    # fires for pre-Slice-1 records.
    loop_mode = loop.get("loopMode") or "people"
    synthetic_config = {
        **DEFAULT_AGENT_CONFIG,
        "briefText": loop.get("briefText", ""),
        "briefParsed": bp,
        "loopMode": loop_mode,
        "loopId": loop_id,
        "targetCompanies": bp.get("companies") or [],
        "targetIndustries": bp.get("industries") or [],
        "targetRoles": bp.get("roles") or [],
        "targetLocations": bp.get("locations") or [],
        "weeklyContactTarget": loop.get("weeklyTarget", 5),
        # Always autopilot — reviewBeforeSend controls send mode, not action
        # execution. See loop_service.trigger_loop_cycle for the same logic.
        "approvalMode": "autopilot",
        "reviewBeforeSend": loop.get("reviewBeforeSend", True),
        "status": "active",
        # Phase 9 — auto-send state. agent_actions._try_auto_send reads
        # these per-contact to drive can_auto_send. Pre-Phase-9 Loops
        # default to draft_only (today's behavior).
        "autoSendMode": loop.get("autoSendMode", "draft_only"),
        "autoSendApprovedCount": loop.get("autoSendApprovedCount", 0),
        # 0 = no warmup gate (shipping default). See note in
        # agent_actions._try_auto_send loop_view block.
        "autoSendApprovedAfter": loop.get("autoSendApprovedAfter", 0),
        "hardDailySendCap": loop.get("hardDailySendCap"),
    }

    if not cycle_id:
        cycle_id = str(_uuid.uuid4())

    try:
        result = _run_cycle(uid, synthetic_config, cycle_id=cycle_id)
    except Exception:
        logger.exception("run_loop_cycle_job: _run_cycle crashed uid=%s loop=%s", uid, loop_id)
        try:
            loop_ref.update({"status": "idle"})
        except Exception:
            pass
        # Release the concurrency lock so the next scheduler tick can
        # actually run this Loop — without this, a crashed cycle would
        # leave cycleRunning=True until STALE_LOCK_AFTER_MINUTES elapsed.
        release_cycle_lock(uid, loop_id)
        raise

    # Stamp the cycle so the activity feed can join cycles → actions by loopId.
    try:
        db.collection("users").document(uid) \
          .collection("agent_cycles").document(cycle_id) \
          .update({"loopId": loop_id})
    except Exception:
        logger.exception("Failed to stamp loopId on cycle %s", cycle_id)

    # Mirror counters onto the Loop. Wrapped — the Loop may have been deleted
    # mid-cycle; the cycle's drafts/contacts are still saved to the tracker.
    deltas: dict = {}
    if result.get("contactsFound", 0):
        deltas["totalContactsFound"] = Increment(result["contactsFound"])
    if result.get("emailsDrafted", 0):
        deltas["totalEmailsDrafted"] = Increment(result["emailsDrafted"])
    if result.get("jobsFound", 0):
        deltas["totalJobsFound"] = Increment(result["jobsFound"])
    if result.get("hmsFound", 0):
        deltas["totalHmsContacted"] = Increment(result["hmsFound"])
    if result.get("companiesDiscovered", 0):
        deltas["totalCompaniesDiscovered"] = Increment(result["companiesDiscovered"])
    # Phase 8: roll weekly credit spend onto the Loop doc atomically so the
    # scheduler's budget gate has the right number on its next pass.
    cycle_credits = int(result.get("creditsSpent", 0) or 0)
    if cycle_credits > 0:
        deltas["weekCreditsSpent"] = Increment(cycle_credits)

    now_iso = datetime.now(timezone.utc).isoformat()
    updates = {
        **deltas,
        "lastRunAt": now_iso,
        "status": "running" if loop.get("reviewBeforeSend", True) else "done",
        # Phase 9.1 — release the concurrency lock in the same atomic
        # write that records counters. Cheaper than a separate
        # release_cycle_lock call and guarantees the lock can't outlive
        # the cycle if the final update lands.
        "cycleRunning": False,
        "cycleStartedAt": None,
    }

    # Rate-limit 3-strike: if THIS cycle hit a rate limit anywhere, bump the
    # streak; otherwise reset to 0. After the threshold we pause the Loop with
    # pauseReason="rate_limited". loop_budget.can_run_now also gates on the
    # field independently, so a stuck Loop can't keep rescheduling.
    from app.services.loop_budget import RATE_LIMIT_STRIKE_THRESHOLD
    if result.get("rateLimited"):
        prior = int(loop.get("consecutiveRateLimitCycles", 0) or 0)
        new_streak = prior + 1
        updates["consecutiveRateLimitCycles"] = new_streak
        if new_streak >= RATE_LIMIT_STRIKE_THRESHOLD:
            updates["status"] = "paused"
            updates["pauseReason"] = "rate_limited"
            logger.warning(
                "loop=%s paused after %d consecutive rate-limited cycles",
                loop_id, new_streak,
            )
    elif loop.get("consecutiveRateLimitCycles"):
        # Clean cycle resets the streak.
        updates["consecutiveRateLimitCycles"] = 0

    try:
        loop_ref.update(updates)
    except Exception as e:
        logger.info(
            "Loop %s vanished mid-cycle (likely deleted by user); "
            "skipping counter update. err=%s",
            loop_id, e,
        )

    return {
        "status": "completed",
        "cycleId": cycle_id,
        "loopId": loop_id,
        **{k: v for k, v in result.items() if k != "contacts"},
    }
