"""
Gmail OAuth routes
"""
import os
import secrets
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, redirect
from urllib.parse import urlencode
from google_auth_oauthlib.flow import Flow

from app.config import GMAIL_SCOPES, OAUTH_REDIRECT_URI, get_frontend_redirect_uri
from ..extensions import require_firebase_auth
from app.services.gmail_client import _gmail_client_config, _save_user_gmail_creds, _load_user_gmail_creds, _gmail_service
from ..extensions import get_db

gmail_oauth_bp = Blueprint('gmail_oauth', __name__, url_prefix='/api/google')


@gmail_oauth_bp.get("/oauth/start")
@require_firebase_auth
def google_oauth_start():
    """Initiate Gmail OAuth flow with proper state management"""
    db = get_db()
    uid = request.firebase_user["uid"]
    user_email = request.firebase_user.get("email")
    
    # Generate secure state token for CSRF protection
    state = secrets.token_urlsafe(32)
    
    # Store state in Firestore with user context
    db.collection("oauth_state").document(state).set({
        "uid": uid,
        "email": user_email,
        "created": datetime.utcnow(),
        "expires": datetime.utcnow() + timedelta(minutes=10)
    })
    
    print(f"🔐 Creating OAuth flow for user: {user_email} (uid: {uid})")
    print(f"🔐 State token: {state}")
    
    # Build OAuth URL with all required scopes
    CLIENT_ID = os.environ["GOOGLE_CLIENT_ID"]
    REDIRECT_URI = OAUTH_REDIRECT_URI
    AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
    
    # Use GMAIL_SCOPES constant for consistency
    scope_string = " ".join(GMAIL_SCOPES)
    
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": scope_string,
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state,
        "login_hint": user_email,
    }
    
    auth_url = f"{AUTH_BASE}?{urlencode(params)}"
    
    print(f"🔐 OAuth URL: {auth_url}")
    print(f"🔐 Requesting scopes: {scope_string}")
    
    return jsonify({
        "authUrl": auth_url,
        "state": state
    })


@gmail_oauth_bp.get("/oauth/callback")
def google_oauth_callback():
    """Handle OAuth callback from Google"""
    import traceback
    db = get_db()
    
    state = request.args.get("state")
    code = request.args.get("code")
    
    print(f"🔍 OAuth Callback - State: {state}, Code: {'present' if code else 'missing'}")
    print(f"🔍 Full callback URL: {request.url}")
    print(f"🔍 Configured redirect URI: {OAUTH_REDIRECT_URI}")
    
    if not code:
        return jsonify({"error": "Missing authorization code"}), 400
    
    # Extract UID from state
    uid = None
    if state:
        try:
            sdoc = db.collection("oauth_state").document(state).get()
            if not sdoc.exists:
                print(f"❌ State document not found: {state}")
                return jsonify({"error": "Invalid state parameter"}), 400
            uid = sdoc.to_dict().get("uid")
            print(f"✅ Found UID from state: {uid}")
        except Exception as e:
            print(f"❌ Error retrieving state: {e}")
            return jsonify({"error": "State lookup failed"}), 400
    else:
        # no state because start URL didn't include it — allow during local testing
        print("⚠️ No state parameter - using fallback UID")
        uid = (getattr(request, "firebase_user", {}) or {}).get("uid") or "local_test"
    
    if not uid:
        return jsonify({"error": "Could not identify user"}), 400
    
    try:
        # Create flow WITHOUT state parameter for token exchange
        flow = Flow.from_client_config(_gmail_client_config(), scopes=GMAIL_SCOPES)
        flow.redirect_uri = OAUTH_REDIRECT_URI
        
        # Use code parameter instead of authorization_response
        flow.fetch_token(code=code)
        
        creds = flow.credentials
        _save_user_gmail_creds(uid, creds)
        print(f"✅ Gmail credentials saved for user: {uid}")
        print(f"✅ Granted scopes: {creds.scopes}")
        
        # Clean up state document
        if state:
            db.collection("oauth_state").document(state).delete()
        
        # Redirect to appropriate frontend based on environment
        frontend_url = get_frontend_redirect_uri()
        print(f"🔗 Redirecting to frontend: {frontend_url}")
        return redirect(frontend_url)
        
    except Exception as e:
        print(f"❌ OAuth token exchange failed: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Token exchange failed: {str(e)}"}), 500


@gmail_oauth_bp.get("/gmail/status")
@require_firebase_auth
def gmail_status():
    """Return whether Gmail is connected for the signed-in user."""
    db = get_db()
    uid = request.firebase_user["uid"]
    
    # Make sure a creds doc exists first (fast path)
    doc = db.collection("users").document(uid).collection("integrations").document("gmail").get()
    if not doc.exists:
        return jsonify({"connected": False, "reason": "no_credentials"}), 200
    
    try:
        # Load creds (your existing helper should reconstruct google.oauth2.credentials.Credentials)
        creds = _load_user_gmail_creds(uid)
        if not creds:
            return jsonify({"connected": False, "reason": "creds_load_failed"}), 200
        
        # Refresh if expired and we have a refresh token
        if not creds.valid and getattr(creds, "refresh_token", None):
            from google.auth.transport.requests import Request
            creds.refresh(Request())
            # persist refreshed access token
            db.collection("users").document(uid).collection("integrations").document("gmail").set(
                {"token": creds.token, "updatedAt": datetime.utcnow()}, merge=True
            )
        
        if not creds.valid:
            return jsonify({"connected": False, "reason": "invalid_or_no_refresh"}), 200
        
        # Live check against Gmail
        service = _gmail_service(creds)
        profile = service.users().getProfile(userId="me").execute()
        
        return jsonify({
            "connected": True,
            "gmail_address": profile.get("emailAddress"),
            "scopes": list(getattr(creds, "scopes", []) or []),
        }), 200
    
    except Exception as e:
        # Avoid leaking internal errors; return a stable shape
        return jsonify({"connected": False, "reason": "api_error"}), 200

