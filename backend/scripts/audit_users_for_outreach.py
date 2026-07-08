"""
One-shot user audit for founder outreach planning.

Reports who's in Firestore right now: total users, signup recency,
tier breakdown, activity signal (contacts saved, loops run, gmail
connected), and the candidate buckets we'd email:

  Bucket A: Signed up in last 7 days
  Bucket B: First Loop run in last 14 days
  Bucket C: Dormant 7+ days after signup with zero activity

Outputs CSV files alongside the script.

Usage:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json python backend/scripts/audit_users_for_outreach.py
"""
import csv
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

import firebase_admin
from firebase_admin import credentials, firestore


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()


def parse_ts(val):
    if not val:
        return None
    if hasattr(val, "isoformat"):
        ts = val
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts
    try:
        ts = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts
    except Exception:
        return None


def best_signup_ts(data):
    return parse_ts(data.get("createdAt")) or parse_ts(data.get("created_at"))


def best_last_seen(data):
    candidates = [
        parse_ts(data.get("lastSignIn")),
        parse_ts(data.get("lastLogin")),
        parse_ts(data.get("lastLoginDate")),
    ]
    candidates = [c for c in candidates if c]
    return max(candidates) if candidates else None


def count_subcol(db, uid, name, cap=50):
    try:
        docs = db.collection("users").document(uid).collection(name).limit(cap).stream()
        return sum(1 for _ in docs)
    except Exception:
        return 0


def has_gmail(db, uid):
    try:
        snap = db.collection("users").document(uid).collection("integrations").document("gmail").get()
        return snap.exists
    except Exception:
        return False


def main():
    db = get_db()
    now = datetime.now(timezone.utc)
    day_7 = now - timedelta(days=7)
    day_30 = now - timedelta(days=30)
    day_14 = now - timedelta(days=14)

    rows = []
    tier_counts = Counter()
    onboarded = 0
    has_email = 0
    signups_7d = 0
    signups_30d = 0
    active_7d = 0
    no_signup_ts = 0

    bucket_new = []          # signed up in last 7d
    bucket_first_loop = []   # has loop, signed up within 14d
    bucket_dormant = []      # 7-30d old, zero activity

    print("scanning users collection...", flush=True)
    total = 0
    for snap in db.collection("users").stream():
        total += 1
        if total % 100 == 0:
            print(f"  ...{total}", flush=True)

        uid = snap.id
        data = snap.to_dict() or {}

        email = data.get("email") or ""
        name = data.get("name") or data.get("displayName") or ""
        tier = data.get("subscriptionTier") or data.get("tier") or "free"
        tier_counts[tier] += 1

        signup_ts = best_signup_ts(data)
        last_seen = best_last_seen(data)

        if signup_ts:
            if signup_ts >= day_7:
                signups_7d += 1
            if signup_ts >= day_30:
                signups_30d += 1
        else:
            no_signup_ts += 1

        if last_seen and last_seen >= day_7:
            active_7d += 1

        if email:
            has_email += 1
        if data.get("needsOnboarding") is False or data.get("professionalInfo"):
            onboarded += 1

        contacts = count_subcol(db, uid, "contacts")
        loops = count_subcol(db, uid, "loops")
        if loops == 0:
            loops = count_subcol(db, uid, "agents")
        coffee = data.get("coffeeChatPrepsUsed") or 0
        alumni_used = data.get("alumniSearchesUsed") or 0
        gmail = has_gmail(db, uid)

        any_activity = bool(contacts or loops or coffee or alumni_used or gmail)

        row = {
            "uid": uid,
            "email": email,
            "name": name,
            "tier": tier,
            "createdAt": signup_ts.isoformat() if signup_ts else "",
            "lastSeen": last_seen.isoformat() if last_seen else "",
            "contacts": contacts,
            "loops": loops,
            "coffee_chats": coffee,
            "alumni_searches": alumni_used,
            "gmail_connected": int(gmail),
            "needsOnboarding": data.get("needsOnboarding"),
        }
        rows.append(row)

        if email and signup_ts and signup_ts >= day_7:
            bucket_new.append(row)
        if email and loops > 0 and signup_ts and signup_ts >= day_14:
            bucket_first_loop.append(row)
        if email and signup_ts and day_30 <= signup_ts <= day_7 and not any_activity:
            bucket_dormant.append(row)

    out_dir = os.path.dirname(os.path.abspath(__file__))
    stamp = now.strftime("%Y%m%d_%H%M%S")
    all_path = os.path.join(out_dir, f"audit_users_all_{stamp}.csv")
    new_path = os.path.join(out_dir, f"audit_bucket_new_{stamp}.csv")
    loop_path = os.path.join(out_dir, f"audit_bucket_first_loop_{stamp}.csv")
    dormant_path = os.path.join(out_dir, f"audit_bucket_dormant_{stamp}.csv")

    def write_csv(path, rows_):
        if not rows_:
            return
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows_[0].keys()))
            w.writeheader()
            w.writerows(rows_)

    write_csv(all_path, rows)
    write_csv(new_path, bucket_new)
    write_csv(loop_path, bucket_first_loop)
    write_csv(dormant_path, bucket_dormant)

    print()
    print("=" * 60)
    print("OFFERLOOP USER AUDIT")
    print("=" * 60)
    print(f"Total users:                  {total}")
    print(f"  with email on record:       {has_email}")
    print(f"  onboarded:                  {onboarded}")
    print(f"  missing signup timestamp:   {no_signup_ts}")
    print()
    print("Tier breakdown:")
    for t, c in sorted(tier_counts.items(), key=lambda x: -x[1]):
        print(f"  {t:20s} {c}")
    print()
    print("Signup recency:")
    print(f"  last 7d:                    {signups_7d}")
    print(f"  last 30d:                   {signups_30d}")
    print()
    print(f"Active in last 7d (any login signal): {active_7d}")
    print()
    print("Outreach buckets:")
    print(f"  A. New signups (<=7d):                {len(bucket_new)}  -> {os.path.basename(new_path) if bucket_new else '(none)'}")
    print(f"  B. Ran a Loop (signed up <=14d):       {len(bucket_first_loop)}  -> {os.path.basename(loop_path) if bucket_first_loop else '(none)'}")
    print(f"  C. Dormant 7-30d, zero activity:       {len(bucket_dormant)}  -> {os.path.basename(dormant_path) if bucket_dormant else '(none)'}")
    print()
    print(f"Full roster: {os.path.basename(all_path)}")


if __name__ == "__main__":
    main()
