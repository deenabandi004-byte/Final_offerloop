"""
One-off admin grant: bump a user to pro tier (no Stripe sub).

Usage:
  python backend/scripts/bump_user_to_pro.py <email>
"""
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import firebase_admin  # noqa: E402
from firebase_admin import credentials, firestore  # noqa: E402

from app.config import TIER_CONFIGS  # noqa: E402


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred, {'projectId': 'offerloop-native'})
        else:
            firebase_admin.initialize_app(options={'projectId': 'offerloop-native'})
    return firestore.client()


def find_user_by_email(db, email: str):
    email_lower = email.strip().lower()
    users_ref = db.collection('users')
    matches = []
    for snap in users_ref.where('email', '==', email_lower).stream():
        matches.append(snap)
    if not matches:
        for snap in users_ref.where('email', '==', email).stream():
            matches.append(snap)
    return matches


def main():
    if len(sys.argv) < 2:
        print("Usage: python bump_user_to_pro.py <email>")
        sys.exit(1)
    email = sys.argv[1]

    db = get_db()
    if not db:
        print("ERROR: Firestore client unavailable.")
        sys.exit(1)

    matches = find_user_by_email(db, email)
    if not matches:
        print(f"No user found with email={email!r}")
        sys.exit(2)
    if len(matches) > 1:
        print(f"Multiple users matched {email!r}: {[s.id for s in matches]}")
        sys.exit(3)

    snap = matches[0]
    uid = snap.id
    data = snap.to_dict() or {}
    pro_credits = TIER_CONFIGS['pro']['credits']
    now_iso = datetime.now(timezone.utc).isoformat()

    print(f"Before: uid={uid} tier={data.get('subscriptionTier')!r} "
          f"credits={data.get('credits')} maxCredits={data.get('maxCredits')}")

    db.collection('users').document(uid).update({
        'subscriptionTier': 'pro',
        'tier': 'pro',
        'maxCredits': pro_credits,
        'credits': pro_credits,
        'subscriptionStatus': 'active',
        'lastCreditReset': now_iso,
        'upgraded_at': now_iso,
        'updatedAt': now_iso,
        'trialActive': False,
        'manualGrant': True,
        'manualGrantReason': 'admin bump to pro',
        'manualGrantAt': now_iso,
    })

    after = db.collection('users').document(uid).get().to_dict() or {}
    print(f"After:  uid={uid} tier={after.get('subscriptionTier')!r} "
          f"credits={after.get('credits')} maxCredits={after.get('maxCredits')} "
          f"status={after.get('subscriptionStatus')!r}")


if __name__ == '__main__':
    main()
