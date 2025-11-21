"""
Email generation and drafting routes
"""
import os
import base64
import requests
from datetime import datetime
from flask import Blueprint, request, jsonify
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import mimetypes
import re

from app.config import GMAIL_SCOPES
from ..extensions import require_firebase_auth
from app.services.reply_generation import batch_generate_emails
from app.services.gmail_client import get_gmail_service
from ..extensions import get_db

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

    # Get Gmail service using shared token.pickle (no OAuth required)
    gmail_service = get_gmail_service()
    if not gmail_service:
        return jsonify({
            "error": "Gmail service unavailable",
            "message": "token.pickle not found. Please ensure token.pickle exists in backend/ directory."
        }), 500

    # 1) Generate emails
    results = batch_generate_emails(contacts, resume_text, user_profile, career_interest)
    print(f"🧪 batch_generate_emails returned: type={type(results)}, "
      f"len={len(results) if hasattr(results, '__len__') else 'n/a'}, "
      f"keys={list(results.keys())[:5] if isinstance(results, dict) else 'list'}")


    # 2) Create drafts with resume and formatted body
    gmail = gmail_service
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
            
            # Extract threadId from draft (Gmail creates a thread when draft is created)
            thread_id = draft.get("message", {}).get("threadId")
            if not thread_id:
                # If threadId not in draft response, get it from the draft message
                try:
                    draft_message = gmail.users().drafts().get(userId="me", id=draft["id"], format="full").execute()
                    thread_id = draft_message.get("message", {}).get("threadId")
                except Exception as e:
                    print(f"⚠️ [{i}] Could not get threadId from draft: {e}")

            # Use the actual mailbox, not hard-coded /u/0/
            gmail_url = (
                f"https://mail.google.com/mail/?authuser={connected_email}#drafts/{draft['id']}"
                if connected_email else f"https://mail.google.com/mail/#drafts/{draft['id']}"
            )

            created.append({
                "index": i,
                "to": to_addr,
                "draftId": draft["id"],
                "threadId": thread_id,
                "gmailUrl": gmail_url
            })
            
            # Save/update contact in Firestore with gmailThreadId
            if thread_id:
                try:
                    contacts_ref = db.collection("users").document(uid).collection("contacts")
                    # Try to find existing contact by email
                    existing_contacts = list(contacts_ref.where("email", "==", to_addr).limit(1).stream())
                    
                    contact_data = {
                        "gmailThreadId": thread_id,
                        "gmailDraftId": draft["id"],
                        "gmailDraftUrl": gmail_url,
                        "emailSubject": r["subject"],
                        "emailBody": body,
                        "draftCreatedAt": datetime.utcnow().isoformat(),
                        "lastActivityAt": datetime.utcnow().isoformat(),
                        "hasUnreadReply": False,
                        "updatedAt": datetime.utcnow().isoformat()
                    }
                    
                    # Add contact fields from the original contact data
                    if c.get("FirstName"):
                        contact_data["firstName"] = c["FirstName"]
                    if c.get("LastName"):
                        contact_data["lastName"] = c["LastName"]
                    if c.get("Company"):
                        contact_data["company"] = c["Company"]
                    if c.get("Title") or c.get("jobTitle"):
                        contact_data["jobTitle"] = c.get("Title") or c.get("jobTitle")
                    if c.get("LinkedIn") or c.get("linkedinUrl"):
                        contact_data["linkedinUrl"] = c.get("LinkedIn") or c.get("linkedinUrl")
                    if c.get("College") or c.get("college"):
                        contact_data["college"] = c.get("College") or c.get("college")
                    if c.get("location"):
                        contact_data["location"] = c["location"]
                    
                    if existing_contacts:
                        # Update existing contact
                        contact_doc = existing_contacts[0]
                        contact_doc.reference.update(contact_data)
                        print(f"✅ [{i}] Updated contact {contact_doc.id} with threadId {thread_id}")
                    else:
                        # Create new contact
                        contact_data["email"] = to_addr
                        contact_data["createdAt"] = datetime.utcnow().isoformat()
                        new_contact_ref = contacts_ref.document()
                        new_contact_ref.set(contact_data)
                        print(f"✅ [{i}] Created new contact {new_contact_ref.id} with threadId {thread_id}")
                except Exception as e:
                    print(f"⚠️ [{i}] Failed to save contact to Firestore: {e}")
                    import traceback
                    traceback.print_exc()
        except Exception as e:
            print(f"❌ [{i}] Draft creation failed for {to_addr}: {e}")

    return jsonify({
        "success": True,
        "connected_email": connected_email,
        "draft_count": len(draft_ids),
        "draft_ids": draft_ids,
        "drafts": created
    }), 200