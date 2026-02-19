from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import time

from app.extensions import get_db, require_firebase_auth

# Sync lock: skip Gmail calls if last sync was within this many seconds
SYNC_LOCK_SECONDS = 10


def _write_last_sync_error(contact_ref, code, message):
    """Write lastSyncError to the contact doc so the frontend can show it."""
    contact_ref.update({
        "lastSyncError": {
            "code": code,
            "message": message,
            "at": datetime.utcnow().isoformat()
        },
        "updatedAt": datetime.utcnow().isoformat()
    })


def _clear_last_sync_error(contact_ref):
    """Clear lastSyncError after a successful sync."""
    contact_ref.update({
        "lastSyncError": None,
        "updatedAt": datetime.utcnow().isoformat()
    })


def _is_gmail_auth_error(e):
    """True if the exception indicates Gmail token expired/revoked (should return 401)."""
    msg = (str(e) or "").lower()
    return (
        "invalid_grant" in msg
        or "token has been expired" in msg
        or "token expired" in msg
        or "revoked" in msg
        or "credentials" in msg
        or "gmail refresh token invalid" in msg
    )


def _capture_sentry(e):
    """Log the exception to Sentry if available."""
    try:
        import sentry_sdk
        sentry_sdk.capture_exception(e)
    except ImportError:
        pass


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

# Allowed pipeline stages for manual updates and filtering
ALLOWED_PIPELINE_STAGES = frozenset({
    "draft_created", "email_sent", "waiting_on_reply", "replied",
    "meeting_scheduled", "connected", "no_response", "bounced", "closed",
})


def _contact_has_thread_or_draft(data):
    """Same logic as list_threads: include iff gmailThreadId OR gmailDraftId OR gmailDraftUrl. Used by list_threads and stats."""
    if not data:
        return False
    has_thread = bool(data.get("gmailThreadId") or data.get("gmail_thread_id"))
    has_draft = bool(
        data.get("gmailDraftId")
        or data.get("gmail_draft_id")
        or data.get("gmailDraftUrl")
        or data.get("gmail_draft_url")
    )
    return has_thread or has_draft


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

    # Use stored pipelineStage, or derive from legacy fields (mirrors backfill/stats)
    pipeline_stage = data.get("pipelineStage") or data.get("pipeline_stage")
    if not pipeline_stage:
        if has_unread:
            pipeline_stage = "replied"
        elif has_draft and draft_still_exists is not False:
            pipeline_stage = "draft_created"
        elif gmail_thread_id and draft_still_exists is False:
            pipeline_stage = "waiting_on_reply"
        # else leave None (no draft/thread or unknown)
    last_sync_error = data.get("lastSyncError")
    email_sent_at = data.get("emailSentAt") or data.get("email_sent_at")
    has_unread_reply = bool(data.get("hasUnreadReply") or data.get("has_unread_reply"))
    last_sync_at = data.get("lastSyncAt") or data.get("last_sync_at")

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
        "pipelineStage": pipeline_stage,
        "lastSyncError": last_sync_error,
        "emailSentAt": email_sent_at,
        "hasUnreadReply": has_unread_reply,
        "lastSyncAt": last_sync_at,
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
    
    # Pagination and filters
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 50))  # Default 50, max 100
    per_page = min(per_page, 100)  # Cap at 100
    stage_param = (request.args.get('stage') or "").strip()
    stage_filter = [s.strip() for s in stage_param.split(",") if s.strip()] if stage_param else None
    sort_field = request.args.get('sort') or "lastActivityAt"
    sort_dir = (request.args.get('sort_dir') or "desc").strip().lower()
    sort_desc = sort_dir != "asc"
    
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
    # OPTIMIZATION: Return cached data immediately without Gmail API calls
    # Gmail sync happens lazily via the /sync endpoint when user opens a thread
    contacts = []
    
    for doc in docs:
        data = doc.to_dict() or {}
        if not _contact_has_thread_or_draft(data):
            continue
        contacts.append(doc)
        has_thread_id = bool(data.get("gmailThreadId") or data.get("gmail_thread_id"))
        has_draft = bool(
            data.get("gmailDraftId") or data.get("gmail_draft_id") or data.get("gmailDraftUrl") or data.get("gmail_draft_url")
        )
        print(f"✅ Contact {doc.id} included: threadId={has_thread_id}, draft={has_draft}")

    print(f"📧 Contacts with threads/drafts: {len(contacts)}")
    threads = [_build_outbox_thread(doc) for doc in contacts]

    # Deduplicate by email: for each email (normalized lower), keep one canonical (most recent lastActivityAt)
    # Mark duplicates with duplicateOf = canonical contact id so frontend can surface or filter
    def _email_key(t):
        return (t.get("email") or "").strip().lower()

    by_email = {}
    for t in threads:
        key = _email_key(t)
        if key not in by_email:
            by_email[key] = []
        by_email[key].append(t)

    for key, group in by_email.items():
        if len(group) <= 1:
            continue
        # Canonical = most recent lastActivityAt (or id as tiebreaker)
        group.sort(key=lambda t: (t.get("lastActivityAt") or "", t.get("id") or ""), reverse=True)
        canonical_id = group[0]["id"]
        for t in group[1:]:
            t["duplicateOf"] = canonical_id

    # Filter by pipelineStage (comma-separated)
    if stage_filter:
        threads = [t for t in threads if (t.get("pipelineStage") or "") in stage_filter]

    # Sort (default lastActivityAt desc)
    sort_key_fn = lambda t: (t.get(sort_field) or "", t.get("id") or "")
    threads.sort(key=sort_key_fn, reverse=sort_desc)

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


@outbox_bp.post("/threads/batch-sync")
@require_firebase_auth
def batch_sync_threads():
    """Sync multiple contacts with Gmail. Body: {"contactIds": [...]} or {"mode": "stale", "max": 10}. Max 10, 1s delay between each."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": "Database not initialized", "message": str(e)}), 500

    body = request.get_json(silent=True) or {}
    uid = request.firebase_user["uid"]
    user_email = request.firebase_user.get("email") or ""

    if body.get("mode") == "stale":
        from app.services.background_sync import get_stale_thread_ids
        max_stale = int(body.get("max", 10)) if isinstance(body.get("max"), (int, float)) else 10
        max_stale = min(max(0, max_stale), 10)
        contact_ids = get_stale_thread_ids(uid, max_threads=max_stale)
    else:
        contact_ids = body.get("contactIds") or []
        if not isinstance(contact_ids, list):
            contact_ids = []
        contact_ids = contact_ids[:10]

    results = []
    for i, contact_id in enumerate(contact_ids):
        if i > 0:
            time.sleep(1)
        try:
            thread, synced, error_code = _perform_sync(uid, contact_id, user_email)
            if error_code == "contact_not_found":
                results.append({"contactId": contact_id, "synced": False, "error": "contact_not_found"})
            else:
                results.append({
                    "contactId": contact_id,
                    "synced": synced and error_code is None,
                    "pipelineStage": thread.get("pipelineStage") if thread else None,
                })
        except Exception:
            results.append({"contactId": contact_id, "synced": False, "error": "gmail_error"})
    return jsonify({"results": results}), 200


@outbox_bp.patch("/threads/<contact_id>/stage")
@require_firebase_auth
def update_thread_stage(contact_id):
    """Update pipelineStage (and optional timestamps) for a contact."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": "Database not initialized", "message": str(e)}), 500

    body = request.get_json(silent=True) or {}
    stage = (body.get("pipelineStage") or "").strip()
    if not stage or stage not in ALLOWED_PIPELINE_STAGES:
        return jsonify({
            "error": "invalid_stage",
            "message": "pipelineStage must be one of: " + ", ".join(sorted(ALLOWED_PIPELINE_STAGES)),
        }), 400

    uid = request.firebase_user["uid"]
    contact_ref = db.collection("users").document(uid).collection("contacts").document(contact_id)
    doc = contact_ref.get()
    if not doc.exists:
        return jsonify({"error": "Contact not found", "error_code": "contact_not_found"}), 404

    data = doc.to_dict() or {}
    updates = {
        "pipelineStage": stage,
        "updatedAt": datetime.utcnow().isoformat(),
    }
    if stage == "meeting_scheduled" and not data.get("meetingScheduledAt"):
        updates["meetingScheduledAt"] = datetime.utcnow().isoformat()
    if stage == "connected" and not data.get("connectedAt"):
        updates["connectedAt"] = datetime.utcnow().isoformat()

    contact_ref.update(updates)
    doc = contact_ref.get()
    thread = _build_outbox_thread(doc)
    return jsonify({"thread": thread}), 200


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
    
    # Update contact with suggested reply (new draft created for follow-up)
    updates = {
        "suggestedReply": suggested_reply,
        "replyType": reply_type,
        "draftCreatedAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
        "pipelineStage": "draft_created",
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


def _perform_sync(uid, contact_id, user_email):
    """
    Run sync for one contact. Returns (thread_dict, synced: bool, error_code: str | None).
    error_code one of: contact_not_found, gmail_disconnected, rate_limited, gmail_error, or None.
    """
    try:
        db = get_db()
    except RuntimeError:
        return (None, False, "gmail_error")

    contact_ref = db.collection("users").document(uid).collection("contacts").document(contact_id)
    doc = contact_ref.get()
    if not doc.exists:
        return (None, False, "contact_not_found")

    data = doc.to_dict()
    gmail_thread_id = data.get("gmailThreadId") or data.get("gmail_thread_id")
    has_draft = bool(
        data.get("gmailDraftId") or 
        data.get("gmail_draft_id") or 
        data.get("gmailDraftUrl") or 
        data.get("gmail_draft_url")
    )
    
    # 1. Sync lock
    last_sync = data.get("lastSyncAt")
    if last_sync:
        try:
            last_sync_dt = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
            time_since_sync = (datetime.utcnow() - last_sync_dt.replace(tzinfo=None)).total_seconds()
            if time_since_sync < SYNC_LOCK_SECONDS:
                return (_build_outbox_thread(doc), False, "recently_synced")
        except Exception:
            pass

    # 2. Get Gmail service
    gmail_service = None
    try:
        creds = _load_user_gmail_creds(uid)
        if not creds:
            _write_last_sync_error(contact_ref, "gmail_disconnected", "Please reconnect Gmail")
            doc = contact_ref.get()
            return (_build_outbox_thread(doc), False, "gmail_disconnected")
        gmail_service = _gmail_service(creds)
    except Exception as e:
        print(f"⚠️ Could not initialize Gmail service: {e}")
        _write_last_sync_error(
            contact_ref,
            "gmail_disconnected" if _is_gmail_auth_error(e) else "gmail_error",
            "Please reconnect Gmail" if _is_gmail_auth_error(e) else "Could not sync with Gmail"
        )
        if _is_gmail_auth_error(e):
            doc = contact_ref.get()
            return (_build_outbox_thread(doc), False, "gmail_disconnected")
        _capture_sentry(e)
        doc = contact_ref.get()
        return (_build_outbox_thread(doc), False, "gmail_error")
    
    # 3. Check draft existence if we have a draft ID
    draft_still_exists = data.get("draftStillExists", True)
    if has_draft and gmail_service:
        draft_id = data.get("gmailDraftId") or data.get("gmail_draft_id")
        if draft_id:
            if not _check_gmail_rate_limit(uid):
                _write_last_sync_error(contact_ref, "rate_limited", "Too many requests, try again shortly")
                doc = contact_ref.get()
                return (_build_outbox_thread(doc), False, "rate_limited")
            try:
                exists, from_cache = _check_draft_exists_cached(gmail_service, draft_id)
                draft_still_exists = exists
                
                draft_updates = {
                    "draftStillExists": exists,
                    "updatedAt": datetime.utcnow().isoformat()
                }
                if not exists and gmail_thread_id:
                    draft_updates["pipelineStage"] = "waiting_on_reply"
                    if not data.get("emailSentAt"):
                        draft_updates["emailSentAt"] = datetime.utcnow().isoformat()
                doc.reference.update(draft_updates)
                
                if not exists and not gmail_thread_id:
                    contact_email = data.get("email")
                    email_subject = data.get("emailSubject") or data.get("email_subject")
                    if contact_email and email_subject:
                        if not _check_gmail_rate_limit(uid):
                            _write_last_sync_error(contact_ref, "rate_limited", "Too many requests, try again shortly")
                            doc = contact_ref.get()
                            return (_build_outbox_thread(doc), False, "rate_limited")
                        try:
                            query = f'to:{contact_email} subject:"{email_subject[:50]}"'
                            results = gmail_service.users().messages().list(
                                userId='me',
                                q=query,
                                maxResults=1
                            ).execute()
                            messages = results.get('messages', [])
                            if messages:
                                msg = gmail_service.users().messages().get(
                                    userId='me',
                                    id=messages[0]['id'],
                                    format='minimal'
                                ).execute()
                                thread_id_found = msg.get('threadId')
                                if thread_id_found:
                                    backfill_updates = {
                                        "gmailThreadId": thread_id_found,
                                        "pipelineStage": "waiting_on_reply",
                                        "updatedAt": datetime.utcnow().isoformat()
                                    }
                                    if not data.get("emailSentAt"):
                                        backfill_updates["emailSentAt"] = datetime.utcnow().isoformat()
                                    doc.reference.update(backfill_updates)
                                    gmail_thread_id = thread_id_found
                                    doc = contact_ref.get()
                                    data = doc.to_dict()
                                    print(f"✅ Found threadId {thread_id_found} for sent draft")
                        except Exception as search_error:
                            print(f"⚠️ Could not find threadId for sent draft: {search_error}")
                            _write_last_sync_error(contact_ref, "gmail_error", "Could not sync with Gmail")
                            _capture_sentry(search_error)
                            doc = contact_ref.get()
                            return (_build_outbox_thread(doc), False, "gmail_error")
            except Exception as e:
                print(f"⚠️ Error checking draft {draft_id}: {e}")
                draft_still_exists = data.get("draftStillExists", True)
                _write_last_sync_error(contact_ref, "gmail_error", "Could not sync with Gmail")
                _capture_sentry(e)
                doc = contact_ref.get()
                return (_build_outbox_thread(doc), False, "gmail_error")
    
    # When we first detect draft sent (draft gone + have threadId), set emailSentAt once and pipelineStage
    if not draft_still_exists and gmail_thread_id:
        sent_updates = {"pipelineStage": "waiting_on_reply", "updatedAt": datetime.utcnow().isoformat()}
        if not data.get("emailSentAt"):
            sent_updates["emailSentAt"] = datetime.utcnow().isoformat()
        doc.reference.update(sent_updates)
    
    # 4. Sync Gmail messages if we have a thread ID and draft no longer exists
    if gmail_thread_id and gmail_service and not draft_still_exists:
        contact_email = data.get("email")
        user_email = request.firebase_user.get('email')
        
        last_sync = data.get("lastSyncAt")
        should_sync = True
        if last_sync:
            try:
                last_sync_dt = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
                time_since_sync = (datetime.utcnow() - last_sync_dt.replace(tzinfo=None)).total_seconds()
                should_sync = time_since_sync > 30
            except Exception:
                should_sync = True
        
        if should_sync:
            if not _check_gmail_rate_limit(uid):
                _write_last_sync_error(contact_ref, "rate_limited", "Too many requests, try again shortly")
                doc = contact_ref.get()
                return (_build_outbox_thread(doc), False, "rate_limited")
            try:
                sync_result = sync_thread_message(gmail_service, gmail_thread_id, contact_email, user_email)
                
                updates = {
                    "lastMessageSnippet": sync_result.get('snippet', ''),
                    "lastActivityAt": sync_result.get('lastActivityAt'),
                    "lastSyncAt": datetime.utcnow().isoformat(),
                    "updatedAt": datetime.utcnow().isoformat(),
                    "lastSyncError": None,
                }
                if 'hasUnreadReply' in sync_result:
                    updates["hasUnreadReply"] = sync_result['hasUnreadReply']
                if 'status' in sync_result:
                    updates["threadStatus"] = sync_result['status']
                sync_status = sync_result.get('status')
                if sync_status in ('new_reply', 'waiting_on_you') or sync_result.get('hasUnreadReply'):
                    updates["pipelineStage"] = "replied"
                
                doc.reference.update(updates)
                print(f"✅ Synced message for contact {contact_id}: status={sync_result.get('status')}, snippet={sync_result.get('snippet', '')[:50]}...")
                doc = contact_ref.get()
            except Exception as e:
                print(f"⚠️ Could not sync message for contact {contact_id}: {e}")
                _write_last_sync_error(contact_ref, "gmail_error", "Could not sync with Gmail")
                _capture_sentry(e)
                doc.reference.update({
                    "lastSyncAt": datetime.utcnow().isoformat(),
                    "updatedAt": datetime.utcnow().isoformat()
                })
                doc = contact_ref.get()
                return (_build_outbox_thread(doc), False, "gmail_error")

    if gmail_service and (has_draft or (gmail_thread_id and not draft_still_exists)):
        _clear_last_sync_error(contact_ref)
        doc = contact_ref.get()

    return (_build_outbox_thread(doc), True, None)


@outbox_bp.post("/threads/<thread_id>/sync")
@require_firebase_auth
def sync_thread(thread_id):
    """Sync a specific thread with Gmail. Called when user opens a thread."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": "Database not initialized", "message": str(e)}), 500

    uid = request.firebase_user["uid"]
    user_email = request.firebase_user.get("email") or ""
    thread, synced, error_code = _perform_sync(uid, thread_id, user_email)

    if error_code == "contact_not_found":
        return jsonify({"error": "Contact not found", "error_code": "contact_not_found"}), 404
    if error_code == "gmail_disconnected":
        return jsonify({
            "thread": thread,
            "synced": False,
            "error": "gmail_disconnected",
            "message": "Please reconnect Gmail"
        }), 401
    if error_code == "rate_limited":
        return jsonify({
            "thread": thread,
            "synced": False,
            "error": "rate_limited",
            "message": "Too many requests, try again shortly"
        }), 429
    if error_code == "gmail_error":
        return jsonify({
            "thread": thread,
            "synced": False,
            "error": "gmail_error",
            "message": "Could not sync with Gmail"
        }), 502
    if error_code == "recently_synced":
        return jsonify({"thread": thread, "synced": False, "reason": "recently_synced"}), 200

    return jsonify({"thread": thread, "synced": True}), 200


def _parse_iso_to_naive_utc(s):
    """Parse ISO date string to naive UTC datetime for comparison. Returns None on failure."""
    if not s:
        return None
    try:
        s = (s or "").strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None


@outbox_bp.get("/stats")
@require_firebase_auth
def outbox_stats():
    """Return counts by pipelineStage, replyRate, avgResponseTimeDays, meetingRate, thisWeekSent, thisWeekReplied."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": "Database not initialized", "message": str(e)}), 500

    uid = request.firebase_user["uid"]
    contacts_ref = db.collection("users").document(uid).collection("contacts")
    docs = list(contacts_ref.stream())

    now_utc = datetime.utcnow()
    seven_days_ago = now_utc - timedelta(days=7)

    # Same query as list_threads: only contacts that have gmailThreadId OR gmailDraftId OR gmailDraftUrl
    counts = {}
    for stage in ALLOWED_PIPELINE_STAGES:
        counts[stage] = 0
    total = 0
    replied = 0
    waiting_plus_replied_plus_no_response = 0
    this_week_sent = 0
    this_week_replied = 0
    response_days_list = []  # for avgResponseTimeDays

    for doc in docs:
        data = doc.to_dict() or {}
        if not _contact_has_thread_or_draft(data):
            continue
        total += 1
        stage = data.get("pipelineStage") or data.get("pipeline_stage")
        # Fallback for contacts without pipelineStage: derive from legacy fields (mirrors backfill)
        if not stage:
            has_unread = bool(data.get("hasUnreadReply") or data.get("has_unread_reply"))
            draft_still_exists = data.get("draftStillExists", True)
            has_draft = bool(
                data.get("gmailDraftId") or data.get("gmail_draft_id") or data.get("gmailDraftUrl") or data.get("gmail_draft_url")
            )
            has_thread = bool(data.get("gmailThreadId") or data.get("gmail_thread_id"))
            if has_unread:
                stage = "replied"
            elif has_draft and draft_still_exists is not False:
                stage = "draft_created"
            elif has_thread and draft_still_exists is False:
                stage = "waiting_on_reply"
        # Debug: log total and stages (helps when stats show 0)
        print(f"[outbox/stats] contact {doc.id} pipelineStage={data.get('pipelineStage')} derived={stage}")
        if stage and stage in ALLOWED_PIPELINE_STAGES:
            counts[stage] = counts.get(stage, 0) + 1
        if stage == "replied":
            replied += 1
        if stage in ("waiting_on_reply", "replied", "no_response"):
            waiting_plus_replied_plus_no_response += 1

        # thisWeekSent: emailSentAt within last 7 days
        email_sent_at = data.get("emailSentAt") or data.get("email_sent_at")
        if email_sent_at:
            sent_dt = _parse_iso_to_naive_utc(email_sent_at)
            if sent_dt and sent_dt >= seven_days_ago:
                this_week_sent += 1

        # thisWeekReplied: pipelineStage in replied/meeting_scheduled/connected AND lastActivityAt within last 7 days
        if stage in ("replied", "meeting_scheduled", "connected"):
            last_activity = data.get("lastActivityAt") or data.get("last_activity_at")
            if last_activity:
                activity_dt = _parse_iso_to_naive_utc(last_activity)
                if activity_dt and activity_dt >= seven_days_ago:
                    this_week_replied += 1

        # avgResponseTimeDays: replied/meeting_scheduled/connected with both emailSentAt and reply time
        if stage in ("replied", "meeting_scheduled", "connected"):
            sent_dt = _parse_iso_to_naive_utc(data.get("emailSentAt") or data.get("email_sent_at"))
            reply_at = data.get("replyReceivedAt") or data.get("reply_received_at")
            if not reply_at:
                reply_at = data.get("lastActivityAt") or data.get("last_activity_at")
            reply_dt = _parse_iso_to_naive_utc(reply_at)
            if sent_dt and reply_dt and reply_dt >= sent_dt:
                delta = reply_dt - sent_dt
                response_days_list.append(delta.total_seconds() / 86400.0)

    print(f"[outbox/stats] total_contacts_in_collection={len(docs)} with_thread_or_draft={total} counts={counts}")

    reply_rate = (
        replied / waiting_plus_replied_plus_no_response
        if waiting_plus_replied_plus_no_response else 0.0
    )

    # avgResponseTimeDays: average days between send and first reply, rounded to 1 decimal, or null
    avg_response_time_days = None
    if response_days_list:
        avg_response_time_days = round(sum(response_days_list) / len(response_days_list), 1)

    # meetingRate: meeting_scheduled / (replied + meeting_scheduled + connected)
    denom = (counts.get("replied", 0) + counts.get("meeting_scheduled", 0) + counts.get("connected", 0))
    meeting_rate = (counts.get("meeting_scheduled", 0) / denom) if denom else 0.0

    return jsonify({
        **counts,
        "total": total,
        "replyRate": round(reply_rate, 4),
        "avgResponseTimeDays": avg_response_time_days,
        "meetingRate": round(meeting_rate, 4),
        "thisWeekSent": this_week_sent,
        "thisWeekReplied": this_week_replied,
    }), 200
