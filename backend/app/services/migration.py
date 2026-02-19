"""
One-off migration utilities for contact schema and pipeline stages.
"""
from datetime import datetime

from app.extensions import get_db


# Pipeline stage enum values (canonical)
PIPELINE_STAGES = (
    "draft_created",
    "email_sent",
    "waiting_on_reply",
    "replied",
    "meeting_scheduled",
    "connected",
    "no_response",
    "bounced",
    "closed",
)


def backfill_pipeline_stages(uid: str) -> dict:
    """
    Backfill pipelineStage and emailSentAt for all contacts of a user.
    Used for migration from threadStatus / draftStillExists to canonical pipelineStage.

    Rules:
    - hasUnreadReply == True → pipelineStage = "replied"
    - gmailThreadId and draftStillExists == False → pipelineStage = "waiting_on_reply",
      and set emailSentAt from draftCreatedAt or lastActivityAt if missing
    - gmailDraftId and draftStillExists != False → pipelineStage = "draft_created"
    - No draft/thread IDs → pipelineStage = null (not in pipeline)

    Returns dict with: updated_count, skipped_count, errors (list of str).
    """
    db = get_db()
    if not db:
        return {"updated_count": 0, "skipped_count": 0, "errors": ["Database not initialized"]}

    contacts_ref = db.collection("users").document(uid).collection("contacts")
    docs = list(contacts_ref.stream())
    updated_count = 0
    skipped_count = 0
    errors = []

    for doc in docs:
        try:
            data = doc.to_dict() or {}
            doc_id = doc.id

            has_thread = bool(data.get("gmailThreadId") or data.get("gmail_thread_id"))
            has_draft = bool(
                data.get("gmailDraftId")
                or data.get("gmail_draft_id")
                or data.get("gmailDraftUrl")
                or data.get("gmail_draft_url")
            )
            draft_still_exists = data.get("draftStillExists", True)
            has_unread_reply = bool(data.get("hasUnreadReply") or data.get("has_unread_reply"))

            # Determine pipelineStage and optional emailSentAt
            new_stage = None
            email_sent_at = None

            if has_unread_reply:
                new_stage = "replied"
            elif has_thread and draft_still_exists is False:
                new_stage = "waiting_on_reply"
                if not data.get("emailSentAt") and not data.get("email_sent_at"):
                    # Estimate from draftCreatedAt or lastActivityAt
                    for key in ("draftCreatedAt", "draft_created_at", "lastActivityAt", "last_activity_at"):
                        val = data.get(key)
                        if val:
                            if isinstance(val, datetime):
                                email_sent_at = val.isoformat()
                            else:
                                email_sent_at = val
                            break
                    if not email_sent_at:
                        email_sent_at = datetime.utcnow().isoformat()
            elif has_draft and draft_still_exists is not False:
                new_stage = "draft_created"
            # else: no draft/thread → leave pipelineStage null

            updates = {}
            if new_stage is not None:
                updates["pipelineStage"] = new_stage
            if email_sent_at is not None:
                updates["emailSentAt"] = email_sent_at
            if updates:
                updates["updatedAt"] = datetime.utcnow().isoformat()
                doc.reference.update(updates)
                updated_count += 1
            else:
                skipped_count += 1
        except Exception as e:
            errors.append(f"{doc.id}: {e}")

    return {
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "total": len(docs),
        "errors": errors,
    }
