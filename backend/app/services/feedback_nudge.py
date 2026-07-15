"""Weekly "want to give feedback?" nudge.

A gentle push, at most once every FEEDBACK_NUDGE_INTERVAL_DAYS per user, inviting
them into the Feedback tab. Run on a schedule from the daemons service (see the
loop in wsgi.py). Idempotent and self-pacing: the per-user lastFeedbackNudgeAt
stamp enforces the cadence, so the loop can wake as often as daily without
over-nudging.

Deliberately conservative about WHO gets pinged:
  - must have a registered device (push token) — no token, no point;
  - account older than a week — don't nag someone who just installed;
  - not nudged within the interval — the whole point.
Dead tokens prune themselves inside send_push, so uninstalled users fall off.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

FEEDBACK_NUDGE_INTERVAL_DAYS = int(os.getenv("FEEDBACK_NUDGE_INTERVAL_DAYS", "7"))
FEEDBACK_NUDGE_MIN_ACCOUNT_AGE_DAYS = int(os.getenv("FEEDBACK_NUDGE_MIN_ACCOUNT_AGE_DAYS", "7"))
# Safety cap so a bug can never fan out to everyone in one run.
FEEDBACK_NUDGE_MAX_PER_RUN = int(os.getenv("FEEDBACK_NUDGE_MAX_PER_RUN", "1000"))

_TITLE = "Got a minute?"
_BODY = "Tell the founders what's working — or what isn't. Tap to share feedback."


def _parse_dt(v):
    if v is None:
        return None
    if hasattr(v, "timestamp"):
        try:
            return datetime.fromtimestamp(v.timestamp(), tz=timezone.utc)
        except Exception:
            return None
    try:
        s = str(v).replace("Z", "+00:00")
        d = datetime.fromisoformat(s)
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _has_device(user_ref) -> bool:
    try:
        for d in user_ref.collection("devices").limit(1).stream():
            if (d.to_dict() or {}).get("token"):
                return True
    except Exception:
        pass
    return False


def run_feedback_nudge() -> dict:
    """Send the weekly feedback nudge to everyone due for one. Returns a summary."""
    from app.extensions import get_db
    from app.services.push_service import send_push

    db = get_db()
    if db is None:
        return {"sent": 0, "reason": "no_db"}

    now = datetime.now(timezone.utc)
    interval = timedelta(days=FEEDBACK_NUDGE_INTERVAL_DAYS)
    min_age = timedelta(days=FEEDBACK_NUDGE_MIN_ACCOUNT_AGE_DAYS)

    considered = sent = skipped_recent = skipped_new = skipped_notoken = 0
    for snap in db.collection("users").stream():
        if sent >= FEEDBACK_NUDGE_MAX_PER_RUN:
            logger.warning("feedback nudge hit the per-run cap (%d)", FEEDBACK_NUDGE_MAX_PER_RUN)
            break
        u = snap.to_dict() or {}
        considered += 1

        last = _parse_dt(u.get("lastFeedbackNudgeAt"))
        if last is not None and (now - last) < interval:
            skipped_recent += 1
            continue

        created = _parse_dt(u.get("createdAt") or u.get("lastLogin"))
        if created is not None and (now - created) < min_age:
            skipped_new += 1
            continue

        user_ref = snap.reference
        if not _has_device(user_ref):
            skipped_notoken += 1
            continue

        try:
            n = send_push(snap.id, _TITLE, _BODY, data={"url": "/feedback", "type": "feedback_nudge"})
            # Stamp regardless of delivery count so a user with a stale token
            # isn't retried every run; send_push already prunes dead tokens.
            user_ref.set({"lastFeedbackNudgeAt": now}, merge=True)
            if n:
                sent += 1
        except Exception:
            logger.exception("feedback nudge send failed for %s", snap.id)

    summary = {
        "sent": sent,
        "considered": considered,
        "skipped_recent": skipped_recent,
        "skipped_new": skipped_new,
        "skipped_notoken": skipped_notoken,
    }
    logger.info("[FeedbackNudge] %s", summary)
    print(f"[FeedbackNudge] {summary}", flush=True)
    return summary
