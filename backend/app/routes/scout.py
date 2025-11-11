"""
Scout API endpoints - exposes conversational job title lookups.
"""
from __future__ import annotations

import asyncio

from flask import Blueprint, jsonify, request

from app.services.scout_service import scout_service

def handle_unexpected(e):
    try:
        current_app.logger.exception("Unhandled error", exc_info=e)
    except Exception:
        pass  # logging should never block a 500

    return jsonify({"status": "error", "message": "internal server error"}), 500

scout_bp = Blueprint("scout", __name__, url_prefix="/api/scout")


@scout_bp.route("/chat", methods=["POST"])  # ← REMOVED OPTIONS - Flask-CORS handles it
def scout_chat():
    """
    Accepts a chat message (and optional structured hints) and returns a Scout response.
    """
    payload = request.get_json(force=True, silent=True) or {}
    message = payload.get("message", "")
    company = payload.get("company")
    role_description = payload.get("role")
    experience_level = payload.get("level")
    context = payload.get("context") or {}

    try:
        result = asyncio.run(
            scout_service.handle_chat(
                message=message,
                company=company,
                role_description=role_description,
                experience_level=experience_level,
                context=context,
            )
        )
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[Scout] Chat endpoint failed: {exc}")
        return jsonify({"error": "Scout is currently unavailable. Please try again later."}), 500