"""
Thin wrapper around Browserless.io. Kept deliberately small so we can swap to
a self-hosted Playwright worker (or a different vendor) by reimplementing this
file without touching the form-fillers.

Browserless exposes a /function endpoint that runs an arbitrary user-supplied
JS function inside a real Chromium with a real Playwright page handle. We
ship the per-ATS Playwright script as a string and POST it here.

Env:
  BROWSERLESS_API_KEY  required
  BROWSERLESS_URL      defaults to https://production-sfo.browserless.io
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any, Dict, Optional

import requests


logger = logging.getLogger(__name__)

_DEFAULT_URL = "https://production-sfo.browserless.io"
_TIMEOUT_SECONDS = 180


class BrowserlessError(Exception):
    """Raised when Browserless returns a non-2xx or the script crashes."""


def _config() -> Dict[str, str]:
    token = os.getenv("BROWSERLESS_API_KEY")
    if not token:
        raise BrowserlessError("BROWSERLESS_API_KEY not set")
    return {
        "token": token,
        "url": os.getenv("BROWSERLESS_URL", _DEFAULT_URL).rstrip("/"),
    }


def run_function(script: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a user-supplied JS function on Browserless.

    `script` must be a JS function body that receives `{ page, context }` and
    returns a JSON-serializable object. `context` is passed through verbatim
    and is the right place for ATS-specific inputs (URL, profile, answers,
    resume URL).
    """
    cfg = _config()
    endpoint = f"{cfg['url']}/function?token={cfg['token']}"
    payload = {"code": script, "context": context}

    try:
        resp = requests.post(
            endpoint,
            json=payload,
            timeout=_TIMEOUT_SECONDS,
            headers={"Content-Type": "application/json"},
        )
    except requests.RequestException as exc:
        logger.exception("browserless request failed")
        raise BrowserlessError(f"browserless transport error: {exc}") from exc

    if resp.status_code >= 400:
        logger.error(
            "browserless non-2xx status=%s body=%s",
            resp.status_code,
            resp.text[:500],
        )
        raise BrowserlessError(
            f"browserless returned {resp.status_code}: {resp.text[:200]}"
        )

    try:
        return resp.json()
    except json.JSONDecodeError as exc:
        raise BrowserlessError(
            f"browserless returned non-JSON: {resp.text[:200]}"
        ) from exc


def build_residential_proxy_config(
    session_id: Optional[str] = None,
) -> Optional[Dict[str, str]]:
    """Playwright-compatible proxy config for Decodo's residential pool.

    Returns None when DECODO_USERNAME or DECODO_PASSWORD is unset, so the
    fillers can safely use:
        proxy = build_residential_proxy_config(session_id=job_id)
        context = browser.new_context(proxy=proxy) if proxy else browser.new_context()

    session_id is Decodo's stickiness key. Same job retries (refill+resubmit)
    reuse the same residential IP for `sessionduration` minutes. Different
    jobs get different IPs naturally, which avoids cross-job correlation
    that ATSes use to fingerprint.
    """
    from app.config import DECODO_USERNAME, DECODO_PASSWORD
    if not DECODO_USERNAME or not DECODO_PASSWORD:
        return None
    sid = session_id or uuid.uuid4().hex[:16]
    username = (
        f"user-{DECODO_USERNAME}"
        f"-country-us"
        f"-session-{sid}"
        f"-sessionduration-10"
    )
    return {
        "server": "http://gate.decodo.com:7000",
        "username": username,
        "password": DECODO_PASSWORD,
    }
