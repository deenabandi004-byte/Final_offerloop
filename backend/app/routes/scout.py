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


@scout_bp.route("/analyze-job", methods=["POST"])
def analyze_job():
    """
    Analyze how well the user fits a specific job.
    
    Request body:
    {
        "job": {
            "title": "...",
            "company": "...",
            "location": "...",
            "url": "...",
            "snippet": "..."
        },
        "user_resume": { ... }
    }
    
    Response:
    {
        "status": "ok",
        "analysis": {
            "score": 45,
            "match_level": "stretch",
            "strengths": [...],
            "gaps": [...],
            "pitch": "...",
            "talking_points": [...],
            "keywords_to_use": [...]
        }
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    job = payload.get("job", {})
    user_resume = payload.get("user_resume")
    
    if not job or not user_resume:
        return jsonify({
            "status": "error",
            "message": "Missing job or resume data"
        }), 400
    
    try:
        result = asyncio.run(
            scout_service.analyze_job_fit(
                job=job,
                user_resume=user_resume,
            )
        )
        return jsonify(result)
    except Exception as exc:
        print(f"[Scout] Analyze job failed: {type(exc).__name__}: {exc}")
        import traceback
        print(f"[Scout] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": "Failed to analyze job fit"
        }), 500


@scout_bp.route("/firm-assist", methods=["POST"])
def scout_firm_assist():
    """
    Scout assistant for Firm Search page.
    Helps users refine searches, get recommendations, and research firms.
    
    Request body:
    {
        "message": "user's request",
        "firm_context": {
            "current_query": "investment banks in NYC...",
            "current_results": [
                { "name": "Goldman Sachs", "industry": "...", "location": {...} },
                ...
            ],
            "parsed_filters": {
                "industry": "investment banking",
                "location": "New York",
                "focus": "healthcare"
            }
        },
        "user_resume": { ... },
        "fit_context": { ... },  // Optional - if user came from job analysis
        "conversation_history": [ ... ]
    }
    
    Response:
    {
        "status": "ok",
        "message": "Scout's response",
        "suggestions": {
            "refined_query": "...",  // If query was refined
            "recommended_firms": ["...", "..."],  // Firm recommendations
            "firm_insights": { ... },  // Research about a specific firm
            "next_steps": ["...", "..."]  // Suggested actions
        },
        "action_type": "refine_query" | "recommend_firms" | "research_firm" | "next_steps" | "general"
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    message = payload.get("message", "")
    firm_context = payload.get("firm_context", {})
    user_resume = payload.get("user_resume")
    fit_context = payload.get("fit_context")
    conversation_history = payload.get("conversation_history", [])
    
    try:
        result = asyncio.run(
            scout_service.handle_firm_assist(
                message=message,
                firm_context=firm_context,
                user_resume=user_resume,
                fit_context=fit_context,
                conversation_history=conversation_history,
            )
        )
        return jsonify(result)
    except Exception as exc:
        print(f"[Scout] Firm assist failed: {type(exc).__name__}: {exc}")
        import traceback
        print(f"[Scout] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": "Scout ran into an issue. Please try again!",
        }), 500


@scout_bp.route("/health", methods=["GET"])
def scout_health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "scout"})
