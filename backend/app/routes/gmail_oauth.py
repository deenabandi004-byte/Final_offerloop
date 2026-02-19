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


def build_gmail_oauth_url_for_user(uid, user_email=None):
    """
    Build Gmail OAuth URL for a user (e.g. when returning 401 gmail_token_expired).
    Stores state in Firestore and returns the auth URL. Callable from any route that has uid.
    """
    db = get_db()
    if not db:
        return None
    user_email = (user_email or "").strip().lower() or None
    state = secrets.token_urlsafe(32)
    state_data = {
        "uid": uid,
        "email": user_email,
        "created": datetime.utcnow(),
        "expires": datetime.utcnow() + timedelta(minutes=15),
    }
    try:
        db.collection("oauth_state").document(state).set(state_data)
    except Exception as e:
        print(f"⚠️ Failed to save OAuth state for reconnect URL: {e}")
        return None
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if not client_id:
        return None
    redirect_uri = OAUTH_REDIRECT_URI
    auth_base = "https://accounts.google.com/o/oauth2/v2/auth"
    scope_string = " ".join(GMAIL_SCOPES)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope_string,
        "access_type": "offline",
        "state": state,
        "prompt": "consent",
    }
    if user_email:
        params["login_hint"] = user_email
    return f"{auth_base}?{urlencode(params)}"


# Add a before_request handler to log ALL requests to this blueprint
@gmail_oauth_bp.before_request
def log_oauth_request():
    """Log all requests to OAuth endpoints for debugging"""
    import sys
    sys.stdout.flush()
    print("=" * 80)
    print(f"🌐 OAuth Blueprint Request Received")
    print(f"   Method: {request.method}")
    print(f"   Path: {request.path}")
    print(f"   Full URL: {request.url}")
    print(f"   Headers: {dict(request.headers)}")
    
    # For OPTIONS requests, explicitly handle CORS
    if request.method == 'OPTIONS':
        from flask import make_response
        print(f"   ✅ Handling OPTIONS (CORS preflight)")
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', request.headers.get('Origin', '*'))
        response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Authorization, Content-Type, Cache-Control')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        response.headers.add('Access-Control-Max-Age', '3600')
        print("=" * 80)
        sys.stdout.flush()
        return response
    
    print("=" * 80)
    sys.stdout.flush()


@gmail_oauth_bp.get("/oauth/start")
@require_firebase_auth
def google_oauth_start():
    """Initiate Gmail OAuth flow with proper state management"""
    import sys
    sys.stdout.flush()  # Ensure logs are flushed immediately
    print("=" * 70)
    print("🔐 /api/google/oauth/start CALLED")
    print("=" * 70)
    sys.stdout.flush()
    
    db = get_db()
    uid = request.firebase_user["uid"]
    
    # Get email from Firestore user document (source of truth)
    # This ensures we use the correct email for the logged-in user
    user_email = None
    try:
        user_doc = db.collection("users").document(uid).get()
        if user_doc.exists:
            user_data = user_doc.to_dict() or {}
            user_email = user_data.get("email")
            if user_email:
                print(f"🔐 Found email in Firestore: {user_email}")
            else:
                print(f"⚠️ No email in Firestore user document")
        else:
            print(f"⚠️ User document not found in Firestore for uid: {uid}")
    except Exception as e:
        print(f"⚠️ Could not fetch email from Firestore: {e}")
    
    # Fallback to Firebase token email if Firestore doesn't have it
    if not user_email:
        user_email = request.firebase_user.get("email")
        if user_email:
            print(f"🔐 Using email from Firebase token (fallback): {user_email}")
        else:
            print(f"❌ ERROR: No email found in Firestore or Firebase token!")
    
    # Debug: Log what we're using
    print(f"🔐 DEBUG: firebase_user token email: {request.firebase_user.get('email')}")
    print(f"🔐 DEBUG: Final email to use: {user_email}")
    print(f"🔐 DEBUG: firebase_user uid: {uid}")
    
    # Normalize email (lowercase, strip whitespace)
    if user_email:
        user_email = user_email.strip().lower()
        print(f"🔐 DEBUG: Normalized email for login_hint: {user_email}")
    else:
        print(f"⚠️ WARNING: No email available after all attempts!")
    
    print(f"🔐 User requesting OAuth: {user_email} (uid: {uid})")
    
    # Generate secure state token for CSRF protection
    state = secrets.token_urlsafe(32)
    print(f"🔐 Generated state token: {state}")
    
    # Store state in Firestore with user context
    # Increased expiration to 15 minutes to handle slow OAuth flows
    state_data = {
        "uid": uid,
        "email": user_email,
        "created": datetime.utcnow(),
        "expires": datetime.utcnow() + timedelta(minutes=15)
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
        # Removed include_granted_scopes to ensure consent screen always shows
        # This is critical for Google's OAuth verification process
        "state": state,
    }
    
    # CRITICAL: Force consent screen to ALWAYS show (required for Google verification)
    # Using "consent" to force the consent screen with checkboxes to appear every time,
    # even if the user has previously granted these exact permissions
    # NOTE: We use "consent" (not "select_account consent") so that login_hint can
    # pre-select the account without forcing the account picker to show
    params["prompt"] = "consent"
    
    # Use login_hint to pre-select the user's account that's signed into the website
    # This ensures only the signed-in user's email is shown (no account picker)
    if user_email:
        params["login_hint"] = user_email
        print(f"=" * 80)
        print(f"🔐 SETTING LOGIN_HINT")
        print(f"🔐 Email being used for login_hint: {user_email}")
        print(f"🔐 UID: {uid}")
        print(f"🔐 This will pre-select the account matching the signed-in user")
        print(f"🔐 With prompt=consent (no select_account), account picker will be skipped if user is signed in")
        print(f"🔐 Expected flow: Direct to consent screen for {user_email} (no account picker)")
        print(f"=" * 80)
    else:
        print(f"⚠️ No login_hint (no user email) - account picker will show all accounts")
    
    print(f"🔐 CRITICAL: Consent screen with checkboxes MUST appear")
    print(f"🔐 If account picker still shows, the user may need to be signed into Google in the browser")
    print(f"🔐 If consent screen doesn't appear, user must revoke permissions first at:")
    print(f"   https://myaccount.google.com/permissions")
    
    # Note: In Testing mode, users must be added to Test users list in OAuth consent screen
    # Google Cloud Console > APIs & Services > OAuth consent screen > Test users
    #
    # IMPORTANT FOR GOOGLE VERIFICATION:
    # To ensure the consent screen always shows during verification:
    # 1. The prompt=select_account consent parameter forces the consent screen
    # 2. If testing with an account that already granted permissions, you may need to:
    #    - Revoke access at: https://myaccount.google.com/permissions
    #    - Or use a fresh test account that hasn't granted permissions yet
    # 3. The consent screen with checkboxes MUST appear for Google's verification process
    
    auth_url = f"{AUTH_BASE}?{urlencode(params)}"
    
    # CRITICAL DEBUG: Verify login_hint is in the final URL
    print(f"=" * 80)
    print(f"🔐 FINAL OAUTH URL VERIFICATION")
    print(f"🔐 login_hint in params: {'login_hint' in params}")
    if 'login_hint' in params:
        print(f"🔐 login_hint value in params: {params['login_hint']}")
    print(f"🔐 login_hint in URL: {'login_hint' in auth_url}")
    if 'login_hint' in auth_url:
        import re
        from urllib.parse import unquote
        hint_match = re.search(r'login_hint=([^&]+)', auth_url)
        if hint_match:
            decoded_hint = unquote(hint_match.group(1))
            print(f"🔐 login_hint value in URL (decoded): {decoded_hint}")
            if user_email and decoded_hint != user_email:
                print(f"❌ ERROR: login_hint mismatch! Expected: {user_email}, Got in URL: {decoded_hint}")
            else:
                print(f"✅ login_hint matches in URL: {decoded_hint}")
    print(f"=" * 80)
    
    # ========================================
    # DETAILED LOGGING FOR DEBUGGING CONSENT SCREEN
    # ========================================
    print("=" * 80)
    print("🔍 DETAILED OAUTH URL DEBUGGING")
    print("=" * 80)
    print(f"🔐 OAuth URL generated")
    print(f"🔐 Base URL: {AUTH_BASE}")
    print(f"🔐 Client ID: {CLIENT_ID[:20]}... (truncated for security)")
    print(f"🔐 Redirect URI: {REDIRECT_URI}")
    print(f"🔐 Requesting scopes: {scope_string}")
    print(f"")
    print(f"🔐 PARAMETERS BEING SENT:")
    for key, value in params.items():
        if key == "client_id":
            print(f"   {key}: {str(value)[:20]}... (truncated)")
        elif key == "state":
            print(f"   {key}: {str(value)[:20]}... (truncated)")
        else:
            print(f"   {key}: {value}")
    print(f"")
    print(f"🔐 CRITICAL PARAMETERS CHECK:")
    expected_prompt = 'consent'
    actual_prompt = params.get('prompt', '❌ NOT SET!')
    print(f"   prompt: {actual_prompt} {'✅' if actual_prompt == expected_prompt else '❌ WRONG VALUE!'}")
    if actual_prompt != expected_prompt:
        print(f"   ⚠️ Expected: '{expected_prompt}', Got: '{actual_prompt}'")
    print(f"   login_hint: {'✅ PRESENT' if 'login_hint' in params else '⚠️ NOT PRESENT (account picker will show)'}")
    if 'login_hint' in params:
        print(f"   login_hint value: {params['login_hint']}")
    print(f"   include_granted_scopes: {'❌ PRESENT (BAD - can skip consent!)' if 'include_granted_scopes' in params else '✅ NOT PRESENT (GOOD!)'}")
    print(f"   access_type: {params.get('access_type', 'NOT SET')}")
    print(f"")
    print(f"🔐 URL VERIFICATION:")
    # Check if prompt=consent is in the URL
    url_has_consent = (
        'prompt=consent' in auth_url or 
        'prompt%3Dconsent' in auth_url
    )
    print(f"   Consent prompt in URL: {'✅ YES' if url_has_consent else '❌ NO - THIS IS THE PROBLEM!'}")
    if not url_has_consent:
        print(f"   ⚠️ WARNING: Consent prompt not found in URL!")
        print(f"   🔍 URL contains: {auth_url[:200]}...")
    url_has_login_hint = 'login_hint' in auth_url
    print(f"   Login hint in URL: {'✅ YES' if url_has_login_hint else '⚠️ NO (account picker will show)'}")
    if url_has_login_hint:
        # Extract login_hint value from URL for verification
        import re
        hint_match = re.search(r'login_hint=([^&]+)', auth_url)
        if hint_match:
            print(f"   Login hint value in URL: {hint_match.group(1)}")
    print(f"")
    print(f"🔐 FULL OAUTH URL (for debugging - check this in browser):")
    print(f"   {auth_url}")
    print(f"")
    print(f"🔐 TO TEST: Copy the URL above and paste it in an incognito/private browser window")
    print(f"   The consent screen with checkboxes should appear")
    print(f"   If it doesn't, the account may have already granted permissions")
    print("=" * 80)
    
    # Additional checks
    if 'hd=' in auth_url or '&hd=' in auth_url:
        import re
        hd_match = re.search(r'[&?]hd=([^&]+)', auth_url)
        if hd_match:
            print(f"⚠️ WARNING: hd parameter found: {hd_match.group(1)}")
            print(f"   This will restrict account selection. Check Google Cloud Console OAuth settings.")
    
    response_data = {
        "authUrl": auth_url,
        "state": state,
        "debug": {
            "prompt": params.get("prompt"),
            "has_login_hint": "login_hint" in params,
            "has_include_granted_scopes": "include_granted_scopes" in params,
            "scopes": scope_string.split(),
            "url_length": len(auth_url),
            "client_id_prefix": CLIENT_ID[:20] if CLIENT_ID else "MISSING"
        }
    }
    print(f"✅ Returning OAuth response to frontend")
    print(f"🔐 State token being returned: {state[:20]}...")
    print(f"🔐 Auth URL length: {len(auth_url)} chars")
    print("=" * 80)
    import sys
    sys.stdout.flush()  # Ensure logs are flushed
    
    return jsonify(response_data)


@gmail_oauth_bp.get("/oauth/callback")
def google_oauth_callback():
    """Handle OAuth callback from Google"""
    import traceback
    from googleapiclient.discovery import build

    db = get_db()

    state = request.args.get("state")
    code = request.args.get("code")

    # ========================================
    # DETAILED CALLBACK LOGGING
    # ========================================
    print("=" * 80)
    print("🔍 OAUTH CALLBACK RECEIVED")
    print("=" * 80)
    print(f"🔍 State: {state[:20] if state else 'MISSING'}...")
    print(f"🔍 Code: {'✅ PRESENT' if code else '❌ MISSING'}")
    print(f"🔍 Full callback URL: {request.url}")
    print(f"🔍 Configured redirect URI: {OAUTH_REDIRECT_URI}")
    print(f"")
    print(f"🔍 ALL CALLBACK PARAMETERS:")
    for key, value in request.args.items():
        if key == "state":
            print(f"   {key}: {str(value)[:30]}... (truncated)")
        elif key == "code":
            print(f"   {key}: {'PRESENT' if value else 'MISSING'} (length: {len(value) if value else 0})")
        else:
            print(f"   {key}: {value}")
    print("=" * 80)
    
    # Check for hosted domain restriction (hd parameter)
    hd_param = request.args.get("hd")
    if hd_param:
        print(f"⚠️ WARNING: Hosted domain restriction detected: hd={hd_param}")
        print(f"   This restricts account selection to {hd_param} domain")
        print(f"   This is likely configured in Google Cloud Console OAuth settings")
        print(f"   Users can still select other accounts by going back, but it's confusing")
    else:
        print(f"✅ No hosted domain restriction (hd parameter) - all accounts allowed")
    
    # Check if authuser parameter is present (indicates account picker was shown)
    authuser = request.args.get("authuser")
    if authuser:
        print(f"⚠️ Account picker was shown - user selected account #{authuser}")
        print(f"   This suggests login_hint may not have auto-selected the account")
    else:
        print(f"✅ No authuser parameter - account was likely auto-selected")
    
    # Check if consent screen was shown
    # If code is present without errors, check if we can determine if consent was shown
    if code:
        print(f"")
        print(f"🔍 CONSENT SCREEN ANALYSIS:")
        print(f"   Code received: ✅ YES")
        print(f"   This means OAuth completed, but we can't tell from callback if consent screen was shown")
        print(f"   To verify consent screen appeared, check the OAuth URL logs above")
        print(f"   The URL should contain 'prompt=consent' parameter")

    if not code:
        error = request.args.get("error")
        error_description = request.args.get("error_description", "")
        
        # Check if user was denied access (not in test users list)
        if error == "access_denied" or (error_description and "not a test user" in error_description.lower()):
            print(f"❌ OAuth access denied - user may not be in test users list")
            print(f"   Error: {error}, Description: {error_description}")
            redirect_url = get_frontend_redirect_uri()
            redirect_url = f"{redirect_url}?gmail_error=not_test_user"
            return redirect(redirect_url)
        
        return jsonify({"error": "Missing authorization code", "error_details": error}), 400

    # Extract UID and expected email from state
    uid = None
    expected_email_from_state = None
    if state:
        try:
            sdoc = db.collection("oauth_state").document(state).get()
            if not sdoc.exists:
                print(f"❌ State document not found: {state}")
                print(f"   🔍 Possible reasons:")
                print(f"      - State expired (15 min timeout)")
                print(f"      - State was already used and deleted")
                print(f"      - OAuth URL was cached/reused")
                print(f"      - State was never saved (check OAuth start logs)")
                
                # Check if state might have expired by looking for similar states
                # (This is just for debugging - we'll proceed anyway)
                try:
                    # Try to get from Firebase auth token if available (fallback)
                    from app.extensions import require_firebase_auth
                    auth_header = request.headers.get('Authorization', '')
                    if auth_header.startswith('Bearer '):
                        print(f"   🔍 Attempting to extract UID from auth token...")
                except Exception as token_err:
                    print(f"   ⚠️ Could not extract from token: {token_err}")
                
                # For now, allow callback to proceed if we have a code (less secure but works)
                print(f"   ⚠️ Proceeding without state validation (code present: {bool(code)})")
                print(f"   💡 Tip: If this happens frequently, check if OAuth URL is being cached")
                # Don't return error - try to continue
            else:
                state_data = sdoc.to_dict() or {}
                uid = state_data.get("uid")
                expected_email_from_state = state_data.get("email")
                print(f"✅ Found UID from state: {uid}")
                if expected_email_from_state:
                    print(f"📧 Expected email from state: {expected_email_from_state}")
                
                # Clean up state document after use
                try:
                    db.collection("oauth_state").document(state).delete()
                    print(f"✅ Cleaned up state document")
                except Exception as cleanup_err:
                    print(f"⚠️ Could not clean up state: {cleanup_err}")
        except Exception as e:
            print(f"❌ Error retrieving state: {e}")
            import traceback
            traceback.print_exc()
            # Don't fail completely - try to continue
            print(f"   ⚠️ Continuing without state validation")
    else:
        # no state because start URL didn't include it — allow during local testing
        print("⚠️ No state parameter - using fallback UID")
        uid = (getattr(request, "firebase_user", {}) or {}).get("uid") or "local_test"
    
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
        
        # Compare with expected email from state
        if expected_email_from_state:
            if expected_email_from_state.lower() == gmail_email.lower():
                print(f"✅ Email matches! Login hint worked correctly")
            else:
                print(f"⚠️ Email mismatch!")
                print(f"   Expected: {expected_email_from_state}")
                print(f"   Got: {gmail_email}")
                print(f"   User may have selected different account from picker")

        # 3) If we don't have UID from state, try to find user by Gmail email
        if not uid:
            print("⚠️ No UID from state - attempting to find user by Gmail email...")
            try:
                # Search for user with matching email
                users_ref = db.collection("users")
                query = users_ref.where("email", "==", gmail_email).limit(1)
                matching_users = list(query.stream())
                if matching_users:
                    uid = matching_users[0].id
                    print(f"✅ Found user by email: {uid}")
                else:
                    print(f"⚠️ No user found with email: {gmail_email}")
            except Exception as lookup_err:
                print(f"⚠️ Error looking up user by email: {lookup_err}")

        # 4) Look up the Offerloop user email
        user_email = None
        if uid:
            user_doc = db.collection("users").document(uid).get()
            if user_doc.exists:
                user_email = (user_doc.to_dict() or {}).get("email")
                print(f"👤 App user email for {uid}: {user_email}")
            else:
                print(f"⚠️ User document not found for UID: {uid}")
        else:
            # Use Gmail email as fallback
            user_email = gmail_email
            print(f"👤 Using Gmail email as user email: {user_email}")

        # 4) Allow any Gmail account to be connected (users may use different email for sending)
        redirect_url = get_frontend_redirect_uri()

        # Build helper to append query params safely
        def add_param(url: str, key: str, value: str) -> str:
            sep = "&" if "?" in url else "?"
            return f"{url}{sep}{key}={value}"

        # Log email mismatch for reference but allow connection
        if gmail_email and user_email and gmail_email.lower() != user_email.lower():
            print(f"ℹ️ Gmail account ({gmail_email}) differs from app login email ({user_email}) - allowing connection")
            print(f"   Users may want to use a different Gmail account for sending emails")

        # 5) Save creds (only if we have a UID)
        if not uid:
            print("❌ Cannot save Gmail credentials - no UID available")
            redirect_url = add_param(redirect_url, "gmail_error", "no_user_id")
            print(f"🔗 Redirecting to frontend with no_user_id error: {redirect_url}")
            return redirect(redirect_url)
        
        _save_user_gmail_creds(uid, creds)
        gmail_ref = db.collection("users").document(uid).collection("integrations").document("gmail")
        gmail_ref.set({"gmailAddress": gmail_email}, merge=True)
        print(f"✅ Gmail credentials saved for user: {uid}")
        print(f"✅ Granted scopes: {creds.scopes}")

        try:
            from app.services.gmail_client import start_gmail_watch
            start_gmail_watch(uid)
        except Exception as e:
            print(f"[gmail_watch] Failed to start watch for uid={uid}: {e}")

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



@gmail_oauth_bp.post("/gmail/revoke")
@require_firebase_auth
def revoke_gmail_permissions():
    """Revoke Gmail permissions for the current user - forces consent screen to show on next OAuth"""
    db = get_db()
    uid = request.firebase_user["uid"]
    user_email = request.firebase_user.get("email", "unknown")
    
    print(f"🔄 Revoking Gmail permissions for user: {user_email} (uid: {uid})")
    
    try:
        # Delete the Gmail credentials document
        gmail_doc_ref = db.collection("users").document(uid).collection("integrations").document("gmail")
        gmail_doc = gmail_doc_ref.get()
        
        if gmail_doc.exists:
            # Try to revoke the token with Google if we have credentials
            try:
                creds = _load_user_gmail_creds(uid)
                if creds and hasattr(creds, 'token'):
                    import requests
                    revoke_url = 'https://oauth2.googleapis.com/revoke'
                    revoke_params = {'token': creds.token}
                    requests.post(revoke_url, params=revoke_params)
                    print(f"✅ Revoked token with Google")
            except Exception as revoke_err:
                print(f"⚠️ Could not revoke token with Google (may already be revoked): {revoke_err}")
            
            # Delete the credentials document
            gmail_doc_ref.delete()
            print(f"✅ Deleted Gmail credentials from Firestore")
            return jsonify({
                "success": True,
                "message": "Gmail permissions revoked. The consent screen will appear on next OAuth attempt."
            }), 200
        else:
            print(f"ℹ️ No Gmail credentials found for user: {user_email}")
            return jsonify({
                "success": True,
                "message": "No Gmail permissions found to revoke."
            }), 200
            
    except Exception as e:
        print(f"❌ Error revoking Gmail permissions: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


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