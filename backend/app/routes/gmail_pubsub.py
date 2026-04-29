"""
Gmail Pub/Sub reply-attribution layer — Phase 2 (§3.4 of the eng review).

This module is the X-Offerloop-Tracking-Id attribution path. It does NOT
add a second Pub/Sub subscription — `gmail_webhook.py` is still the
endpoint that Google posts to. Instead it exposes pure helpers that the
existing webhook calls per message, plus a small route surface for tests
and manual replays.

Outbound flow (user clicks Send in Gmail):
    1. Pub/Sub fires; webhook fetches the new message via history.list.
    2. We inspect the X-Offerloop-Tracking-Id header.
    3. If present + outboundDrafts/{trackingId} exists, mark status='sent'
       and capture sentMessageId.
    4. Log `email_sent_via_gmail` event (idempotent via sha256(uid:msgid)).

Inbound flow (a contact replies):
    1. Pub/Sub fires; webhook fetches the new message.
    2. We inspect the In-Reply-To header.
    3. Query outboundDrafts collectionGroup where sentMessageId == In-Reply-To.
    4. On match: log `reply_received` (deterministic eventId), update
       outboundDrafts.replyReceivedAt, mark status='reply_received'.
    5. On miss: log `reply_attribution_uncertain` and write to
       `unattributed_replies` collection for manual review.

All writes are idempotent — Pub/Sub redelivery → same eventId → same doc.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify, request

from app.extensions import get_db, require_firebase_auth
from app.models.events import EventType
from app.services.events_service import derive_idempotency_key, log_event

logger = logging.getLogger('gmail_pubsub')

gmail_pubsub_bp = Blueprint('gmail_pubsub', __name__, url_prefix='/api/gmail/pubsub')

TRACKING_HEADER = 'X-Offerloop-Tracking-Id'


def attribution_enabled() -> bool:
    return os.getenv('REPLY_ATTRIBUTION_ENABLED', 'false').lower() == 'true'


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _header(headers: List[Dict[str, str]], name: str) -> Optional[str]:
    """Case-insensitive header lookup."""
    if not headers:
        return None
    target = name.lower()
    for h in headers:
        if (h.get('name') or '').lower() == target:
            return h.get('value')
    return None


def _extract_message_id_header(headers: List[Dict[str, str]]) -> Optional[str]:
    """Get the canonical Message-ID header (the RFC 5322 one, not Gmail's)."""
    return _header(headers, 'Message-ID') or _header(headers, 'Message-Id')


def attribute_outbound_message(
    uid: str,
    msg_resp: Dict[str, Any],
) -> Optional[str]:
    """If the message carries our tracking header, mark its outboundDrafts
    doc as sent and log `email_sent_via_gmail`.

    Args:
        uid: Firebase user ID.
        msg_resp: Result of `users.messages.get(format='metadata',
            metadataHeaders=['Message-ID', 'X-Offerloop-Tracking-Id'])`.

    Returns:
        The tracking ID if attribution succeeded, else None.
    """
    if not attribution_enabled():
        return None
    payload = (msg_resp or {}).get('payload') or {}
    headers = payload.get('headers') or []
    tracking_id = _header(headers, TRACKING_HEADER)
    if not tracking_id:
        return None

    gmail_msg_id = msg_resp.get('id') or ''
    rfc_message_id = _extract_message_id_header(headers) or gmail_msg_id
    sent_at = _now_iso()

    db = get_db()
    ref = (
        db.collection('users')
        .document(uid)
        .collection('outboundDrafts')
        .document(tracking_id)
    )
    snap = ref.get()
    if not snap.exists:
        # Tracking ID didn't come from us, or pre-write was lost. Surface
        # to the uncertain bucket so we can monitor.
        logger.warning(
            'attribute_outbound: tracking_id=%s present on uid=%s but no outboundDrafts doc',
            tracking_id, uid,
        )
        return None

    data = snap.to_dict() or {}
    update: Dict[str, Any] = {}
    if data.get('status') != 'sent':
        update['status'] = 'sent'
    if not data.get('sentMessageId'):
        update['sentMessageId'] = rfc_message_id
        update['sentMessageGmailId'] = gmail_msg_id
    if not data.get('sentAt'):
        update['sentAt'] = sent_at
    if update:
        ref.update(update)

    log_event(
        uid=uid,
        event_type=EventType.EMAIL_SENT_VIA_GMAIL,
        payload={
            'trackingId': tracking_id,
            'sentMessageId': rfc_message_id,
            'contactId': data.get('contactId'),
            'contactEmail': data.get('contactEmail'),
            'sentAt': sent_at,
        },
        idempotency_key=derive_idempotency_key(uid, gmail_msg_id, EventType.EMAIL_SENT_VIA_GMAIL),
        source='backend',
    )
    return tracking_id


def attribute_inbound_reply(
    uid: str,
    msg_resp: Dict[str, Any],
) -> Optional[str]:
    """Try to attribute an inbound reply by matching In-Reply-To against
    outboundDrafts.sentMessageId. Returns the matched tracking ID, or None.

    Misses are logged to `users/{uid}/unattributed_replies/{messageId}`
    so we can retry / inspect later. The `reply_attribution_uncertain`
    event fires on miss; on match, `reply_received` fires.
    """
    if not attribution_enabled():
        return None
    payload = (msg_resp or {}).get('payload') or {}
    headers = payload.get('headers') or []
    in_reply_to = _header(headers, 'In-Reply-To')
    if not in_reply_to:
        return None

    inbound_gmail_id = msg_resp.get('id') or ''
    inbound_rfc_id = _extract_message_id_header(headers) or inbound_gmail_id
    snippet = (msg_resp.get('snippet') or '')[:500]
    received_at = _now_iso()

    db = get_db()
    drafts_ref = (
        db.collection('users')
        .document(uid)
        .collection('outboundDrafts')
    )
    matches = list(
        drafts_ref
        .where('sentMessageId', '==', in_reply_to.strip())
        .limit(1)
        .stream()
    )

    if not matches:
        # Miss — log to unattributed_replies and fire the uncertain event.
        try:
            unattributed_ref = (
                db.collection('users')
                .document(uid)
                .collection('unattributed_replies')
                .document(inbound_gmail_id)
            )
            unattributed_ref.set({
                'inboundMessageId': inbound_rfc_id,
                'inboundGmailId': inbound_gmail_id,
                'inReplyTo': in_reply_to,
                'snippet': snippet,
                'receivedAt': received_at,
            }, merge=True)
        except Exception as exc:  # pragma: no cover
            logger.warning('unattributed_replies write failed for uid=%s: %s', uid, exc)

        log_event(
            uid=uid,
            event_type=EventType.REPLY_ATTRIBUTION_UNCERTAIN,
            payload={
                'inboundMessageId': inbound_rfc_id,
                'inReplyTo': in_reply_to,
                'snippet': snippet,
            },
            idempotency_key=derive_idempotency_key(
                uid, inbound_gmail_id, EventType.REPLY_ATTRIBUTION_UNCERTAIN,
            ),
            source='backend',
        )
        return None

    matched = matches[0]
    matched_data = matched.to_dict() or {}
    tracking_id = matched.id

    # Update outboundDrafts doc.
    try:
        update = {
            'status': 'reply_received',
            'replyReceivedAt': received_at,
            'replyMessageId': inbound_rfc_id,
        }
        matched.reference.update(update)
    except Exception as exc:  # pragma: no cover
        logger.warning('outboundDrafts reply update failed for uid=%s tid=%s: %s',
                       uid, tracking_id, exc)

    log_event(
        uid=uid,
        event_type=EventType.REPLY_RECEIVED,
        payload={
            'trackingId': tracking_id,
            'contactId': matched_data.get('contactId'),
            'sentMessageId': matched_data.get('sentMessageId'),
            'inboundMessageId': inbound_rfc_id,
            'inReplyTo': in_reply_to,
            'receivedAt': received_at,
            'replyClass': 'other',
            'snippet': snippet,
        },
        idempotency_key=derive_idempotency_key(
            uid, inbound_gmail_id, EventType.REPLY_RECEIVED,
        ),
        source='backend',
    )
    return tracking_id


def attribute_message(uid: str, msg_resp: Dict[str, Any]) -> Optional[str]:
    """Single dispatcher — outbound if tracking header is present, else
    treat as inbound reply candidate. Used by the existing webhook."""
    payload = (msg_resp or {}).get('payload') or {}
    headers = payload.get('headers') or []
    if _header(headers, TRACKING_HEADER):
        return attribute_outbound_message(uid, msg_resp)
    if _header(headers, 'In-Reply-To'):
        return attribute_inbound_reply(uid, msg_resp)
    return None


# ============================================================================
# Test/replay route — gated to the authenticated user (no Pub/Sub here).
# ============================================================================


@gmail_pubsub_bp.post('/replay')
@require_firebase_auth
def replay_message():
    """Manually replay a message-id through the attribution pipeline.

    Useful for backfilling or for tests. Body:
        {"messageId": "<gmail message id>"}
    The route fetches the message via the user's Gmail token and runs it
    through `attribute_message`.
    """
    uid = request.firebase_user['uid']
    body = request.get_json(silent=True) or {}
    msg_id = (body.get('messageId') or '').strip()
    if not msg_id:
        return jsonify({'error': 'messageId is required'}), 400

    user_email = request.firebase_user.get('email')
    from app.services.gmail_client import get_gmail_service_for_user
    service = get_gmail_service_for_user(user_email, user_id=uid)
    if not service:
        return jsonify({'error': 'gmail service unavailable'}), 502

    try:
        msg_resp = service.users().messages().get(
            userId='me',
            id=msg_id,
            format='metadata',
            metadataHeaders=['Message-ID', 'In-Reply-To', TRACKING_HEADER, 'From', 'To', 'Subject'],
        ).execute()
    except Exception as exc:
        return jsonify({'error': f'fetch failed: {exc}'}), 502

    tracking_id = attribute_message(uid, msg_resp)
    return jsonify({
        'attributed': bool(tracking_id),
        'trackingId': tracking_id,
    }), 200
