"""
Authentication routes for Chrome Extension
Handles Google OAuth token exchange for MV3-compliant extension authentication
"""
import os
import requests
from flask import Blueprint, request, jsonify
from firebase_admin import auth as fb_auth
from app.extensions import get_db
from app.models.users import create_user_data
from app.config import TIER_CONFIGS

auth_extension_bp = Blueprint('auth_extension', __name__, url_prefix='/api/auth')


@auth_extension_bp.route('/google-extension', methods=['POST', 'OPTIONS'])
def google_extension_auth():
    """
    POST /api/auth/google-extension
    
    Handles authentication for the Chrome extension.
    Receives Google OAuth access token from Chrome Identity API,
    verifies it with Google, finds/creates user, returns Firebase ID token.
    
    Request body:
        {
            "googleToken": "ya29.a0AfH6SMC..."
        }
    
    Response:
        {
            "success": true,
            "token": "firebase_id_token",
            "user": {
                "id": "uid",
                "email": "user@example.com",
                "name": "User Name",
                "picture": "https://..."
            },
            "credits": 150
        }
    """
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers.add('Access-Control-Allow-Origin', request.headers.get('Origin', '*'))
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Max-Age', '3600')
        return response
    
    try:
        data = request.get_json() or {}
        google_token = data.get('googleToken')
        
        if not google_token:
            return jsonify({'error': 'Google token is required'}), 400
        
        print(f'[Auth Extension] Received Google token for verification')
        
        # Step 1: Verify the Google token by fetching user info from Google
        google_userinfo_url = 'https://www.googleapis.com/oauth2/v3/userinfo'
        headers = {'Authorization': f'Bearer {google_token}'}
        
        userinfo_response = requests.get(google_userinfo_url, headers=headers, timeout=10)
        
        if not userinfo_response.ok:
            print(f'[Auth Extension] Google token verification failed: {userinfo_response.status_code}')
            return jsonify({'error': 'Invalid Google token'}), 401
        
        google_user = userinfo_response.json()
        
        if not google_user.get('email'):
            return jsonify({'error': 'Could not retrieve email from Google'}), 400
        
        email = google_user['email']
        name = google_user.get('name', '')
        picture = google_user.get('picture', '')
        google_sub = google_user.get('sub', '')
        
        print(f'[Auth Extension] Google user verified: {email}')
        
        # Step 2: Find or create Firebase user
        db = get_db()
        firebase_user = None
        user_id = None
        
        try:
            # Try to get user by email
            firebase_user = fb_auth.get_user_by_email(email)
            user_id = firebase_user.uid
            print(f'[Auth Extension] Found existing Firebase user: {user_id}')
        except fb_auth.UserNotFoundError:
            # User doesn't exist - create new user
            print(f'[Auth Extension] Creating new Firebase user for: {email}')
            
            try:
                firebase_user = fb_auth.create_user(
                    email=email,
                    display_name=name,
                    photo_url=picture,
                    email_verified=google_user.get('email_verified', False),
                )
                user_id = firebase_user.uid
                print(f'[Auth Extension] Created Firebase user: {user_id}')
            except Exception as create_error:
                print(f'[Auth Extension] Error creating Firebase user: {create_error}')
                return jsonify({'error': 'Failed to create user account'}), 500
        except Exception as lookup_error:
            print(f'[Auth Extension] Error looking up user: {lookup_error}')
            return jsonify({'error': 'Authentication service error'}), 500
        
        # Step 3: Ensure user document exists in Firestore
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            # Create user document in Firestore
            print(f'[Auth Extension] Creating Firestore user document for: {user_id}')
            tier = 'free'
            tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
            
            user_data = create_user_data(
                uid=user_id,
                email=email,
                tier=tier,
                name=name,
                credits=tier_config.get('credits', 150),
                max_credits=tier_config.get('credits', 150)
            )
            
            user_ref.set(user_data)
            print(f'[Auth Extension] Created Firestore user document')
        else:
            # Update user document with latest info if needed
            user_data = user_doc.to_dict() or {}
            updates = {}
            
            if not user_data.get('name') and name:
                updates['name'] = name
            if not user_data.get('picture') and picture:
                updates['picture'] = picture
            
            if updates:
                user_ref.update(updates)
                print(f'[Auth Extension] Updated Firestore user document')
        
        # Get current user data for credits
        user_doc = user_ref.get()
        user_data = user_doc.to_dict() or {}
        credits = user_data.get('credits', TIER_CONFIGS.get('free', {}).get('credits', 150))
        
        # Step 4: Create custom token and exchange for ID token
        # Firebase Admin can create custom tokens, but we need ID tokens for the extension
        # We'll exchange the custom token for an ID token using Firebase REST API
        try:
            # Create custom token
            custom_token = fb_auth.create_custom_token(user_id)
            custom_token_str = custom_token.decode('utf-8')
            
            # Get Firebase Web API key from environment
            # This is the API key from Firebase Console > Project Settings > General > Web API Key
            firebase_api_key = os.environ.get('FIREBASE_API_KEY') or os.environ.get('FIREBASE_WEB_API_KEY')
            
            if not firebase_api_key:
                # Try to get from Firebase project ID (if we have it)
                # For now, return error with helpful message
                print('[Auth Extension] FIREBASE_API_KEY not found in environment')
                print('[Auth Extension] Please set FIREBASE_API_KEY or FIREBASE_WEB_API_KEY in .env')
                return jsonify({
                    'error': 'Server configuration error',
                    'message': 'FIREBASE_API_KEY environment variable is required. Please set it in your .env file. You can find it in Firebase Console > Project Settings > General > Web API Key'
                }), 500
            
            # Exchange custom token for ID token using Firebase REST API
            exchange_url = f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={firebase_api_key}'
            exchange_payload = {
                'token': custom_token_str,
                'returnSecureToken': True
            }
            
            exchange_response = requests.post(
                exchange_url,
                json=exchange_payload,
                timeout=10
            )
            
            if not exchange_response.ok:
                error_data = exchange_response.json() if exchange_response.text else {}
                error_message = error_data.get('error', {}).get('message', 'Unknown error')
                print(f'[Auth Extension] Failed to exchange custom token: {exchange_response.status_code}')
                print(f'[Auth Extension] Error: {error_message}')
                print(f'[Auth Extension] Response: {exchange_response.text}')
                return jsonify({
                    'error': 'Failed to generate authentication token',
                    'message': error_message
                }), 500
            
            exchange_data = exchange_response.json()
            id_token = exchange_data.get('idToken')
            
            if not id_token:
                print(f'[Auth Extension] No ID token in exchange response: {exchange_data}')
                return jsonify({'error': 'Failed to generate authentication token'}), 500
            
            print(f'[Auth Extension] Successfully generated ID token for user: {user_id}')
            
        except Exception as token_error:
            print(f'[Auth Extension] Error creating/exchanging token: {token_error}')
            import traceback
            traceback.print_exc()
            return jsonify({
                'error': 'Failed to generate authentication token',
                'message': str(token_error)
            }), 500
        
        # Step 5: Return response
        return jsonify({
            'success': True,
            'token': id_token,
            'user': {
                'id': user_id,
                'email': email,
                'name': name,
                'picture': picture,
            },
            'credits': credits,
        }), 200
        
    except requests.RequestException as req_error:
        print(f'[Auth Extension] Request error: {req_error}')
        return jsonify({'error': 'Network error during authentication'}), 500
    except Exception as error:
        print(f'[Auth Extension] Authentication error: {error}')
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Authentication failed',
            'message': str(error)
        }), 500
