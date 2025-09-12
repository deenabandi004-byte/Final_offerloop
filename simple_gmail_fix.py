#!/usr/bin/env python3
"""
Simple Gmail Authentication Fix for RecruitEdge
Run this script to set up Gmail API access.
"""

import os
import pickle
import json
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Gmail API scopes
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

def main():
    print("🔧 Fixing Gmail Authentication for RecruitEdge")
    print("=" * 50)
    
    # Step 1: Check if we have credentials.json
    if not os.path.exists('credentials.json'):
        print("❌ Missing credentials.json file")
        print("\n📋 Quick Setup Instructions:")
        print("1. Go to: https://console.cloud.google.com/")
        print("2. Create a project (or use existing)")
        print("3. Enable Gmail API")
        print("4. Go to Credentials > Create Credentials > OAuth 2.0 Client ID")
        print("5. Choose 'Desktop application'")
        print("6. Download the file and save as 'credentials.json' in this folder")
        print("\nThen run this script again!")
        return False
    
    print("✅ Found credentials.json")
    
    # Step 2: Try to authenticate
    creds = None
    
    # Load existing token if available
    if os.path.exists('token.pickle'):
        print("🔍 Loading existing token...")
        with open('token.pickle', 'rb') as token:
            creds = pickle.load(token)
    
    # If there are no valid credentials, authenticate
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("🔄 Refreshing expired token...")
            creds.refresh(Request())
        else:
            print("🔐 Starting new authentication...")
            print("A browser window will open - please log in to your Gmail account")
            
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=8080)
        
        # Save the credentials for the next run
        with open('token.pickle', 'wb') as token:
            pickle.dump(creds, token)
        print("✅ Saved authentication token")
    
    # Step 3: Test Gmail connection
    print("🧪 Testing Gmail connection...")
    try:
        service = build('gmail', 'v1', credentials=creds)
        profile = service.users().getProfile(userId='me').execute()
        email = profile.get('emailAddress')
        print(f"✅ Successfully connected to Gmail: {email}")
        
        # Test creating a label
        labels = service.users().labels().list(userId='me').execute()
        recruitedge_label = None
        
        for label in labels.get('labels', []):
            if label['name'] == 'RecruitEdge Advanced':
                recruitedge_label = label
                break
        
        if not recruitedge_label:
            print("📋 Creating 'RecruitEdge Advanced' label...")
            label_body = {
                'name': 'RecruitEdge Advanced',
                'labelListVisibility': 'labelShow',
                'messageListVisibility': 'show'
            }
            service.users().labels().create(userId='me', body=label_body).execute()
            print("✅ Created RecruitEdge Advanced label")
        else:
            print("✅ RecruitEdge Advanced label already exists")
        
        print("\n🎉 Gmail setup complete!")
        print("Your RecruitEdge app can now create Gmail drafts automatically.")
        return True
        
    except Exception as e:
        print(f"❌ Gmail test failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    if success:
        print("\n🚀 Next: Run your RecruitEdge app and test the advanced workflow!")
    else:
        print("\n⚠️  Setup incomplete. Check the instructions above.")