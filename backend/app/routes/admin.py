"""
Admin / one-off endpoints (e.g. migrations).
"""
import os
import time
from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth, get_db
from app.services.migration import backfill_pipeline_stages, deduplicate_contacts
from app.services.background_sync import sync_stale_threads
from app.services.gmail_client import renew_gmail_watch
from app.services.email_baseline import compute_email_baseline
from app.services import feature_flags

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

# In production, call POST /api/admin/renew-watches from a cron job every 12 hours
# with header X-Cron-Secret matching CRON_SECRET env var.


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
    result = sync_stale_threads(uid, max_threads=max_threads)
    return jsonify(result), 200


def _is_cron_authorized():
    """Check if the request has a valid cron secret for headless access."""
    import hmac
    cron_secret = os.getenv("CRON_SECRET")
    if not cron_secret or len(cron_secret) < 20:
        # Reject trivially short/guessable secrets in production
        if os.getenv("RENDER") or os.getenv("FLASK_ENV") == "production":
            print("[SECURITY] CRON_SECRET is missing or too short (<20 chars). Rejecting cron auth.")
            return False
        if not cron_secret:
            return False
    provided = (request.headers.get("X-Cron-Secret") or "").strip()
    return hmac.compare_digest(provided, cron_secret)


@admin_bp.post("/renew-watches")
def renew_watches():
    """
    Renew Gmail push watches for all users whose watch expires within 24h or who have
    Gmail connected but no watch. Call periodically (e.g. cron every 12h).

    Auth: accepts either Firebase auth (Bearer token) or X-Cron-Secret header.
    Returns: { "renewed": N, "failed": N, "errors": [ { "uid": "...", "error": "..." }, ... ] }
    """
    # Allow either Firebase auth or cron secret
    if not _is_cron_authorized():
        # Fall back to Firebase auth check
        from firebase_admin import auth as fb_auth
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Unauthorized — provide Firebase auth or X-Cron-Secret"}), 401
        token = auth_header.split("Bearer ", 1)[1]
        try:
            fb_auth.verify_id_token(token, clock_skew_seconds=5)
        except Exception:
            return jsonify({"error": "Invalid token"}), 401

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


@admin_bp.route("/compute-email-baseline", methods=["POST"])
def compute_baseline():
    """
    Aggregate reply data across all users with Gmail integration and store
    the baseline in Firestore at analytics/email_baseline.

    Auth: Firebase Bearer token or X-Cron-Secret header.
    """
    if not _is_cron_authorized():
        from firebase_admin import auth as fb_auth
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Unauthorized — provide Firebase auth or X-Cron-Secret"}), 401
        token = auth_header.split("Bearer ", 1)[1]
        try:
            fb_auth.verify_id_token(token, clock_skew_seconds=5)
        except Exception:
            return jsonify({"error": "Invalid token"}), 401

    try:
        baseline = compute_email_baseline()
    except Exception as e:
        return jsonify({"error": "Baseline computation failed", "message": str(e)}), 500

    return jsonify(baseline), 200


# ---------------------------------------------------------------------------
# Feature flags management
# ---------------------------------------------------------------------------

def _require_admin():
    """Check if the request is from an admin user. Returns (uid, error_response)."""
    admin_uids = [u.strip() for u in os.getenv("ADMIN_UIDS", "").split(",") if u.strip()]
    if not admin_uids:
        return None, (jsonify({"error": "ADMIN_UIDS not configured"}), 500)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, (jsonify({"error": "Unauthorized"}), 401)

    from firebase_admin import auth as fb_auth
    token = auth_header.split("Bearer ", 1)[1]
    try:
        decoded = fb_auth.verify_id_token(token, clock_skew_seconds=5)
    except Exception:
        return None, (jsonify({"error": "Invalid token"}), 401)

    uid = decoded.get("uid")
    if uid not in admin_uids:
        return None, (jsonify({"error": "Forbidden"}), 403)

    return uid, None


@admin_bp.get("/feature-flags")
def list_feature_flags():
    """List all feature flags (admin only)."""
    _, err = _require_admin()
    if err:
        return err
    return jsonify({"flags": feature_flags.get_all_flags()}), 200


@admin_bp.post("/feature-flags")
def update_feature_flag():
    """
    Update a feature flag.
    Body: { "flag": "FLAG_NAME", "enabled": bool?, "rollout_pct": int? }
    """
    _, err = _require_admin()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    flag_name = data.get("flag")
    if not flag_name:
        return jsonify({"error": "flag is required"}), 400
    feature_flags.set_flag(
        flag_name,
        enabled=data.get("enabled"),
        rollout_pct=data.get("rollout_pct"),
    )
    return jsonify({"ok": True, "flag": flag_name}), 200


@admin_bp.post("/feature-flags/override")
def set_feature_flag_override():
    """
    Set or remove a per-uid override.
    Body: { "flag": "FLAG_NAME", "uid": "...", "value": true/false/null }
    value=null removes the override.
    """
    _, err = _require_admin()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    flag_name = data.get("flag")
    uid = data.get("uid")
    if not flag_name or not uid:
        return jsonify({"error": "flag and uid are required"}), 400

    value = data.get("value")
    if value is None:
        feature_flags.remove_user_override(flag_name, uid)
    else:
        feature_flags.set_user_override(flag_name, uid, bool(value))

    return jsonify({"ok": True, "flag": flag_name, "uid": uid}), 200


@admin_bp.get("/pipeline-health")
def pipeline_health():
    """
    Return health of the job-board ingest pipeline.

    Response:
      {
        "last_run_at": "<ISO timestamp or null>",
        "minutes_since_last_run": <int or null>,
        "stale": <bool>,                # true if no successful run in >6h
        "recent_runs": [ { run_id, mode, started_at, ended_at, ok, written,
                           skipped_duplicates, total, source_breakdown, error }, ... ]
      }
    """
    _, err = _require_admin()
    if err:
        return err

    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": "Database not initialized", "message": str(e)}), 500

    from google.cloud.firestore_v1.base_query import FieldFilter  # local import

    runs_query = (
        db.collection("pipeline_runs")
        .order_by("started_at", direction="DESCENDING")
        .limit(10)
    )
    recent_runs = []
    last_ok_at = None
    for doc in runs_query.stream():
        data = doc.to_dict() or {}
        def _iso(dt):
            try:
                return dt.isoformat() if dt else None
            except AttributeError:
                return str(dt) if dt else None
        run = {
            "run_id": data.get("run_id") or doc.id,
            "mode": data.get("mode"),
            "started_at": _iso(data.get("started_at")),
            "ended_at": _iso(data.get("ended_at")),
            "duration_seconds": data.get("duration_seconds"),
            "ok": data.get("ok", data.get("error") is None),
            "written": data.get("written", 0),
            "skipped_duplicates": data.get("skipped_duplicates", 0),
            "total": data.get("total", 0),
            "source_breakdown": data.get("source_breakdown") or {},
            "deleted": data.get("deleted", 0),
            "error": data.get("error"),
        }
        recent_runs.append(run)
        if last_ok_at is None and run["ok"] and run["mode"] in ("full", "fantastic-only", "skip-fantastic"):
            started = data.get("started_at")
            if started:
                last_ok_at = started

    minutes_since = None
    stale = True
    last_run_iso = None
    if last_ok_at is not None:
        try:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            delta = now - last_ok_at
            minutes_since = int(delta.total_seconds() // 60)
            stale = minutes_since > 360  # 6h
            last_run_iso = last_ok_at.isoformat()
        except Exception:
            pass

    # PDL Title Enrichment credit usage — fixed 50k pool, not per-month.
    # We watch this graph carefully: if `used` jumps unexpectedly, the cache
    # is leaking or the slug function regressed. See pdl_title_cache.py.
    pdl_block = {
        "credits_used": 0,
        "credits_remaining": 0,
        "budget": 0,
        "breaker_at": 0,
        "last_call_at": None,
        "alert_level": "ok",  # ok | warn (>5k) | high (>25k) | red (>40k)
    }
    try:
        from app.services.pdl_title_cache import (
            PDL_TOTAL_BUDGET, TOTAL_BUDGET_CIRCUIT_BREAKER, USAGE_DOC_PATH,
        )
        usage_doc = db.collection(USAGE_DOC_PATH[0]).document(USAGE_DOC_PATH[1]).get()
        used = 0
        last_call = None
        if usage_doc.exists:
            udata = usage_doc.to_dict() or {}
            used = int(udata.get("credits_used", 0))
            try:
                last_call = udata.get("last_call_at")
                last_call = last_call.isoformat() if last_call else None
            except AttributeError:
                last_call = str(udata.get("last_call_at"))

        alert = "ok"
        if used > 40_000:
            alert = "red"
        elif used > 25_000:
            alert = "high"
        elif used > 5_000:
            alert = "warn"

        pdl_block = {
            "credits_used": used,
            "credits_remaining": max(0, PDL_TOTAL_BUDGET - used),
            "budget": PDL_TOTAL_BUDGET,
            "breaker_at": TOTAL_BUDGET_CIRCUIT_BREAKER,
            "last_call_at": last_call,
            "alert_level": alert,
        }
    except Exception as e:
        pdl_block["error"] = f"{type(e).__name__}: {e}"

    return jsonify({
        "last_run_at": last_run_iso,
        "minutes_since_last_run": minutes_since,
        "stale": stale,
        "recent_runs": recent_runs,
        "pdl_title_enrich": pdl_block,
    }), 200


@admin_bp.post("/client-error")
def report_client_error():
    """
    Receive frontend error reports from ErrorBoundary.
    No auth required — error reporting must work even when auth is broken.
    Rate-limited by IP to prevent abuse.
    """
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "unknown")[:500]
    stack = (data.get("stack") or "")[:4000]
    component_stack = (data.get("componentStack") or "")[:2000]
    url = (data.get("url") or "")[:500]
    user_agent = (data.get("userAgent") or "")[:300]
    timestamp = data.get("timestamp", "")

    # Log to stdout (picked up by Cloud Logging / Sentry)
    print(f"[ClientError] {message} | url={url} | ts={timestamp}")
    if stack:
        print(f"[ClientError] Stack: {stack[:500]}")

    # Also forward to Sentry if configured
    try:
        import sentry_sdk
        if sentry_sdk.is_initialized():
            sentry_sdk.capture_message(
                f"Frontend error: {message}",
                level="error",
                extras={
                    "stack": stack,
                    "componentStack": component_stack,
                    "url": url,
                    "userAgent": user_agent,
                },
            )
    except Exception:
        pass

    return jsonify({"ok": True}), 200
