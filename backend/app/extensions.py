"""
Flask extensions and initialization
"""
import os
import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import functools

# Global Firestore client
db = None
limiter = None

def get_limiter():
    """Get the rate limiter instance."""
    global limiter
    return limiter

def rate_limit_by_user(fn):
    """
    Rate limit decorator that uses user ID from Firebase auth.
    Falls back to IP address if user not authenticated.
    """
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        # Try to get user ID from request
        user_id = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
        
        # Use user ID for rate limiting if available, otherwise use IP
        key_func = lambda: f"user:{user_id}" if user_id else get_remote_address()
        
        # Apply rate limit
        if limiter:
            limiter.limit("100 per minute", key_func=key_func)(fn)(*args, **kwargs)
        
        return fn(*args, **kwargs)
    return wrapper

def init_firebase(app):
    """Initialize Firebase and set up Firestore client."""
    global db
    print(f"🔍 init_firebase called, current db value: {db}")
    print(f"🔍 firebase_admin._apps: {firebase_admin._apps}")
    if firebase_admin._apps:  # already initialized
        try:
            db = firestore.client()
            print(f"✅ Firebase already initialized, got Firestore client: {db}")
            print(f"🔍 db id: {id(db)}")
            return
        except Exception as e:
            print(f"⚠️ Firebase already initialized but Firestore client failed: {e}")
            firebase_admin._apps.clear()

    # Try multiple credential sources
    cred = None
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        print(f"✅ Using credentials from GOOGLE_APPLICATION_CREDENTIALS: {cred_path}")
    else:
        # Try different possible paths for credentials
        cred_paths = [
            './firebase-creds.json',
            '/home/ubuntu/secrets/firebase-creds.json',
            os.path.expanduser('~/firebase-creds.json')
        ]
        for path in cred_paths:
            if os.path.exists(path):
                cred = credentials.Certificate(path)
                print(f"✅ Using credentials from: {path}")
                break
    
    try:
        if cred:
            firebase_admin.initialize_app(cred, {
                'projectId': 'offerloop-native',
                'storageBucket': 'offerloop-native.firebasestorage.app'
            })
            print("✅ Firebase initialized with credentials file")
        else:
            # No credentials found - try with project ID only (for cloud environments)
            print("⚠️ No Firebase credentials found, initializing with explicit project ID")
            firebase_admin.initialize_app(options={
                'projectId': 'offerloop-native',
                'storageBucket': 'offerloop-native.firebasestorage.app'
            })
            print("✅ Firebase initialized with project ID option")
        
        db = firestore.client()
        print(f"✅ Firestore client initialized successfully: {db}")
        print(f"🔍 db id: {id(db)}")
        
        # Verify Firebase Admin is properly initialized by checking _apps
        if not firebase_admin._apps:
            raise RuntimeError("Firebase Admin SDK initialization completed but _apps is empty")
        print(f"✅ Firebase Admin SDK verified: {len(firebase_admin._apps)} app(s) initialized")
        
    except Exception as e:
        error_msg = f"❌ Firebase initialization failed: {e}"
        print(error_msg)
        import traceback
        print(traceback.format_exc())
        db = None
        # Don't raise here - allow app to start but auth will fail gracefully
        print("⚠️ App will start but Firebase-dependent features will not work")

def get_db():
    """Returns the Firestore client instance."""
    global db
    print(f"🔍 get_db() called, current db value: {db}, id: {id(db) if db else 'None'}")
    # If db is None but Firebase Admin is initialized, create the client on demand
    if db is None:
        if firebase_admin._apps:
            print("⚠️ db global is None but Firebase Admin is initialized, creating client on demand")
            try:
                db = firestore.client()
                print(f"✅ Firestore client created on demand: {db}, id: {id(db)}")
            except Exception as e:
                print(f"❌ Failed to create Firestore client: {e}")
                raise RuntimeError(f"Failed to create Firestore client: {e}")
        else:
            print("❌ ERROR: Firestore DB is None and Firebase Admin is not initialized!")
            print("❌ Make sure init_firebase() was called during app initialization")
            print("❌ Check GOOGLE_APPLICATION_CREDENTIALS environment variable")
            raise RuntimeError("Firestore DB not initialized. Call init_firebase() first.")
    return db

def require_firebase_auth(fn):
    """
    Decorator to require Firebase authentication for an endpoint.
    Extracts and verifies the Firebase ID token from the Authorization header.
    Allows OPTIONS requests (CORS preflight) to pass through without authentication.
    Includes retry logic for transient network errors.
    """
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        # Allow OPTIONS requests (CORS preflight) to pass through without authentication
        # Flask-CORS will automatically handle these and add the necessary headers
        if request.method == 'OPTIONS':
            # Skip auth check for OPTIONS - let Flask-CORS handle it automatically
            # The route handler will also return early for OPTIONS
            pass  # Continue to route handler which will handle OPTIONS
        else:
            # For non-OPTIONS requests, check authentication
            # Check if Firebase Admin is initialized
            if not firebase_admin._apps:
                error_msg = "Firebase Admin SDK not initialized. Call init_firebase() first."
                print(f"❌ {error_msg}")
                return jsonify({'error': error_msg}), 500
            
            auth_header = request.headers.get('Authorization', '')
            
            if not auth_header.startswith('Bearer '):
                print("❌ Missing or invalid Authorization header format")
                return jsonify({'error': 'Missing Authorization header'}), 401

            id_token = auth_header.split(' ', 1)[1].strip()

            # Retry logic for network errors
            import time
            try:
                import urllib3.exceptions
                URLLIB3_AVAILABLE = True
            except ImportError:
                URLLIB3_AVAILABLE = False
            
            max_retries = 3
            retry_delay = 0.5  # seconds
            
            for attempt in range(max_retries):
                try:
                    decoded = fb_auth.verify_id_token(id_token)
                    request.firebase_user = decoded
                    print(f"✅ Token verified for user: {decoded.get('uid')}")
                    break  # Success, exit retry loop
                except ValueError as ve:
                    # Firebase Admin SDK not initialized error or invalid token format
                    error_str = str(ve)
                    if 'initialize' in error_str.lower() or 'init' in error_str.lower():
                        error_msg = "Firebase Admin SDK not initialized. Call init_firebase() first."
                        print(f"❌ {error_msg}")
                        return jsonify({'error': error_msg}), 500
                    else:
                        # Invalid token format - don't retry
                        print(f"❌ Token verification failed: {ve}")
                        return jsonify({'error': 'Invalid or expired token'}), 401
                except (ConnectionError, OSError) as network_error:
                    # Network-related errors - retry
                    error_str = str(network_error)
                    is_network_error = any(keyword in error_str.lower() for keyword in [
                        'connection', 'remote', 'disconnected', 'aborted', 'timeout', 
                        'network', 'unreachable', 'refused'
                    ])
                    
                    if is_network_error and attempt < max_retries - 1:
                        print(f"⚠️ Network error during token verification (attempt {attempt + 1}/{max_retries}): {network_error}")
                        time.sleep(retry_delay * (attempt + 1))  # Exponential backoff
                        continue
                    else:
                        # Max retries reached or non-retryable network error
                        print(f"❌ Token verification failed after {attempt + 1} attempts: {network_error}")
                        return jsonify({
                            'error': 'Network error during authentication. Please try again.',
                            'retry': True
                        }), 503  # Service Unavailable for network errors
                except Exception as token_error:
                    # Check if it's a network-related error by examining the exception
                    error_str = str(token_error)
                    error_type = type(token_error).__name__
                    
                    # Check for urllib3 errors if available
                    if URLLIB3_AVAILABLE:
                        try:
                            if isinstance(token_error, urllib3.exceptions.HTTPError):
                                if attempt < max_retries - 1:
                                    print(f"⚠️ HTTP error during token verification (attempt {attempt + 1}/{max_retries}): {token_error}")
                                    time.sleep(retry_delay * (attempt + 1))
                                    continue
                                else:
                                    return jsonify({
                                        'error': 'Network error during authentication. Please try again.',
                                        'retry': True
                                    }), 503
                        except:
                            pass
                    
                    # Check for network-related errors in the exception message or type
                    is_network_error = (
                        any(keyword in error_str.lower() for keyword in [
                            'connection', 'remote', 'disconnected', 'aborted', 'timeout',
                            'network', 'unreachable', 'refused'
                        ]) or
                        'Connection' in error_type or
                        'Remote' in error_type
                    )
                    
                    if is_network_error and attempt < max_retries - 1:
                        print(f"⚠️ Network error during token verification (attempt {attempt + 1}/{max_retries}): {token_error}")
                        time.sleep(retry_delay * (attempt + 1))  # Exponential backoff
                        continue
                    else:
                        # Not a network error or max retries reached - treat as auth failure
                        print(f"❌ Token verification failed: {token_error}")
                        if is_network_error:
                            return jsonify({
                                'error': 'Network error during authentication. Please try again.',
                                'retry': True
                            }), 503
                        else:
                            return jsonify({'error': 'Invalid or expired token. Please sign in again.'}), 401
            else:
                # All retries exhausted
                print(f"❌ Token verification failed after {max_retries} attempts")
                return jsonify({
                    'error': 'Authentication service temporarily unavailable. Please try again.',
                    'retry': True
                }), 503

        # Call the route handler - let its exceptions bubble up normally
        # For OPTIONS, the handler will return early; Flask-CORS will add headers
        return fn(*args, **kwargs)
    return wrapper


def require_tier(allowed_tiers):
    """
    Decorator to require specific subscription tier(s) for an endpoint.
    Must be used after @require_firebase_auth.
    
    Args:
        allowed_tiers: List of tier names (e.g., ['pro', 'elite']) or single tier string
    
    Example:
        @require_tier(['pro', 'elite'])
        @require_firebase_auth
        def export_contacts():
            ...
    """
    if isinstance(allowed_tiers, str):
        allowed_tiers = [allowed_tiers]
    
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            # Must have Firebase auth first
            if not hasattr(request, 'firebase_user'):
                return jsonify({'error': 'Authentication required'}), 401
            
            user_id = request.firebase_user.get('uid')
            if not user_id:
                return jsonify({'error': 'User ID not found'}), 401
            
            # SECURITY: Always fetch tier from database, never from request
            db = get_db()
            if not db:
                return jsonify({'error': 'Database not available'}), 500
            
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                
                if not user_doc.exists:
                    # New user defaults to free tier
                    tier = 'free'
                else:
                    user_data = user_doc.to_dict()
                    # Check both subscriptionTier and tier for backward compatibility
                    tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')
                
                # Check if user's tier is allowed
                if tier not in allowed_tiers:
                    tier_names = ', '.join([t.capitalize() for t in allowed_tiers])
                    return jsonify({
                        'error': 'Upgrade required',
                        'message': f'This feature requires {tier_names} subscription',
                        'required_tier': allowed_tiers,
                        'current_tier': tier
                    }), 403
                
                # Store tier in request for use in route handler
                request.user_tier = tier
                return fn(*args, **kwargs)
                
            except Exception as e:
                print(f"Error checking tier: {e}")
                import traceback
                traceback.print_exc()
                return jsonify({'error': 'Failed to verify subscription tier'}), 500
        
        return wrapper
    return decorator

def get_rate_limit_key():
    """
    Custom key function for rate limiting that excludes static assets.
    Returns None for static assets (which exempts them from rate limiting),
    otherwise returns the remote address.
    """
    from flask import request
    # Exclude static assets and root route from rate limiting
    if (request.path.startswith('/assets/') or 
        request.path == '/favicon.ico' or 
        request.path == '/' or
        request.path.endswith('.js') or
        request.path.endswith('.css') or
        request.path.endswith('.png') or
        request.path.endswith('.jpg') or
        request.path.endswith('.svg') or
        request.path.endswith('.woff') or
        request.path.endswith('.woff2')):
        return None  # None exempts from rate limiting
    return get_remote_address()

def init_app_extensions(app: Flask):
    """Initializes Flask extensions like CORS, Rate Limiting, and Firebase."""
    global limiter
    # Initialize rate limiter with custom key function that excludes static assets
    limiter = Limiter(
        app=app,
        key_func=get_rate_limit_key,
        default_limits=["200 per day", "50 per hour"],
        storage_uri="memory://",  # Use in-memory storage (can upgrade to Redis later)
        strategy="fixed-window",
        headers_enabled=True  # Include rate limit headers in response
    )
    app.limiter = limiter
    
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
         },
         automatic_options=True,  # Explicitly enable automatic OPTIONS handling
         supports_credentials=True)
    app.secret_key = os.getenv("FLASK_SECRET", "dev")
    init_firebase(app)  # Initialize Firebase when extensions are initialized