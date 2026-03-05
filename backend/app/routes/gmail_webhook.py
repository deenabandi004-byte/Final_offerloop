"""
Gmail push notification webhook — receives Pub/Sub notifications and detects replies.
"""
import base64
import json
import re
from datetime import datetime
from email.utils import parseaddr

from flask import Blueprint, jsonify, request

from google.cloud.firestore_v1 import ArrayUnion

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
        last_history_id_raw = gmail_data.get("watchHistoryId")
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
                # --- User sent a message (draft was sent) ---
                to_header = next((h.get("value", "") for h in headers if h.get("name", "").lower() == "to"), "")
                _, to_email = parseaddr(to_header)
                to_email = (to_email or "").lower().strip()

                if not to_email or not thread_id:
                    continue

                contact_ref = None
                contact_doc = None

                # Try: contact with gmailThreadId == thread_id
                thread_matches = contacts_ref.where("gmailThreadId", "==", thread_id).limit(1).get()
                if thread_matches:
                    contact_doc = thread_matches[0]
                    contact_ref = contact_doc.reference
                else:
                    # Strategy 2a: contact whose email matches 'To' AND is in draft state
                    email_matches = contacts_ref.where("email", "==", to_email).limit(5).get()
                    for doc in email_matches:
                        data = doc.to_dict() or {}
                        stage = data.get("pipelineStage")
                        has_draft = (
                            data.get("gmailDraftId")
                            or data.get("gmailDraftUrl")
                        )
                        if stage == "draft_created" or has_draft:
                            contact_doc = doc
                            contact_ref = doc.reference
                            break

                    # Strategy 2b: check alternateEmails on draft_created contacts
                    if not contact_ref:
                        try:
                            draft_contacts = contacts_ref.where(
                                "pipelineStage", "==", "draft_created"
                            ).where("inOutbox", "==", True).get()
                            for doc in draft_contacts:
                                data = doc.to_dict() or {}
                                alt_emails = data.get("alternateEmails") or []
                                if to_email in [e.lower() for e in alt_emails]:
                                    contact_doc = doc
                                    contact_ref = doc.reference
                                    print(f"[gmail_webhook] Strategy 2b matched: {to_email} in alternateEmails for contact {doc.id}")
                                    break
                        except Exception as e:
                            print(f"[gmail_webhook] Strategy 2b alternateEmails scan error: {e}")

                    # Strategy 2c: match by draftToEmail field
                    if not contact_ref:
                        try:
                            draft_to_matches = contacts_ref.where(
                                "draftToEmail", "==", to_email
                            ).where("inOutbox", "==", True).limit(5).get()
                            for doc in draft_to_matches:
                                data = doc.to_dict() or {}
                                stage = data.get("pipelineStage")
                                has_draft = data.get("gmailDraftId") or data.get("gmailDraftUrl")
                                if stage == "draft_created" or has_draft:
                                    contact_doc = doc
                                    contact_ref = doc.reference
                                    print(f"[gmail_webhook] Strategy 2c matched: draftToEmail={to_email} for contact {doc.id}")
                                    break
                        except Exception as e:
                            print(f"[gmail_webhook] Strategy 2c draftToEmail scan error: {e}")

                # Strategy 3: find contacts whose draft has disappeared (was sent)
                if not contact_ref:
                    try:
                        draft_candidates = contacts_ref.where(
                            "pipelineStage", "==", "draft_created"
                        ).where("inOutbox", "==", True).get()
                        for candidate in draft_candidates:
                            cdata = candidate.to_dict() or {}
                            draft_id = cdata.get("gmailDraftId")
                            if not draft_id:
                                continue
                            try:
                                service.users().drafts().get(
                                    userId="me", id=draft_id, format="minimal"
                                ).execute()
                                # Draft still exists, skip
                            except Exception as draft_err:
                                if hasattr(draft_err, "resp") and getattr(draft_err.resp, "status", 0) == 404:
                                    # Draft is gone — it was sent
                                    contact_doc = candidate
                                    contact_ref = candidate.reference
                                    # Store the sent-to email as alternateEmail if different from stored email
                                    stored_email = (cdata.get("email") or "").lower()
                                    if to_email and to_email != stored_email:
                                        try:
                                            contact_ref.update({"alternateEmails": ArrayUnion([to_email])})
                                            print(f"[gmail_webhook] Stored alternateEmail {to_email} for contact {candidate.id}")
                                        except Exception as ae:
                                            print(f"[gmail_webhook] Failed to store alternateEmail: {ae}")
                                    print(f"[gmail_webhook] Strategy 3 matched: draft {draft_id} gone for contact {candidate.id}")
                                    break
                    except Exception as e:
                        print(f"[gmail_webhook] Strategy 3 draft scan error: {e}")

                if not contact_ref:
                    continue

                contact_data = contact_doc.to_dict() or {}
                current_stage = contact_data.get("pipelineStage")

                # Only update if currently in a draft/pre-send state
                if current_stage not in (None, "draft_created", "email_sent"):
                    continue

                update_fields = {
                    "draftStillExists": False,
                    "pipelineStage": "waiting_on_reply",
                    "inOutbox": True,
                    "lastActivityAt": now_iso,
                    "updatedAt": now_iso,
                }

                if not contact_data.get("emailSentAt"):
                    update_fields["emailSentAt"] = now_iso

                if not contact_data.get("gmailThreadId"):
                    update_fields["gmailThreadId"] = thread_id

                msg_snippet = msg_resp.get("snippet") or ""
                if msg_snippet:
                    update_fields["lastMessageSnippet"] = msg_snippet

                contact_ref.update(update_fields)
                continue

            # Find contact with this thread (reply from contact)
            try:
                query = contacts_ref.where("gmailThreadId", "==", thread_id).limit(1)
                contact_docs = list(query.stream())
            except Exception as e:
                print(f"[gmail_webhook] Contact query error: {e}")
                continue

            # Fallback: match by from_email against stored email, draftToEmail, or alternateEmails
            if not contact_docs and from_email:
                try:
                    email_matches = contacts_ref.where("email", "==", from_email).where("inOutbox", "==", True).limit(1).get()
                    if email_matches:
                        contact_docs = email_matches

                    # Try draftToEmail match
                    if not contact_docs:
                        draft_to_matches = contacts_ref.where("draftToEmail", "==", from_email).where("inOutbox", "==", True).limit(1).get()
                        if draft_to_matches:
                            contact_docs = draft_to_matches
                            print(f"[gmail_webhook] Reply matched via draftToEmail: {from_email} -> contact {draft_to_matches[0].id}")

                    if not contact_docs:
                        # Scan outbox contacts for alternateEmails match
                        outbox_contacts = contacts_ref.where("inOutbox", "==", True).get()
                        for doc in outbox_contacts:
                            data = doc.to_dict() or {}
                            alt_emails = data.get("alternateEmails") or []
                            if from_email in [e.lower() for e in alt_emails]:
                                contact_docs = [doc]
                                print(f"[gmail_webhook] Reply matched via alternateEmails: {from_email} -> contact {doc.id}")
                                break
                except Exception as e:
                    print(f"[gmail_webhook] Reply email fallback error: {e}")

            if not contact_docs:
                continue

            contact_doc = contact_docs[0]
            contact_id = contact_doc.id
            contact_data = contact_doc.to_dict() or {}
            contact_name = (contact_data.get("firstName") or "").strip()
            if contact_name:
                contact_name += " "
            contact_name += (contact_data.get("lastName") or "").strip()
            contact_name = contact_name.strip() or contact_data.get("email", "")
            company = (contact_data.get("company") or "").strip()
            message_snippet = (msg_resp.get("snippet") or "")[:100]

            contact_ref = contacts_ref.document(contact_id)
            updates = {
                "pipelineStage": "replied",
                "inOutbox": True,
                "hasUnreadReply": True,
                "lastActivityAt": now_iso,
                "lastMessageSnippet": message_snippet or (msg_resp.get("snippet") or ""),
                "threadStatus": "new_reply",
                "updatedAt": now_iso,
            }
            if not contact_data.get("replyReceivedAt"):
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

    _process_gmail_notification(email_address, history_id)

    return jsonify({"status": "ok"}), 200
