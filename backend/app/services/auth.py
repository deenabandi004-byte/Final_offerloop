import os
from functools import wraps
from flask import request, jsonify
from firebase_admin import auth as fb_auth

def require_firebase_auth(fn):
    """Decorator to protect routes with Firebase authentication."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        authz = request.headers.get("Authorization", "")
        if authz.startswith("Bearer "):
            token = authz.split(" ", 1)[1]
            try:
                decoded = fb_auth.verify_id_token(token)
                request.firebase_user = decoded
                return fn(*args, **kwargs)
            except Exception:
                return jsonify({"error": "Invalid or expired token"}), 401

        # Development bypass (for local testing)
        dev_uid = os.environ.get("DEV_BYPASS_UID")
        if dev_uid and request.host.startswith(("127.0.0.1", "localhost")):
            request.firebase_user = {"uid": dev_uid, "email": f"{dev_uid}@local.dev"}
            return fn(*args, **kwargs)

        return jsonify({"error": "Missing Authorization Bearer token"}), 401

    return wrapper
