"""
Backfill lifecycle email trigger fields on existing user docs.

New fields added by Phase 1:
  - signupAt              → copy from createdAt if missing
  - lastActiveAt          → copy from createdAt if missing
  - lastLoginAt           → copy from createdAt if missing (session-start marker)
  - firstSearchAt         → derived from users/{uid}/events (earliest SEARCH_EXECUTED)
  - firstEmailSentAt      → derived from users/{uid}/events (earliest EMAIL_SENT)
  - firstReplyReceivedAt  → derived from users/{uid}/events (earliest reply_received)
  - lastSearchAt          → derived from users/{uid}/events (latest SEARCH_EXECUTED)
  - lastEmailSentAt       → derived from users/{uid}/events (latest EMAIL_SENT)
  - lastReplyReceivedAt   → derived from users/{uid}/events (latest reply_received)
  - newsletterSubscribed  → True (default opt-in; already-opted-out will be
                            corrected on next unsub event or prefs write)

Usage:
  Dry run (default):  python -m backend.scripts.backfill_lifecycle_fields
  Execute:            python -m backend.scripts.backfill_lifecycle_fields --execute

Idempotent — running twice is safe. Only writes fields that are missing.
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from typing import Optional

# Path shim so the script runs both as a module and standalone
sys.path.insert(0, '/Users/karthik/work/Offerloop/backend')

import os  # noqa: E402
import firebase_admin  # noqa: E402
from firebase_admin import credentials, firestore  # noqa: E402


def _get_db():
    """Standalone Firestore init that doesn't require a Flask app instance —
    mirrors the pattern in audit_users_for_outreach.py."""
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()


logger = logging.getLogger(__name__)


EVENT_TO_FIELDS = {
    'SEARCH_EXECUTED': ('firstSearchAt', 'lastSearchAt'),
    'EMAIL_SENT': ('firstEmailSentAt', 'lastEmailSentAt'),
    'reply_received': ('firstReplyReceivedAt', 'lastReplyReceivedAt'),
}


def _iso(ts) -> Optional[str]:
    """Coerce whatever Firestore returned into an ISO-8601 string."""
    if ts is None:
        return None
    if isinstance(ts, str):
        return ts
    if isinstance(ts, datetime):
        return ts.astimezone(timezone.utc).isoformat()
    if hasattr(ts, 'isoformat'):
        try:
            return ts.isoformat()
        except Exception:
            return None
    return None


def derive_event_signals(db, uid: str) -> dict:
    """Scan users/{uid}/events for the first + last event timestamps we care
    about. Bounded read: 5k most recent events is more than any real user."""
    events_ref = db.collection('users').document(uid).collection('events').limit(5000)
    first_ts: dict[str, Optional[str]] = {}
    last_ts: dict[str, Optional[str]] = {}

    for snap in events_ref.stream():
        data = snap.to_dict() or {}
        et = data.get('type')
        if et not in EVENT_TO_FIELDS:
            continue
        created = _iso(data.get('createdAt'))
        if not created:
            continue
        if et not in first_ts or created < (first_ts.get(et) or ''):
            first_ts[et] = created
        if et not in last_ts or created > (last_ts.get(et) or ''):
            last_ts[et] = created

    result: dict[str, str] = {}
    for et, (first_field, last_field) in EVENT_TO_FIELDS.items():
        if et in first_ts:
            result[first_field] = first_ts[et]
            result[last_field] = last_ts[et]
    return result


def backfill_one(db, snap, execute: bool) -> dict:
    data = snap.to_dict() or {}
    uid = snap.id
    updates: dict = {}

    created_at = data.get('createdAt')
    if not data.get('signupAt'):
        updates['signupAt'] = created_at or _iso(datetime.now(timezone.utc))
    if not data.get('lastActiveAt'):
        updates['lastActiveAt'] = created_at or _iso(datetime.now(timezone.utc))
    if not data.get('lastLoginAt'):
        updates['lastLoginAt'] = created_at or _iso(datetime.now(timezone.utc))
    if 'newsletterSubscribed' not in data:
        updates['newsletterSubscribed'] = True

    needs_first_fields = any(
        data.get(f) is None
        for f in ('firstSearchAt', 'firstEmailSentAt', 'firstReplyReceivedAt')
    )
    if needs_first_fields:
        derived = derive_event_signals(db, uid)
        for k, v in derived.items():
            if data.get(k) is None:
                updates[k] = v

    if updates and execute:
        snap.reference.update(updates)
    return {'uid': uid, 'updated': list(updates.keys())}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute', action='store_true', help='Write changes (default is dry-run)')
    parser.add_argument('--limit', type=int, default=None, help='Cap number of users processed')
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format='%(message)s')
    db = _get_db()
    if not db:
        print("ERROR: Firestore not initialized")
        return 1

    total, touched = 0, 0
    for snap in db.collection('users').stream():
        total += 1
        if args.limit and total > args.limit:
            break
        result = backfill_one(db, snap, execute=args.execute)
        if result['updated']:
            touched += 1
            print(f"{'WRITE' if args.execute else 'DRY '} {result['uid']}: {result['updated']}")

    print(f"\nProcessed {total} users. Would update {touched}." if not args.execute
          else f"\nProcessed {total} users. Updated {touched}.")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
