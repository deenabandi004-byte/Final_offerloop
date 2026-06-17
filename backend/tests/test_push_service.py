"""
Tests for the Expo push service (app/services/push_service.py).

Covers the pure helpers and the send path with a fake Firestore + a stubbed
Expo HTTP call, so there's no network. Verifies tokens Expo reports as
DeviceNotRegistered get pruned and the accepted count is correct.
"""
import pytest

from app.services import push_service


VALID = "ExponentPushToken[abcDEF123]"
VALID2 = "ExponentPushToken[zzz999]"


class TestTokenHelpers:
    def test_is_expo_token(self):
        assert push_service.is_expo_token(VALID)
        assert push_service.is_expo_token("ExpoPushToken[x]")
        assert not push_service.is_expo_token("fcm:random-token")
        assert not push_service.is_expo_token("")
        assert not push_service.is_expo_token(None)

    def test_token_id_is_stable_and_distinct(self):
        assert push_service._token_id(VALID) == push_service._token_id(VALID)
        assert push_service._token_id(VALID) != push_service._token_id(VALID2)

    def test_build_messages(self):
        msgs = push_service.build_messages([VALID, VALID2], "Title", "Body", {"k": "v"})
        assert len(msgs) == 2
        assert msgs[0] == {
            "to": VALID,
            "title": "Title",
            "body": "Body",
            "sound": "default",
            "data": {"k": "v"},
        }
        # None data normalizes to {}
        assert push_service.build_messages([VALID], "t", "b", None)[0]["data"] == {}


class _FakeDoc:
    def __init__(self, data):
        self._data = data

    def to_dict(self):
        return self._data


class _FakeDeviceColl:
    """Minimal stand-in for users/{uid}/devices supporting stream + doc.delete."""

    def __init__(self, store):
        self.store = store  # {token_id: {token,...}}

    def stream(self):
        return [_FakeDoc(v) for v in self.store.values()]

    def document(self, token_id):
        store = self.store

        class _Ref:
            def set(self, data, merge=False):
                store[token_id] = {**store.get(token_id, {}), **data}

            def delete(self):
                store.pop(token_id, None)

        return _Ref()


@pytest.fixture
def fake_db(monkeypatch):
    store = {
        push_service._token_id(VALID): {"token": VALID, "platform": "ios"},
        push_service._token_id(VALID2): {"token": VALID2, "platform": "android"},
    }
    # users(...).document(uid).collection('devices') -> our fake coll
    coll = _FakeDeviceColl(store)

    class Chain:
        def collection(self, name):
            if name == "devices":
                return coll
            return self

        def document(self, _):
            return self

    monkeypatch.setattr(push_service, "get_db", lambda: Chain())
    return store


def _expo_response(statuses):
    class Resp:
        content = b"x"

        def json(self):
            return {"data": [{"status": s[0], **({"details": {"error": s[1]}} if s[1] else {})} for s in statuses]}

    return Resp()


def test_send_push_accepts_and_prunes(fake_db, monkeypatch):
    posted = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        posted["url"] = url
        posted["messages"] = json
        # First token ok, second DeviceNotRegistered
        return _expo_response([("ok", None), ("error", "DeviceNotRegistered")])

    monkeypatch.setattr(push_service.requests, "post", fake_post)

    accepted = push_service.send_push("uid1", "Hi", "There", {"type": "reply"})

    assert accepted == 1
    assert posted["url"] == push_service.EXPO_PUSH_URL
    assert len(posted["messages"]) == 2
    # The dead token was pruned, the good one remains.
    assert push_service._token_id(VALID) in fake_db
    assert push_service._token_id(VALID2) not in fake_db


def test_send_push_no_tokens_short_circuits(monkeypatch):
    class Chain:
        def collection(self, name):
            return self

        def document(self, _):
            return self

        def stream(self):
            return []

    monkeypatch.setattr(push_service, "get_db", lambda: Chain())
    # No network call should happen; if it did, this would raise.
    monkeypatch.setattr(
        push_service.requests, "post",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("should not POST")),
    )
    assert push_service.send_push("uid1", "t", "b") == 0
