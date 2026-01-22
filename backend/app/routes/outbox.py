from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from functools import lru_cache
import time

from app.extensions import get_db, require_firebase_auth
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service, sync_thread_message, get_latest_message_from_thread, extract_message_body
from app.services.reply_generation import generate_reply_to_message
from app.services.auth import deduct_credits_atomic, check_and_reset_credits, refund_credits_atomic
import base64
from email.mime.text import MIMEText

# Credit cost for reply generation (similar to cover letter generation)
REPLY_GENERATION_CREDIT_COST = 10

# Rate limiting: max Gmail API calls per user per minute
MAX_GMAIL_API_CALLS_PER_MINUTE = 30
gmail_api_call_tracker = {}  # {uid: [timestamps]}

outbox_bp = Blueprint("outbox", __name__, url_prefix="/api/outbox")


def _normalize_str(value):
    return (value or "").strip()


def _check_gmail_rate_limit(uid):
    """Check if user has exceeded Gmail API rate limit"""
    now = time.time()
    if uid not in gmail_api_call_tracker:
        gmail_api_call_tracker[uid] = []
    
    # Remove calls older than 1 minute
    gmail_api_call_tracker[uid] = [
        ts for ts in gmail_api_call_tracker[uid] 
        if now - ts < 60
    ]
    
    if len(gmail_api_call_tracker[uid]) >= MAX_GMAIL_API_CALLS_PER_MINUTE:
        return False
    
    gmail_api_call_tracker[uid].append(now)
    return True


def _check_draft_exists_cached(gmail_service, draft_id, cache_ttl_minutes=5):
    """Check if draft exists with caching. Returns (exists: bool, from_cache: bool)"""
    # Simple in-memory cache (could be upgraded to Redis)
    cache_key = f"draft_{draft_id}"
    cache = getattr(_check_draft_exists_cached, '_cache', {})
    cache_timestamps = getattr(_check_draft_exists_cached, '_cache_timestamps', {})
    
    now = datetime.utcnow()
    
    # Check cache
    if cache_key in cache:
        cache_time = cache_timestamps.get(cache_key)
        if cache_time and (now - cache_time).total_seconds() < cache_ttl_minutes * 60:
            return cache[cache_key], True
    
    # Cache miss - check Gmail API
    try:
        draft = gmail_service.users().drafts().get(
            userId='me', 
            id=draft_id,
            format='minimal'
        ).execute()
        exists = True
    except Exception:
        exists = False
    
    # Update cache
    if not hasattr(_check_draft_exists_cached, '_cache'):
        _check_draft_exists_cached._cache = {}
        _check_draft_exists_cached._cache_timestamps = {}
    
    _check_draft_exists_cached._cache[cache_key] = exists
    _check_draft_exists_cached._cache_timestamps[cache_key] = now
    
    return exists, False


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
    
    # Pagination support
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 50))  # Default 50, max 100
    per_page = min(per_page, 100)  # Cap at 100
    
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
            
            # If contact has a draft, check if draft still exists (with caching and rate limiting)
            # Even if there's a threadId, the draft might still exist (drafts can have threadIds)
            if has_draft and gmail_service:
                draft_id = data.get("gmailDraftId") or data.get("gmail_draft_id")
                if draft_id:
                    # Check rate limit
                    if not _check_gmail_rate_limit(uid):
                        print(f"⚠️ Rate limit exceeded for user {uid}, skipping draft check for {draft_id}")
                        # Use cached value if available, otherwise assume draft exists
                        draft_exists_locally = data.get("draftStillExists", True)
                    else:
                        try:
                            # Use cached check if available
                            exists, from_cache = _check_draft_exists_cached(gmail_service, draft_id)
                            
                            if exists:
                                # Draft still exists - mark it
                                draft_exists_locally = True
                                doc.reference.update({
                                    "draftStillExists": True,
                                    "updatedAt": datetime.utcnow().isoformat()
                                })
                                if not from_cache:
                                    print(f"✅ Draft {draft_id} still exists (not sent yet)")
                                
                                # Check if draft has a threadId (some drafts get threadIds before being sent)
                                if not from_cache:  # Only check threadId if we made an API call
                                    try:
                                        draft = gmail_service.users().drafts().get(
                                            userId='me', 
                                            id=draft_id,
                                            format='full'
                                        ).execute()
                                        thread_id = draft.get("message", {}).get("threadId")
                                        if thread_id:
                                            # Update contact with threadId
                                            doc.reference.update({
                                                "gmailThreadId": thread_id,
                                                "updatedAt": datetime.utcnow().isoformat()
                                            })
                                            print(f"✅ Found threadId {thread_id} for draft {draft_id}")
                                            has_thread_id = True
                                    except Exception as thread_check_error:
                                        print(f"⚠️ Could not check threadId for draft: {thread_check_error}")
                            else:
                                # Draft doesn't exist - it was likely sent
                                draft_exists_locally = False
                                if not from_cache:
                                    print(f"📤 Draft {draft_id} no longer exists (likely sent)")
                                
                                # Mark draft as not existing
                                doc.reference.update({
                                    "draftStillExists": False,
                                    "updatedAt": datetime.utcnow().isoformat()
                                })
                                
                                # Try to get threadId from sent messages (only if not rate limited)
                                if not from_cache and _check_gmail_rate_limit(uid):
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
                        except Exception as e:
                            # Error checking draft - use cached value or default
                            print(f"⚠️ Error checking draft {draft_id}: {e}")
                            draft_exists_locally = data.get("draftStillExists", True)
            
            # Sync Gmail messages only if we have a thread ID AND the draft no longer exists
            # (i.e., the email has been sent). Don't sync if draft still exists.
            # Use local check result if available, otherwise fall back to Firestore value
            if draft_exists_locally is not None:
                draft_still_exists = draft_exists_locally
            else:
                # Use existing value from Firestore (for cases where we couldn't check)
                draft_still_exists = data.get("draftStillExists", True)
            
            # Sync Gmail messages only if we have a thread ID AND the draft no longer exists
            # AND we haven't exceeded rate limits
            # Only sync if last sync was more than 1 minute ago (to avoid excessive API calls)
            if has_thread_id and gmail_service and not draft_still_exists:
                thread_id = data.get("gmailThreadId") or data.get("gmail_thread_id")
                contact_email = data.get("email")
                user_email = request.firebase_user.get('email')
                
                # Only sync if we have a valid thread_id
                if not thread_id:
                    print(f"⚠️ Contact {doc.id} has has_thread_id=True but no gmailThreadId value")
                    continue
                
                # Check if we should sync (avoid syncing too frequently)
                last_sync = data.get("lastSyncAt")
                should_sync = True
                if last_sync:
                    try:
                        last_sync_dt = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
                        time_since_sync = (datetime.utcnow() - last_sync_dt.replace(tzinfo=None)).total_seconds()
                        # Only sync if last sync was more than 1 minute ago
                        should_sync = time_since_sync > 60
                    except Exception:
                        should_sync = True
                
                if should_sync and _check_gmail_rate_limit(uid):
                    try:
                        sync_result = sync_thread_message(gmail_service, thread_id, contact_email, user_email)
                        
                        # Update contact with synced data
                        updates = {
                            "lastMessageSnippet": sync_result.get('snippet', ''),
                            "lastActivityAt": sync_result.get('lastActivityAt'),
                            "lastSyncAt": datetime.utcnow().isoformat(),
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
                        # Update lastSyncAt even on error to avoid retrying immediately
                        doc.reference.update({
                            "lastSyncAt": datetime.utcnow().isoformat(),
                            "updatedAt": datetime.utcnow().isoformat()
                        })
                elif not should_sync:
                    print(f"⏭️ Skipping sync for contact {doc.id} (synced recently)")
                else:
                    print(f"⚠️ Rate limit exceeded, skipping sync for contact {doc.id}")
            
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

    # Pagination
    total_threads = len(threads)
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated_threads = threads[start_idx:end_idx]
    
    has_next = end_idx < total_threads
    has_prev = page > 1

    return jsonify({
        "threads": paginated_threads,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total_threads,
            "total_pages": (total_threads + per_page - 1) // per_page,
            "has_next": has_next,
            "has_prev": has_prev
        }
    }), 200


@outbox_bp.post("/threads/<thread_id>/regenerate")
@require_firebase_auth
def regenerate(thread_id):
    try:
        db = get_db()
    except RuntimeError as e:
        error_msg = str(e)
        print(f"❌ Database not available: {error_msg}")
        return jsonify({
            'success': False,
            'error': 'Database not initialized',
            'message': 'The database is temporarily unavailable. Please try again in a moment.',
            'error_code': 'database_unavailable'
        }), 500
    
    uid = request.firebase_user["uid"]
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()
    
    if not user_doc.exists:
        return jsonify({
            "success": False, 
            "message": "User account not found",
            "error_code": "user_not_found"
        }), 404

    # Check credits BEFORE doing any expensive operations
    user_data = user_doc.to_dict() or {}
    current_credits = check_and_reset_credits(user_ref, user_data)
    
    if current_credits < REPLY_GENERATION_CREDIT_COST:
        return jsonify({
            "success": False,
            "message": f"Insufficient credits. You need {REPLY_GENERATION_CREDIT_COST} credits to generate a reply, but you only have {current_credits} credits.",
            "error_code": "insufficient_credits",
            "credits_required": REPLY_GENERATION_CREDIT_COST,
            "credits_available": current_credits
        }), 402

    contact_ref = (
        db.collection("users")
        .document(uid)
        .collection("contacts")
        .document(thread_id)
    )

    doc = contact_ref.get()
    if not doc.exists:
        return jsonify({
            "success": False, 
            "message": "Contact not found",
            "error_code": "contact_not_found"
        }), 404

    data = doc.to_dict()
    thread_id_gmail = data.get("gmailThreadId") or data.get("gmail_thread_id")
    contact_email = data.get("email")
    
    if not thread_id_gmail:
        return jsonify({
            "success": False, 
            "message": "No Gmail thread found for this contact. Make sure you've sent an email to this contact first.",
            "error_code": "no_thread"
        }), 400

    # Get user email to verify message is not from user
    user_email = request.firebase_user.get('email')
    if not user_email:
        return jsonify({
            "success": False, 
            "message": "User email not found. Please reconnect your Gmail account.",
            "error_code": "user_email_missing"
        }), 400
    
    # Get Gmail service
    try:
        creds = _load_user_gmail_creds(uid)
        if not creds:
            return jsonify({
                "success": False, 
                "message": "Gmail not connected. Please connect your Gmail account in Account Settings.",
                "error_code": "gmail_not_connected"
            }), 401
        
        gmail_service = _gmail_service(creds)
    except Exception as gmail_error:
        return jsonify({
            "success": False,
            "message": f"Failed to connect to Gmail: {str(gmail_error)}. Please try reconnecting your Gmail account.",
            "error_code": "gmail_connection_error"
        }), 500
    
    # Get the latest message from the thread
    try:
        latest_message = get_latest_message_from_thread(gmail_service, thread_id_gmail, contact_email)
        if not latest_message:
            return jsonify({
                "success": False, 
                "message": "No messages found in thread. The thread may have been deleted.",
                "error_code": "no_messages"
            }), 400
    except Exception as msg_error:
        return jsonify({
            "success": False,
            "message": f"Failed to retrieve messages from Gmail: {str(msg_error)}. Please try again.",
            "error_code": "gmail_api_error"
        }), 500
    
    # Check if the latest message is from the contact (not from user)
    headers = latest_message.get('payload', {}).get('headers', [])
    from_header = next((h['value'] for h in headers if h['name'].lower() == 'from'), '')
    
    if user_email.lower() in from_header.lower():
        return jsonify({
            "success": False, 
            "message": "No reply from contact yet. The latest message in this thread is from you. Generate a reply after the contact responds.",
            "error_code": "no_contact_reply"
        }), 400
    
    # Extract message content
    try:
        message_content = extract_message_body(latest_message)
        if not message_content:
            message_content = latest_message.get('snippet', 'No message content available.')
    except Exception as extract_error:
        return jsonify({
            "success": False,
            "message": f"Failed to extract message content: {str(extract_error)}",
            "error_code": "message_extraction_error"
        }), 500
    
    # Get user profile and resume from Firestore
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
    
    # Deduct credits BEFORE generating reply (to prevent negative balances)
    print(f"[Outbox] Deducting {REPLY_GENERATION_CREDIT_COST} credits before reply generation...")
    success, new_credits = deduct_credits_atomic(uid, REPLY_GENERATION_CREDIT_COST, "reply_generation")
    
    if not success:
        return jsonify({
            "success": False,
            "message": f"Insufficient credits. You need {REPLY_GENERATION_CREDIT_COST} credits, but you only have {new_credits} credits.",
            "error_code": "insufficient_credits",
            "credits_required": REPLY_GENERATION_CREDIT_COST,
            "credits_available": new_credits
        }), 402
    
    print(f"[Outbox] Credits deducted: {current_credits} → {new_credits}")
    
    # Generate AI reply (with timeout handling)
    print(f"🤖 Generating AI reply for contact {thread_id}...")
    original_subject = data.get("emailSubject") or data.get("email_subject")
    
    try:
        reply_result = generate_reply_to_message(
            message_content=message_content,
            contact_data=data,
            resume_text=resume_text,
            user_profile=user_profile,
            original_email_subject=original_subject
        )
        
        suggested_reply = reply_result.get('body', '')
        reply_type = reply_result.get('replyType', 'general')
        
        if not suggested_reply:
            raise ValueError("Reply generation returned empty result")
    except Exception as ai_error:
        # Refund credits on AI generation failure
        print(f"❌ AI reply generation failed: {ai_error}")
        refund_success, _ = refund_credits_atomic(uid, REPLY_GENERATION_CREDIT_COST, "reply_generation_refund")
        print(f"[Outbox] Refunded credits: {refund_success}")
        
        return jsonify({
            "success": False,
            "message": f"Failed to generate reply: {str(ai_error)}. Your credits have been refunded. Please try again.",
            "error_code": "ai_generation_error",
            "credits_refunded": refund_success
        }), 500
    
    # Create Gmail draft with the reply
    draft_id = None
    gmail_draft_url = None
    
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
        # Don't fail the request if draft creation fails - user still has the reply text
    
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
    
    try:
        contact_ref.update(updates)
    except Exception as update_error:
        print(f"⚠️ Failed to update contact: {update_error}")
        # Continue anyway - the reply was generated successfully

    # Rebuild clean payload
    merged = {**data, **updates}
    fake_doc = type("Obj", (), {"id": thread_id, "to_dict": lambda self=merged: merged})
    thread = _build_outbox_thread(fake_doc)

    return jsonify({
        "success": True,
        "message": "Reply draft generated and saved.",
        "thread": thread,
        "credits_used": REPLY_GENERATION_CREDIT_COST,
        "credits_remaining": new_credits
    }), 200
