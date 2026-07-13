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


# A company name is never a role word or a placeholder. Scrapers sometimes slide
# the job TYPE into the company slot — a Simplify record shipped with
# company="Internship", title="AI Deployment Engineering Intern" (2026-07-12).
# That is worse than a cosmetic glitch: swiping such a job sends the contact
# search hunting for people who "work at Internship", which returns junk people
# and burns the user's credits. Reject at the door — cheap, and it protects us
# from whatever a NEW provider decides a company field means.
_NOT_A_COMPANY = {
    "internship", "internships", "intern", "co-op", "coop", "new grad", "graduate",
    "engineering", "engineer", "analyst", "associate", "manager", "developer",
    "scientist", "designer", "consultant", "full time", "part time", "full-time",
    "part-time", "contract", "remote", "hybrid", "onsite", "n/a", "na", "none",
    "unknown", "jobs", "job", "careers", "career", "company", "employer", "-",
}


def _company_is_junk(company) -> bool:
    name = str(company or "").strip().lower()
    return (not name) or name in _NOT_A_COMPANY


def write_jobs(normalized_jobs: list[dict]) -> dict:
    """
    Write net-new jobs to Firestore. Skips any job_id that already exists, and
    any job whose company name is obviously not a company (see _NOT_A_COMPANY).
    Returns { written, skipped_duplicates, skipped_junk, total }.
    """
    db = get_db()
    if not db:
        raise RuntimeError("Firestore DB not initialized")

    total = len(normalized_jobs)
    if total == 0:
        return {"written": 0, "skipped_duplicates": 0, "skipped_junk": 0, "total": 0}

    # Build lookup: job_id -> doc
    jobs_by_id = {}
    skipped_junk = 0
    for job in normalized_jobs:
        if _company_is_junk(job.get("company")):
            skipped_junk += 1
            print(
                f"[writer] skipping junk company={job.get('company')!r} "
                f"title={str(job.get('title'))[:40]!r} src={job.get('source')}",
                flush=True,
            )
            continue
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

    result = {
        "written": written,
        "skipped_duplicates": skipped,
        "skipped_junk": skipped_junk,
        "total": total,
    }
    logger.info("Write complete: %s", result)
    return result


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
