"""
Beehiiv v2 API wrapper for newsletter audience sync.

Beehiiv holds the newsletter list; Offerloop is the source of truth for
subscriber attributes (school, target_industry, class_year, tier). This
module syncs one direction — Offerloop → Beehiiv — plus a webhook route
for inbound unsubscribes.

All calls are fire-and-forget. If `BEEHIIV_API_KEY` is unset, every helper
returns `{'ok': False, 'reason': 'not_configured'}` without hitting the
network. Callers should NOT depend on Beehiiv success — a failed sync
retries on the next signal (tier change, profile update) automatically.

Endpoints used:
  POST   /publications/{pub}/subscriptions             upsert (reactivate_existing)
  PATCH  /publications/{pub}/subscriptions/{sub_id}    update custom fields
  DELETE /publications/{pub}/subscriptions/{sub_id}    hard unsubscribe

Beehiiv docs: https://developers.beehiiv.com/
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import requests

logger = logging.getLogger(__name__)


BEEHIIV_BASE_URL = "https://api.beehiiv.com/v2"
BEEHIIV_TIMEOUT_SEC = 8


def _api_key() -> str:
    return os.getenv("BEEHIIV_API_KEY", "")


def _publication_id() -> str:
    return os.getenv("BEEHIIV_PUBLICATION_ID", "")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }


def _configured() -> bool:
    return bool(_api_key() and _publication_id())


def _custom_fields_payload(custom_fields: Optional[dict]) -> list:
    """Beehiiv expects custom fields as `[{name, value}]`, not a dict."""
    if not custom_fields:
        return []
    return [
        {"name": k, "value": str(v)}
        for k, v in custom_fields.items()
        if v is not None and v != ""
    ]


def upsert_subscriber(
    email: str,
    *,
    custom_fields: Optional[dict] = None,
    utm_source: Optional[str] = None,
    reactivate: bool = True,
) -> dict:
    """Create or reactivate a Beehiiv subscription for `email`.

    `custom_fields` is a flat dict like:
      {"school": "USC", "target_industry": "consulting", "class_year": "2027", "tier": "free"}

    Returns `{ok, subscription_id?, reason?}` — never raises.
    """
    if not _configured():
        return {"ok": False, "reason": "not_configured"}
    if not email or "@" not in email:
        return {"ok": False, "reason": "invalid_email"}

    payload = {
        "email": email.lower().strip(),
        "reactivate_existing": bool(reactivate),
        "send_welcome_email": False,  # Beehiiv welcome is off; we have our own drip
        "custom_fields": _custom_fields_payload(custom_fields),
    }
    if utm_source:
        payload["utm_source"] = utm_source

    url = f"{BEEHIIV_BASE_URL}/publications/{_publication_id()}/subscriptions"
    try:
        response = requests.post(url, json=payload, headers=_headers(), timeout=BEEHIIV_TIMEOUT_SEC)
    except requests.RequestException as exc:
        logger.warning("beehiiv upsert failed for %s: %s", email, exc)
        return {"ok": False, "reason": "network_error"}

    if 200 <= response.status_code < 300:
        try:
            data = (response.json() or {}).get("data", {})
            return {"ok": True, "subscription_id": data.get("id")}
        except ValueError:
            return {"ok": True}

    logger.warning(
        "beehiiv upsert non-2xx (email=%s status=%d body=%s)",
        email, response.status_code, (response.text or "")[:200],
    )
    return {"ok": False, "reason": f"http_{response.status_code}"}


def update_subscriber_tier(email: str, tier: str) -> dict:
    """Convenience wrapper for the single-field update after a Stripe event.
    Uses upsert semantics so it works even if the initial upsert failed."""
    return upsert_subscriber(email, custom_fields={"tier": tier}, reactivate=False)


def unsubscribe(email: str) -> dict:
    """Mark a subscriber as inactive in Beehiiv. Called from the Offerloop
    unsubscribe flow so both systems stay in sync."""
    if not _configured():
        return {"ok": False, "reason": "not_configured"}
    if not email or "@" not in email:
        return {"ok": False, "reason": "invalid_email"}

    # Beehiiv's v2 patch endpoint accepts `{status: "inactive"}` and idempotently
    # unsubscribes. We look up by email via the subscriptions list rather than
    # tracking beehiiv subscription IDs on our side.
    url = f"{BEEHIIV_BASE_URL}/publications/{_publication_id()}/subscriptions/by_email/{email.lower().strip()}"
    try:
        response = requests.patch(
            url,
            json={"status": "inactive"},
            headers=_headers(),
            timeout=BEEHIIV_TIMEOUT_SEC,
        )
    except requests.RequestException as exc:
        logger.warning("beehiiv unsubscribe failed for %s: %s", email, exc)
        return {"ok": False, "reason": "network_error"}

    if 200 <= response.status_code < 300 or response.status_code == 404:
        # 404 = already gone, treat as success
        return {"ok": True}
    return {"ok": False, "reason": f"http_{response.status_code}"}
