"""
Loop notifications — per-cycle in-app notifications for the bell + sidebar.

`assess_cycle_results` scores a cycle's counters into 0 or 1 summary item.
`write_loop_run_notification` appends those items to
`users/{uid}/notifications/outbox` (the same doc the reply-bell reads).

Bumps `unreadLoopRunCount` separately from `unreadReplyCount` so the
reply-toast logic in AppHeader is unaffected by loop-run items.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ── In-app loop-run notifications ────────────────────────────────────────────
#
# These run on every successful cycle. The in-app bell + sidebar badge
# already wire up to `users/{uid}/notifications/outbox` via the
# `useNotifications` hook, so we append items there with a
# `kind: "loop_run"` discriminator instead of inventing a new doc and
# wiring a new Firestore listener. A separate `unreadLoopRunCount` counter
# keeps loop-run unreads from polluting the reply-toast badge.


def _result_to_summary_items(
    *,
    loop_id: str,
    loop_name: str,
    cycle_id: str,
    result: dict,
    now_iso: str,
) -> list[dict]:
    """Turn the cycle's result counters into one or more notification items.

    Returns at most one item per cycle today — a single "Loop ran" summary
    line. Returns [] when the cycle produced no user-visible output so we
    don't spam the bell for empty cycles.
    """
    contacts = int(result.get("contactsFound", 0) or 0)
    emails = int(result.get("emailsDrafted", 0) or 0)
    jobs = int(result.get("jobsFound", 0) or 0)
    hms = int(result.get("hmsFound", 0) or 0)
    cos = int(result.get("companiesDiscovered", 0) or 0)

    chunks: list[str] = []
    if contacts:
        chunks.append(f"{contacts} contact{'s' if contacts != 1 else ''}")
    if hms:
        chunks.append(f"{hms} hiring manager{'s' if hms != 1 else ''}")
    if jobs:
        chunks.append(f"{jobs} job{'s' if jobs != 1 else ''}")
    if cos:
        chunks.append(f"{cos} compan{'ies' if cos != 1 else 'y'}")
    if emails and (contacts or hms):
        # Emails are implied by contacts/HMs; only mention when no other
        # surface is in the summary.
        pass
    elif emails:
        chunks.append(f"{emails} email draft{'s' if emails != 1 else ''}")

    if not chunks:
        return []

    snippet = "Found " + ", ".join(chunks) + "."
    return [{
        "kind": "loop_run",
        "loopId": loop_id,
        "cycleId": cycle_id,
        # `contactId` / `contactName` / `company` exist for back-compat with
        # the existing useNotifications schema — the UI can still iterate
        # `items[]` without crashing on missing fields. Loop-run items
        # surface `loopName` instead.
        "contactId": f"loop:{loop_id}",
        "contactName": loop_name or "Untitled Loop",
        "loopName": loop_name or "Untitled Loop",
        "company": "",
        "snippet": snippet,
        "timestamp": now_iso,
        "read": False,
    }]


def assess_cycle_results(
    *,
    loop_id: str,
    loop_name: str,
    cycle_id: str,
    result: dict,
    now_iso: Optional[str] = None,
) -> list[dict]:
    """Score the cycle's results and return notification items to push.

    Today: a single summary line per successful cycle. Hooks here for
    future per-result-kind items (e.g. one item per HM with a hiring
    signal, one per high-score contact, etc.) without re-wiring callers.
    """
    when = now_iso or datetime.now(timezone.utc).isoformat()
    return _result_to_summary_items(
        loop_id=loop_id,
        loop_name=loop_name,
        cycle_id=cycle_id,
        result=result,
        now_iso=when,
    )


# Cap on retained items in the outbox doc — keeps the doc small (Firestore
# 1 MB doc limit) and matches the existing reply-notification cap.
_MAX_NOTIFICATION_ITEMS = 20


def write_loop_run_notification(
    *,
    uid: str,
    items: list[dict],
    db=None,
) -> bool:
    """Append loop-run items to `users/{uid}/notifications/outbox`.

    Bumps a NEW counter `unreadLoopRunCount` (NOT `unreadReplyCount`) so the
    reply-toast logic in AppHeader is unaffected. Returns True on a
    successful write, False on any failure — never raises.

    Empty `items` short-circuits: the caller already filtered "nothing
    happened" cycles via `assess_cycle_results`.
    """
    if not items:
        return True

    if db is None:
        from app.extensions import get_db
        db = get_db()

    try:
        ref = (
            db.collection("users")
            .document(uid)
            .collection("notifications")
            .document("outbox")
        )
        snap = ref.get()
        data = snap.to_dict() if snap.exists else {}
        existing = list(data.get("items") or [])
        merged = items + existing
        merged = merged[:_MAX_NOTIFICATION_ITEMS]
        unread_loop = max(0, int(data.get("unreadLoopRunCount", 0) or 0)) + len(items)
        ref.set(
            {
                "items": merged,
                "unreadLoopRunCount": unread_loop,
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            },
            merge=True,
        )
        return True
    except Exception:
        logger.exception(
            "write_loop_run_notification: failed uid=%s items=%d",
            uid, len(items),
        )
        return False
