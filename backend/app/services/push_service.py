"""
Expo push notifications for the mobile app.

Device tokens (Expo push tokens) are stored per-user under
``users/{uid}/devices/{tokenHash}``; sending goes through Expo's push service
(https://docs.expo.dev/push-notifications/sending-notifications/). Kept tiny and
function-based to match the other services: register a token, send to a user,
and prune tokens Expo reports as dead. All failures are swallowed/logged — a
push is a nice-to-have and must never break the request that triggered it.
"""
import hashlib
import logging

import requests

from app.extensions import get_db

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_EXPO_TOKEN_PREFIXES = ("ExponentPushToken[", "ExpoPushToken[")


def _token_id(token: str) -> str:
    """Stable doc id for a token (the raw token has brackets, unfit as an id)."""
    return hashlib.sha1(token.encode("utf-8")).hexdigest()


def is_expo_token(token: str) -> bool:
    return isinstance(token, str) and token.startswith(_EXPO_TOKEN_PREFIXES)


def register_device(uid: str, token: str, platform: str = "", now_iso: str | None = None) -> bool:
    """Upsert an Expo push token for a user. Returns True if stored."""
    if not is_expo_token(token):
        logger.warning("[push] rejected non-Expo token for uid=%s", uid)
        return False
    db = get_db()
    from datetime import datetime, timezone

    ts = now_iso or datetime.now(timezone.utc).isoformat()
    try:
        db.collection("users").document(uid).collection("devices").document(_token_id(token)).set(
            {"token": token, "platform": platform or "", "updatedAt": ts},
            merge=True,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("[push] register_device failed uid=%s: %s", uid, exc)
        return False


def _user_tokens(db, uid: str) -> list[str]:
    try:
        docs = db.collection("users").document(uid).collection("devices").stream()
        return [d.to_dict().get("token") for d in docs if (d.to_dict() or {}).get("token")]
    except Exception as exc:  # noqa: BLE001
        logger.error("[push] token lookup failed uid=%s: %s", uid, exc)
        return []


def _prune_token(db, uid: str, token: str) -> None:
    try:
        db.collection("users").document(uid).collection("devices").document(_token_id(token)).delete()
        logger.info("[push] pruned dead token for uid=%s", uid)
    except Exception:  # noqa: BLE001
        pass


def build_messages(tokens: list[str], title: str, body: str, data: dict | None) -> list[dict]:
    """Pure: turn tokens into Expo message payloads (testable without network)."""
    return [
        {
            "to": t,
            "title": title,
            "body": body,
            "sound": "default",
            "data": data or {},
        }
        for t in tokens
    ]


def send_push(uid: str, title: str, body: str, data: dict | None = None) -> int:
    """Send a push to all of a user's devices. Returns the count accepted by
    Expo. Best-effort: never raises, prunes tokens Expo says are unregistered."""
    db = get_db()
    tokens = _user_tokens(db, uid)
    if not tokens:
        return 0

    accepted = 0
    # Expo accepts up to 100 messages per request.
    for i in range(0, len(tokens), 100):
        chunk = tokens[i : i + 100]
        messages = build_messages(chunk, title, body, data)
        try:
            resp = requests.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                timeout=10,
            )
            payload = resp.json() if resp.content else {}
        except Exception as exc:  # noqa: BLE001
            logger.error("[push] send failed uid=%s: %s", uid, exc)
            continue

        results = payload.get("data") or []
        for token, result in zip(chunk, results):
            if not isinstance(result, dict):
                continue
            if result.get("status") == "ok":
                accepted += 1
            elif (result.get("details") or {}).get("error") == "DeviceNotRegistered":
                _prune_token(db, uid, token)
    logger.info("[push] uid=%s accepted=%d/%d", uid, accepted, len(tokens))
    return accepted
