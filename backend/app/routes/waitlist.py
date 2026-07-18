"""Public app-waitlist capture.

Mounted at /api/waitlist. No auth. Records people who want to be notified
when the Offerloop iOS app launches. Single Firestore collection:

    * app_waitlist — doc id = lowercased email -> {email, source, created_at, ...}

Using the email as the doc id makes signups idempotent: re-submitting the
same address updates the existing doc instead of creating duplicates, so
the collection is a clean list to email at launch.

Endpoints:
    GET  /api/waitlist/health   liveness
    POST /api/waitlist/join     email -> Firestore waitlist doc
"""
from __future__ import annotations

import logging
import re

from firebase_admin import firestore
from flask import Blueprint, jsonify, request

from app.extensions import get_db

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

logger = logging.getLogger(__name__)

waitlist_bp = Blueprint("waitlist", __name__, url_prefix="/api/waitlist")

_COLLECTION = "app_waitlist"


def _client_ip() -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _is_valid_email(email: str) -> bool:
    if not email or len(email) > 254:
        return False
    return bool(EMAIL_RE.match(email))


@waitlist_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "waitlist"})


@waitlist_bp.route("/join", methods=["POST"])
def join():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    source = (payload.get("source") or "app-store").strip()[:64]

    if not _is_valid_email(email):
        return jsonify({"success": False, "error": "Please enter a valid email address."}), 400

    db = get_db()
    if db is None:
        logger.error("Waitlist join failed: Firestore unavailable")
        return jsonify({"success": False, "error": "Something went wrong. Please try again."}), 503

    try:
        doc_ref = db.collection(_COLLECTION).document(email)
        existing = doc_ref.get()
        already = existing.exists
        # merge=True so a repeat signup keeps the original created_at.
        doc_ref.set(
            {
                "email": email,
                "source": source,
                "ip": _client_ip(),
                "user_agent": request.headers.get("User-Agent", "")[:400],
                "updated_at": firestore.SERVER_TIMESTAMP,
                "created_at": existing.to_dict().get("created_at") if already else firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception:
        logger.exception("Waitlist join write failed for %s", email)
        return jsonify({"success": False, "error": "Something went wrong. Please try again."}), 500

    logger.info("Waitlist signup: %s (source=%s, already=%s)", email, source, already)
    return jsonify({"success": True, "already_joined": already})
