"""Tests for return_to support in the Gmail OAuth flow.

Bug: the OAuth callback always redirected the popup to /signin, but the
rewritten SignIn.tsx no longer closes OAuth popups, so onboarding's
"Connect Gmail" stuck on "Waiting for Google...". The fix: /oauth/start
stores a sanitized return_to path in the state doc and the callback
redirects there, letting popup flows land on a page that closes itself.
"""
import pytest
from unittest.mock import MagicMock, patch

from flask import Flask

from app.routes.gmail_oauth import (
    gmail_oauth_bp,
    _sanitize_return_to,
)


@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(gmail_oauth_bp)
    app.config["TESTING"] = True
    return app.test_client()


def make_fake_db(state_data):
    """Firestore mock: oauth_state/{state} returns state_data, users/{uid} exists."""
    db = MagicMock()

    state_doc = MagicMock()
    state_doc.exists = state_data is not None
    state_doc.to_dict.return_value = state_data or {}

    user_doc = MagicMock()
    user_doc.exists = True
    user_doc.to_dict.return_value = {"email": "student@usc.edu"}

    def collection(name):
        col = MagicMock()
        if name == "oauth_state":
            col.document.return_value.get.return_value = state_doc
        elif name == "users":
            doc = MagicMock()
            doc.get.return_value = user_doc
            doc.collection.return_value.document.return_value = MagicMock()
            col.document.return_value = doc
        return col

    db.collection.side_effect = collection
    return db


class TestSanitizeReturnTo:
    def test_valid_relative_path(self):
        assert _sanitize_return_to("/integrations") == "/integrations"

    def test_valid_path_with_query(self):
        assert _sanitize_return_to("/find?tab=companies") == "/find?tab=companies"

    def test_absolute_url_rejected(self):
        assert _sanitize_return_to("https://evil.com/phish") is None

    def test_protocol_relative_rejected(self):
        assert _sanitize_return_to("//evil.com") is None

    def test_backslash_rejected(self):
        # Browsers normalize backslashes to slashes: /\evil.com == //evil.com
        assert _sanitize_return_to("/\\evil.com") is None

    def test_empty_and_none(self):
        assert _sanitize_return_to("") is None
        assert _sanitize_return_to(None) is None

    def test_relative_without_leading_slash_rejected(self):
        assert _sanitize_return_to("integrations") is None


class TestCallbackRedirect:
    def test_access_denied_redirects_to_return_to(self, client):
        state_data = {
            "uid": "test-uid",
            "email": "student@usc.edu",
            "return_to": "/oauth/complete",
        }
        with patch("app.routes.gmail_oauth.get_db", return_value=make_fake_db(state_data)):
            resp = client.get(
                "/api/google/oauth/callback?error=access_denied&state=abc123"
            )
        assert resp.status_code == 302
        assert resp.headers["Location"].endswith("/oauth/complete?gmail_error=not_test_user")

    def test_success_redirects_to_return_to(self, client):
        state_data = {
            "uid": "test-uid",
            "email": "student@usc.edu",
            "return_to": "/oauth/complete",
        }
        creds = MagicMock()
        fake_flow = MagicMock()
        fake_flow.credentials = creds

        fake_gmail = MagicMock()
        fake_gmail.users.return_value.getProfile.return_value.execute.return_value = {
            "emailAddress": "student@usc.edu"
        }

        with patch("app.routes.gmail_oauth.get_db", return_value=make_fake_db(state_data)), \
             patch("app.routes.gmail_oauth.Flow") as flow_cls, \
             patch("googleapiclient.discovery.build", return_value=fake_gmail), \
             patch("app.routes.gmail_oauth._save_user_gmail_creds"), \
             patch("app.services.gmail_client.start_gmail_watch"):
            flow_cls.from_client_config.return_value = fake_flow
            resp = client.get("/api/google/oauth/callback?code=authcode&state=abc123")

        assert resp.status_code == 302
        assert resp.headers["Location"].endswith("/oauth/complete?connected=gmail")

    def test_success_without_return_to_falls_back_to_signin(self, client):
        state_data = {"uid": "test-uid", "email": "student@usc.edu"}
        creds = MagicMock()
        fake_flow = MagicMock()
        fake_flow.credentials = creds

        fake_gmail = MagicMock()
        fake_gmail.users.return_value.getProfile.return_value.execute.return_value = {
            "emailAddress": "student@usc.edu"
        }

        with patch("app.routes.gmail_oauth.get_db", return_value=make_fake_db(state_data)), \
             patch("app.routes.gmail_oauth.Flow") as flow_cls, \
             patch("googleapiclient.discovery.build", return_value=fake_gmail), \
             patch("app.routes.gmail_oauth._save_user_gmail_creds"), \
             patch("app.services.gmail_client.start_gmail_watch"):
            flow_cls.from_client_config.return_value = fake_flow
            resp = client.get("/api/google/oauth/callback?code=authcode&state=abc123")

        assert resp.status_code == 302
        assert "/signin?connected=gmail" in resp.headers["Location"]

    def test_malicious_return_to_in_state_ignored(self, client):
        # Even if a hostile value lands in the state doc, the callback must
        # not open-redirect off-origin.
        state_data = {
            "uid": "test-uid",
            "email": "student@usc.edu",
            "return_to": "https://evil.com/phish",
        }
        with patch("app.routes.gmail_oauth.get_db", return_value=make_fake_db(state_data)):
            resp = client.get(
                "/api/google/oauth/callback?error=access_denied&state=abc123"
            )
        assert resp.status_code == 302
        assert "evil.com" not in resp.headers["Location"]
