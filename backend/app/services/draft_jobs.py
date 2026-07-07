"""
Server-side draft jobs: the async swipe→draft pattern (mobile).

POST /api/mobile/draft-jobs hands the swipe to this module and returns a job
id in under a second; the pipeline (runs.execute_prompt_search) runs on a
bounded background pool and streams REAL stage updates into the job doc at
users/{uid}/draftJobs/{job_id}. The app polls the doc (2-3s) to show honest
progress — including the found contact's name — and reads the final result
from it. Same architecture coffee_chat_prep proved out, generalized.

Why a bounded pool: each draft is a heavy 25-60s pipeline. Unbounded
threads under burst-swiping would starve the box exactly like unbounded
requests did. Three concurrent jobs per gunicorn worker process keeps
memory sane; excess jobs queue in submission order and their docs stay
'queued' (the app renders that honestly as "in line").

Job doc lifecycle:
  queued → running (stage: parsing → searching → found → researching →
  writing → drafting → saving) → completed | failed
Result payload is stored as JSON (slimmed of heavy enrichment when large,
same guard as swipe_idempotency). Credits/idempotency/refunds are handled
INSIDE execute_prompt_search — this module never touches money.

Job id doubles as the idempotency handle: when the client sends a swipe_id,
it IS the job id, so re-POSTing the same gesture returns the existing job
instead of spawning a second pipeline.
"""

import json
import re
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{8,128}$")
_TTL = timedelta(days=7)
# A running job whose last heartbeat is older than this belongs to a dead
# process (deploy restart, crash) — report it failed so the app can retry.
# A healthy pipeline updates the doc at every stage; the longest quiet gap
# (enrichment + email generation on a big batch) is well under 4 minutes.
# Must be SHORTER than the app's 6-minute polling deadline, or a crash
# leaves the user stuck watching "running" with no way to retry (field-
# tested 2026-07-07: instance restart mid-cook froze 4 jobs for 10 min).
STALE_RUNNING = timedelta(minutes=4)
_MAX_STORED_RESULT_BYTES = 700_000
_HEAVY_CONTACT_FIELDS = (
    "briefing",
    "enrichment_talking_points",
    "enrichment_recent_activity",
    "perplexity_media_appearances",
    "perplexity_published_writing",
    "perplexity_news_mentions",
    "linkedin_recent_posts",
    "company_recent_news",
    "company_description",
)

# Per-process pool. With 2 gunicorn sync workers that's at most 6 concurrent
# pipelines box-wide — tuned for the 512MB staging instance; raise with RAM.
_POOL = ThreadPoolExecutor(max_workers=3, thread_name_prefix="draftjob")


def _job_ref(db, user_id: str, job_id: str):
    return (
        db.collection("users")
        .document(user_id)
        .collection("draftJobs")
        .document(job_id)
    )


def _slim_result_json(payload: dict) -> str:
    body = json.dumps(payload, default=str)
    if len(body.encode("utf-8")) > _MAX_STORED_RESULT_BYTES:
        slim = dict(payload)
        slim["contacts"] = [
            {k: v for k, v in c.items() if k not in _HEAVY_CONTACT_FIELDS}
            for c in (slim.get("contacts") or [])
            if isinstance(c, dict)
        ]
        slim["result_slim"] = True
        body = json.dumps(slim, default=str)
    return body


def create_draft_job(db, *, user_id: str, user_email: str, auth_display_name: str, data: dict) -> dict:
    """Create (or return the existing) draft job for this swipe and submit it
    to the background pool. Returns the public job state dict."""
    swipe_id = (data.get("swipe_id") or "").strip()
    job_id = swipe_id if _SAFE_ID.match(swipe_id or "") else f"job-{uuid4().hex}"

    ref = _job_ref(db, user_id, job_id)
    now = datetime.now(timezone.utc)
    doc = {
        "status": "queued",
        "stage": "queued",
        "stageLabel": "In line — drafting starts in a moment",
        "progressPct": 0,
        "prompt": (data.get("prompt") or "")[:500],
        "mode": (data.get("mode") or "")[:16],
        "createdAt": now,
        "updatedAt": now,
        "expires_at": now + _TTL,
    }
    try:
        ref.create(doc)
    except Exception:
        # Job already exists for this gesture (client retry / double-POST):
        # return its current state instead of spawning a second pipeline.
        # If it belongs to a dead process, reset and resubmit.
        try:
            snap = ref.get()
            existing = snap.to_dict() if snap.exists else None
        except Exception:
            existing = None
        if existing:
            state = public_job_state(job_id, existing)
            if state["status"] in ("queued", "running", "completed"):
                return state
            # failed → fall through: reset the doc and re-run
            try:
                ref.set(doc)
            except Exception:
                traceback.print_exc()
        else:
            # create() failed transiently but the doc isn't there — try set().
            ref.set(doc)

    _POOL.submit(
        _run_job,
        db,
        user_id=user_id,
        user_email=user_email,
        auth_display_name=auth_display_name,
        data=data,
        job_id=job_id,
    )
    return {"jobId": job_id, "status": "queued", "stage": "queued",
            "stageLabel": doc["stageLabel"], "progressPct": 0}


def _run_job(db, *, user_id: str, user_email: str, auth_display_name: str, data: dict, job_id: str) -> None:
    """Pool worker: run the full pipeline, streaming stage updates to the doc."""
    ref = _job_ref(db, user_id, job_id)

    def _update(fields: dict) -> None:
        try:
            fields["updatedAt"] = datetime.now(timezone.utc)
            ref.set(fields, merge=True)
        except Exception:
            traceback.print_exc()

    # Per-stage wall-clock, persisted on the job doc (stageTimings map). This
    # is the Phase 3 measurement layer: every real swipe records where its
    # seconds went, so "make it faster" decisions run on data, not guesses.
    started_at = time.time()
    last_stage = {"name": "queued", "t": started_at}

    def _progress(stage, label, pct, extra=None):
        now = time.time()
        fields = {
            "status": "running",
            "stage": stage,
            "stageLabel": label,
            "progressPct": int(pct),
        }
        if stage != last_stage["name"]:
            fields["stageTimings"] = {last_stage["name"]: round(now - last_stage["t"], 2)}
            last_stage["name"], last_stage["t"] = stage, now
        # The 'found' beat carries the real people (name/title/company) so the
        # app can put the actual name on the drafting row within seconds.
        if extra and isinstance(extra, dict) and extra.get("contacts"):
            fields["foundContacts"] = extra["contacts"][:15]
        # Per-pass research timings (person / linkedin_posts / company_news).
        if extra and isinstance(extra, dict) and extra.get("enrichTimings"):
            fields["enrichTimings"] = extra["enrichTimings"]
        _update(fields)

    _update({"status": "running", "stage": "starting", "stageLabel": "Starting", "progressPct": 3})
    try:
        # Import here to avoid a circular import at module load
        # (routes.runs imports services; this service runs the route's pipeline).
        from app.routes.runs import execute_prompt_search

        payload, code = execute_prompt_search(
            user_id=user_id,
            user_email=user_email,
            auth_display_name=auth_display_name,
            data=data,
            progress=_progress,
        )
        total = round(time.time() - started_at, 2)
        _update({
            "status": "completed",
            "stage": "done",
            "stageLabel": "Draft ready",
            "progressPct": 100,
            "statusCode": int(code),
            "resultJson": _slim_result_json(payload),
            "completedAt": datetime.now(timezone.utc),
            "stageTimings": {last_stage["name"]: round(time.time() - last_stage["t"], 2)},
            "totalSeconds": total,
        })
        print(f"[DraftJob] {job_id} completed in {total}s", flush=True)
    except Exception as e:
        # execute_prompt_search already refunded credits + released the
        # idempotency claim on its own error paths.
        print(f"[DraftJob] {job_id} failed: {e}")
        traceback.print_exc()
        _update({
            "status": "failed",
            "stage": "failed",
            "stageLabel": "Could not draft",
            "progressPct": 100,
            "error": str(e)[:500],
            "failedAt": datetime.now(timezone.utc),
        })


def public_job_state(job_id: str, doc: dict) -> dict:
    """Shape a job doc for the API (parse the stored result, hide internals).
    A 'running' job with a stale heartbeat is reported failed — its process
    died (deploy/crash) and it will never finish."""
    status = doc.get("status") or "queued"
    updated = doc.get("updatedAt")
    try:
        if status in ("queued", "running") and updated is not None and (
            datetime.now(timezone.utc) - updated
        ) > STALE_RUNNING:
            status = "failed"
    except Exception:
        pass

    state = {
        "jobId": job_id,
        "status": status,
        "stage": doc.get("stage") or status,
        "stageLabel": doc.get("stageLabel") or "",
        "progressPct": int(doc.get("progressPct") or 0),
    }
    if doc.get("foundContacts"):
        state["foundContacts"] = doc["foundContacts"]
    if status == "completed":
        try:
            state["result"] = json.loads(doc.get("resultJson") or "{}")
        except Exception:
            state["result"] = {}
        state["statusCode"] = int(doc.get("statusCode") or 200)
        # Where the seconds went — the Phase 3 measurement layer, exposed so
        # tooling (and eventually the app) can read it per draft.
        if doc.get("stageTimings"):
            state["stageTimings"] = doc["stageTimings"]
        if doc.get("enrichTimings"):
            state["enrichTimings"] = doc["enrichTimings"]
        if doc.get("totalSeconds") is not None:
            state["totalSeconds"] = doc["totalSeconds"]
    if status == "failed":
        state["error"] = doc.get("error") or "Draft failed"
    return state
