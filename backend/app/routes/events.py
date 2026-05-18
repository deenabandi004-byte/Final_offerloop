"""
Event logging route — POST /api/events/batch

Accepts a batch of frontend events, validates per-event, and writes
through events_service. Per-event errors don't drop the batch.
"""

from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth
from app.services.events_service import log_event_batch

events_bp = Blueprint("events", __name__, url_prefix="/api/events")

MAX_BATCH_SIZE = 50


@events_bp.post("/batch")
@require_firebase_auth
def batch_log_events():
    """
    Log a batch of frontend events.

    Body: { "events": [ { "type": "email_edited", "payload": {...}, "idempotencyKey": "uuid" }, ... ] }
    Returns: { "accepted": int, "rejected": int, "errors": [...] }
    """
    uid = request.firebase_user.get("uid")
    if not uid:
        return jsonify({"error": "uid required"}), 401

    body = request.get_json(silent=True) or {}
    events = body.get("events")

    if not events or not isinstance(events, list):
        return jsonify({"error": "events array required"}), 400

    if len(events) > MAX_BATCH_SIZE:
        return jsonify({"error": f"Max {MAX_BATCH_SIZE} events per batch"}), 400

    result = log_event_batch(uid=uid, events=events, source="frontend")
    return jsonify(result), 200
