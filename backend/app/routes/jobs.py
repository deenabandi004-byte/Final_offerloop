"""
Jobs API routes — feed, feedback, and filters.
"""
from flask import Blueprint, jsonify, request
from backend.app.extensions import require_firebase_auth, get_db
from backend.app.utils.job_ranking import (
    prefilter_candidates,
    rank_with_gpt,
    apply_feedback_adjustments,
)
from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger(__name__)

jobs_bp = Blueprint("jobs", __name__)

_filters_cache = {"data": None, "cached_at": None}
FILTERS_CACHE_TTL = 3600


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize_jobs(jobs: list[dict]) -> list[dict]:
    """Convert Firestore timestamps to ISO strings and strip description_raw."""
    cleaned = []
    for job in jobs:
        doc = dict(job)
        for ts_field in ("posted_at", "fetched_at", "expires_at"):
            val = doc.get(ts_field)
            if val is not None and hasattr(val, "isoformat"):
                doc[ts_field] = val.isoformat()
            elif val is not None and hasattr(val, "timestamp"):
                # Firestore DatetimeWithNanoseconds
                doc[ts_field] = val.isoformat()
        doc.pop("description_raw", None)
        cleaned.append(doc)
    return cleaned


# ---------------------------------------------------------------------------
# GET /api/jobs/feed
# ---------------------------------------------------------------------------

@jobs_bp.route("/api/jobs/feed", methods=["GET"])
@require_firebase_auth
def get_feed():
    uid = request.firebase_user["uid"]
    db = get_db()
    now = datetime.now(timezone.utc)
    refresh = request.args.get("refresh", "").lower() == "true"
    type_filter = request.args.get("type")
    category_filter = request.args.get("category")

    # Load user profile
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()
    if not user_doc.exists:
        return jsonify({"error": "User not found"}), 404
    profile = user_doc.to_dict()

    # Check cache (top_jobs only — new_matches always fresh)
    cache = profile.get("jobFeedCache") or {}
    cache_ranked_at = cache.get("ranked_at")
    cache_valid = False
    if cache_ranked_at and not refresh:
        if hasattr(cache_ranked_at, "timestamp"):
            cache_age = (now - cache_ranked_at.replace(tzinfo=timezone.utc)).total_seconds()
        elif hasattr(cache_ranked_at, "isoformat"):
            cache_age = (now - cache_ranked_at).total_seconds()
        else:
            cache_age = float("inf")
        cache_valid = cache_age < 1800

    # Always fetch new_matches fresh (last 24h)
    twenty_four_hours_ago = now - timedelta(hours=24)

    if cache_valid:
        # Serve top_jobs from cache, new_matches fresh
        cached_ids = cache.get("job_ids", [])
        cached_scores = cache.get("scores", {})
        cached_reasons = cache.get("reasons", {})

        # Fetch cached top_jobs docs
        top_jobs = []
        if cached_ids:
            for i in range(0, len(cached_ids), 100):
                chunk = cached_ids[i:i + 100]
                refs = [db.collection("jobs").document(jid) for jid in chunk]
                docs = db.get_all(refs)
                for doc in docs:
                    if doc.exists:
                        j = doc.to_dict()
                        jid = j.get("job_id", doc.id)
                        j["match_score"] = cached_scores.get(jid)
                        j["match_reason"] = cached_reasons.get(jid)
                        j["ranked"] = j["match_score"] is not None
                        top_jobs.append(j)
            top_jobs.sort(key=lambda j: j.get("match_score") or 0, reverse=True)

        # Fresh new_matches
        new_query = (
            db.collection("jobs")
            .where("posted_at", ">=", twenty_four_hours_ago)
            .order_by("posted_at", direction="DESCENDING")
            .limit(20)
        )
        new_matches = []
        for doc in new_query.stream():
            j = doc.to_dict()
            jid = j.get("job_id", doc.id)
            j["match_score"] = cached_scores.get(jid)
            j["match_reason"] = cached_reasons.get(jid)
            j["ranked"] = j["match_score"] is not None
            new_matches.append(j)

        return jsonify({
            "new_matches": _serialize_jobs(new_matches),
            "top_jobs": _serialize_jobs(top_jobs),
            "new_matches_count": len(new_matches),
            "top_jobs_count": len(top_jobs),
            "ranked": True,
            "no_resume": False,
            "cached": True,
        })

    # No resume path
    has_resume = bool(profile.get("resumeParsed") or profile.get("resumeText"))
    if not has_resume:
        new_query = (
            db.collection("jobs")
            .where("posted_at", ">=", twenty_four_hours_ago)
            .order_by("posted_at", direction="DESCENDING")
            .limit(20)
        )
        new_matches = [doc.to_dict() for doc in new_query.stream()]
        for j in new_matches:
            j["match_score"] = None
            j["match_reason"] = None
            j["ranked"] = False

        top_query = (
            db.collection("jobs")
            .order_by("posted_at", direction="DESCENDING")
            .limit(50)
        )
        top_jobs = [doc.to_dict() for doc in top_query.stream()]
        for j in top_jobs:
            j["match_score"] = None
            j["match_reason"] = None
            j["ranked"] = False

        return jsonify({
            "new_matches": _serialize_jobs(new_matches),
            "top_jobs": _serialize_jobs(top_jobs),
            "new_matches_count": len(new_matches),
            "top_jobs_count": len(top_jobs),
            "ranked": False,
            "no_resume": True,
            "cached": False,
        })

    # Full ranking path
    all_query = (
        db.collection("jobs")
        .order_by("posted_at", direction="DESCENDING")
        .limit(300)
    )
    all_jobs = [doc.to_dict() for doc in all_query.stream()]

    # Post-fetch filters
    if type_filter:
        all_jobs = [j for j in all_jobs if j.get("type") == type_filter]
    if category_filter:
        all_jobs = [j for j in all_jobs if j.get("category") == category_filter]

    # Split recent jobs for new_matches
    recent_jobs = [
        j for j in all_jobs
        if _is_recent(j.get("posted_at"), twenty_four_hours_ago)
    ]

    # Load preferences
    prefs_query = user_ref.collection("jobPreferences").limit(100)
    preferences = [doc.to_dict() for doc in prefs_query.stream()]

    # Rank
    candidates = prefilter_candidates(all_jobs, profile, top_n=60)
    ranked = rank_with_gpt(candidates, profile)
    adjusted = apply_feedback_adjustments(ranked, preferences)

    # Build score lookup from ranked results
    score_map = {}
    reason_map = {}
    for j in adjusted:
        if j.get("match_score") is not None:
            score_map[j["job_id"]] = j["match_score"]
            reason_map[j["job_id"]] = j.get("match_reason")

    # Cache top 50
    top_jobs = adjusted[:50]
    cache_data = {
        "job_ids": [j["job_id"] for j in top_jobs],
        "scores": {j["job_id"]: j.get("match_score") for j in top_jobs},
        "reasons": {j["job_id"]: j.get("match_reason") for j in top_jobs},
        "ranked_at": now,
    }
    user_ref.update({"jobFeedCache": cache_data})

    # new_matches: merge in scores where available
    for j in recent_jobs:
        jid = j.get("job_id")
        j["match_score"] = score_map.get(jid)
        j["match_reason"] = reason_map.get(jid)
        j["ranked"] = j["match_score"] is not None
    recent_jobs.sort(key=lambda j: _get_posted_at_ts(j), reverse=True)
    new_matches = recent_jobs[:20]

    return jsonify({
        "new_matches": _serialize_jobs(new_matches),
        "top_jobs": _serialize_jobs(top_jobs),
        "new_matches_count": len(new_matches),
        "top_jobs_count": len(top_jobs),
        "ranked": True,
        "no_resume": False,
        "cached": False,
    })


def _is_recent(posted_at, cutoff: datetime) -> bool:
    """Check if a posted_at value is after the cutoff."""
    if posted_at is None:
        return False
    if hasattr(posted_at, "timestamp"):
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    return posted_at >= cutoff


def _get_posted_at_ts(job: dict) -> datetime:
    """Get posted_at as a timezone-aware datetime for sorting."""
    val = job.get("posted_at")
    if val is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if hasattr(val, "timestamp") and val.tzinfo is None:
        return val.replace(tzinfo=timezone.utc)
    return val


# ---------------------------------------------------------------------------
# POST /api/jobs/feedback
# ---------------------------------------------------------------------------

@jobs_bp.route("/api/jobs/feedback", methods=["POST"])
@require_firebase_auth
def post_feedback():
    uid = request.firebase_user["uid"]
    db = get_db()
    data = request.get_json(silent=True) or {}

    job_id = data.get("job_id")
    signal = data.get("signal")

    if not job_id:
        return jsonify({"error": "job_id is required"}), 400
    if signal not in ("positive", "negative"):
        return jsonify({"error": "signal must be 'positive' or 'negative'"}), 400

    pref_doc = {
        "job_id": job_id,
        "signal": signal,
        "company": data.get("company"),
        "category": data.get("category"),
        "created_at": datetime.now(timezone.utc),
    }
    db.collection("users").document(uid).collection("jobPreferences").document(job_id).set(pref_doc)

    # Invalidate cache
    db.collection("users").document(uid).update({"jobFeedCache.ranked_at": None})

    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# GET /api/jobs/filters
# ---------------------------------------------------------------------------

@jobs_bp.route("/api/jobs/filters", methods=["GET"])
def get_filters():
    now = datetime.now(timezone.utc)

    # Check module-level cache
    if (
        _filters_cache["data"] is not None
        and _filters_cache["cached_at"] is not None
        and (now - _filters_cache["cached_at"]).total_seconds() < FILTERS_CACHE_TTL
    ):
        return jsonify(_filters_cache["data"])

    db = get_db()
    types = set()
    categories = set()
    total = 0

    query = db.collection("jobs").limit(500)
    for doc in query.stream():
        d = doc.to_dict()
        total += 1
        if d.get("type"):
            types.add(d["type"])
        if d.get("category"):
            categories.add(d["category"])

    result = {
        "types": sorted(types),
        "categories": sorted(categories),
        "total_jobs": total,
    }
    _filters_cache["data"] = result
    _filters_cache["cached_at"] = now

    return jsonify(result)
