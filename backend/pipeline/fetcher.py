"""
Fetch job listings from Greenhouse, Lever, and Workday board APIs.
Outputs a list of pre-normalized job dicts ready for the normalizer/writer.
"""
import logging
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
    "stripe", "figma", "notion", "airbnb", "doordash", "lyft", "coinbase",
    "robinhood", "palantir", "snap", "pinterest", "reddit", "dropbox",
    "twilio", "brex", "plaid", "rippling", "airtable", "carta", "chime",
    "ramp", "scaleai", "verkada", "benchling", "discord", "duolingo",
    "gitlab", "grammarly", "intercom", "retool", "webflow", "gusto",
    "lattice", "mercury", "faire", "canva",
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
# Main entry point
# ---------------------------------------------------------------------------

def fetch_jobs() -> list[dict]:
    """Fetch jobs from Greenhouse, Lever, and Workday concurrently.
    Returns a list of pre-normalized job dicts."""
    with ThreadPoolExecutor(max_workers=3) as pool:
        gh_future = pool.submit(_fetch_all_greenhouse)
        lv_future = pool.submit(_fetch_all_lever)
        wd_future = pool.submit(_fetch_all_workday)

        greenhouse_jobs = gh_future.result()
        lever_jobs = lv_future.result()
        workday_jobs = wd_future.result()

    all_jobs = greenhouse_jobs + lever_jobs + workday_jobs
    logger.info("Total: %d jobs fetched", len(all_jobs))
    return all_jobs
