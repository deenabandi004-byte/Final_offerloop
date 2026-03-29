"""
Fetch job listings from Greenhouse, Lever, Workday, Ashby, and Fantastic.jobs APIs.
Outputs a list of pre-normalized job dicts ready for the normalizer/writer.
"""
import logging
import os
import re
import time
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
    "big_tech": [
        "Google",
        "Meta",
        "Apple",
        "Amazon",
        "Microsoft",
        "Netflix",
        "Uber",
        "Salesforce",
        "Adobe",
        "Oracle",
        "IBM",
        "Nvidia",
        "PayPal",
        "Visa",
        "Mastercard",
        "Workday",
        "ServiceNow",
        "Palo Alto Networks",
        "Block",
        "Intuit",
        "Snap Inc.",
        "Pinterest",
        "Twitter",
        "LinkedIn",
        "DoorDash",
        "Lyft",
        "Instacart",
        "Rivian",
        "Palantir Technologies",
    ],
    "finance": [
        "JPMorgan Chase & Co.",
        "Goldman Sachs",
        "Morgan Stanley",
        "Bank of America",
        "Citigroup",
        "Wells Fargo",
        "BlackRock",
        "Vanguard",
        "Fidelity Investments",
        "Charles Schwab",
        "Capital One",
        "American Express",
    ],
    "consulting": [
        "Deloitte US",
        "McKinsey",
        "Boston Consulting Group",
        "Bain",
        "Accenture",
        "PwC",
        "EY",
        "KPMG",
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

# (label, extra_params dict) — merged with _FJ_CATEGORY_BASE_PARAMS at call time
FANTASTICJOBS_CATEGORIES = [
    ("product_management", {"title_filter": "product manager"}),
    ("data_science", {"title_filter": "data scientist OR data analyst OR machine learning"}),
    ("software_engineering", {"title_filter": "software engineer OR software developer"}),
    ("marketing", {"title_filter": "marketing manager OR growth marketing OR brand marketing"}),
    ("finance_analyst", {"title_filter": "financial analyst OR investment analyst"}),
    ("consulting_analyst", {"title_filter": "consultant OR business analyst OR strategy analyst"}),
    ("design", {"title_filter": "product designer OR UX designer OR UI designer"}),
    ("operations", {"title_filter": "operations analyst OR business operations"}),
    ("entry_level", {"ai_experience_level_filter": "0-2"}),
    ("internships", {
        "ai_employment_type_filter": "INTERN",
        "ai_taxonomies_a_filter": "Technology,Finance & Accounting,Consulting,Data & Analytics,Software,Marketing,Management & Leadership",
    }),
]


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
    """Fetch jobs for a single company from Fantastic.jobs.

    Tries organization_filter (exact match) first. If 0 results, retries
    with advanced_organization_filter using a wildcard prefix search.
    """
    headers = _fantasticjobs_headers()
    base_params = {
        "limit": "100",
        "offset": "0",
        "description_type": "text",
        "location_filter": "United States",
        "agency": "false",
    }

    # Attempt 1: exact match via organization_filter
    params = {**base_params, "organization_filter": company}
    try:
        resp = requests.get(
            FANTASTICJOBS_BASE_URL,
            headers=headers,
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code == 429:
            logger.warning("Fantastic.jobs [%s] rate limited, waiting 60s...", company)
            time.sleep(60)
            resp = requests.get(
                FANTASTICJOBS_BASE_URL,
                headers=headers,
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

    # Attempt 2: wildcard prefix search if exact match returned nothing
    if not jobs:
        logger.info("  Fantastic.jobs [%s] exact match returned 0, trying wildcard", company)
        time.sleep(1.5)
        params = {**base_params, "advanced_organization_filter": f"{company}:*"}
        try:
            resp = requests.get(
                FANTASTICJOBS_BASE_URL,
                headers=headers,
                params=params,
                timeout=REQUEST_TIMEOUT,
            )
            if resp.status_code == 429:
                logger.warning("Fantastic.jobs [%s] wildcard rate limited, waiting 60s...", company)
                time.sleep(60)
                resp = requests.get(
                    FANTASTICJOBS_BASE_URL,
                    headers=headers,
                    params=params,
                    timeout=REQUEST_TIMEOUT,
                )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("Fantastic.jobs [%s] wildcard failed: %s", company, exc)
            return []
        jobs_data = data if isinstance(data, list) else data.get("data", [])
        jobs = [_normalize_fj_job(j) for j in jobs_data if j.get("id") and j.get("title")]

    logger.info("  Fantastic.jobs [%s] → %d jobs", company, len(jobs))
    return jobs


_FJ_CATEGORY_BASE_PARAMS = {
    "limit": "100",
    "offset": "0",
    "description_type": "text",
    "location_filter": "United States",
    "agency": "false",
    "li_organization_employees_gte": "500",
}


def _fetch_fantasticjobs_category(label: str, extra_params: dict) -> list[dict]:
    """Fetch jobs for a single category/title-based query from Fantastic.jobs."""
    params = {**_FJ_CATEGORY_BASE_PARAMS, **extra_params}
    headers = _fantasticjobs_headers()
    try:
        resp = requests.get(
            FANTASTICJOBS_BASE_URL,
            headers=headers,
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code == 429:
            logger.warning("Fantastic.jobs [category:%s] rate limited, waiting 60s...", label)
            time.sleep(60)
            resp = requests.get(
                FANTASTICJOBS_BASE_URL,
                headers=headers,
                params=params,
                timeout=REQUEST_TIMEOUT,
            )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Fantastic.jobs [category:%s] failed: %s", label, exc)
        return []

    jobs_data = data if isinstance(data, list) else data.get("data", [])
    jobs = [_normalize_fj_job(j) for j in jobs_data if j.get("id") and j.get("title")]
    logger.info("  Fantastic.jobs [category:%s] → %d jobs", label, len(jobs))
    return jobs


def fetch_fantasticjobs() -> list[dict]:
    """Fetch jobs from Fantastic.jobs: companies → categories.

    Runs sequentially with 1.5s sleep between requests to stay within the
    RapidAPI rate limit. Initial 3s delay lets concurrent fetchers finish first.
    """
    if not os.getenv("RAPIDAPI_KEY"):
        logger.info("Fantastic.jobs: skipped (no API key)")
        return []

    # Let Greenhouse/Lever/Workday/Ashby finish their burst first
    time.sleep(3)

    all_companies = []
    for companies in FANTASTICJOBS_COMPANIES.values():
        all_companies.extend(companies)

    results = []
    company_count = 0
    category_count = 0
    request_num = 0

    # Phase 1: Company-specific fetches
    for company in all_companies:
        if request_num > 0:
            time.sleep(1.5)
        request_num += 1
        jobs = _fetch_fantasticjobs_company(company)
        if jobs:
            company_count += 1
        results.extend(jobs)

    company_jobs_total = len(results)
    logger.info("Fantastic.jobs companies: %d jobs from %d companies", company_jobs_total, company_count)

    # Phase 2: Category / title-based fetches
    for label, extra_params in FANTASTICJOBS_CATEGORIES:
        time.sleep(1.5)
        request_num += 1
        jobs = _fetch_fantasticjobs_category(label, extra_params)
        if jobs:
            category_count += 1
        results.extend(jobs)

    category_jobs_total = len(results) - company_jobs_total
    logger.info("Fantastic.jobs categories: %d jobs from %d categories", category_jobs_total, category_count)

    # Deduplicate by job_id (categories may overlap with company calls)
    seen = set()
    deduped = []
    for job in results:
        if job["job_id"] not in seen:
            seen.add(job["job_id"])
            deduped.append(job)

    logger.info("Fantastic.jobs total: %d jobs", len(deduped))
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
