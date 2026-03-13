"""
Write normalized jobs to Firestore 'jobs' collection.
Deduplicates by job_id and handles batch writes.
"""
import logging
from datetime import datetime, timezone

from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.extensions import get_db

logger = logging.getLogger(__name__)

COLLECTION = "jobs"
BATCH_WRITE_SIZE = 400
EXISTENCE_CHECK_CHUNK = 300
DELETE_BATCH_SIZE = 500


def write_jobs(normalized_jobs: list[dict]) -> dict:
    """
    Write net-new jobs to Firestore. Skips any job_id that already exists.
    Returns { written, skipped_duplicates, total }.
    """
    db = get_db()
    if not db:
        raise RuntimeError("Firestore DB not initialized")

    total = len(normalized_jobs)
    if total == 0:
        return {"written": 0, "skipped_duplicates": 0, "total": 0}

    # Build lookup: job_id -> doc
    jobs_by_id = {}
    for job in normalized_jobs:
        jid = job["job_id"]
        if jid not in jobs_by_id:
            jobs_by_id[jid] = job

    all_ids = list(jobs_by_id.keys())

    # Check which already exist in chunks
    existing_ids = set()
    for i in range(0, len(all_ids), EXISTENCE_CHECK_CHUNK):
        chunk = all_ids[i : i + EXISTENCE_CHECK_CHUNK]
        refs = [db.collection(COLLECTION).document(jid) for jid in chunk]
        docs = db.get_all(refs)
        for doc in docs:
            if doc.exists:
                existing_ids.add(doc.id)

    # Filter to net-new only
    new_jobs = {jid: doc for jid, doc in jobs_by_id.items() if jid not in existing_ids}
    skipped = len(jobs_by_id) - len(new_jobs)

    # Write in batches
    written = 0
    new_items = list(new_jobs.items())
    for i in range(0, len(new_items), BATCH_WRITE_SIZE):
        batch = db.batch()
        chunk = new_items[i : i + BATCH_WRITE_SIZE]
        for jid, doc in chunk:
            ref = db.collection(COLLECTION).document(jid)
            batch.set(ref, doc)
        batch.commit()
        written += len(chunk)
        logger.info("  Batch write: %d jobs committed", len(chunk))

    result = {"written": written, "skipped_duplicates": skipped, "total": total}
    logger.info("Write complete: %s", result)
    return result


def delete_expired_jobs() -> int:
    """Delete jobs where expires_at < now. Returns total deleted."""
    db = get_db()
    if not db:
        raise RuntimeError("Firestore DB not initialized")

    now = datetime.now(timezone.utc)
    total_deleted = 0

    while True:
        query = (
            db.collection(COLLECTION)
            .where(filter=FieldFilter("expires_at", "<", now))
            .limit(DELETE_BATCH_SIZE)
        )
        docs = list(query.stream())
        if not docs:
            break

        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
        total_deleted += len(docs)
        logger.info("  Deleted batch of %d expired jobs", len(docs))

    logger.info("Total expired jobs deleted: %d", total_deleted)
    return total_deleted
