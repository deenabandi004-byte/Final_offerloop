"""
Idempotency for swipe→draft requests (mobile).

The app sends a per-gesture swipe_id with POST /api/prompt-search; we record
it under users/{uid}/swipeRequests/{swipe_id} BEFORE the pipeline runs, so a
retry of the same gesture replays the recorded outcome instead of re-running
a pipeline that creates Gmail drafts and charges credits. The web app doesn't
send swipe_id, so it is untouched.

Lifecycle: claim() → 'run' (we own it) / 'completed' (replay stored response)
/ 'in_flight' (another request is mid-pipeline — caller should 409). complete()
stores the outcome; fail() releases the claim so a retry can re-run. Stale
'processing' docs (older than gunicorn would ever let a request live) are
treated as failed and reclaimed.
"""

import json
import re
import traceback
from datetime import datetime, timedelta, timezone

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{8,128}$")
# gunicorn --timeout (300s) kills a request long before this, so a
# 'processing' doc this old belongs to a dead request and is reclaimable.
# Kept in lockstep with draft_jobs.STALE_RUNNING: when a crash orphans a
# job AND its claim, the retry must be able to reclaim both at the same
# moment or the re-run answers 409 in_flight and the app waits forever.
_STALE_PROCESSING = timedelta(minutes=4)
_TTL = timedelta(days=7)
# Stay well clear of Firestore's 1 MiB document cap when storing the response.
_MAX_STORED_RESPONSE_BYTES = 700_000
# Per-contact enrichment payloads are the bulk of an oversized response; a
# replay without them still carries the contact + email, which is what the
# retrying client needs.
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


def valid_swipe_id(swipe_id: str) -> bool:
    return bool(swipe_id) and bool(_SAFE_ID.match(swipe_id))


def _ref(db, user_id: str, swipe_id: str):
    return (
        db.collection("users")
        .document(user_id)
        .collection("swipeRequests")
        .document(swipe_id)
    )


def _processing_payload() -> dict:
    now = datetime.now(timezone.utc)
    return {
        "status": "processing",
        "startedAt": now,
        "expires_at": now + _TTL,
    }


def claim(db, user_id: str, swipe_id: str):
    """Try to claim this swipe_id for execution.

    Returns (outcome, stored):
      ('run', None)        — claim acquired, caller should execute the pipeline
      ('completed', dict)  — already ran; replay stored['responseJson'] with
                             stored['statusCode']
      ('in_flight', None)  — another request with this id is mid-pipeline
    """
    ref = _ref(db, user_id, swipe_id)
    try:
        ref.create(_processing_payload())
        return ("run", None)
    except Exception:
        pass  # exists already (or transient) — inspect below

    try:
        snap = ref.get()
    except Exception:
        # Can't read the record: run rather than block the user. Worst case we
        # lose idempotency for this one request, which is today's behavior.
        traceback.print_exc()
        return ("run", None)

    data = snap.to_dict() if snap.exists else None
    if not data:
        return ("run", None)

    status = data.get("status")
    if status == "completed":
        return ("completed", data)
    if status == "processing":
        started = data.get("startedAt")
        try:
            fresh = started is not None and (
                datetime.now(timezone.utc) - started
            ) < _STALE_PROCESSING
        except Exception:
            fresh = False
        if fresh:
            return ("in_flight", None)
    # failed, or stale processing (dead request) → reclaim and run.
    try:
        ref.set(_processing_payload())
    except Exception:
        traceback.print_exc()
    return ("run", None)


def complete(db, user_id: str, swipe_id: str, response_data: dict, status_code: int = 200) -> None:
    """Record the outcome so a replay can return it verbatim. Best-effort."""
    try:
        body = json.dumps(response_data, default=str)
        if len(body.encode("utf-8")) > _MAX_STORED_RESPONSE_BYTES:
            slim = dict(response_data)
            slim["contacts"] = [
                {k: v for k, v in c.items() if k not in _HEAVY_CONTACT_FIELDS}
                for c in (slim.get("contacts") or [])
                if isinstance(c, dict)
            ]
            slim["replayed_slim"] = True
            body = json.dumps(slim, default=str)
        now = datetime.now(timezone.utc)
        _ref(db, user_id, swipe_id).set(
            {
                "status": "completed",
                "statusCode": int(status_code),
                "responseJson": body,
                "completedAt": now,
                "expires_at": now + _TTL,
            },
            merge=True,
        )
    except Exception:
        print(f"[SwipeIdem] failed to record completion for {swipe_id} (non-fatal)")
        traceback.print_exc()


def fail(db, user_id: str, swipe_id: str) -> None:
    """Release the claim after a failed run so a retry can execute again."""
    try:
        _ref(db, user_id, swipe_id).set(
            {"status": "failed", "failedAt": datetime.now(timezone.utc)},
            merge=True,
        )
    except Exception:
        print(f"[SwipeIdem] failed to release claim for {swipe_id} (non-fatal)")
        traceback.print_exc()


def replay_response(stored: dict):
    """Parse a stored completion back into (payload_dict, status_code)."""
    try:
        payload = json.loads(stored.get("responseJson") or "{}")
    except Exception:
        payload = {}
    payload["replayed"] = True
    return payload, int(stored.get("statusCode") or 200)
