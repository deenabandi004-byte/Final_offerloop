"""
Fetch student-focused job listings from JSearch (RapidAPI).
"""
import os
import logging
import requests

logger = logging.getLogger(__name__)

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY")
JSEARCH_HOST = "jsearch.p.rapidapi.com"
JSEARCH_URL = f"https://{JSEARCH_HOST}/search"

CATEGORY_QUERIES = {
    "software_engineering": [
        "software engineer intern 2026",
        "entry level software engineer",
    ],
    "finance_banking": [
        "finance intern 2026",
        "investment banking analyst entry level",
    ],
    "marketing_growth": [
        "marketing intern 2026",
        "growth marketing entry level",
    ],
    "consulting": [
        "consulting analyst entry level",
        "business analyst intern 2026",
    ],
    "product_management": [
        "product manager intern 2026",
        "associate product manager entry level",
    ],
    "data_science": [
        "data science intern 2026",
        "data analyst entry level",
    ],
}

PAGES_PER_QUERY = 2


def _fetch_query(query: str, category: str) -> list[dict]:
    """Fetch up to PAGES_PER_QUERY pages for a single query. Returns raw JSearch results tagged with _category."""
    if not RAPIDAPI_KEY:
        logger.error("RAPIDAPI_KEY not set — skipping fetch")
        return []

    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": JSEARCH_HOST,
    }

    results = []
    for page in range(1, PAGES_PER_QUERY + 1):
        params = {
            "query": query,
            "page": str(page),
            "num_pages": "1",
            "employment_types": "FULLTIME,PARTTIME,INTERN",
            "date_posted": "today",
            "country": "us",
        }
        try:
            resp = requests.get(JSEARCH_URL, headers=headers, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json().get("data", [])
            if not data:
                break
            for job in data:
                job["_category"] = category
            results.extend(data)
            logger.info("  [%s] page %d → %d results", query, page, len(data))
        except Exception as exc:
            logger.warning("  [%s] page %d failed: %s", query, page, exc)
            continue

    return results


def fetch_all_categories() -> list[dict]:
    """Fetch jobs for every category/query combo. Returns list of raw JSearch dicts."""
    all_jobs = []
    for category, queries in CATEGORY_QUERIES.items():
        logger.info("Fetching category: %s", category)
        for query in queries:
            jobs = _fetch_query(query, category)
            all_jobs.extend(jobs)
    logger.info("Total raw results fetched: %d", len(all_jobs))
    return all_jobs
