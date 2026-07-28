"""Phase 0 audit: which companies drive PDL contact-search demand?

Scans the `pdl_search_cache` Firestore collection (30-day TTL, so all live
docs are within the last 30 days). Aggregates `query_meta.companies` across
every cached query, weighted by `credit_cost` (proxy for how big a query was)
and by query count.

Answers:
  - Top N firms by query volume — where should our firm-employee cache
    invest scraping budget first?
  - Total credits currently under the query cache — how big is the
    already-cached universe?
  - How many queries name zero companies (open-ended searches) vs a
    specific firm (cacheable in our new model)?

Read-only. No API cost.

Usage:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json \
        python backend/scripts/audit_pdl_search_cache.py
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json \
        python backend/scripts/audit_pdl_search_cache.py --top 50 --csv out.csv
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))

import firebase_admin
from firebase_admin import credentials, firestore


def _init_firebase() -> None:
    if firebase_admin._apps:
        return
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred, {"projectId": "offerloop-native"})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--top", type=int, default=40, help="Top N companies to show")
    parser.add_argument("--csv", type=str, default=None, help="Optional CSV output path")
    args = parser.parse_args()

    _init_firebase()
    db = firestore.client()

    query_count_by_company: Counter[str] = Counter()
    credit_cost_by_company: Counter[str] = Counter()
    school_count_by_company: dict[str, set[str]] = defaultdict(set)

    total_queries = 0
    queries_with_company = 0
    queries_open_ended = 0
    total_cached_credits = 0

    print("Streaming pdl_search_cache...")
    for doc in db.collection("pdl_search_cache").stream():
        d = doc.to_dict() or {}
        meta = d.get("query_meta") or {}
        companies = [c for c in (meta.get("companies") or []) if c]
        schools = [s for s in (meta.get("schools") or []) if s]
        credit_cost = int(d.get("credit_cost") or 0)

        total_queries += 1
        total_cached_credits += credit_cost

        if not companies:
            queries_open_ended += 1
            continue
        queries_with_company += 1

        for co in companies:
            query_count_by_company[co] += 1
            credit_cost_by_company[co] += credit_cost
            for sch in schools:
                school_count_by_company[co].add(sch)

    if total_queries == 0:
        print("No cached queries found. Cache may be empty or Firestore permission denied.")
        return

    print(f"\n=== pdl_search_cache summary ===")
    print(f"Total cached queries:   {total_queries:,}")
    print(f"Queries with company:   {queries_with_company:,}  "
          f"({100 * queries_with_company / total_queries:.0f}%)")
    print(f"Open-ended (no co):     {queries_open_ended:,}  "
          f"({100 * queries_open_ended / total_queries:.0f}%)")
    print(f"Total cached credits:   {total_cached_credits:,}")
    print(f"  (PDL est cost:        ${total_cached_credits * 0.20:,.2f} "
          f"— this is what the query cache SAVED over 30d)")
    print()

    print(f"=== Top {args.top} companies by query count ===\n")
    print(f"{'#':>3}  {'Company':<40}{'Queries':>10}{'Credits':>10}{'Schools':>10}")
    print("-" * 73)
    top = query_count_by_company.most_common(args.top)
    for i, (co, count) in enumerate(top, 1):
        credits = credit_cost_by_company[co]
        n_schools = len(school_count_by_company[co])
        print(f"{i:>3}  {co[:38]:<40}{count:>10,}{credits:>10,}{n_schools:>10,}")

    # Tier-1 hit-rate check: how many queries are for firms on our proposed
    # pre-scrape list? Rough — matches on lowercased substrings.
    TIER1_HINTS = [
        "mckinsey", "boston consulting", "bcg", "bain",
        "oliver wyman", "zs associates", "kearney", "l.e.k.", "lek",
        "ey-parthenon", "parthenon", "strategy&", "strategyand",
        "analysis group", "cornerstone research", "bridgespan",
        "evercore", "lazard", "centerview", "pjt partners", "moelis",
        "guggenheim", "perella weinberg", "houlihan lokey",
        "rothschild", "greenhill", "qatalyst", "allen &",
        "blackstone", "kkr", "apollo", "carlyle", "tpg",
        "bain capital", "warburg pincus", "advent international",
        "silver lake", "vista equity", "thoma bravo",
        "citadel", "d.e. shaw", "two sigma", "millennium",
        "point72", "bridgewater", "renaissance", "jane street",
    ]
    tier1_queries = 0
    tier1_credits = 0
    for co, count in query_count_by_company.items():
        low = co.lower()
        if any(hint in low for hint in TIER1_HINTS):
            tier1_queries += count
            tier1_credits += credit_cost_by_company[co]

    print()
    print(f"=== Tier 1 (proposed pre-scrape list) match ===")
    print(f"Queries hitting a Tier 1 firm:  {tier1_queries:,}  "
          f"({100 * tier1_queries / max(1, queries_with_company):.0f}% of company-queries, "
          f"{100 * tier1_queries / total_queries:.0f}% of all queries)")
    print(f"Credits from Tier 1 queries:    {tier1_credits:,}  "
          f"(~${tier1_credits * 0.20:,.2f} PDL cost over 30d)")
    print()
    print("Cache-hit ceiling: if we cached every Tier 1 person, we could serve "
          f"up to {100 * tier1_queries / total_queries:.0f}% of searches from firm_employees.")

    if args.csv:
        with open(args.csv, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["rank", "company", "query_count", "total_credits", "distinct_schools"])
            for i, (co, count) in enumerate(query_count_by_company.most_common(), 1):
                w.writerow([i, co, count, credit_cost_by_company[co], len(school_count_by_company[co])])
        print(f"\nWrote CSV: {args.csv}")


if __name__ == "__main__":
    main()
