"""Hard intent gates — Phase 2 of the job-board audit.

Where the deterministic + GPT + embedding rankers only *score* jobs, intent
gates *drop* jobs that fail explicit user-stated intent. Three gates:

  1. Level gate — a graduating senior shouldn't see PhD / Senior / Staff /
     Principal postings. Read from structured.experience_level (populated by
     the Phase 1 Firecrawl enricher) and the job title as a fallback.

  2. Location gate — if user set preferredLocation, drop jobs whose location
     doesn't intersect any of those AND aren't remote-friendly.

  3. Interest gate — if user has non-empty careerInterests, drop jobs that
     don't show any of those interests in (structured.requirements ∪
     category ∪ title).

Each gate is conservative: only drops when we have high confidence the job
mismatches user-stated intent. When data is ambiguous (no structured field,
no preferences set, etc.), the gate keeps the job.

Gates return both the kept jobs AND a count of dropped jobs per gate so the
SPA can show "We filtered N jobs that didn't match — change preferences or
Show all".
"""
from __future__ import annotations

import logging
import re
from datetime import datetime

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_lower(val) -> str:
    if isinstance(val, str):
        return val.lower()
    if isinstance(val, list):
        return " ".join(v.lower() for v in val if isinstance(v, str))
    return ""


def _safe_str_list(val) -> list[str]:
    if isinstance(val, list):
        return [v.strip().lower() for v in val if isinstance(v, str) and v.strip()]
    if isinstance(val, str) and val.strip():
        return [val.strip().lower()]
    return []


# Title-pattern detection for senior roles (when structured.experience_level is missing)
_SENIOR_TITLE_RE = re.compile(
    r"\b(senior|sr\.?|staff|principal|lead|director|head of|vp of|vice president|"
    r"manager|architect|distinguished|fellow|chief|founding)\b",
    re.IGNORECASE,
)

_PHD_RE = re.compile(r"\b(ph\.?d|doctorate|doctoral)\b", re.IGNORECASE)

# experience_level values from Firecrawl that signal "not entry-level"
_NON_ENTRY_LEVEL_VALUES = {
    "senior", "staff", "principal", "lead", "director", "executive",
    "5+ years", "6+ years", "7+ years", "8+ years", "10+ years",
    "manager", "architect",
}


# ---------------------------------------------------------------------------
# UserIntent extraction
# ---------------------------------------------------------------------------

def build_user_intent(profile: dict) -> dict:
    """Extract the gate-relevant fields from a user profile.

    The onboarding flow writes intent fields to several different paths
    (legacy schema vs current schema vs partial writes). Read every known
    path so the gates work for users onboarded at any point in history.

    Audited 2026-05-18:
      - careerInterests lives in `location.careerInterests` for 45.5% of users,
        `location.interests` for 50.8%, top-level `careerInterests` for 6.2%,
        and `goals.careerInterests` for 0% (despite what the audit doc assumed)
      - dreamCompanies adoption is 2.1% — separate UX issue, not a path issue
    """
    goals = profile.get("goals") or {}
    rp = profile.get("resumeParsed") or {}
    edu = rp.get("education") or {}
    loc = profile.get("location") or {}

    # graduation year — accept multiple field names
    grad_year = (
        edu.get("graduationYear")
        or edu.get("graduation_year")
        or profile.get("graduationYear")
    )
    try:
        grad_year = int(grad_year) if grad_year is not None else None
    except (TypeError, ValueError):
        grad_year = None

    # preferredLocation may be a string OR a list (multi-city onboarding)
    pref_loc = loc.get("preferredLocation") or profile.get("preferredLocation")
    preferred_locations = _safe_str_list(pref_loc)

    # careerInterests: union across every path the onboarding flow has
    # written to. Dedup is downstream — gate just needs the membership set.
    interest_sources = [
        goals.get("careerInterests"),
        loc.get("careerInterests"),
        loc.get("interests"),
        loc.get("career_interests"),
        profile.get("careerInterests"),
    ]
    seen = set()
    career_interests: list[str] = []
    for src in interest_sources:
        for v in _safe_str_list(src):
            if v not in seen:
                seen.add(v)
                career_interests.append(v)

    # Career track lives under goals; tolerate accidental top-level write too
    raw_track = goals.get("careerTrack") or profile.get("careerTrack")
    career_track = raw_track.lower().strip() if isinstance(raw_track, str) else ""

    # Dream companies — same union pattern in case any user has them top-level
    dream_sources = [goals.get("dreamCompanies"), profile.get("dreamCompanies")]
    seen_dc = set()
    dream_companies: list[str] = []
    for src in dream_sources:
        for v in _safe_str_list(src):
            if v not in seen_dc:
                seen_dc.add(v)
                dream_companies.append(v)

    major_raw = edu.get("major") or profile.get("major")
    major = major_raw.lower().strip() if isinstance(major_raw, str) else ""

    return {
        "preferred_locations": preferred_locations,
        "career_interests": career_interests,
        "career_track": career_track,
        "dream_companies": dream_companies,
        "major": major,
        "graduation_year": grad_year,
    }


# ---------------------------------------------------------------------------
# Individual gates — each returns True if the job should be DROPPED
# ---------------------------------------------------------------------------

def _gate_by_level(job: dict, intent: dict) -> bool:
    """Drop senior/staff/PhD postings when user graduates within 18 months.

    Conservative: only drops when the user has a graduation year close enough
    AND we have positive evidence the role isn't entry-level.
    """
    grad_year = intent.get("graduation_year")
    if grad_year is None:
        return False

    current_year = datetime.now().year
    months_until_grad = (grad_year - current_year) * 12
    if months_until_grad > 18:
        return False

    structured = job.get("structured") or {}
    level = structured.get("experience_level")
    if isinstance(level, str):
        lv = level.lower().strip()
        for marker in _NON_ENTRY_LEVEL_VALUES:
            if marker in lv:
                return True

    # Fallback: pattern-match the title
    title = job.get("title") or ""
    if isinstance(title, str):
        if _PHD_RE.search(title):
            return True
        # Title-based seniority — only drop if title clearly says senior+
        # (not just "Lead Frontend Engineer Intern" — context matters)
        if _SENIOR_TITLE_RE.search(title) and not re.search(r"\b(intern|internship|new\s*grad|entry|junior|jr)\b", title, re.IGNORECASE):
            return True

    # Requirements list — if it explicitly says "5+ years" / PhD etc.
    reqs = structured.get("requirements") or []
    if isinstance(reqs, list):
        for req in reqs[:3]:  # only check first few — those are usually load-bearing
            if not isinstance(req, str):
                continue
            req_lower = req.lower()
            if _PHD_RE.search(req_lower):
                return True
            if re.search(r"\b([5-9]|10|1[0-9])\+?\s*(years?|yrs?)\b", req_lower):
                return True

    return False


def _gate_by_location(job: dict, intent: dict) -> bool:
    """Drop jobs whose location doesn't intersect preferredLocation and aren't remote."""
    preferred = intent.get("preferred_locations") or []
    if not preferred:
        return False

    # Remote-friendly jobs always pass
    if job.get("remote_derived") or job.get("remote"):
        return False

    raw_loc = job.get("location")
    if isinstance(raw_loc, dict):
        # JSON-LD PostalAddress shape
        loc_text = " ".join(
            str(v).lower() for v in raw_loc.values() if isinstance(v, str)
        )
    elif isinstance(raw_loc, str):
        loc_text = raw_loc.lower()
    else:
        # No location data — conservative: keep
        return False

    if "remote" in loc_text:
        return False

    # Match if any preferred-location keyword appears in the job's location string
    for pref in preferred:
        if pref and pref in loc_text:
            return False

    return True


def _gate_by_interest(job: dict, intent: dict) -> bool:
    """Drop jobs that don't show any user career interest in title/category/requirements."""
    interests = intent.get("career_interests") or []
    if not interests:
        return False

    # Collect every text signal we have for this job
    haystack_parts = []
    title = job.get("title")
    if isinstance(title, str):
        haystack_parts.append(title.lower())
    category = job.get("category")
    if isinstance(category, str):
        haystack_parts.append(category.lower())
    structured = job.get("structured") or {}
    reqs = structured.get("requirements") or []
    if isinstance(reqs, list):
        haystack_parts.extend(r.lower() for r in reqs if isinstance(r, str))
    team = structured.get("team")
    if isinstance(team, str):
        haystack_parts.append(team.lower())
    haystack = " ".join(haystack_parts)
    if not haystack:
        # No signal to evaluate — conservative: keep
        return False

    for interest in interests:
        if interest and interest in haystack:
            return False

    return True


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def apply_intent_gates(jobs: list[dict], intent: dict) -> tuple[list[dict], dict]:
    """Run all three gates against the candidate pool.

    Returns (kept_jobs, gated_counts) where gated_counts is
    {"by_level": int, "by_location": int, "by_interest": int}.
    """
    if not jobs:
        return [], {"by_level": 0, "by_location": 0, "by_interest": 0}

    kept = []
    counts = {"by_level": 0, "by_location": 0, "by_interest": 0}

    for job in jobs:
        if _gate_by_level(job, intent):
            counts["by_level"] += 1
            continue
        if _gate_by_location(job, intent):
            counts["by_location"] += 1
            continue
        if _gate_by_interest(job, intent):
            counts["by_interest"] += 1
            continue
        kept.append(job)

    logger.info(
        "intent gates: kept %d/%d (by_level=%d, by_location=%d, by_interest=%d)",
        len(kept), len(jobs),
        counts["by_level"], counts["by_location"], counts["by_interest"],
    )
    return kept, counts


def intent_hash(intent: dict) -> str:
    """Stable hash of the gate-relevant intent for cache keying."""
    import hashlib
    import json
    # Sort lists so order doesn't change the hash
    norm = {
        "preferred_locations": sorted(intent.get("preferred_locations") or []),
        "career_interests": sorted(intent.get("career_interests") or []),
        "career_track": intent.get("career_track") or "",
        "graduation_year": intent.get("graduation_year"),
    }
    raw = json.dumps(norm, sort_keys=True)
    return hashlib.sha1(raw.encode()).hexdigest()[:16]
