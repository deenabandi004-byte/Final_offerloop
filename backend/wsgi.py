"""
WSGI entry point for Flask application
Creates Flask app instance and registers all blueprints
"""
# Load environment variables FIRST, before any other imports
from dotenv import load_dotenv
load_dotenv()  # Load .env from project root by default

import os
from flask import Flask

from app.extensions import init_app_extensions
from app.routes import (
    health_bp,
    spa_bp,
    gmail_oauth_bp,
    emails_bp,
    contacts_bp,
    directory_bp,
    runs_bp,
    enrichment_bp,
    resume_bp,
    coffee_chat_bp,
    billing_bp,
    users_bp
)


def create_app():
    """Create and configure Flask application"""
    # Create Flask app instance
    static_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'connect-grow-hire', 'dist')
    
    # Enable debug mode in development
    debug_mode = (
        os.getenv("FLASK_ENV") == "development" or 
        os.getenv("FLASK_DEBUG") == "1" or
        os.getenv("ENVIRONMENT") == "development" or
        os.getenv("DEBUG") == "1"
    )
    
    app = Flask(__name__, static_folder=static_folder, static_url_path="")
    app.debug = debug_mode
    
    # Initialize extensions (CORS, Firebase, etc.)
    init_app_extensions(app)
    
    # Register blueprints
    # IMPORTANT: Register spa_bp LAST - it has catch-all routes that must not interfere with API routes
    app.register_blueprint(health_bp)
    app.register_blueprint(gmail_oauth_bp)
    app.register_blueprint(emails_bp)
    app.register_blueprint(contacts_bp)
    app.register_blueprint(directory_bp)
    app.register_blueprint(runs_bp)
    app.register_blueprint(enrichment_bp)
    app.register_blueprint(resume_bp)
    app.register_blueprint(coffee_chat_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(spa_bp)  # Register LAST - catch-all for SPA
    
    # Add security headers
    @app.after_request
    def add_security_headers(response):
        """Add security headers to all responses"""
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Content-Security-Policy'] = "frame-ancestors 'self'"
        response.headers['Server'] = 'Offerloop'
        response.headers.pop('X-Powered-By', None)
        return response
    
    # Add caching headers
    @app.after_request
    def add_caching(resp):
        """Add caching headers"""
        content_type = resp.headers.get("Content-Type", "")
        if content_type.startswith("text/html"):
            resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
        else:
            resp.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
        return resp
    
    # Block dangerous HTTP methods
    @app.before_request
    def block_dangerous_methods():
        """Block TRACE and TRACK HTTP methods"""
        from flask import abort, request
        if request.method in ['TRACE', 'TRACK']:
            abort(405)  # Method Not Allowed
    
    # Request logging (for debugging)
    @app.before_request
    def log_request():
        """Log requests for debugging"""
        from flask import request
        if 'coffee-chat-prep' in request.path:
            print(f"\n📨 {request.method} {request.path}")
            print(f"   Origin: {request.headers.get('Origin')}")
            if request.headers.get('Authorization'):
                print(f"   Auth: {request.headers.get('Authorization')[:50]}...")
    
    return app


# Create app instance for WSGI servers
app = create_app()


if __name__ == '__main__':
    print("=" * 50)
    print("Initializing RecruitEdge server with TWO TIERS: Free and Pro...")
    print("=" * 50)
    
    print("\n" + "=" * 50)
    print("Starting RecruitEdge server on port 5001...")
    print("Access the API at: http://localhost:5001")
    print("Health check: http://localhost:5001/health")
    print("Available Tiers:")
    print("- FREE: 3 contacts, 150 credits, 200 minutes saved")
    print("- PRO: 8 contacts, 1800 credits, 1200 minutes saved")
    print("New endpoints:")
    print("- /api/free-run (replaces basic-run)")
    print("- /api/pro-run (enhanced with resume)")
    print("- /api/tier-info (get tier information)")
    print("=" * 50 + "\n")
    
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
