"""
Parse prompt route - experimental prompt-first contact search
"""
import json
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify
from app.extensions import require_firebase_auth, get_db
from app.services.prompt_parser import parse_search_prompt
from app.config import PROMPT_SEARCH_ENABLED
from firebase_admin import firestore

parse_prompt_bp = Blueprint('parse_prompt', __name__, url_prefix='/api/search')

# Set up logging
logger = logging.getLogger(__name__)


@parse_prompt_bp.route('/parse-prompt', methods=['POST'])
@require_firebase_auth
def parse_prompt():
    """
    Parse a natural language prompt into structured search filters.
    
    This endpoint does NOT deduct credits - it's a free operation.
    Credits are only deducted when actual contact data is revealed.
    
    Request body:
    {
        "prompt": "Find USC alumni in investment banking at Goldman Sachs in New York"
    }
    
    Response:
    {
        "company": ["Goldman Sachs"],
        "roles": ["Investment Banking Analyst"],
        "location": ["New York"],
        "schools": ["University of Southern California"],
        "industries": [],
        "max_results": 15,
        "confidence": 0.87
    }
    """
    # Check feature flag
    if not PROMPT_SEARCH_ENABLED:
        return jsonify({
            "error": "Prompt search is not enabled",
            "enabled": False
        }), 403
    
    try:
        user_id = None
        user_email = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
            user_email = request.firebase_user.get('email')
        
        # Get request data
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
        
        data = request.get_json(silent=True) or {}
        prompt = data.get('prompt', '').strip()
        
        if not prompt:
            return jsonify({"error": "Prompt is required"}), 400
        
        # Parse the prompt
        parsed_filters = parse_search_prompt(prompt)
        
        # Log the prompt → filter mapping for evaluation
        logger.info(f"Prompt parsed - User: {user_email}, Prompt: {prompt[:100]}..., Filters: {parsed_filters}")
        
        # Optionally save to Firestore for evaluation (non-blocking)
        if user_id:
            try:
                db = get_db()
                if db:
                    # Save to a collection for evaluation/analytics
                    db.collection('prompt_parses').add({
                        "userId": user_id,
                        "userEmail": user_email,
                        "prompt": prompt,
                        "extractedFilters": parsed_filters,
                        "createdAt": firestore.SERVER_TIMESTAMP
                    })
            except Exception as e:
                # Don't fail the request if logging fails
                logger.warning(f"Failed to log prompt parse to Firestore: {e}")
        
        return jsonify(parsed_filters), 200
        
    except Exception as e:
        logger.error(f"Error parsing prompt: {e}", exc_info=True)
        return jsonify({
            "error": "Failed to parse prompt",
            "message": str(e)
        }), 500

