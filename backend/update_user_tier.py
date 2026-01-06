#!/usr/bin/env python3
"""
Script to update a Firebase user's tier to elite.
Usage: python update_user_tier.py <firebase_uid>
"""
import sys
import os
from datetime import datetime

# Add the backend directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.extensions import init_firebase, get_db
from app.config import TIER_CONFIGS
from flask import Flask

def update_user_to_elite(uid: str):
    """Update a user's tier to elite in Firestore."""
    # Initialize Flask app (needed for Firebase initialization)
    app = Flask(__name__)
    
    # Initialize Firebase
    init_firebase(app)
    
    # Get Firestore client
    db = get_db()
    if not db:
        print("❌ Failed to initialize Firestore")
        return False
    
    # Get elite tier config
    elite_config = TIER_CONFIGS['elite']
    elite_credits = elite_config['credits']
    
    # Get user document reference
    user_ref = db.collection('users').document(uid)
    user_doc = user_ref.get()
    
    if not user_doc.exists:
        print(f"❌ User with UID {uid} not found in Firestore")
        return False
    
    # Get current user data
    user_data = user_doc.to_dict()
    current_email = user_data.get('email', 'unknown')
    current_tier = user_data.get('tier') or user_data.get('subscriptionTier', 'free')
    
    print(f"📋 Current user info:")
    print(f"   Email: {current_email}")
    print(f"   Current tier: {current_tier}")
    print(f"   Current credits: {user_data.get('credits', 0)}")
    print(f"   Max credits: {user_data.get('maxCredits', 0)}")
    
    # Update to elite tier
    update_data = {
        'tier': 'elite',
        'subscriptionTier': 'elite',  # Use subscriptionTier for consistency
        'credits': elite_credits,
        'maxCredits': elite_credits,
        'subscriptionStatus': 'active',
        'updated_at': datetime.now().isoformat(),
    }
    
    # Merge with existing data
    user_ref.set(update_data, merge=True)
    
    print(f"\n✅ Successfully updated user to Elite tier!")
    print(f"   New tier: elite")
    print(f"   New credits: {elite_credits}")
    print(f"   Max credits: {elite_credits}")
    print(f"   Subscription status: active")
    
    return True

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python update_user_tier.py <firebase_uid>")
        sys.exit(1)
    
    uid = sys.argv[1]
    print(f"🚀 Updating user {uid} to Elite tier...\n")
    
    success = update_user_to_elite(uid)
    
    if success:
        print("\n✅ Update complete!")
        sys.exit(0)
    else:
        print("\n❌ Update failed!")
        sys.exit(1)

