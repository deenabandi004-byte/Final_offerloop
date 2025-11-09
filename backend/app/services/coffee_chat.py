"""
Coffee chat prep orchestration helpers.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

import dateparser
from serpapi import GoogleSearch

from app.config import SERPAPI_KEY
from app.services.openai_client import get_openai_client


@dataclass
class NewsItem:
    title: str
    url: str
    source: str
    published_at: Optional[str]
    summary: str
    relevance_tag: str
    confidence: str = "high"


def _default_time_window_to_serp(time_window: str) -> str:
    """
    Convert a human friendly time window into SerpAPI `tbs` value.
    """
    time_window = (time_window or "").lower()
    patterns = {
        ("last 7 days", "past week", "7d", "week"): "qdr:w",
        ("last 30 days", "past month", "30d", "month"): "qdr:m",
        ("last 90 days", "quarter", "90d"): "qdr:m3",
        ("last year", "12m", "365d"): "qdr:y",
    }
    for aliases, tbs in patterns.items():
        if any(alias in time_window for alias in aliases):
            return tbs
    return "qdr:m3"


def _normalise_iso(date_str: Optional[str]) -> Optional[str]:
    if not date_str:
        return None
    parsed = dateparser.parse(str(date_str))
    if not parsed:
        return None
    return parsed.isoformat()


def _copy_dedup_items(items: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    deduped: List[Dict[str, Any]] = []
    for item in items:
        url = item.get("link") or item.get("url")
        if not url:
            continue
        key = url.split("?")[0]
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _score_relevance(
    item: Dict[str, Any],
    company: str,
    division: str,
    office: str,
    industry: str,
) -> Tuple[str, str]:
    """
    Determine relevance_tag and confidence (high/medium) based on match heuristics.
    """
    title = item.get("title", "").lower()
    snippet = item.get("snippet", "").lower()
    text_blob = f"{title} {snippet}"

    division_hit = division and division.lower() in text_blob
    office_hit = office and office.lower() in text_blob
    company_hit = company and company.lower() in text_blob
    industry_hit = industry and industry.lower() in text_blob

    if division_hit and office_hit:
        return "division", "high"
    if division_hit:
        return "division", "medium"
    if office_hit and company_hit:
        return "office", "high"
    if office_hit:
        return "office", "medium"
    if industry_hit:
        return "industry", "medium"
    return "industry", "medium"


def _summarise_article(item: Dict[str, Any], division: str, office: str) -> str:
    """
    Use OpenAI to craft a 30–40 word summary that is coffee-chat ready.
    """
    client = get_openai_client()
    if not client:
        # Fallback to trimmed snippet
        snippet = (item.get("snippet") or "").strip()
        return snippet[:260]

    prompt = (
        "You are preparing a coffee chat brief. "
        "Given the following verified news item, write a 30-40 word factual summary. "
        "Emphasise why it matters for the specific division/office. "
        "Do not mention job postings, hiring, or recruitment. "
        "Avoid marketing language and keep it objective.\n\n"
        f"TITLE: {item.get('title', '')}\n"
        f"SNIPPET: {item.get('snippet', '')}\n"
        f"DIVISION: {division}\n"
        f"OFFICE: {office}\n"
        "SUMMARY:"
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=120,
            temperature=0.4,
        )
        summary = response.choices[0].message.content or ""
        summary = summary.strip()
        return summary
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[CoffeeChat] Summary generation failed: {exc}")
        snippet = (item.get("snippet") or "").strip()
        return snippet[:260]


def _generate_industry_overview(industry: str, items: Sequence[NewsItem]) -> str:
    """
    Use OpenAI to produce a 30–40 word industry shift summary.
    """
    client = get_openai_client()
    if not client:
        return (
            f"Recent {industry} coverage highlights trends worth monitoring, "
            "including shifting client priorities and regional expansion moves."
        )

    notes = "\n".join(
        f"- {item.title}: {item.summary}" for item in list(items)[:5]
    )
    prompt = (
        "Summarise the most relevant recent shifts in the industry that could "
        "impact the division's work. Keep it factual, 30-40 words. "
        "Focus on trends or events that would surface in a coffee chat.\n\n"
        f"Industry: {industry}\n"
        f"Highlights:\n{notes}\n\n"
        "Industry Summary:"
    )
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=120,
            temperature=0.5,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[CoffeeChat] Industry summary failed: {exc}")
        return (
            f"Recent {industry} developments signal active deal flow and evolving "
            "client demand across major metro offices."
        )


def fetch_serp_research(
    *,
    company: str,
    division: str,
    office: str,
    industry: str,
    time_window: str = "last 90 days",
    geo: str = "us",
    language: str = "en",
) -> Tuple[List[NewsItem], str]:
    """
    Fetch up to five relevant news items plus an industry summary using SerpAPI
    and OpenAI summarisation.
    """
    if not SERPAPI_KEY:
        print("⚠️ SERPAPI_KEY missing; skipping newsroom enrichment")
        return [], ""

    # Build query list with fallbacks per product spec
    queries: List[Tuple[str, str]] = []
    base_company = company or ""
    base_division = division or ""
    base_office = office or ""
    base_industry = industry or ""

    def _compose_query(*parts: str) -> str:
        base = " ".join(filter(None, parts)).strip()
        if not base:
            return ""
        # Exclude hiring spam and emphasise announcements
        return f'{base} "news" "update" -"careers" -"jobs" -"hiring" -"recruiting"'

    if base_company or base_office or base_division:
        queries.append(
            (
                _compose_query(base_company, base_division, base_office),
                "division",
            )
        )
    if base_company or base_office:
        queries.append((_compose_query(base_company, base_office), "office"))
    if base_company and base_industry:
        queries.append((_compose_query(base_company, base_industry), "industry"))
    if base_industry:
        queries.append((_compose_query(base_industry), "industry"))

    tbs_value = _default_time_window_to_serp(time_window)
    collected: List[Dict[str, Any]] = []
    used_queries: List[str] = []

    for query, query_type in queries:
        query = query.strip()
        if not query:
            continue
        print(f"[CoffeeChat] SERP query ({query_type}): {query}")
        used_queries.append(query)
        try:
            search = GoogleSearch(
                {
                    "q": query,
                    "api_key": SERPAPI_KEY,
                    "tbm": "nws",
                    "num": 10,
                    "tbs": tbs_value,
                    "hl": language or "en",
                    "gl": geo or "us",
                }
            )
            results = search.get_dict()
            items = results.get("news_results", []) or []
            collected.extend(items)
            if len(_copy_dedup_items(collected)) >= 5:
                break
        except Exception as exc:  # pragma: no cover - network call
            print(f"[CoffeeChat] SERP request failed: {exc}")
            continue

    deduped = _copy_dedup_items(collected)
    news_items: List[NewsItem] = []
    for raw in deduped:
        if len(news_items) >= 5:
            break
        tag, confidence = _score_relevance(
            raw, base_company, base_division, base_office, base_industry
        )
        summary = _summarise_article(raw, base_division, base_office)
        news_items.append(
            NewsItem(
                title=raw.get("title", ""),
                url=raw.get("link", ""),
                source=raw.get("source", ""),
                published_at=_normalise_iso(raw.get("date")),
                summary=summary,
                relevance_tag=tag,
                confidence=confidence,
            )
        )

    industry_summary = _generate_industry_overview(
        base_industry or base_company or "the industry", news_items
    )

    return news_items, industry_summary


def infer_hometown_from_education(education: Sequence[str]) -> Optional[str]:
    """
    Use the Hometown prompt logic to infer city/state for the high school.
    """
    education = [e for e in education if e]
    if not education:
        return None

    client = get_openai_client()
    if not client:
        return None

    education_block = "\n".join(f"- {entry}" for entry in education[:6])
    prompt = (
        "Education Input:\n"
        f"{education_block}\n\n"
        "Please research where the high school is located. "
        "Return ONLY the hometown city and state (e.g., 'San Diego, CA'). "
        "If no high school is found, return an empty string."
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=40,
            temperature=0.2,
        )
        hometown = (response.choices[0].message.content or "").strip()
        hometown = hometown.replace('"', "").replace("'", "")
        hometown = re.sub(r"\s+", " ", hometown)
        return hometown or None
    except Exception as exc:  # pragma: no cover
        print(f"[CoffeeChat] Hometown inference failed: {exc}")
        return None


def build_similarity_payload(user_data: Dict[str, Any], contact_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Assemble a structured payload for OpenAI similarity prompts.
    """
    payload = {
        "user_data": user_data or {},
        "contact_data": contact_data or {},
    }
    return payload


def format_news_for_storage(items: Sequence[NewsItem]) -> List[Dict[str, Any]]:
    return [
        {
            "title": item.title,
            "url": item.url,
            "source": item.source,
            "published_at": item.published_at,
            "summary": item.summary,
            "relevance_tag": item.relevance_tag,
            "confidence": item.confidence,
        }
        for item in items
    ]


