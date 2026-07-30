"""
POST /api/revenuecat/webhook — Apple in-app purchases, via RevenueCat.

Apple takes the money for in-app purchases, so Stripe never fires. RevenueCat
calls this route instead, and this route is the ONLY thing that grants credits
for a mobile purchase — the client never writes a balance (spec §2 rule 2).

Shape mirrors the Stripe path: verify the sender, work out what happened, write
it down idempotently. The deciding is all in `services/revenuecat_service.py`
so it can be unit-tested without Firestore; this file is transport + storage.

Status codes matter more than usual here, because RevenueCat retries up to 5
times on anything that isn't 2xx:
  200  handled, or deliberately ignored (test events, wrong environment)
  400  malformed body — retrying will never help
  401  bad or missing secret
  500  we broke — please DO retry
"""
import logging
import re

from flask import Blueprint, jsonify, request

from app.config import REVENUECAT_EXPECT_PRODUCTION, REVENUECAT_WEBHOOK_SECRET
from app.services.revenuecat_service import apply_decision, classify_event, verify_webhook_secret

logger = logging.getLogger(__name__)

revenuecat_bp = Blueprint('revenuecat', __name__, url_prefix='/api/revenuecat')

# Firestore document ids can't contain '/'. Transaction ids are alphanumeric in
# practice, but the id comes from outside so it gets scrubbed before use.
_UNSAFE_DOC_ID = re.compile(r'[^A-Za-z0-9_.:-]')


@revenuecat_bp.post('/webhook')
def revenuecat_webhook():
    # 1. Authenticate. Constant-time, and fail-closed when unconfigured.
    if not verify_webhook_secret(request.headers.get('Authorization'),
                                 REVENUECAT_WEBHOOK_SECRET):
        logger.warning('RevenueCat webhook rejected: bad or missing secret')
        return jsonify({'error': 'unauthorized'}), 401

    # 2. Parse. A permanently broken payload must not be retried 5 times.
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get('event'), dict):
        return jsonify({'error': 'malformed_payload'}), 400

    event = payload['event']
    decision = classify_event(event, expect_production=REVENUECAT_EXPECT_PRODUCTION)

    logger.info('RevenueCat %s → %s (%s) uid=%s product=%s',
                event.get('type'), decision.action, decision.reason,
                decision.uid, decision.product_id)

    if decision.action == 'ignore':
        return jsonify({'handled': False, 'reason': decision.reason}), 200

    # 3. Apply. A 500 here is correct — we want RevenueCat's retry.
    try:
        result = apply_decision(decision, doc_id_scrubber=_scrub_doc_id)
    except Exception as e:
        logger.exception('RevenueCat webhook failed to apply %s for %s: %s',
                         decision.action, decision.uid, e)
        return jsonify({'error': 'apply_failed'}), 500

    return jsonify({'handled': True, 'action': decision.action, **result}), 200


def _scrub_doc_id(key: str) -> str:
    return _UNSAFE_DOC_ID.sub('_', key or '')[:1500] or 'unkeyed'
