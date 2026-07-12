"""Clear emailTemplate.signatureBlock for a user — fix for the
'Nicholas Wittig | Offerloop.ai' phantom-signoff issue caused by stale
custom signature block in Firestore.

Usage:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json python backend/scripts/clear_signature_block.py <uid>
"""
import os
import sys

import firebase_admin
from firebase_admin import credentials, firestore


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()


def main():
    if len(sys.argv) < 2:
        print("usage: python backend/scripts/clear_signature_block.py <uid>")
        sys.exit(1)
    uid = sys.argv[1]

    db = get_db()
    ref = db.collection("users").document(uid)
    snap = ref.get()
    if not snap.exists:
        print(f"no user doc for uid={uid}")
        sys.exit(1)

    tpl = (snap.to_dict() or {}).get("emailTemplate") or {}
    current = tpl.get("signatureBlock", "")
    print(f"current signatureBlock for {uid}: {current!r}")

    if not current:
        print("already empty - nothing to do")
        return

    ref.set({"emailTemplate": {"signatureBlock": ""}}, merge=True)
    print(f"cleared signatureBlock for {uid}")


if __name__ == "__main__":
    main()
