#!/usr/bin/env python3
"""
Script to update a user's tier in Firestore
Usage: python update_user_tier.py <uid> <tier>
Example: python update_user_tier.py WA78C3E9PWRA1UYVFM4J9kZNDqD3 elite
"""
import sys
import os
from datetime import datetime

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app.extensions import init_firebase, get_db
from app.config import TIER_CONFIGS
from app.models.users import update_user_tier_data

def update_user_tier(uid: str, tier: str):
    """Update user tier in Firestore"""
    # Initialize Firebase
    from flask import Flask
    app = Flask(__name__)
    init_firebase(app)
    
    db = get_db()
    if not db:
        print("❌ Failed to initialize Firestore")
        return False
    
    # Validate tier
    if tier not in ['free', 'pro', 'elite']:
        print(f"❌ Invalid tier: {tier}. Must be 'free', 'pro', or 'elite'")
        return False
    
    # Get tier configuration
    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
    credits = tier_config.get('credits', 300)
    max_credits = tier_config.get('credits', 300)
    
    # Get update data
    update_data = update_user_tier_data(tier, credits)
    update_data['maxCredits'] = max_credits
    update_data['updated_at'] = datetime.now().isoformat()
    update_data['uid'] = uid
    
    # Update user document
    try:
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            print(f"⚠️  User document doesn't exist, creating new one")
            # Get email if available from existing data
            existing_data = user_doc.to_dict() if user_doc.exists else {}
            if 'email' in existing_data:
                update_data['email'] = existing_data['email']
        else:
            existing_data = user_doc.to_dict()
            if 'email' in existing_data:
                update_data['email'] = existing_data['email']
            print(f"✅ Found existing user: {existing_data.get('email', 'no email')}")
        
        user_ref.set(update_data, merge=True)
        print(f"✅ Successfully updated user {uid} to {tier} tier")
        print(f"   Credits: {credits}")
        print(f"   Max Credits: {max_credits}")
        print(f"   Max Contacts: {tier_config.get('max_contacts', 'N/A')}")
        
        return True
    except Exception as e:
        print(f"❌ Error updating user: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python update_user_tier.py <uid> <tier>")
        print("Example: python update_user_tier.py WA78C3E9PWRA1UYVFM4J9kZNDqD3 elite")
        sys.exit(1)
    
    uid = sys.argv[1]
    tier = sys.argv[2].lower()
    
    success = update_user_tier(uid, tier)
    sys.exit(0 if success else 1)

