"""
draft_outreach MCP tool.

Wraps reply_generation.batch_generate_emails for a single contact, using
a synthesized anonymous user_profile (no resume, no Firestore lookup).
The existing personalization engine handles lead-type detection,
anti-hallucination phrasing, and signoff formatting internally.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

from app.mcp_server.cache import MCPCache
from app.mcp_server.events import MCPEvents
from app.mcp_server.rate_limit import MCPRateLimit
from app.mcp_server.responses import build_paywall
from app.mcp_server.schemas import (
    ContactRef,
    DraftOutreachInput,
    DraftOutreachOutput,
)

logger = logging.getLogger(__name__)


TOOL_NAME = "draft_outreach"
CACHE_TTL_SECONDS = 7 * 24 * 3600  # 7 days; drafts can be reused per (contact, user, intent)


def handle(
    *,
    args: dict,
    ip_hash: str,
    db: Any,
    user_ctx: dict | None = None,
) -> dict:
    started = time.monotonic()
    cache = MCPCache(db)
    limiter = MCPRateLimit(db)
    events = MCPEvents(db)

    try:
        parsed = DraftOutreachInput.model_validate(args)
    except Exception as e:
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash="",
            error=f"input_validation: {e}",
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return {"error": "invalid input", "details": str(e)}

    cache_args = parsed.model_dump()
    args_hash = cache.key(TOOL_NAME, cache_args)

    rl = limiter.check_and_increment(ip_hash, TOOL_NAME)
    if not rl.ok:
        cached_payload = cache.get(TOOL_NAME, cache_args)
        paywall = build_paywall(
            TOOL_NAME, ip_hash,
            hit_cap_type=rl.hit_cap_type or "day",
            retry_after_seconds=rl.retry_after_seconds,
        )
        if cached_payload is not None:
            out = DraftOutreachOutput.model_validate({**cached_payload, "cached": True})
            out.paywall = paywall
            events.log(
                tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
                cache_hit=True, paywall_shown=True,
                claim_token=_token_from_url(paywall.claim_url),
                duration_ms=int((time.monotonic() - started) * 1000),
            )
            return out.model_dump()
        out = DraftOutreachOutput(
            subject="",
            body="",
            contact_name=parsed.contact.name,
            cached=False,
            paywall=paywall,
        )
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            paywall_shown=True,
            claim_token=_token_from_url(paywall.claim_url),
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return out.model_dump()

    cached_payload = cache.get(TOOL_NAME, cache_args)
    if cached_payload is not None:
        out = DraftOutreachOutput.model_validate({**cached_payload, "cached": True})
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            cache_hit=True,
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return out.model_dump()

    # Cold path: synthesize the user_profile + contact dict shapes that
    # batch_generate_emails expects, then unwrap the single result.
    try:
        result = _generate_one(parsed)
    except Exception as e:
        logger.warning("[MCP draft_outreach] generation failed: %s", e, exc_info=True)
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            error=f"generation: {e}",
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return {
            "subject": "",
            "body": "",
            "contact_name": parsed.contact.name,
            "cached": False,
            "error": "draft generation failed",
        }

    out = DraftOutreachOutput(
        subject=result.get("subject", ""),
        body=result.get("body", ""),
        contact_name=parsed.contact.name,
        cached=False,
    )

    cache.set(TOOL_NAME, cache_args, out.model_dump(), CACHE_TTL_SECONDS)

    events.log(
        tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
        cache_hit=False,
        result_count=1 if out.body else 0,
        duration_ms=int((time.monotonic() - started) * 1000),
    )
    return out.model_dump()


# ── Helpers ──────────────────────────────────────────────────────────────────


def _generate_one(parsed: DraftOutreachInput) -> dict:
    """Call batch_generate_emails with a single contact and return its draft."""
    from app.services.reply_generation import batch_generate_emails

    contact_dict = _build_contact_dict(parsed.contact)
    user_profile = _build_user_profile(parsed)
    pre_parsed = _build_pre_parsed(parsed)
    template_instructions = _build_template_instructions(parsed.intent)

    drafts = batch_generate_emails(
        contacts=[contact_dict],
        resume_text="",  # anonymous: no resume
        user_profile=user_profile,
        career_interests=parsed.user_career_track or "",
        pre_parsed_user_info=pre_parsed,
        template_instructions=template_instructions,
        personal_note=parsed.personal_note or "",
        dream_companies=parsed.user_target_companies or [],
        uid=None,
    )
    if not drafts or not drafts.get(0):
        return {"subject": "", "body": ""}
    d = drafts[0]
    return {
        "subject": d.get("subject", ""),
        "body": d.get("body", ""),
    }


def _build_contact_dict(c: ContactRef) -> dict:
    first, last = _split_name(c.name)
    return {
        "FirstName": first,
        "LastName": last,
        "Title": c.title or "",
        "Company": c.company or "",
        "LinkedIn": c.linkedin_url or "",
        "College": c.education or "",
        "experience": [],
    }


def _split_name(full: str) -> tuple[str, str]:
    parts = (full or "").strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _build_user_profile(parsed: DraftOutreachInput) -> dict:
    """Anonymous user_profile shape that batch_generate_emails accepts."""
    profile: dict = {
        "name": "",
        "academics": {
            "university": parsed.user_school,
            "major": parsed.user_major or "",
            "graduationYear": parsed.user_year or "",
        },
        "professionalInfo": {
            "university": parsed.user_school,
            "careerTrack": parsed.user_career_track or "",
        },
        "goals": {
            "careerTrack": parsed.user_career_track or "",
            "dreamCompanies": parsed.user_target_companies or [],
        },
    }
    return profile


def _build_pre_parsed(parsed: DraftOutreachInput) -> dict:
    """Mimic the resumeParsed shape so personalization has school + major to hook on."""
    return {
        "university": parsed.user_school,
        "major": parsed.user_major or "",
        "year": parsed.user_year or "",
        "education": {
            "university": parsed.user_school,
            "major": parsed.user_major or "",
            "graduation": parsed.user_year or "",
        },
        "experience": [],
        "skills": {},
        "rawText": "",
    }


_INTENT_INSTRUCTIONS = {
    "coffee_chat": (
        "End the email with an explicit ask for a 15-minute coffee chat or "
        "virtual call to learn about their career path."
    ),
    "informational_interview": (
        "End the email with an explicit ask for a 20-minute informational "
        "interview, framed as wanting to learn how they got into the role."
    ),
    "referral_ask": (
        "End the email with a clear ask for a referral or introduction to "
        "someone on their team who is hiring. Be direct, not coy."
    ),
}


def _build_template_instructions(intent: str) -> str:
    return _INTENT_INSTRUCTIONS.get(intent, _INTENT_INSTRUCTIONS["coffee_chat"])


def _token_from_url(url: str) -> Optional[str]:
    if not url or "token=" not in url:
        return None
    return url.split("token=", 1)[1].split("&", 1)[0]
