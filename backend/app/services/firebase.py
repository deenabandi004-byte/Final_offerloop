"""
Firebase service - initialization and helpers
"""
import os
import firebase_admin
from firebase_admin import credentials, firestore

db = None  # global Firestore client

def init_firebase():
    """Initialize Firebase and set up Firestore client"""
    global db
    try:
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            firebase_admin.initialize_app(options={
                'storageBucket': 'offerloop-native.firebasestorage.app'})
        else:
            # Try different possible paths for credentials
            cred_paths = [
                './firebase-creds.json',
                '/home/ubuntu/secrets/firebase-creds.json',
                os.path.expanduser('~/firebase-creds.json')
            ]
            cred = None
            for path in cred_paths:
                if os.path.exists(path):
                    cred = credentials.Certificate(path)
                    break
            
            if cred:
                # Explicitly specify the correct project ID
                firebase_admin.initialize_app(cred, {
                    'projectId': 'offerloop-native',
                    'storageBucket': 'offerloop-native.firebasestorage.app'
                })
            else:
                print("⚠️ No Firebase credentials found, initializing with explicit project ID")
                firebase_admin.initialize_app(options={
                    'projectId': 'offerloop-native',
                    'storageBucket': 'offerloop-native.firebasestorage.app'
                })
        
        db = firestore.client()
        print("✅ Firebase initialized successfully")
    except Exception as e:
        print(f"❌ Firebase initialization failed: {e}")
        db = None

def get_db():
    """Get the global Firestore client"""
    return db
