"""Public Find-Jobs orchestrator.

Pipeline for one request (either input is optional, but at least one of
PDF bytes OR a job_query string is required):

  1. PDF (if given) -> resume text -> structured profile (OpenAI JSON).
  2. job_query (if given) -> Q1 verbatim + prompt tokens added to scoring.
  3. Build 2-3 Perplexity queries from whatever inputs were provided.
  4. Dedupe by URL, junk-filter, score, return top 5.

The scoring is intentionally simple and self-contained — we do NOT import
from job_board.py to keep this flow isolated from the paid surface.
"""
from __future__ import annotations

import logging
import re
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Optional

from app.services.interview_prep.resume_parser import (
    extract_text_from_pdf_bytes,
    parse_resume_to_profile,
)
from app.services.perplexity_client import search_jobs_live

logger = logging.getLogger(__name__)

# A handful of obviously-generic strings to skip when scoring skills.
_GENERIC_SKILL_TERMS = {
    "strong", "excellent", "good", "experience", "skills", "ability",
    "abilities", "working", "team", "work", "communication", "leadership",
}

# Light field -> typical role/keyword affinity. Used for "why it's a match"
# and a small additional score bump when the resume profile is thin.
_FIELD_AFFINITY: dict[str, list[str]] = {
    "computer science": ["software", "engineer", "developer", "swe", "data", "ml"],
    "computer engineering": ["software", "engineer", "developer", "embedded", "hardware"],
    "data science": ["data", "analyst", "scientist", "ml", "ai", "analytics"],
    "statistics": ["data", "analyst", "scientist", "quant", "actuarial"],
    "economics": ["analyst", "consultant", "finance", "investment", "research"],
    "finance": ["finance", "investment", "banking", "analyst", "trading"],
    "accounting": ["accountant", "audit", "tax", "finance"],
    "business": ["analyst", "consultant", "operations", "marketing", "associate"],
    "marketing": ["marketing", "brand", "growth", "content", "social"],
    "mechanical engineering": ["mechanical", "design", "manufacturing", "robotics"],
    "electrical engineering": ["electrical", "hardware", "embedded", "firmware"],
    "industrial engineering": ["operations", "supply chain", "manufacturing"],
    "chemical engineering": ["chemical", "process", "manufacturing"],
}

_MAX_QUERIES = 3
_JOBS_PER_QUERY = 8  # Perplexity responds faster on smaller asks; we only return 5
_FINAL_JOB_COUNT = 5

# Perplexity sometimes returns a single "row" that's actually an apology like
# "No verified match found" or "The provided search results do not include...".
# These have empty URLs and/or no-result phrasing. Drop them before scoring.
_JUNK_TITLE_RE = re.compile(
    r"^(no\s+(verified|results|match|listings|jobs)|"
    r"could\s+not|"
    r"unable\s+to|"
    r"none\s+(found|available)|"
    r"n/?a|"
    r"not\s+(available|found|specified))\b",
    re.IGNORECASE,
)
_JUNK_BODY_RE = re.compile(
    r"(no\s+(verified|matching|current)\s+job|"
    r"do\s+not\s+include\s+any\s+(verified\s+)?current|"
    r"could\s+not\s+verify|"
    r"no\s+search\s+results)",
    re.IGNORECASE,
)


# ── Resume processing ────────────────────────────────────────────────


def _extract_resume_text(pdf_bytes: bytes) -> str:
    text = extract_text_from_pdf_bytes(pdf_bytes) or ""
    return text.strip()


def _parse_profile(resume_text: str) -> dict:
    """Normalize the OpenAI parser output. Always returns the same keys."""
    raw = parse_resume_to_profile(resume_text) or {}
    skills = raw.get("skills") or []
    if not isinstance(skills, list):
        skills = []
    experience = raw.get("experience") or []
    if not isinstance(experience, list):
        experience = []
    return {
        "name": (raw.get("name") or "").strip(),
        "school": (raw.get("school") or "").strip(),
        "graduation_year": (raw.get("graduation_year") or "").strip() if isinstance(raw.get("graduation_year"), str) else raw.get("graduation_year"),
        "major": (raw.get("major") or "").strip(),
        "skills": [str(s).strip() for s in skills if s and isinstance(s, (str, int, float))][:20],
        "experience": experience[:5],
        "projects": raw.get("projects") or [],
        "achievements": raw.get("achievements") or [],
    }


# ── Query generation ─────────────────────────────────────────────────


_DEGREE_PREFIX_RE = re.compile(
    r"^(bachelor(s|'s)?\s+of\s+|"
    r"master(s|'s)?\s+of\s+|"
    r"b\.?\s?[asm]\.?\s+|"
    r"m\.?\s?[asm]\.?\s+|"
    r"ph\.?\s?d\.?\s+|"
    r"associate(s|'s)?\s+of\s+|"
    r"a\.?\s?[as]\.?\s+)",
    re.IGNORECASE,
)
_DEGREE_CONNECTOR_RE = re.compile(r"^(in|of)\s+", re.IGNORECASE)

# Map a verbose major to the natural search-keyword shape recruiters use in JDs.
_MAJOR_KEYWORD_MAP: dict[str, str] = {
    "business administration": "business",
    "computer science": "software engineering",
    "computer engineering": "software engineering",
    "data science": "data analyst",
    "electrical engineering": "electrical engineering",
    "mechanical engineering": "mechanical engineering",
    "industrial engineering": "operations",
    "chemical engineering": "chemical engineering",
    "economics": "finance",
    "accounting": "accounting",
    "finance": "finance",
    "marketing": "marketing",
    "statistics": "data analyst",
    "mathematics": "data analyst",
    "psychology": "human resources",
    "communications": "marketing",
    "political science": "policy",
    "international relations": "consulting",
    "supply chain": "supply chain",
}


def _clean_major(major: str) -> str:
    """`Bachelor of Business Administration` -> `Business Administration`."""
    if not major:
        return ""
    cleaned = _DEGREE_PREFIX_RE.sub("", major.strip())
    cleaned = _DEGREE_CONNECTOR_RE.sub("", cleaned)
    return cleaned.strip()


def _major_keyword(major: str) -> str:
    """Translate the cleaned major into the keyword recruiters actually use."""
    cleaned = _clean_major(major).lower()
    if not cleaned:
        return ""
    if cleaned in _MAJOR_KEYWORD_MAP:
        return _MAJOR_KEYWORD_MAP[cleaned]
    # Partial match (e.g. "business administration concentration in finance")
    for k, v in _MAJOR_KEYWORD_MAP.items():
        if k in cleaned:
            return v
    return _clean_major(major)


def _career_phase(profile: dict) -> str:
    """`internship` for current undergrads, `new grad` for recent/graduating."""
    gy = profile.get("graduation_year")
    if gy:
        try:
            year = int(str(gy)[:4])
            from datetime import datetime
            current = datetime.now().year
            # Currently enrolled (graduates >= next year) → internship-seeker.
            if year > current:
                return "internship"
            # Just graduated or graduating this year → new grad full-time.
            return "new grad"
        except (ValueError, TypeError):
            pass
    return "internship"  # safe default for a free job-match widget


_PROMPT_STOPWORDS = {
    "i", "me", "my", "we", "our", "a", "an", "the", "for", "to", "in", "on",
    "at", "of", "or", "and", "with", "as", "is", "are", "be", "looking",
    "want", "would", "like", "love", "love-to", "trying", "find", "search",
    "searching", "interested", "role", "roles", "job", "jobs", "work",
    "position", "positions", "opportunity", "opportunities", "any", "some",
    "please", "help", "near", "around", "areas", "area", "that", "just",
    "raised", "raise", "companies", "company", "firms", "firm", "places",
    "places", "where", "which", "who", "what", "how", "size", "any", "all",
    "early", "stage", "late",  # captured separately via _stage_from_prompt
}

# Map common free-text role phrases to a canonical search keyword that
# matches recruiters' JD titles. Match is substring-based on the lowercased
# prompt, longest-alias-first.
_PROMPT_ROLE_KEYWORDS: list[tuple[str, list[str]]] = [
    ("product manager", ["product management", "product manager", "associate pm", " pm role", " pm internship", "apm "]),
    ("software engineer", ["software engineer", "software engineering", "swe ", " swe", "backend engineer", "frontend engineer", "fullstack", "full stack", "full-stack", "web developer"]),
    ("data scientist", ["data scientist", "data science", "machine learning engineer", "ml engineer", "ai engineer"]),
    ("data analyst", ["data analyst", "data analytics", "business analyst", "analytics engineer"]),
    ("investment banking analyst", ["investment banking", "ib analyst", "investment bank analyst", "ibanking", "i-banking"]),
    ("consultant", ["management consulting", "strategy consulting", "consulting analyst", "consultant", "mbb"]),
    ("private equity analyst", ["private equity", "buyout", "growth equity"]),
    ("venture capital analyst", ["venture capital", "vc analyst", "vc internship"]),
    ("quantitative analyst", ["quantitative analyst", "quant analyst", "quant trader", "quant research"]),
    ("financial analyst", ["financial analyst", "fp&a", "corporate finance", "finance analyst"]),
    ("accountant", ["accounting", "auditor", "tax associate", "cpa"]),
    ("marketing", ["marketing", "brand manager", "growth marketing", "content marketing", "social media manager"]),
    ("sales", ["sales role", "account executive", " ae ", "bdr ", " sdr ", "business development rep"]),
    ("ux designer", ["product designer", "ux designer", "ui designer", "user experience"]),
    ("operations", ["operations manager", "ops role", "biz ops", "business operations", "supply chain"]),
    ("recruiter", ["recruiter", "talent acquisition", " ta role"]),
    ("hr", ["human resources", " hr role", "people ops"]),
    ("mechanical engineer", ["mechanical engineer", "mech eng"]),
    ("electrical engineer", ["electrical engineer", "ee role"]),
    ("hardware engineer", ["hardware engineer"]),
]

# Common stage / company-type signals. When present, we steer Q3 toward
# startup-shaped postings instead of generic "college student" fallbacks.
_PROMPT_STAGE_PATTERNS: list[tuple[str, str]] = [
    # (regex pattern, canonical_query_addendum)
    (r"\bseries\s*(a|b|c|d)\b", "startup"),
    (r"\bseed\s*(stage|funded|round)?\b", "startup"),
    (r"\bearly[\s-]?stage\b", "startup"),
    (r"\bgrowth[\s-]?stage\b", "startup"),
    (r"\bstartups?\b", "startup"),
    (r"\bventure[\s-]?backed\b", "startup"),
    (r"\byc[\s-]?(backed|company)?\b", "startup"),
    (r"\bf500\b|\bfortune\s*500\b|\bbig\s*tech\b|\bfaang\b", "enterprise"),
    (r"\bnon[\s-]?profit\b|\bnonprofit\b|\bngo\b", "nonprofit"),
]

# Common locations users mention. When detected, we use it as the location
# filter for Perplexity instead of "United States".
_PROMPT_LOCATION_PATTERNS: list[tuple[str, str]] = [
    (r"\bsan\s*francisco\b|\bsf\b|\bbay\s*area\b", "San Francisco, CA"),
    (r"\bnew\s*york\b|\bnyc\b|\bmanhattan\b", "New York, NY"),
    (r"\bnyc\s*metro\b", "New York, NY"),
    (r"\blos\s*angeles\b|\bla\b", "Los Angeles, CA"),
    (r"\bseattle\b", "Seattle, WA"),
    (r"\bboston\b", "Boston, MA"),
    (r"\bchicago\b", "Chicago, IL"),
    (r"\baustin\b", "Austin, TX"),
    (r"\bremote\b", "Remote, United States"),
]


def _role_from_prompt(job_query: str) -> str:
    """Pick the canonical role keyword from a free-text prompt."""
    if not job_query:
        return ""
    # Pad with spaces so word-boundary substring checks (" pm ") work at edges.
    padded = f" {job_query.lower()} "
    for canonical, aliases in _PROMPT_ROLE_KEYWORDS:
        for alias in aliases:
            if alias in padded:
                return canonical
    return ""


def _stage_from_prompt(job_query: str) -> str:
    """Detect startup/enterprise/nonprofit signal from a free-text prompt."""
    if not job_query:
        return ""
    low = job_query.lower()
    for pat, canonical in _PROMPT_STAGE_PATTERNS:
        if re.search(pat, low):
            return canonical
    return ""


def _location_from_prompt(job_query: str) -> str:
    """Detect a city/region mention. Returns '' if none."""
    if not job_query:
        return ""
    low = job_query.lower()
    for pat, canonical in _PROMPT_LOCATION_PATTERNS:
        if re.search(pat, low):
            return canonical
    return ""


def _extract_prompt_tokens(job_query: str, role: str = "", stage: str = "") -> list[str]:
    """Concentrated scoring-token set for the prompt.

    Instead of every word in the prompt becoming a "skill", we use the
    canonical role + stage + the user's literal company/role mentions. This
    avoids generic words like "early"/"stage"/"companies" matching unrelated
    government postings and dragging them into the results.
    """
    if not job_query:
        return []
    tokens: list[str] = []
    if role:
        # Split multi-word role into its parts so they each contribute.
        tokens.extend(role.split())
    if stage:
        tokens.append(stage)
    # Capture proper-noun-shaped tokens from the original prompt — company
    # names (Goldman, Stripe), school names, etc. These are case-sensitive.
    for m in re.findall(r"\b[A-Z][a-zA-Z0-9&\.\-]{2,}\b", job_query):
        low = m.lower()
        if low not in _PROMPT_STOPWORDS and low not in tokens:
            tokens.append(low)
    # Dedupe preserving order.
    seen: set[str] = set()
    unique: list[str] = []
    for t in tokens:
        low = t.lower().strip(".-")
        if not low or len(low) < 2 or low in _PROMPT_STOPWORDS:
            continue
        if low in seen:
            continue
        seen.add(low)
        unique.append(low)
    return unique[:10]


def _build_queries(profile: dict, job_query: str = "") -> list[tuple[str, float]]:
    """Build up to 3 Perplexity queries as (query, weight) tuples.

    The weight is applied to scores of jobs returned by that query, so the
    literal visitor prompt outranks generic fallbacks. Weights:

        1.30  literal visitor prompt (Q1 when job_query is provided)
        1.15  role-derived query (Q2 in prompt mode, also for resume mode)
        1.00  broad safety-net or unrelated fallback
    """
    queries: list[tuple[str, float]] = []
    skills = [s for s in (profile.get("skills") or []) if s and s.lower() not in _GENERIC_SKILL_TERMS]
    phase = _career_phase(profile)
    major_kw = _major_keyword(profile.get("major") or "")
    experience = profile.get("experience") or []
    jq = (job_query or "").strip()

    role = _role_from_prompt(jq) if jq else ""
    stage = _stage_from_prompt(jq) if jq else ""

    # Q1 (visitor-typed): when present, use verbatim. Highest weight.
    if jq:
        queries.append((jq if len(jq) >= 20 else f"{jq} {phase}", 1.30))

    # Q2: derived from the prompt (preferred) or from the resume.
    if role:
        # Role detected from prompt: very tight follow-up query.
        queries.append((f"{role} {phase}", 1.15))
    elif skills:
        # Resume skills: concrete JD-body tokens.
        top_skills = " ".join(skills[:3])
        queries.append((f"{top_skills} {phase}", 1.15))
    elif major_kw and not jq:
        # Resume major when no prompt.
        queries.append((f"{major_kw} {phase}", 1.15))

    # Q3: stage-aware narrow fallback when in prompt mode; broad safety net otherwise.
    if len(queries) < _MAX_QUERIES:
        if role and stage:
            queries.append((f"{role} {stage} {phase}", 1.15))
        elif role:
            queries.append((f"{role} {phase}", 1.15))  # may be a dedupe — caught below
        elif jq:
            # Prompt with no detected role: try a stripped-down version that
            # drops "roles/companies/that just raised/etc." padding words.
            tokens = _extract_prompt_tokens(jq, role, stage)
            if tokens:
                queries.append((f"{' '.join(tokens[:4])} {phase}", 1.05))
        else:
            # Resume-only mode — original broad fallbacks.
            has_tech_skills = any(
                s.lower() in {"python", "java", "javascript", "typescript", "c++", "c#", "sql", "react", "node", "go", "rust", "swift", "kotlin"}
                for s in skills
            )
            if has_tech_skills:
                queries.append((f"software engineer {phase}", 1.00))
            elif major_kw in ("finance", "accounting"):
                queries.append((f"finance {phase}", 1.00))
            elif major_kw == "consulting":
                queries.append((f"business analyst {phase}", 1.00))
            elif experience and isinstance(experience[0], dict):
                first_title = (experience[0].get("title") or "").strip()
                if first_title:
                    queries.append((f"{first_title} {phase}", 1.00))
                else:
                    queries.append((f"{phase} college student", 1.00))
            else:
                queries.append((f"{phase} college student", 1.00))

    # Last-resort safety.
    if not queries:
        queries.append(("internship college student", 1.00))

    # Dedupe while preserving order; keep the highest weight when duplicated.
    by_key: dict[str, tuple[str, float]] = {}
    order: list[str] = []
    for q, w in queries:
        key = q.lower()
        if key not in by_key:
            by_key[key] = (q, w)
            order.append(key)
        else:
            existing_q, existing_w = by_key[key]
            if w > existing_w:
                by_key[key] = (existing_q, w)
    return [by_key[k] for k in order][:_MAX_QUERIES]


# ── Job fetching ─────────────────────────────────────────────────────


def _is_junk_job(job: dict) -> bool:
    """True if Perplexity returned an apology/placeholder instead of a posting.

    Perplexity occasionally responds with a single JSON object whose `title`
    is something like "No verified match found" and `summary` explains why
    no postings were found. These have no real URL and must not be shown.
    """
    if not isinstance(job, dict):
        return True
    title = (job.get("title") or "").strip()
    url = (job.get("url") or "").strip()
    summary = (job.get("summary") or "").strip()
    if not title:
        return True
    # No URL = no clickable posting = not a real job.
    if not url or not re.match(r"^https?://", url, re.IGNORECASE):
        return True
    if _JUNK_TITLE_RE.search(title):
        return True
    if _JUNK_BODY_RE.search(summary):
        return True
    return False


def _fetch_jobs_parallel(queries: list[tuple[str, float]], location: str) -> list[dict]:
    """Run all queries in parallel. Returns deduplicated, junk-filtered jobs
    with `_query` and `_query_weight` attached for downstream scoring.
    """
    if not queries:
        return []

    raw: list[dict] = []
    junk_count = 0
    with ThreadPoolExecutor(max_workers=min(_MAX_QUERIES, len(queries))) as executor:
        future_to_query = {
            executor.submit(search_jobs_live, q, location, _JOBS_PER_QUERY, None): (q, w)
            for (q, w) in queries
        }
        for future in as_completed(future_to_query):
            q, w = future_to_query[future]
            try:
                jobs = future.result() or []
                for j in jobs:
                    if not isinstance(j, dict):
                        continue
                    if _is_junk_job(j):
                        junk_count += 1
                        continue
                    j["_query"] = q
                    j["_query_weight"] = w
                    raw.append(j)
            except Exception:
                logger.warning("search_jobs_live failed for query=%r", q, exc_info=True)
    if junk_count:
        logger.info("find_jobs_public: dropped %d junk/apology results", junk_count)

    # Dedupe by URL (fall back to title+company). When a job appears in
    # multiple queries' results, keep the one with the higher _query_weight
    # so its scoring gets the boost.
    by_key: dict[str, dict] = {}
    order: list[str] = []
    for job in raw:
        url = (job.get("url") or "").strip().lower()
        key = url or f"{(job.get('title') or '').lower()}|{(job.get('company') or '').lower()}"
        if not key:
            continue
        if key not in by_key:
            by_key[key] = job
            order.append(key)
        else:
            existing = by_key[key]
            if (job.get("_query_weight") or 0) > (existing.get("_query_weight") or 0):
                by_key[key] = job
    return [by_key[k] for k in order]


# ── Scoring ──────────────────────────────────────────────────────────


def _job_text(job: dict) -> str:
    parts = [
        (job.get("title") or ""),
        (job.get("company") or ""),
        (job.get("summary") or ""),
        (job.get("description") or ""),
        (job.get("location") or ""),
    ]
    return " ".join(parts).lower()


def _matched_skills(profile_skills: list[str], job_text_lower: str) -> list[str]:
    matched: list[str] = []
    for skill in profile_skills[:20]:
        if not skill:
            continue
        s = skill.strip().lower()
        if len(s) < 2 or s in _GENERIC_SKILL_TERMS:
            continue
        if re.search(r"\b" + re.escape(s) + r"\b", job_text_lower):
            matched.append(skill)
    # Preserve order, dedupe case-insensitively.
    seen: set[str] = set()
    unique: list[str] = []
    for m in matched:
        k = m.lower()
        if k not in seen:
            seen.add(k)
            unique.append(m)
    return unique


def _score_job(job: dict, profile: dict, resume_text_lower: str) -> tuple[int, list[str]]:
    """Score a single job 0-100. Returns (score, matched_skills)."""
    job_text = _job_text(job)
    if not job_text:
        return 0, []

    score = 20  # base relevance for having any profile + a job

    # Skills overlap (max 45 points: up to 9 per skill, cap 5 skills)
    skills_matched = _matched_skills(profile.get("skills") or [], job_text)
    score += min(45, 9 * len(skills_matched))

    # Field/major affinity (max 15 points)
    major = (profile.get("major") or "").lower()
    if major:
        for field, kws in _FIELD_AFFINITY.items():
            if field in major:
                if any(kw in job_text for kw in kws):
                    score += 15
                break

    # Experience title overlap (max 10 points)
    for exp in (profile.get("experience") or [])[:3]:
        if not isinstance(exp, dict):
            continue
        title = (exp.get("title") or "").lower()
        if not title:
            continue
        words = [w for w in re.split(r"\W+", title) if len(w) > 3]
        if any(w in job_text for w in words):
            score += 10
            break

    # Resume-text echo (max 10 points): does any job phrase appear in resume?
    # Quick proxy: take the first 6 alpha words from the title and check.
    if resume_text_lower:
        title_words = [w for w in re.split(r"\W+", (job.get("title") or "")) if len(w) > 3][:6]
        echoes = sum(1 for w in title_words if w.lower() in resume_text_lower)
        score += min(10, echoes * 3)

    # Apply per-query weight (1.30 for literal-prompt source, 1.00 for fallback).
    # This is what lets a "product manager" prompt result outrank a generic
    # "college student internship" fallback result.
    weight = float(job.get("_query_weight") or 1.0)
    score = score * weight

    return max(0, min(100, int(round(score)))), skills_matched


def _why_match(matched_skills: list[str], profile: dict, job: dict, job_query: str = "") -> str:
    """One-sentence reason this job fits the candidate."""
    if matched_skills:
        skill_str = ", ".join(matched_skills[:3])
        # If the visitor typed a job_query, frame as "matches what you asked for"
        # when most matched tokens came from the query rather than the resume.
        if job_query and not (profile.get("skills") or []):
            return f"Matches what you asked for: {skill_str}."
        return f"Matches your background in {skill_str}."
    major = (profile.get("major") or "").strip()
    if major:
        return f"Aligned with a {major} candidate looking for entry-level roles."
    if job_query:
        return f"Matches the role you described."
    role = (job.get("title") or "").strip()
    return f"Entry-level fit{f' for the {role} track' if role else ''}."


# ── Requirements extraction from Perplexity summary ──────────────────


_BULLET_SPLIT_RE = re.compile(r"[\n\r]+|(?<=[.;])\s+(?=[A-Z0-9])")


def _extract_requirements(job: dict) -> list[str]:
    """Pull up to 3 short requirement-shaped phrases from the summary.

    Perplexity returns a free-text `summary`; we look for sentences that
    smell like requirements (verbs of need, "experience with", etc.) and
    fall back to the first 2-3 sentences otherwise.
    """
    summary = (job.get("summary") or job.get("description") or "").strip()
    if not summary:
        return []

    pieces = [p.strip(" -•\t") for p in _BULLET_SPLIT_RE.split(summary) if p.strip()]
    if not pieces:
        return []

    cue_re = re.compile(
        r"\b(experience with|required|requirements?|familiar with|knowledge of|proficient|"
        r"bachelor|degree|years of|background in|ability to)\b",
        re.IGNORECASE,
    )
    cued = [p for p in pieces if cue_re.search(p)]
    chosen = cued[:3] if cued else pieces[:3]

    # Trim each piece so cards don't blow up.
    return [p[:200] for p in chosen if p]


# ── Output normalization ─────────────────────────────────────────────


def _coerce_job(job: dict, score: int, matched_skills: list[str], profile: dict, job_query: str = "") -> dict:
    return {
        "id": uuid.uuid4().hex[:12],
        "title": (job.get("title") or "").strip() or "Untitled role",
        "company": (job.get("company") or "").strip() or "Company not specified",
        "location": (job.get("location") or "").strip() or "Location not specified",
        "url": (job.get("url") or "").strip(),
        "summary": (job.get("summary") or "").strip(),
        "requirements": _extract_requirements(job),
        "why_match": _why_match(matched_skills, profile, job, job_query),
        "matched_skills": matched_skills,
        "match_score": score,
    }


# ── Public entry point ───────────────────────────────────────────────


def find_matching_jobs(
    pdf_bytes: Optional[bytes] = None,
    *,
    job_query: str = "",
    location: str = "United States",
) -> dict[str, Any]:
    """Run the full pipeline.

    At least one of (pdf_bytes, job_query) MUST be non-empty. The visitor
    can upload a resume, type a free-text role description, or do both.

    Raises ValueError when neither is provided, or when the PDF can't be read.
    """
    pdf_bytes = pdf_bytes or None
    job_query = (job_query or "").strip()
    if not pdf_bytes and not job_query:
        raise ValueError("Provide a resume PDF or describe the job you're looking for.")

    # ── Resume-derived profile (optional) ─────────────────────────────
    resume_text = ""
    profile: dict[str, Any] = {
        "name": "", "school": "", "graduation_year": "", "major": "",
        "skills": [], "experience": [], "projects": [], "achievements": [],
    }
    if pdf_bytes:
        resume_text = _extract_resume_text(pdf_bytes)
        if len(resume_text) < 100:
            raise ValueError(
                "Resume PDF has too little text. Make sure it isn't a scanned image."
            )
        profile = _parse_profile(resume_text)

    # ── Extract concentrated intent from the prompt ──────────────────
    detected_role = _role_from_prompt(job_query) if job_query else ""
    detected_stage = _stage_from_prompt(job_query) if job_query else ""
    detected_location = _location_from_prompt(job_query) if job_query else ""

    # Fold concentrated prompt tokens (role + stage + proper nouns) into the
    # "skills" pool. We deliberately do NOT include every word from the
    # prompt — generic words like "early", "stage", "companies" would match
    # unrelated postings and pollute results.
    prompt_tokens = (
        _extract_prompt_tokens(job_query, detected_role, detected_stage)
        if job_query else []
    )
    if prompt_tokens:
        seen = {s.lower() for s in profile["skills"]}
        for t in prompt_tokens:
            if t not in seen:
                profile["skills"].append(t)
                seen.add(t)

    # Prompt-detected location wins over the default.
    effective_location = detected_location or location

    queries = _build_queries(profile, job_query=job_query)
    raw_jobs = _fetch_jobs_parallel(queries, effective_location)

    queries_for_response = [{"query": q, "weight": w} for (q, w) in queries]

    if not raw_jobs:
        return {
            "jobs": [],
            "profile_summary": _profile_summary(profile),
            "resume_chars": len(resume_text),
            "queries_used": queries_for_response,
            "job_query": job_query,
            "warning": "No live job postings found right now. Try again in a few minutes.",
        }

    resume_text_lower = resume_text.lower() if resume_text else ""
    scored = []
    for j in raw_jobs:
        score, skills_matched = _score_job(j, profile, resume_text_lower)
        scored.append((score, skills_matched, j))

    scored.sort(key=lambda t: t[0], reverse=True)

    # Min-score filter: drop anything weaker than 30/100 — those are
    # essentially "we don't know why this is here" results that hurt trust
    # more than they help. But always show at least 2 cards so the visitor
    # doesn't see an empty state when something is there.
    MIN_USEFUL_SCORE = 30
    strong = [t for t in scored if t[0] >= MIN_USEFUL_SCORE]
    if len(strong) >= 2:
        top = strong[:_FINAL_JOB_COUNT]
    else:
        # Take the top 2 even if they're below threshold so we don't ghost the user.
        top = scored[:max(2, len(strong))][:_FINAL_JOB_COUNT]

    return {
        "jobs": [_coerce_job(j, s, sk, profile, job_query) for (s, sk, j) in top],
        "profile_summary": _profile_summary(profile),
        "resume_chars": len(resume_text),
        "queries_used": queries_for_response,
        "job_query": job_query,
        "detected_role": detected_role,
        "detected_stage": detected_stage,
        "detected_location": detected_location,
        "total_candidates": len(raw_jobs),
        "min_score_threshold": MIN_USEFUL_SCORE,
    }


def _profile_summary(profile: dict) -> dict:
    """Lightweight, safe summary for the widget header."""
    return {
        "name": profile.get("name") or "",
        "school": profile.get("school") or "",
        "major": profile.get("major") or "",
        "graduation_year": profile.get("graduation_year") or "",
        "top_skills": (profile.get("skills") or [])[:6],
    }
