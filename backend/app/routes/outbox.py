from flask import Blueprint, jsonify, request
from datetime import datetime

from app.extensions import get_db, require_firebase_auth
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service, sync_thread_message, get_latest_message_from_thread, extract_message_body
from app.services.reply_generation import generate_reply_to_message
import base64
from email.mime.text import MIMEText

outbox_bp = Blueprint("outbox", __name__, url_prefix="/api/outbox")


def _normalize_str(value):
    return (value or "").strip()


def _build_outbox_thread(doc):
    """Convert Firestore contact doc → OutboxThread dict for the frontend."""
    data = doc.to_dict()
    contact_id = doc.id

    first = _normalize_str(data.get("firstName") or data.get("first_name"))
    last = _normalize_str(data.get("lastName") or data.get("last_name"))
    contact_name = (first + " " + last).strip() or data.get("email", "")

    job_title = data.get("jobTitle") or data.get("job_title") or ""
    company = data.get("company") or ""
    email = data.get("email") or ""

    gmail_thread_id = data.get("gmailThreadId") or data.get("gmail_thread_id")
    has_unread = bool(data.get("hasUnreadReply") or data.get("has_unread_reply"))
    draft_still_exists = data.get("draftStillExists", True)  # Default to True if not set
    
    # Determine status based on whether email has been sent
    # CRITICAL: ALWAYS check if draft still exists FIRST, regardless of synced status
    # Drafts can have threadIds even before being sent, so draft existence takes priority
    has_draft = bool(
        data.get("gmailDraftId") or 
        data.get("gmail_draft_id") or 
        data.get("gmailDraftUrl") or 
        data.get("gmail_draft_url")
    )
    
    status = None
    
    # Priority 1: If we have a draft ID, check if it still exists
    # Be conservative: if we have a draft ID but aren't sure about its existence,
    # default to treating it as a draft (not sent) unless explicitly verified as deleted
    if has_draft:
        # If draftStillExists is explicitly False, we've verified it was deleted (sent)
        if draft_still_exists is False:
            # Draft was deleted - check if we have synced status or thread info
            synced_status = data.get("threadStatus")
            if synced_status:
                status = synced_status
            elif gmail_thread_id:
                if has_unread:
                    status = "new_reply"
                else:
                    status = "waiting_on_them"
            else:
                # Draft deleted but no thread info yet - assume sent
                status = "waiting_on_them"
        else:
            # Draft exists or we haven't verified it doesn't exist - treat as draft
            status = "no_reply_yet"
    else:
        # No draft ID - check synced status or thread info
        synced_status = data.get("threadStatus")
        if synced_status:
            status = synced_status
        elif gmail_thread_id:
            if has_unread:
                status = "new_reply"
            else:
                status = "waiting_on_them"
        else:
            status = "no_reply_yet"

    last_activity = (
        data.get("lastActivityAt")
        or data.get("last_activity_at")
        or datetime.utcnow().isoformat()
    )

    # Get message snippet - prefer synced snippet, fallback to email body for drafts
    last_message_snippet = (
        data.get("lastMessageSnippet")
        or data.get("last_message_snippet")
    )
    
    # If no snippet and it's a draft (no threadId), use email body
    if not last_message_snippet and not gmail_thread_id:
        last_message_snippet = (
            data.get("emailBody") 
            or data.get("email_body")
            or "Draft is ready to send in Gmail"
        )
    elif not last_message_snippet:
        last_message_snippet = "We will sync the latest Gmail reply soon."

    suggested_reply = data.get("suggestedReply")
    gmail_draft_url = data.get("gmailDraftUrl")
    gmail_draft_id = data.get("gmailDraftId") or data.get("gmail_draft_id")
    reply_type = data.get("replyType")

    has_draft = bool(
        gmail_draft_url
        or gmail_draft_id
    )
    
    # If we have a draft ID but no URL, construct the URL
    if gmail_draft_id and not gmail_draft_url:
        gmail_draft_url = f"https://mail.google.com/mail/u/0/#draft/{gmail_draft_id}"
    
    # Fix incorrect URLs that use #drafts (plural) instead of #draft (singular)
    # #drafts opens the drafts folder, #draft opens the specific draft
    if gmail_draft_url and '#drafts/' in gmail_draft_url:
        gmail_draft_url = gmail_draft_url.replace('#drafts/', '#draft/')

    return {
        "id": contact_id,
        "contactName": contact_name,
        "jobTitle": job_title,
        "company": company,
        "email": email,
        "status": status,
        "lastMessageSnippet": last_message_snippet,
        "lastActivityAt": last_activity,
        "hasDraft": has_draft,
        "suggestedReply": suggested_reply,
        "gmailDraftUrl": gmail_draft_url,
        "gmailDraftId": gmail_draft_id,
        "replyType": reply_type,
    }


@outbox_bp.get("/threads")
@require_firebase_auth
def list_threads():
    try:
        db = get_db()
    except RuntimeError as e:
        error_msg = str(e)
        print(f"❌ Database not available: {error_msg}")
        return jsonify({
            'error': 'Database not initialized',
            'message': error_msg
        }), 500
    
    uid = request.firebase_user["uid"]
    print(f"🔍 User authenticated: {uid}")
    print(f"🔍 User email: {request.firebase_user.get('email')}")
    contacts_ref = (
        db.collection("users")
        .document(uid)
        .collection("contacts")
    )

    docs = list(contacts_ref.stream())
    print(f"📊 Total contacts found: {len(docs)}")

    # Include contacts that have:
    # 1. A Gmail thread ID, OR
    # 2. A Gmail draft ID/URL (even if no threadId yet - drafts can become threads)
    contacts = []
    gmail_service = None
    
    # Try to get Gmail service once for all contacts
    try:
        creds = _load_user_gmail_creds(uid)
        if creds:
            gmail_service = _gmail_service(creds)
            print(f"✅ Gmail service available for syncing messages")
    except Exception as e:
        print(f"⚠️ Could not initialize Gmail service: {e}")
    
    for doc in docs:
        data = doc.to_dict()
        has_thread_id = bool(data.get("gmailThreadId") or data.get("gmail_thread_id"))
        has_draft = bool(
            data.get("gmailDraftId") or 
            data.get("gmail_draft_id") or 
            data.get("gmailDraftUrl") or 
            data.get("gmail_draft_url")
        )
        
        if has_thread_id or has_draft:
            contacts.append(doc)
            print(f"✅ Contact {doc.id} included: threadId={has_thread_id}, draft={has_draft}")
            
            # Track whether draft exists locally (for determining if we should sync)
            draft_exists_locally = None
            
            # If contact has a draft, check if draft still exists
            # Even if there's a threadId, the draft might still exist (drafts can have threadIds)
            if has_draft and gmail_service:
                draft_id = data.get("gmailDraftId") or data.get("gmail_draft_id")
                if draft_id:
                    try:
                        # Try to get the draft - if it exists, it hasn't been sent
                        draft = gmail_service.users().drafts().get(
                            userId='me', 
                            id=draft_id,
                            format='full'
                        ).execute()
                        
                        # Draft still exists - mark it
                        draft_exists_locally = True
                        doc.reference.update({
                            "draftStillExists": True,
                            "updatedAt": datetime.utcnow().isoformat()
                        })
                        print(f"✅ Draft {draft_id} still exists (not sent yet)")
                        
                        # Check if draft has a threadId (some drafts get threadIds before being sent)
                        thread_id = draft.get("message", {}).get("threadId")
                        if thread_id:
                            # Update contact with threadId
                            doc.reference.update({
                                "gmailThreadId": thread_id,
                                "updatedAt": datetime.utcnow().isoformat()
                            })
                            print(f"✅ Found threadId {thread_id} for draft {draft_id}")
                            has_thread_id = True
                    except Exception as e:
                        # Draft doesn't exist - it was likely sent
                        draft_exists_locally = False
                        print(f"📤 Draft {draft_id} no longer exists (likely sent): {e}")
                        
                        # Mark draft as not existing
                        doc.reference.update({
                            "draftStillExists": False,
                            "updatedAt": datetime.utcnow().isoformat()
                        })
                        
                        # Try to get threadId from sent messages
                        try:
                            contact_email = data.get("email")
                            email_subject = data.get("emailSubject") or data.get("email_subject")
                            if contact_email and email_subject:
                                # Search for sent messages to this contact
                                query = f'to:{contact_email} subject:"{email_subject[:50]}"'
                                results = gmail_service.users().messages().list(
                                    userId='me',
                                    q=query,
                                    maxResults=1
                                ).execute()
                                
                                messages = results.get('messages', [])
                                if messages:
                                    # Get the message to find its threadId
                                    msg = gmail_service.users().messages().get(
                                        userId='me',
                                        id=messages[0]['id'],
                                        format='minimal'
                                    ).execute()
                                    thread_id = msg.get('threadId')
                                    if thread_id:
                                        doc.reference.update({
                                            "gmailThreadId": thread_id,
                                            "updatedAt": datetime.utcnow().isoformat()
                                        })
                                        print(f"✅ Found threadId {thread_id} for sent draft")
                                        has_thread_id = True
                        except Exception as search_error:
                            print(f"⚠️ Could not find threadId for sent draft: {search_error}")
            
            # Sync Gmail messages only if we have a thread ID AND the draft no longer exists
            # (i.e., the email has been sent). Don't sync if draft still exists.
            # Use local check result if available, otherwise fall back to Firestore value
            if draft_exists_locally is not None:
                draft_still_exists = draft_exists_locally
            else:
                # Use existing value from Firestore (for cases where we couldn't check)
                draft_still_exists = data.get("draftStillExists", True)
            
            if has_thread_id and gmail_service and not draft_still_exists:
                thread_id = data.get("gmailThreadId") or data.get("gmail_thread_id")
                contact_email = data.get("email")
                user_email = request.firebase_user.get('email')
                
                # Only sync if we have a valid thread_id
                if not thread_id:
                    print(f"⚠️ Contact {doc.id} has has_thread_id=True but no gmailThreadId value")
                    continue
                
                try:
                    sync_result = sync_thread_message(gmail_service, thread_id, contact_email, user_email)
                    
                    # Update contact with synced data
                    updates = {
                        "lastMessageSnippet": sync_result.get('snippet', ''),
                        "lastActivityAt": sync_result.get('lastActivityAt'),
                        "updatedAt": datetime.utcnow().isoformat()
                    }
                    
                    # Update hasUnreadReply and status if we got sync data
                    if 'hasUnreadReply' in sync_result:
                        updates["hasUnreadReply"] = sync_result['hasUnreadReply']
                    if 'status' in sync_result:
                        updates["threadStatus"] = sync_result['status']
                    
                    doc.reference.update(updates)
                    print(f"✅ Synced message for contact {doc.id}: status={sync_result.get('status')}, snippet={sync_result.get('snippet', '')[:50]}...")
                except Exception as e:
                    print(f"⚠️ Could not sync message for contact {doc.id}: {e}")
            
            # Store draft status if we haven't already (for cases where Gmail service wasn't available)
            if has_draft and not has_thread_id and data.get("draftStillExists") is None:
                # Default to True if we couldn't check (assume draft exists)
                doc.reference.update({
                    "draftStillExists": True,
                    "updatedAt": datetime.utcnow().isoformat()
                })

    print(f"📧 Contacts with threads/drafts: {len(contacts)}")
    threads = [_build_outbox_thread(doc) for doc in contacts]
    threads.sort(key=lambda t: t.get("lastActivityAt") or "", reverse=True)

    return jsonify({"threads": threads}), 200


@outbox_bp.post("/threads/<thread_id>/regenerate")
@require_firebase_auth
def regenerate(thread_id):
    try:
        db = get_db()
    except RuntimeError as e:
        error_msg = str(e)
        print(f"❌ Database not available: {error_msg}")
        return jsonify({
            'error': 'Database not initialized',
            'message': error_msg
        }), 500
    
    uid = request.firebase_user["uid"]

    contact_ref = (
        db.collection("users")
        .document(uid)
        .collection("contacts")
        .document(thread_id)
    )

    doc = contact_ref.get()
    if not doc.exists:
        return jsonify({"success": False, "message": "Contact not found"}), 404

    data = doc.to_dict()
    thread_id_gmail = data.get("gmailThreadId") or data.get("gmail_thread_id")
    contact_email = data.get("email")
    
    if not thread_id_gmail:
        return jsonify({"success": False, "message": "No Gmail thread found for this contact"}), 400

    # Get user email to verify message is not from user
    user_email = request.firebase_user.get('email')
    if not user_email:
        return jsonify({"success": False, "message": "User email not found"}), 400
    
    # Get Gmail service
    creds = _load_user_gmail_creds(uid)
    if not creds:
        return jsonify({"success": False, "message": "Gmail not connected"}), 401
    
    gmail_service = _gmail_service(creds)
    
    # Get the latest message from the thread
    latest_message = get_latest_message_from_thread(gmail_service, thread_id_gmail, contact_email)
    if not latest_message:
        return jsonify({"success": False, "message": "No messages found in thread"}), 400
    
    # Check if the latest message is from the contact (not from user)
    headers = latest_message.get('payload', {}).get('headers', [])
    from_header = next((h['value'] for h in headers if h['name'].lower() == 'from'), '')
    
    if user_email.lower() in from_header.lower():
        return jsonify({
            "success": False, 
            "message": "No reply from contact yet. The latest message is from you."
        }), 400
    
    # Extract message content
    message_content = extract_message_body(latest_message)
    if not message_content:
        message_content = latest_message.get('snippet', 'No message content available.')
    
    # Get user profile and resume from Firestore
    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() or {}
    
    resume_text = user_data.get("resumeText") or user_data.get("resume_text")
    user_profile = {
        "name": user_data.get("name"),
        "email": user_data.get("email"),
        "phone": user_data.get("phone"),
        "linkedin": user_data.get("linkedin"),
        "university": user_data.get("university"),
        "major": user_data.get("major"),
        "year": user_data.get("year"),
    }
    
    # Generate AI reply
    print(f"🤖 Generating AI reply for contact {thread_id}...")
    original_subject = data.get("emailSubject") or data.get("email_subject")
    reply_result = generate_reply_to_message(
        message_content=message_content,
        contact_data=data,
        resume_text=resume_text,
        user_profile=user_profile,
        original_email_subject=original_subject
    )
    
    suggested_reply = reply_result.get('body', '')
    reply_type = reply_result.get('replyType', 'general')
    
    # Create Gmail draft with the reply
    try:
        # Get original subject
        original_subject = data.get("emailSubject") or "Our conversation"
        reply_subject = f"Re: {original_subject}"
        
        # Create draft message
        message = MIMEText(suggested_reply)
        message['to'] = contact_email
        message['subject'] = reply_subject
        
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        
        draft_body = {
            'message': {
                'raw': raw,
                'threadId': thread_id_gmail
            }
        }
        
        draft = gmail_service.users().drafts().create(userId='me', body=draft_body).execute()
        draft_id = draft['id']
        # Use the correct URL format to open the specific draft (singular "draft" not "drafts")
        gmail_draft_url = f"https://mail.google.com/mail/u/0/#draft/{draft_id}"
        
        print(f"✅ Created Gmail draft {draft_id} for reply")
    except Exception as draft_error:
        print(f"⚠️ Could not create Gmail draft: {draft_error}")
        draft_id = None
        gmail_draft_url = None
    
    # Update contact with suggested reply
    updates = {
        "suggestedReply": suggested_reply,
        "replyType": reply_type,
        "draftCreatedAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
    }
    
    if gmail_draft_url:
        updates["gmailDraftUrl"] = gmail_draft_url
    if draft_id:
        updates["gmailDraftId"] = draft_id
    
    contact_ref.update(updates)

    # Rebuild clean payload
    merged = {**data, **updates}
    fake_doc = type("Obj", (), {"id": thread_id, "to_dict": lambda self=merged: merged})
    thread = _build_outbox_thread(fake_doc)

    return jsonify({
        "success": True,
        "message": "Reply draft generated and saved.",
        "thread": thread,
    }), 200
