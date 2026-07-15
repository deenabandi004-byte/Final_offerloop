"""
Piece 1 aggregation: build the `companies/{slug}` index collection from
the `jobs` collection.

Per Rylan's spec (verified 2026-07-15 post-Piece-0):

    companies/{slug}          # slug = canonicalize(company), lowercased, spaces→"-"
      name:        "Stripe"    # canonical display name
      jobCount:    { tier1: 12, tier2: 40, tier3: 662, total: 714 }
      topTitles:   ["Software Engineer", "Product Manager", ...]  # top ~8 by frequency
      sector:      null        # reserved for Piece 3 (LLM sector tag) — leave null now
      updatedAt:   <ts>

Both Scout (app) and any future company-detail page on the website read
`companies/{slug}` in O(1) instead of scanning 129K+ live jobs. Assumes
Piece 0 has run (canonicalize_company merged fragmented variants), so the
grouping is over stable canonical keys.

Run:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json python -m backend.scripts.build_companies_index
    # dry-run:
    ... python -m backend.scripts.build_companies_index --dry-run
    # skip tiny companies:
    ... python -m backend.scripts.build_companies_index --min-jobs=3

Idempotent — safe to re-run at any cadence. Later, the same script gets
called at the end of --crawl-ats or on its own hourly GH Actions cron.
"""
from __future__ import annotations

import argparse
import logging
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

BATCH_WRITE_SIZE = 400
JOBS_PAGE_SIZE = 2000
TOP_TITLES_KEEP = 8
COMPANIES_COLLECTION = "companies"


def _init_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
    return firestore.client()


def _company_slug(canonical_name: str) -> str:
    """Firestore-safe slug from a canonical company name.

    Rylan's spec: slug = canonicalize(company), lowercased, spaces → "-".
    We assume `canonical_name` is already the output of canonicalize_company()
    (from Piece 0), so this is just the slugification step.
    """
    s = canonical_name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "unknown"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="aggregate + preview but skip writes")
    parser.add_argument("--min-jobs", type=int, default=1,
                        help="skip companies with fewer than N total jobs (default 1 = all)")
    args = parser.parse_args()

    db = _init_db()
    jobs_coll = db.collection("jobs")
    companies_coll = db.collection(COMPANIES_COLLECTION)

    # Group by canonical company name (already normalized by Piece 0).
    # Struct: { name: str -> {tier1, tier2, tier3, total, titles: Counter} }
    groups: dict[str, dict] = defaultdict(lambda: {
        "tier1": 0, "tier2": 0, "tier3": 0, "total": 0,
        "titles": Counter(),
    })

    scanned = 0
    skipped_no_company = 0
    logger.info("scanning jobs collection (paginated, %d per page)...", JOBS_PAGE_SIZE)
    last_doc = None
    while True:
        q = jobs_coll.order_by("__name__").limit(JOBS_PAGE_SIZE)
        if last_doc is not None:
            q = q.start_after(last_doc)
        page = list(q.stream())
        if not page:
            break
        last_doc = page[-1]

        for doc in page:
            scanned += 1
            data = doc.to_dict() or {}
            name = (data.get("company") or "").strip()
            if not name:
                skipped_no_company += 1
                continue
            tier = data.get("relevance_tier")
            title = (data.get("title") or "").strip()

            g = groups[name]
            g["total"] += 1
            if tier == 1:
                g["tier1"] += 1
            elif tier == 2:
                g["tier2"] += 1
            elif tier == 3:
                g["tier3"] += 1
            if title:
                g["titles"][title] += 1

        logger.info("  scanned %d jobs, %d distinct companies so far", scanned, len(groups))
        if len(page) < JOBS_PAGE_SIZE:
            break

    logger.info("aggregation done: %d jobs → %d companies", scanned, len(groups))

    # Build company docs
    now = datetime.now(timezone.utc)
    docs_to_write: list[tuple[str, dict]] = []
    skipped_below_min = 0
    for name, g in groups.items():
        if g["total"] < args.min_jobs:
            skipped_below_min += 1
            continue
        top_titles = [t for t, _ in g["titles"].most_common(TOP_TITLES_KEEP)]
        slug = _company_slug(name)
        doc = {
            "name": name,
            "jobCount": {
                "tier1": g["tier1"],
                "tier2": g["tier2"],
                "tier3": g["tier3"],
                "total": g["total"],
            },
            "topTitles": top_titles,
            "sector": None,  # Reserved for Piece 3 (LLM sector tag)
            "updatedAt": now,
        }
        docs_to_write.append((slug, doc))

    # Batched writes
    written = 0
    if not args.dry_run:
        batch = db.batch()
        batch_size = 0
        for slug, doc in docs_to_write:
            batch.set(companies_coll.document(slug), doc)
            batch_size += 1
            if batch_size >= BATCH_WRITE_SIZE:
                batch.commit()
                written += batch_size
                logger.info("  committed %d writes (running %d)", batch_size, written)
                batch = db.batch()
                batch_size = 0
        if batch_size:
            batch.commit()
            written += batch_size

    # Summary
    print()
    print("=" * 60)
    print(f"COMPANIES INDEX BUILD {'(DRY RUN)' if args.dry_run else ''}")
    print("=" * 60)
    print(f"  jobs scanned:            {scanned:,}")
    print(f"  jobs missing company:    {skipped_no_company:,}")
    print(f"  distinct companies:      {len(groups):,}")
    print(f"  skipped (< min-jobs):    {skipped_below_min:,}")
    print(f"  companies indexed:       {len(docs_to_write):,}")
    print(f"  writes committed:        {written:,}")
    print()
    print("top 10 companies by total jobs:")
    top = sorted(groups.items(), key=lambda x: -x[1]["total"])[:10]
    for name, g in top:
        slug = _company_slug(name)
        titles = ", ".join(t for t, _ in g["titles"].most_common(3))
        print(f"  {g['total']:>5d}  {name:30s}  slug={slug:25s}  top: {titles[:60]}")


if __name__ == "__main__":
    main()
