"""
Lifecycle signal stamps — the "first X" and "last X" timestamps that the
lifecycle email scanner reads from `users/{uid}` to decide whether to fire
a campaign.

Each helper is fire-and-forget. Callers should NOT await the return value or
depend on write success — email triggers can tolerate a missed stamp (the
next event will catch it), but request paths must never fail because of a
missing lifecycle write.

`touch_last_active` in particular is called from `require_firebase_auth` on
every authenticated request, so it uses an in-process TTL cache to avoid
flooding Firestore. All other helpers are called from event handlers that
fire at most a few times per user per day, so they write unconditionally.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Optional

from google.cloud import firestore

from app.extensions import get_db

logger = logging.getLogger(__name__)


LAST_ACTIVE_TTL_SECONDS = 300  # only re-stamp lastActiveAt every 5 min per uid
LOGIN_SESSION_GAP_SECONDS = 1800  # 30-min activity gap = new login session

_last_active_cache: dict[str, float] = {}
_last_active_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(val) -> Optional[datetime]:
    if not val:
        return None
    if hasattr(val, 'isoformat'):
        dt = val
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(val).replace('Z', '+00:00'))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _user_ref(uid: str):
    db = get_db()
    if not db or not uid:
        return None
    return db.collection('users').document(uid)


def _stamp(uid: str, updates: dict) -> None:
    """Non-transactional partial update. Swallows all failures — lifecycle
    stamps are best-effort and must never block a request or event handler."""
    try:
        ref = _user_ref(uid)
        if ref is not None:
            ref.update(updates)
    except Exception as exc:
        logger.debug("lifecycle stamp failed for %s: %s", uid, exc)


def touch_last_active(uid: str) -> None:
    """Update `lastActiveAt` on every authed request (5-min TTL cache prevents
    write flooding). When the persisted `lastActiveAt` is older than the
    session gap (or missing entirely), also stamp `lastLoginAt` — that's the
    session-start marker the plan uses for dormancy + streak logic.

    The in-process cache is per-worker, so we re-read Firestore on cache miss
    to make session-boundary detection consistent across gunicorn workers."""
    if not uid:
        return
    now_ts = datetime.now(timezone.utc).timestamp()
    with _last_active_lock:
        last = _last_active_cache.get(uid, 0.0)
        if now_ts - last < LAST_ACTIVE_TTL_SECONDS:
            return
        _last_active_cache[uid] = now_ts

    ref = _user_ref(uid)
    if ref is None:
        return
    now_iso = _now_iso()
    try:
        snap = ref.get(field_paths=['lastActiveAt', 'lastLoginAt'])
        data = snap.to_dict() or {}
        prior_active = _parse_iso(data.get('lastActiveAt'))
        gap = None
        if prior_active is not None:
            gap = (datetime.now(timezone.utc) - prior_active).total_seconds()
        is_new_session = gap is None or gap >= LOGIN_SESSION_GAP_SECONDS

        updates = {'lastActiveAt': now_iso}
        if is_new_session:
            updates['lastLoginAt'] = now_iso
        ref.update(updates)
    except Exception as exc:
        logger.debug("touch_last_active failed for %s: %s", uid, exc)


def stamp_first_search(uid: str) -> None:
    """Called when a SEARCH_EXECUTED event lands. Sets `firstSearchAt` only
    if it's still null; always bumps `lastSearchAt` + `lastActiveAt`."""
    if not uid:
        return
    now = _now_iso()
    ref = _user_ref(uid)
    if ref is None:
        return
    try:
        snap = ref.get(field_paths=['firstSearchAt'])
        data = snap.to_dict() or {}
        updates = {'lastSearchAt': now, 'lastActiveAt': now}
        if not data.get('firstSearchAt'):
            updates['firstSearchAt'] = now
        ref.update(updates)
    except Exception as exc:
        logger.debug("stamp_first_search failed for %s: %s", uid, exc)


def stamp_first_email_sent(uid: str) -> None:
    """Called on the first EMAIL_SENT / email_actually_sent event for a user."""
    if not uid:
        return
    now = _now_iso()
    ref = _user_ref(uid)
    if ref is None:
        return
    try:
        snap = ref.get(field_paths=['firstEmailSentAt'])
        data = snap.to_dict() or {}
        updates = {'lastEmailSentAt': now, 'lastActiveAt': now}
        if not data.get('firstEmailSentAt'):
            updates['firstEmailSentAt'] = now
        ref.update(updates)
    except Exception as exc:
        logger.debug("stamp_first_email_sent failed for %s: %s", uid, exc)


def stamp_first_reply(uid: str) -> None:
    """Called on the first reply_received event for a user."""
    if not uid:
        return
    now = _now_iso()
    ref = _user_ref(uid)
    if ref is None:
        return
    try:
        snap = ref.get(field_paths=['firstReplyReceivedAt'])
        data = snap.to_dict() or {}
        updates = {'lastReplyReceivedAt': now, 'lastActiveAt': now}
        if not data.get('firstReplyReceivedAt'):
            updates['firstReplyReceivedAt'] = now
        ref.update(updates)
    except Exception as exc:
        logger.debug("stamp_first_reply failed for %s: %s", uid, exc)


def set_newsletter_subscribed(uid: str, subscribed: bool) -> None:
    """Called from onboarding opt-in step and from the unsubscribe handler."""
    if not uid:
        return
    _stamp(uid, {'newsletterSubscribed': bool(subscribed)})
