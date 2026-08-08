"""HTTP surface for the iOS ranker.

Thin — all logic in services/person_ranker.py. Rylan's swipe-deck
client hits this endpoint only. See the person_ranker module docstring
for algorithm details, sensitive-field posture, and known gaps.
"""
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from ..extensions import require_firebase_auth, get_db
from app.services.person_ranker import (
    DEFAULT_RANKED_LIMIT,
    MAX_RANKED_LIMIT,
    rank_people_for_user,
)

ranker_bp = Blueprint("ranker", __name__, url_prefix="/api/ranker")


@ranker_bp.route("/candidates", methods=["GET"])
@require_firebase_auth
def get_ranked_candidates():
    """GET /api/ranker/candidates?limit=50

    Returns a diversified, scored list of people the authenticated user
    should reach out to. No search-query params — the ranker sources
    candidates from the caller's profile (dreamCompanies +
    academics.school) alone. Deterministic given user profile +
    firm_employees state (same call → same result).

    Response 200:
      {
        "candidates": [{person, score, tier, reasons, briefing}, ...],
        "count":       int,
        "generatedAt": ISO8601
      }

    Response 200 with count=0:
      Deck empty. Causes: sparse profile, no firm_employees hits, or
      (defensively) an unexpected error inside the ranker. `reason`
      distinguishes for the client. Clients render an empty state,
      not an error.

    Response 500:
      Database not initialized (backend health issue, not a user issue).
    """
    uid = request.firebase_user["uid"]
    try:
        limit = int(request.args.get("limit", DEFAULT_RANKED_LIMIT))
    except (TypeError, ValueError):
        limit = DEFAULT_RANKED_LIMIT
    limit = max(1, min(limit, MAX_RANKED_LIMIT))

    db = get_db()
    if not db:
        return jsonify({"error": "Database not initialized"}), 500

    candidates = rank_people_for_user(uid=uid, db=db, limit=limit)
    generated_at = datetime.now(timezone.utc).isoformat()

    if not candidates:
        return jsonify({
            "candidates":  [],
            "count":       0,
            "reason":      "no_candidates",
            "generatedAt": generated_at,
        })
    return jsonify({
        "candidates":  candidates,
        "count":       len(candidates),
        "generatedAt": generated_at,
    })
