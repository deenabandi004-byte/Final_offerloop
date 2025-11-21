import json
import os

# Only create credentials.json if it doesn't exist
if not os.path.exists('credentials.json'):
    client_id = os.getenv('GOOGLE_CLIENT_ID')
    client_secret = os.getenv('GOOGLE_CLIENT_SECRET')
    
    if client_id and client_secret:
        creds = {
            "installed": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "redirect_uris": ["http://localhost"]
            }
        }
        with open('credentials.json', 'w') as f:
            json.dump(creds, f)
        print("Created credentials.json from environment variables")
    else:
        print("Warning: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not found in environment")
