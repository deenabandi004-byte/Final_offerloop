#!/usr/bin/env python3
"""
Manual OAuth Token Exchange Test
This tests if your credentials work directly with Google's token endpoint
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = os.getenv("OAUTH_REDIRECT_URI")

print("=" * 70)
print("🧪 MANUAL OAUTH TOKEN EXCHANGE TEST")
print("=" * 70)

print("\n⚠️  This test requires you to get a fresh authorization code.")
print("   We'll test if your credentials can exchange a code for tokens.\n")

# Step 1: Generate auth URL
auth_url = (
    "https://accounts.google.com/o/oauth2/v2/auth?"
    f"client_id={CLIENT_ID}&"
    f"redirect_uri={REDIRECT_URI}&"
    "response_type=code&"
    "scope=https://www.googleapis.com/auth/gmail.compose openid email profile&"
    "access_type=offline&"
    "prompt=consent"
)

print("📝 Step 1: Get Authorization Code")
print("-" * 70)
print("1. Open this URL in your browser:")
print(f"\n{auth_url}\n")
print("2. Approve the permissions")
print("3. You'll be redirected to a URL like:")
print("   http://localhost:5001/api/google/oauth/callback?code=4/0Ab32j...")
print("4. Copy ONLY the 'code' parameter value (the long string after code=)")
print()

code = input("Paste the authorization code here: ").strip()

if not code:
    print("❌ No code provided. Exiting.")
    exit(1)

print("\n🔄 Step 2: Testing Token Exchange")
print("-" * 70)
print(f"Using Client ID: {CLIENT_ID[:30]}...")
print(f"Using Client Secret: {'*' * 20}")
print(f"Using Redirect URI: {REDIRECT_URI}")
print(f"Using Code: {code[:30]}...\n")

# Step 2: Try to exchange code for tokens
token_url = "https://oauth2.googleapis.com/token"
data = {
    "code": code,
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "redirect_uri": REDIRECT_URI,
    "grant_type": "authorization_code"
}

try:
    response = requests.post(token_url, data=data)
    
    print(f"📡 Response Status: {response.status_code}")
    print("-" * 70)
    
    if response.status_code == 200:
        print("✅ SUCCESS! Token exchange worked!")
        print("\n🎉 This means your credentials are CORRECT!")
        print("\nThe 'invalid_client' error in your Flask app must be caused by:")
        print("  1. Credentials not loading properly in Flask")
        print("  2. Different credentials being used")
        print("  3. Issue with how Flow.from_client_config() constructs the request")
        
        tokens = response.json()
        print("\n📦 Received tokens:")
        print(f"  - Access token: {tokens.get('access_token', 'N/A')[:30]}...")
        print(f"  - Refresh token: {'Yes' if tokens.get('refresh_token') else 'No'}")
        print(f"  - Expires in: {tokens.get('expires_in', 'N/A')} seconds")
        
    else:
        print("❌ FAILED! Token exchange failed.")
        error_data = response.json()
        error = error_data.get('error', 'unknown')
        error_desc = error_data.get('error_description', 'No description')
        
        print(f"\n🔴 Error: {error}")
        print(f"   Description: {error_desc}")
        
        if error == "invalid_client":
            print("\n💡 This confirms your credentials are WRONG!")
            print("\n🔧 To fix:")
            print("  1. Go to: https://console.cloud.google.com/apis/credentials")
            print("  2. Find your OAuth 2.0 Client ID")
            print("  3. Verify the Client ID EXACTLY matches your .env:")
            print(f"     {CLIENT_ID}")
            print("  4. Click 'SHOW' next to Client secret and copy it")
            print("  5. Verify it EXACTLY matches your .env")
            print("  6. If they don't match, update .env with correct values")
            print("  7. Restart Flask and try again")
        
        elif error == "invalid_grant":
            print("\n💡 The authorization code has expired or was already used.")
            print("   This is normal - authorization codes expire quickly.")
            print("   Run this script again and use a fresh code.")
        
        print(f"\n📄 Full response:")
        print(response.text)

except Exception as e:
    print(f"❌ Request failed with exception: {e}")

print("\n" + "=" * 70)