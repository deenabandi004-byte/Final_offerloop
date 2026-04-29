"""
Phase 2 personalization data layer — unit tests.

Covers the parts of §7 (P2 row) that don't require a real Pub/Sub
emulator or a real Gmail account:
  - IncomingEvent validates well-shaped frontend events and rejects
    malformed ones (per-field, not whole-batch).
  - Idempotency key derivation is deterministic for Pub/Sub (same source
    → same key → same Firestore doc ID).
  - Frontend-allowlist enforcement: backend-only event types from the
    frontend are rejected.
  - log_event is a no-op when the rollout flag is off.
  - Reply-attribution helpers parse case-insensitive headers correctly
    and short-circuit when the feature flag is off.

For the integration tests called out in §7 (real Gmail send/reply,
Pub/Sub emulator dedup), see backend/tests/integration/ — those need
network access and are run separately by `pytest -m integration`.
"""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest


def test_incoming_event_validates_minimal_envelope():
    from app.models.events import IncomingEvent, EventType

    payload = {
        'eventId': '11111111-1111-1111-1111-111111111111',
        'type': 'contact_saved',
        'timestamp': '2026-04-28T12:00:00Z',
        'source': 'frontend',
        'schemaVersion': 1,
        'sessionId': 'sess-1',
        'payload': {'contactId': 'abc'},
    }
    evt = IncomingEvent(**payload) if not hasattr(IncomingEvent, 'model_validate') else IncomingEvent.model_validate(payload)
    assert evt.type == EventType.CONTACT_SAVED
    assert evt.event_id == payload['eventId']


def test_incoming_event_rejects_unknown_type():
    from app.models.events import IncomingEvent

    bad = {
        'eventId': 'x',
        'type': 'totally_made_up',
        'timestamp': '2026-04-28T12:00:00Z',
        'payload': {},
    }
    with pytest.raises(Exception):
        IncomingEvent(**bad) if not hasattr(IncomingEvent, 'model_validate') else IncomingEvent.model_validate(bad)


def test_idempotency_key_is_deterministic():
    from app.services.events_service import derive_idempotency_key
    from app.models.events import EventType

    a = derive_idempotency_key('uid-1', 'gmail-msg-1', EventType.REPLY_RECEIVED)
    b = derive_idempotency_key('uid-1', 'gmail-msg-1', EventType.REPLY_RECEIVED)
    assert a == b
    assert a != derive_idempotency_key('uid-1', 'gmail-msg-2', EventType.REPLY_RECEIVED)
    assert a != derive_idempotency_key('uid-2', 'gmail-msg-1', EventType.REPLY_RECEIVED)


def test_log_event_is_noop_when_flag_off(monkeypatch):
    from app.services import events_service
    monkeypatch.setenv('EVENTS_LOGGING_ENABLED', 'false')
    # Even with a uid + valid type, we should NOT touch Firestore.
    with patch.object(events_service, 'get_db') as get_db_mock:
        result = events_service.log_event(
            uid='abc', event_type='contact_saved', payload={'contactId': 'x'},
        )
        assert result is None
        get_db_mock.assert_not_called()


def test_log_event_writes_with_idempotency(monkeypatch):
    from app.services import events_service
    monkeypatch.setenv('EVENTS_LOGGING_ENABLED', 'true')

    fake_ref = MagicMock()
    fake_collection = MagicMock()
    fake_collection.document.return_value = fake_ref
    fake_user_doc = MagicMock()
    fake_user_doc.collection.return_value = fake_collection
    fake_users = MagicMock()
    fake_users.document.return_value = fake_user_doc
    fake_db = MagicMock()
    fake_db.collection.return_value = fake_users

    with patch.object(events_service, 'get_db', return_value=fake_db):
        eid = events_service.log_event(
            uid='abc', event_type='contact_saved', payload={'contactId': 'x'},
            idempotency_key='custom-id-1',
        )
        assert eid == 'custom-id-1'
        fake_db.collection.assert_called_with('users')
        fake_collection.document.assert_called_with('custom-id-1')
        fake_ref.create.assert_called_once()
        # Confirm the written doc has the TTL field.
        written = fake_ref.create.call_args.args[0]
        assert 'expiresAt' in written
        assert written['type'] == 'contact_saved'
        assert written['source'] == 'backend'


def test_accept_frontend_event_rejects_backend_only_types(monkeypatch):
    """Backend-only event types must NOT be accepted via /api/events/batch."""
    from app.services import events_service
    monkeypatch.setenv('EVENTS_LOGGING_ENABLED', 'true')
    # If the validator/allowlist works, log_event is never called and
    # the result is None.
    with patch.object(events_service, 'log_event') as log_mock:
        log_mock.return_value = 'should-not-be-returned'
        result = events_service.accept_frontend_event(
            'uid',
            {
                'eventId': 'e1',
                'type': 'reply_received',  # backend-only
                'timestamp': '2026-04-28T12:00:00Z',
                'payload': {},
            },
        )
        assert result is None
        log_mock.assert_not_called()


def test_accept_frontend_event_routes_through_log_event(monkeypatch):
    from app.services import events_service
    monkeypatch.setenv('EVENTS_LOGGING_ENABLED', 'true')
    with patch.object(events_service, 'log_event') as log_mock:
        log_mock.return_value = 'e1'
        result = events_service.accept_frontend_event(
            'uid',
            {
                'eventId': 'e1',
                'type': 'contact_saved',
                'timestamp': '2026-04-28T12:00:00Z',
                'payload': {'contactId': 'c1'},
                'sessionId': 'sess-1',
            },
        )
        assert result == 'e1'
        # The frontend's eventId must be preserved as the Firestore doc ID
        # so retries are idempotent.
        kwargs = log_mock.call_args.kwargs
        assert kwargs['idempotency_key'] == 'e1'
        assert kwargs['source'] == 'frontend'


# =============================================================================
# Reply attribution helpers
# =============================================================================


def test_pubsub_helpers_no_op_when_flag_off(monkeypatch):
    from app.routes import gmail_pubsub
    monkeypatch.setenv('REPLY_ATTRIBUTION_ENABLED', 'false')

    msg = {
        'id': 'gmail-1',
        'payload': {
            'headers': [{'name': 'X-Offerloop-Tracking-Id', 'value': 'tid-1'}],
        },
    }
    assert gmail_pubsub.attribute_outbound_message('uid', msg) is None
    assert gmail_pubsub.attribute_inbound_reply('uid', msg) is None


def test_pubsub_header_lookup_is_case_insensitive():
    from app.routes.gmail_pubsub import _header

    headers = [
        {'name': 'In-Reply-To', 'value': '<msg-id-1@gmail.com>'},
        {'name': 'message-id', 'value': '<msg-id-2@gmail.com>'},  # lowercase
    ]
    assert _header(headers, 'in-reply-to') == '<msg-id-1@gmail.com>'
    assert _header(headers, 'Message-ID') == '<msg-id-2@gmail.com>'
    assert _header(headers, 'X-Missing') is None
