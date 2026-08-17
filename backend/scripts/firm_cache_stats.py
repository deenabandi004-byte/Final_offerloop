"""Phase 4 observability: firm_cache stats + simulated hit rate.

Read-only stats report on the JIT firm-employee cache. Answers:
  - How big is firm_employees today?
  - Which firms + schools dominate?
  - How stale is the data?
  - What hit rate would we get on recent traffic against the current
    cache state?

The hit-rate simulation reconstructs queries from pdl_search_cache
(which has query_meta.companies + schools intact) and runs each one
through the reader logic to count hits.

Usage:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json \\
        python backend/scripts/firm_cache_stats.py
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json \\
        python backend/scripts/firm_cache_stats.py --sample 500 --simulate
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
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


def _fmt_age(ts) -> str:
    """Return human-readable age of a Firestore timestamp."""
    if ts is None:
        return "unknown"
    try:
        now = datetime.now(timezone.utc)
        age = now - ts
        if age.days > 0:
            return f"{age.days}d ago"
        h = age.seconds // 3600
        if h > 0:
            return f"{h}h ago"
        m = (age.seconds % 3600) // 60
        return f"{m}m ago"
    except Exception:
        return "?"


def report_cache_size(db, sample: int) -> list[dict]:
    """Section 1: how many docs, distribution by company/school/level/country.
    Returns the sampled docs so we don't re-stream for later sections."""
    print(f"\n=== 1. Cache size + distribution (sampling up to {sample:,} docs) ===\n")
    docs = []
    for snap in db.collection("firm_employees").limit(sample).stream():
        d = snap.to_dict() or {}
        d["_id"] = snap.id
        docs.append(d)
    print(f"Docs sampled:            {len(docs):,}")

    if not docs:
        print("Cache is empty. Writer may not be running or nobody has searched yet.")
        return []

    companies = Counter(d.get("company", "?") for d in docs)
    schools = Counter()
    for d in docs:
        for s in (d.get("schools") or []):
            schools[s] += 1
    levels = Counter(d.get("title_level", "?") for d in docs)
    countries = Counter(d.get("country_code", "?") for d in docs)
    with_email = sum(1 for d in docs if d.get("email"))  # we don't store email today; sanity check

    print(f"Docs with email set:     {with_email}  (should be 0 — cache omits PII)")
    print(f"\nTop 15 companies by cached headcount:")
    for co, n in companies.most_common(15):
        pct = 100 * n / len(docs)
        print(f"  {n:>5}  ({pct:>4.1f}%)  {co}")

    print(f"\nTop 15 schools:")
    for sch, n in schools.most_common(15):
        pct = 100 * n / len(docs)
        print(f"  {n:>5}  ({pct:>4.1f}%)  {sch}")

    print(f"\nTitle level distribution:")
    for lvl, n in levels.most_common():
        pct = 100 * n / len(docs)
        print(f"  {n:>5}  ({pct:>4.1f}%)  {lvl}")

    print(f"\nCountry code distribution:")
    for cc, n in countries.most_common():
        pct = 100 * n / len(docs)
        print(f"  {n:>5}  ({pct:>4.1f}%)  {cc}")

    return docs


def report_staleness(docs: list[dict]) -> None:
    """Section 2: how stale is the cache — median + oldest doc age."""
    print(f"\n=== 2. Staleness ===\n")
    ages = []
    now = datetime.now(timezone.utc)
    for d in docs:
        ts = d.get("last_seen_at")
        if ts is None:
            continue
        try:
            ages.append((now - ts).total_seconds())
        except Exception:
            continue
    if not ages:
        print("No last_seen_at timestamps found — writer may not be stamping them.")
        return
    ages.sort()
    median = ages[len(ages) // 2]
    p90 = ages[min(len(ages) - 1, int(len(ages) * 0.9))]
    oldest = ages[-1]
    print(f"Docs with last_seen_at:  {len(ages):,}")
    print(f"Median age:              {timedelta(seconds=int(median))}")
    print(f"P90 age:                 {timedelta(seconds=int(p90))}")
    print(f"Oldest cache entry:      {timedelta(seconds=int(oldest))}")


def report_growth(db) -> None:
    """Section 3: how fast is the cache growing?
    Counts docs written in the last hour, day, week."""
    print(f"\n=== 3. Growth rate (from last_seen_at buckets) ===\n")
    now = datetime.now(timezone.utc)
    windows = [
        ("Last 1 hour",  timedelta(hours=1)),
        ("Last 24 hours", timedelta(days=1)),
        ("Last 7 days",   timedelta(days=7)),
        ("Last 30 days",  timedelta(days=30)),
    ]
    for label, td in windows:
        cutoff = now - td
        # Use last_seen_at as write-recency proxy
        q = (
            db.collection("firm_employees")
            .where("last_seen_at", ">=", cutoff)
            .limit(5000)
        )
        try:
            n = sum(1 for _ in q.stream())
            capped = " (query capped at 5000)" if n == 5000 else ""
            print(f"  {label:<18} {n:>6,} distinct docs seen{capped}")
        except Exception as e:
            print(f"  {label:<18} query failed: {e}")


def report_simulated_hit_rate(db, docs: list[dict]) -> None:
    """Section 4: reconstruct recent queries from pdl_search_cache and
    check what portion of them would hit the current firm_employees state.

    This is the key day-60 data point. High hit rate = flip the reader flag.
    """
    print(f"\n=== 4. Simulated hit rate ===\n")
    print("Reconstructing queries from pdl_search_cache.query_meta...")

    if not docs:
        print("  Skipping — no cached docs to simulate against.")
        return

    # Build in-memory indexes over the sampled firm_employees.
    # Key by (company, school) for the primary query pattern, plus by company
    # alone for fallback queries.
    by_company_school: dict[tuple[str, str], int] = defaultdict(int)
    by_company: dict[str, int] = defaultdict(int)
    by_school: dict[str, int] = defaultdict(int)
    for d in docs:
        co = d.get("company")
        if co:
            by_company[co] += 1
        for sch in (d.get("schools") or []):
            by_school[sch] += 1
            if co:
                by_company_school[(co, sch)] += 1

    # Now iterate pdl_search_cache queries.
    queries = 0
    would_hit_partial = 0
    would_hit_full = 0
    total_potential_credits_saved = 0
    company_hit_details = Counter()  # (company, hit_count) for top-hit-firms output

    from app.services.firm_cache.schema import slugify_company, slugify_school

    for snap in db.collection("pdl_search_cache").stream():
        d = snap.to_dict() or {}
        meta = d.get("query_meta") or {}
        raw_companies = [c for c in (meta.get("companies") or []) if c]
        raw_schools = [s for s in (meta.get("schools") or []) if s]
        max_contacts = int(meta.get("size", d.get("credit_cost", 0)) or 5)
        if not raw_companies and not raw_schools:
            continue  # reader would skip this too (too broad)
        queries += 1

        # Slugify to match how the reader looks them up.
        co_slugs = [slugify_company(c) for c in raw_companies if slugify_company(c)]
        sch_slugs = [slugify_school(s) for s in raw_schools if slugify_school(s)]

        # Simulate the reader's query dispatcher.
        best_estimate = 0
        if co_slugs and sch_slugs:
            for co in co_slugs:
                for sch in sch_slugs:
                    best_estimate += by_company_school.get((co, sch), 0)
        elif co_slugs:
            for co in co_slugs:
                best_estimate += by_company.get(co, 0)
        elif sch_slugs:
            for sch in sch_slugs:
                best_estimate += by_school.get(sch, 0)

        if best_estimate >= max_contacts:
            would_hit_full += 1
            total_potential_credits_saved += max_contacts
            for co in co_slugs:
                company_hit_details[co] += 1
        elif best_estimate > 0:
            would_hit_partial += 1
            total_potential_credits_saved += best_estimate
            for co in co_slugs:
                company_hit_details[co] += 1

    print(f"Queries reconstructed:       {queries:,}")
    if queries == 0:
        print("  (no queries — pdl_search_cache may be empty)")
        return
    full_pct = 100 * would_hit_full / queries
    partial_pct = 100 * would_hit_partial / queries
    miss_pct = 100 - full_pct - partial_pct
    print(f"Would fully hit cache:       {would_hit_full:,}  ({full_pct:.1f}%)")
    print(f"Would partially hit cache:   {would_hit_partial:,}  ({partial_pct:.1f}%)")
    print(f"Would miss (full PDL call):  {queries - would_hit_full - would_hit_partial:,}  ({miss_pct:.1f}%)")

    print(f"\nEstimated PDL credits saved: {total_potential_credits_saved:,}")
    print(f"Estimated PDL $ saved:       ${total_potential_credits_saved * 0.20:.2f}")
    print("  (assumes $0.20/person_search credit; window = pdl_search_cache TTL of 30d)")

    if company_hit_details:
        print(f"\nTop 10 firms driving cache hits (potential):")
        for co, n in company_hit_details.most_common(10):
            print(f"  {n:>4}  {co}")

    # Day-60 decision guidance
    print("\n--- Day-60 decision guidance ---")
    if full_pct + partial_pct >= 25:
        print(f"✅ Overall hit rate {full_pct + partial_pct:.1f}% ≥ 25% threshold — reader flag is READY to flip.")
    elif full_pct + partial_pct >= 10:
        print(f"⏳ Overall hit rate {full_pct + partial_pct:.1f}% — cache warming, wait more.")
    else:
        print(f"⚠️  Overall hit rate {full_pct + partial_pct:.1f}% — cache too cold, or JIT strategy not matching demand.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sample", type=int, default=1000, help="Docs to sample from firm_employees (default 1000)")
    p.add_argument("--skip-simulate", action="store_true", help="Skip hit-rate simulation (faster)")
    args = p.parse_args()

    _init_firebase()
    db = firestore.client()

    docs = report_cache_size(db, args.sample)
    if docs:
        report_staleness(docs)
    report_growth(db)
    if not args.skip_simulate:
        report_simulated_hit_rate(db, docs)


if __name__ == "__main__":
    main()
