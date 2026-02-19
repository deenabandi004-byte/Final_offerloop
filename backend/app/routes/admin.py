"""
Admin / one-off endpoints (e.g. migrations).
"""
from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth
from app.services.migration import backfill_pipeline_stages

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@admin_bp.post("/backfill-stages")
@require_firebase_auth
def backfill_stages():
    """
    Backfill pipelineStage and emailSentAt for a user's contacts.
    Body: { "uid": "<firebase_uid>" } (optional; defaults to authenticated user).
    """
    body = request.get_json(silent=True) or {}
    uid = body.get("uid") or request.firebase_user.get("uid")
    if not uid:
        return jsonify({"error": "uid required"}), 400
    # Optional: restrict to self only for security
    if uid != request.firebase_user.get("uid"):
        return jsonify({"error": "Can only backfill your own contacts"}), 403
    result = backfill_pipeline_stages(uid)
    return jsonify(result), 200
