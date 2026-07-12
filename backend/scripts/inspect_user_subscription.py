"""
Inspect a single user's subscription state in Firestore (and optionally Stripe).

Usage:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json python backend/scripts/inspect_user_subscription.py <email>
"""
import os
import sys
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()


def fmt(v):
    if v is None:
        return "(none)"
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)


def main():
    if len(sys.argv) < 2:
        print("usage: inspect_user_subscription.py <email>")
        sys.exit(1)
    target_email = sys.argv[1].strip().lower()

    db = get_db()
    found = None
    for snap in db.collection("users").stream():
        data = snap.to_dict() or {}
        email = (data.get("email") or "").lower()
        if email == target_email:
            found = (snap.id, data)
            break

    if not found:
        print(f"no user with email {target_email}")
        return

    uid, data = found
    print(f"uid: {uid}")
    print(f"email: {data.get('email')}")
    print(f"name: {data.get('name') or data.get('displayName')}")
    print()
    print("subscription:")
    keys = [
        "subscriptionTier", "tier",
        "subscriptionStatus", "subscriptionState",
        "stripeCustomerId", "stripeSubscriptionId",
        "subscriptionStartedAt", "subscriptionStartDate",
        "subscriptionCurrentPeriodStart", "subscriptionCurrentPeriodEnd",
        "trialStart", "trialEnd", "trialEndsAt", "trial_end", "isTrialing",
        "cancelAtPeriodEnd", "canceledAt", "cancellationDate",
        "credits", "maxCredits", "lastCreditReset",
        "createdAt", "lastSignIn", "lastLogin",
    ]
    for k in keys:
        if k in data:
            print(f"  {k}: {fmt(data[k])}")

    # Try Stripe lookup if we have stripeSubscriptionId and STRIPE_SECRET_KEY available
    sub_id = data.get("stripeSubscriptionId")
    cust_id = data.get("stripeCustomerId")
    if sub_id or cust_id:
        try:
            import stripe
            sk = os.environ.get("STRIPE_SECRET_KEY")
            if sk:
                stripe.api_key = sk
                print()
                print("stripe:")
                if sub_id:
                    s = stripe.Subscription.retrieve(sub_id)
                    print(f"  subscription.status: {s.status}")
                    print(f"  trial_start: {datetime.fromtimestamp(s.trial_start, tz=timezone.utc).isoformat() if s.trial_start else '(none)'}")
                    print(f"  trial_end: {datetime.fromtimestamp(s.trial_end, tz=timezone.utc).isoformat() if s.trial_end else '(none)'}")
                    print(f"  current_period_start: {datetime.fromtimestamp(s.current_period_start, tz=timezone.utc).isoformat()}")
                    print(f"  current_period_end: {datetime.fromtimestamp(s.current_period_end, tz=timezone.utc).isoformat()}")
                    print(f"  cancel_at_period_end: {s.cancel_at_period_end}")
                    items = s["items"]["data"]
                    for it in items:
                        price = it.get("price") or {}
                        print(f"  price.id: {price.get('id')}  amount: {price.get('unit_amount')} {price.get('currency')}")
                elif cust_id:
                    subs = stripe.Subscription.list(customer=cust_id, status="all", limit=10)
                    for s in subs.data:
                        print(f"  sub {s.id} status={s.status} trial_end={s.trial_end} cancel_at_period_end={s.cancel_at_period_end}")
            else:
                print()
                print("(STRIPE_SECRET_KEY not set, skipping stripe lookup)")
        except Exception as e:
            print()
            print(f"(stripe lookup failed: {e})")


if __name__ == "__main__":
    main()
