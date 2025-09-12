import os
import pickle
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Gmail API scopes
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

def setup_gmail_auth():
    """Set up Gmail authentication"""
    creds = None
    
    # Load existing token
    if os.path.exists('token.pickle'):
        with open('token.pickle', 'rb') as token:
            creds = pickle.load(token)
    
    # If no valid credentials, get new ones
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("🔄 Refreshing expired credentials...")
            creds.refresh(Request())
        else:
            if not os.path.exists('credentials.json'):
                print("❌ credentials.json file not found!")
                print("\n📋 To fix this:")
                print("1. Go to https://console.cloud.google.com/")
                print("2. Create/select a project")
                print("3. Enable Gmail API")
                print("4. Create OAuth 2.0 credentials")
                print("5. Download as 'credentials.json'")
                print("6. Place in this directory")
                return None
            
            print("🔐 Starting OAuth flow...")
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            # Use fixed port instead of random port
            creds = flow.run_local_server(port=8080)
        
        # Save credentials for next run
        with open('token.pickle', 'wb') as token:
            pickle.dump(creds, token)
    
    print("✅ Gmail authentication successful!")
    return creds

def test_gmail_connection():
    """Test Gmail API connection"""
    creds = setup_gmail_auth()
    if not creds:
        return False
    
    try:
        service = build('gmail', 'v1', credentials=creds)
        
        # Test by getting user profile
        profile = service.users().getProfile(userId='me').execute()
        print(f"📧 Connected to Gmail: {profile.get('emailAddress')}")
        
        # Test creating a label
        label_name = 'RecruitEdge Test'
        
        # Check if label exists
        labels = service.users().labels().list(userId='me').execute()
        existing_label = None
        for label in labels.get('labels', []):
            if label['name'] == label_name:
                existing_label = label
                break
        
        if existing_label:
            print(f"📋 Found existing label: {label_name}")
        else:
            # Create test label
            label_body = {
                'name': label_name,
                'labelListVisibility': 'labelShow',
                'messageListVisibility': 'show'
            }
            label = service.users().labels().create(userId='me', body=label_body).execute()
            print(f"📋 Created test label: {label_name}")
        
        print("✅ Gmail API test successful!")
        return True
        
    except Exception as e:
        print(f"❌ Gmail API test failed: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Setting up Gmail integration for RecruitEdge")
    print("=" * 50)
    
    success = test_gmail_connection()
    
    if success:
        print("\n🎉 Gmail setup complete!")
        print("You can now run your RecruitEdge app with real Gmail drafts.")
    else:
        print("\n❌ Gmail setup failed.")
        print("Check the instructions above and try again.")