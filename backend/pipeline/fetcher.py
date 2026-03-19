"""
Fetch job listings from Greenhouse, Lever, Workday, Ashby, and Fantastic.jobs APIs.
Outputs a list of pre-normalized job dicts ready for the normalizer/writer.
"""
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15

# ---------------------------------------------------------------------------
# Company configs
# ---------------------------------------------------------------------------

GREENHOUSE_SLUGS = [
    "stripe", "figma", "airbnb", "doordash", "lyft", "coinbase", "robinhood",
    "palantir", "snap", "pinterest", "reddit", "dropbox", "twilio", "brex",
    "plaid", "airtable", "carta", "chime", "scaleai", "verkada", "benchling",
    "discord", "duolingo", "gitlab", "grammarly", "intercom", "webflow",
    "gusto", "lattice", "mercury", "faire", "canva", "shopify-1",
    "squarespace", "hubspot", "zendesk-inc", "boxinc", "cloudflare",
    "hashicorp-inc", "mongodb", "databricks", "snowflake-computing",
    "confluent-inc",
]

LEVER_SLUGS = [
    "uber", "netflix", "spotify", "anthropic", "openai", "anduril",
    "rivian", "waymo", "aurora", "recursion", "asana", "calm", "hims",
    "ro", "oscar-health", "devoted-health", "cityblock", "quartet",
    "scale-ai", "nuro",
]

# (display_name, workday_id, career_site)
WORKDAY_COMPANIES = [
    ("Goldman Sachs", "goldmansachs", "External_Career_Site"),
    ("JP Morgan", "jpmorgan", "jpmorgan-External"),
    ("Morgan Stanley", "morganstanley", "Careers"),
    ("McKinsey", "mckinsey", "McKinsey"),
    ("BCG", "bcg", "BCG"),
    ("Bain", "bain", "BAC"),
    ("Deloitte", "deloitte", "DeloitteCareers"),
    ("Accenture", "accenture", "Accenture-Careers"),
    ("Blackstone", "blackstone", "campus"),
    ("KKR", "kkr", "KKR"),
    ("Citadel", "citadel", "Citadel"),
    ("PwC", "pwc", "PWCCampus"),
    ("EY", "ey", "EYJobSearch"),
    ("Bank of America", "bofa", "en-US"),
    ("Bridgewater", "bridgewater", "Bridgewater"),
]

ASHBY_SLUGS = [
    "linear", "vercel", "loom", "descript", "notion",
    "retool", "mercury", "ramp", "rippling", "deel",
    "brex", "runway", "replit", "supabase", "planetscale",
    "ashby", "coda", "superhuman", "figma", "clerk",
    "resend", "cal", "raycast", "Screen", "turso",
]

# ---------------------------------------------------------------------------
# HTML stripping helper
# ---------------------------------------------------------------------------

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(html: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    text = _TAG_RE.sub(" ", html)
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------------------
# Greenhouse fetcher
# ---------------------------------------------------------------------------

def _fetch_greenhouse(slug: str) -> list[dict]:
    url = f"https://boards.greenhouse.io/v1/boards/{slug}/jobs?content=true"
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Greenhouse [%s] failed: %s", slug, exc)
        return []

    jobs = []
    for job in data.get("jobs", []):
        title = job.get("title", "")
        location_name = ""
        if job.get("location"):
            location_name = job["location"].get("name", "")

        content = _strip_html(job.get("content", ""))[:8000]

        jobs.append({
            "job_id": f"greenhouse_{slug}_{job['id']}",
            "source": "greenhouse",
            "title": title,
            "company": slug.replace("-", " ").title(),
            "employer_logo": None,
            "location": location_name or "United States",
            "remote": "remote" in location_name.lower(),
            "description_raw": content,
            "apply_url": job.get("absolute_url", ""),
            "posted_at": job.get("updated_at"),
            "salary_min": None,
            "salary_max": None,
            "salary_period": None,
        })

    logger.info("  Greenhouse [%s] → %d jobs", slug, len(jobs))
    return jobs


def _fetch_all_greenhouse() -> list[dict]:
    results = []
    companies_with_jobs = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch_greenhouse, slug): slug for slug in GREENHOUSE_SLUGS}
        for future in as_completed(futures):
            jobs = future.result()
            if jobs:
                companies_with_jobs += 1
            results.extend(jobs)
    logger.info("Greenhouse: %d jobs from %d companies", len(results), companies_with_jobs)
    return results


# ---------------------------------------------------------------------------
# Lever fetcher
# ---------------------------------------------------------------------------

def _fetch_lever(slug: str) -> list[dict]:
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Lever [%s] failed: %s", slug, exc)
        return []

    if not isinstance(data, list):
        logger.warning("Lever [%s] unexpected response type: %s", slug, type(data).__name__)
        return []

    jobs = []
    for posting in data:
        title = posting.get("text", "")
        categories = posting.get("categories", {}) or {}
        location = categories.get("location", "") or ""
        workplace = (posting.get("workplaceType") or "").lower()

        created_ms = posting.get("createdAt")
        posted_at = None
        if created_ms:
            try:
                posted_at = datetime.fromtimestamp(created_ms / 1000, tz=timezone.utc).isoformat()
            except (ValueError, OSError, TypeError):
                pass

        description = (posting.get("descriptionPlain") or "")[:8000]

        jobs.append({
            "job_id": f"lever_{slug}_{posting['id']}",
            "source": "lever",
            "title": title,
            "company": slug.replace("-", " ").title(),
            "employer_logo": None,
            "location": location or "United States",
            "remote": workplace == "remote",
            "description_raw": description,
            "apply_url": posting.get("hostedUrl", ""),
            "posted_at": posted_at,
            "salary_min": None,
            "salary_max": None,
            "salary_period": None,
        })

    logger.info("  Lever [%s] → %d jobs", slug, len(jobs))
    return jobs


def _fetch_all_lever() -> list[dict]:
    results = []
    companies_with_jobs = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch_lever, slug): slug for slug in LEVER_SLUGS}
        for future in as_completed(futures):
            jobs = future.result()
            if jobs:
                companies_with_jobs += 1
            results.extend(jobs)
    logger.info("Lever: %d jobs from %d companies", len(results), companies_with_jobs)
    return results


# ---------------------------------------------------------------------------
# Workday fetcher
# ---------------------------------------------------------------------------

def _fetch_workday(name: str, workday_id: str, career_site: str) -> list[dict]:
    url = f"https://{workday_id}.wd1.myworkdayjobs.com/wday/cxs/{workday_id}/{career_site}/jobs"
    body = {
        "appliedFacets": {},
        "limit": 20,
        "offset": 0,
        "searchText": "",
    }
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }
    try:
        resp = requests.post(url, json=body, headers=headers, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Workday [%s] failed: %s", name, exc)
        return []

    postings = data.get("jobPostings", [])
    jobs = []
    for posting in postings:
        title = posting.get("title", "")
        bullet_fields = posting.get("bulletFields", [])
        if bullet_fields and not title:
            title = bullet_fields[0]

        location = posting.get("locationsText", "") or "United States"
        external_path = posting.get("externalPath", "")
        apply_url = f"https://{workday_id}.wd1.myworkdayjobs.com{external_path}" if external_path else ""

        # Build a stable job_id from workday_id + external_path slug
        path_slug = external_path.rstrip("/").rsplit("/", 1)[-1][:40] if external_path else title[:30].replace(" ", "_")
        job_id = f"workday_{workday_id}_{path_slug}"

        jobs.append({
            "job_id": job_id,
            "source": "workday",
            "title": title,
            "company": name,
            "employer_logo": None,
            "location": location,
            "remote": "remote" in location.lower(),
            "description_raw": "",
            "apply_url": apply_url,
            "posted_at": None,
            "salary_min": None,
            "salary_max": None,
            "salary_period": None,
        })

    logger.info("  Workday [%s] → %d jobs", name, len(jobs))
    return jobs


def _fetch_all_workday() -> list[dict]:
    results = []
    companies_with_jobs = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(_fetch_workday, name, wid, site): name
            for name, wid, site in WORKDAY_COMPANIES
        }
        for future in as_completed(futures):
            jobs = future.result()
            if jobs:
                companies_with_jobs += 1
            results.extend(jobs)
    logger.info("Workday: %d jobs from %d companies", len(results), companies_with_jobs)
    return results


# ---------------------------------------------------------------------------
# Ashby fetcher
# ---------------------------------------------------------------------------

_ASHBY_TYPE_MAP = {
    "FullTime": "FULLTIME",
    "PartTime": "PARTTIME",
    "Intern": "INTERNSHIP",
}


def _fetch_ashby(slug: str) -> list[dict]:
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Ashby [%s] failed: %s", slug, exc)
        return []

    jobs = []
    for job in data.get("jobs", []):
        title = job.get("title", "")
        location = job.get("locationName") or "Remote"
        description = _strip_html(job.get("descriptionHtml") or "")[:8000]
        employment_type = job.get("employmentType") or ""

        jobs.append({
            "job_id": f"ashby_{slug}_{job['id']}",
            "source": "ashby",
            "title": title,
            "company": slug.replace("-", " ").title(),
            "employer_logo": None,
            "location": location,
            "remote": bool(job.get("isRemote")),
            "description_raw": description,
            "apply_url": job.get("jobUrl", ""),
            "posted_at": job.get("publishedAt"),
            "salary_min": None,
            "salary_max": None,
            "salary_period": None,
            "_employment_type": _ASHBY_TYPE_MAP.get(employment_type, ""),
        })

    logger.info("  Ashby [%s] → %d jobs", slug, len(jobs))
    return jobs


def _fetch_all_ashby() -> list[dict]:
    results = []
    companies_with_jobs = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch_ashby, slug): slug for slug in ASHBY_SLUGS}
        for future in as_completed(futures):
            jobs = future.result()
            if jobs:
                companies_with_jobs += 1
            results.extend(jobs)
    logger.info("Ashby: %d jobs from %d companies", len(results), companies_with_jobs)
    return results


# ---------------------------------------------------------------------------
# Fantastic.jobs (RapidAPI active-jobs-db) fetcher
# ---------------------------------------------------------------------------

FANTASTICJOBS_BASE_URL = "https://active-jobs-db.p.rapidapi.com/active-ats-7d"
FANTASTICJOBS_HOST = "active-jobs-db.p.rapidapi.com"

FANTASTICJOBS_COMPANIES = {
    "finance": [
        "JPMorgan Chase & Co.",
        "Goldman Sachs",
        "Morgan Stanley",
        "Bank of America",
        "Citigroup",
        "Wells Fargo",
    ],
    "consulting": [
        "Deloitte",
        "McKinsey & Company",
        "Boston Consulting Group",
        "Bain & Company",
        "Accenture",
        "PwC",
        "EY",
        "Oliver Wyman",
    ],
    "pe_finance": [
        "Blackstone",
        "KKR",
        "Citadel",
        "Bridgewater Associates",
        "Two Sigma",
    ],
}


def _fantasticjobs_headers() -> dict:
    return {
        "x-rapidapi-key": os.getenv("RAPIDAPI_KEY"),
        "x-rapidapi-host": FANTASTICJOBS_HOST,
    }


def _extract_fj_location(job: dict) -> str:
    """Extract location from Fantastic.jobs job data."""
    locations = job.get("locations_derived") or []
    if locations and isinstance(locations[0], dict):
        parts = []
        city = locations[0].get("city")
        state = locations[0].get("state")
        if city:
            parts.append(city)
        if state:
            parts.append(state)
        if parts:
            return ", ".join(parts)
    raw_locs = job.get("locations_raw") or []
    if raw_locs and isinstance(raw_locs[0], dict):
        addr = raw_locs[0].get("address")
        if addr:
            return addr
    return ""


def _normalize_fj_job(job: dict) -> dict:
    """Convert a single Fantastic.jobs API result to our pre-normalized format."""
    return {
        "job_id": f"fantasticjobs_{job['id']}",
        "source": "fantasticjobs",
        "title": job.get("title", ""),
        "company": job.get("organization", ""),
        "employer_logo": job.get("organization_logo"),
        "location": _extract_fj_location(job) or "United States",
        "remote": bool(job.get("remote_derived", False)),
        "description_raw": (job.get("description") or "")[:8000],
        "apply_url": job.get("url", ""),
        "posted_at": job.get("date_posted"),
        "salary_min": None,
        "salary_max": None,
        "salary_period": None,
    }


def _fetch_fantasticjobs_company(company: str) -> list[dict]:
    """Fetch jobs for a single company from Fantastic.jobs."""
    params = {
        "limit": "100",
        "offset": "0",
        "advanced_organization_filter": f"{company}:*",
        "description_type": "text",
        "location_filter": "United States",
    }
    try:
        resp = requests.get(
            FANTASTICJOBS_BASE_URL,
            headers=_fantasticjobs_headers(),
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Fantastic.jobs [%s] failed: %s", company, exc)
        return []

    jobs_data = data if isinstance(data, list) else data.get("data", [])
    jobs = [_normalize_fj_job(j) for j in jobs_data if j.get("id") and j.get("title")]
    logger.info("  Fantastic.jobs [%s] → %d jobs", company, len(jobs))
    return jobs


def _fetch_fantasticjobs_internships() -> list[dict]:
    """Fetch internship listings across all companies."""
    params = {
        "limit": "100",
        "offset": "0",
        "ai_employment_type_filter": "INTERN",
        "description_type": "text",
        "location_filter": "United States",
    }
    try:
        resp = requests.get(
            FANTASTICJOBS_BASE_URL,
            headers=_fantasticjobs_headers(),
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Fantastic.jobs [internships] failed: %s", exc)
        return []

    jobs_data = data if isinstance(data, list) else data.get("data", [])
    jobs = [_normalize_fj_job(j) for j in jobs_data if j.get("id") and j.get("title")]
    logger.info("  Fantastic.jobs [internships] → %d jobs", len(jobs))
    return jobs


def fetch_fantasticjobs() -> list[dict]:
    """Fetch jobs from Fantastic.jobs API for target companies + internships."""
    if not os.getenv("RAPIDAPI_KEY"):
        logger.info("Fantastic.jobs: skipped (no API key)")
        return []

    all_companies = []
    for companies in FANTASTICJOBS_COMPANIES.values():
        all_companies.extend(companies)

    results = []
    companies_with_jobs = 0

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch_fantasticjobs_company, c): c for c in all_companies}
        # TODO: re-enable after upgrading to Pro plan with taxonomy filters
        # futures[pool.submit(_fetch_fantasticjobs_internships)] = "internships"

        for future in as_completed(futures):
            jobs = future.result()
            if jobs:
                companies_with_jobs += 1
            results.extend(jobs)

    # Deduplicate by job_id (internship call may overlap with company calls)
    seen = set()
    deduped = []
    for job in results:
        if job["job_id"] not in seen:
            seen.add(job["job_id"])
            deduped.append(job)

    logger.info("Fantastic.jobs: %d jobs from %d companies", len(deduped), companies_with_jobs)
    return deduped


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def fetch_jobs() -> list[dict]:
    """Fetch jobs from Greenhouse, Lever, Workday, Ashby, and Fantastic.jobs concurrently.
    Returns a list of pre-normalized job dicts."""
    with ThreadPoolExecutor(max_workers=5) as pool:
        gh_future = pool.submit(_fetch_all_greenhouse)
        lv_future = pool.submit(_fetch_all_lever)
        wd_future = pool.submit(_fetch_all_workday)
        ab_future = pool.submit(_fetch_all_ashby)
        fj_future = pool.submit(fetch_fantasticjobs)

        greenhouse_jobs = gh_future.result()
        lever_jobs = lv_future.result()
        workday_jobs = wd_future.result()
        ashby_jobs = ab_future.result()
        fantasticjobs = fj_future.result()

    all_jobs = greenhouse_jobs + lever_jobs + workday_jobs + ashby_jobs + fantasticjobs
    logger.info("Total: %d jobs fetched", len(all_jobs))
    return all_jobs
