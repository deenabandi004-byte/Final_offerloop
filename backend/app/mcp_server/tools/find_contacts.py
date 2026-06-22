"""
find_contacts MCP tool.

Wraps pdl_client.search_contacts_from_prompt + warmth_scoring. Result count
is clamped per tier in tier_caps.find_contacts_cap (anonymous + free signed-in
= 5, pro = 8, elite = 15). The schema permits up to 25 to avoid a migration
when caps are raised.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

from app.mcp_server.budget import MCPBudget
from app.mcp_server.cache import MCPCache
from app.mcp_server.events import MCPEvents
from app.mcp_server.rate_limit import MCPRateLimit
from app.mcp_server.responses import build_paywall
from app.mcp_server.schemas import Contact, FindContactsInput, FindContactsOutput
from app.mcp_server.tier_caps import cap_message, find_contacts_cap

logger = logging.getLogger(__name__)


TOOL_NAME = "find_contacts"
CACHE_TTL_SECONDS = 7 * 24 * 3600  # 7 days


# Cold result is ~1 PDL credit per record returned plus a small over-fetch
# buffer inside pdl_client. Five-record query averages 6 credits.
PDL_CREDITS_PER_QUERY = 6


def handle(
    *,
    args: dict,
    ip_hash: str,
    db: Any,
    user_ctx: dict | None = None,
) -> dict:
    """Run the find_contacts pipeline. Always returns a dict, never raises.

    Caller is responsible for serializing the dict to the MCP response.
    """
    started = time.monotonic()
    cache = MCPCache(db)
    limiter = MCPRateLimit(db)
    budget = MCPBudget(db)
    events = MCPEvents(db)

    # 1. Parse input.
    try:
        parsed = FindContactsInput.model_validate(args)
    except Exception as e:
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash="",
            error=f"input_validation: {e}",
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return {"error": "invalid input", "details": str(e)}

    # 2. Handler-enforced tier cap (schema permits up to 25; handler clamps
    # per tier_caps.find_contacts_cap so we can raise tier caps without a
    # schema migration).
    requested = parsed.count
    tier_cap = find_contacts_cap(user_ctx)
    effective_count = min(requested, tier_cap)

    cache_args = parsed.model_dump()
    cache_args["count"] = effective_count  # cache by effective, not requested
    args_hash = cache.key(TOOL_NAME, cache_args)

    # 3. Rate limit check.
    rl = limiter.check_and_increment(ip_hash, TOOL_NAME)
    if not rl.ok:
        # Try cached fallback before paywall lands.
        cached_payload = cache.get(TOOL_NAME, cache_args)
        paywall = build_paywall(
            TOOL_NAME, ip_hash,
            hit_cap_type=rl.hit_cap_type or "day",
            retry_after_seconds=rl.retry_after_seconds,
        )
        out = _from_cache_or_empty(parsed.company, cached_payload, paywall)
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            cache_hit=cached_payload is not None,
            paywall_shown=True,
            claim_token=_token_from_url(paywall.claim_url),
            result_count=len(out.contacts),
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return out.model_dump()

    # 4. Cache lookup.
    cached_payload = cache.get(TOOL_NAME, cache_args)
    if cached_payload is not None:
        out = FindContactsOutput.model_validate({**cached_payload, "cached": True})
        if requested > effective_count:
            out.truncated_to = effective_count
            out.note = cap_message(user_ctx, effective_count)
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            cache_hit=True,
            result_count=len(out.contacts),
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return out.model_dump()

    # 5. Budget gate. If over-budget, return cached-only (we already
    # missed the cache above, so this becomes an empty result + CTA).
    if not budget.can_spend(PDL_CREDITS_PER_QUERY):
        paywall = build_paywall(
            TOOL_NAME, ip_hash,
            hit_cap_type="budget",
            retry_after_seconds=24 * 3600,
            message=(
                "Showing cached results only right now. Sign up free to keep "
                "querying live."
            ),
        )
        out = FindContactsOutput(
            contacts=[],
            company=parsed.company,
            cached=True,
            note="Daily live-query budget exhausted; no cached match for this query.",
            paywall=paywall,
        )
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            paywall_shown=True,
            claim_token=_token_from_url(paywall.claim_url),
            result_count=0,
            duration_ms=int((time.monotonic() - started) * 1000),
            error="budget_exhausted",
        )
        return out.model_dump()

    # 6. Cold path: PDL search + warmth scoring.
    try:
        contacts = _run_pdl_search(parsed, effective_count)
        warmth = _score_warmth(parsed, contacts)
        # Stamp warmth metadata onto the raw PDL dicts so when we persist
        # to My Network the warmth fields land on the Firestore doc.
        for i, c in enumerate(contacts):
            w = warmth.get(i) or {}
            if w.get("score") is not None:
                c["warmth_score"] = w.get("score")
                c["warmth_tier"] = w.get("tier") or ""
                c["warmth_label"] = w.get("label") or ""
                c["warmth_signals"] = w.get("signals") or []
        out_contacts = _build_contacts(contacts, warmth)
    except Exception as e:
        logger.warning("[MCP find_contacts] cold path failed: %s", e, exc_info=True)
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            error=f"pdl_or_warmth: {e}",
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return {
            "contacts": [],
            "company": parsed.company,
            "cached": False,
            "note": "Live search failed. Please try again shortly.",
        }

    budget.spend(PDL_CREDITS_PER_QUERY)

    # 7. Persist to My Network for authed callers. Mirrors the website's
    # Find People flow so contacts discovered in Claude show up on
    # offerloop.ai with an mcpUnseen=true flag the UI uses to render
    # the first-time orange highlight.
    uid = (user_ctx or {}).get("uid") if user_ctx else None
    if uid:
        try:
            from app.mcp_server.persist import persist_contacts
            persist_contacts(uid=uid, db=db, contacts=contacts, source="mcp")
        except Exception as e:
            # Persistence failure must never break the user-facing response.
            logger.warning("[MCP find_contacts] persist failed (non-fatal): %s", e)

    out = FindContactsOutput(
        contacts=out_contacts,
        company=parsed.company,
        cached=False,
    )
    if requested > effective_count:
        out.truncated_to = effective_count
        out.note = cap_message(user_ctx, effective_count)

    cache.set(TOOL_NAME, cache_args, out.model_dump(), CACHE_TTL_SECONDS)

    events.log(
        tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
        cache_hit=False,
        result_count=len(out.contacts),
        duration_ms=int((time.monotonic() - started) * 1000),
    )
    return out.model_dump()


# ── Helpers ──────────────────────────────────────────────────────────────────


def _run_pdl_search(parsed: FindContactsInput, count: int) -> list[dict]:
    """Synthesize a parsed_prompt and invoke pdl_client.search_contacts_from_prompt.

    We skip the LLM-based prompt parser (parse_search_prompt_structured) and
    build the structured dict directly from typed MCP inputs.
    """
    from app.services.pdl_client import search_contacts_from_prompt

    parsed_prompt = {
        "companies": [{"name": parsed.company}],
        "schools": [parsed.school] if parsed.school else [],
        "title_variations": _build_title_variations(parsed.role, parsed.career_track),
        "locations": [],
        "industries": [],
    }

    user_profile = _synthesize_user_profile(parsed)

    contacts, _retry_level, _already_saved, _adjacency = search_contacts_from_prompt(
        parsed_prompt,
        count,
        exclude_keys=None,
        user_profile=user_profile,
    )
    return contacts or []


def _build_title_variations(role: Optional[str], career_track: Optional[str]) -> list[str]:
    variations: list[str] = []
    if role:
        variations.append(role)
    if career_track and career_track not in variations:
        variations.append(career_track)
    return variations


def _synthesize_user_profile(parsed: FindContactsInput) -> dict:
    """Minimal Firestore-user-doc shape that warmth scoring + post-filters
    can read. Anonymous v1: we only have school + role + career_track from
    the MCP call, no resume, no goals.
    """
    profile: dict = {}
    if parsed.school:
        profile["academics"] = {"university": parsed.school}
        profile["professionalInfo"] = {"university": parsed.school}
    if parsed.career_track:
        profile.setdefault("goals", {})["careerTrack"] = parsed.career_track
    return profile


def _score_warmth(parsed: FindContactsInput, contacts: list[dict]) -> dict:
    """Run warmth scoring against the synthesized user profile."""
    if not contacts or not parsed.school:
        return {}
    from app.utils.warmth_scoring import score_contacts_for_email
    user_profile = _synthesize_user_profile(parsed)
    try:
        return score_contacts_for_email(user_profile, contacts) or {}
    except Exception as e:
        logger.warning("[MCP find_contacts] warmth scoring failed: %s", e)
        return {}


def _build_contacts(raw_contacts: list[dict], warmth: dict) -> list[Contact]:
    out: list[Contact] = []
    for idx, c in enumerate(raw_contacts):
        w = warmth.get(idx) or {}
        signals = w.get("signals") or []
        matched_school = _matched_school_from_signals(signals)
        out.append(Contact(
            name=_compose_name(c),
            title=c.get("Title") or c.get("JobTitle") or None,
            company=c.get("Company") or c.get("company") or None,
            linkedin_url=c.get("LinkedIn") or c.get("linkedin_url") or None,
            education=_compose_education(c, matched_school=matched_school),
            recent_career_move=_compose_recent_move(c),
            personalization_hook=w.get("label") or _fallback_hook(c, w),
            relationship_type=_relationship_type_from_signals(signals),
            warmth=w.get("tier"),
            email=_pick_recipient_email(c),
        ))
    return out


def _pick_recipient_email(c: dict) -> Optional[str]:
    """Best-available email for this contact, mirroring gmail_client.
    _select_recipient_email's WorkEmail > Email > PersonalEmail preference.

    Low-confidence emails (PDL `EmailSource` in {pattern, domain_generated,
    pdl_fallback, hunter_finder_risky, neverbounce_acceptall}) are NOT
    filtered here — gmail_client.create_gmail_draft_for_user has its own
    guard that skips low-confidence drafts. Surfacing the email anyway
    lets Claude tell the user "I have an email but it's a guess" instead
    of silently omitting it.
    """
    work = (c.get("WorkEmail") or "").strip()
    if work and work != "Not available" and "@" in work:
        return work
    primary = (c.get("Email") or "").strip()
    if primary and "@" in primary and not primary.endswith("@domain.com"):
        return primary
    personal = (c.get("PersonalEmail") or "").strip()
    if personal and personal != "Not available" and "@" in personal:
        return personal
    return None


def _compose_name(c: dict) -> str:
    first = (c.get("FirstName") or "").strip()
    last = (c.get("LastName") or "").strip()
    name = " ".join(p for p in (first, last) if p).strip()
    return name or (c.get("full_name") or c.get("Name") or "Unknown")


def _compose_education(c: dict, *, matched_school: Optional[str] = None) -> Optional[str]:
    """Return the contact's displayed education.

    When warmth scoring fires the same_university signal, `matched_school`
    is set to the school that triggered the match. In that case, surface
    THAT school's entry (with degree + year context from EducationTop)
    rather than the contact's `College` field. PDL sets `College` to the
    chronological-first non-high-school entry (typically undergrad), so
    for a contact who did undergrad at BYU and a master's at USC, the
    raw `College` says BYU but the alumni connection that warmth detected
    is the USC degree. Without this override, the displayed education
    contradicts the relationship_type=alumni tag.

    When no same_university signal fired, fall back to the existing
    `College`-only display.
    """
    if matched_school:
        override = _format_matched_education_entry(c, matched_school)
        if override:
            return override

    college = (c.get("College") or "").strip()
    if not college:
        return None
    return college


def _matched_school_from_signals(signals: list[dict]) -> Optional[str]:
    """Return the matched school name when same_university signal is present.

    The detail payload format varies: warmth_scoring.py emits it as a string
    (just the school name), but defensively handle a dict shape too
    ({"university": ..., "university_short": ..., "mascot": ...}) since
    that's how detect_commonality builds it before assignment.
    """
    for s in signals:
        if (s.get("signal") or "").strip() != "same_university":
            continue
        d = s.get("detail")
        if isinstance(d, dict):
            uni = (d.get("university") or "").strip()
            if uni:
                return uni
        elif isinstance(d, str):
            uni = d.strip()
            if uni:
                return uni
    return None


def _format_matched_education_entry(c: dict, matched_school: str) -> Optional[str]:
    """Look up the matched school's entry in `EducationTop` to preserve
    degree + year context (e.g. "University of Southern California - MBA
    (2022 - 2024)").

    `EducationTop` is the pre-formatted education history that
    pdl_client._format_pdl_contact builds (line 1442-1445), of the form
    "School - Degree (start - end); School - Degree (start - end)".
    We split on '; ' and find the entry whose school portion matches
    `matched_school` via the same variant-set logic personalization.py
    uses (get_university_variants intersection). When EducationTop is
    missing or no entry matches, return just `matched_school` so the
    displayed value at least names the right school, even without degree
    context.
    """
    matched_school = (matched_school or "").strip()
    if not matched_school:
        return None

    edu_top = (c.get("EducationTop") or "").strip()
    if not edu_top or edu_top.lower() == "not available":
        return matched_school

    try:
        from app.utils.users import get_university_variants
        matched_variants = get_university_variants(matched_school)
    except Exception:
        matched_variants = set()

    matched_lower = matched_school.lower()

    for entry in edu_top.split(";"):
        entry = entry.strip()
        if not entry:
            continue
        # Each entry is "School Name - Degree (start - end)"; pull off
        # the school portion before the degree separator.
        school_portion = entry.split(" - ", 1)[0].strip()
        if not school_portion:
            continue
        if matched_variants:
            if matched_variants & get_university_variants(school_portion):
                return entry
        elif matched_lower in school_portion.lower():
            return entry

    return matched_school


def _compose_recent_move(c: dict) -> Optional[str]:
    # PDL contacts include experience array; the route-side formatter
    # already produces a "Company / Title" Most-Recent display. For v1 we
    # surface the primary job concisely without a dedicated formatter.
    title = (c.get("Title") or "").strip()
    company = (c.get("Company") or "").strip()
    if title and company:
        return f"{title} at {company}"
    return None


def _fallback_hook(c: dict, w: dict) -> Optional[str]:
    """When warmth scoring didn't produce a label, build a tiny role hook."""
    title = (c.get("Title") or "").strip()
    company = (c.get("Company") or "").strip()
    if title and company:
        return f"{title} at {company}"
    return None


_SIGNAL_TO_REL = {
    "dream_company": "dream_company",
    "same_university": "alumni",
    "same_major": "shared_major",
    "same_past_company": "shared_employer",
    "same_hometown": "shared_hometown",
    "recently_joined": "recent_transition",
    "career_transition": "career_path",
    "target_industry_match": "role_match",
}


def _relationship_type_from_signals(signals: list[dict]) -> Optional[str]:
    if not signals:
        return None
    for s in signals:
        kind = (s.get("signal") or "").strip()
        if kind in _SIGNAL_TO_REL:
            return _SIGNAL_TO_REL[kind]
    return None


def _from_cache_or_empty(
    company: str,
    cached_payload: Optional[dict],
    paywall,
) -> FindContactsOutput:
    if cached_payload is not None:
        out = FindContactsOutput.model_validate({**cached_payload, "cached": True})
        out.paywall = paywall
        return out
    return FindContactsOutput(
        contacts=[],
        company=company,
        cached=False,
        note="You've hit a free tier limit. Sign up to keep searching.",
        paywall=paywall,
    )


def _token_from_url(url: str) -> Optional[str]:
    if not url or "token=" not in url:
        return None
    return url.split("token=", 1)[1].split("&", 1)[0]
