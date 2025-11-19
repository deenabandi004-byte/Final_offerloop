"""
Health check routes
"""
from flask import Blueprint, jsonify
from app.services.gmail_client import get_gmail_service
import firebase_admin
from app.extensions import get_db

health_bp = Blueprint('health', __name__)


@health_bp.route('/ping')
def ping():
    return "pong"


@health_bp.route('/health')
def health():
    """Health check endpoint"""
    # Check Firebase status
    firebase_status = 'unknown'
    firebase_error = None
    try:
        if firebase_admin._apps:
            db = get_db()
            if db:
                firebase_status = 'initialized'
            else:
                firebase_status = 'apps_exist_but_db_none'
        else:
            firebase_status = 'not_initialized'
    except Exception as e:
        firebase_status = 'error'
        firebase_error = str(e)
    
    return jsonify({
        'status': 'healthy',
        'tiers': ['free', 'pro'],
        'email_system': 'interesting_mutual_interests_v2',
        'services': {
            'pdl': 'connected',
            'openai': 'connected',
            'gmail': 'connected' if get_gmail_service() else 'unavailable',
            'firebase': {
                'status': firebase_status,
                'error': firebase_error
            }
        }
    })


@health_bp.get("/healthz")
def healthz():
    """Kubernetes health check endpoint"""
    return jsonify({"status": "ok"}), 200
