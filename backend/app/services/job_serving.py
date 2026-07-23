"""
Job board serving from the Fantastic.jobs curated Firestore pool.

The `jobs` collection is populated by the Fantastic.jobs ingest pipeline
(see `backend/pipeline/main.py`). Previously the `/api/job-board/jobs`
endpoint bypassed this pool and called SerpAPI live for every request.
This module serves jobs directly from Firestore instead, cutting external
API spend ~80% and lifting baseline quality (jobs have already passed the
ingest quality gate: no staffing agencies, no scams, no senior-only roles,
no stale postings).

Schema mapping: Firestore `jobs` docs come from `pipeline/normalizer.py`
and use snake_case (job_id, description_raw, apply_url, posted_at, etc.).
The job board UI + hard-gate + scoring code expects the SerpAPI-shaped
dict (id, description, url, posted, requirements, experienceLevel, via).
`_firestore_to_job_dict()` does that translation.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from google.cloud.firestore_v1.base_query import FieldFilter

from app.extensions import get_db

logger = logging.getLogger(__name__)

# Lookback window for the Firestore query. Jobs older than this are excluded
# at fetch time so the ranker doesn't have to filter stale postings.
DEFAULT_LOOKBACK_DAYS = 30

# Hard cap on the Firestore pool size pulled into memory per request.
# 500 leaves room for hard gates to reject ~50% and still hit max_jobs=50.
DEFAULT_POOL_SIZE = 500

# When hard gates reject >X% of the pool, expand the lookback to a broader
# window before deciding to fall back to SerpAPI.
EXPAND_REJECTION_RATIO = 0.90

# Map Firestore `type` (FULLTIME/PARTTIME/INTERNSHIP) → UI/scorer type values.
# The scorer expects the SerpAPI-style human-readable strings.
_TYPE_MAP = {
    "FULLTIME": "Full-Time",
    "PARTTIME": "Part-Time",
    "INTERNSHIP": "Internship",
    "CONTRACT": "Contract",
}


def _posted_relative(posted_at: Any) -> str:
    """Render a Firestore datetime as a relative "X days ago" string."""
    if not posted_at:
        return "Recently"
    if isinstance(posted_at, str):
        try:
            posted_at = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
        except ValueError:
            return "Recently"
    if not isinstance(posted_at, datetime):
        return "Recently"
    if posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - posted_at
    days = delta.days
    if days <= 0:
        hours = max(int(delta.total_seconds() // 3600), 0)
        return f"{hours} hours ago" if hours else "Just posted"
    if days == 1:
        return "1 day ago"
    if days < 7:
        return f"{days} days ago"
    if days < 14:
        return "1 week ago"
    if days < 30:
        weeks = days // 7
        return f"{weeks} weeks ago"
    return f"{days // 30} months ago"


def _experience_level(doc: dict) -> str:
    """Five-band level (intern/entry/mid/senior/executive) so the per-user
    seniority gate and the frontend experience filter can key off it."""
    from app.services.career_stage import classify_job_level

    ai_level = (doc.get("ai_experience_level") or "").lower().strip()
    if ai_level:
        if any(k in ai_level for k in ("intern", "co-op")):
            return "intern"
        if any(k in ai_level for k in ("entry", "0-2", "junior", "graduate", "new grad")):
            return "entry"
        if any(k in ai_level for k in ("vp", "vice president", "executive", "chief", "head of")):
            return "executive"
        if any(k in ai_level for k in ("senior", "staff", "principal", "director")):
            return "senior"
        return "mid"
    level = classify_job_level(doc.get("title") or "")
    return level if level != "unknown" else "mid"


def _requirements_from_doc(doc: dict) -> List[str]:
    """Pull a short bulleted list of requirements for the UI drawer."""
    # Prefer the enrichment-extracted summary if present.
    structured = doc.get("structured") or {}
    if isinstance(structured, dict):
        reqs = structured.get("requirements")
        if isinstance(reqs, list) and reqs:
            return [str(r)[:200] for r in reqs[:6]]
    ai_reqs = doc.get("ai_requirements_summary")
    if isinstance(ai_reqs, list) and ai_reqs:
        return [str(r)[:200] for r in ai_reqs[:6]]
    if isinstance(ai_reqs, str) and ai_reqs.strip():
        # The summary is sometimes a single string with bullet markers.
        bullets = [b.strip(" •-\t") for b in ai_reqs.split("\n") if b.strip()]
        if bullets:
            return bullets[:6]
    return []


def _firestore_to_job_dict(doc: dict) -> Optional[dict]:
    """Translate a Firestore `jobs` doc into the job-board UI dict shape.

    Returns None for docs missing required fields. The caller already
    filters expired docs.
    """
    job_id = doc.get("job_id")
    title = doc.get("title")
    company = doc.get("company")
    if not job_id or not title or not company:
        return None

    raw_type = (doc.get("type") or "").upper().strip()
    ui_type = _TYPE_MAP.get(raw_type, "Full-Time")

    description = doc.get("description_raw") or ""
    if len(description) > 2000:
        description = description[:2000]

    posted_at = doc.get("posted_at")

    return {
        "id": job_id,
        "title": title,
        "company": company,
        "location": doc.get("location") or "United States",
        "salary": doc.get("salary_display"),
        "salary_min": doc.get("salary_min"),
        "salary_max": doc.get("salary_max"),
        "salary_normalized_annual": doc.get("salary_normalized_annual"),
        "type": ui_type,
        "posted": _posted_relative(posted_at),
        "posted_at": posted_at.isoformat() if isinstance(posted_at, datetime) else posted_at,
        "description": description,
        "requirements": _requirements_from_doc(doc),
        "url": doc.get("apply_url") or "",
        "logo": doc.get("employer_logo"),
        "remote": bool(doc.get("remote")),
        "experienceLevel": _experience_level(doc),
        "via": doc.get("source") or "fantasticjobs",
        # Pass-through signals the scorer / gates can use.
        "ai_visa_sponsorship": doc.get("ai_visa_sponsorship"),
        "ai_key_skills": doc.get("ai_key_skills"),
        "ai_keywords": doc.get("ai_keywords"),
        "ai_employment_type": doc.get("ai_employment_type"),
        "linkedin_org_industry": doc.get("linkedin_org_industry"),
        "linkedin_org_size": doc.get("linkedin_org_size"),
        # Marker so downstream code can tell where the job came from. The UI
        # uses this to show "Curated" vs "Live search" badging if we want.
        "_serving_source": "firestore",
    }


def fetch_jobs_from_firestore(
    pool_size: int = DEFAULT_POOL_SIZE,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> Tuple[List[dict], dict]:
    """Pull the most recently posted active jobs from the curated pool.

    The query orders by `posted_at desc` and limits to `pool_size`. The caller
    is responsible for applying hard gates, dedup, and ranking — this function
    is just the I/O layer.

    Returns (job_dicts, metadata). The metadata reports raw counts and is
    surfaced in the API response so the frontend can show provenance.
    """
    db = get_db()
    if not db:
        logger.warning("[JobServing] Firestore not initialized; returning empty pool")
        return [], {"error": "firestore_unavailable", "pool_size": 0}

    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    try:
        query = (
            db.collection("jobs")
            .where(filter=FieldFilter("posted_at", ">=", cutoff))
            .order_by("posted_at", direction="DESCENDING")
            .limit(pool_size)
        )
        raw_docs = list(query.stream())
    except Exception as e:
        # Most likely a missing composite index. Fall back to the unbounded
        # query and trim in Python — slower but keeps the endpoint up.
        logger.warning(
            "[JobServing] Indexed Firestore query failed (%s); falling back to scan",
            e,
        )
        try:
            raw_docs = list(db.collection("jobs").limit(pool_size).stream())
        except Exception as inner:
            logger.exception("[JobServing] Firestore fallback scan failed: %s", inner)
            return [], {"error": "firestore_query_failed", "pool_size": 0}

    jobs: List[dict] = []
    skipped_expired = 0
    skipped_invalid = 0
    for snap in raw_docs:
        data = snap.to_dict() or {}
        if data.get("expired"):
            skipped_expired += 1
            continue
        # Defensive: if `posted_at` was missing, the indexed query wouldn't
        # have caught it. Drop docs that don't have enough signal.
        posted_at = data.get("posted_at")
        if isinstance(posted_at, datetime):
            if posted_at.tzinfo is None:
                posted_at = posted_at.replace(tzinfo=timezone.utc)
            if posted_at < cutoff:
                continue
        mapped = _firestore_to_job_dict(data)
        if mapped is None:
            skipped_invalid += 1
            continue
        jobs.append(mapped)

    metadata = {
        "pool_size": len(jobs),
        "raw_docs": len(raw_docs),
        "skipped_expired": skipped_expired,
        "skipped_invalid": skipped_invalid,
        "lookback_days": lookback_days,
    }
    logger.info(
        "[JobServing] Firestore pool: %d active jobs (raw=%d, expired=%d, invalid=%d)",
        len(jobs), len(raw_docs), skipped_expired, skipped_invalid,
    )
    return jobs, metadata


def fetch_jobs_from_firestore_personalized(
    uid: str,
    user_profile: dict,
    pool_size: int = DEFAULT_POOL_SIZE,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    career_domain: Optional[str] = None,
) -> Tuple[List[dict], dict]:
    """Vector-search personalized pool with automatic fallback to recency query.

    Flow:
      1. Read RANKER_MODE env var. If 'rules'/'legacy', skip vector path.
      2. Compose user preference vector from Phase 1 signals.
      3. Firestore vector search returns top-pool_size job_ids.
      4. Hydrate to full job dicts, preserve nearest-neighbor order.
      5. Fall back to fetch_jobs_from_firestore() on any failure.

    The returned metadata dict includes 'serving_source' so /job-board's
    logs and API response can distinguish 'vector' vs 'recency' pools —
    useful for the RANKER_MODE A/B and for debugging user reports.
    """
    from backend.app.services.retrieve_and_rank import get_ranker_mode

    if get_ranker_mode() != "embedding":
        jobs, meta = fetch_jobs_from_firestore(pool_size, lookback_days)
        meta["serving_source"] = "recency_fallback_ranker_mode_rules"
        return jobs, meta

    if not uid:
        jobs, meta = fetch_jobs_from_firestore(pool_size, lookback_days)
        meta["serving_source"] = "recency_no_uid"
        return jobs, meta

    try:
        from backend.app.services.user_preference_vector import get_preference_vector
        from backend.app.services.vector_store import find_nearest_job_ids
    except Exception as e:
        logger.warning("[JobServing] vector imports failed: %s", e)
        jobs, meta = fetch_jobs_from_firestore(pool_size, lookback_days)
        meta["serving_source"] = "recency_fallback_import_error"
        return jobs, meta

    db = get_db()
    if not db:
        return [], {"error": "firestore_unavailable", "pool_size": 0,
                    "serving_source": "unavailable"}

    user_vec = get_preference_vector(uid, user_profile, db=db)
    if not user_vec:
        # User hasn't finished cold-start onboarding — no vector yet.
        jobs, meta = fetch_jobs_from_firestore(pool_size, lookback_days)
        meta["serving_source"] = "recency_no_preference_vector"
        return jobs, meta

    job_ids = find_nearest_job_ids(
        user_vec,
        top_k=pool_size,
        career_domain=career_domain,
        db=db,
    )
    if not job_ids:
        jobs, meta = fetch_jobs_from_firestore(pool_size, lookback_days)
        meta["serving_source"] = "recency_vector_empty"
        return jobs, meta

    # Hydrate in nearest-neighbor order.
    order_index = {jid: i for i, jid in enumerate(job_ids)}
    hydrated: List[dict] = []
    skipped_expired = 0
    skipped_invalid = 0
    CHUNK = 400
    for i in range(0, len(job_ids), CHUNK):
        chunk = job_ids[i : i + CHUNK]
        refs = [db.collection("jobs").document(jid) for jid in chunk]
        try:
            docs = db.get_all(refs)
        except Exception as e:
            logger.warning("[JobServing] hydrate get_all failed: %s", e)
            continue
        for snap in docs:
            if not snap.exists:
                continue
            data = snap.to_dict() or {}
            if data.get("expired"):
                skipped_expired += 1
                continue
            mapped = _firestore_to_job_dict(data)
            if mapped is None:
                skipped_invalid += 1
                continue
            hydrated.append(mapped)

    hydrated.sort(key=lambda j: order_index.get(j.get("id") or j.get("job_id"), 10_000))

    metadata = {
        "pool_size": len(hydrated),
        "raw_docs": len(job_ids),
        "skipped_expired": skipped_expired,
        "skipped_invalid": skipped_invalid,
        "lookback_days": lookback_days,
        "serving_source": "vector",
    }
    logger.info(
        "[JobServing] Vector pool: %d active jobs (nearest=%d, expired=%d, invalid=%d)",
        len(hydrated), len(job_ids), skipped_expired, skipped_invalid,
    )
    return hydrated, metadata
