"""
Email generation and drafting routes
"""
import os
import secrets
import base64
import requests
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from urllib.parse import urlencode

from app.config import GMAIL_SCOPES, GOOGLE_CLIENT_ID, OAUTH_REDIRECT_URI
from app.extensions import require_firebase_auth
from app.services.reply_generation import batch_generate_emails
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service
from app.extensions import get_db

emails_bp = Blueprint('emails', __name__, url_prefix='/api/emails')


@emails_bp.post("/generate-and-draft")
@require_firebase_auth
def generate_and_draft():
    """Generate emails and create Gmail drafts"""
    db = get_db()
    uid = request.firebase_user["uid"]
    payload = request.get_json() or {}
    contacts = payload.get("contacts", [])
    resume_text = payload.get("resumeText", "")
    user_profile = payload.get("userProfile", {})
    career_interest = payload.get("careerInterests")
    
    # If Gmail not connected, return authUrl (first-time only)
    creds = _load_user_gmail_creds(uid)
    if not creds:
        # Generate a unique state token for CSRF protection
        state = secrets.token_urlsafe(32)
        
        # Store state in Firestore with the user's UID
        db.collection("oauth_state").document(state).set({
            "uid": uid,
            "created": datetime.utcnow(),
            "expires": datetime.utcnow() + timedelta(minutes=10)
        })
        
        # Use the GMAIL_SCOPES constant to ensure consistency
        scope_string = " ".join(GMAIL_SCOPES)
        
        AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
        params = {
            "client_id": GOOGLE_CLIENT_ID,
            "redirect_uri": OAUTH_REDIRECT_URI,
            "response_type": "code",
            "scope": scope_string,
            "access_type": "offline",
            "include_granted_scopes": "true",
            "prompt": "consent",
            "state": state,
        }
        auth_url = f"{AUTH_BASE}?{urlencode(params)}"
        print(f"🔐 Generated OAuth URL with state: {state}")
        print(f"🔐 Requesting scopes: {scope_string}")
        return jsonify({"needsAuth": True, "authUrl": auth_url}), 401
    
    # 1) Generate emails using your existing function
    results = batch_generate_emails(contacts, resume_text, user_profile, career_interest)
    
    # 2) Create drafts with resume and formatted body
    gmail = _gmail_service(creds)
    created = []
    
    # Fetch user's resume info from Firestore
    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() or {}
    resume_url = user_data.get("resumeUrl")
    resume_filename = user_data.get("resumeFileName") or "Resume.pdf"
    
    for i, c in enumerate(contacts):
        key = str(i)
        r = results.get(key)
        if not r:
            continue
        
        to_addr = c.get("Email") or c.get("WorkEmail") or c.get("PersonalEmail")
        if not to_addr:
            continue
        
        # --- Format email content ---
        body = r["body"].strip()
        if "for context, i've attached my resume below" not in body.lower():
            body += "\n\nFor context, I've attached my resume below."
        
        # Convert to simple HTML (paragraph spacing)
        html_body = "".join([
            f'<p style="margin:12px 0; line-height:1.6;">{p.strip()}</p>'
            for p in body.split("\n") if p.strip()
        ])
        html_body += """
            <br><p>Warm regards,<br><b>Nicholas Wittig</b><br>
            USC Marshall School of Business<br>
            <a href='mailto:nwittig@usc.edu'>nwittig@usc.edu</a></p>
        """
        
        # --- Build MIME message ---
        msg = MIMEMultipart("mixed")
        msg["to"] = to_addr
        msg["subject"] = r["subject"]
        
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body, "plain", "utf-8"))
        alt.attach(MIMEText(html_body, "html", "utf-8"))
        msg.attach(alt)
        
        # --- Attach resume if available ---
        if resume_url:
            try:
                res = requests.get(resume_url, timeout=15)
                res.raise_for_status()
                part = MIMEBase("application", "pdf")
                part.set_payload(res.content)
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", f'attachment; filename="{resume_filename}"')
                msg.attach(part)
                print("✅ Attached resume successfully")
            except Exception as e:
                print(f"⚠️ Could not attach resume: {e}")
        
        # --- Create Gmail draft ---
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
        draft = gmail.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()
        
        created.append({
            "index": i,
            "to": to_addr,
            "draftId": draft["id"],
            "gmailUrl": f"https://mail.google.com/mail/u/0/#drafts/{draft['id']}"
        })
    
    return jsonify({"success": True, "drafts": created})

