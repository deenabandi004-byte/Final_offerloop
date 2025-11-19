import os
import logging
from flask import Flask, send_from_directory, abort, request, redirect

# --- Import your API blueprints (use package-relative imports) ---
from .app.routes.health import health_bp
from .app.routes.gmail_oauth import gmail_oauth_bp
from .app.routes.emails import emails_bp
from .app.routes.contacts import contacts_bp
from .app.routes.directory import directory_bp
from .app.routes.runs import runs_bp
from .app.routes.enrichment import enrichment_bp
from .app.routes.resume import resume_bp
from .app.routes.coffee_chat_prep import coffee_chat_bp
from .app.routes.billing import billing_bp
from .app.routes.users import users_bp
from .app.routes.outbox import outbox_bp
from .app.extensions import init_app_extensions

def create_app() -> Flask:
    # Project layout assumptions:
    REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
    FRONTEND_DIR = os.path.join(REPO_ROOT, "connect-grow-hire")
    STATIC_DIR = os.path.join(FRONTEND_DIR, "dist")

    app = Flask(
        __name__,
        static_folder=STATIC_DIR,
        static_url_path=""
    )
    
    print("🚀 Initializing app extensions...")
    init_app_extensions(app)
    print("✅ App extensions initialized")
    
    # Check if db was initialized
    from .app.extensions import db
    print(f"🔍 After init_app_extensions, db is: {db}")
    print(f"🔍 db type: {type(db)}")
    
    # --- Logging (handy on Render) ---
    app.logger.setLevel(logging.INFO)
    app.logger.info("STATIC FOLDER: %s", app.static_folder)
    app.logger.info("INDEX EXISTS? %s", os.path.exists(os.path.join(app.static_folder, "index.html")))

    # --- Register API blueprints FIRST ---
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
    app.register_blueprint(outbox_bp)

    # --- Redirect apex → www (optional but recommended) ---
    @app.before_request
    def force_www():
        host = request.headers.get("Host", "")
        if host == "offerloop.ai":
            return redirect("https://www.offerloop.ai" + request.full_path, code=301)

    # --- Serve built asset files (e.g., /assets/*) ---
    @app.route('/assets/<path:filename>')
    def vite_assets(filename):
        assets_dir = os.path.join(app.static_folder, 'assets')
        return send_from_directory(assets_dir, filename)

    # --- SPA catch-all: serve index.html for any non-API route ---
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def spa_fallback(path):
        if path.startswith('api/'):
            abort(404)  
        
        file_path = os.path.join(app.static_folder, path)
        if path and os.path.isfile(file_path):
            return send_from_directory(app.static_folder, path)
        
        index_path = os.path.join(app.static_folder, 'index.html')
        if not os.path.exists(index_path):
            app.logger.error("index.html not found at %s", index_path)
            return "Frontend build not found. Did you run the frontend build on Render?", 500
        
        return send_from_directory(app.static_folder, 'index.html')

    return app

# Gunicorn entrypoint
app = create_app()