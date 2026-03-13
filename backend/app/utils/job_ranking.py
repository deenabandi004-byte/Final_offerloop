"""
Job ranking utilities — pure Python, no Flask imports.
Deterministic pre-filtering, GPT-based ranking, and feedback adjustments.
"""
from typing import Optional


# ---------------------------------------------------------------------------
# Data normalization helpers
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


def flatten_experience_title(title_field) -> str:
    if isinstance(title_field, str):
        return title_field
    if isinstance(title_field, dict):
        return title_field.get("name", "")
    return ""


# ---------------------------------------------------------------------------
# Field inference from major
# ---------------------------------------------------------------------------

MAJOR_FIELD_MAP = {
    "finance": "finance", "economics": "finance", "accounting": "finance",
    "investment": "finance", "computer science": "tech", "data science": "data",
    "information systems": "tech", "software": "tech", "electrical engineering": "tech",
    "marketing": "marketing", "business administration": "consulting",
    "management": "consulting", "statistics": "data", "mathematics": "data",
    "communications": "marketing", "psychology": "consulting",
    "real estate": "real_estate", "urban planning": "real_estate",
    "venture": "venture_capital", "entrepreneurship": "venture_capital",
}

FIELD_CATEGORY_MAP = {
    "finance":    ["finance_banking", "consulting"],
    "tech":       ["software_engineering", "data_science", "product_management"],
    "data":       ["data_science", "software_engineering", "product_management"],
    "marketing":  ["marketing_growth", "product_management"],
    "consulting": ["consulting", "finance_banking", "product_management"],
    "real_estate": ["real_estate", "finance_banking"],
    "venture_capital": ["venture_capital", "finance_banking", "consulting"],
}


def infer_field(profile: dict) -> Optional[str]:
    education = (profile.get("resumeParsed") or {}).get("education", {}) or {}
    major = (education.get("major") or profile.get("major") or "").lower().strip()
    for key, field in MAJOR_FIELD_MAP.items():
        if key in major:
            return field
    return None


def infer_preferred_type(profile: dict) -> Optional[str]:
    from datetime import datetime
    education = (profile.get("resumeParsed") or {}).get("education", {}) or {}
    grad_year = education.get("graduation_year") or profile.get("graduationYear")
    if not grad_year:
        return None
    try:
        return "FULLTIME" if int(grad_year) - datetime.now().year <= 1 else "INTERNSHIP"
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Deterministic pre-filter
# ---------------------------------------------------------------------------

def deterministic_score(job: dict, profile: dict) -> float:
    score = 0.0
    user_field = infer_field(profile)
    preferred_type = infer_preferred_type(profile)
    user_skills = set(s.lower() for s in flatten_skills(
        (profile.get("resumeParsed") or {}).get("skills", [])
    ))

    if user_field and job.get("category") in FIELD_CATEGORY_MAP.get(user_field, []):
        score += 40
    if preferred_type and job.get("type") == preferred_type:
        score += 30
    elif not preferred_type:
        score += 15
    if user_skills:
        desc_lower = job.get("description_raw", "").lower()
        score += min(sum(1 for s in user_skills if s in desc_lower) * 4, 20)

    education = (profile.get("resumeParsed") or {}).get("education", {}) or {}
    grad_year = education.get("graduation_year") or profile.get("graduationYear")
    if grad_year:
        try:
            from datetime import datetime
            years_left = int(grad_year) - datetime.now().year
            if years_left <= 1 and job.get("type") == "FULLTIME":
                score += 10
            elif years_left >= 2 and job.get("type") == "INTERNSHIP":
                score += 10
            else:
                score += 4
        except (ValueError, TypeError):
            pass

    return score


def prefilter_candidates(jobs: list[dict], profile: dict, top_n: int = 60) -> list[dict]:
    scored = sorted(
        [(job, deterministic_score(job, profile)) for job in jobs],
        key=lambda x: x[1], reverse=True
    )
    return [job for job, _ in scored[:top_n]]


# ---------------------------------------------------------------------------
# GPT ranking
# ---------------------------------------------------------------------------

def rank_with_gpt(jobs: list[dict], profile: dict) -> list[dict]:
    from backend.app.services.openai_client import client
    import json
    import re
    import logging

    logger = logging.getLogger(__name__)

    education = (profile.get("resumeParsed") or {}).get("education", {}) or {}
    skills = flatten_skills((profile.get("resumeParsed") or {}).get("skills", []))
    experience = (profile.get("resumeParsed") or {}).get("experience", []) or []

    exp_lines = ", ".join([
        f'{flatten_experience_title(e.get("title", ""))} at {e.get("company", "")}'
        for e in experience[:3]
        if flatten_experience_title(e.get("title", "")) and e.get("company")
    ]) or "None listed"

    profile_str = f"""STUDENT PROFILE:
- Major: {education.get("major") or profile.get("major", "Not specified")}
- Graduation: {education.get("graduation_year") or profile.get("graduationYear", "Not specified")}
- University: {education.get("school") or profile.get("university", "Not specified")}
- Skills: {", ".join(skills[:15]) or "None listed"}
- Experience: {exp_lines}"""

    jobs_str = "JOBS TO RANK:\n"
    for job in jobs:
        jobs_str += (
            f'[{job["job_id"]}] {job["title"]} at {job["company"]}\n'
            f'  Type: {job.get("type")} | Category: {job.get("category")} | Salary: {job.get("salary_display") or "Not listed"}\n'
            f'  {job.get("description_raw", "")[:250]}\n---\n'
        )

    system_prompt = """You are a job matching assistant for college students.
Rank jobs by fit using this EXACT priority order:
1. FIELD ALIGNMENT (most important) — job field matches their major/career interest
2. JOB TYPE FIT — internship/full-time matches their graduation timeline
3. SKILLS MATCH — their listed skills appear in job requirements
4. SENIORITY FIT — role is appropriate for their year in school

match_reason rules: max 12 words, specific and personal, mention their actual major OR a specific skill.
GOOD: "Strong fit for your Finance major and Excel skills"
BAD: "This job matches your profile"

Return ONLY a JSON array, no explanation, no markdown:
[{"job_id": "...", "match_score": 85, "match_reason": "..."}]
Order by match_score descending. Include every job_id provided."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": profile_str + "\n\n" + jobs_str},
            ],
            max_tokens=2000,
            temperature=0.3,
        )
        raw = re.sub(
            r"```(?:json)?", "",
            response.choices[0].message.content.strip()
        ).strip().rstrip("`").strip()
        ranking_map = {
            item["job_id"]: {
                "match_score": int(item.get("match_score", 50)),
                "match_reason": item.get("match_reason", "")
            }
            for item in json.loads(raw) if "job_id" in item
        }

        ranked = []
        for job in jobs:
            if job["job_id"] in ranking_map:
                job["match_score"] = ranking_map[job["job_id"]]["match_score"]
                job["match_reason"] = ranking_map[job["job_id"]]["match_reason"]
                job["ranked"] = True
            else:
                job["match_score"] = None
                job["match_reason"] = None
                job["ranked"] = False
            ranked.append(job)
        return sorted(ranked, key=lambda j: j.get("match_score") or 0, reverse=True)
    except Exception as e:
        logger.warning(f"GPT ranking failed: {e}")
        for job in jobs:
            job["match_score"] = None
            job["match_reason"] = None
            job["ranked"] = False
        return jobs


# ---------------------------------------------------------------------------
# Feedback adjustments
# ---------------------------------------------------------------------------

def apply_feedback_adjustments(ranked_jobs: list[dict], preferences: list[dict]) -> list[dict]:
    from collections import Counter

    liked = Counter()
    disliked = Counter()
    hidden = set()

    for p in preferences:
        cat = p.get("category", "")
        if p.get("signal") == "positive":
            liked[cat] += 1
        elif p.get("signal") == "negative":
            disliked[cat] += 1
            hidden.add(p.get("job_id", ""))

    adjusted = []
    for job in ranked_jobs:
        if job["job_id"] in hidden:
            continue
        if job.get("ranked") and job.get("match_score") is not None:
            score = job["match_score"]
            cat = job.get("category", "")
            score += min(liked.get(cat, 0) * 5, 15)
            score -= min(disliked.get(cat, 0) * 8, 24)
            job["match_score"] = max(0, min(100, score))
        adjusted.append(job)

    return sorted(adjusted, key=lambda j: j.get("match_score") or 0, reverse=True)
