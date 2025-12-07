"""
Firm Search Routes - Flask Blueprint for company discovery
Endpoints for natural language and structured firm search
WITH CREDIT SYSTEM INTEGRATION
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
import uuid

from app.extensions import get_db, require_firebase_auth
from app.services.company_search import (
    search_firms,
    search_firms_structured,
    get_available_industries,
    get_size_options
)
from app.services.auth import check_and_reset_credits, deduct_credits_atomic
from app.config import TIER_CONFIGS
from app.utils.exceptions import ValidationError, OfferloopException, InsufficientCreditsError, ExternalAPIError
from app.utils.validation import FirmSearchRequest, validate_request
from firebase_admin import firestore

# Credit constants
CREDITS_PER_FIRM = 5
FREE_FIRM_BATCH_DEFAULT = 10
PRO_FIRM_BATCH_DEFAULT = 10

firm_search_bp = Blueprint('firm_search', __name__, url_prefix='/api/firm-search')


def get_user_credits_and_tier(db, uid):
    """Get user's current credits and tier."""
    try:
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if user_doc.exists:
            user_data = user_doc.to_dict()
            credits = check_and_reset_credits(user_ref, user_data)
            tier = user_data.get('tier', 'free')
            max_credits = user_data.get('maxCredits', TIER_CONFIGS[tier]['credits'])
            return credits, tier, max_credits
        
        # User doesn't exist - return defaults
        return TIER_CONFIGS['free']['credits'], 'free', TIER_CONFIGS['free']['credits']
    except Exception as e:
        print(f"Error getting user credits: {e}")
        return 0, 'free', 150


def deduct_credits(db, uid, amount):
    """Deduct credits from user's account (DEPRECATED - use deduct_credits_atomic instead)."""
    # Use atomic function to prevent race conditions
    success, remaining = deduct_credits_atomic(uid, amount, "firm_search")
    if success:
        return remaining
    else:
        # If deduction failed, return current balance (for backward compatibility)
        try:
            user_ref = db.collection('users').document(uid)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                return check_and_reset_credits(user_ref, user_data)
        except:
            pass
        return 0


def validate_batch_size(tier, batch_size):
    """Validate batch size for tier."""
    if tier == 'free':
        return 1 <= batch_size <= 10, "Free tier allows 1-10 firms per search"
    else:  # pro
        return 1 <= batch_size <= 40, "Pro tier allows 1-40 firms per search"


def calculate_firm_search_cost(num_firms):
    """Calculate credit cost for firm search."""
    return num_firms * CREDITS_PER_FIRM


def save_search_to_history(uid: str, query: str, parsed_filters: dict, results: list) -> str:
    """Save a firm search to user's history in Firebase. Returns the search ID."""
    try:
        db = get_db()
        search_id = str(uuid.uuid4())
        
        search_doc = {
            'id': search_id,
            'query': query,
            'parsedFilters': parsed_filters,
            'results': results,
            'resultsCount': len(results),
            'createdAt': datetime.utcnow()
        }
        
        db.collection('users').document(uid).collection('firmSearches').document(search_id).set(search_doc)
        print(f"Saved firm search {search_id} for user {uid}")
        return search_id
    except Exception as e:
        print(f"Error saving search to history: {e}")
        return None


@firm_search_bp.route('/search', methods=['POST'])
@require_firebase_auth
def search_firms_route():
    # Rate limiting is handled globally by Flask-Limiter (default: 50/hour, 200/day)
    """
    Natural language firm search WITH CREDIT SYSTEM.
    
    Request body:
    {
        "query": "mid-sized investment banks in NYC focused on healthcare",
        "batchSize": 10  // Optional, defaults to 10
    }
    """
    try:
        uid = request.firebase_user.get('uid')
        db = get_db()
        data = request.get_json() or {}
        
        # Validate input
        try:
            validated_data = validate_request(FirmSearchRequest, data)
        except ValidationError as ve:
            return ve.to_response()
        
        query = validated_data['query']
        batch_size = validated_data.get('batchSize', 10)
        
        # Get user's tier and credits
        current_credits, tier, max_credits = get_user_credits_and_tier(db, uid)
        
        # Validate batch size for tier
        is_valid, error_msg = validate_batch_size(tier, batch_size)
        if not is_valid:
            raise ValidationError(error_msg, field="batchSize")
        
        # Calculate MAX credit cost
        max_credits_needed = calculate_firm_search_cost(batch_size)
        
        # Check if user has enough credits
        if current_credits < max_credits_needed:
            raise InsufficientCreditsError(max_credits_needed, current_credits)
        
        # Perform the search
        result = search_firms(query, limit=batch_size)
        
        if not result.get('success'):
            error_msg = result.get('error', 'Firm search failed')
            raise ExternalAPIError("Firm Search", error_msg)
        
        firms = result.get('firms', [])
        if not firms:
            # No firms found - return empty result but don't charge credits
            return jsonify({
                'success': True,
                'firms': [],
                'total': 0,
                'parsedFilters': result.get('parsedFilters'),
                'message': 'No firms found matching your search criteria. Try broadening your search.',
                'batchSize': batch_size,
                'creditsCharged': 0,
                'remainingCredits': current_credits
            })
        
        # Calculate ACTUAL credit cost based on firms returned
        actual_firms_returned = len(firms)
        actual_credits_to_charge = calculate_firm_search_cost(actual_firms_returned)
        
        # Charge credits atomically
        success, new_credit_balance = deduct_credits_atomic(uid, actual_credits_to_charge, "firm_search")
        if not success:
            # If deduction failed, user may have spent credits elsewhere
            current_credits, _, _ = get_user_credits_and_tier(db, uid)
            raise InsufficientCreditsError(actual_credits_to_charge, current_credits)
        
        # Save to history
        search_id = save_search_to_history(
            uid=uid,
            query=query,
            parsed_filters=result.get('parsedFilters', {}),
            results=firms
        )
        
        print(f"✅ Firm search successful for user {uid}:")
        print(f"   - Query: {query}")
        print(f"   - Batch size requested: {batch_size}")
        print(f"   - Firms returned: {actual_firms_returned}")
        print(f"   - Credits charged: {actual_credits_to_charge} ({actual_firms_returned} firms × {CREDITS_PER_FIRM} credits)")
        print(f"   - New balance: {new_credit_balance}")
        
        return jsonify({
            'success': True,
            'firms': firms,
            'total': len(firms),
            'parsedFilters': result.get('parsedFilters'),
            'searchId': search_id,
            'batchSize': batch_size,
            'firmsReturned': actual_firms_returned,
            'creditsCharged': actual_credits_to_charge,
            'remainingCredits': new_credit_balance
        })
    
    except (ValidationError, InsufficientCreditsError, ExternalAPIError, OfferloopException):
        raise
    except Exception as e:
        print(f"Firm search error: {e}")
        import traceback
        traceback.print_exc()
        raise OfferloopException(f"Firm search failed: {str(e)}", error_code="FIRM_SEARCH_ERROR")


@firm_search_bp.route('/history', methods=['GET'])
@require_firebase_auth
def get_search_history():
    """Get user's firm search history."""
    try:
        uid = request.firebase_user.get('uid')
        limit = min(int(request.args.get('limit', 10)), 50)
        db = get_db()
        
        searches_ref = db.collection('users').document(uid).collection('firmSearches')
        query = searches_ref.order_by('createdAt', direction='DESCENDING').limit(limit)
        
        searches = []
        for doc in query.stream():
            search_data = doc.to_dict()
            searches.append({
                'id': doc.id,  # Use document ID, not from data
                'query': search_data.get('query'),
                'parsedFilters': search_data.get('parsedFilters'),
                'resultsCount': search_data.get('resultsCount', 0),
                'createdAt': search_data.get('createdAt').isoformat() if hasattr(search_data.get('createdAt'), 'isoformat') else str(search_data.get('createdAt', ''))
            })
        
        return jsonify({
            'success': True,
            'searches': searches
        })
    
    except Exception as e:
        print(f"Error getting search history: {e}")
        import traceback
        traceback.print_exc()
        from app.utils.exceptions import OfferloopException
        raise OfferloopException(f"Failed to load search history: {str(e)}", error_code="FIRM_SEARCH_HISTORY_ERROR")


@firm_search_bp.route('/history/<search_id>', methods=['GET'])
@require_firebase_auth
def get_search_by_id(search_id):
    """Get a specific search from history (including full results)."""
    try:
        uid = request.firebase_user.get('uid')
        db = get_db()
        
        doc_ref = db.collection('users').document(uid).collection('firmSearches').document(search_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            return jsonify({
                'success': False,
                'error': 'Search not found'
            }), 404
        
        search_data = doc.to_dict()
        
        return jsonify({
            'success': True,
            'search': {
                'id': search_data.get('id'),
                'query': search_data.get('query'),
                'parsedFilters': search_data.get('parsedFilters'),
                'results': search_data.get('results', []),
                'resultsCount': search_data.get('resultsCount', 0),
                'createdAt': search_data.get('createdAt').isoformat() if search_data.get('createdAt') else None
            }
        })
    
    except Exception as e:
        print(f"Error getting search: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to load search'
        }), 500


@firm_search_bp.route('/options/industries', methods=['GET'])
def get_industries():
    """Get available industries for dropdown."""
    return jsonify({
        'success': True,
        'industries': get_available_industries()
    })


@firm_search_bp.route('/options/sizes', methods=['GET'])
def get_sizes():
    """Get available size options for dropdown."""
    return jsonify({
        'success': True,
        'sizes': get_size_options()
    })

