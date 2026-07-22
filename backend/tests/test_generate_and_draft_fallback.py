"""
Tests for the fallback delivery mode on /api/emails/generate-and-draft.

When a user has no connected Gmail integration, the route must still return
200 with generated email content instead of hard-failing with a 500. The
frontend renders download/copy buttons for these fallback drafts.
"""
import pytest
from unittest.mock import patch, MagicMock

FAKE_USER = {"uid": "test-user-id", "email": "test@example.com"}

CONTACT = {"FirstName": "Jane", "LastName": "Doe", "Email": "jane@acme.com",
           "Company": "Acme", "emailSubject": "Hello Jane", "emailBody": "Body text"}


@pytest.fixture(autouse=True)
def _bypass_firebase_auth():
    """Bypass the real require_firebase_auth decorator for every test.

    Mirrors the pattern in tests/test_nudges_routes.py: the decorator checks
    firebase_admin._apps and then calls firebase_admin.auth.verify_id_token,
    both of which are module-level lookups at request time (not import time),
    so patching them here is sufficient regardless of decorator binding order.
    """
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
         patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
        yield


def _mock_db():
    db = MagicMock()
    user_doc = MagicMock()
    user_doc.to_dict.return_value = {"email": "u@icloud.com", "resumeText": "x" * 100}
    db.collection.return_value.document.return_value.get.return_value = user_doc
    # contact lookup returns no existing contacts
    db.collection.return_value.document.return_value.collection.return_value \
      .where.return_value.limit.return_value.stream.return_value = []
    return db


def test_no_gmail_integration_returns_200_fallback(client):
    with patch("backend.app.routes.emails.get_user_gmail_service_strict", return_value=None), \
         patch("backend.app.routes.emails.get_db", return_value=_mock_db()):
        res = client.post(
            "/api/emails/generate-and-draft",
            json={"contacts": [CONTACT]},
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 200
    data = res.get_json()
    assert data["deliveryMode"] == "fallback"
    assert data["success"] is True
    d = data["drafts"][0]
    assert d["to"] == "jane@acme.com"
    assert d["subject"] == "Hello Jane"
    assert d["body"].startswith("Body text")  # signature may be appended
    assert d["deliveryMode"] == "fallback"
    assert "gmailUrl" not in d and "draftId" not in d


def test_gmail_connected_keeps_gmail_mode(client):
    svc = MagicMock()
    svc.users.return_value.getProfile.return_value.execute.return_value = {"emailAddress": "u@gmail.com"}
    draft = {"id": "d1", "message": {"id": "m1", "threadId": "t1"}}
    svc.users.return_value.drafts.return_value.create.return_value.execute.return_value = draft
    with patch("backend.app.routes.emails.get_user_gmail_service_strict", return_value=svc), \
         patch("backend.app.routes.emails.get_db", return_value=_mock_db()):
        res = client.post(
            "/api/emails/generate-and-draft",
            json={"contacts": [CONTACT]},
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 200
    data = res.get_json()
    assert data["deliveryMode"] == "gmail"
    assert data["drafts"][0]["draftId"] == "d1"
    assert "gmailUrl" in data["drafts"][0]
