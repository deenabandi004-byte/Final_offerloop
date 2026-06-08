"""
preview_search — Loops Setup V2 "Who you'd reach" inline preview.

The V2 wizard surfaces ~5–8 sample contacts on Step 01 so the student
sees what their brief would actually produce *before* they hit Start.
Backed by the same PDL search the real Loop cycles use, capped at 8
results, with no email verification or post-filter pipeline — speed
matters more than perfection for a preview.

Caching strategy (two layers):
  - 30-day Firestore cache: provided by pdl_client.search_contacts_from_prompt.
    Same query within 30 days = 0 PDL credits. Catches cross-session reuse.
  - Session-scoped cache: provided by the caller (route handler) using a
    request_id keyed on hash(briefParsed). Catches the wizard's typical
    pattern of the user re-editing chips and re-firing the preview.

The route handler can pass session_cache (a dict) to short-circuit the
PDL call entirely on a cache hit. The session_cache key is computed
here so the hash semantics live alongside the search.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import TypedDict

from app.services.pdl_client import search_contacts_from_prompt

logger = logging.getLogger(__name__)

PREVIEW_LIMIT = 8


class PreviewContact(TypedDict):
    name: str
    title: str
    company: str
    school: str | None
    linkedinUrl: str | None
    sameSchool: bool


def _cap_str(value, max_chars: int = 120) -> str:
    s = (str(value) if value is not None else "").strip()
    return s[:max_chars]


def cache_key(parsed: dict | None) -> str:
    """Stable hash of the parsed-brief fields that affect the search.

    Excludes targetCount / emailPurpose / constraints / mode which the
    preview ignores. Sorting + lowercasing the four target arrays keeps
    the key stable across UI re-ordering (chip insertion order varies
    with parse output)."""
    p = parsed or {}

    def norm_list(v) -> list[str]:
        if not isinstance(v, list):
            return []
        out = sorted({str(x).strip().lower() for x in v if str(x).strip()})
        return out

    payload = {
        "companies": norm_list(p.get("companies")),
        "industries": norm_list(p.get("industries")),
        "roles": norm_list(p.get("roles")),
        "locations": norm_list(p.get("locations")),
    }
    blob = json.dumps(payload, sort_keys=True).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:16]


def _has_signal(parsed: dict | None) -> bool:
    """Refuse to burn a PDL call when the brief has nothing concrete to
    search for. Returning [] is the right answer; the wizard renders the
    "Add a company or role to see who we'd reach" empty state."""
    p = parsed or {}
    return any(
        isinstance(p.get(k), list) and len(p.get(k) or []) > 0
        for k in ("companies", "industries", "roles")
    )


def preview_targets(
    parsed_brief: dict | None,
    user_profile: dict | None = None,
    max_results: int = PREVIEW_LIMIT,
    session_cache: dict[str, list[PreviewContact]] | None = None,
) -> list[PreviewContact]:
    """Return up to `max_results` sample contacts for the given brief.

    Empty input or empty parsed-brief → returns [] without burning a PDL
    call. PDL exceptions are caught and surfaced as []; the wizard shows
    the "Preview unavailable" fallback instead of crashing the page.
    """
    if not _has_signal(parsed_brief):
        return []

    key = cache_key(parsed_brief)
    if session_cache is not None and key in session_cache:
        return session_cache[key][:max_results]

    # PDL search expects the same shape briefParsed already has. Cap the
    # max_contacts at PREVIEW_LIMIT defensively — never let a caller burn
    # 50 credits on a preview by passing max_results=50.
    capped = max(1, min(max_results, PREVIEW_LIMIT))

    try:
        result = search_contacts_from_prompt(
            parsed_prompt=parsed_brief or {},
            max_contacts=capped,
            exclude_keys=set(),
            user_profile=user_profile or {},
        )
    except Exception:
        logger.exception("preview_search: PDL search raised")
        return []

    # search_contacts_from_prompt returns (contacts, retry_level, adjacency, metadata)
    contacts_raw = result[0] if isinstance(result, tuple) and result else []

    user_school = ((user_profile or {}).get("university") or "").strip().lower()
    preview: list[PreviewContact] = []
    for c in contacts_raw[:capped]:
        if not isinstance(c, dict):
            continue
        name = _cap_str(
            c.get("full_name") or c.get("name") or c.get("first_name") or ""
        )
        title = _cap_str(c.get("title") or c.get("job_title") or "")
        company = _cap_str(
            c.get("company") or c.get("job_company_name") or c.get("companyName") or ""
        )
        school = c.get("school") or c.get("education_school") or c.get("university")
        if isinstance(school, list):
            school = (school[0] if school else None)
        school = _cap_str(school) if school else None
        linkedin = c.get("linkedin_url") or c.get("linkedinUrl") or c.get("linkedin") or None
        if linkedin and not isinstance(linkedin, str):
            linkedin = None

        same_school = bool(
            user_school
            and school
            and (school.lower() == user_school or user_school in school.lower())
        )
        if not (name or title or company):
            continue
        preview.append({
            "name": name or "—",
            "title": title or "—",
            "company": company or "",
            "school": school or None,
            "linkedinUrl": linkedin,
            "sameSchool": same_school,
        })

    if session_cache is not None:
        session_cache[key] = preview
    return preview
