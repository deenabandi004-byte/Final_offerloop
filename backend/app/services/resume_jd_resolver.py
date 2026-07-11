"""Resolve a job posting from a URL or pasted text into a `JobPosting`.

Mirrors the pattern the public resume-review workshop already uses (Firecrawl
for URLs, treat long text as a pasted JD). Kept as its own module so the
`POST /api/resume/tailor` route doesn't have to inline JD resolution.
"""
from __future__ import annotations

import logging
import re

from app.services.firecrawl_client import extract_job_posting, scrape_url
from app.services.resume_tailor import JobPosting

logger = logging.getLogger(__name__)

_URL_RE = re.compile(r"^https?://", re.IGNORECASE)
_MIN_PASTED_JD_CHARS = 100


class JDResolutionError(RuntimeError):
    """Raised when we can't produce a usable job description."""


def _scrape_url(url: str) -> tuple[str, str | None, str | None]:
    raw = scrape_url(url, "general") or {}
    markdown = (raw.get("markdown") or "").strip()

    structured = extract_job_posting(url) or {}

    description = markdown
    if not description or len(description) < 200:
        parts: list[str] = []
        if structured.get("title"):
            parts.append(f"Job Title: {structured['title']}")
        if structured.get("company"):
            parts.append(f"Company: {structured['company']}")
        if structured.get("location"):
            parts.append(f"Location: {structured['location']}")
        if structured.get("responsibilities"):
            parts.append(
                "Responsibilities:\n- " + "\n- ".join(structured["responsibilities"])
            )
        if structured.get("requirements"):
            parts.append(
                "Requirements:\n- " + "\n- ".join(structured["requirements"])
            )
        if structured.get("nice_to_have"):
            parts.append(
                "Nice to have:\n- " + "\n- ".join(structured["nice_to_have"])
            )
        synthesized = "\n\n".join(parts).strip()
        if synthesized and (not description or len(synthesized) > len(description)):
            description = synthesized

    return description, structured.get("title") or None, structured.get("company") or None


def resolve_jd(
    *,
    job_url: str | None = None,
    job_description: str | None = None,
    job_title: str | None = None,
    company: str | None = None,
) -> JobPosting:
    url = (job_url or "").strip()
    pasted = (job_description or "").strip()
    title = (job_title or "").strip()
    company_name = (company or "").strip()

    if url and _URL_RE.match(url):
        try:
            scraped_desc, scraped_title, scraped_company = _scrape_url(url)
        except Exception as exc:
            logger.warning("resume_jd_resolver: Firecrawl failed for %s: %s", url, exc)
            scraped_desc, scraped_title, scraped_company = "", None, None

        description = scraped_desc or pasted
        title = title or scraped_title or ""
        company_name = company_name or scraped_company or ""

        if not description or len(description.strip()) < _MIN_PASTED_JD_CHARS:
            raise JDResolutionError(
                "We couldn't read that job URL. Paste the job description directly and try again."
            )

        return JobPosting(
            title=title,
            company=company_name,
            description=description,
        )

    if pasted and len(pasted) >= _MIN_PASTED_JD_CHARS:
        return JobPosting(
            title=title,
            company=company_name,
            description=pasted,
        )

    raise JDResolutionError(
        f"Provide a job URL we can read, or paste at least {_MIN_PASTED_JD_CHARS} "
        "characters of the job description."
    )
