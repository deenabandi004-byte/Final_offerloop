"""
Prompt-first search route.

This endpoint is ONLY used by the prompt-first search flow and is isolated from
existing contact search logic.
"""
import logging
from flask import Blueprint, request, jsonify

from app.extensions import require_firebase_auth, require_tier, get_db
from app.config import PROMPT_SEARCH_ENABLED, TIER_CONFIGS
from app.services.prompt_pdl_search import run_prompt_search
from app.services.auth import check_and_reset_credits
from firebase_admin import firestore

prompt_search_bp = Blueprint("prompt_search", __name__, url_prefix="/api/search")
logger = logging.getLogger(__name__)


@prompt_search_bp.route("/prompt-run", methods=["POST"])
@require_firebase_auth
@require_tier(['elite'])
def prompt_run():
    """
    Execute prompt-first search with progressive relaxation and post-filtered alumni.
    Expects already-parsed filters from the frontend.
    """
    if not PROMPT_SEARCH_ENABLED:
        return jsonify({"error": "Prompt search is not enabled"}), 403

    data = request.get_json(silent=True) or {}
    filters = data.get("filters") or data

    # Basic validation
    if not isinstance(filters, dict):
        return jsonify({"error": "Invalid filters"}), 400

    # Get user info for credit checking
    user_id = None
    if hasattr(request, 'firebase_user'):
        user_id = request.firebase_user.get('uid')
    
    db = get_db()
    
    # Check user credits before search
    credits_available = TIER_CONFIGS['free']['credits']  # Default to free tier
    if db and user_id:
        try:
            user_ref = db.collection('users').document(user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                credits_available = check_and_reset_credits(user_ref, user_data)
        except Exception as e:
            logger.warning(f"Failed to check credits: {e}")
    
    # Check if user has enough credits (15 credits minimum)
    if credits_available < 15:
        return jsonify({
            'error': 'Insufficient credits',
            'credits_needed': 15,
            'current_credits': credits_available,
            'message': f'You need at least 15 credits to perform a search. You currently have {credits_available} credits.'
        }), 400

    result = run_prompt_search(filters)

    if result.get("error"):
        return jsonify({"error": result["error"]}), 500

    # Deduct credits (15 credits per contact)
    contacts = result.get('contacts', [])
    credits_charged = 15 * len(contacts)
    remaining_credits = credits_available
    if db and user_id and contacts:
        try:
            user_ref = db.collection('users').document(user_id)
            user_ref.update({
                'credits': firestore.Increment(-credits_charged)
            })
            remaining_credits = credits_available - credits_charged
            logger.info(f"✅ Deducted {credits_charged} credits ({len(contacts)} contacts × 15). Remaining: {remaining_credits}")
        except Exception as e:
            logger.error(f"❌ Failed to deduct credits: {e}")
    
    # Add credit information to response
    result['credits_charged'] = credits_charged
    result['remaining_credits'] = remaining_credits

    return jsonify(result), 200


