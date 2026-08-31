"""Slim public people-search orchestrator.

Hits PDL /person/search with a minimal company + role filter and
returns up to N normalized contact dicts. Intentionally does NOT
import or call recruiter_finder.py, Hunter, or the smart-location
strategies used by the paid Find People flow.

Public API:
    search_public_people(company, role, limit=5) -> list[dict]

Each result dict has the shape consumed by the frontend widget:
    {
      "name": "Jane Doe",
      "first_name": "Jane",
      "last_name": "Doe",
      "title": "Investment Banking Analyst",
      "company": "Goldman Sachs",
      "school": "University of Southern California",
      "linkedin": "https://www.linkedin.com/in/jane-doe",
    }
"""
from __future__ import annotations

import logging
from typing import Any

import requests

from app.config import PDL_BASE_URL, PEOPLE_DATA_LABS_API_KEY
from app.services.pdl_client import clean_company_name

logger = logging.getLogger(__name__)


def _build_query(company: str, role: str) -> dict:
    """Build a permissive PDL query: company + role text, must have a
    LinkedIn URL. No location filter, no level filter, no Hunter, no
    seniority broadening. The widget shows 5 cards; recall > precision.
    """
    role_clean = (role or "").strip().lower()
    company_clean = (company or "").strip().lower()

    must: list[dict] = []
    if company_clean:
        # match (not match_phrase) is more forgiving on aliases like
        # "Goldman" vs "Goldman Sachs". The cleaner already canonicalizes
        # common shorthand; this match is the secondary fuzzy layer.
        must.append({"match": {"job_company_name": company_clean}})
    if role_clean:
        must.append({"match": {"job_title": role_clean}})
    # Drop rows without a LinkedIn URL — every result card needs one.
    must.append({"exists": {"field": "linkedin_url"}})

    return {"bool": {"must": must}}


_ROMAN_NUMERALS = {"i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"}
_LOWERCASE_PARTICLES = {"of", "the", "and", "for", "in", "on", "at", "to", "de", "la", "von", "van", "da"}


def _smart_title(value: str) -> str:
    """Title-case a string while preserving common acronyms (IB, MBA, USC),
    lowercase particles ("of", "the"), and roman numerals. PDL returns
    everything lowercase; doing this once here keeps every consumer
    (widget, CSV, future surfaces) from having to repeat the logic."""
    if not value:
        return ""
    words = value.strip().split()
    out: list[str] = []
    for i, raw in enumerate(words):
        w = raw.strip()
        if not w:
            continue
        lower = w.lower()
        # Preserve all-caps tokens 2-5 chars (USC, MBA, IB, CPA, JPMC).
        if w.isupper() and 2 <= len(w) <= 5:
            out.append(w)
            continue
        if lower in _ROMAN_NUMERALS:
            out.append(lower.upper())
            continue
        if i > 0 and lower in _LOWERCASE_PARTICLES:
            out.append(lower)
            continue
        if "-" in w:
            out.append("-".join(p.capitalize() for p in w.split("-")))
            continue
        if "'" in w:
            # O'Brien, D'Souza, etc.
            head, _, tail = w.partition("'")
            out.append(f"{head.capitalize()}'{tail.capitalize()}")
            continue
        out.append(w.capitalize())
    return " ".join(out)


def _extract_slim(person: dict) -> dict | None:
    """Pull only the five fields the widget renders. Never calls Hunter,
    never normalizes emails, never touches the paid extractor.

    Returns None if the record is missing the bare-minimum fields
    (name + linkedin), since the widget can't render a useful card.
    """
    if not isinstance(person, dict):
        return None

    first = (person.get("first_name") or "").strip()
    last = (person.get("last_name") or "").strip()
    if not first and not last:
        return None

    experience = person.get("experience") or []
    title = ""
    company_name = ""
    if isinstance(experience, list) and experience:
        current = experience[0] if isinstance(experience[0], dict) else {}
        title_info = current.get("title") or {}
        company_info = current.get("company") or {}
        if isinstance(title_info, dict):
            title = (title_info.get("name") or "").strip()
        if isinstance(company_info, dict):
            company_name = (company_info.get("name") or "").strip()

    education = person.get("education") or []
    school = ""
    if isinstance(education, list):
        for edu in education:
            if not isinstance(edu, dict):
                continue
            school_info = edu.get("school") or {}
            if not isinstance(school_info, dict):
                continue
            name = (school_info.get("name") or "").strip()
            if name and "high school" not in name.lower():
                school = name
                break

    linkedin = (person.get("linkedin_url") or "").strip()
    if linkedin and not linkedin.startswith("http"):
        linkedin = f"https://www.{linkedin}" if linkedin.startswith("linkedin.com") else f"https://{linkedin}"
    if not linkedin:
        return None

    first_display = _smart_title(first)
    last_display = _smart_title(last)
    full_name = f"{first_display} {last_display}".strip()

    return {
        "name": full_name,
        "first_name": first_display,
        "last_name": last_display,
        "title": _smart_title(title),
        "company": _smart_title(company_name),
        "school": _smart_title(school),
        "linkedin": linkedin,
    }


def search_public_people(company: str, role: str, limit: int = 5) -> list[dict]:
    """Warehouse-only search (2026-08-31): serves whatever firm_employees
    already holds and never spends a vendor credit for anonymous traffic.
    A miss returns [] and the widget shows the signup pitch. Replaces the
    PDL /person/search call (retired key).
    """
    company = (company or "").strip()
    role = (role or "").strip()
    if not company or not role:
        return []

    # Pull in the same alias map the paid path uses (McKinsey, Goldman, etc).
    canonical_company = clean_company_name(company) or company

    try:
        from app.services.engine_search import engine_search_contacts
        parsed = {
            "companies": [{"name": canonical_company}],
            "title_variations": [role],
        }
        contacts, _rl, _saved, _meta = engine_search_contacts(
            parsed, max(1, min(int(limit), 10)), allow_vendor=False
        )
    except Exception as exc:
        logger.warning("[find_people_public] warehouse search failed: %s", exc)
        return []

    results: list[dict] = []
    for contact in contacts or []:
        linkedin = (contact.get("LinkedIn") or "").strip()
        first = (contact.get("FirstName") or "").strip()
        last = (contact.get("LastName") or "").strip()
        if not linkedin or not (first or last):
            # The widget card links to LinkedIn; a row without one is
            # useless here (same rule the PDL extractor enforced).
            continue
        if linkedin.startswith("linkedin.com"):
            linkedin = f"https://www.{linkedin}"
        elif not linkedin.startswith("http"):
            linkedin = f"https://www.linkedin.com/in/{linkedin.strip('/')}"
        results.append({
            "name": f"{_smart_title(first)} {_smart_title(last)}".strip(),
            "first_name": _smart_title(first),
            "last_name": _smart_title(last),
            "title": _smart_title((contact.get("Title") or "").strip()),
            "company": _smart_title((contact.get("Company") or "").strip() or canonical_company),
            "school": _smart_title((contact.get("College") or "").strip()),
            "linkedin": linkedin,
        })
        if len(results) >= limit:
            break
    return results
