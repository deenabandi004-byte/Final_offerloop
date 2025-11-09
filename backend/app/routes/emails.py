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
import mimetypes
import re



from app.config import GMAIL_SCOPES, GOOGLE_CLIENT_ID, OAUTH_REDIRECT_URI
from app.extensions import require_firebase_auth
from app.services.reply_generation import batch_generate_emails
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service
from app.extensions import get_db

emails_bp = Blueprint('emails', __name__, url_prefix='/api/emails')
def _infer_mime_type(filename_or_url: str, fallback=("application", "octet-stream")):
    # Try headers first if you already have them, else guess from extension
    guessed, _ = mimetypes.guess_type(filename_or_url)
    if guessed:
        main, sub = guessed.split("/", 1)
        return main, sub
    return fallback


def _normalize_drive_url(url: str) -> str:
    """
    Normalize Google Drive URLs to direct download format.
    Firebase Storage URLs are returned as-is.
    """
    if not url:
        return url
    
    # If it's a Firebase Storage URL, return as-is
    if 'firebasestorage.googleapis.com' in url:
        return url
    
    # Handle Google Drive URLs
    if 'drive.google.com' in url:
        # Extract file ID from various Drive URL formats
        
        # Format: https://drive.google.com/file/d/FILE_ID/view
        match = re.search(r'/file/d/([^/]+)', url)
        if match:
            file_id = match.group(1)
            return f'https://drive.google.com/uc?export=download&id={file_id}'
        
        # Format: https://drive.google.com/open?id=FILE_ID
        match = re.search(r'[?&]id=([^&]+)', url)
        if match:
            file_id = match.group(1)
            return f'https://drive.google.com/uc?export=download&id={file_id}'
    
    # Return original URL if no normalization needed
    return url


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

    # 1) Generate emails
    results = batch_generate_emails(contacts, resume_text, user_profile, career_interest)
    print(f"🧪 batch_generate_emails returned: type={type(results)}, "
      f"len={len(results) if hasattr(results, '__len__') else 'n/a'}, "
      f"keys={list(results.keys())[:5] if isinstance(results, dict) else 'list'}")


    # 2) Create drafts with resume and formatted body
    gmail = _gmail_service(creds)
    created = []
    draft_ids = []

    # Log which mailbox we're drafting as
    try:
        connected_email = gmail.users().getProfile(userId="me").execute().get("emailAddress")
        print(f"📧 Connected Gmail account: {connected_email}")
    except Exception as e:
        connected_email = None
        print(f"⚠️ Could not fetch connected Gmail profile: {e}")

    # Fetch user's resume info from Firestore
    # Fetch user's resume info from Firestore and/or payload
    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() or {}

    resume_url = (
        payload.get("resumeUrl") or
        user_profile.get("resumeUrl") or
        user_data.get("resumeUrl")
    )
    resume_filename = (
        payload.get("resumeFileName") or
        user_profile.get("resumeFileName") or
        user_data.get("resumeFileName") or
        "Resume.pdf"
    )

    if resume_url:
        resume_url = _normalize_drive_url(resume_url)

    print(f"🔎 Resume discovery → url={resume_url!r}, filename={resume_filename!r}")
    print(f"🗝️ User doc keys: {list(user_data.keys())[:10]}")


    print(f"👥 Contacts received: {len(contacts)}")
    for i, c in enumerate(contacts):
        # --- Pull the i-th generated email robustly ---
        r = None
        try:
            if isinstance(results, dict):
                # handle both string and int keys
                r = results.get(str(i)) or results.get(i)
                # handle wrapped shape: {"results": [...]}
                if r is None and "results" in results and isinstance(results["results"], list):
                    r = results["results"][i] if i < len(results["results"]) else None
            elif isinstance(results, list):
                r = results[i] if i < len(results) else None
        except Exception as e:
            print(f"⚠️ Error reading generated email at index {i}: {e}")
            r = None

        if not r or not isinstance(r, dict) or not r.get("body") or not r.get("subject"):
            print(
                f"⚠️ Skipping index {i}: no generated email result "
                f"(type={type(results)}, keys={list(results.keys())[:5] if isinstance(results, dict) else 'list'})"
            )
            continue


        # Be tolerant to various keys
        to_addr = (
            c.get("Email") or c.get("email") or
            c.get("WorkEmail") or c.get("work_email") or
            c.get("PersonalEmail") or c.get("personal_email")
        )
        if not to_addr:
            print(f"⚠️ Skipping contact {i}: no email in {c}")
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
                # Some CDNs require a UA; keep timeout tight
                res = requests.get(
                    resume_url,
                    timeout=15,
                    headers={"User-Agent": "Offerloop/1.0"}
                )
                res.raise_for_status()
                data = res.content

                # Guard 1: HTML "sharing page" instead of file bytes
                if len(data) < 1024 and b"<html" in data[:2048].lower():
                    raise Exception("Resume URL returned HTML (likely a sharing page). Use a direct download URL.")

                # Guard 2: skip very large attachments (Gmail draft size)
                MAX_BYTES = 8 * 1024 * 1024  # 8 MB
                if len(data) > MAX_BYTES:
                    print(f"⚠️ [{i}] Resume too large ({len(data)} bytes) — skipping attachment")
                    data = None

                if data is not None:
                    # Determine filename
                    filename = resume_filename or "Resume.pdf"
                    # If filename missing extension, try to pull one from the URL/mimetype
                    if "." not in filename and "content-type" in res.headers:
                        ctype_hdr = res.headers.get("content-type", "")
                        if "/" in ctype_hdr:
                            ext = mimetypes.guess_extension(ctype_hdr.split(";")[0].strip()) or ".pdf"
                            filename += ext

                    # Infer MIME type (prefer header, else filename)
                    ctype_hdr = res.headers.get("content-type", "").split(";", 1)[0].strip()
                    if "/" in ctype_hdr:
                        main, sub = ctype_hdr.split("/", 1)
                    else:
                        main, sub = _infer_mime_type(filename)

                    part = MIMEBase(main, sub)
                    part.set_payload(data)
                    encoders.encode_base64(part)
                    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
                    msg.attach(part)
                    print(f"✅ [{i}] Attached resume ({len(data)} bytes, {main}/{sub}) as {filename}")

            except Exception as e:
                print(f"⚠️ [{i}] Could not attach resume from {resume_url}: {e}")



        # --- Create Gmail draft ---
        try:
            raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
            draft = gmail.users().drafts().create(
                userId="me",
                body={"message": {"raw": raw}}
            ).execute()
            print(f"📤 [{i}] Draft created: {draft}")
            draft_ids.append(draft.get("id"))

            # Use the actual mailbox, not hard-coded /u/0/
            gmail_url = (
                f"https://mail.google.com/mail/?authuser={connected_email}#drafts/{draft['id']}"
                if connected_email else f"https://mail.google.com/mail/#drafts/{draft['id']}"
            )

            created.append({
                "index": i,
                "to": to_addr,
                "draftId": draft["id"],
                "gmailUrl": gmail_url
            })
        except Exception as e:
            print(f"❌ [{i}] Draft creation failed for {to_addr}: {e}")

    return jsonify({
        "success": True,
        "connected_email": connected_email,
        "draft_count": len(draft_ids),
        "draft_ids": draft_ids,
        "drafts": created
    }), 200