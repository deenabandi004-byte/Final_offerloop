#!/usr/bin/env python3
"""
Batch upgrade Firebase user UIDs to Elite tier.
Usage: python upgrade_users_to_elite_batch.py uid1 uid2 uid3 ...
   or: python upgrade_users_to_elite_batch.py < uids.txt  (one uid per line)
"""
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.extensions import init_firebase, get_db
from app.config import TIER_CONFIGS
from flask import Flask

ELITE_CREDITS = TIER_CONFIGS['elite']['credits']


def upgrade_one(uid: str, db) -> bool:
    user_ref = db.collection('users').document(uid)
    user_doc = user_ref.get()
    if not user_doc.exists:
        print(f"  ❌ {uid}: not found")
        return False
    user_data = user_doc.to_dict()
    email = user_data.get('email', '?')
    update_data = {
        'tier': 'elite',
        'subscriptionTier': 'elite',
        'credits': ELITE_CREDITS,
        'maxCredits': ELITE_CREDITS,
        'subscriptionStatus': 'active',
        'updated_at': datetime.now().isoformat(),
    }
    user_ref.set(update_data, merge=True)
    print(f"  ✅ {uid} ({email}) → elite")
    return True


def main():
    if not sys.stdin.isatty():
        uids = [line.strip() for line in sys.stdin if line.strip()]
    else:
        uids = [a for a in sys.argv[1:] if a.strip()]
    if not uids:
        print("Usage: python upgrade_users_to_elite_batch.py uid1 uid2 ...")
        sys.exit(1)
    app = Flask(__name__)
    init_firebase(app)
    db = get_db()
    if not db:
        print("❌ Failed to initialize Firestore")
        sys.exit(1)
    ok = 0
    for uid in uids:
        if upgrade_one(uid, db):
            ok += 1
    print(f"\nDone: {ok}/{len(uids)} upgraded to elite.")
    sys.exit(0 if ok == len(uids) else 1)


if __name__ == '__main__':
    main()
