"""
Retrieve-then-rank orchestrator for the job board.

Wraps the existing student_job_ranker.rank_for_student without modifying it.
The badge logic in student_job_ranker.score() stays 100% intact — this
orchestrator only changes HOW the candidate pool is assembled before
ranking.

Two paths:
  1. VECTOR path (new, RANKER_MODE=embedding or unset):
     - Compose user preference vector from Phase 1 signals
     - Firestore vector search finds top-K nearest jobs
     - Hydrate those job_ids to full docs via db.get_all
     - Feed to existing rank_for_student for scoring + badges + diversify

  2. LEGACY path (RANKER_MODE=rules, or vector unavailable, or user has
     no preference vector):
     - Pass through to a caller-supplied pool (existing job_board.py
       fetches its own pool and hands it in). Same downstream rank.

Env var kill switch:
    RANKER_MODE=embedding  → vector path (default)
    RANKER_MODE=rules      → force legacy path

Design decisions:
- Wrap-don't-rewrite: the 10 badge types (entry_level_fit, sponsors_visa,
  strong_skill_overlap, etc.) all emit from student_job_ranker.score()
  unchanged. No regression risk to badges.
- Vector path failures fall back to legacy path automatically. No 500s
  for the user; worst case they see the pre-Phase-2 ranking.
- Preference vector is computed lazily and cached — first job-board load
  after onboarding pays the ~200ms embed; subsequent loads are cache-hits.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


# How many candidates the vector search returns before ranking runs.
# Ranker's rank_for_student uses candidate_pool=300 by default; we set
# 200 here to keep Firestore find_nearest fast and reserve room for a
# future Cohere rerank layer (Phase 3).
DEFAULT_TOP_K_RETRIEVE = 200


def get_ranker_mode() -> str:
    """Read RANKER_MODE env var. Default 'embedding' (vector path on)."""
    val = (os.environ.get("RANKER_MODE") or "").strip().lower()
    if val in {"rules", "legacy"}:
        return "rules"
    return "embedding"


def retrieve_and_rank(
    student: dict,
    uid: str,
    fallback_pool: Optional[list[dict]] = None,
    top_k_retrieve: int = DEFAULT_TOP_K_RETRIEVE,
    top_k_final: int = 50,
    career_domain: Optional[str] = None,
    db=None,
) -> list[tuple[dict, float, list[str]]]:
    """Retrieve candidate jobs via vector search, hand off to existing ranker.

    Args:
        student: The full student profile dict (same shape rank_for_student
            expects). Should include onboardingExtract, onboardingTasteTest,
            resumeParsed, goals, etc.
        uid: Firebase uid — needed to cache the preference vector.
        fallback_pool: If vector path fails or is disabled, use this pool
            as the input to rank_for_student. Caller (job_board.py) fetches
            it via its existing Firestore query. If None and vector fails,
            returns [].
        top_k_retrieve: How many candidates to retrieve from vector search
            before ranking. 200 by default.
        top_k_final: Final result size, passed to rank_for_student.
        career_domain: Optional prefilter for vector search.
        db: Firestore client, fetched lazily if None.

    Returns:
        List of (job, score, reasons) tuples in ranked order — same shape
        rank_for_student returns today. Downstream code needs no changes.
    """
    from backend.app.services.student_job_ranker import rank_for_student

    mode = get_ranker_mode()

    if mode == "rules":
        # Kill switch active — skip vector path entirely.
        if fallback_pool:
            return rank_for_student(student, fallback_pool, top_k=top_k_final)
        return []

    # Vector path
    pool = _retrieve_via_vector(
        student=student,
        uid=uid,
        top_k=top_k_retrieve,
        career_domain=career_domain,
        db=db,
    )

    if not pool:
        # Fall back to caller-supplied pool. No user-visible failure.
        logger.info(
            "retrieve_and_rank: vector path returned empty for uid=%s, "
            "falling back to legacy pool (%d jobs)",
            uid,
            len(fallback_pool) if fallback_pool else 0,
        )
        if fallback_pool:
            return rank_for_student(student, fallback_pool, top_k=top_k_final)
        return []

    # Hand off to the existing ranker — 100% preserves scoring + badges +
    # diversification.
    return rank_for_student(student, pool, top_k=top_k_final)


def _retrieve_via_vector(
    student: dict,
    uid: str,
    top_k: int,
    career_domain: Optional[str],
    db,
) -> list[dict]:
    """Compose preference vector → find_nearest → hydrate.

    Returns [] on any failure so caller can fall back to legacy path.
    """
    if not uid:
        return []

    try:
        from backend.app.services.user_preference_vector import get_preference_vector
        from backend.app.services.vector_store import find_nearest_job_ids
    except Exception as e:
        logger.warning("retrieve_and_rank imports failed: %s", e)
        return []

    if db is None:
        try:
            from backend.app.extensions import get_db
            db = get_db()
        except Exception:
            return []
    if db is None:
        return []

    # Step 1: compose/fetch preference vector.
    user_vec = get_preference_vector(uid, student, db=db)
    if not user_vec:
        logger.info("retrieve_and_rank: no preference vector for uid=%s", uid)
        return []

    # Step 2: vector search.
    job_ids = find_nearest_job_ids(
        user_vec, top_k=top_k, career_domain=career_domain, db=db
    )
    if not job_ids:
        return []

    # Step 3: hydrate.
    return _hydrate_jobs(job_ids, db=db)


def _hydrate_jobs(job_ids: list[str], db) -> list[dict]:
    """Bulk-fetch full job docs by id. Preserves the order of job_ids
    (which reflects vector-search proximity) so downstream ranking has
    a stable input order.

    Firestore get_all caps around 500 per call; we chunk at 400 to be safe.
    """
    if not job_ids:
        return []

    order_index = {jid: i for i, jid in enumerate(job_ids)}
    out: dict[str, dict] = {}

    CHUNK = 400
    for i in range(0, len(job_ids), CHUNK):
        chunk = job_ids[i : i + CHUNK]
        refs = [db.collection("jobs").document(jid) for jid in chunk]
        try:
            docs = db.get_all(refs)
        except Exception as e:
            logger.warning("hydrate_jobs get_all failed: %s", e)
            continue
        for d in docs:
            if not d.exists:
                continue
            data = d.to_dict() or {}
            data.setdefault("job_id", d.id)
            out[d.id] = data

    return sorted(out.values(), key=lambda j: order_index.get(j["job_id"], 10_000))
