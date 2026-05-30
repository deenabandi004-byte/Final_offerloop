"""
Loop notifications — digest assembly, unsubscribe tokens, send dispatch.

Scope of this file (PR2 scaffold):
  - HMAC-signed unsubscribe tokens (build + verify, expiry-checked)
  - Jinja2 daily digest rendering (html + text)
  - `send_daily_digest_email` — flag-gated dispatch through
    `notification_adapter.send(Channel.EMAIL, ...)`
  - `assess_cycle_results` — stubbed `[]`; PR3 implements scoring
  - `idempotency_key` — `cycle_id:user_id` (NOT `+send_day`; midnight-spanning
    collision per spec review)

This module never short-circuits when called — the `LOOPS_ALERT_EMAILS_ENABLED`
flag is the gate, and `send_daily_digest_email` returns a structured
`SendResult(success=False, error_code="disabled")` so PR3 callers can branch
without try/except.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app import config
from app.services.notification_adapter import Channel, SendResult, send as adapter_send

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "templates",
    "notifications",
)

_jinja_env = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html", "html.j2"]),
    trim_blocks=False,
    lstrip_blocks=False,
)


# ── Unsubscribe tokens ───────────────────────────────────────────────────────

_TOKEN_DELIM = "|"


def _secret_bytes() -> bytes:
    """FLASK_SECRET as bytes; default 'dev' in non-prod is fine here."""
    return (config.FLASK_SECRET or "dev").encode("utf-8")


def _sign(payload: str) -> str:
    return hmac.new(_secret_bytes(), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def build_unsubscribe_token(uid: str, now: Optional[datetime] = None) -> str:
    """Mint a URL-safe HMAC-signed unsubscribe token for `uid`.

    Token payload: `uid|expires_at_iso|signature_hex`, base64-urlsafe encoded.
    The signature is HMAC-SHA256 of `uid|expires_at_iso` using FLASK_SECRET.
    Tokens expire after LOOPS_UNSUBSCRIBE_TOKEN_TTL_DAYS (default 30).
    """
    if not uid:
        raise ValueError("uid required")
    issued = now or datetime.now(timezone.utc)
    expires_at = issued + timedelta(days=config.LOOPS_UNSUBSCRIBE_TOKEN_TTL_DAYS)
    expires_iso = expires_at.replace(microsecond=0).isoformat()
    body = f"{uid}{_TOKEN_DELIM}{expires_iso}"
    sig = _sign(body)
    raw = f"{body}{_TOKEN_DELIM}{sig}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def verify_unsubscribe_token(token: str, now: Optional[datetime] = None) -> Optional[str]:
    """Return the uid if the token is valid + unexpired + signature matches.

    Returns None for malformed, tampered, forged (wrong secret), or expired
    tokens. Constant-time comparison via `hmac.compare_digest`.
    """
    if not token:
        return None
    try:
        # restore padding
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except Exception:
        return None

    parts = raw.split(_TOKEN_DELIM)
    if len(parts) != 3:
        return None

    uid, expires_iso, sig = parts
    expected_sig = _sign(f"{uid}{_TOKEN_DELIM}{expires_iso}")
    if not hmac.compare_digest(expected_sig, sig):
        return None

    try:
        expires_at = datetime.fromisoformat(expires_iso)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    except ValueError:
        return None

    current = now or datetime.now(timezone.utc)
    if current >= expires_at:
        return None

    return uid


# ── Render ───────────────────────────────────────────────────────────────────


def render_daily_digest(
    uid: str,
    items: list[dict],
    unsubscribe_url: str = "",
) -> tuple[str, str]:
    """Render the daily digest as (html, text).

    `items` shape: list of dicts with keys `company`, `title`, `context`,
    `loop_id`, `result_kind` ∈ {"job", "contact", "hm"}. Empty `items` is
    allowed — the caller is responsible for skip-sending empty digests.
    `loop_url` is an optional per-item deep link; templates handle absence.
    """
    ctx = {
        "uid": uid,
        "items": items or [],
        "unsubscribe_url": unsubscribe_url or "",
    }
    html = _jinja_env.get_template("daily_digest.html.j2").render(**ctx)
    text = _jinja_env.get_template("daily_digest.txt.j2").render(**ctx)
    return html, text


# ── Send ─────────────────────────────────────────────────────────────────────


def send_daily_digest_email(
    uid: str,
    recipient_email: str,
    items: list[dict],
    unsubscribe_url: str,
) -> SendResult:
    """Send the daily digest, flag-gated by LOOPS_ALERT_EMAILS_ENABLED.

    This is the only public send entry point in PR2. Returns
    `SendResult(success=False, error_code="disabled")` when the flag is off
    so PR3's cycle pipeline caller can log a structured no-op instead of
    blowing up. Adds a `List-Unsubscribe` header (RFC 2369) for one-click
    inbox unsubscribe.
    """
    if not config.LOOPS_ALERT_EMAILS_ENABLED:
        logger.info("Loop digest send skipped (flag disabled) uid=%s", uid)
        return SendResult(
            success=False,
            channel=Channel.EMAIL,
            recipient=recipient_email,
            error_code="disabled",
        )

    html, text = render_daily_digest(uid, items, unsubscribe_url)
    subject = "Your loop digest"
    headers = {}
    if unsubscribe_url:
        headers["List-Unsubscribe"] = f"<{unsubscribe_url}>"

    return adapter_send(
        Channel.EMAIL,
        recipient=recipient_email,
        subject=subject,
        html_body=html,
        text_body=text,
        headers=headers,
    )


# ── Stubs for PR3 ────────────────────────────────────────────────────────────


def assess_cycle_results(cycle_id: str) -> list[dict]:
    """PR3 will implement: score cycle results, build the digest queue.

    Kept here as a no-op stub so PR3's wiring can land as a one-file change
    (this function's body) without re-routing imports.
    """
    return []


def idempotency_key(cycle_id: str, uid: str) -> str:
    """Deduplication key for digest sends.

    Note: deliberately does NOT include `send_day` — that would let a single
    cycle's digest send twice across the user's midnight boundary. Per spec
    review.
    """
    return f"{cycle_id}:{uid}"
