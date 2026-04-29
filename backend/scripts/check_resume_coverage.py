#!/usr/bin/env python3
"""
Read-only diagnostic — answers the question "is the Phase 1 backfill even
worth running?" by reporting how many users actually have resumeText.

Usage:
    cd backend && python -m scripts.check_resume_coverage
"""
from __future__ import annotations

import os
import sys

# Make the backend package importable when run directly.
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_HERE)
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# Default credentials path mirrors the rest of the script suite.
os.environ.setdefault(
    'GOOGLE_APPLICATION_CREDENTIALS',
    os.path.abspath(os.path.join(_BACKEND_DIR, 'creds', 'firebase-credentials.json')),
)

from flask import Flask  # noqa: E402

from app.extensions import get_db, init_firebase  # noqa: E402


def stats(users, label: str) -> None:
    total = len(users)
    with_resume = 0
    with_resume_url = 0
    confirmed = 0
    backfilled = 0
    for u in users:
        data = u.to_dict() or {}
        if (data.get('resumeText') or '').strip():
            with_resume += 1
        if data.get('resumeUrl'):
            with_resume_url += 1
        prov = data.get('_backfillProvenance') or {}
        if isinstance(prov, dict):
            if prov.get('confirmedAt'):
                confirmed += 1
            elif prov.get('backfilledAt'):
                backfilled += 1
    print(
        f'{label}: total={total}, has resumeText={with_resume}, '
        f'has resumeUrl={with_resume_url}, '
        f'profile_confirmed={confirmed}, already_backfilled={backfilled}',
    )


def main() -> None:
    app = Flask(__name__)
    init_firebase(app)
    db = get_db()

    # Paying = (subscriptionTier in ['pro','elite']) OR (tier in ['pro','elite']).
    # Firestore can't OR across fields, so we run two queries and dedupe.
    seen: dict = {}
    for field in ('subscriptionTier', 'tier'):
        for snap in db.collection('users').where(field, 'in', ['pro', 'elite']).stream():
            seen.setdefault(snap.id, snap)
    paying = list(seen.values())
    all_users = list(db.collection('users').stream())

    stats(paying, 'paying subs')
    stats(all_users, 'all users')


if __name__ == '__main__':
    main()
