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
from app.services.gmail_client import get_gmail_service_for_user
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
    fit_context = payload.get("fitContext")  # NEW: Job fit analysis context

    # Get Gmail service using user's OAuth credentials (falls back to shared account if not connected)
    user_email = request.firebase_user.get("email")
    gmail_service = get_gmail_service_for_user(user_email, user_id=uid)
    if not gmail_service:
        return jsonify({
            "error": "Gmail service unavailable",
            "message": "Please connect your Gmail account to create drafts. The shared Gmail account is not available."
        }), 500

    # Log if fit context is being used
    if fit_context:
        print(f"📧 Generating emails with fit context: {fit_context.get('job_title', 'Unknown')} at {fit_context.get('company', 'Unknown')}")

    # 1) Generate emails with fit context
    results = batch_generate_emails(contacts, resume_text, user_profile, career_interest, fit_context=fit_context)
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

        # Check if body already ends with a signature (batch_generate_emails includes signature)
        # Look for common signature patterns: "Best,", "Best regards", user name, email, university
        body_lower = body.lower()
        has_signature = False
        if user_profile:
            user_name = user_profile.get('name', '').lower()
            user_email = user_profile.get('email', '').lower()
            user_university = user_profile.get('university', '').lower()
            
            # Check if body ends with signature-like content
            signature_indicators = [
                'best,', 'best regards', 'thank you', 'thanks,', 'sincerely',
                user_name if user_name else None,
                user_email if user_email else None,
                user_university if user_university else None
            ]
            signature_indicators = [s for s in signature_indicators if s]
            
            # Check last 200 characters for signature indicators
            body_end = body_lower[-200:] if len(body_lower) > 200 else body_lower
            has_signature = any(indicator in body_end for indicator in signature_indicators)
        
        # Build signature from user_profile (only if not already present)
        signature_html = ""
        signature_text = ""
        if not has_signature and user_profile:
            user_name = user_profile.get('name', '')
            user_email = user_profile.get('email', '')
            user_university = user_profile.get('university', '')
            user_year = user_profile.get('year', '') or user_profile.get('graduationYear', '')
            
            # Build HTML signature
            signature_parts_html = []
            if user_name:
                signature_parts_html.append(f"<b>{user_name}</b>")
            if user_university:
                if user_year:
                    signature_parts_html.append(f"{user_university} | Class of {user_year}")
                else:
                    signature_parts_html.append(user_university)
            if user_email:
                signature_parts_html.append(f'<a href="mailto:{user_email}">{user_email}</a>')
            
            if signature_parts_html:
                signature_html = f"<br><p>Best,<br>{'<br>'.join(signature_parts_html)}</p>"
            else:
                signature_html = "<br><p>Best regards</p>"
            
            # Build plain text signature (for Firestore)
            signature_lines = ["Best,"]
            if user_name:
                signature_lines.append(user_name)
            if user_university:
                if user_year:
                    signature_lines.append(f"{user_university} | Class of {user_year}")
                else:
                    signature_lines.append(user_university)
            if user_email:
                signature_lines.append(user_email)
            
            signature_text = "\n" + "\n".join(signature_lines)
        elif not has_signature:
            signature_html = "<br><p>Best regards</p>"
            signature_text = "\n\nBest regards"
        
        # Add signature to body before saving to Firestore (only if not already present)
        if signature_text:
            body += signature_text

        # Convert to simple HTML (paragraph spacing)
        html_body = "".join([
            f'<p style="margin:12px 0; line-height:1.6;">{p.strip()}</p>'
            for p in body.split("\n") if p.strip()
        ])
        # Add HTML signature
        html_body += signature_html

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
            draft_id = draft.get("id")
            draft_ids.append(draft_id)
            
            # Extract message ID and threadId from draft (Gmail creates a thread when draft is created)
            message_id = draft.get("message", {}).get("id")
            thread_id = draft.get("message", {}).get("threadId")
            
            if not message_id or not thread_id:
                # If message ID or threadId not in draft response, get it from the draft message
                try:
                    draft_message = gmail.users().drafts().get(userId="me", id=draft_id, format="full").execute()
                    if not message_id:
                        message_id = draft_message.get("message", {}).get("id")
                    if not thread_id:
                        thread_id = draft_message.get("message", {}).get("threadId")
                except Exception as e:
                    print(f"⚠️ [{i}] Could not get message/threadId from draft: {e}")

            # Use message ID format for more reliable draft URL (Option A from fix doc)
            # Format: https://mail.google.com/mail/u/0/#drafts?compose=<messageId>
            if message_id:
                gmail_url = (
                    f"https://mail.google.com/mail/?authuser={connected_email}#drafts?compose={message_id}"
                    if connected_email else f"https://mail.google.com/mail/u/0/#drafts?compose={message_id}"
                )
            else:
                # Fallback to draft ID format if message ID not available
                gmail_url = (
                    f"https://mail.google.com/mail/?authuser={connected_email}#draft/{draft_id}"
                    if connected_email else f"https://mail.google.com/mail/u/0/#draft/{draft_id}"
                )

            created.append({
                "index": i,
                "to": to_addr,
                "draftId": draft_id,
                "messageId": message_id,
                "threadId": thread_id,
                "gmailUrl": gmail_url
            })
            
            # Save/update contact in Firestore with draft info (even if no threadId yet)
            # Drafts may not have threadId until they're sent or replied to
            try:
                contacts_ref = db.collection("users").document(uid).collection("contacts")
                # Try to find existing contact by email
                existing_contacts = list(contacts_ref.where("email", "==", to_addr).limit(1).stream())
                
                contact_data = {
                    "gmailDraftId": draft_id,
                    "gmailMessageId": message_id,  # Save message ID for more reliable URL
                    "gmailDraftUrl": gmail_url,
                    "emailSubject": r["subject"],
                    "emailBody": body,
                    "draftCreatedAt": datetime.utcnow().isoformat(),
                    "lastActivityAt": datetime.utcnow().isoformat(),
                    "hasUnreadReply": False,
                    "updatedAt": datetime.utcnow().isoformat()
                }
                
                # Add threadId if we have it
                if thread_id:
                    contact_data["gmailThreadId"] = thread_id
                
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
                    print(f"✅ [{i}] Updated contact {contact_doc.id} with draftId {draft['id']}" + (f" and threadId {thread_id}" if thread_id else ""))
                else:
                    # Create new contact
                    contact_data["email"] = to_addr
                    contact_data["createdAt"] = datetime.utcnow().isoformat()
                    new_contact_ref = contacts_ref.document()
                    new_contact_ref.set(contact_data)
                    print(f"✅ [{i}] Created new contact {new_contact_ref.id} with draftId {draft['id']}" + (f" and threadId {thread_id}" if thread_id else ""))
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