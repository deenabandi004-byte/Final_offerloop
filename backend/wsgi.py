import os
import logging
import threading
import time
from flask import Flask, send_from_directory, abort, request, redirect

# Configure logging BEFORE importing anything else that uses logging
from .app.logging_config import configure_logging
configure_logging()

# --- Import your API blueprints (use package-relative imports) ---
from .app.routes.health import health_bp
from .app.routes.gmail_oauth import gmail_oauth_bp
from .app.routes.emails import emails_bp
from .app.routes.contacts import contacts_bp
from .app.routes.runs import runs_bp
from .app.routes.enrichment import enrichment_bp
from .app.routes.resume import resume_bp
from .app.routes.coffee_chat_prep import coffee_chat_bp
from .app.routes.interview_prep import interview_prep_bp
from .app.routes.billing import billing_bp
from .app.routes.users import users_bp
from .app.routes.outbox import outbox_bp
from .app.routes.scout import scout_bp
from .app.routes.firm_search import firm_search_bp
from .app.routes.dashboard import dashboard_bp
from .app.routes.timeline import timeline_bp
from .app.routes.search_history import search_history_bp
from .app.routes.prompt_search import prompt_search_bp
from .app.routes.parse_prompt import parse_prompt_bp
from .app.routes.contact_import import contact_import_bp
from .app.routes.job_board import job_board_bp
from .app.routes.scout_assistant import scout_assistant_bp
from .app.routes.linkedin_import import linkedin_import_bp
from .app.routes.resume_workshop import resume_workshop_bp
from .app.routes.resume_pdf_patch import resume_pdf_patch_bp
from .app.routes.cover_letter_workshop import cover_letter_workshop_bp
from .app.routes.auth_extension import auth_extension_bp
from .app.routes.email_template import email_template_bp
from .app.routes.admin import admin_bp
from .app.routes.gmail_webhook import gmail_webhook_bp
from .app.routes.jobs import jobs_bp
from .app.routes.extension_logs import extension_logs_bp
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

    # --- Prerender.io middleware for bot crawlers (SEO/AEO) ---
    PRERENDER_TOKEN = os.environ.get("PRERENDER_TOKEN", "7CEDXDDuzwprjCKsW8Ln")
    BOT_AGENTS = [
        'googlebot', 'bingbot', 'yandex', 'duckduckbot', 'slurp',
        'baiduspider', 'facebookexternalhit', 'twitterbot', 'linkedinbot',
        'embedly', 'quora link preview', 'showyoubot', 'outbrain',
        'pinterest', 'developers.google.com/+/web/snippet', 'slackbot',
        'vkshare', 'w3c_validator', 'redditbot', 'applebot', 'whatsapp',
        'flipboard', 'tumblr', 'bitlybot', 'skypeuripreview', 'nuzzel',
        'discordbot', 'google page speed', 'qwantify', 'pinterestbot',
        'bitrix link preview', 'xing-contenttabreceiver', 'chrome-lighthouse',
        'telegrambot', 'gptbot', 'claudebot', 'anthropic-ai', 'perplexitybot',
        'ccbot', 'chatgpt-user', 'google-extended', 'bytespider'
    ]

    @app.before_request
    def prerender_middleware():
        user_agent = request.headers.get('User-Agent', '').lower()
        is_bot = any(bot in user_agent for bot in BOT_AGENTS)

        # Only prerender GET requests to non-API, non-asset routes
        if not is_bot:
            return None
        if request.method != 'GET':
            return None
        if request.path.startswith('/api/'):
            return None
        if request.path.startswith('/assets/'):
            return None
        if '.' in request.path.split('/')[-1]:  # skip files like .js .css .png
            return None

        import requests as req
        prerender_url = f"https://service.prerender.io/{request.url}"
        try:
            resp = req.get(
                prerender_url,
                headers={
                    'X-Prerender-Token': PRERENDER_TOKEN,
                    'User-Agent': request.headers.get('User-Agent', '')
                },
                timeout=10
            )
            from flask import Response
            return Response(
                resp.content,
                status=resp.status_code,
                content_type=resp.headers.get('Content-Type', 'text/html')
            )
        except Exception as e:
            app.logger.warning(f"Prerender failed for {request.url}: {e}")
            return None  # Fall through to normal serving

    print("🚀 Initializing app extensions...")
    init_app_extensions(app)
    print("✅ App extensions initialized")
    
    # Initialize Sentry error tracking
    from app.utils.sentry_config import init_sentry
    init_sentry(app)
    
    # Initialize Swagger API documentation (only in development)
    if os.environ.get('FLASK_ENV') == 'development':
        from app.utils.swagger_config import init_swagger
        init_swagger(app)
    
    # Register error handlers
    from app.utils.exceptions import register_error_handlers
    register_error_handlers(app)
    print("✅ Error handlers registered")
    
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
    
    # --- Backwards compatibility: Add old /api/gmail/* routes ---
    # These routes call the same handlers as /api/google/* routes
    from .app.extensions import require_firebase_auth
    from .app.routes.gmail_oauth import google_oauth_start, gmail_status
    
    @app.route('/api/gmail/oauth/start', methods=['GET', 'OPTIONS'])
    @require_firebase_auth
    def gmail_oauth_start_legacy():
        """Legacy route for /api/gmail/oauth/start - calls same handler as /api/google/oauth/start"""
        return google_oauth_start()
    
    @app.route('/api/gmail/status', methods=['GET', 'OPTIONS'])
    @require_firebase_auth
    def gmail_status_legacy():
        """Legacy route for /api/gmail/status - calls same handler as /api/google/gmail/status"""
        return gmail_status()
    
    app.register_blueprint(emails_bp)
    app.register_blueprint(linkedin_import_bp)  # Register before contacts_bp to avoid route conflicts
    app.register_blueprint(contacts_bp)
    app.register_blueprint(runs_bp)
    app.register_blueprint(enrichment_bp)
    app.register_blueprint(resume_bp)
    app.register_blueprint(coffee_chat_bp)
    app.register_blueprint(interview_prep_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(outbox_bp)
    app.register_blueprint(scout_bp)
    app.register_blueprint(firm_search_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(timeline_bp)
    app.register_blueprint(search_history_bp)
    app.register_blueprint(prompt_search_bp)
    app.register_blueprint(parse_prompt_bp)
    app.register_blueprint(contact_import_bp)
    app.register_blueprint(job_board_bp)
    app.register_blueprint(scout_assistant_bp)
    app.register_blueprint(resume_workshop_bp)
    app.register_blueprint(resume_pdf_patch_bp)
    app.register_blueprint(cover_letter_workshop_bp)
    app.register_blueprint(auth_extension_bp)
    app.register_blueprint(email_template_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(gmail_webhook_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(extension_logs_bp)

    # --- Debug route to check frontend build (dev only) ---
    @app.route('/api/debug/frontend')
    def debug_frontend():
        is_dev = (
            os.getenv("FLASK_ENV") == "development"
            or os.getenv("FLASK_DEBUG") == "1"
            or app.debug
        )
        if not is_dev:
            return {"error": "Not available in production"}, 404

        static_dir = app.static_folder
        exists = os.path.exists(static_dir)
        index_exists = os.path.exists(os.path.join(static_dir, 'index.html')) if exists else False

        return {
            'static_folder_exists': exists,
            'index_html_exists': index_exists,
            'file_count': len(os.listdir(static_dir)) if exists else 0,
        }

    # --- Serve built asset files (e.g., /assets/*) ---
    @app.route('/assets/<path:filename>')
    def vite_assets(filename):
        assets_dir = os.path.join(app.static_folder, 'assets')
        response = send_from_directory(assets_dir, filename)
        # Add caching headers for static assets (1 year cache)
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        return response

    # --- Serve root index.html ---
    @app.route('/')
    def index():
        return send_from_directory(app.static_folder, 'index.html')

    # --- Serve SEO/AEO root files explicitly ---
    @app.route('/sitemap.xml')
    def sitemap():
        return send_from_directory(app.static_folder, 'sitemap.xml', mimetype='application/xml')

    @app.route('/robots.txt')
    def robots():
        return send_from_directory(app.static_folder, 'robots.txt', mimetype='text/plain')

    @app.route('/llms.txt')
    def llms():
        return send_from_directory(app.static_folder, 'llms.txt', mimetype='text/plain')

    # --- 404 handler for SPA (catches all unmatched routes) ---
    @app.errorhandler(404)
    def not_found(e):
        # Don't serve index.html for API routes that don't exist
        if request.path.startswith('/api/'):
            return "API endpoint not found", 404
        
        # For everything else, serve the React app
        index_path = os.path.join(app.static_folder, 'index.html')
        if os.path.exists(index_path):
            app.logger.info(f"404 handler serving index.html for path: {request.path}")
            return send_from_directory(app.static_folder, 'index.html')
        else:
            return "Frontend build not found", 500

    # Start Gmail watch renewal background thread (every 6 days)
    _watch_logger = logging.getLogger("watch_renewal")

    def _watch_renewal_loop():
        _watch_logger.info("Gmail watch renewal thread started (interval=6 days)")
        SIX_DAYS = 6 * 24 * 3600
        while True:
            time.sleep(SIX_DAYS)
            try:
                with app.app_context():
                    from .app.routes.admin import renew_watches as _renew_endpoint
                    # Call the core logic directly, not the HTTP handler
                    from .app.extensions import get_db
                    from .app.services.gmail_client import renew_gmail_watch
                    db = get_db()
                    now_ms = int(time.time() * 1000)
                    one_day_ms = 86400 * 1000
                    renewed = 0
                    failed = 0
                    for user_doc in db.collection("users").stream():
                        uid = user_doc.id
                        gmail_ref = db.collection("users").document(uid).collection("integrations").document("gmail")
                        gmail_doc = gmail_ref.get()
                        if not gmail_doc.exists:
                            continue
                        data = gmail_doc.to_dict() or {}
                        if not (data.get("token") or data.get("refresh_token")):
                            continue
                        watch_exp = data.get("watchExpiration")
                        if watch_exp is not None:
                            try:
                                watch_exp = int(watch_exp)
                            except (TypeError, ValueError):
                                watch_exp = None
                        if watch_exp is not None and (watch_exp - now_ms) >= one_day_ms:
                            continue
                        try:
                            renew_gmail_watch(uid)
                            renewed += 1
                        except Exception as e:
                            failed += 1
                            _watch_logger.error("Watch renewal failed uid=%s: %s", uid, e)
                    _watch_logger.info("Watch renewal complete: renewed=%d failed=%d", renewed, failed)
            except Exception as e:
                _watch_logger.error("Watch renewal loop error: %s", e)

    t = threading.Thread(target=_watch_renewal_loop, daemon=True)
    t.start()
    _watch_logger.info("Gmail watch renewal thread registered (first run in 6 days)")

    return app

# Gunicorn entrypoint
app = create_app()

# Optional: list all registered routes when LIST_ROUTES=1 (e.g. LIST_ROUTES=1 python wsgi.py)
if os.environ.get("LIST_ROUTES"):
    print("--- Registered routes ---")
    for rule in app.url_map.iter_rules():
        print(f"{rule.endpoint}: {rule.methods} {rule.rule}")
    print("--- End routes ---")