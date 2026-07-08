"""
Firestore vector search wrapper for job embeddings.

Sits on top of the existing job_embeddings collection (see
backend/app/utils/embedding_ranker.py for how those docs are populated).
Adds server-side nearest-neighbor search so we don't have to fetch a 500-job
pool and cosine in Python — Firestore's find_nearest scales to 100k+ docs
with a scalar prefilter.

REQUIRED FIRESTORE INDEX (provision via Firebase console or gcloud):

    gcloud firestore indexes composite create \\
      --collection-group=job_embeddings \\
      --query-scope=COLLECTION \\
      --field-config=field-path=expired,order=ASCENDING \\
      --field-config=field-path=embedding,vector-config='{"dimension":1536,"flat":{}}'

The index prefilters on expired=false before the nearest-neighbor scan, so
queries stay fast even at 100k+ jobs. Every find_nearest call MUST include
where('expired', '==', False) — enforced at this module's API boundary.

Design decision: filter fields (expired, career_domain, source) are
mirrored onto job_embeddings docs. This costs ~40 bytes per doc but avoids
a second Firestore read to hydrate the filter attributes at query time.
Kept in sync by the same code paths that write embeddings.

Fail-soft: any Firestore vector search failure returns [] so the ranker
can fall back to its existing Python-cosine path via embedding_ranker.
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Same collection as embedding_ranker to avoid a parallel embedding store.
JOB_EMBEDDINGS_COLLECTION = "job_embeddings"

# Must match the dim used at write time in embedding_ranker.
EMBEDDING_DIM = 1536


def find_nearest_job_ids(
    query_vector: list[float],
    top_k: int = 200,
    career_domain: Optional[str] = None,
    db=None,
) -> list[str]:
    """Return job_ids of the top_k jobs nearest to query_vector.

    Args:
        query_vector: The user's preference vector (see
            user_preference_vector.py). Must match EMBEDDING_DIM.
        top_k: Number of candidates to return. Firestore caps at 1000 per
            query; we default to 200 since the ranker reranks that pool.
        career_domain: Optional scalar prefilter. If provided, only jobs
            with matching career_domain are considered. Adds a second
            axis to the composite index requirement.
        db: Firestore client. Fetched lazily if None.

    Returns:
        List of job_ids in descending nearest-neighbor order. Empty list
        on any error so the caller can fall back gracefully.
    """
    if not isinstance(query_vector, list) or len(query_vector) != EMBEDDING_DIM:
        logger.warning(
            "vector_store.find_nearest: bad query vector shape (len=%s, expected %d)",
            len(query_vector) if isinstance(query_vector, list) else "not-list",
            EMBEDDING_DIM,
        )
        return []

    if db is None:
        try:
            from backend.app.extensions import get_db
            db = get_db()
        except Exception as e:
            logger.warning("vector_store: get_db failed: %s", e)
            return []
    if db is None:
        return []

    try:
        # Firestore vector search is exposed via the client's `find_nearest`
        # method on a Query. The Vector helper wraps the float list.
        from google.cloud.firestore_v1.vector import Vector
        from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
    except Exception as e:
        # Older google-cloud-firestore lacks vector search — surface once
        # and fall back to empty (caller's Python cosine path handles it).
        logger.warning(
            "vector_store: firestore vector search unavailable (%s). "
            "Upgrade google-cloud-firestore to enable server-side ANN.",
            e,
        )
        return []

    try:
        col = db.collection(JOB_EMBEDDINGS_COLLECTION)
        # MANDATORY scalar prefilter — enforced here, not left to callers.
        query = col.where("expired", "==", False)
        if career_domain:
            query = query.where("career_domain", "==", career_domain)

        vquery = query.find_nearest(
            vector_field="embedding",
            query_vector=Vector(query_vector),
            limit=int(top_k),
            distance_measure=DistanceMeasure.COSINE,
        )
        docs = vquery.get()
        return [d.id for d in docs if d.exists]
    except Exception as e:
        logger.warning("vector_store.find_nearest_job_ids failed: %s", e)
        return []


def upsert_job_embedding(
    job_id: str,
    embedding: list[float],
    filter_attrs: Optional[dict] = None,
    db=None,
) -> bool:
    """Write or update the embedding for a job, plus mirrored filter attributes.

    filter_attrs supports:
      expired (bool)         — MANDATORY on write; defaults to False if omitted
      career_domain (str)    — optional, adds a second prefilter axis
      source (str)           — optional, useful for A/B analytics

    Returns True on success, False on failure. Never raises.
    """
    if not job_id or not isinstance(embedding, list) or len(embedding) != EMBEDDING_DIM:
        return False

    if db is None:
        try:
            from backend.app.extensions import get_db
            db = get_db()
        except Exception:
            return False
    if db is None:
        return False

    attrs = filter_attrs or {}
    # expired MUST be present so find_nearest queries can prefilter safely.
    payload = {
        "embedding": embedding,
        "dim": EMBEDDING_DIM,
        "expired": bool(attrs.get("expired", False)),
    }
    if "career_domain" in attrs and attrs["career_domain"]:
        payload["career_domain"] = str(attrs["career_domain"])
    if "source" in attrs and attrs["source"]:
        payload["source"] = str(attrs["source"])
    # Model tag so we can safely re-embed if we bump the model.
    from backend.app.utils.embedding_ranker import EMBEDDING_MODEL
    payload["model"] = EMBEDDING_MODEL

    try:
        db.collection(JOB_EMBEDDINGS_COLLECTION).document(job_id).set(
            payload, merge=True
        )
        return True
    except Exception as e:
        logger.warning("vector_store.upsert_job_embedding failed for %s: %s", job_id, e)
        return False


def mark_expired(job_ids: list[str], db=None) -> int:
    """Flag a batch of jobs as expired in the embedding collection.

    Called by the FJ expired-sweep daemon so find_nearest continues to
    filter them out. Returns the count of successful updates.
    """
    if not job_ids:
        return 0

    if db is None:
        try:
            from backend.app.extensions import get_db
            db = get_db()
        except Exception:
            return 0
    if db is None:
        return 0

    updated = 0
    BATCH = 400
    for i in range(0, len(job_ids), BATCH):
        chunk = job_ids[i : i + BATCH]
        try:
            batch = db.batch()
            for jid in chunk:
                ref = db.collection(JOB_EMBEDDINGS_COLLECTION).document(jid)
                batch.set(ref, {"expired": True}, merge=True)
            batch.commit()
            updated += len(chunk)
        except Exception as e:
            logger.warning("vector_store.mark_expired batch failed: %s", e)
    return updated
