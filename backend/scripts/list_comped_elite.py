"""
List users with elite tier in Firestore but no Stripe subscription
(comped Elite accounts).

Usage:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json python backend/scripts/list_comped_elite.py
"""
import os
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()


def fmt_ts(v):
    if not v:
        return ""
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    try:
        return str(v).split("T")[0]
    except Exception:
        return str(v)


def main():
    db = get_db()
    rows = []
    total_elite = 0
    paid_elite = 0
    for snap in db.collection("users").stream():
        data = snap.to_dict() or {}
        tier = (data.get("subscriptionTier") or data.get("tier") or "").lower()
        if tier != "elite":
            continue
        total_elite += 1
        sub_id = data.get("stripeSubscriptionId")
        if sub_id:
            paid_elite += 1
            continue
        rows.append({
            "uid": snap.id,
            "email": data.get("email") or "",
            "name": data.get("name") or data.get("displayName") or "",
            "createdAt": fmt_ts(data.get("createdAt") or data.get("created_at")),
            "lastSignIn": fmt_ts(data.get("lastSignIn") or data.get("lastLogin")),
            "maxCredits": data.get("maxCredits"),
            "credits": data.get("credits"),
            "stripeCustomerId": data.get("stripeCustomerId") or "",
        })

    rows.sort(key=lambda r: r["createdAt"], reverse=True)

    print("=" * 100)
    print(f"COMPED ELITE USERS (tier=elite, no stripeSubscriptionId)")
    print(f"Total Elite: {total_elite}   Paid Elite: {paid_elite}   Comped Elite: {len(rows)}")
    print("=" * 100)
    print(f"{'created':12s}  {'lastSignIn':12s}  {'maxCr':>6s}  {'cred':>5s}  {'email':40s}  {'name'}")
    print("-" * 100)
    for r in rows:
        print(f"{r['createdAt']:12s}  {r['lastSignIn']:12s}  {str(r['maxCredits'] or '-'):>6s}  {str(r['credits'] or '-'):>5s}  {r['email']:40s}  {r['name']}")


if __name__ == "__main__":
    main()
