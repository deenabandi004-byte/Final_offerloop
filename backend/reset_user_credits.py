#!/usr/bin/env python3
"""
Script to reset a Firebase user's credits.
Usage: python reset_user_credits.py <firebase_uid> [credits_amount]
"""
import sys
import os
from datetime import datetime

# Add the backend directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.extensions import init_firebase, get_db
from flask import Flask

def reset_user_credits(uid: str, credits: int = 3000):
    """Reset a user's credits in Firestore."""
    # Initialize Flask app (needed for Firebase initialization)
    app = Flask(__name__)
    
    # Initialize Firebase
    init_firebase(app)
    
    # Get Firestore client
    db = get_db()
    if not db:
        print("❌ Failed to initialize Firestore")
        return False
    
    # Get user document reference
    user_ref = db.collection('users').document(uid)
    user_doc = user_ref.get()
    
    if not user_doc.exists:
        print(f"❌ User with UID {uid} not found in Firestore")
        return False
    
    # Get current user data
    user_data = user_doc.to_dict()
    current_email = user_data.get('email', 'unknown')
    current_credits = user_data.get('credits', 0)
    current_tier = user_data.get('tier') or user_data.get('subscriptionTier', 'free')
    
    print(f"📋 Current user info:")
    print(f"   Email: {current_email}")
    print(f"   Current tier: {current_tier}")
    print(f"   Current credits: {current_credits}")
    print(f"   Max credits: {user_data.get('maxCredits', 0)}")
    
    # Update credits
    update_data = {
        'credits': credits,
        'lastCreditUpdate': datetime.now().isoformat(),
    }
    
    # Merge with existing data
    user_ref.set(update_data, merge=True)
    
    print(f"\n✅ Successfully reset user credits!")
    print(f"   New credits: {credits}")
    print(f"   Previous credits: {current_credits}")
    
    return True

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python reset_user_credits.py <firebase_uid> [credits_amount]")
        print("       Default credits amount: 3000")
        sys.exit(1)
    
    uid = sys.argv[1]
    credits = int(sys.argv[2]) if len(sys.argv) > 2 else 3000
    
    print(f"🚀 Resetting credits for user {uid} to {credits}...\n")
    
    success = reset_user_credits(uid, credits)
    
    if success:
        print("\n✅ Update complete!")
        sys.exit(0)
    else:
        print("\n❌ Update failed!")
        sys.exit(1)

