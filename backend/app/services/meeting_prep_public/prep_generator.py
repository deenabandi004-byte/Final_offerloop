"""Orchestrator for the public meeting-prep lead magnet.

Pipeline:
    1. PDL enrich the pasted LinkedIn URL  ->  contact_data
    2. Perplexity deep_research            ->  company_news / overview / trends
    3. OpenAI synthesize                   ->  smart questions + tips + arc

No resume input, no fit analysis, no user context. The paid flow has
those (see app/utils/coffee_chat_prep.py). The public PDF intentionally
leaves them out and points the gap at the signup CTA.
"""
from __future__ import annotations

import json
import logging
import re
from concurrent.futures import ALL_COMPLETED, ThreadPoolExecutor, wait as futures_wait
from typing import Any

from app.services.openai_client import get_openai_client
from app.services.pdl_client import enrich_linkedin_profile
from app.services.perplexity_client import get_company_news_brief, pro_search

logger = logging.getLogger(__name__)


# ── PDL enrichment ───────────────────────────────────────────────────


def enrich_contact(linkedin_url: str) -> dict | None:
    """Thin wrapper around the existing PDL enrichment. Returns the
    coffee_chat_data dict (see pdl_client.build_coffee_chat_data) or None
    if PDL has no record / the URL is malformed."""
    return enrich_linkedin_profile(linkedin_url)


# ── Perplexity research ──────────────────────────────────────────────


def _pro(query: str, recency: str | None = "month") -> dict:
    try:
        return pro_search(query, recency=recency)
    except Exception:
        logger.warning("Perplexity pro_search failed: %s", query[:80], exc_info=True)
        return {"content": "", "citations": []}


def _q_company_signal(company: str, job_title: str) -> dict:
    role_clause = f" Focus on areas relevant to a {job_title}." if job_title else ""
    return _pro(
        f"Recent news, strategy moves, hires, and announcements from {company} "
        f"in the last 3 months.{role_clause} Be specific and cite sources."
    )


def _q_industry_trends(industry: str, company: str) -> dict:
    if not industry:
        return {"content": "", "citations": []}
    return _pro(
        f"What are the top 3-5 trends or shifts in the {industry} industry right "
        f"now that someone working at {company or 'a company in this space'} would "
        f"be tracking? Be specific, current, and cite sources."
    )


def _q_person_mentions(first_name: str, last_name: str, company: str) -> dict:
    if not (first_name and last_name):
        return {"content": "", "citations": []}
    return _pro(
        f"Find public articles, podcast appearances, talks, interviews, or "
        f"blog posts that feature {first_name} {last_name} at {company}. "
        f"Only include sources where they are the actual subject or speaker, "
        f"not just mentioned in passing.",
        recency=None,
    )


def _q_company_news(company: str) -> list[str]:
    if not company:
        return []
    try:
        return get_company_news_brief(company, timeframe="month") or []
    except Exception:
        logger.warning("get_company_news_brief failed", exc_info=True)
        return []


def gather_research(contact_data: dict) -> dict:
    """Run four sharply-scoped Perplexity pro_search queries in parallel.
    Avoids sonar-deep-research (3-5+ min) so the widget completes in a
    user-tolerable window for a free lead magnet (~15-30s end-to-end).
    Pattern mirrors interview_prep_public/research.py.

    Returns:
        {
          "company_signal":   {"content": str, "citations": list[str]},
          "industry_trends":  {"content": str, "citations": list[str]},
          "person_mentions":  {"content": str, "citations": list[str]},
          "company_news":     list[str],
          "citations":        list[str],   # deduped across all calls
        }
    """
    company = contact_data.get("company") or ""
    industry = contact_data.get("industry") or ""
    job_title = contact_data.get("jobTitle") or ""
    first = contact_data.get("firstName") or ""
    last = contact_data.get("lastName") or ""

    empty = {
        "company_signal": {"content": "", "citations": []},
        "industry_trends": {"content": "", "citations": []},
        "person_mentions": {"content": "", "citations": []},
        "company_news": [],
        "citations": [],
    }
    if not company:
        return empty

    # Whole-batch timeout so a single slow Perplexity call cannot
    # deadlock the worker. `with ThreadPoolExecutor` blocks on shutdown
    # waiting for stragglers - we avoid that by using futures_wait()
    # with a wall-clock timeout and then `shutdown(wait=False)`.
    # Sonar-pro is usually 10-30s; 50s is a generous tail.
    BATCH_TIMEOUT = 50

    ex = ThreadPoolExecutor(max_workers=4)
    try:
        f_signal = ex.submit(_q_company_signal, company, job_title)
        f_trends = ex.submit(_q_industry_trends, industry, company)
        f_person = ex.submit(_q_person_mentions, first, last, company)
        f_news = ex.submit(_q_company_news, company)

        futures_wait(
            [f_signal, f_trends, f_person, f_news],
            timeout=BATCH_TIMEOUT,
            return_when=ALL_COMPLETED,
        )

        def _pull(f, label: str, fallback):
            if not f.done():
                logger.warning("Public meeting prep: %s did not finish within %ds", label, BATCH_TIMEOUT)
                return fallback
            try:
                return f.result(timeout=0)
            except Exception:
                logger.warning("Public meeting prep: %s raised", label, exc_info=True)
                return fallback

        signal = _pull(f_signal, "company_signal", {"content": "", "citations": []})
        trends = _pull(f_trends, "industry_trends", {"content": "", "citations": []})
        person = _pull(f_person, "person_mentions", {"content": "", "citations": []})
        news = _pull(f_news, "company_news", [])
    finally:
        # Tear down without blocking on stragglers. Python 3.9+
        # supports cancel_futures; safe to call regardless.
        try:
            ex.shutdown(wait=False, cancel_futures=True)
        except TypeError:
            ex.shutdown(wait=False)

    citations = _dedupe_citations(
        signal.get("citations") or [],
        trends.get("citations") or [],
        person.get("citations") or [],
    )

    logger.info(
        "Public meeting prep research: signal=%d, trends=%d, person=%d, news=%d items, citations=%d",
        len(signal.get("content") or ""),
        len(trends.get("content") or ""),
        len(person.get("content") or ""),
        len(news),
        len(citations),
    )

    return {
        "company_signal": signal,
        "industry_trends": trends,
        "person_mentions": person,
        "company_news": news,
        "citations": citations,
    }


def _dedupe_citations(*lists: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for lst in lists:
        for c in lst or []:
            if c and c not in seen:
                seen.add(c)
                out.append(c)
    return out


# ── OpenAI synthesis ─────────────────────────────────────────────────


def _format_timeline(contact_data: dict) -> str:
    exp = contact_data.get("experienceArray") or []
    lines = []
    for e in exp[:5]:
        dates = f"{e.get('start_date', '')}-{'now' if e.get('is_current') else e.get('end_date', '')}"
        lines.append(f"  - {e.get('title', '')} @ {e.get('company', '')} ({dates})")
    return "\n".join(lines) or "Not available"


def _format_education(contact_data: dict) -> str:
    edu = contact_data.get("educationArray") or []
    lines = [
        f"  - {e.get('degree', '')} in {e.get('major', '')} @ {e.get('school', '')} ({e.get('end_date', '')})"
        for e in edu
    ]
    return "\n".join(lines) or "Not available"


def _format_pro_block(block: dict, max_chars: int = 1200) -> str:
    """Trim a pro_search content blob for the prompt."""
    text = (block.get("content") or "").strip()
    if not text:
        return "None available"
    return text[:max_chars]


def _format_news_brief(items: list[str], n: int = 5) -> str:
    items = [s.strip() for s in (items or []) if s and s.strip()]
    if not items:
        return "None available"
    return "\n".join(f"  - {s}" for s in items[:n])


def synthesize_insights(contact_data: dict, research: dict) -> dict:
    """Single OpenAI call that returns the structured payload the PDF
    renders. Schema is locked to a strict JSON shape so the PDF builder
    doesn't have to defensively parse free-form text.

    Returns:
        {
          "smart_questions": [{"category", "question", "hook"}, ...],  # 8-10
          "conversation_tips": ["str", ...],                            # 3-5
          "company_signal": ["str", ...],                               # 0-5
          "career_arc": ["str", ...],                                   # 3-6
          "degraded": bool,                                             # True if synthesis failed
        }
    """
    client = get_openai_client()
    if not client:
        return _empty_insights(degraded=True)

    full_name = contact_data.get("fullName") or "the contact"
    job_title = contact_data.get("jobTitle") or "their role"
    company = contact_data.get("company") or "their company"
    industry = contact_data.get("industry") or ""
    skills = ", ".join((contact_data.get("skills") or [])[:8]) or "not listed"
    interests = ", ".join((contact_data.get("interests") or [])[:6]) or "not listed"
    summary = (contact_data.get("summary") or "")[:400]

    timeline = _format_timeline(contact_data)
    education = _format_education(contact_data)
    news_block = _format_news_brief(research.get("company_news") or [], 5)
    signal_block = _format_pro_block(research.get("company_signal") or {})
    trends_block = _format_pro_block(research.get("industry_trends") or {})
    person_block = _format_pro_block(research.get("person_mentions") or {}, max_chars=800)

    prompt = f"""You are preparing a free, public meeting-prep brief for a college student about to meet {full_name}. The student has not shared their resume, so DO NOT invent personalized fit or shared-background hooks. Stay grounded in the contact and the public research below.

CONTACT
Name: {full_name}
Title: {job_title} at {company}
Industry: {industry}
Skills: {skills}
Interests: {interests}
LinkedIn Summary: {summary}
Career Timeline:
{timeline}
Education:
{education}

COMPANY SIGNAL (recent news/strategy/moves):
{signal_block}

COMPANY NEWS HEADLINES:
{news_block}

INDUSTRY TRENDS:
{trends_block}

PERSON-SPECIFIC RESEARCH (articles / talks / interviews featuring this person):
{person_block}

---

Produce a JSON object with EXACTLY these keys:

1. "smart_questions": array of 8-10 objects, each {{"category": str, "question": str, "hook": str}}.
   Categories MUST be drawn from this set: ["Career Trajectory", "Company & Role", "Industry Insight", "Skill & Craft", "Personal Journey"].
   - Every question must reference something specific to this person (a transition in their timeline, a real news item, a specific skill, a school, an article).
   - "hook" is a short (under 12 words) note saying WHAT the question is grounded in, e.g. "her 2019 Deloitte->McKinsey move" or "recent company news on payer cost work".
   - BANNED generic questions: "What does a typical day look like?", "What advice would you give?", "What do you wish you'd known?" unless paired with something hyper-specific.

2. "conversation_tips": array of 3-5 short strings. Tactical advice for the student in THIS specific meeting (tone calibration based on seniority, which topics to lead with, which to avoid).

3. "company_signal": array of 0-5 short strings. One-line summaries of the most relevant recent news/trends from the research above. Only include items that are clearly relevant to the contact's work — omit broad market noise. Empty array if nothing qualifies.

4. "career_arc": array of 3-6 short strings. One-liners summarizing the contact's career path in chronological order, drawn from the timeline above. Example format: "UCLA, B.A. Econ, '16" / "Deloitte S&O, Analyst, '16-'18" / "McKinsey, Business Analyst, '19".

Return ONLY the JSON object. No prose, no code fences."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=1500,
            temperature=0.6,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = (response.choices[0].message.content or "").strip()
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)
        return {
            "smart_questions": parsed.get("smart_questions") or [],
            "conversation_tips": parsed.get("conversation_tips") or [],
            "company_signal": parsed.get("company_signal") or [],
            "career_arc": parsed.get("career_arc") or [],
            "degraded": False,
        }
    except Exception:
        logger.warning("Public meeting prep: OpenAI synthesis failed", exc_info=True)
        return _empty_insights(degraded=True)


def _empty_insights(*, degraded: bool) -> dict[str, Any]:
    return {
        "smart_questions": [],
        "conversation_tips": [],
        "company_signal": [],
        "career_arc": [],
        "degraded": degraded,
    }


# ── Citations passthrough ────────────────────────────────────────────


def collect_citations(research: dict) -> list[str]:
    """The research dict already deduplicates citations across pro_search
    blocks. Just return that list, capped."""
    return (research.get("citations") or [])[:15]
