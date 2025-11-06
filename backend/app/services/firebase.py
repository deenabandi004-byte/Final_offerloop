import os
import firebase_admin
from firebase_admin import credentials, firestore

db = None  # global Firestore client

def init_firebase():
    """Initialize Firebase and set up Firestore client."""
    global db
    if firebase_admin._apps:  # already initialized
        db = firestore.client()
        return

    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path or not os.path.exists(cred_path):
        raise RuntimeError("Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path")

    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
