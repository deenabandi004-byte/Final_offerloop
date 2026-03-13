"""
Normalize raw JSearch results into a consistent Firestore document schema.
Uses OpenAI gpt-4o-mini for salary extraction when structured data is missing.
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from backend.app.services.openai_client import get_openai_client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Job type normalization
# ---------------------------------------------------------------------------

_TYPE_MAP = {
    "FULLTIME": "FULLTIME",
    "FULL_TIME": "FULLTIME",
    "PERMANENT": "FULLTIME",
    "CONTRACTOR": "FULLTIME",
    "PARTTIME": "PARTTIME",
    "PART_TIME": "PARTTIME",
    "INTERN": "INTERNSHIP",
    "INTERNSHIP": "INTERNSHIP",
}


def normalize_type(raw_type: str | None, title: str) -> str:
    title_lower = (title or "").lower()
    if any(kw in title_lower for kw in ("intern", "internship", "co-op")):
        return "INTERNSHIP"
    if any(kw in title_lower for kw in ("part time", "part-time")):
        return "PARTTIME"
    if raw_type:
        mapped = _TYPE_MAP.get(raw_type.upper().strip())
        if mapped:
            return mapped
    return "FULLTIME"


# ---------------------------------------------------------------------------
# Salary helpers
# ---------------------------------------------------------------------------

def extract_salary_from_structured(job: dict) -> dict:
    """Pull salary from JSearch structured fields. Returns {} if both min/max are missing."""
    sal_min = job.get("job_min_salary")
    sal_max = job.get("job_max_salary")
    period = (job.get("job_salary_period") or "").upper().strip()

    if sal_min is None and sal_max is None:
        return {}

    return {
        "salary_min": float(sal_min) if sal_min is not None else None,
        "salary_max": float(sal_max) if sal_max is not None else None,
        "salary_period": period if period in ("HOUR", "YEAR") else None,
        "salary_extracted": False,
    }


def extract_salary_from_description(description: str) -> dict:
    """Use OpenAI gpt-4o-mini to estimate salary from description text. Returns {} on failure."""
    if not description or len(description.strip()) < 50:
        return {}

    snippet = description[:1500]
    try:
        client = get_openai_client()
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a salary extraction tool. Return only valid JSON, no explanation.",
                },
                {
                    "role": "user",
                    "content": (
                        f"Extract salary info from this job description. "
                        f"Return JSON: {{\"salary_min\": number|null, \"salary_max\": number|null, "
                        f"\"salary_period\": \"HOUR\" or \"YEAR\", \"found\": true/false}}\n\n{snippet}"
                    ),
                },
            ],
            max_tokens=150,
            temperature=0,
        )
        text = resp.choices[0].message.content.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        data = json.loads(text)
        if not data.get("found"):
            return {}
        return {
            "salary_min": float(data["salary_min"]) if data.get("salary_min") is not None else None,
            "salary_max": float(data["salary_max"]) if data.get("salary_max") is not None else None,
            "salary_period": data.get("salary_period", "YEAR").upper(),
            "salary_extracted": True,
        }
    except Exception as exc:
        logger.debug("Salary extraction via OpenAI failed: %s", exc)
        return {}


_ANNUAL_MULTIPLIER = {
    "HOUR": 2080,
    "WEEK": 52,
    "MONTH": 12,
    "YEAR": 1,
}


def _salary_normalized_annual(sal_min, sal_max, period) -> int | None:
    """Convert to annual integer using period-appropriate multiplier."""
    val = sal_max or sal_min
    if val is None:
        return None
    multiplier = _ANNUAL_MULTIPLIER.get(period, 1)
    return int(val * multiplier)


def _format_salary_display(sal_min, sal_max, period, extracted: bool) -> str | None:
    prefix = "~" if extracted else ""
    if period == "HOUR":
        parts = []
        if sal_min is not None:
            parts.append(f"${int(sal_min)}")
        if sal_max is not None:
            parts.append(f"${int(sal_max)}")
        return f"{prefix}{('–').join(parts)}/hr" if parts else None
    # WEEK, MONTH, YEAR — annualize then display as $Xk/yr
    multiplier = _ANNUAL_MULTIPLIER.get(period, 1)
    parts = []
    if sal_min is not None:
        parts.append(f"${int(sal_min * multiplier / 1000)}k")
    if sal_max is not None:
        parts.append(f"${int(sal_max * multiplier / 1000)}k")
    return f"{prefix}{('–').join(parts)}/yr" if parts else None


# ---------------------------------------------------------------------------
# Skills helper
# ---------------------------------------------------------------------------

def flatten_skills(skills_field) -> list[str]:
    if isinstance(skills_field, list):
        return [s for s in skills_field if isinstance(s, str)]
    if isinstance(skills_field, dict):
        flat = []
        for v in skills_field.values():
            if isinstance(v, list):
                flat.extend([s for s in v if isinstance(s, str)])
        return flat
    return []


# ---------------------------------------------------------------------------
# Location helper
# ---------------------------------------------------------------------------

def _normalize_location(job: dict) -> tuple[str, bool]:
    remote = bool(job.get("job_is_remote"))
    city = job.get("job_city") or ""
    state = job.get("job_state") or ""
    if remote and not city:
        return "Remote", True
    parts = [p for p in (city, state) if p]
    loc = ", ".join(parts) if parts else "United States"
    return loc, remote


# ---------------------------------------------------------------------------
# Main normalize
# ---------------------------------------------------------------------------

def normalize_job(raw: dict) -> dict | None:
    """Convert a single raw JSearch result to normalized Firestore doc. Returns None if invalid."""
    job_id = raw.get("job_id")
    title = raw.get("job_title")
    company = raw.get("employer_name")

    if not job_id or not title or not company:
        return None

    location, remote = _normalize_location(raw)
    raw_type = raw.get("job_employment_type") or ""
    job_type = normalize_type(raw_type, title)
    category = raw.get("_category", "other")
    description = (raw.get("job_description") or "")[:8000]

    now = datetime.now(timezone.utc)

    # Posted date
    posted_str = raw.get("job_posted_at_datetime_utc")
    try:
        posted_at = datetime.fromisoformat(posted_str.replace("Z", "+00:00")) if posted_str else now
    except (ValueError, AttributeError):
        posted_at = now

    # Salary
    salary = extract_salary_from_structured(raw)
    if not salary and description:
        salary = extract_salary_from_description(description)

    sal_min = salary.get("salary_min")
    sal_max = salary.get("salary_max")
    sal_period = salary.get("salary_period")
    sal_extracted = salary.get("salary_extracted", False)

    return {
        "job_id": job_id,
        "source": "jsearch",
        "title": title,
        "company": company,
        "employer_logo": raw.get("employer_logo"),
        "location": location,
        "remote": remote,
        "type": job_type,
        "type_raw": raw_type,
        "category": category,
        "description_raw": description,
        "apply_url": raw.get("job_apply_link") or raw.get("job_google_link"),
        "salary_min": sal_min,
        "salary_max": sal_max,
        "salary_period": sal_period,
        "salary_display": _format_salary_display(sal_min, sal_max, sal_period, sal_extracted) if salary else None,
        "salary_normalized_annual": _salary_normalized_annual(sal_min, sal_max, sal_period) if salary else None,
        "salary_extracted": sal_extracted,
        "posted_at": posted_at,
        "fetched_at": now,
        "expires_at": now + timedelta(days=14),
    }


def normalize_all(raw_jobs: list[dict]) -> list[dict]:
    """Normalize a batch of raw jobs. Skips invalid entries."""
    normalized = []
    skipped = 0
    for raw in raw_jobs:
        doc = normalize_job(raw)
        if doc:
            normalized.append(doc)
        else:
            skipped += 1
    logger.info("Normalized %d jobs, skipped %d invalid", len(normalized), skipped)
    return normalized
