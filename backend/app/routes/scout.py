"""
Scout API endpoints - conversational job search assistant.
"""
from __future__ import annotations

import asyncio

from flask import Blueprint, jsonify, request

from app.services.scout_service import scout_service

scout_bp = Blueprint("scout", __name__, url_prefix="/api/scout")


@scout_bp.route("/chat", methods=["POST"])
def scout_chat():
    """
    Main Scout chat endpoint.
    
    Request body:
    {
        "message": "user's message or URL",
        "context": { ... optional session context ... }
    }
    
    Response:
    {
        "status": "ok" | "needs_input" | "error",
        "message": "Scout's response",
        "fields": { "job_title": "...", "company": "...", "location": "..." },
        "job_listings": [ { "title": "...", "company": "...", ... } ],
        "intent": "URL_PARSE" | "JOB_SEARCH" | "FIELD_HELP" | "RESEARCH" | "CONVERSATION",
        "context": { ... updated context for next request ... }
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    message = payload.get("message", "")
    context = payload.get("context") or {}
    
    try:
        result = asyncio.run(
            scout_service.handle_chat(
                message=message,
                context=context,
            )
        )
        return jsonify(result)
    except Exception as exc:
        print(f"[Scout] Chat endpoint failed: {type(exc).__name__}: {exc}")
        import traceback
        print(f"[Scout] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": "Scout is having trouble right now. Please try again!",
            "context": context,
        }), 500


@scout_bp.route("/health", methods=["GET"])
def scout_health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "scout"})
