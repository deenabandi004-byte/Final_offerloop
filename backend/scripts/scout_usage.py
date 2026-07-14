"""Scout usage snapshot — the "should we build company-first search?" watch.

Reads the scout_metrics collection and breaks turns down by what Scout was asked
to DO, and — for navigations — WHERE it sent people. Navigations to /find or a
company page are Scout being used for company-first search: the behavior that
would justify surfacing a dedicated search entry point (the "+" we decided NOT to
build on 2026-07-14, pending this signal).

    GOOGLE_APPLICATION_CREDENTIALS=... python backend/scripts/scout_usage.py [--days 7]

Note: scout_metrics has a TTL, so this only covers the recent retention window.
"""
import argparse
import os
from collections import Counter
from datetime import datetime, timezone, timedelta

import firebase_admin
from firebase_admin import credentials, firestore

# Routes that mean "the user asked Scout to find people / companies".
COMPANY_SEARCH_ROUTES = {"/find", "/find?tab=companies", "/find?tab=hiring-managers"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    args = ap.parse_args()

    if not firebase_admin._apps:
        firebase_admin.initialize_app(
            credentials.Certificate(os.environ["GOOGLE_APPLICATION_CREDENTIALS"])
        )
    db = firestore.client()

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    docs = [
        d.to_dict() or {}
        for d in db.collection("scout_metrics").where("created_at", ">=", cutoff).stream()
    ]
    if not docs:
        print(f"No Scout turns in the last {args.days} days (or TTL'd out).")
        return

    tools = Counter(d.get("final_tool") for d in docs)
    routes = Counter(
        (d.get("nav_route") or "").split("?")[0]
        for d in docs
        if d.get("final_tool") == "navigate" and d.get("nav_route")
    )
    company_search = sum(
        1 for d in docs
        if d.get("final_tool") == "navigate"
        and (d.get("nav_route") or "") in COMPANY_SEARCH_ROUTES
    )

    print(f"\n=== Scout usage, last {args.days} days ({len(docs)} turns) ===\n")
    print("  what people ask Scout to do:")
    for t, n in tools.most_common():
        print(f"    {n:4}  {t}  ({n * 100 // len(docs)}%)")

    navs = tools.get("navigate", 0)
    print(f"\n  where the {navs} navigations went:")
    for r, n in routes.most_common():
        flag = "  <- company search" if r in {x.split('?')[0] for x in COMPANY_SEARCH_ROUTES} else ""
        print(f"    {n:4}  {r or '(none)'}{flag}")

    print(
        f"\n  COMPANY-FIRST SEARCH via Scout: {company_search} turns "
        f"({company_search * 100 // len(docs)}% of all turns)."
    )
    print("  Rule of thumb: if this climbs and stays double digits, surface a")
    print("  dedicated company-search entry point. If it stays low, Scout is enough.")


if __name__ == "__main__":
    main()
