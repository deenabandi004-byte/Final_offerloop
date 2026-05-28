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
    """Run a single PDL /person/search and return up to `limit` slim
    contact dicts. Empty list on missing API key, network failure, or
    no matches.

    Costs: 1 PDL credit per profile actually returned. A miss is 0
    credits (404 status from PDL).
    """
    if not PEOPLE_DATA_LABS_API_KEY:
        logger.warning("[find_people_public] PEOPLE_DATA_LABS_API_KEY not set; returning empty")
        return []

    company = (company or "").strip()
    role = (role or "").strip()
    if not company or not role:
        return []

    # Pull in the same alias map the paid path uses (McKinsey, Goldman, etc).
    canonical_company = clean_company_name(company) or company

    query = _build_query(canonical_company, role)
    body = {"query": query, "size": max(1, min(int(limit), 10))}
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }

    try:
        resp = requests.post(
            f"{PDL_BASE_URL}/person/search",
            headers=headers,
            json=body,
            timeout=20,
        )
    except requests.RequestException as exc:
        logger.warning("[find_people_public] PDL request failed: %s", exc)
        return []

    if resp.status_code == 404:
        return []
    if resp.status_code != 200:
        logger.warning(
            "[find_people_public] PDL %s for %s / %s: %s",
            resp.status_code, canonical_company, role, resp.text[:200],
        )
        return []

    try:
        payload = resp.json() or {}
    except ValueError:
        return []

    data = payload.get("data") or []
    if not isinstance(data, list):
        return []

    results: list[dict] = []
    for person in data:
        slim = _extract_slim(person)
        if slim:
            results.append(slim)
        if len(results) >= limit:
            break
    return results
