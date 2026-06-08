"""
brief_proposer — draft a starting Loop brief from the user's resume + profile.

The V2 Loops setup wizard opens with a textarea pre-filled by this service
so students never see a blank page. The output is a single natural-language
sentence plus matching chip suggestions (companies / roles / industries /
locations). The student edits either side — we make no commitment until
they hit "Start Loop."

Contract:
  propose_brief(resume_text=..., profile=...) -> ProposedBrief

  ProposedBrief is JSON-serializable. status is "ok" | "empty" | "failed".
  - "empty"  : neither resume_text nor profile carried any signal; we
                returned an empty proposal WITHOUT calling Claude.
  - "failed" : Claude was unavailable, returned non-JSON, or raised. The
                caller surfaces this so the wizard can show "couldn't
                suggest right now — type your brief or pick chips."
  - "ok"     : sentence + at least one of the chip lists is populated.

This module is a pure function over its inputs. The Firestore read lives
in the route handler so tests can mock Claude without faking Firestore.
"""
from __future__ import annotations

import json
import logging
from typing import TypedDict

from app.services.openai_client import get_anthropic_client

logger = logging.getLogger(__name__)

# Locked at Sonnet — fast enough for an interactive wizard, smart enough
# to make a usable draft from a thin onboarding profile. Move to a newer
# Sonnet ID when one ships; don't switch to Opus (latency budget here is
# ~2s wall-clock to keep the wizard's first paint snappy).
PROPOSER_MODEL = "claude-sonnet-4-6"

# How much of the resume we trust into the prompt. Past ~6000 chars the
# model is just paying for tokens that re-state the early bullets.
MAX_RESUME_CHARS = 6000

# How much of any user-supplied profile string we pass through. Caps the
# blast radius if a malicious profile doc was written manually.
MAX_PROFILE_FIELD_CHARS = 200

ProposeStatus = str  # "ok" | "empty" | "failed"


class ProposedBrief(TypedDict):
    sentence: str
    companies: list[str]
    roles: list[str]
    industries: list[str]
    locations: list[str]
    status: ProposeStatus


EMPTY_PROPOSAL: ProposedBrief = {
    "sentence": "",
    "companies": [],
    "roles": [],
    "industries": [],
    "locations": [],
    "status": "empty",
}


SYSTEM_PROMPT = """You draft a Loop brief for a college student using Offerloop, an autonomous networking tool.

A Loop brief is one natural-sounding sentence describing who the student wants to reach (companies, roles, industries) and why. Examples of good briefs:
  - "I'm looking for summer SWE internships at fintech startups in NYC."
  - "Reaching out to product managers at Stripe, Plaid, and Mercury for advice on breaking in."
  - "Want to chat with USC alumni working in management consulting at MBB firms."

You're given the student's resume highlights and onboarding profile. From them, draft:
  1. ONE natural-language sentence the student would actually say. Write in first person, no jargon, no "as a student passionate about..." filler. Keep it under 25 words.
  2. The chip lists that match the sentence — companies, roles, industries, locations. Use proper canonical names ("Morgan Stanley" not "MS"). Leave a list empty if the resume/profile doesn't justify a specific value.

Rules:
  - Don't invent companies the student didn't show interest in. If the resume mentions Goldman Sachs, you can suggest it; if it doesn't, don't.
  - If the profile names a careerTrack (e.g. "Investment Banking", "Consulting", "Tech"), translate it into the appropriate industries + canonical companies for that track.
  - If the profile is empty AND the resume is empty, return empty arrays + an empty sentence.
  - Locations come from the resume/profile, not invented. "Remote" only if mentioned.
  - Return STRICT JSON matching:
      {"sentence": "...", "companies": [...], "roles": [...], "industries": [...], "locations": [...]}
    No prose, no markdown, no leading explanation."""


def propose_brief(
    *,
    resume_text: str | None = None,
    profile: dict | None = None,
) -> ProposedBrief:
    """Draft a starting Loop brief from the user's resume + onboarding profile.

    See module docstring for the contract.
    """
    resume_clean = (resume_text or "").strip()
    if len(resume_clean) > MAX_RESUME_CHARS:
        resume_clean = resume_clean[:MAX_RESUME_CHARS]

    profile_clean = _clean_profile(profile or {})

    if not resume_clean and not profile_clean:
        # Nothing to work from — don't burn a Claude call.
        return dict(EMPTY_PROPOSAL)  # type: ignore[return-value]

    client = get_anthropic_client()
    if not client:
        logger.warning("brief_proposer: Anthropic client unavailable")
        return {**EMPTY_PROPOSAL, "status": "failed"}

    user_msg = _build_user_message(resume_clean, profile_clean)

    raw = "{}"
    try:
        resp = client.messages.create(
            model=PROPOSER_MODEL,
            max_tokens=600,
            temperature=0.2,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw = _extract_text(resp)
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.exception("brief_proposer: invalid JSON from Claude, raw=%s", raw[:200])
        return {**EMPTY_PROPOSAL, "status": "failed"}
    except Exception:
        logger.exception("brief_proposer: Claude call failed")
        return {**EMPTY_PROPOSAL, "status": "failed"}

    return _normalize(parsed)


# ── Helpers ─────────────────────────────────────────────────────────────


def _clean_profile(profile: dict) -> dict:
    """Pull the fields the prompt actually uses; cap each one defensively."""
    keys = ("university", "careerTrack", "graduationYear", "year", "major", "interests")
    out: dict = {}
    for k in keys:
        v = profile.get(k)
        if isinstance(v, str):
            s = v.strip()
            if s:
                out[k] = s[:MAX_PROFILE_FIELD_CHARS]
        elif isinstance(v, list):
            items = [str(x).strip()[:MAX_PROFILE_FIELD_CHARS] for x in v if str(x).strip()]
            if items:
                out[k] = items[:10]
    return out


def _build_user_message(resume_text: str, profile: dict) -> str:
    """Assemble the per-request user message. Profile + resume are passed as
    a delimited block so the model can tell them apart from the system prompt."""
    profile_block = (
        json.dumps(profile, ensure_ascii=False, indent=2) if profile else "{}"
    )
    resume_block = resume_text if resume_text else "(no resume on file)"
    return (
        "<profile>\n"
        f"{profile_block}\n"
        "</profile>\n\n"
        "<resume_highlights>\n"
        f"{resume_block}\n"
        "</resume_highlights>"
    )


def _extract_text(resp) -> str:
    """Pull the text body out of an Anthropic Messages response. Falls back
    to '{}' if the shape is unexpected so JSON parsing surfaces a clean
    failure instead of an AttributeError."""
    try:
        content = resp.content
        if isinstance(content, list) and content:
            first = content[0]
            text = getattr(first, "text", None)
            if isinstance(text, str):
                return text
            if isinstance(first, dict):
                return str(first.get("text") or "{}")
    except Exception:
        pass
    return "{}"


def _normalize(raw: dict) -> ProposedBrief:
    """Coerce Claude output into ProposedBrief. Tolerates missing keys."""

    def as_str_list(v) -> list[str]:
        if not isinstance(v, list):
            return []
        out: list[str] = []
        seen: set[str] = set()
        for item in v:
            if not isinstance(item, str):
                continue
            s = item.strip()
            if s and s.lower() not in seen:
                seen.add(s.lower())
                out.append(s)
        return out

    sentence = raw.get("sentence")
    if not isinstance(sentence, str):
        sentence = ""
    sentence = sentence.strip()[:400]

    companies = as_str_list(raw.get("companies"))[:10]
    roles = as_str_list(raw.get("roles"))[:10]
    industries = as_str_list(raw.get("industries"))[:10]
    locations = as_str_list(raw.get("locations"))[:10]

    has_chips = bool(companies or roles or industries or locations)
    status: ProposeStatus = "ok" if (sentence or has_chips) else "empty"

    return {
        "sentence": sentence,
        "companies": companies,
        "roles": roles,
        "industries": industries,
        "locations": locations,
        "status": status,
    }
