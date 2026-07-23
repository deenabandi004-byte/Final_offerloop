"""
Tests for POST /api/emails/eml — downloadable .eml draft endpoint.

Used by the frontend when a user has no connected Gmail integration: the
generate-and-draft fallback drafts (subject/body) get turned into a
downloadable .eml file here, with the user's own resume (from Firestore,
never from the request body) attached when available.
"""
import email
from email import policy
from unittest.mock import patch, MagicMock

import pytest

FAKE_USER = {"uid": "test-user-id", "email": "test@example.com"}


@pytest.fixture(autouse=True)
def _bypass_firebase_auth():
    """Bypass the real require_firebase_auth decorator for every test.

    Mirrors the pattern in tests/test_generate_and_draft_fallback.py: the
    decorator checks firebase_admin._apps and then calls
    firebase_admin.auth.verify_id_token, both of which are module-level
    lookups at request time (not import time), so patching them here is
    sufficient regardless of decorator binding order. The
    `authenticated_request` conftest fixture does NOT achieve this — it
    patches app.extensions.require_firebase_auth after the blueprint has
    already bound the real decorator at import time.
    """
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
         patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
        yield


def _mock_db(resume_url=None):
    db = MagicMock()
    doc = MagicMock()
    doc.to_dict.return_value = {"resumeUrl": resume_url, "resumeFileName": "Resume.pdf"}
    db.collection.return_value.document.return_value.get.return_value = doc
    return db


def test_eml_download_no_resume(client):
    with patch("backend.app.routes.emails.get_db", return_value=_mock_db()):
        res = client.post(
            "/api/emails/eml",
            json={"to": "jane@acme.com", "subject": "Hi", "body": "Text",
                  "firstName": "Jane", "company": "Acme"},
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 200
    assert res.mimetype == "message/rfc822"
    assert 'filename="Jane-Acme.eml"' in res.headers["Content-Disposition"]
    msg = email.message_from_bytes(res.data, policy=policy.default)
    assert msg["To"] == "jane@acme.com"
    assert msg["X-Unsent"] == "1"
    assert list(msg.iter_attachments()) == []


def test_eml_download_attaches_resume(client):
    pdf = b"%PDF-1.4 fake"
    fake_res = MagicMock(status_code=200, content=pdf, headers={"content-type": "application/pdf"})
    fake_res.raise_for_status = MagicMock()
    with patch("backend.app.routes.emails.get_db", return_value=_mock_db("https://storage/x.pdf")), \
         patch("backend.app.routes.emails.requests.get", return_value=fake_res), \
         patch("backend.app.routes.emails.validate_fetch_url", side_effect=lambda u: u):
        res = client.post(
            "/api/emails/eml",
            json={"to": "a@b.com", "subject": "Hi", "body": "Text"},
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 200
    msg = email.message_from_bytes(res.data, policy=policy.default)
    atts = list(msg.iter_attachments())
    assert len(atts) == 1 and atts[0].get_filename() == "Resume.pdf"


def test_eml_download_escapes_html_in_body(client):
    body = "Hello <b>bold</b> & stuff"
    with patch("backend.app.routes.emails.get_db", return_value=_mock_db()):
        res = client.post(
            "/api/emails/eml",
            json={"to": "jane@acme.com", "subject": "Hi", "body": body},
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 200
    msg = email.message_from_bytes(res.data, policy=policy.default)
    html_part = msg.get_body(preferencelist=("html",)).get_content()
    plain_part = msg.get_body(preferencelist=("plain",)).get_content()
    assert "&lt;b&gt;" in html_part
    assert "&amp;" in html_part
    assert "<b>bold</b>" not in html_part
    assert "<b>bold</b> & stuff" in plain_part


def test_eml_download_missing_fields_400(client):
    with patch("backend.app.routes.emails.get_db", return_value=_mock_db()):
        res = client.post("/api/emails/eml", json={"to": "a@b.com"},
                          headers={"Authorization": "Bearer test"})
    assert res.status_code == 400
