"""
Auth handoff: app -> web checkout signed-in flow.

Two endpoints support the v1.1 "upgrade on the web" flow (spec approved
2026-07-16 by Rylan + cofounders):

    POST /api/mobile/web-handoff   (auth-gated)
        App calls with Firebase ID token. Mints a one-time opaque code,
        stores {uid, expires_at, used} in handoffCodes/{code}, returns
        the checkout URL that embeds the code.

    POST /api/web/handoff-exchange (unauthenticated, rate-limited)
        Web /checkout page calls with the code. Atomic Firestore
        transaction validates + burns the code, then returns a Firebase
        custom token that the web signs in with via signInWithCustomToken.

Security (spec section 3):
    - Code is opaque ~192 bits (secrets.token_urlsafe(24)).
    - 60-second TTL, single-use (marked `used` on first exchange).
    - Custom token never in URL; only returned from server-side exchange.
    - Exchange endpoint rate-limited (20/min per IP) - code-guessing defense.

ONE-TIME FIRESTORE SETUP (not shipped by this file):
    Enable TTL policy in Firebase console on:
        collection: handoffCodes
        timestamp field: expires_at
    Auto-deletes expired codes ~24h after expiry. Without this the
    collection grows unbounded, though rows are small (~1KB each).
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from firebase_admin import auth as fb_auth
from firebase_admin import firestore
from flask import Blueprint, jsonify, request
from flask_limiter.util import get_remote_address

from app.extensions import get_db, get_limiter, require_firebase_auth

logger = logging.getLogger(__name__)

mobile_handoff_bp = Blueprint("mobile_handoff", __name__, url_prefix="/api/mobile")
web_handoff_bp = Blueprint("web_handoff", __name__, url_prefix="/api/web")

HANDOFF_COLLECTION = "handoffCodes"
CODE_TTL_SECONDS = 60
CHECKOUT_BASE_URL = "https://www.offerloop.ai/checkout"
EXCHANGE_RATE_LIMIT = "20 per minute"


def _check_exchange_rate_limit(ip: str) -> bool:
    """Per-IP cap on the exchange endpoint. Guards against code-guessing.

    Fail-open on storage errors so a Firestore outage does not block real
    users. Follows the pattern from job_board._check_user_rate_limit.
    """
    try:
        lim = get_limiter()
        if not lim or not getattr(lim, "_storage", None):
            return True
        from limits import parse
        from limits.strategies import FixedWindowRateLimiter
        item = parse(EXCHANGE_RATE_LIMIT)
        strategy = FixedWindowRateLimiter(lim._storage)
        return strategy.hit(item, "handoff-exchange", ip or "anon")
    except Exception as e:
        logger.error(f"[Handoff] rate-limit check failed: {e}")
        return True


@mobile_handoff_bp.route("/web-handoff", methods=["POST"])
@require_firebase_auth
def mint_handoff():
    """Mint a one-time handoff code for the signed-in mobile user."""
    uid = request.firebase_user.get("uid")
    if not uid:
        return jsonify({"error": "uid missing from token"}), 401

    body = request.get_json(silent=True) or {}
    plan = str(body.get("plan") or "").strip()[:32]  # bounded so nothing weird lands in the URL

    code = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=CODE_TTL_SECONDS)

    db = get_db()
    db.collection(HANDOFF_COLLECTION).document(code).set({
        "uid": uid,
        "created_at": now,
        "expires_at": expires_at,
        "used": False,
    })

    url = f"{CHECKOUT_BASE_URL}?code={quote(code, safe='')}"
    if plan:
        url += f"&plan={quote(plan, safe='')}"

    logger.info(f"[Handoff] minted code for uid={uid} plan={plan or '-'}")
    return jsonify({"url": url, "expires_in": CODE_TTL_SECONDS}), 200


@web_handoff_bp.route("/handoff-exchange", methods=["POST"])
def exchange_handoff():
    """Burn a handoff code and return a Firebase custom token for the web."""
    ip = get_remote_address()
    if not _check_exchange_rate_limit(ip):
        return jsonify({"error": "rate limit exceeded"}), 429

    body = request.get_json(silent=True) or {}
    code = str(body.get("code") or "").strip()
    if not code or len(code) > 128:
        return jsonify({"error": "code required"}), 400

    db = get_db()
    ref = db.collection(HANDOFF_COLLECTION).document(code)
    now = datetime.now(timezone.utc)
    transaction = db.transaction()

    @firestore.transactional
    def _burn(tx):
        snap = ref.get(transaction=tx)
        if not snap.exists:
            return None, ("invalid code", 400)
        data = snap.to_dict() or {}
        if data.get("used"):
            return None, ("already used", 400)
        expires_at = data.get("expires_at")
        if expires_at and now > expires_at:
            return None, ("expired", 400)
        uid = data.get("uid")
        if not uid:
            return None, ("invalid code", 400)
        tx.update(ref, {"used": True, "used_at": now})
        return uid, None

    try:
        uid, err = _burn(transaction)
    except Exception as e:
        logger.exception(f"[Handoff] transaction failed: {e}")
        return jsonify({"error": "exchange failed"}), 500

    if err:
        msg, status = err
        logger.info(f"[Handoff] exchange rejected ({msg}) ip={ip}")
        return jsonify({"error": msg}), status

    try:
        custom_token = fb_auth.create_custom_token(uid)
    except Exception as e:
        logger.exception(f"[Handoff] custom token mint failed for uid={uid}: {e}")
        return jsonify({"error": "token mint failed"}), 500

    token_str = custom_token.decode("utf-8") if isinstance(custom_token, bytes) else custom_token
    logger.info(f"[Handoff] exchanged code for uid={uid}")
    return jsonify({"token": token_str}), 200
