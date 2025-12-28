"""
Scout Assistant API endpoints - Product assistant for helping users navigate Offerloop.

This is a FREE feature - no credits are charged for using Scout assistant.
"""
from __future__ import annotations

import asyncio
from flask import Blueprint, jsonify, request, g

from app.services.scout_assistant_service import scout_assistant_service
from app.extensions import require_firebase_auth

scout_assistant_bp = Blueprint("scout_assistant", __name__, url_prefix="/api/scout-assistant")


@scout_assistant_bp.route("/chat", methods=["POST", "OPTIONS"])
@require_firebase_auth
def scout_assistant_chat():
    """
    Main Scout assistant chat endpoint.
    
    NO CREDIT COST - This is a helper feature.
    
    Request body:
    {
        "message": "user's question",
        "conversation_history": [
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": "..."}
        ],
        "current_page": "/contact-search",
        "user_info": {
            "name": "John",
            "tier": "free",
            "credits": 150,
            "max_credits": 300
        }
    }
    
    Response:
    {
        "message": "Scout's response text",
        "navigate_to": "/contact-search" or null,
        "action_buttons": [
            {"label": "Go to Contact Search", "route": "/contact-search"}
        ]
    }
    """
    # Handle OPTIONS preflight
    if request.method == "OPTIONS":
        return jsonify({}), 200
    
    payload = request.get_json(force=True, silent=True) or {}
    
    # Extract request data
    message = payload.get("message", "")
    conversation_history = payload.get("conversation_history", [])
    current_page = payload.get("current_page", "/home")
    user_info = payload.get("user_info", {})
    
    # Get user info from Firebase auth or request
    user_name = user_info.get("name", "there")
    tier = user_info.get("tier", "free")
    credits = user_info.get("credits", 0)
    max_credits = user_info.get("max_credits", 300)
    
    # Try to get user info from Firebase context if available
    if hasattr(g, "firebase_user"):
        firebase_user = g.firebase_user
        if not user_name or user_name == "there":
            user_name = firebase_user.get("name", firebase_user.get("email", "").split("@")[0])
    
    try:
        result = asyncio.run(
            scout_assistant_service.handle_chat(
                message=message,
                conversation_history=conversation_history,
                current_page=current_page,
                user_name=user_name,
                tier=tier,
                credits=credits,
                max_credits=max_credits,
            )
        )
        return jsonify(result)
    except Exception as exc:
        print(f"[ScoutAssistant] Chat endpoint failed: {type(exc).__name__}: {exc}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "message": "I ran into an issue, but I'm here to help! What would you like to know about Offerloop?",
            "navigate_to": None,
            "action_buttons": [],
        }), 200  # Return 200 even on error to not break the chat


@scout_assistant_bp.route("/search-help", methods=["POST", "OPTIONS"])
@require_firebase_auth
def scout_search_help():
    """
    Scout assistant endpoint for failed search help.
    
    NO CREDIT COST - This is a helper feature.
    
    Request body:
    {
        "search_type": "contact" or "firm",
        "failed_search_params": {
            "job_title": "...",  // for contact search
            "company": "...",
            "location": "...",
            // OR for firm search:
            "industry": "...",
            "location": "...",
            "size": "..."
        },
        "error_type": "no_results" or "error",
        "user_info": {
            "name": "John"
        }
    }
    
    Response:
    {
        "message": "Scout's helpful message",
        "suggestions": ["Alternative 1", "Alternative 2", ...],
        "auto_populate": {
            "job_title": "...",  // for contact
            "company": "...",
            "location": "..."
            // OR for firm:
            "industry": "...",
            "location": "...",
            "size": "..."
        },
        "search_type": "contact" or "firm",
        "action": "retry_search"
    }
    """
    # Handle OPTIONS preflight
    if request.method == "OPTIONS":
        return jsonify({}), 200
    
    payload = request.get_json(force=True, silent=True) or {}
    
    # Extract request data
    search_type = payload.get("search_type", "contact")
    failed_search_params = payload.get("failed_search_params", {})
    error_type = payload.get("error_type", "no_results")
    user_info = payload.get("user_info", {})
    
    # Get user name
    user_name = user_info.get("name", "there")
    
    # Try to get user info from Firebase context if available
    if hasattr(g, "firebase_user"):
        firebase_user = g.firebase_user
        if not user_name or user_name == "there":
            user_name = firebase_user.get("name", firebase_user.get("email", "").split("@")[0])
    
    try:
        result = asyncio.run(
            scout_assistant_service.handle_search_help(
                search_type=search_type,
                failed_search_params=failed_search_params,
                error_type=error_type,
                user_name=user_name,
            )
        )
        return jsonify(result)
    except Exception as exc:
        print(f"[ScoutAssistant] Search help endpoint failed: {type(exc).__name__}: {exc}")
        import traceback
        traceback.print_exc()
        
        # Return a basic fallback response
        if search_type == "contact":
            return jsonify({
                "message": "I couldn't find contacts matching your search. Try using different job titles or a broader location.",
                "suggestions": [],
                "auto_populate": failed_search_params,
                "search_type": "contact",
                "action": "retry_search",
            }), 200
        else:
            return jsonify({
                "message": "I couldn't find firms matching your search. Try using different industry terms or a broader location.",
                "suggestions": [],
                "auto_populate": failed_search_params,
                "search_type": "firm",
                "action": "retry_search",
            }), 200


@scout_assistant_bp.route("/health", methods=["GET"])
def scout_assistant_health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "scout-assistant"})

