"""
One-shot backfill: re-canonicalize the `company` field on every existing
Firestore job doc using the fixed normalizer.

Context (verified against prod 2026-07-15):
  Before the normalizer fix, canonicalize_company() was a passthrough.
  Company names fragmented across variants:
    "OpenAI" (331) + "Openai" (310) + "openai" (0)  → three keys, one firm
    "DoorDash" (1) + "Doordashusa" (271)             → two keys, one firm

  That broke:
    - Company page search (search?company=openai returned 0/641 OpenAI roles)
    - Scout's inventory-grounded suggestions on the app
    - Any future companies/{slug} index

Run:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json python -m backend.scripts.backfill_canonical_company
    # dry-run first (recommended):
    ... python -m backend.scripts.backfill_canonical_company --dry-run
    # limit for smoke test:
    ... python -m backend.scripts.backfill_canonical_company --limit=5000

Preserves the original as `company_raw` on every touched doc (already the
convention elsewhere in the pipeline).
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from collections import Counter

import firebase_admin
from firebase_admin import credentials, firestore

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.pipeline.normalizer import canonicalize_company  # noqa: E402

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

BATCH_WRITE_SIZE = 400


def _init_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
    return firestore.client()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="scan + canonicalize but skip writes")
    parser.add_argument("--limit", type=int, default=None, help="stop after N docs (smoke test)")
    args = parser.parse_args()

    db = _init_db()
    coll = db.collection("jobs")

    scanned = 0
    unchanged = 0
    changed = 0
    empty_company = 0
    before_counter: Counter = Counter()
    after_counter: Counter = Counter()
    change_examples: list[tuple[str, str]] = []

    batch = db.batch()
    batch_size = 0
    total_written = 0

    # Paginated scan — Firestore times out on full-collection stream at
    # 129K+ docs. Page by document ID (always indexed) in chunks of 2000.
    PAGE_SIZE = 2000
    last_doc = None
    logger.info("streaming jobs collection (paginated, %d per page)...", PAGE_SIZE)
    while True:
        q = coll.order_by("__name__").limit(PAGE_SIZE)
        if last_doc is not None:
            q = q.start_after(last_doc)
        page = list(q.stream())
        if not page:
            break
        last_doc = page[-1]

        for doc in page:
            scanned += 1
            data = doc.to_dict() or {}
            current = (data.get("company") or "").strip()

            if not current:
                empty_company += 1
                continue

            canonical = canonicalize_company(current)
            before_counter[current] += 1
            after_counter[canonical] += 1

            if canonical == current:
                unchanged += 1
            else:
                changed += 1
                if len(change_examples) < 20:
                    change_examples.append((current, canonical))

                if not args.dry_run:
                    update = {"company": canonical}
                    if "company_raw" not in data:
                        update["company_raw"] = current
                    batch.update(doc.reference, update)
                    batch_size += 1
                    if batch_size >= BATCH_WRITE_SIZE:
                        batch.commit()
                        total_written += batch_size
                        logger.info("  committed %d writes (running total %d)", batch_size, total_written)
                        batch = db.batch()
                        batch_size = 0

            if args.limit and scanned >= args.limit:
                break

        logger.info("  page done: scanned %d total (%d changed, %d unchanged)", scanned, changed, unchanged)

        if args.limit and scanned >= args.limit:
            logger.info("hit --limit=%d, stopping", args.limit)
            break
        if len(page) < PAGE_SIZE:
            break  # last page

    if batch_size and not args.dry_run:
        batch.commit()
        total_written += batch_size
        logger.info("  final commit of %d writes", batch_size)

    print()
    print("=" * 60)
    print(f"CANONICALIZE BACKFILL SUMMARY {'(DRY RUN)' if args.dry_run else ''}")
    print("=" * 60)
    print(f"  scanned:               {scanned:,}")
    print(f"  empty company field:   {empty_company:,}")
    print(f"  unchanged:             {unchanged:,}")
    print(f"  changed:               {changed:,}")
    print(f"  writes committed:      {total_written:,}")
    print()
    print(f"distinct company names BEFORE: {len(before_counter):,}")
    print(f"distinct company names AFTER:  {len(after_counter):,}")
    print(f"reduction: {len(before_counter) - len(after_counter):,} keys merged")
    print()
    if change_examples:
        print("sample changes (first 20):")
        for before, after in change_examples:
            print(f"  {before[:35]:35s} → {after[:35]}")


if __name__ == "__main__":
    main()
