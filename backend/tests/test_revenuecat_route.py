"""
Route-level tests for POST /api/revenuecat/webhook.

Scope is deliberately the AUTH GATE and the event-shape handling — the paths
that must behave correctly without Firestore being involved at all. The paths
that write credits are covered pure in `test_revenuecat_webhook.py` and by the
sandbox QA gate in SPEC-iap-v2-pricing-and-credits.md section 7.

The one thing these tests exist to prove: an unauthenticated POST can never
reach the credit-granting code.
"""
import json

import pytest

# NOTE: must be the `backend.` path, not `app.` — wsgi.py registers the
# blueprint from `backend.app.routes...`, which is a DIFFERENT module object
# than `app.routes...`. Patching the wrong one silently no-ops.
from backend.app.routes import revenuecat_webhook as rc_route


SECRET = 'test-webhook-secret-value'


@pytest.fixture
def secret_configured(monkeypatch):
    monkeypatch.setattr(rc_route, 'REVENUECAT_WEBHOOK_SECRET', SECRET)
    monkeypatch.setattr(rc_route, 'REVENUECAT_EXPECT_PRODUCTION', True)


def post(client, body, auth=None):
    headers = {'Content-Type': 'application/json'}
    if auth is not None:
        headers['Authorization'] = auth
    return client.post('/api/revenuecat/webhook',
                       data=json.dumps(body), headers=headers)


def test_rejects_request_with_no_authorization_header(client, secret_configured):
    r = post(client, {'event': {'type': 'TEST'}})
    assert r.status_code == 401


def test_rejects_request_with_wrong_secret(client, secret_configured):
    r = post(client, {'event': {'type': 'TEST'}}, auth='not-the-secret')
    assert r.status_code == 401


def test_rejects_everything_when_no_secret_is_configured(client, monkeypatch):
    """Fail closed. A missing env var must not open the faucet."""
    monkeypatch.setattr(rc_route, 'REVENUECAT_WEBHOOK_SECRET', '')
    r = post(client, {'event': {'type': 'TEST'}}, auth='anything')
    assert r.status_code == 401


def test_accepts_the_dashboard_test_event_with_a_valid_secret(client, secret_configured):
    """RevenueCat's "Send test webhook" button must get a 200, or the dashboard
    marks the integration broken."""
    r = post(client, {'event': {'type': 'TEST', 'app_user_id': 'uid-1',
                                'environment': 'PRODUCTION'}}, auth=SECRET)
    assert r.status_code == 200
    assert r.get_json()['handled'] is False


def test_accepts_bearer_prefixed_secret(client, secret_configured):
    r = post(client, {'event': {'type': 'TEST', 'app_user_id': 'uid-1',
                                'environment': 'PRODUCTION'}},
             auth=f'Bearer {SECRET}')
    assert r.status_code == 200


def test_malformed_body_is_a_400_not_a_500(client, secret_configured):
    """A 5xx makes RevenueCat retry a permanently broken payload 5 times."""
    r = client.post('/api/revenuecat/webhook', data='not json',
                    headers={'Authorization': SECRET,
                             'Content-Type': 'application/json'})
    assert r.status_code == 400


def test_webhook_is_exempt_from_ip_rate_limiting(app):
    """Every event from every buyer arrives from RevenueCat's own IPs, so the
    default per-IP limit (500/hour) is one shared bucket for the whole app's
    purchases. Tripping it returns 429 — not 2xx — so RevenueCat retries five
    times and then drops a purchase somebody paid for.

    The shared secret is the real authentication here; the IP bucket adds
    nothing but a way to lose money.
    """
    from backend.app.extensions import get_rate_limit_key

    with app.test_request_context('/api/revenuecat/webhook', method='POST'):
        assert get_rate_limit_key() is None


def test_other_api_routes_are_still_rate_limited(app):
    """Guard the exemption above — it must not widen to the rest of /api."""
    from backend.app.extensions import get_rate_limit_key

    with app.test_request_context('/api/mobile/me', method='GET'):
        assert get_rate_limit_key() is not None


def test_sandbox_event_is_acknowledged_but_not_handled_in_production(client, secret_configured):
    """Must return 200 — a non-2xx would make RevenueCat retry an event we are
    deliberately dropping."""
    r = post(client, {'event': {
        'type': 'NON_RENEWING_PURCHASE',
        'app_user_id': 'uid-1',
        'product_id': 'ai.offerloop.app.credits.400',
        'transaction_id': 'txn-1',
        'environment': 'SANDBOX',
    }}, auth=SECRET)
    assert r.status_code == 200
    body = r.get_json()
    assert body['handled'] is False
    assert body['reason'] == 'environment_mismatch'
