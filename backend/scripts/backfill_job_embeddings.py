"""Backfill job embeddings for jobs missing from the job_embeddings collection.

Walks the jobs collection in batches. For each job:
  - Skip if a job_embeddings/{job_id} doc already exists with the right dim
  - Otherwise: compute embedding via embedding_ranker._embed_batch and write
    via vector_store.upsert_job_embedding

Idempotent. Safe to run repeatedly. Rate-limit-aware.

Usage:
  python -m backend.scripts.backfill_job_embeddings
  python -m backend.scripts.backfill_job_embeddings --dry-run
  python -m backend.scripts.backfill_job_embeddings --limit=1000
  python -m backend.scripts.backfill_job_embeddings --batch-size=200

Expected cost: at ~$0.02 per 1M tokens for text-embedding-3-small, a
full backfill of 13k jobs with average text ~800 tokens is roughly
13000 * 800 / 1e6 * 0.02 = $0.21. Cheap.
"""
import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, ".."))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, "..", ".."))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("backfill_job_embeddings")


def main():
    parser = argparse.ArgumentParser(description="Backfill missing job embeddings.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be embedded without calling OpenAI or writing.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap total jobs processed. Default: no cap.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=200,
        help="How many jobs per embed call. Default 200. Max 2048 by OpenAI.",
    )
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=100,
        help="Sleep between batches to avoid API rate limits. Default 100ms.",
    )
    args = parser.parse_args()

    from backend.app.extensions import get_db
    from backend.app.utils.embedding_ranker import (
        _embed_batch,
        _job_text,
        EMBEDDING_DIM,
        JOB_EMBEDDINGS_COLLECTION,
    )
    from backend.app.services.vector_store import upsert_job_embedding

    db = get_db()
    if not db:
        logger.error("Firestore DB not initialized. Aborting.")
        sys.exit(1)

    logger.info("Scanning jobs collection for missing embeddings...")
    started = time.time()

    # Stream jobs (avoid loading all into memory at once for large collections).
    jobs_iter = db.collection("jobs").stream()

    processed = 0
    skipped_existing = 0
    skipped_no_text = 0
    embedded = 0
    write_failures = 0

    pending_batch: list[tuple[str, str, dict]] = []  # (job_id, text, filter_attrs)

    def flush_batch():
        nonlocal embedded, write_failures
        if not pending_batch:
            return
        if args.dry_run:
            embedded += len(pending_batch)
            pending_batch.clear()
            return
        texts = [t for _, t, _ in pending_batch]
        try:
            embs = _embed_batch(texts)
        except Exception as e:
            logger.warning("embed batch failed: %s", e)
            pending_batch.clear()
            return
        for (jid, _, attrs), emb in zip(pending_batch, embs):
            if not emb or len(emb) != EMBEDDING_DIM:
                write_failures += 1
                continue
            if not upsert_job_embedding(jid, emb, filter_attrs=attrs, db=db):
                write_failures += 1
                continue
            embedded += 1
        pending_batch.clear()
        time.sleep(args.sleep_ms / 1000.0)

    for job_doc in jobs_iter:
        if args.limit is not None and processed >= args.limit:
            break
        processed += 1

        job_id = job_doc.id
        # Fast-path skip: is there already an embedding doc?
        existing = db.collection(JOB_EMBEDDINGS_COLLECTION).document(job_id).get()
        if existing.exists:
            data = existing.to_dict() or {}
            emb = data.get("embedding")
            if isinstance(emb, list) and len(emb) == EMBEDDING_DIM:
                skipped_existing += 1
                if processed % 500 == 0:
                    logger.info(
                        "  ...progress: processed=%d embedded=%d skipped=%d",
                        processed, embedded, skipped_existing,
                    )
                continue

        job = job_doc.to_dict() or {}
        text = _job_text(job)
        if not text:
            skipped_no_text += 1
            continue

        filter_attrs = {
            "expired": bool(job.get("expired", False)),
            "career_domain": job.get("career_domain"),
            "source": job.get("source"),
        }
        pending_batch.append((job_id, text, filter_attrs))

        if len(pending_batch) >= args.batch_size:
            flush_batch()

        if processed % 500 == 0:
            logger.info(
                "  ...progress: processed=%d embedded=%d skipped_existing=%d",
                processed, embedded, skipped_existing,
            )

    # Final batch
    flush_batch()

    elapsed = time.time() - started
    logger.info("=" * 60)
    logger.info("Backfill complete in %.1fs", elapsed)
    logger.info("  Processed: %d", processed)
    logger.info("  Embedded: %d", embedded)
    logger.info("  Skipped (already had embedding): %d", skipped_existing)
    logger.info("  Skipped (no text to embed): %d", skipped_no_text)
    logger.info("  Write failures: %d", write_failures)
    if args.dry_run:
        logger.info("  (DRY RUN — no API calls, no writes)")


if __name__ == "__main__":
    main()
