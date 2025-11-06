"""
Health check routes
"""
from flask import Blueprint, jsonify
from app.services.gmail_client import get_gmail_service

health_bp = Blueprint('health', __name__)


@health_bp.route('/ping')
def ping():
    return "pong"


@health_bp.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'tiers': ['free', 'pro'],
        'email_system': 'interesting_mutual_interests_v2',
        'services': {
            'pdl': 'connected',
            'openai': 'connected',
            'gmail': 'connected' if get_gmail_service() else 'unavailable'
        }
    })


@health_bp.get("/healthz")
def healthz():
    """Kubernetes health check endpoint"""
    return jsonify({"status": "ok"}), 200
