"""
Draft-ready notifications for the mobile swipe flow.

When a swipe drafts (or sends) outreach, persist a bell item to
users/{uid}/notifications/outbox — the SAME doc the reply + loop + auto-apply
notifications use, so the mobile badge counts it and it survives an app reload
(the old client-only draft_ready vanished on the next poll). One summarizing push
per swipe batch; the mobile foreground handler suppresses its banner so it
doesn't interrupt the swipe the user just made.

Best-effort: never raises into the request path.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_MAX_NOTIFICATION_ITEMS = 20


def notify_drafts_ready(uid: str, drafts: list[dict], db=None) -> bool:
    """drafts: [{contactId, contactName, company, sent: bool}]. Writes a
    draft_ready bell item per draft and sends one summarizing push."""
    if not drafts:
        return False
    try:
        if db is None:
            from app.extensions import get_db
            db = get_db()

        ref = (
            db.collection("users").document(uid)
            .collection("notifications").document("outbox")
        )
        data = ref.get().to_dict() or {}
        existing = list(data.get("items") or [])

        now_iso = datetime.now(timezone.utc).isoformat()
        new_items = []
        for d in drafts:
            new_items.append({
                "kind": "draft_ready",
                "contactId": d.get("contactId") or "",
                "contactName": d.get("contactName") or "a contact",
                "company": d.get("company") or "",
                "sent": bool(d.get("sent")),
                "timestamp": now_iso,
                "read": False,
            })
        merged = (new_items + existing)[:_MAX_NOTIFICATION_ITEMS]
        ref.set({"items": merged, "updatedAt": now_iso}, merge=True)

        _send_summary_push(uid, new_items)
        return True
    except Exception:
        logger.exception("notify_drafts_ready failed uid=%s", uid)
        return False


def _send_summary_push(uid: str, items: list[dict]) -> None:
    """One push for the whole swipe batch (not N), deep-linking to the single
    conversation when there's one, else the Inbox."""
    try:
        from app.services.push_service import send_push
        n = len(items)
        any_sent = any(i["sent"] for i in items)
        if n == 1:
            it = items[0]
            who, company, sent = it["contactName"], it["company"], it["sent"]
            title = f"Sent to {who}" if sent else f"Draft ready for {who}"
            body = (
                f"Your message to {who} at {company} is on its way."
                if sent
                else f"Your outreach to {who} at {company} is ready to review and send."
            )
            url = f"/outreach/{it['contactId']}" if it["contactId"] else "/inbox"
        else:
            title = f"{n} messages sent" if any_sent else f"{n} drafts ready"
            body = "Tap to review them in your Inbox."
            url = "/inbox"
        send_push(uid, title=title, body=body, data={"url": url, "type": "draft_ready"})
    except Exception:
        logger.exception("draft_ready push failed uid=%s", uid)
