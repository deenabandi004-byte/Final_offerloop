"""
Tests for the app -> web checkout handoff endpoints.

    POST /api/mobile/web-handoff   (auth-gated)
    POST /api/web/handoff-exchange (unauthenticated, rate-limited)

Covers the security-critical paths from spec section 3:
    - single-use burn
    - expired-code rejection
    - unknown-code rejection
    - custom token returned only on successful exchange
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

FAKE_USER = {"uid": "test-user-id", "email": "test@example.com"}


@pytest.fixture(autouse=True)
def _bypass_firebase_auth():
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
         patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
        yield


@pytest.fixture(autouse=True)
def _passthrough_transactional():
    """The real @firestore.transactional wraps its callable with retry logic
    that inspects Transaction internals we do not want to mock. For tests we
    just want the function to run once against our fake transaction, so
    replace the decorator with an identity."""
    def _identity(fn):
        return fn
    with patch("backend.app.routes.mobile_handoff.firestore.transactional", _identity):
        yield


@pytest.fixture()
def client():
    from backend.wsgi import create_app
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


class _FakeDoc:
    """Minimal DocumentSnapshot stand-in that supports .exists and .to_dict()."""

    def __init__(self, data: dict | None):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data


class _FakeDocRef:
    """Records set/update and returns the current state on .get()."""

    def __init__(self, initial: dict | None = None):
        self.state: dict | None = dict(initial) if initial else None
        self.updates: list[dict] = []
        self.sets: list[dict] = []

    def set(self, data, merge=False):
        self.sets.append(dict(data))
        if merge and self.state:
            self.state.update(data)
        else:
            self.state = dict(data)

    def update(self, data):
        self.updates.append(dict(data))
        if self.state is None:
            self.state = {}
        self.state.update(data)

    def get(self, transaction=None):
        return _FakeDoc(dict(self.state) if self.state is not None else None)


class _FakeCollection:
    def __init__(self, docs: dict[str, _FakeDocRef] | None = None):
        self.docs: dict[str, _FakeDocRef] = docs or {}

    def document(self, code):
        if code not in self.docs:
            self.docs[code] = _FakeDocRef()
        return self.docs[code]


class _FakeTransaction:
    """Forwards tx.update(ref, data) to ref.update(data) so the fake db sees the write."""

    def update(self, ref, data):
        ref.update(data)


class _FakeDb:
    def __init__(self):
        self.collections: dict[str, _FakeCollection] = {}

    def collection(self, name):
        if name not in self.collections:
            self.collections[name] = _FakeCollection()
        return self.collections[name]

    def transaction(self):
        return _FakeTransaction()


# ---------- mint tests ----------

def test_mint_returns_checkout_url_with_code(client):
    fake_db = _FakeDb()
    with patch("backend.app.routes.mobile_handoff.get_db", return_value=fake_db):
        resp = client.post(
            "/api/mobile/web-handoff",
            json={},
            headers={"Authorization": "Bearer fake-token"},
        )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["url"].startswith("https://www.offerloop.ai/checkout?code=")
    assert body["expires_in"] == 60

    # Doc got written with the right shape
    codes = fake_db.collections["handoffCodes"].docs
    assert len(codes) == 1
    (_, ref), = codes.items()
    assert ref.state["uid"] == "test-user-id"
    assert ref.state["used"] is False
    assert ref.state["expires_at"] > ref.state["created_at"]


def test_mint_includes_plan_in_url_when_provided(client):
    fake_db = _FakeDb()
    with patch("backend.app.routes.mobile_handoff.get_db", return_value=fake_db):
        resp = client.post(
            "/api/mobile/web-handoff",
            json={"plan": "pro"},
            headers={"Authorization": "Bearer fake-token"},
        )
    assert resp.status_code == 200
    assert "&plan=pro" in resp.get_json()["url"]


def test_mint_requires_auth(client):
    resp = client.post("/api/mobile/web-handoff", json={})
    assert resp.status_code == 401


# ---------- exchange tests ----------

def _seed_code(db: _FakeDb, code: str, *, uid="test-user-id", used=False, ttl_seconds=60):
    now = datetime.now(timezone.utc)
    db.collection("handoffCodes").docs[code] = _FakeDocRef({
        "uid": uid,
        "created_at": now,
        "expires_at": now + timedelta(seconds=ttl_seconds),
        "used": used,
    })


def test_exchange_burns_code_and_returns_custom_token(client):
    fake_db = _FakeDb()
    _seed_code(fake_db, "goodcode")

    with patch("backend.app.routes.mobile_handoff.get_db", return_value=fake_db), \
         patch("backend.app.routes.mobile_handoff.fb_auth.create_custom_token",
               return_value=b"minted-custom-token"):
        resp = client.post(
            "/api/web/handoff-exchange",
            json={"code": "goodcode"},
        )
    assert resp.status_code == 200
    assert resp.get_json()["token"] == "minted-custom-token"

    # Marked as used
    ref = fake_db.collections["handoffCodes"].docs["goodcode"]
    assert ref.state["used"] is True
    assert "used_at" in ref.state


def test_exchange_second_call_rejected_as_already_used(client):
    fake_db = _FakeDb()
    _seed_code(fake_db, "usedcode", used=True)

    with patch("backend.app.routes.mobile_handoff.get_db", return_value=fake_db):
        resp = client.post("/api/web/handoff-exchange", json={"code": "usedcode"})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "already used"


def test_exchange_expired_code_rejected(client):
    fake_db = _FakeDb()
    _seed_code(fake_db, "oldcode", ttl_seconds=-1)  # already expired

    with patch("backend.app.routes.mobile_handoff.get_db", return_value=fake_db):
        resp = client.post("/api/web/handoff-exchange", json={"code": "oldcode"})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "expired"


def test_exchange_unknown_code_rejected(client):
    fake_db = _FakeDb()

    with patch("backend.app.routes.mobile_handoff.get_db", return_value=fake_db):
        resp = client.post("/api/web/handoff-exchange", json={"code": "nope"})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "invalid code"


def test_exchange_missing_code_rejected(client):
    resp = client.post("/api/web/handoff-exchange", json={})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "code required"


def test_exchange_is_unauthenticated_no_bearer_needed(client):
    """The code IS the credential; no Firebase Bearer required to exchange."""
    fake_db = _FakeDb()
    _seed_code(fake_db, "goodcode")

    with patch("backend.app.routes.mobile_handoff.get_db", return_value=fake_db), \
         patch("backend.app.routes.mobile_handoff.fb_auth.create_custom_token",
               return_value=b"tok"):
        resp = client.post("/api/web/handoff-exchange", json={"code": "goodcode"})
    assert resp.status_code == 200
