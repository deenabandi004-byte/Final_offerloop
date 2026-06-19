"""Orchestrator for the public Find Hiring Manager flow.

Pipeline:
    pasted job URL
        -> extract_job(url)               (Firecrawl + markdown fallback)
        -> determine_job_type(...)        (reused from recruiter_finder)
        -> find_hiring_manager(...)       (reused — PDL tight/loose tier search)
        -> normalize_candidates(...)      (trim to 1-2, attach reasoning)

We deliberately reuse the paid recruiter_finder module without modifying
it. The only difference from the paid flow is:
    * max_results capped at 2
    * generate_emails=False (no LLM, no Hunter)
    * uid=None (no per-user telemetry)
    * we attach a short, human-readable "why this person" reasoning
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List

from app.services.cover_letter_public.job_extractor import extract_job
from app.services.recruiter_finder import (
    determine_job_type,
    find_hiring_manager,
)

logger = logging.getLogger(__name__)

MAX_RESULTS = 2


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


_LETTER_RE = re.compile(r"[A-Za-z]")


def _looks_like_company(value: str) -> bool:
    """Firecrawl sometimes returns punctuation-only or one-char strings
    pulled from page metadata (e.g. "." from example.com). Require at
    least 2 chars and at least one letter so we don't waste a PDL call."""
    v = (value or "").strip()
    if len(v) < 2:
        return False
    return bool(_LETTER_RE.search(v))


def _pick(contact: Dict[str, Any], camel: str, pascal: str, default: str = "") -> str:
    """find_hiring_manager returns a mixed bag of contact shapes:
    tight-PDL / firecrawl-seed contacts use camelCase keys, tier-loop
    contacts (from execute_pdl_search) use PascalCase. Read from either."""
    val = contact.get(camel)
    if not val:
        val = contact.get(pascal)
    if not isinstance(val, str):
        val = "" if val is None else str(val)
    return val.strip() or default


def _reasoning_for(contact: Dict[str, Any], job_type: str, job_title: str) -> str:
    """Short, factual "why this person" string for the widget card.

    No LLM call — pulled deterministically from the contact's _source +
    jobTitle so it's fast and never hallucinates."""
    source = (contact.get("_source") or "").lower()
    contact_title = _pick(contact, "jobTitle", "Title")
    company = _pick(contact, "company", "Company")

    if source == "firecrawl_seed":
        return (
            f"Named as the hiring manager on the job posting itself, "
            f"then verified in PDL as {contact_title} at {company}."
        )
    if source == "firecrawl_seed_synthetic":
        return (
            "Named as the hiring manager on the job posting itself "
            "(no LinkedIn profile match in our data yet)."
        )

    pretty_type = (job_type or "general").replace("_", " ")
    role_label = job_title.strip() or f"{pretty_type} role"

    if source == "tight_pdl":
        return (
            f"PDL flags them as a {pretty_type} decision-maker at {company} — "
            f"the right seniority + function to own hiring for a {role_label}."
        )

    # Loose tier search (manager / director / VP titles inside the right org)
    return (
        f"{contact_title} at {company} — title and team match the "
        f"{role_label} posting, so they almost certainly sit in the hiring chain."
    )


def _normalize(contact: Dict[str, Any], job_type: str, job_title: str) -> Dict[str, Any]:
    first = _pick(contact, "firstName", "FirstName")
    last = _pick(contact, "lastName", "LastName")
    full = _pick(contact, "fullName", "FullName") or f"{first} {last}".strip()

    location = _pick(contact, "location", "Location")
    if not location:
        # Tier-loop / PascalCase contacts split location into City + State.
        city = _pick(contact, "city", "City")
        state = _pick(contact, "state", "State")
        location = ", ".join(p for p in [city, state] if p)

    linkedin = _pick(contact, "linkedinUrl", "LinkedIn")
    if linkedin and not linkedin.lower().startswith("http"):
        linkedin = f"https://{linkedin.lstrip('/')}"

    return {
        "fullName": full,
        "firstName": first,
        "lastName": last,
        "jobTitle": _pick(contact, "jobTitle", "Title"),
        "company": _pick(contact, "company", "Company"),
        "location": location,
        "linkedinUrl": linkedin,
        "reasoning": _reasoning_for(contact, job_type, job_title),
    }


def find_hiring_managers_from_url(job_url: str) -> Dict[str, Any]:
    """Public entry-point used by the /search route.

    Returns a structured response — never raises. Shape:

        {
            "status": "ok" | "extraction_failed" | "no_candidates",
            "message": str | None,
            "job": {"company": str, "jobTitle": str, "location": str},
            "hiringManagers": [{...normalized contact + reasoning}, ...],
        }
    """
    url = (job_url or "").strip()
    if not url:
        return {
            "status": "extraction_failed",
            "message": "No job URL provided.",
            "job": {"company": "", "jobTitle": "", "location": ""},
            "hiringManagers": [],
        }

    # ── 1. Firecrawl extraction ──────────────────────────────────────
    job = extract_job(url)
    company = (job.get("company") or "").strip()
    job_title = (job.get("title") or "").strip()
    location = (job.get("location") or "").strip()
    description = job.get("description") or job.get("raw_markdown") or ""

    if not _looks_like_company(company):
        return {
            "status": "extraction_failed",
            "message": (
                "We couldn't read the job posting at that URL. "
                "Try pasting a different link (Greenhouse, Lever, Workday, "
                "or the company's own careers page tend to work best)."
            ),
            "job": {"company": "", "jobTitle": job_title, "location": location},
            "hiringManagers": [],
        }

    # ── 2. Job-type classification ────────────────────────────────────
    job_type = determine_job_type(job_title, _truncate(description, 4000))
    logger.info(
        "find_hiring_manager_public: company=%r title=%r location=%r job_type=%r",
        company, job_title, location, job_type,
    )

    # ── 3. PDL hiring-manager discovery ──────────────────────────────
    try:
        result = find_hiring_manager(
            company_name=company,
            job_type=job_type,
            job_title=job_title,
            job_description=_truncate(description, 4000),
            location=location or None,
            max_results=MAX_RESULTS,
            generate_emails=False,
            uid=None,
        )
    except Exception:
        logger.exception("find_hiring_manager raised for company=%r", company)
        return {
            "status": "no_candidates",
            "message": (
                "Something went wrong searching for the hiring manager. "
                "Try again in a minute, or paste a different job URL."
            ),
            "job": {"company": company, "jobTitle": job_title, "location": location},
            "hiringManagers": [],
        }

    candidates: List[Dict[str, Any]] = list(result.get("hiringManagers") or [])
    if not candidates:
        fallback_msg = result.get("fallback_message") or (
            f"We couldn't pin down a hiring manager at {company} for this role. "
            "This usually means the company is very small or PDL doesn't have "
            "the right person on file. Try a similar role at a larger team."
        )
        return {
            "status": "no_candidates",
            "message": fallback_msg,
            "job": {"company": company, "jobTitle": job_title, "location": location},
            "hiringManagers": [],
        }

    # Normalize, drop nameless rows, and prefer candidates that have a
    # LinkedIn URL (so the widget card actually has something to link to).
    normalized_all = [_normalize(c, job_type=job_type, job_title=job_title) for c in candidates]
    named = [n for n in normalized_all if n["fullName"]]
    with_li = [n for n in named if n["linkedinUrl"]]
    chosen = (with_li or named)[:MAX_RESULTS]

    if not chosen:
        return {
            "status": "no_candidates",
            "message": (
                f"We found people at {company} but couldn't return a clean "
                "profile for any of them. Try a different role at the same "
                "company, or create a free account for deeper search."
            ),
            "job": {"company": company, "jobTitle": job_title, "location": location},
            "hiringManagers": [],
        }

    return {
        "status": "ok",
        "message": None,
        "job": {
            "company": result.get("company_cleaned") or company,
            "jobTitle": job_title,
            "location": location,
        },
        "hiringManagers": chosen,
    }
