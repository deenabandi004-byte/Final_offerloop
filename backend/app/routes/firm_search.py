"""
Firm Search Routes - Flask Blueprint for company discovery
Endpoints for natural language and structured firm search
WITH CREDIT SYSTEM INTEGRATION
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
import uuid
import json

from app.extensions import get_db, require_firebase_auth, require_tier
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
    """Validate batch size for tier according to audit spec."""
    if tier == 'free':
        return batch_size == 1, "Free tier allows 1 firm per search"
    elif tier == 'pro':
        return 1 <= batch_size <= 5, "Pro tier allows 1-5 firms per search"
    elif tier == 'elite':
        return 1 <= batch_size <= 15, "Elite tier allows 1-15 firms per search"
    else:
        return False, f"Invalid tier: {tier}"


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
        
        # All users can search for as many firms as they want, as long as they have the credits
        # No tier-based batch size restrictions
        
        # Calculate MAX credit cost
        max_credits_needed = calculate_firm_search_cost(batch_size)
        
        # Check if user has enough credits
        if current_credits < max_credits_needed:
            raise InsufficientCreditsError(max_credits_needed, current_credits)
        
        # Perform the search
        try:
            result = search_firms(query, limit=batch_size)
        except Exception as e:
            print(f"❌ Error calling search_firms: {e}")
            import traceback
            traceback.print_exc()
            raise ExternalAPIError("Firm Search", f"Search service error: {str(e)}")
        
        firms = result.get('firms', [])
        
        # Handle partial results (some firms found but not all)
        is_partial = result.get('partial', False)
        partial_message = None
        if is_partial and firms:
            partial_message = result.get('error')  # This is informational, not an error
        
        if not result.get('success'):
            error_msg = result.get('error', 'Firm search failed')
            print(f"⚠️ Firm search returned error: {error_msg}")
            
            # Check if this is a validation/parsing error (missing fields)
            # These should be 400 errors, not 502 errors
            if 'Missing required fields' in error_msg or 'Failed to understand' in error_msg:
                raise ValidationError(error_msg, field="query")
            else:
                # Actual API/service errors
                raise ExternalAPIError("Firm Search", error_msg)
        
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
        
        # Ensure firms are properly sorted to avoid comparison errors with None values
        # Sort by employeeCount in DESCENDING order (largest first)
        # When size is not specified, we want the biggest firms
        firms.sort(key=lambda f: f.get('employeeCount') if f.get('employeeCount') is not None else 0, reverse=True)
        
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
        
        response_data = {
            'success': True,
            'firms': firms,
            'total': len(firms),
            'parsedFilters': result.get('parsedFilters'),
            'searchId': search_id,
            'batchSize': batch_size,
            'firmsReturned': actual_firms_returned,
            'creditsCharged': actual_credits_to_charge,
            'remainingCredits': new_credit_balance
        }
        
        # Add partial result message if applicable
        if partial_message:
            response_data['partialMessage'] = partial_message
        
        return jsonify(response_data)
    
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
    """Get user's firm search history.
    
    Query params:
    - limit: Number of searches to return (default: 10, max: 100 for loading all firms)
    - includeFirms: If 'true', include firm results in response (default: false)
    """
    try:
        uid = request.firebase_user.get('uid')
        # Allow higher limit when loading firms to get all searches
        limit = min(int(request.args.get('limit', 10)), 100 if request.args.get('includeFirms') == 'true' else 50)
        include_firms = request.args.get('includeFirms', 'false').lower() == 'true'
        db = get_db()
        
        searches_ref = db.collection('users').document(uid).collection('firmSearches')
        query = searches_ref.order_by('createdAt', direction='DESCENDING').limit(limit)
        
        searches = []
        for doc in query.stream():
            search_data = doc.to_dict()
            search_item = {
                'id': doc.id,  # Use document ID, not from data
                'query': search_data.get('query'),
                'parsedFilters': search_data.get('parsedFilters'),
                'resultsCount': search_data.get('resultsCount', 0),
                'createdAt': search_data.get('createdAt').isoformat() if hasattr(search_data.get('createdAt'), 'isoformat') else str(search_data.get('createdAt', ''))
            }
            
            # Optionally include firms to avoid additional API calls
            if include_firms:
                search_item['results'] = search_data.get('results', [])
            
            searches.append(search_item)
        
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


@firm_search_bp.route('/delete-firm', methods=['POST'])
@require_firebase_auth
def delete_firm():
    """Delete a firm from all search history entries."""
    try:
        uid = request.firebase_user.get('uid')
        db = get_db()
        data = request.get_json() or {}
        
        firm_id = data.get('firmId')
        firm_name = data.get('firmName')
        firm_location = data.get('firmLocation')
        
        print(f"🗑️ Delete firm request: firmId={firm_id}, firmName={firm_name}, firmLocation={firm_location}")
        
        if not firm_id and not firm_name:
            return jsonify({
                'success': False,
                'error': 'Either firmId or firmName must be provided'
            }), 400
        
        # Get all search history entries (not just recent ones - we need to check ALL)
        searches_ref = db.collection('users').document(uid).collection('firmSearches')
        searches = list(searches_ref.stream())
        
        print(f"🗑️ Found {len(searches)} total search history entries")
        
        # Log the first few firms to see their structure
        total_firms_before = 0
        for search_doc in searches[:3]:  # Check first 3 searches
            search_data = search_doc.to_dict()
            results = search_data.get('results', [])
            total_firms_before += len(results)
            if results:
                print(f"  📋 Sample firm from search {search_doc.id}: {json.dumps(results[0], indent=2, default=str)}")
        
        print(f"🗑️ Total firms across all searches before deletion: {total_firms_before}")
        
        deleted_count = 0
        updated_searches = 0
        
        def normalize_location(loc_str):
            """Normalize location string for comparison."""
            if not loc_str:
                return ""
            # Remove extra spaces, convert to lowercase
            return ' '.join(str(loc_str).strip().lower().split())
        
        # Create a clean matching function for this specific deletion request
        # (no side effects, ensures we're matching the right firm)
        match_attempts = 0
        
        def matches_this_firm(firm):
            nonlocal match_attempts
            match_attempts += 1
            """Match function specific to this deletion request."""
            # PRIORITY 1: Match by ID if provided
            if firm_id:
                firm_id_value = firm.get('id')
                if firm_id_value:
                    firm_id_str = str(firm_id_value).strip()
                    requested_id_str = str(firm_id).strip()
                    if firm_id_str == requested_id_str:
                        return True
                # If ID is provided but doesn't match, don't fall through
                return False
            
            # PRIORITY 2: Match by name + location (only if no ID provided)
            if firm_name:
                firm_name_value = str(firm.get('name', '')).strip()
                requested_name = str(firm_name).strip()
                
                if not firm_name_value or firm_name_value.lower() != requested_name.lower():
                    if match_attempts <= 3:
                        print(f"  ❌ Match #{match_attempts}: Name mismatch - stored='{firm_name_value}', requested='{requested_name}'")
                    return False
                
                if firm_location:
                    firm_loc = firm.get('location', {})
                    if not isinstance(firm_loc, dict):
                        if match_attempts <= 3:
                            print(f"  ❌ Match #{match_attempts}: Location is not a dict")
                        return False
                    
                    loc_display = firm_loc.get('display')
                    if loc_display:
                        if normalize_location(loc_display) == normalize_location(firm_location):
                            if match_attempts <= 5:
                                print(f"  ✅ Match #{match_attempts}: Matched by name+location.display: {firm_name_value} @ {loc_display}")
                            return True
                    
                    loc_parts = [firm_loc.get('city'), firm_loc.get('state'), firm_loc.get('country')]
                    loc_parts = [str(p).strip() for p in loc_parts if p]
                    if loc_parts:
                        constructed_loc = ', '.join(loc_parts)
                        if normalize_location(constructed_loc) == normalize_location(firm_location):
                            if match_attempts <= 5:
                                print(f"  ✅ Match #{match_attempts}: Matched by name+constructed location: {firm_name_value} @ {constructed_loc}")
                            return True
                    
                    if match_attempts <= 3:
                        stored_loc = loc_display or (', '.join(loc_parts) if loc_parts else "N/A")
                        print(f"  ❌ Match #{match_attempts}: Location mismatch - stored='{stored_loc}', requested='{firm_location}'")
                    return False
                else:
                    if match_attempts <= 5:
                        print(f"  ✅ Match #{match_attempts}: Matched by name only (no location): {firm_name_value}")
                    return True
            
            return False
        
        # Remove firm from all search history entries
        # Use a batch write for better performance and atomicity
        batch = db.batch()
        batch_count = 0
        MAX_BATCH_SIZE = 500  # Firestore batch limit
        
        for search_doc in searches:
            search_data = search_doc.to_dict()
            results = search_data.get('results', [])
            
            if not results:
                continue
            
            # Filter out the matching firm(s) using the clean matching function
            original_count = len(results)
            
            # Debug: Log first firm structure to see what we're comparing against
            if deleted_count == 0 and results:
                print(f"  🔍 Sample firm from search {search_doc.id}: id={results[0].get('id')}, name={results[0].get('name')}, location={json.dumps(results[0].get('location'), default=str)}")
            
            filtered_results = [f for f in results if not matches_this_firm(f)]
            
            if len(filtered_results) < original_count:
                # Firm was found and removed
                removed = original_count - len(filtered_results)
                deleted_count += removed
                
                print(f"  🗑️ Removing {removed} firm(s) from search {search_doc.id} (batch write)")
                
                # Add to batch
                batch.update(search_doc.reference, {
                    'results': filtered_results,
                    'resultsCount': len(filtered_results)
                })
                batch_count += 1
                updated_searches += 1
                
                # Commit batch if we hit the limit
                if batch_count >= MAX_BATCH_SIZE:
                    batch.commit()
                    print(f"  ✅ Committed batch of {batch_count} updates")
                    batch = db.batch()
                    batch_count = 0
        
        # Commit remaining updates
        if batch_count > 0:
            batch.commit()
            print(f"  ✅ Committed final batch of {batch_count} updates")
        
        print(f"🗑️ Delete complete: {deleted_count} firms deleted from {updated_searches} searches")
        
        # Verify deletion by checking all searches again
        # Wait a moment for Firestore to propagate the batch write, then verify
        if deleted_count > 0:
            import time
            time.sleep(0.5)  # Small delay to allow Firestore to propagate
            
            verification_searches = list(searches_ref.stream())
            remaining_count = 0
            
            # Use the same matching function we used for deletion
            for search_doc in verification_searches:
                search_data = search_doc.to_dict()
                results = search_data.get('results', [])
                for firm in results:
                    if matches_this_firm(firm):
                        remaining_count += 1
                        print(f"  ⚠️ WARNING: Firm still exists in search {search_doc.id}: {firm.get('id')} ({firm.get('name')})")
            
            if remaining_count > 0:
                print(f"  ⚠️ WARNING: {remaining_count} firm instance(s) still remain after deletion!")
                print(f"  🔄 Attempting to delete remaining instances...")
                
                # Try one more time to delete any remaining instances
                retry_batch = db.batch()
                retry_count = 0
                for search_doc in verification_searches:
                    search_data = search_doc.to_dict()
                    results = search_data.get('results', [])
                    filtered_results = [f for f in results if not matches_this_firm(f)]
                    
                    if len(filtered_results) < len(results):
                        retry_batch.update(search_doc.reference, {
                            'results': filtered_results,
                            'resultsCount': len(filtered_results)
                        })
                        retry_count += 1
                        print(f"  🗑️ Retry: Removing firm from search {search_doc.id}")
                
                if retry_count > 0:
                    retry_batch.commit()
                    print(f"  ✅ Retry: Committed {retry_count} additional deletions")
                    
                    # Final verification
                    time.sleep(0.3)
                    final_searches = list(searches_ref.stream())
                    final_remaining = 0
                    for search_doc in final_searches:
                        search_data = search_doc.to_dict()
                        results = search_data.get('results', [])
                        for firm in results:
                            if matches_this_firm(firm):
                                final_remaining += 1
                    
                    if final_remaining > 0:
                        print(f"  ⚠️ WARNING: {final_remaining} firm instance(s) STILL remain after retry!")
                    else:
                        print(f"  ✅ Final verification: All matching firms deleted")
            else:
                print(f"  ✅ Verification: No matching firms remain in any search")
        
        if deleted_count == 0:
            print(f"⚠️ WARNING: No firms were deleted! Check matching logic.")
            print(f"   Requested: firmId={firm_id}, firmName={firm_name}, firmLocation={firm_location}")
        
        return jsonify({
            'success': True,
            'deletedCount': deleted_count,
            'updatedSearches': updated_searches,
            'message': f'Deleted {deleted_count} firm(s) from {updated_searches} search(es)' if deleted_count > 0 else 'No matching firms found to delete'
        })
    
    except Exception as e:
        print(f"❌ Error deleting firm: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to delete firm: {str(e)}'
        }), 500

