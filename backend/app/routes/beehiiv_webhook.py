"""
Beehiiv webhook — inbound sync for newsletter unsubscribes.

Beehiiv fires `subscription.deleted` / `subscription.unsubscribed` events
when a reader unsubscribes via the Beehiiv-hosted footer link. We mirror
that back into Firestore so lifecycle_emails.py stops trying to email them
and the preferences center reflects the true state.

Auth: shared-secret header `X-Beehiiv-Signature` matched against
`BEEHIIV_WEBHOOK_SECRET` — constant-time compare. Beehiiv also supports
HMAC signature verification which we can layer on later if needed.
"""
from __future__ import annotations

import hmac
import logging
from flask import Blueprint, jsonify, request

from app import config
from app.extensions import get_db
from app.services.lifecycle_emails import record_unsubscribe
from app.services.lifecycle_signals import set_newsletter_subscribed

logger = logging.getLogger(__name__)

beehiiv_webhook_bp = Blueprint('beehiiv_webhook', __name__, url_prefix='/api/beehiiv')


def _authorized() -> bool:
    expected = (config.BEEHIIV_WEBHOOK_SECRET or '').encode('utf-8')
    provided = (request.headers.get('X-Beehiiv-Signature') or '').encode('utf-8')
    if not expected or not provided:
        return False
    return hmac.compare_digest(expected, provided)


@beehiiv_webhook_bp.route('/webhook', methods=['POST'])
def beehiiv_webhook():
    if not _authorized():
        return jsonify({'error': 'unauthorized'}), 401

    payload = request.get_json(silent=True) or {}
    event_type = payload.get('type') or payload.get('event')
    data = payload.get('data') or {}
    email = (data.get('email') or '').strip().lower()

    if not email or '@' not in email:
        return jsonify({'ok': True, 'reason': 'no_email'}), 200

    if event_type in {'subscription.unsubscribed', 'subscription.deleted'}:
        # Mirror the opt-out both ways:
        #   1) lifecycle_unsubscribes so the Resend sender skips them too
        #   2) users/{uid}.newsletterSubscribed = False so UI + scanner agree
        try:
            record_unsubscribe(email)
        except Exception as e:
            logger.warning("beehiiv webhook lifecycle_unsubscribes write failed: %s", e)

        try:
            db = get_db()
            if db:
                for snap in db.collection('users').where('email', '==', email).limit(1).stream():
                    set_newsletter_subscribed(snap.id, False)
                    break
        except Exception as e:
            logger.warning("beehiiv webhook user mirror failed: %s", e)

    return jsonify({'ok': True}), 200
