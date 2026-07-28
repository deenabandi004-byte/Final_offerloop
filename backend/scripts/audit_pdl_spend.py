"""Phase 0 audit: PDL / provider spend over the last N days.

Wraps app.services.metering.spend_summary + spend_by_user against production
Firestore. Read-only, no API cost.

Answers:
  - What are we paying per provider (PDL, Coresignal, Hunter, Apify) per month?
  - Which users burn the most credits?
  - Is PDL search worth caching? (see companion audit_pdl_search_cache.py)

Usage:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json \
        python backend/scripts/audit_pdl_spend.py
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json \
        python backend/scripts/audit_pdl_spend.py --days 7
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Ensure backend/ is on sys.path so `app.*` imports work when run as a script.
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))

import firebase_admin
from firebase_admin import credentials


def _init_firebase() -> None:
    if firebase_admin._apps:
        return
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred, {"projectId": "offerloop-native"})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=30, help="Window in days (default 30)")
    parser.add_argument("--top-users", type=int, default=15, help="How many top users to list")
    args = parser.parse_args()

    _init_firebase()

    # Import AFTER Firebase init so app.extensions.get_db() finds the app.
    from app.services.metering import spend_summary, spend_by_user  # noqa: E402

    print(f"\n=== Provider spend, last {args.days} days ===\n")
    summary = spend_summary(days=args.days)

    if "error" in summary:
        print(f"ERROR: {summary['error']}")
        return

    print(f"Total calls:    {summary['total_calls']:,}")
    print(f"Total est cost: ${summary['total_cost_usd']:,.2f}")
    print()

    # Per-provider table
    by_provider = summary.get("by_provider", {})
    if not by_provider:
        print("(no calls recorded in window)")
        return

    print(f"{'Provider':<14}{'Calls':>10}{'Credits':>10}{'Cost USD':>12}")
    print("-" * 46)
    for prov in sorted(by_provider, key=lambda p: -by_provider[p]["cost_usd"]):
        p = by_provider[prov]
        print(f"{prov:<14}{p['calls']:>10,}{p['credits']:>10,}{p['cost_usd']:>12,.2f}")
    print()

    # Per-endpoint breakdown per provider
    for prov in sorted(by_provider, key=lambda p: -by_provider[p]["cost_usd"]):
        p = by_provider[prov]
        eps = p.get("by_endpoint", {})
        if not eps:
            continue
        print(f"  {prov} endpoints:")
        for ep in sorted(eps, key=lambda e: -eps[e]["cost_usd"]):
            e = eps[ep]
            print(f"    {ep:<24}{e['calls']:>8,} calls  {e['credits']:>8,} credits  ${e['cost_usd']:>8,.2f}")
        print()

    # Top users
    print(f"=== Top {args.top_users} users by spend, last {args.days} days ===\n")
    top = spend_by_user(days=args.days, limit=args.top_users)
    if "error" in top:
        print(f"ERROR: {top['error']}")
        return
    users = top.get("users", [])
    if not users:
        print("(no user activity in window)")
        return
    print(f"{'User ID':<36}{'Calls':>10}{'Credits':>10}{'Cost USD':>12}")
    print("-" * 68)
    for u in users:
        uid = (u["user_id"] or "unknown")[:34]
        print(f"{uid:<36}{u['calls']:>10,}{u['credits']:>10,}{u['cost_usd']:>12,.2f}")

    # Monthly projection
    monthly = summary["total_cost_usd"] * 30 / max(1, args.days)
    print()
    print(f"Extrapolated monthly spend: ${monthly:,.2f}")
    print("(linear projection from window; refine after 30d of clean data)")


if __name__ == "__main__":
    main()
