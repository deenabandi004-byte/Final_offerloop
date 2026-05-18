"""
Company contexts routes — "why this company?" floating prompt backend.

GET  /api/company-context/should-prompt?company=Goldman+Sachs
GET  /api/company-context?company=Goldman+Sachs
POST /api/company-context
"""

from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth
from app.services.company_contexts_service import (
    get_company_context,
    save_company_context,
    should_show_prompt,
)

company_contexts_bp = Blueprint(
    "company_contexts", __name__, url_prefix="/api/company-context"
)


@company_contexts_bp.get("/should-prompt")
@require_firebase_auth
def check_should_prompt():
    """
    Check whether to show the floating prompt for a company.
    Query: ?company=Goldman+Sachs
    """
    uid = request.firebase_user.get("uid")
    company = request.args.get("company", "").strip()
    if not company:
        return jsonify({"error": "company query param required"}), 400

    result = should_show_prompt(uid, company)
    return jsonify(result), 200


@company_contexts_bp.get("")
@require_firebase_auth
def get_context():
    """
    Get saved company context.
    Query: ?company=Goldman+Sachs
    """
    uid = request.firebase_user.get("uid")
    company = request.args.get("company", "").strip()
    if not company:
        return jsonify({"error": "company query param required"}), 400

    ctx = get_company_context(uid, company)
    if ctx is None:
        return jsonify({"found": False}), 200
    return jsonify({"found": True, **ctx}), 200


@company_contexts_bp.post("")
@require_firebase_auth
def save_context():
    """
    Save a company context answer.
    Body: { "company": "Goldman Sachs", "answer": "Strong analyst program...", "source": "floating_prompt" }
    """
    uid = request.firebase_user.get("uid")
    data = request.get_json(silent=True) or {}

    company = (data.get("company") or "").strip()
    answer = (data.get("answer") or "").strip()
    source = data.get("source", "floating_prompt")

    if not company:
        return jsonify({"error": "company is required"}), 400
    if not answer:
        return jsonify({"error": "answer is required"}), 400
    if len(answer) > 2000:
        return jsonify({"error": "answer too long (max 2000 chars)"}), 400

    slug = save_company_context(uid, company, answer, source=source)

    # Log event
    try:
        from app.services.events_service import log_event
        log_event(uid, "prompt_answered", {
            "promptType": "floating_prompt",
            "companyId": slug,
            "source": source,
        })
    except Exception:
        pass

    return jsonify({"ok": True, "companyNormalized": slug}), 200
