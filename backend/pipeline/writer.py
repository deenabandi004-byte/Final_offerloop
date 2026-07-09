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
            # Flag for Phase 1 enricher; pipeline/enricher.py picks these up
            # and fills in `structured` from Firecrawl.
            doc.setdefault("enrichment_status", "pending")
            # Flag for the PDL title pre-enricher; pipeline/title_enricher.py
            # picks these up and writes structured.title_meta.
            doc.setdefault("title_enrichment_status", "pending")
            ref = db.collection(COLLECTION).document(jid)
            batch.set(ref, doc)
        batch.commit()
        written += len(chunk)
        logger.info("  Batch write: %d jobs committed", len(chunk))

    # Embed newly-written jobs so Firestore vector search has them ready.
    # Fail-soft: embedding failure never fails the write; the on-demand
    # embed path in embedding_ranker will catch stragglers, and the
    # backfill script covers anything both miss.
    embed_count = _embed_new_jobs_batch(list(new_jobs.values()))
    if embed_count:
        logger.info("  Embedded %d newly-written jobs at ingest", embed_count)

    result = {"written": written, "skipped_duplicates": skipped, "total": total}
    logger.info("Write complete: %s", result)
    return result


def _embed_new_jobs_batch(new_jobs: list[dict]) -> int:
    """Compute embeddings for newly-written jobs and upsert into
    job_embeddings collection with filter attrs mirrored so Firestore
    vector search prefilters work.

    Batched: OpenAI batch-embed handles up to 2048 inputs per call; we
    chunk at 500 to keep memory pressure low and align with the
    embedding_ranker's EMBED_BATCH_SIZE budget. Never raises.
    """
    if not new_jobs:
        return 0

    try:
        from backend.app.utils.embedding_ranker import (
            _embed_batch,
            _job_text,
            EMBEDDING_DIM,
        )
        from backend.app.services.vector_store import upsert_job_embedding
    except Exception as e:
        logger.warning("embed-at-ingest: imports failed: %s", e)
        return 0

    CHUNK = 500
    total_embedded = 0
    for start in range(0, len(new_jobs), CHUNK):
        chunk = new_jobs[start : start + CHUNK]
        texts = [_job_text(j) for j in chunk]

        try:
            embs = _embed_batch(texts)
        except Exception as e:
            logger.warning("embed-at-ingest: batch failed: %s", e)
            continue

        for job, emb in zip(chunk, embs):
            if not emb or not isinstance(emb, list) or len(emb) != EMBEDDING_DIM:
                continue
            jid = job.get("job_id")
            if not jid:
                continue
            ok = upsert_job_embedding(
                jid,
                emb,
                filter_attrs={
                    "expired": bool(job.get("expired", False)),
                    "career_domain": job.get("career_domain"),
                    "source": job.get("source"),
                },
            )
            if ok:
                total_embedded += 1

    return total_embedded


def mark_expired_jobs(fj_ids: list[str]) -> dict:
    """Flag Firestore docs as expired based on the Fantastic.jobs Expired Jobs feed.

    Args:
        fj_ids: Raw FJ-side IDs (not yet prefixed). Each is translated to our
            Firestore job_id of the form `fantasticjobs_{id}` before update.

    Returns: {"marked": N, "not_found": M, "total": len(fj_ids)}.

    Doesn't delete — only sets `expired=true` and `expired_at`. Downstream
    job-board reads should filter expired=true. Keeping the doc lets the
    UI optionally show "this role closed" for users who saved it.
    """
    db = get_db()
    if not db:
        raise RuntimeError("Firestore DB not initialized")

    if not fj_ids:
        return {"marked": 0, "not_found": 0, "total": 0}

    now = datetime.now(timezone.utc)
    firestore_ids = [f"fantasticjobs_{fid}" for fid in fj_ids]

    # Check existence in chunks (Firestore get_all caps around 500/call)
    existing_ids = set()
    for i in range(0, len(firestore_ids), EXISTENCE_CHECK_CHUNK):
        chunk = firestore_ids[i : i + EXISTENCE_CHECK_CHUNK]
        refs = [db.collection(COLLECTION).document(jid) for jid in chunk]
        for doc in db.get_all(refs):
            if doc.exists:
                existing_ids.add(doc.id)

    # Batch-update only the docs we actually have
    marked = 0
    targets = list(existing_ids)
    for i in range(0, len(targets), BATCH_WRITE_SIZE):
        batch = db.batch()
        chunk = targets[i : i + BATCH_WRITE_SIZE]
        for jid in chunk:
            ref = db.collection(COLLECTION).document(jid)
            batch.update(ref, {"expired": True, "expired_at": now})
        batch.commit()
        marked += len(chunk)
        logger.info("  Expired-mark batch: %d jobs flagged", len(chunk))

    # Mirror expired flag onto the job_embeddings collection so Firestore
    # vector search's expired=false prefilter continues to exclude them.
    if targets:
        try:
            from backend.app.services.vector_store import mark_expired as _mark_vec_expired
            vec_marked = _mark_vec_expired(list(targets))
            logger.info("  Mirrored expired=true onto %d embedding docs", vec_marked)
        except Exception as e:
            logger.warning("Failed to mirror expired flag into job_embeddings: %s", e)

    result = {
        "marked": marked,
        "not_found": len(fj_ids) - marked,
        "total": len(fj_ids),
    }
    logger.info("Expired sweep complete: %s", result)
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
