"""
Auto-apply "needs your input" notifications.

When a submission lands at needs_attention, ping the user so they don't have to
sit watching the Applied tab: a bell item in users/{uid}/notifications/outbox
(the same doc the reply + loop notifications use, so the mobile badge counts it
automatically) plus a real Expo push.

Deduped by auto_apply_id: re-runs (the combobox loop, resumes) upsert the single
item instead of stacking, and the push only fires once per unresolved episode —
once the user reads it (or it resolves), a fresh needs_attention will ping again.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_MAX_NOTIFICATION_ITEMS = 20


def notify_needs_attention(uid: str, auto_apply_id: str, db=None) -> bool:
    """Upsert a needs-attention bell item + send one push. Never raises."""
    try:
        if db is None:
            from app.extensions import get_db
            db = get_db()

        job_ref = (
            db.collection("users").document(uid)
            .collection("autoApplyJobs").document(auto_apply_id)
        )
        job = job_ref.get().to_dict() or {}
        title = job.get("job_title") or "a job"
        company = job.get("company") or "the company"
        count = len(job.get("pending_questions") or [])

        ref = (
            db.collection("users").document(uid)
            .collection("notifications").document("outbox")
        )
        data = ref.get().to_dict() or {}
        items = list(data.get("items") or [])

        # Was there already an UNREAD item for this application? If so, the user
        # has already been pinged and hasn't looked yet — don't re-push.
        already_pinged = any(
            i.get("autoApplyId") == auto_apply_id and not i.get("read")
            for i in items
        )
        # Drop any prior item for this application (read or not) so we upsert.
        items = [i for i in items if i.get("autoApplyId") != auto_apply_id]

        now_iso = datetime.now(timezone.utc).isoformat()
        item = {
            "kind": "auto_apply_attention",
            "autoApplyId": auto_apply_id,
            "jobTitle": title,
            "company": company,
            "count": count,
            "timestamp": now_iso,
            "read": False,
        }
        merged = ([item] + items)[:_MAX_NOTIFICATION_ITEMS]
        ref.set({"items": merged, "updatedAt": now_iso}, merge=True)

        if not already_pinged:
            try:
                from app.services.push_service import send_push
                qword = "question" if count == 1 else "questions"
                send_push(
                    uid,
                    title="Application needs your input",
                    body=f"{company}: {count} quick {qword} to finish applying to {title}.",
                    # `url` is what the app's push-tap handler routes on — deep
                    # link straight to the in-app answer screen.
                    data={
                        "url": f"/apply-questions/{auto_apply_id}",
                        "type": "auto_apply_attention",
                        "autoApplyId": auto_apply_id,
                    },
                )
            except Exception:
                logger.exception("needs_attention push failed uid=%s aa=%s", uid, auto_apply_id)
        return True
    except Exception:
        logger.exception("notify_needs_attention failed uid=%s aa=%s", uid, auto_apply_id)
        return False
