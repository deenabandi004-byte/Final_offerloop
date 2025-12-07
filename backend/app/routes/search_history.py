"""
Search history routes - track and retrieve past searches
"""
from datetime import datetime
from flask import Blueprint, request, jsonify
from firebase_admin import firestore

from app.extensions import require_firebase_auth, get_db
from app.utils.exceptions import NotFoundError, OfferloopException

search_history_bp = Blueprint('search_history', __name__, url_prefix='/api/search-history')


@search_history_bp.route('', methods=['GET'])
@require_firebase_auth
def get_search_history():
    """Get user's search history with pagination"""
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        
        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")
        
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 50)  # Max 50 per page
        page = max(1, page)
        
        searches_ref = db.collection('users').document(user_id).collection('searchHistory')
        query = searches_ref.order_by('createdAt', direction=firestore.Query.DESCENDING)
        
        offset = (page - 1) * per_page
        docs = list(query.limit(per_page + 1).offset(offset).stream())
        
        has_next = len(docs) > per_page
        searches = []
        
        for doc in docs[:per_page]:
            search_data = doc.to_dict()
            search_data['id'] = doc.id
            searches.append(search_data)
        
        return jsonify({
            'searches': searches,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'has_next': has_next,
                'has_prev': page > 1
            }
        })
        
    except OfferloopException:
        raise
    except Exception as e:
        print(f"Error getting search history: {str(e)}")
        raise OfferloopException(f"Failed to retrieve search history: {str(e)}", error_code="SEARCH_HISTORY_ERROR")


@search_history_bp.route('/<search_id>', methods=['GET'])
@require_firebase_auth
def get_search_by_id(search_id):
    """Get a specific search from history"""
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        
        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")
        
        search_ref = db.collection('users').document(user_id).collection('searchHistory').document(search_id)
        search_doc = search_ref.get()
        
        if not search_doc.exists:
            raise NotFoundError("Search")
        
        search_data = search_doc.to_dict()
        search_data['id'] = search_id
        
        return jsonify({'search': search_data})
        
    except (OfferloopException, NotFoundError):
        raise
    except Exception as e:
        print(f"Error getting search: {str(e)}")
        raise OfferloopException(f"Failed to retrieve search: {str(e)}", error_code="SEARCH_FETCH_ERROR")


@search_history_bp.route('/<search_id>', methods=['DELETE'])
@require_firebase_auth
def delete_search(search_id):
    """Delete a search from history"""
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        
        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")
        
        search_ref = db.collection('users').document(user_id).collection('searchHistory').document(search_id)
        
        if not search_ref.get().exists:
            raise NotFoundError("Search")
        
        search_ref.delete()
        
        return jsonify({'message': 'Search deleted successfully'})
        
    except (OfferloopException, NotFoundError):
        raise
    except Exception as e:
        print(f"Error deleting search: {str(e)}")
        raise OfferloopException(f"Failed to delete search: {str(e)}", error_code="SEARCH_DELETE_ERROR")
