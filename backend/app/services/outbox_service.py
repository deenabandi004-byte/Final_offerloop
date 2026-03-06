"""
Outbox / Network Tracker service layer.

All business logic for the outbox feature lives here.
Routes call these functions; they should never touch Gmail or Firestore directly.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.extensions import get_db
from app.services.gmail_client import (
    _load_user_gmail_creds,
    _gmail_service,
    sync_thread_message,
)

logger = logging.getLogger(__name__)

# Canonical pipeline stages
ALLOWED_PIPELINE_STAGES = frozenset({
    "new", "draft_created", "draft_deleted", "email_sent", "waiting_on_reply", "replied",
    "meeting_scheduled", "connected", "no_response", "bounced", "closed",
})

DONE_STAGES = frozenset({
    "connected", "meeting_scheduled", "no_response", "bounced", "closed",
})

VALID_RESOLUTIONS = frozenset({
    "meeting_booked", "soft_no", "hard_no", "ghosted", "completed",
})

# How long before a sync is considered stale (seconds)
SYNC_LOCK_SECONDS = 60


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_iso(s):
    """Parse ISO date string to naive UTC datetime. Returns None on failure."""
    if not s:
        return None
    try:
        s = s.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None


def _now_iso():
    return datetime.utcnow().isoformat() + "Z"


def _get_contact_ref(uid, contact_id):
    db = get_db()
    return db.collection("users").document(uid).collection("contacts").document(contact_id)


def _get_contact(uid, contact_id):
    """Fetch a contact doc. Returns (ref, data) or raises ValueError."""
    ref = _get_contact_ref(uid, contact_id)
    doc = ref.get()
    if not doc.exists:
        raise ValueError("contact_not_found")
    return ref, doc.to_dict() or {}


def _contact_to_dict(contact_id, data):
    """Convert raw Firestore contact data to the API response shape."""
    first = (data.get("firstName") or "").strip()
    last = (data.get("lastName") or "").strip()
    name = f"{first} {last}".strip() or data.get("name") or data.get("email", "")

    gmail_draft_id = data.get("gmailDraftId")
    gmail_draft_url = data.get("gmailDraftUrl")
    gmail_message_id = data.get("gmailMessageId")

    # Build draft URL if missing
    if gmail_draft_id and not gmail_draft_url:
        if gmail_message_id:
            gmail_draft_url = f"https://mail.google.com/mail/u/0/#drafts?compose={gmail_message_id}"
        else:
            gmail_draft_url = f"https://mail.google.com/mail/u/0/#draft/{gmail_draft_id}"
    if gmail_draft_url and "#drafts/" in gmail_draft_url and gmail_message_id:
        gmail_draft_url = f"https://mail.google.com/mail/u/0/#drafts?compose={gmail_message_id}"
    elif gmail_draft_url and "#drafts/" in gmail_draft_url:
        gmail_draft_url = gmail_draft_url.replace("#drafts/", "#draft/")

    # Snippet fallback
    snippet = data.get("lastMessageSnippet")
    if not snippet:
        stage = data.get("pipelineStage")
        if stage == "new":
            snippet = "Ready to draft an email"
        elif not data.get("gmailThreadId"):
            snippet = data.get("emailBody") or "Draft is ready to send in Gmail"
        else:
            snippet = ""

    return {
        "id": contact_id,
        # Identity
        "name": name,
        "email": data.get("draftToEmail") or data.get("email") or "",
        "company": data.get("company") or "",
        "title": data.get("jobTitle") or "",
        "linkedinUrl": ("https://" + data.get("linkedinUrl") if data.get("linkedinUrl") and not data.get("linkedinUrl", "").startswith("http") else data.get("linkedinUrl")),
        # Outbox state
        "pipelineStage": data.get("pipelineStage"),
        "inOutbox": bool(data.get("inOutbox")),
        "hasUnreadReply": bool(data.get("hasUnreadReply")),
        # Gmail
        "gmailThreadId": data.get("gmailThreadId"),
        "gmailDraftId": gmail_draft_id,
        "gmailDraftUrl": gmail_draft_url,
        "emailSubject": data.get("emailSubject"),
        "draftToEmail": data.get("draftToEmail"),
        "lastMessageSnippet": snippet,
        "lastMessageFrom": data.get("lastMessageFrom"),
        # Timestamps
        "emailSentAt": data.get("emailSentAt"),
        "draftCreatedAt": data.get("draftCreatedAt"),
        "replyReceivedAt": data.get("replyReceivedAt"),
        "lastActivityAt": data.get("lastActivityAt") or data.get("draftCreatedAt") or data.get("createdAt") or "",
        # Follow-up
        "followUpCount": data.get("followUpCount", 0),
        "nextFollowUpAt": data.get("nextFollowUpAt"),
        "messageCount": data.get("messageCount", 0),
        # Resolution
        "resolution": data.get("resolution"),
        "resolutionDetails": data.get("resolutionDetails"),
        "conversationSummary": data.get("conversationSummary"),
        # Archive/snooze
        "archivedAt": data.get("archivedAt"),
        "snoozedUntil": data.get("snoozedUntil"),
        "updatedAt": data.get("updatedAt") or "",
        # Sync metadata (kept for frontend sync-error display)
        "lastSyncError": data.get("lastSyncError"),
        "lastSyncAt": data.get("lastSyncAt"),
        # Legacy aliases for frontend compatibility (remove after Outbox.tsx migration)
        "contactName": name,
        "jobTitle": data.get("jobTitle") or "",
        "hasDraft": bool(data.get("gmailDraftId")),
        "status": data.get("pipelineStage") or "",
    }


# ---------------------------------------------------------------------------
# Core queries
# ---------------------------------------------------------------------------

def get_outbox_contacts(uid, include_archived=False):
    """
    Query outbox contacts using the inOutbox index.
    Returns list of dicts ready for API response.
    """
    db = get_db()
    contacts_ref = db.collection("users").document(uid).collection("contacts")

    query = contacts_ref.where("inOutbox", "==", True)
    docs = list(query.stream())

    results = []
    for doc in docs:
        data = doc.to_dict() or {}
        if not include_archived and data.get("archivedAt"):
            continue
        results.append(_contact_to_dict(doc.id, data))

    return results


def get_outbox_stats(uid):
    """
    Compute outbox statistics from indexed query.
    Returns dict with stage counts, rates, and bucket counts.
    """
    contacts = get_outbox_contacts(uid, include_archived=False)
    now_utc = datetime.utcnow()
    three_days_ago = now_utc - timedelta(days=3)
    seven_days_ago = now_utc - timedelta(days=7)

    by_stage = {}
    for stage in ALLOWED_PIPELINE_STAGES:
        by_stage[stage] = 0

    total = 0
    replied_count = 0
    eligible_for_reply_rate = 0
    response_hours = []
    needs_attention = 0
    waiting = 0
    done = 0
    this_week_sent = 0
    this_week_replied = 0

    for c in contacts:
        total += 1
        stage = c.get("pipelineStage") or ""

        if stage in ALLOWED_PIPELINE_STAGES:
            by_stage[stage] = by_stage.get(stage, 0) + 1

        # Bucket: done
        is_done = stage in DONE_STAGES or c.get("archivedAt")
        if is_done:
            done += 1
            # Still count for rates below
        else:
            # Bucket: needs_attention
            is_needs_attention = False
            # Snoozed contacts are suppressed from needs-attention
            snoozed_until = _parse_iso(c.get("snoozedUntil"))
            is_snoozed = snoozed_until and snoozed_until > now_utc
            if is_snoozed:
                pass  # skip needs-attention checks
            elif c.get("hasUnreadReply"):
                is_needs_attention = True
            elif stage == "draft_created":
                created_dt = _parse_iso(c.get("draftCreatedAt"))
                if created_dt and created_dt < three_days_ago:
                    is_needs_attention = True
            if not is_snoozed:
                next_fu = _parse_iso(c.get("nextFollowUpAt"))
                if next_fu and next_fu <= now_utc:
                    is_needs_attention = True

            if is_needs_attention:
                needs_attention += 1
            elif stage in ("email_sent", "waiting_on_reply"):
                waiting += 1
            else:
                # Remaining active contacts (e.g. "new", "replied" without unread, "draft_created" < 3 days)
                waiting += 1

        # Reply rate
        if stage == "replied":
            replied_count += 1
        if stage in ("email_sent", "waiting_on_reply", "replied", "no_response"):
            eligible_for_reply_rate += 1

        # This-week metrics
        sent_dt = _parse_iso(c.get("emailSentAt"))
        if sent_dt and sent_dt >= seven_days_ago:
            this_week_sent += 1

        if stage in ("replied", "meeting_scheduled", "connected"):
            activity_dt = _parse_iso(c.get("lastActivityAt"))
            if activity_dt and activity_dt >= seven_days_ago:
                this_week_replied += 1

        # Avg response time
        if stage in ("replied", "meeting_scheduled", "connected"):
            reply_at = _parse_iso(c.get("replyReceivedAt") or c.get("lastActivityAt"))
            if sent_dt and reply_at and reply_at >= sent_dt:
                delta_hours = (reply_at - sent_dt).total_seconds() / 3600.0
                response_hours.append(delta_hours)

    reply_rate = (replied_count / eligible_for_reply_rate) if eligible_for_reply_rate else 0.0
    avg_response_time_hours = round(sum(response_hours) / len(response_hours), 1) if response_hours else None
    meeting_denom = by_stage.get("replied", 0) + by_stage.get("meeting_scheduled", 0) + by_stage.get("connected", 0)
    meeting_rate = (by_stage.get("meeting_scheduled", 0) / meeting_denom) if meeting_denom else 0.0

    return {
        "total": total,
        "byStage": by_stage,
        "replyRate": round(reply_rate, 4),
        "avgResponseTimeHours": avg_response_time_hours,
        "meetingRate": round(meeting_rate, 4),
        "needsAttentionCount": needs_attention,
        "waitingCount": waiting,
        "doneCount": done,
        "thisWeekSent": this_week_sent,
        "thisWeekReplied": this_week_replied,
    }


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------

def update_contact_stage(uid, contact_id, new_stage):
    """Update pipelineStage and related timestamps."""
    if new_stage not in ALLOWED_PIPELINE_STAGES:
        raise ValueError(f"Invalid stage: {new_stage}. Must be one of: {', '.join(sorted(ALLOWED_PIPELINE_STAGES))}")

    ref, data = _get_contact(uid, contact_id)
    updates = {
        "pipelineStage": new_stage,
        "updatedAt": _now_iso(),
    }
    if new_stage == "meeting_scheduled" and not data.get("meetingScheduledAt"):
        updates["meetingScheduledAt"] = _now_iso()
    if new_stage == "connected" and not data.get("connectedAt"):
        updates["connectedAt"] = _now_iso()

    ref.update(updates)
    data.update(updates)
    return _contact_to_dict(contact_id, data)


def clear_unread_reply(uid, contact_id):
    """Mark a contact's reply as read by clearing hasUnreadReply."""
    ref, data = _get_contact(uid, contact_id)
    updates = {
        "hasUnreadReply": False,
        "updatedAt": _now_iso(),
    }
    ref.update(updates)
    data.update(updates)
    return _contact_to_dict(contact_id, data)


def archive_contact(uid, contact_id):
    """Archive a contact."""
    ref, data = _get_contact(uid, contact_id)
    updates = {
        "archivedAt": _now_iso(),
        "updatedAt": _now_iso(),
    }
    ref.update(updates)
    data.update(updates)
    return _contact_to_dict(contact_id, data)


def unarchive_contact(uid, contact_id):
    """Restore a contact from archive. Resets terminal stages to waiting_on_reply."""
    ref, data = _get_contact(uid, contact_id)
    updates = {
        "archivedAt": None,
        "updatedAt": _now_iso(),
    }
    # If the contact is in a terminal stage, restore to an active one
    if data.get("pipelineStage") in DONE_STAGES:
        updates["pipelineStage"] = "waiting_on_reply"
    ref.update(updates)
    data.update(updates)
    return _contact_to_dict(contact_id, data)


def snooze_contact(uid, contact_id, snooze_until):
    """Snooze follow-ups until a specific date."""
    ref, data = _get_contact(uid, contact_id)
    updates = {
        "snoozedUntil": snooze_until,
        "updatedAt": _now_iso(),
    }
    ref.update(updates)
    data.update(updates)
    return _contact_to_dict(contact_id, data)


def mark_contact_won(uid, contact_id, resolution_details=None):
    """Mark a contact as won (meeting booked)."""
    ref, data = _get_contact(uid, contact_id)
    now = _now_iso()
    updates = {
        "pipelineStage": "meeting_scheduled",
        "resolution": "meeting_booked",
        "updatedAt": now,
    }
    if resolution_details:
        updates["resolutionDetails"] = resolution_details
    if not data.get("meetingScheduledAt"):
        updates["meetingScheduledAt"] = now
    ref.update(updates)
    data.update(updates)
    return _contact_to_dict(contact_id, data)


def mark_contact_resolution(uid, contact_id, resolution, details=None):
    """Set a resolution on a contact."""
    if resolution not in VALID_RESOLUTIONS:
        raise ValueError(f"Invalid resolution: {resolution}. Must be one of: {', '.join(sorted(VALID_RESOLUTIONS))}")

    ref, data = _get_contact(uid, contact_id)
    now = _now_iso()
    updates = {
        "resolution": resolution,
        "updatedAt": now,
    }
    if details:
        updates["resolutionDetails"] = details

    # Map resolution to appropriate pipelineStage
    if resolution == "meeting_booked":
        updates["pipelineStage"] = "meeting_scheduled"
        if not data.get("meetingScheduledAt"):
            updates["meetingScheduledAt"] = now
    elif resolution in ("hard_no", "ghosted"):
        updates["pipelineStage"] = "closed"
        updates["archivedAt"] = now
    elif resolution == "soft_no":
        updates["pipelineStage"] = "no_response"
    elif resolution == "completed":
        updates["pipelineStage"] = "connected"
        if not data.get("connectedAt"):
            updates["connectedAt"] = now

    ref.update(updates)
    data.update(updates)
    return _contact_to_dict(contact_id, data)


# ---------------------------------------------------------------------------
# Gmail sync
# ---------------------------------------------------------------------------

def _is_gmail_auth_error(e):
    """True if the exception indicates Gmail token expired/revoked."""
    msg = (str(e) or "").lower()
    return any(s in msg for s in (
        "invalid_grant", "token has been expired", "token expired",
        "revoked", "credentials", "gmail refresh token invalid",
    ))


def _capture_sentry(e):
    try:
        import sentry_sdk
        sentry_sdk.capture_exception(e)
    except ImportError:
        pass


def _check_draft_status(gmail_service, data):
    """
    Check if a Gmail draft still exists.
    Returns dict of Firestore updates, or empty dict.
    """
    draft_id = data.get("gmailDraftId")
    if not draft_id:
        return {}

    try:
        gmail_service.users().drafts().get(
            userId="me", id=draft_id, format="minimal"
        ).execute()
        return {"draftStillExists": True}
    except Exception as e:
        # Only treat 404 as "draft gone"; other errors are transient
        is_not_found = False
        if hasattr(e, "resp"):
            is_not_found = getattr(e.resp, "status", 0) == 404
        elif "404" in str(e) or "not found" in str(e).lower():
            is_not_found = True

        if not is_not_found:
            logger.warning("Transient error checking draft %s: %s", draft_id, e)
            _capture_sentry(e)
            return {
                "lastSyncError": {
                    "code": "gmail_error",
                    "message": "Could not check draft status",
                    "at": _now_iso(),
                },
            }

        # Draft is gone - was either sent or deleted
        updates = {"draftStillExists": False}
        if data.get("gmailThreadId"):
            updates["pipelineStage"] = "waiting_on_reply"
            if not data.get("emailSentAt"):
                updates["emailSentAt"] = _now_iso()
        else:
            # Draft gone without threadId - search Gmail for the sent message
            found_sent = False
            contact_email = data.get("draftToEmail") or data.get("email")
            email_subject = data.get("emailSubject")
            if contact_email and email_subject:
                try:
                    query = f'to:{contact_email} subject:"{email_subject[:50]}"'
                    results = gmail_service.users().messages().list(
                        userId="me", q=query, maxResults=1
                    ).execute()
                    messages = results.get("messages", [])
                    if messages:
                        msg = gmail_service.users().messages().get(
                            userId="me", id=messages[0]["id"], format="minimal"
                        ).execute()
                        thread_id = msg.get("threadId")
                        if thread_id:
                            updates["gmailThreadId"] = thread_id
                            updates["pipelineStage"] = "waiting_on_reply"
                            if not data.get("emailSentAt"):
                                updates["emailSentAt"] = _now_iso()
                            found_sent = True
                except Exception as e:
                    logger.warning("Could not find threadId for sent draft: %s", e)
                    _capture_sentry(e)
            # No sent message found — draft was deleted, not sent
            if not found_sent:
                updates["pipelineStage"] = "draft_deleted"
        return updates


def _sync_thread_messages(gmail_service, data, user_email):
    """
    Sync latest message from a Gmail thread.
    Returns dict of Firestore updates, or empty dict.
    """
    gmail_thread_id = data.get("gmailThreadId")
    if not gmail_thread_id:
        return {}

    # Only sync if draft no longer exists (email was sent)
    if data.get("draftStillExists") is not False and data.get("gmailDraftId"):
        return {}

    contact_email = data.get("draftToEmail") or data.get("email")
    try:
        sync_result = sync_thread_message(
            gmail_service, gmail_thread_id, contact_email, user_email
        )
    except Exception as e:
        logger.warning("Could not sync thread %s: %s", gmail_thread_id, e)
        _capture_sentry(e)
        return {
            "lastSyncAt": _now_iso(),
            "lastSyncError": {
                "code": "gmail_error",
                "message": "Could not sync with Gmail",
                "at": _now_iso(),
            },
        }

    updates = {
        "lastMessageSnippet": sync_result.get("snippet", ""),
        "lastActivityAt": sync_result.get("lastActivityAt"),
        "lastSyncAt": _now_iso(),
        "lastSyncError": None,
    }
    if "hasUnreadReply" in sync_result:
        updates["hasUnreadReply"] = sync_result["hasUnreadReply"]
    if "status" in sync_result:
        updates["threadStatus"] = sync_result["status"]

    sync_status = sync_result.get("status")
    if sync_status in ("new_reply", "waiting_on_you") or sync_result.get("hasUnreadReply"):
        updates["pipelineStage"] = "replied"
        updates["lastMessageFrom"] = "contact"
        if not data.get("replyReceivedAt"):
            updates["replyReceivedAt"] = _now_iso()
    elif sync_status == "waiting_on_them":
        updates["lastMessageFrom"] = "user"

    return updates


def sync_contact_thread(uid, contact_id):
    """
    Full Gmail sync for one contact: check draft status, sync thread messages.
    Uses Firestore-based sync lock (60s).
    Returns updated contact dict.
    """
    ref, data = _get_contact(uid, contact_id)

    # Sync lock: skip if synced within last 60 seconds
    last_sync = data.get("lastSyncAt")
    if last_sync:
        last_sync_dt = _parse_iso(last_sync)
        if last_sync_dt:
            elapsed = (datetime.utcnow() - last_sync_dt).total_seconds()
            if elapsed < SYNC_LOCK_SECONDS:
                return _contact_to_dict(contact_id, data)

    # Get Gmail service
    try:
        creds = _load_user_gmail_creds(uid)
        if not creds:
            ref.update({
                "lastSyncError": {"code": "gmail_disconnected", "message": "Please reconnect Gmail", "at": _now_iso()},
                "updatedAt": _now_iso(),
            })
            data["lastSyncError"] = {"code": "gmail_disconnected", "message": "Please reconnect Gmail", "at": _now_iso()}
            return _contact_to_dict(contact_id, data)
        gmail_service = _gmail_service(creds)
    except Exception as e:
        error_code = "gmail_disconnected" if _is_gmail_auth_error(e) else "gmail_error"
        error_msg = "Please reconnect Gmail" if _is_gmail_auth_error(e) else "Could not sync with Gmail"
        _capture_sentry(e)
        ref.update({
            "lastSyncError": {"code": error_code, "message": error_msg, "at": _now_iso()},
            "updatedAt": _now_iso(),
        })
        data["lastSyncError"] = {"code": error_code, "message": error_msg, "at": _now_iso()}
        return _contact_to_dict(contact_id, data)

    # Collect all updates, write once at the end
    all_updates = {}

    # 1. Check draft status
    if data.get("gmailDraftId"):
        draft_updates = _check_draft_status(gmail_service, data)
        all_updates.update(draft_updates)
        # Merge into data so _sync_thread_messages sees current state
        data.update(draft_updates)

    # 2. Sync thread messages
    user_email = None
    try:
        user_doc = get_db().collection("users").document(uid).get()
        if user_doc.exists:
            user_email = (user_doc.to_dict() or {}).get("email")
    except Exception:
        pass

    thread_updates = _sync_thread_messages(gmail_service, data, user_email)
    all_updates.update(thread_updates)

    # Write all updates in one batch
    if all_updates:
        all_updates["updatedAt"] = _now_iso()
        if "lastSyncError" not in all_updates:
            all_updates["lastSyncError"] = None
        ref.update(all_updates)
        data.update(all_updates)

    return _contact_to_dict(contact_id, data)
