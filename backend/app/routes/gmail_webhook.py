"""
Gmail push notification webhook — receives Pub/Sub notifications and detects replies.
"""
import base64
import json
import re
import threading
from datetime import datetime

from flask import Blueprint, jsonify, request

from app.config import GMAIL_WEBHOOK_SECRET
from app.extensions import get_db
from app.services.gmail_client import (
    find_uid_by_gmail_address,
    get_gmail_service_for_user,
    start_gmail_watch,
)

gmail_webhook_bp = Blueprint("gmail_webhook", __name__, url_prefix="/api/gmail")


def _extract_email_from_header(from_header):
    """Extract email from 'Name <email@domain.com>' or 'email@domain.com'."""
    if not from_header:
        return ""
    from_header = (from_header or "").strip()
    match = re.search(r"<([^>]+)>", from_header)
    if match:
        return match.group(1).strip().lower()
    return from_header.lower()


def _process_gmail_notification(email_address, history_id):
    """
    Background worker: find user, fetch history, detect new replies, update contacts and notifications.
    """
    try:
        uid = find_uid_by_gmail_address(email_address)
        if not uid:
            print(f"[gmail_webhook] No user found for Gmail address: {email_address}")
            return

        db = get_db()
        if not db:
            print(f"[gmail_webhook] Database not available")
            return

        gmail_ref = db.collection("users").document(uid).collection("integrations").document("gmail")
        gmail_doc = gmail_ref.get()
        if not gmail_doc.exists:
            print(f"[gmail_webhook] No Gmail integration for uid={uid}")
            return

        gmail_data = gmail_doc.to_dict() or {}
        last_history_id_raw = gmail_data.get("watchHistoryId") or gmail_data.get("watch_history_id")
        try:
            last_history_id = str(last_history_id_raw).strip() if last_history_id_raw is not None else None
        except Exception:
            last_history_id = None

        # Skip if we already processed this or newer (at-least-once delivery)
        try:
            hi_int = int(history_id) if history_id else 0
            last_int = int(last_history_id) if last_history_id else 0
            if last_int >= hi_int and last_history_id is not None:
                return
        except (TypeError, ValueError):
            pass

        if not last_history_id:
            print(f"[gmail_webhook] No watchHistoryId for uid={uid}, updating to {history_id} and skipping")
            gmail_ref.set({"watchHistoryId": history_id}, merge=True)
            return

        user_doc = db.collection("users").document(uid).get()
        user_email = (user_doc.to_dict() or {}).get("email") if user_doc.exists else email_address
        if not user_email:
            user_email = email_address

        service = get_gmail_service_for_user(user_email, user_id=uid)
        if not service:
            print(f"[gmail_webhook] Could not get Gmail service for uid={uid}")
            return

        # Fetch history (paginate)
        all_message_ids = []
        page_token = None
        while True:
            try:
                history_request = service.users().history().list(
                    userId="me",
                    startHistoryId=last_history_id,
                    historyTypes=["messageAdded"],
                    pageToken=page_token,
                )
                history_response = history_request.execute()
            except Exception as e:
                err_str = str(e).lower()
                if "404" in err_str or "not found" in err_str or "historyid" in err_str:
                    print(f"[gmail_webhook] History 404 or invalid for uid={uid}, resetting watch: {e}")
                    try:
                        start_gmail_watch(uid)
                    except Exception as watch_err:
                        print(f"[gmail_webhook] Failed to reset watch: {watch_err}")
                else:
                    print(f"[gmail_webhook] History list error for uid={uid}: {e}")
                return

            for hist in history_response.get("history", []):
                for added in hist.get("messagesAdded", []):
                    msg = added.get("message", {})
                    msg_id = msg.get("id")
                    if msg_id:
                        all_message_ids.append((msg_id, msg.get("threadId")))

            page_token = history_response.get("nextPageToken")
            if not page_token:
                break

        now_iso = datetime.utcnow().isoformat() + "Z"
        user_email_lower = (user_email or "").lower()
        contacts_ref = db.collection("users").document(uid).collection("contacts")
        notif_ref = db.collection("users").document(uid).collection("notifications").document("outbox")

        for msg_id, thread_id in all_message_ids:
            if not thread_id:
                continue
            try:
                msg_resp = service.users().messages().get(
                    userId="me",
                    id=msg_id,
                    format="metadata",
                    metadataHeaders=["From", "To", "Subject"],
                ).execute()
            except Exception as e:
                print(f"[gmail_webhook] messages.get error msg={msg_id}: {e}")
                continue

            if not thread_id:
                thread_id = msg_resp.get("threadId")
            if not thread_id:
                continue

            headers = msg_resp.get("payload", {}).get("headers", [])
            from_header = next((h.get("value", "") for h in headers if h.get("name", "").lower() == "from"), "")
            from_email = _extract_email_from_header(from_header)
            if from_email and user_email_lower and from_email == user_email_lower:
                continue  # Sent by user, not a reply

            # Find contact with this thread
            try:
                query = contacts_ref.where("gmailThreadId", "==", thread_id).limit(1)
                contact_docs = list(query.stream())
                if not contact_docs:
                    query = contacts_ref.where("gmail_thread_id", "==", thread_id).limit(1)
                    contact_docs = list(query.stream())
            except Exception as e:
                print(f"[gmail_webhook] Contact query error: {e}")
                continue

            if not contact_docs:
                continue

            contact_doc = contact_docs[0]
            contact_id = contact_doc.id
            contact_data = contact_doc.to_dict() or {}
            contact_name = (contact_data.get("firstName") or contact_data.get("first_name") or "").strip()
            if contact_name:
                contact_name += " "
            contact_name += (contact_data.get("lastName") or contact_data.get("last_name") or "").strip()
            contact_name = contact_name.strip() or contact_data.get("email", "")
            company = (contact_data.get("company") or "").strip()
            message_snippet = (msg_resp.get("snippet") or "")[:100]

            contact_ref = contacts_ref.document(contact_id)
            updates = {
                "pipelineStage": "replied",
                "hasUnreadReply": True,
                "lastActivityAt": now_iso,
                "lastMessageSnippet": message_snippet or (msg_resp.get("snippet") or ""),
                "threadStatus": "new_reply",
                "updatedAt": now_iso,
            }
            if not contact_data.get("replyReceivedAt") and not contact_data.get("reply_received_at"):
                updates["replyReceivedAt"] = now_iso
            contact_ref.update(updates)

            print(f"[gmail_webhook] Reply detected for uid={uid} contact={contact_id} from={from_header}")

            # Notification doc
            notif_doc = notif_ref.get()
            notif_data = notif_doc.to_dict() if notif_doc.exists else {}
            unread_count = int(notif_data.get("unreadReplyCount", 0)) + 1
            items = list(notif_data.get("items", []))
            items.insert(
                0,
                {
                    "contactId": contact_id,
                    "contactName": contact_name,
                    "company": company,
                    "snippet": message_snippet,
                    "timestamp": now_iso,
                    "read": False,
                },
            )
            items = items[:20]
            notif_ref.set(
                {
                    "unreadReplyCount": unread_count,
                    "items": items,
                    "updatedAt": now_iso,
                },
                merge=True,
            )

        gmail_ref.set({"watchHistoryId": history_id}, merge=True)

    except Exception as e:
        print(f"[gmail_webhook] _process_gmail_notification error: {e}")
        import traceback
        traceback.print_exc()


@gmail_webhook_bp.post("/webhook")
def webhook():
    """
    Pub/Sub push endpoint. Verifies token, decodes message, returns 200 immediately,
    processes notification in a background thread.
    """
    if GMAIL_WEBHOOK_SECRET:
        token = (request.args.get("token") or "").strip()
        if token != GMAIL_WEBHOOK_SECRET:
            return jsonify({"error": "Forbidden"}), 403

    envelope = request.get_json(silent=True) or {}
    message = envelope.get("message", {})
    data_b64 = message.get("data", "")
    if not data_b64:
        return jsonify({"status": "ok"}), 200

    try:
        data_bytes = base64.urlsafe_b64decode(data_b64)
        data = json.loads(data_bytes.decode("utf-8"))
    except Exception as e:
        print(f"[gmail_webhook] Failed to decode message: {e}")
        return jsonify({"status": "ok"}), 200

    email_address = (data.get("emailAddress") or "").strip()
    history_id = str(data.get("historyId", ""))

    threading.Thread(
        target=_process_gmail_notification,
        args=(email_address, history_id),
        daemon=True,
    ).start()

    return jsonify({"status": "ok"}), 200
