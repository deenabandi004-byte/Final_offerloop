"""
Admin / one-off endpoints (e.g. migrations).
"""
import time
from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth, get_db
from app.services.migration import backfill_pipeline_stages, deduplicate_contacts
from app.services.background_sync import sync_stale_threads
from app.services.gmail_client import renew_gmail_watch

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

# TODO: In production, call POST /api/admin/renew-watches from a cron job every 12 hours
# so Gmail push watch expirations are renewed before they lapse.


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


@admin_bp.post("/deduplicate-contacts")
@require_firebase_auth
def deduplicate_contacts_route():
    """
    Merge duplicate contacts (same email) for a user. Body: { "uid": "<firebase_uid>" } (optional).
    """
    body = request.get_json(silent=True) or {}
    uid = body.get("uid") or request.firebase_user.get("uid")
    if not uid:
        return jsonify({"error": "uid required"}), 400
    if uid != request.firebase_user.get("uid"):
        return jsonify({"error": "Can only deduplicate your own contacts"}), 403
    result = deduplicate_contacts(uid)
    return jsonify(result), 200


@admin_bp.post("/sync-stale")
@require_firebase_auth
def sync_stale():
    """
    Manually trigger background sync of stale outbox threads.
    Body (optional): { "uid": "<uid>", "max_threads": 10 }. uid must match authenticated user.
    """
    body = request.get_json(silent=True) or {}
    uid = body.get("uid") or request.firebase_user.get("uid")
    if not uid:
        return jsonify({"error": "uid required"}), 400
    if uid != request.firebase_user.get("uid"):
        return jsonify({"error": "Can only sync your own outbox"}), 403
    max_threads = 10
    if isinstance(body.get("max_threads"), (int, float)):
        max_threads = min(max(1, int(body["max_threads"])), 20)
    user_email = request.firebase_user.get("email") or ""
    result = sync_stale_threads(uid, max_threads=max_threads, user_email=user_email)
    return jsonify(result), 200


@admin_bp.post("/renew-watches")
@require_firebase_auth
def renew_watches():
    """
    Renew Gmail push watches for all users whose watch expires within 24h or who have
    Gmail connected but no watch. Call periodically (e.g. cron every 12h).
    Returns: { "renewed": N, "failed": N, "errors": [ { "uid": "...", "error": "..." }, ... ] }
    """
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": "Database not initialized", "message": str(e)}), 500

    now_ms = int(time.time() * 1000)
    one_day_ms = 86400 * 1000
    renewed = 0
    failed = 0
    errors = []

    for user_doc in db.collection("users").stream():
        uid = user_doc.id
        gmail_ref = db.collection("users").document(uid).collection("integrations").document("gmail")
        gmail_doc = gmail_ref.get()
        if not gmail_doc.exists:
            continue
        data = gmail_doc.to_dict() or {}
        has_creds = bool(data.get("token") or data.get("refresh_token"))
        if not has_creds:
            continue
        watch_exp = data.get("watchExpiration")
        if watch_exp is not None:
            try:
                watch_exp = int(watch_exp)
            except (TypeError, ValueError):
                watch_exp = None
        need_renewal = watch_exp is None or (watch_exp - now_ms) < one_day_ms
        if not need_renewal:
            continue
        try:
            renew_gmail_watch(uid)
            renewed += 1
            print(f"[admin/renew-watches] Renewed watch for uid={uid}")
        except Exception as e:
            failed += 1
            errors.append({"uid": uid, "error": str(e)})
            print(f"[admin/renew-watches] Failed uid={uid}: {e}")

    return jsonify({"renewed": renewed, "failed": failed, "errors": errors}), 200
