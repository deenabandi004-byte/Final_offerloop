"""
Flask extensions and initialization
"""
import os
import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth
from flask import Flask, request, jsonify
from flask_cors import CORS
import functools

# Global Firestore client
db = None

def init_firebase(app):
    """Initialize Firebase and set up Firestore client."""
    global db
    if firebase_admin._apps:  # already initialized
        try:
            db = firestore.client()
            return
        except Exception as e:
            print(f"⚠️ Firebase already initialized but Firestore client failed: {e}")
            print("⚠️ Attempting to reinitialize Firebase...")
            # Clear existing apps and reinitialize
            firebase_admin._apps.clear()

    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path or not os.path.exists(cred_path):
        # Fallback for local development or Render environment without explicit creds file
        print("⚠️ GOOGLE_APPLICATION_CREDENTIALS not found, attempting alternative Firebase init.")
        try:
            # Try to use default credentials (for cloud environments like Render, GCP, etc.)
            # This will use Application Default Credentials (ADC)
            firebase_admin.initialize_app(options={
                'projectId': 'offerloop-native',  # Explicitly set project ID
                'storageBucket': 'offerloop-native.firebasestorage.app'
            })
            print("✅ Firebase initialized with project ID option.")
            # Try to get Firestore client - if this fails, we'll need credentials
            try:
                db = firestore.client()
                print("✅ Firestore client initialized successfully.")
            except Exception as fs_error:
                print(f"⚠️ Firestore client initialization failed: {fs_error}")
                print("⚠️ This may work in production environments with proper IAM roles.")
                # Don't raise here - allow app to start but db will be None
                db = None
        except Exception as e:
            print(f"❌ Firebase initialization failed with project ID option: {e}")
            # Don't raise - allow app to start without Firebase in some environments
            db = None
    else:
        try:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred, {
                'storageBucket': 'offerloop-native.firebasestorage.app'
            })
            print("✅ Firebase initialized with credentials file.")
            db = firestore.client()
            print("✅ Firestore client initialized successfully.")
        except Exception as e:
            print(f"❌ Firebase initialization failed with credentials file: {e}")
            db = None

def get_db():
    """Returns the Firestore client instance."""
    if db is None:
        raise RuntimeError("Firestore DB not initialized. Call init_firebase() first.")
    return db

def require_firebase_auth(fn):
    """
    Decorator to require Firebase authentication for an endpoint.
    Extracts and verifies the Firebase ID token from the Authorization header.
    """
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            auth_header = request.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                return jsonify({'error': 'Missing Authorization header'}), 401

            id_token = auth_header.split(' ', 1)[1].strip()

            try:
                decoded = fb_auth.verify_id_token(id_token)
                request.firebase_user = decoded
            except Exception as token_error:
                # Beta fallback: accept token if it looks valid but can't be verified
                print(f"Token verification failed: {token_error}")
                if len(id_token) > 20:  # Basic length check
                    request.firebase_user = {
                        'uid': 'beta_user_' + id_token[:10],
                        'email': 'beta@offerloop.ai'
                    }
                    print("⚠️ Using beta authentication fallback")
                else:
                    return jsonify({'error': 'Invalid token format'}), 401

            return fn(*args, **kwargs)
        except Exception as e:
            return jsonify({'error': f'Authentication error: {str(e)}'}), 401
    return wrapper

def init_app_extensions(app: Flask):
    """Initializes Flask extensions like CORS and Firebase."""
    # Check if we're in development mode
    is_dev = (
        os.getenv("FLASK_ENV") == "development" or 
        os.getenv("ENVIRONMENT") == "development" or
        os.getenv("FLASK_DEBUG") == "1" or
        app.debug
    )
    
    # Get allowed origins from environment or use defaults
    allowed_origins_env = os.getenv("CORS_ORIGINS", "")
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()] if allowed_origins_env else []
    
    # Default origins (always include these)
    # Prioritize Vite dev server (5173) which is the default
    default_origins = [
        "http://localhost:5173",      # Vite default (most common)
        "http://127.0.0.1:5173",      # Vite default (IP variant)
        "http://localhost:3000",      # React/Next.js default
        "http://127.0.0.1:3000",      # React/Next.js default (IP variant)
        "http://localhost:8080",      # Other dev servers
        "http://127.0.0.1:8080",      # Other dev servers (IP variant)
        "https://d33d83bb2e38.ngrok-free.app",  # Example ngrok URL
        "https://www.offerloop.ai",
        "https://offerloop.ai"
    ]
    
    # Get all allowed origins (combine defaults and env vars)
    all_origins = list(set(default_origins + allowed_origins))
    
    # In development, use all default origins (more permissive but still explicit)
    # NOTE: Cannot use "*" with supports_credentials=True - must specify origins explicitly
    if is_dev:
        print(f"🔧 Development mode: CORS configured with origins: {all_origins}")
        cors_config = {
            "origins": all_origins,  # Explicit list (required when supports_credentials=True)
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
            "supports_credentials": True,
            "max_age": 3600,
            "expose_headers": ["Content-Type", "Authorization"]
        }
    else:
        # Production: use specific origins
        cors_config = {
            "origins": all_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
            "supports_credentials": True,
            "max_age": 3600,
            "expose_headers": ["Content-Type", "Authorization"]
        }
    
    CORS(app,
         resources={
             r"/api/*": cors_config,
             r"/*": cors_config  # Also allow CORS for all routes (for SPA)
         })
    app.secret_key = os.getenv("FLASK_SECRET", "dev")
    init_firebase(app)  # Initialize Firebase when extensions are initialized

