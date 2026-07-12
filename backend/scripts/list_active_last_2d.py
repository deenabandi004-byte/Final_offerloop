"""
List users who used Offerloop in the last 2 days.

"Used" = any of:
  - lastSignIn / lastLogin / lastLoginDate within last 2 days
  - any contact created within last 2 days
  - any loop/agent created within last 2 days
  - any coffee chat prep created within last 2 days
  - any scout chat with messages updated within last 2 days

Usage:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json python backend/scripts/list_active_last_2d.py
"""
import os
import sys
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


def best_last_seen(data):
    candidates = [
        parse_ts(data.get("lastSignIn")),
        parse_ts(data.get("lastLogin")),
        parse_ts(data.get("lastLoginDate")),
        parse_ts(data.get("updatedAt")),
    ]
    candidates = [c for c in candidates if c]
    return max(candidates) if candidates else None


def latest_subcol_ts(db, uid, name, field_candidates):
    """Find the newest doc in a subcollection across any of the candidate timestamp fields."""
    try:
        docs = list(db.collection("users").document(uid).collection(name).limit(50).stream())
    except Exception:
        return None
    best = None
    for d in docs:
        data = d.to_dict() or {}
        for field in field_candidates:
            ts = parse_ts(data.get(field))
            if ts and (best is None or ts > best):
                best = ts
    return best


def main():
    db = get_db()
    now = datetime.now(timezone.utc)
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    cutoff = now - timedelta(days=days)

    active = []
    total = 0
    print(f"scanning users (cutoff = {cutoff.isoformat()})...", flush=True)
    for snap in db.collection("users").stream():
        total += 1
        if total % 50 == 0:
            print(f"  ...{total}", flush=True)

        uid = snap.id
        data = snap.to_dict() or {}

        email = data.get("email") or ""
        name = data.get("name") or data.get("displayName") or ""
        tier = data.get("subscriptionTier") or data.get("tier") or "free"

        signals = []
        last_seen = best_last_seen(data)
        if last_seen and last_seen >= cutoff:
            signals.append(("login", last_seen))

        contacts_ts = latest_subcol_ts(db, uid, "contacts", ["createdAt", "savedAt", "updatedAt"])
        if contacts_ts and contacts_ts >= cutoff:
            signals.append(("contact_saved", contacts_ts))

        loops_ts = latest_subcol_ts(db, uid, "loops", ["createdAt", "updatedAt", "lastRunAt"])
        if loops_ts and loops_ts >= cutoff:
            signals.append(("loop_activity", loops_ts))

        agents_ts = latest_subcol_ts(db, uid, "agents", ["createdAt", "updatedAt", "lastRunAt"])
        if agents_ts and agents_ts >= cutoff:
            signals.append(("agent_activity", agents_ts))

        coffee_ts = latest_subcol_ts(db, uid, "coffee-chat-preps", ["createdAt", "updatedAt"])
        if coffee_ts and coffee_ts >= cutoff:
            signals.append(("coffee_chat_prep", coffee_ts))

        scout_ts = latest_subcol_ts(db, uid, "scoutChats", ["updatedAt", "createdAt"])
        if scout_ts and scout_ts >= cutoff:
            signals.append(("scout_chat", scout_ts))

        if signals:
            most_recent = max(s[1] for s in signals)
            active.append({
                "uid": uid,
                "email": email,
                "name": name,
                "tier": tier,
                "most_recent": most_recent,
                "signals": signals,
            })

    active.sort(key=lambda r: r["most_recent"], reverse=True)

    print()
    print("=" * 80)
    print(f"ACTIVE USERS (last 2 days)   total scanned: {total}   active: {len(active)}")
    print("=" * 80)
    for r in active:
        signal_labels = ", ".join(f"{kind}@{ts.strftime('%m-%d %H:%M')}Z" for kind, ts in sorted(r["signals"], key=lambda x: -x[1].timestamp()))
        email_field = r["email"] or "(no email)"
        name_field = r["name"] or "(no name)"
        print(f"{r['most_recent'].strftime('%Y-%m-%d %H:%MZ')}  {r['tier']:6s}  {email_field:40s}  {name_field:30s}")
        print(f"   uid={r['uid']}  signals: {signal_labels}")


if __name__ == "__main__":
    main()
