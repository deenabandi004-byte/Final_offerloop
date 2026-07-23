"""Career stage derivation and job seniority classification.

Single source of truth for answering two questions the job board (and any
other surface) needs:

1. What career stage is this user in? Derived from the parsed resume
   (dated work history), graduation timing, an explicit userType set at
   onboarding, and title signals. Students keep the legacy
   internship/new_grad phases; professionals get early_career -> executive.

2. What seniority level is this job posting? Shared keyword classifier so
   the hard gates, the experienceLevel label the frontend filters on, and
   any ranking logic all agree on what "senior" means.

The pairing of the two is ALLOWED_JOB_LEVELS: which job levels a user at a
given stage should ever see. Gating is bidirectional by design — a
sophomore never sees a VP role, and a VP never sees a summer internship.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Iterable, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------

# User career stages, ordered junior -> senior.
CAREER_STAGES = [
    "internship",     # enrolled, >12 months from graduation
    "new_grad",       # graduating within 12 months, or graduated with <~1.5y experience
    "early_career",   # ~1.5-4 years of experience
    "mid_level",      # ~4-9 years
    "senior",         # ~9-16 years, or senior IC/lead titles
    "executive",      # 16+ years or Director/VP/C-suite titles
]

# Job posting seniority levels.
JOB_LEVELS = ["intern", "entry", "mid", "senior", "executive"]

# Which job levels each user stage is allowed to see. "unknown"/ambiguous
# postings are always allowed through (the gate stays lenient on no-signal).
ALLOWED_JOB_LEVELS = {
    "internship":   {"intern", "entry"},
    # "mid" stays allowed for new grads to preserve the legacy gate's
    # leniency toward "experienced" phrasing in otherwise-entry postings.
    "new_grad":     {"intern", "entry", "mid"},
    "early_career": {"entry", "mid"},
    "mid_level":    {"mid", "senior"},
    "senior":       {"mid", "senior", "executive"},
    "executive":    {"senior", "executive"},
}

# Years-of-experience boundaries between stages (used once the user is out
# of school or has no graduation signal).
_STAGE_BY_YEARS: List[Tuple[float, str]] = [
    (1.5, "new_grad"),
    (4.0, "early_career"),
    (9.0, "mid_level"),
    (16.0, "senior"),
    (float("inf"), "executive"),
]

# ---------------------------------------------------------------------------
# Resume experience parsing
# ---------------------------------------------------------------------------

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

_PRESENT_RE = re.compile(r"\b(present|current|now|ongoing|today)\b", re.I)
_MONTH_YEAR_RE = re.compile(
    r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|"
    r"aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)?"
    r"\.?,?\s*((?:19|20)\d{2})\b",
    re.I,
)


def _parse_date_token(text: str) -> Optional[Tuple[int, int]]:
    """Parse a single date endpoint like 'March 2024' or '2019' -> (year, month)."""
    m = _MONTH_YEAR_RE.search(text)
    if not m:
        return None
    month_str, year_str = m.group(1), m.group(2)
    month = _MONTHS.get(month_str.lower(), 6) if month_str else 6
    return int(year_str), month


def _parse_date_range(dates: str) -> Optional[Tuple[Tuple[int, int], Tuple[int, int]]]:
    """Parse a resume date range string into ((y, m), (y, m)) or None.

    Handles 'March 2024 – May 2025', '2019 - Present', 'Jun 2020 to Aug 2020'.
    """
    if not dates or not isinstance(dates, str):
        return None
    now = datetime.now()
    parts = re.split(r"\s*(?:–|—|−|-|\bto\b|~)\s*", dates, maxsplit=1)
    start = _parse_date_token(parts[0]) if parts else None
    if not start:
        return None
    if len(parts) > 1 and _PRESENT_RE.search(parts[1]):
        end: Optional[Tuple[int, int]] = (now.year, now.month)
    elif len(parts) > 1:
        end = _parse_date_token(parts[1])
    else:
        end = None
    if not end:
        # Single date (e.g. "Summer 2023") — count as a 3-month stint.
        end = (start[0] + (1 if start[1] > 9 else 0), min(start[1] + 3, 12))
    # Guard inverted or absurd ranges.
    if end < start or end[0] - start[0] > 60:
        return None
    # Don't count time in the future.
    if start > (now.year, now.month):
        return None
    end = min(end, (now.year, now.month))
    return start, end


def estimate_years_of_experience(experiences: Iterable[dict]) -> Optional[float]:
    """Sum non-overlapping months across dated resume experience entries.

    Returns None when no entry has a parseable date range (old resume format
    stored titles only), so callers can distinguish "no data" from "0 years".
    """
    intervals: List[Tuple[int, int]] = []  # (start_abs_month, end_abs_month)
    for exp in experiences or []:
        if not isinstance(exp, dict):
            continue
        parsed = _parse_date_range(exp.get("dates") or exp.get("date") or "")
        if not parsed:
            continue
        (sy, sm), (ey, em) = parsed
        intervals.append((sy * 12 + sm, ey * 12 + em))
    if not intervals:
        return None
    intervals.sort()
    merged: List[List[int]] = [list(intervals[0])]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    total_months = sum(end - start + 1 for start, end in merged)
    return round(total_months / 12.0, 1)


# ---------------------------------------------------------------------------
# Title signals
# ---------------------------------------------------------------------------

_EXEC_TITLE_RE = re.compile(
    r"\b(chief|ceo|cfo|coo|cto|cio|cmo|cpo|ciso|president|evp|svp|"
    r"managing\s+director|vice\s+president|vp|general\s+partner|"
    r"head\s+of|founder|co[-\s]?founder|owner|principal\b(?!\s+(engineer|scientist|analyst|consultant)))",
    re.I,
)

_SENIOR_TITLE_RE = re.compile(
    r"\b(senior|sr\.?|staff|principal|lead|director|manager)\b",
    re.I,
)

_INTERN_TITLE_RE = re.compile(
    r"\b(intern(ship)?|co[-\s]?op|summer\s+analyst|apprentice|trainee)\b",
    re.I,
)


def _title_stage_floor(titles: Iterable[str]) -> Optional[str]:
    """Minimum stage implied by the user's own job titles (most recent first)."""
    for title in titles:
        if not title:
            continue
        if _INTERN_TITLE_RE.search(title):
            # An intern title tells us nothing senior; keep scanning.
            continue
        if _EXEC_TITLE_RE.search(title):
            return "executive"
        if _SENIOR_TITLE_RE.search(title):
            return "senior"
        # Only the most recent non-intern title matters for the floor.
        return None
    return None


def _stage_index(stage: str) -> int:
    try:
        return CAREER_STAGES.index(stage)
    except ValueError:
        return 0


def _max_stage(a: str, b: str) -> str:
    return a if _stage_index(a) >= _stage_index(b) else b


# ---------------------------------------------------------------------------
# Career stage derivation
# ---------------------------------------------------------------------------

def derive_career_stage(
    graduation_year: Optional[int] = None,
    months_until_graduation: Optional[int] = None,
    experiences: Optional[List[dict]] = None,
    user_type: Optional[str] = None,
    years_experience_override: Optional[float] = None,
) -> dict:
    """Derive the user's career stage from every signal we have.

    Signal priority:
      1. Explicit years-of-experience the user stated (onboarding).
      2. Dated work history summed from the parsed resume.
      3. Graduation timing (the legacy student model).
      4. userType from onboarding as a tiebreak/default.

    Returns {stage, years_experience, is_student, source}.
    """
    experiences = experiences or []
    normalized_type = (user_type or "").lower()
    is_professional = normalized_type == "professional"
    is_explicit_student = normalized_type == "student"

    years = None
    source = "default"
    if years_experience_override is not None:
        try:
            years = float(years_experience_override)
            source = "stated"
        except (TypeError, ValueError):
            years = None
    if years is None:
        years = estimate_years_of_experience(experiences)
        if years is not None:
            source = "resume"

    # Currently enrolled with >1 year to go -> internship phase, unless the
    # profile says professional or the resume shows a real career already
    # (an exec doing an MBA should not be shown sophomore internships...
    # unless they told us they're a student again).
    if months_until_graduation is not None and months_until_graduation > 12:
        if is_explicit_student or (not is_professional and (years is None or years < 3)):
            return {"stage": "internship", "years_experience": years,
                    "is_student": True, "source": "graduation"}

    # Graduating within a year with little experience -> new grad.
    if months_until_graduation is not None and 0 < months_until_graduation <= 12:
        if is_explicit_student or (not is_professional and (years is None or years < 2)):
            return {"stage": "new_grad", "years_experience": years,
                    "is_student": True, "source": "graduation"}

    # An explicit "student" choice caps the stage at new_grad no matter what
    # the resume says: a current student wants student-appropriate roles.
    if is_explicit_student:
        return {"stage": "new_grad", "years_experience": years,
                "is_student": True, "source": "user_type"}

    # Out of school (or no graduation data): stage from experience.
    if years is not None:
        stage = "new_grad"
        for cutoff, name in _STAGE_BY_YEARS:
            if years < cutoff:
                stage = name
                break
        floor = _title_stage_floor(
            [e.get("title", "") for e in experiences if isinstance(e, dict)]
        )
        if floor:
            stage = _max_stage(stage, floor)
        return {"stage": stage, "years_experience": years,
                "is_student": False, "source": source}

    # No experience data. Fall back to graduation recency, then userType.
    if graduation_year is not None:
        now = datetime.now().year
        years_since_grad = now - graduation_year
        if years_since_grad <= 0:
            stage = "internship" if years_since_grad < -1 else "new_grad"
            return {"stage": stage, "years_experience": None,
                    "is_student": True, "source": "graduation"}
        # Graduated N years ago with no resume data: assume they worked since.
        stage = "new_grad"
        for cutoff, name in _STAGE_BY_YEARS:
            if years_since_grad < cutoff:
                stage = name
                break
        return {"stage": stage, "years_experience": float(years_since_grad),
                "is_student": False, "source": "graduation_recency"}

    if is_professional:
        return {"stage": "early_career", "years_experience": None,
                "is_student": False, "source": "user_type"}

    # Legacy default for the student product: assume internship seeker.
    return {"stage": "internship", "years_experience": None,
            "is_student": True, "source": "default"}


# ---------------------------------------------------------------------------
# Job posting classification
# ---------------------------------------------------------------------------

_JOB_INTERN_RE = _INTERN_TITLE_RE
_JOB_EXEC_RE = re.compile(
    r"\b(chief|ceo|cfo|coo|cto|cio|cmo|cpo|ciso|president|evp|svp|"
    r"managing\s+director|vice\s+president|vp|head\s+of|general\s+manager)\b",
    re.I,
)
_JOB_SENIOR_RE = re.compile(
    r"\b(senior|sr\.?|staff|principal|lead|director|manager|"
    r"(?:8|9|10|12|15)\+?\s*years)\b",
    re.I,
)
_JOB_ENTRY_RE = re.compile(
    r"\b(entry[-\s]?level|new\s+grad(uate)?|recent\s+grad(uate)?|junior|jr\.?|"
    r"early[-\s]career|campus\s+hire|rotational|graduate\s+program|"
    r"university\s+graduate|0[-–]\s?[123]\s*years|associate)\b",
    re.I,
)
_JOB_MID_RE = re.compile(
    r"\b((?:[3-7])\+?\s*years|experienced|mid[-\s]?level|level\s+(?:ii|iii|2|3)\b|"
    r"\bii\b|\biii\b)",
    re.I,
)


def classify_job_level(title: str, description: str = "") -> str:
    """Classify a job posting into intern/entry/mid/senior/executive/unknown.

    Title signals dominate; the description is only consulted for
    years-of-experience phrasing when the title is silent.
    """
    title = title or ""
    if _JOB_INTERN_RE.search(title):
        return "intern"
    if _JOB_EXEC_RE.search(title):
        return "executive"
    if _JOB_SENIOR_RE.search(title):
        return "senior"
    if _JOB_ENTRY_RE.search(title):
        return "entry"
    if _JOB_MID_RE.search(title):
        return "mid"
    desc = (description or "")[:1500]
    if _JOB_ENTRY_RE.search(desc) or _JOB_INTERN_RE.search(desc):
        return "entry"
    if _JOB_MID_RE.search(desc):
        return "mid"
    if _JOB_SENIOR_RE.search(desc):
        return "senior"
    return "unknown"


def job_level_allowed(user_stage: str, job_level: str) -> bool:
    """Bidirectional check: may a user at this stage see this job level?

    Unknown stages and unknown job levels are always allowed (lenient on
    missing signal, strict on positive signal).
    """
    if job_level in (None, "", "unknown"):
        return True
    allowed = ALLOWED_JOB_LEVELS.get(user_stage)
    if not allowed:
        return True
    return job_level in allowed
