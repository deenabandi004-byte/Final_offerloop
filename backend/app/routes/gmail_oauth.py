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
    print("=" * 70)
    print("🔐 /api/google/oauth/start CALLED")
    print("=" * 70)
    
    db = get_db()
    uid = request.firebase_user["uid"]
    user_email = request.firebase_user.get("email")
    
    print(f"🔐 User requesting OAuth: {user_email} (uid: {uid})")
    
    # Generate secure state token for CSRF protection
    state = secrets.token_urlsafe(32)
    print(f"🔐 Generated state token: {state}")
    
    # Store state in Firestore with user context
    state_data = {
        "uid": uid,
        "email": user_email,
        "created": datetime.utcnow(),
        "expires": datetime.utcnow() + timedelta(minutes=10)
    }
    
    print(f"🔐 Saving state document to Firestore...")
    try:
        db.collection("oauth_state").document(state).set(state_data)
        print(f"✅ State document saved successfully")
        
        # Verify it was saved
        verify_doc = db.collection("oauth_state").document(state).get()
        if verify_doc.exists:
            print(f"✅ Verified: State document exists in Firestore")
        else:
            print(f"⚠️ WARNING: State document not found after saving!")
    except Exception as e:
        print(f"❌ ERROR saving state document: {e}")
        import traceback
        traceback.print_exc()
    
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
    
    response_data = {
        "authUrl": auth_url,
        "state": state
    }
    print(f"✅ Returning OAuth response to frontend")
    print("=" * 70)
    
    return jsonify(response_data)


@gmail_oauth_bp.get("/oauth/callback")
def google_oauth_callback():
    """Handle OAuth callback from Google"""
    import traceback
    from googleapiclient.discovery import build

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
            state_data = sdoc.to_dict() or {}
            uid = state_data.get("uid")
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
        # 1) Exchange code for tokens
        flow = Flow.from_client_config(_gmail_client_config(), scopes=GMAIL_SCOPES)
        flow.redirect_uri = OAUTH_REDIRECT_URI
        flow.fetch_token(code=code)
        creds = flow.credentials

        # 2) Get Gmail profile email
        gmail_service = build("gmail", "v1", credentials=creds)
        profile = gmail_service.users().getProfile(userId="me").execute()
        gmail_email = (profile or {}).get("emailAddress")
        print(f"📧 Gmail profile email: {gmail_email}")

        # 3) Look up the Offerloop user email
        user_doc = db.collection("users").document(uid).get()
        user_email = None
        if user_doc.exists:
            user_email = (user_doc.to_dict() or {}).get("email")
        print(f"👤 App user email for {uid}: {user_email}")

        # 4) Decide what to do based on match / mismatch
        redirect_url = get_frontend_redirect_uri()

        # Build helper to append query params safely
        def add_param(url: str, key: str, value: str) -> str:
            sep = "&" if "?" in url else "?"
            return f"{url}{sep}{key}={value}"

        if gmail_email and user_email and gmail_email.lower() != user_email.lower():
            print("❌ Gmail account does not match app login email; NOT saving creds.")
            # Clean up state doc
            if state:
                db.collection("oauth_state").document(state).delete()
            # Redirect with an explicit error flag
            redirect_url = add_param(redirect_url, "gmail_error", "wrong_account")
            print(f"🔗 Redirecting to frontend with wrong_account: {redirect_url}")
            return redirect(redirect_url)

        # 5) Save creds (only if emails match or we're missing info)
        _save_user_gmail_creds(uid, creds)
        print(f"✅ Gmail credentials saved for user: {uid}")
        print(f"✅ Granted scopes: {creds.scopes}")

        # Clean up state document
        if state:
            db.collection("oauth_state").document(state).delete()

        # 6) Redirect back with ?connected=gmail so SignIn.tsx can react
        redirect_url = add_param(redirect_url, "connected", "gmail")
        print(f"🔗 Redirecting to frontend: {redirect_url}")
        return redirect(redirect_url)

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
    user_email = request.firebase_user.get("email", "unknown")
    
    print(f"🔍 Checking Gmail status for user: {user_email} (uid: {uid})")
    
    # Make sure a creds doc exists first (fast path)
    doc = db.collection("users").document(uid).collection("integrations").document("gmail").get()
    if not doc.exists:
        print(f"❌ No Gmail credentials found for user: {user_email}")
        return jsonify({"connected": False, "reason": "no_credentials"}), 200
    
    print(f"✅ Gmail credentials doc exists for user: {user_email}")
    
    try:
        # Load creds (your existing helper should reconstruct google.oauth2.credentials.Credentials)
        creds = _load_user_gmail_creds(uid)
        if not creds:
            print(f"❌ Failed to load credentials for user: {user_email}")
            return jsonify({"connected": False, "reason": "creds_load_failed"}), 200
        
        print(f"✅ Credentials loaded for user: {user_email}, valid: {creds.valid}")
        
        # Refresh if expired and we have a refresh token
        if not creds.valid and getattr(creds, "refresh_token", None):
            print(f"🔄 Token expired, attempting refresh for user: {user_email}")
            from google.auth.transport.requests import Request
            creds.refresh(Request())
            # persist refreshed access token
            db.collection("users").document(uid).collection("integrations").document("gmail").set(
                {"token": creds.token, "updatedAt": datetime.utcnow()}, merge=True
            )
            print(f"✅ Token refreshed successfully for user: {user_email}")
        
        if not creds.valid:
            print(f"❌ Credentials invalid and no refresh token for user: {user_email}")
            return jsonify({"connected": False, "reason": "invalid_or_no_refresh"}), 200
        
        # Live check against Gmail
        service = _gmail_service(creds)
        profile = service.users().getProfile(userId="me").execute()
        gmail_address = profile.get("emailAddress")
        
        print(f"✅ Gmail connected and working for user: {user_email} → Gmail: {gmail_address}")
        
        return jsonify({
            "connected": True,
            "gmail_address": gmail_address,
            "scopes": list(getattr(creds, "scopes", []) or []),
        }), 200
    
    except Exception as e:
        # Avoid leaking internal errors; return a stable shape
        print(f"❌ Error checking Gmail status for user {user_email}: {e}")
        return jsonify({"connected": False, "reason": "api_error"}), 200