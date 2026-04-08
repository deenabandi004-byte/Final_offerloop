"""
Fetch job posting content from a URL with multiple fallback strategies.
Never raises - returns a result dict even when fetch fails (url-only fallback).
Used by Resume Workshop tailor flow and any endpoint that needs to read job URLs.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict

import requests
from bs4 import BeautifulSoup

from app.utils.url_validator import validate_fetch_url, UnsafeURLError

logger = logging.getLogger(__name__)

# Cap visible text to avoid huge payloads
MAX_RAW_TEXT_CHARS = 5000


def fetch_job_posting(url: str) -> Dict[str, Any]:
    """
    Fetch job posting content with multiple fallback strategies.
    Never raises. Returns a dict with: url, title, company, description, raw_text, source.
    - source is one of: 'json-ld', 'html-parse', 'url-only'
    """
    url = (url or "").strip()
    if not url:
        return {
            "url": "",
            "title": "",
            "company": "",
            "description": "",
            "location": "",
            "raw_text": "",
            "source": "url-only",
        }

    # Normalize URL
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    result: Dict[str, Any] = {
        "url": url,
        "title": "",
        "company": "",
        "description": "",
        "location": "",
        "raw_text": "",
        "source": "url-only",
    }

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        url = validate_fetch_url(url)
    except UnsafeURLError as e:
        logger.warning("[JobUrlFetcher] Blocked unsafe URL %s: %s", url[:80], e)
        result["raw_text"] = f"Job posting URL: {url} (blocked: {e!s})"
        return result

    try:
        response = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
        response.raise_for_status()
        html = response.text
    except Exception as e:
        logger.warning("[JobUrlFetcher] Request failed for %s: %s", url[:80], e)
        result["raw_text"] = f"Job posting URL: {url} (could not fetch content: {e!s})"
        return result

    if not html or len(html) < 50:
        result["raw_text"] = f"Job posting URL: {url} (page returned little or no content)"
        return result

    # Strategy 1: JSON-LD structured data (many job sites include this)
    json_ld_matches = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    for match in json_ld_matches:
        try:
            data = json.loads(match.strip())
            if isinstance(data, dict) and data.get("@type") == "JobPosting":
                result["title"] = (data.get("title") or "") or result["title"]
                ho = data.get("hiringOrganization")
                if isinstance(ho, dict) and ho.get("name"):
                    result["company"] = str(ho.get("name", ""))
                jl = data.get("jobLocation")
                if isinstance(jl, dict):
                    addr = jl.get("address") if isinstance(jl.get("address"), dict) else {}
                    if addr:
                        result["location"] = ", ".join(p for p in [addr.get("addressLocality"), addr.get("addressRegion")] if p) or ""
                result["description"] = (data.get("description") or "") or result["description"]
                result["raw_text"] = (result["description"] or result["title"] or "")[:MAX_RAW_TEXT_CHARS]
                result["source"] = "json-ld"
                return result
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and item.get("@type") == "JobPosting":
                        result["title"] = (item.get("title") or "") or result["title"]
                        ho = item.get("hiringOrganization")
                        if isinstance(ho, dict) and ho.get("name"):
                            result["company"] = str(ho.get("name", ""))
                        jl = item.get("jobLocation")
                        if isinstance(jl, dict):
                            addr = jl.get("address") if isinstance(jl.get("address"), dict) else {}
                            if addr:
                                result["location"] = ", ".join(p for p in [addr.get("addressLocality"), addr.get("addressRegion")] if p) or ""
                        result["description"] = (item.get("description") or "") or result["description"]
                        result["raw_text"] = (result["description"] or result["title"] or "")[:MAX_RAW_TEXT_CHARS]
                        result["source"] = "json-ld"
                        return result
        except json.JSONDecodeError:
            continue

    # Strategy 2: Meta tags and visible text via BeautifulSoup
    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception as e:
        logger.warning("[JobUrlFetcher] BeautifulSoup parse failed: %s", e)
        result["raw_text"] = f"Job posting URL: {url} (could not parse HTML)"
        return result

    title_tag = soup.find("title")
    if title_tag:
        result["title"] = (title_tag.get_text(strip=True) or "")[:500]

    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        result["title"] = (og_title.get("content") or "")[:500] or result["title"]

    og_desc = soup.find("meta", property="og:description")
    meta_desc = soup.find("meta", attrs={"name": "description"})
    if og_desc and og_desc.get("content"):
        result["description"] = (og_desc.get("content") or "")[:MAX_RAW_TEXT_CHARS]
    elif meta_desc and meta_desc.get("content"):
        result["description"] = (meta_desc.get("content") or "")[:MAX_RAW_TEXT_CHARS]

    # Optional: company from meta
    company_meta = soup.find("meta", attrs={"name": "company"}) or soup.find(
        "meta", attrs={"property": "og:site_name"}
    )
    if company_meta and company_meta.get("content") and not result["company"]:
        result["company"] = (company_meta.get("content") or "")[:200]

    # Strategy 3: Visible text as fallback for raw_text / description
    for tag in soup(["script", "style", "nav", "header", "footer"]):
        tag.decompose()
    visible = soup.get_text(separator="\n", strip=True)
    if visible:
        visible = visible[:MAX_RAW_TEXT_CHARS]
    if not result["raw_text"] and visible:
        result["raw_text"] = visible
    if not result["description"] and result["raw_text"]:
        result["description"] = result["raw_text"]

    result["source"] = "html-parse"
    return result
