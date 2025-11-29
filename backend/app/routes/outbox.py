from flask import Blueprint, jsonify, request
from datetime import datetime

from app.extensions import get_db, require_firebase_auth
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service

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

    status = "new_reply" if has_unread else "waiting_on_them"

    last_activity = (
        data.get("lastActivityAt")
        or data.get("last_activity_at")
        or datetime.utcnow().isoformat()
    )

    last_message_snippet = (
        data.get("lastMessageSnippet")
        or data.get("last_message_snippet")
        or "We will sync the latest Gmail reply soon."
    )

    suggested_reply = data.get("suggestedReply")
    gmail_draft_url = data.get("gmailDraftUrl")
    reply_type = data.get("replyType")

    has_draft = bool(
        gmail_draft_url
        or data.get("gmailDraftId")
        or data.get("gmail_draft_id")
    )

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
            
            # If contact has a draft but no threadId, try to get threadId from Gmail
            if has_draft and not has_thread_id:
                draft_id = data.get("gmailDraftId") or data.get("gmail_draft_id")
                if draft_id:
                    try:
                        creds = _load_user_gmail_creds(uid)
                        if creds:
                            gmail_service = _gmail_service(creds)
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
                        else:
                            print(f"⚠️ No Gmail credentials for user {uid}")
                    except Exception as e:
                        print(f"⚠️ Could not fetch threadId for draft {draft_id}: {e}")

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
    company = data.get("company") or "your team"
    first = data.get("firstName") or data.get("first_name") or "there"

    # Placeholder suggested reply — will replace with real Gmail + LLM later
    suggested_reply = (
        f"Hi {first},\n"
        f"Thanks so much for getting back to me. I’d love to stay in touch and "
        f"continue the conversation about {company}.\n\n"
        f"Best,\n[Your Name]"
    )

    creds = _load_user_gmail_creds(uid)
    gmail_url = "https://mail.google.com/mail/#drafts" if creds else None

    updates = {
        "suggestedReply": suggested_reply,
        "gmailDraftUrl": gmail_url,
        "replyType": "positive",
        "draftCreatedAt": datetime.utcnow(),
    }

    contact_ref.set(updates, merge=True)

    # Rebuild clean payload
    merged = {**data, **updates}
    fake_doc = type("Obj", (), {"id": thread_id, "to_dict": lambda self=merged: merged})
    thread = _build_outbox_thread(fake_doc)

    return jsonify({
        "success": True,
        "message": "Reply draft updated.",
        "thread": thread,
    }), 200
