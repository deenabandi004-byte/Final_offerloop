from flask import Flask
from flask_cors import CORS

def create_app():
    app = Flask(__name__, static_folder="../../connect-grow-hire/dist", static_url_path="")
    CORS(app, resources={r"/api/*": {"origins": [
        "http://localhost:8080","http://127.0.0.1:8080","https://offerloop.ai","https://www.offerloop.ai"
    ]}})

# ✅ Initialize Firebase (Firestore)
    from .services.firebase import init_firebase
    init_firebase()

    
    from .routes.health import bp as health_bp
    from .routes.spa import bp as spa_bp
    app.register_blueprint(health_bp)  # /ping, /health
    app.register_blueprint(spa_bp)     # SPA catch-all (register last)

    @app.after_request
    def add_cors_headers(resp):
        resp.headers.setdefault("Access-Control-Allow-Credentials", "true")
        return resp

    return app
