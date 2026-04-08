"""
A0: Email baseline measurement.

Aggregates reply data across all users with Gmail integration to establish
a baseline reply rate before/after email personalization changes.

Stores results in Firestore at analytics/email_baseline.
"""
import logging
from datetime import datetime, timezone

from app.extensions import get_db
from app.services.outbox_service import REPLIED_STAGES, _parse_iso

logger = logging.getLogger(__name__)

# Stages where the user sent an email and could receive a reply
ELIGIBLE_STAGES = frozenset({
    "email_sent", "waiting_on_reply", "replied",
    "meeting_scheduled", "connected", "no_response",
})


def compute_email_baseline():
    """
    Iterate all users with Gmail integration, aggregate contact-level
    email metrics, and store the baseline in Firestore.

    Returns the baseline dict that was written.
    """
    db = get_db()
    now = datetime.now(timezone.utc)

    # Per-user accumulators
    users_sampled = 0
    users_with_emails = 0

    # Global accumulators
    total_contacts_emailed = 0
    total_replied = 0
    total_eligible = 0
    all_response_hours = []
    total_meetings = 0
    total_replied_denom = 0  # replied + meeting_scheduled + connected

    # Per-tier breakdown
    tier_stats = {}

    for user_doc in db.collection("users").stream():
        uid = user_doc.id
        user_data = user_doc.to_dict() or {}

        # Only include users with Gmail connected (reply tracking requires it)
        gmail_ref = (
            db.collection("users").document(uid)
            .collection("integrations").document("gmail")
        )
        gmail_doc = gmail_ref.get()
        if not gmail_doc.exists:
            continue
        gmail_data = gmail_doc.to_dict() or {}
        if not (gmail_data.get("token") or gmail_data.get("refresh_token")):
            continue

        users_sampled += 1
        tier = user_data.get("subscriptionTier", user_data.get("tier", "free"))

        # Query ALL contacts for this user that have emailSentAt
        contacts_ref = db.collection("users").document(uid).collection("contacts")
        contacts = list(contacts_ref.stream())

        user_eligible = 0
        user_replied = 0
        user_meetings = 0
        user_replied_denom = 0

        for doc in contacts:
            data = doc.to_dict() or {}
            stage = data.get("pipelineStage") or ""
            sent_at = _parse_iso(data.get("emailSentAt"))

            # Only count contacts where an email was actually sent
            if not sent_at:
                continue

            total_contacts_emailed += 1

            if stage in ELIGIBLE_STAGES:
                total_eligible += 1
                user_eligible += 1

            if stage in REPLIED_STAGES:
                total_replied += 1
                user_replied += 1

            # Meeting rate denominator: contacts that reached reply-level stages
            if stage in REPLIED_STAGES:
                total_replied_denom += 1
                user_replied_denom += 1
                if stage in ("meeting_scheduled", "connected"):
                    total_meetings += 1
                    user_meetings += 1

            # Response time
            if stage in REPLIED_STAGES:
                reply_at = _parse_iso(
                    data.get("replyReceivedAt") or data.get("lastActivityAt")
                )
                if reply_at and reply_at >= sent_at:
                    delta_hours = (reply_at - sent_at).total_seconds() / 3600.0
                    all_response_hours.append(delta_hours)

        if user_eligible > 0:
            users_with_emails += 1

        # Accumulate per-tier
        if tier not in tier_stats:
            tier_stats[tier] = {
                "users": 0,
                "eligible": 0,
                "replied": 0,
                "meetings": 0,
            }
        tier_stats[tier]["users"] += 1
        tier_stats[tier]["eligible"] += user_eligible
        tier_stats[tier]["replied"] += user_replied
        tier_stats[tier]["meetings"] += user_meetings

    # Compute aggregate rates
    reply_rate = (total_replied / total_eligible) if total_eligible else 0.0
    avg_response_hours = (
        round(sum(all_response_hours) / len(all_response_hours), 1)
        if all_response_hours
        else None
    )
    meeting_rate = (
        (total_meetings / total_replied_denom) if total_replied_denom else 0.0
    )

    # Per-tier rates
    tier_breakdown = {}
    for tier, stats in tier_stats.items():
        tier_breakdown[tier] = {
            "users": stats["users"],
            "contactsEligible": stats["eligible"],
            "contactsReplied": stats["replied"],
            "replyRate": round(
                stats["replied"] / stats["eligible"], 4
            ) if stats["eligible"] else 0.0,
            "meetings": stats["meetings"],
        }

    baseline = {
        "measuredAt": now.isoformat().replace("+00:00", "Z"),
        "sampleSize": {
            "usersWithGmail": users_sampled,
            "usersWithEmails": users_with_emails,
            "totalContactsEmailed": total_contacts_emailed,
            "totalEligible": total_eligible,
        },
        "metrics": {
            "replyRate": round(reply_rate, 4),
            "avgResponseTimeHours": avg_response_hours,
            "meetingRate": round(meeting_rate, 4),
            "totalReplied": total_replied,
            "responseTimeSampleSize": len(all_response_hours),
        },
        "tierBreakdown": tier_breakdown,
        "bias": (
            "Only users with Gmail connected have reply tracking. "
            "This biases toward more engaged users."
        ),
    }

    # Write to Firestore
    db.collection("analytics").document("email_baseline").set(baseline)
    logger.info(
        "Email baseline stored: %d users, %d eligible, %.2f%% reply rate",
        users_sampled,
        total_eligible,
        reply_rate * 100,
    )

    return baseline
