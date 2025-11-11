"""
Scout service - orchestrates job title discovery across PDL, SERP and OpenAI.
(Updated: tighten PDL query, add post-merge filtering for level/company, improve scoring/dedup.)
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
from serpapi import GoogleSearch

from app.config import PEOPLE_DATA_LABS_API_KEY, PDL_BASE_URL, SERPAPI_KEY
from app.services.openai_client import get_async_openai_client
from app.services.pdl_client import cached_enrich_job_title


@dataclass
class TitleCandidate:
    """Internal representation of a job title suggestion."""

    title: str
    source: str
    score: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def normalised_title(self) -> str:
        cleaned = re.sub(r"[^\w\s/+-]", "", self.title or "").strip().lower()
        cleaned = re.sub(r"\s+", " ", cleaned)
        return cleaned


@dataclass
class ScoutResponse:
    """Serializable response returned to the API layer."""

    status: str
    message: str
    company: Optional[str]
    user_query: str
    primary_title: Optional[str]
    alternatives: List[str]
    level_explanation: Optional[str]
    cross_company_notes: Optional[str]
    confidence: Optional[str]
    suggestions: List[Dict[str, Any]]
    metadata: Dict[str, Any] = field(default_factory=dict)
    context: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "ScoutResponse":
        return cls(
            status=payload.get("status", "ok"),
            message=payload.get("message", ""),
            company=payload.get("company"),
            user_query=payload.get("user_query", ""),
            primary_title=payload.get("primary_title"),
            alternatives=payload.get("alternatives", []) or [],
            level_explanation=payload.get("level_explanation"),
            cross_company_notes=payload.get("cross_company_notes"),
            confidence=payload.get("confidence"),
            suggestions=payload.get("suggestions", []),
            metadata=payload.get("metadata", {}),
            context=payload.get("context", {}),
        )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class _TTLCache:
    """Simple in-memory TTL cache (process scoped)."""

    def __init__(self, default_ttl: int = 60 * 60 * 24 * 7):
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        if key not in self._store:
            return None
        expires_at, value = self._store[key]
        if expires_at < time.time():
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        lifetime = ttl if ttl is not None else self._default_ttl
        self._store[key] = (time.time() + lifetime, value)

    def clear(self) -> None:
        self._store.clear()


class ScoutService:
    """Core orchestrator for Scout title discovery."""

    DEFAULT_MODEL = "gpt-4o-mini"
    FALLBACK_CONFIDENCE = "medium"

    def __init__(self, *, cache: Optional[_TTLCache] = None):
        self._cache = cache or _TTLCache()
        self._async_openai = get_async_openai_client()

    async def handle_chat(
        self,
        *,
        message: str,
        company: Optional[str] = None,
        role_description: Optional[str] = None,
        experience_level: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Main entry point used by the API layer. Accepts a free-form message and optional
        structured hints, orchestrates enrichment and GPT reasoning, and returns a hydrated response.
        """
        context = context or {}

        parsed = await self._parse_user_message(
            message=message,
            provided_company=company,
            provided_role=role_description,
            provided_level=experience_level,
            context=context,
        )

        missing_fields = self._determine_missing_fields(parsed)
        if missing_fields:
            follow_up = await self._build_followup_question(parsed, missing_fields)
            print(f"[Scout] Missing {missing_fields}, asking: {follow_up}")  # debug
            updated_context = self._augment_context(
                context,
                parsed.get("company"),
                parsed.get("role"),
                parsed.get("level"),
            )
            response = ScoutResponse.from_dict(
                {
                    "status": "needs_context",
                    "message": follow_up,
                    "company": parsed.get("company"),
                    "user_query": parsed.get("original_query") or message,
                    "primary_title": None,
                    "alternatives": [],
                    "level_explanation": None,
                    "cross_company_notes": None,
                    "confidence": None,
                    "suggestions": [],
                    "metadata": {"missing_fields": missing_fields},
                    "context": updated_context,
                }
            ).to_dict()
            return response

        company = parsed.get("company") or ""
        user_role = parsed.get("role") or "role unspecified"
        experience_level = parsed.get("level")

        cache_key = self._build_cache_key(company, user_role, experience_level)
        cached = self._cache.get(cache_key)
        if cached:
            enriched_context = self._augment_context(context, company, user_role, experience_level)
            cached["context"] = enriched_context
            return cached

        raw_candidates = await self._gather_title_candidates(company, user_role, experience_level)
        # NEW: normalize/filter noisy rows before ranking
        candidates = self._normalize_and_filter_candidates(company, user_role, experience_level, raw_candidates)
        ranked_candidates = self._rank_candidates(candidates)

        analysis = await self._analyze_with_gpt(
            company=company,
            user_query=user_role,
            experience_level=experience_level,
            ranked_candidates=ranked_candidates,
            context=context,
        )

        response = ScoutResponse.from_dict(
            {
                "status": "ok",
                "message": analysis.get("summary", ""),
                "company": company,
                "user_query": parsed.get("original_query") or message,
                "primary_title": analysis.get("primary_title", ""),
                "alternatives": analysis.get("alternatives", []),
                "level_explanation": analysis.get("level_explanation", ""),
                "cross_company_notes": analysis.get("cross_company_notes"),
                "confidence": analysis.get("confidence", self.FALLBACK_CONFIDENCE),
                "suggestions": ranked_candidates,
                "metadata": {
                    "source_counts": self._summarise_sources(ranked_candidates),
                    "raw_candidates": ranked_candidates,
                },
                "context": self._augment_context(context, company, user_role, experience_level),
            }
        ).to_dict()

        self._cache.set(cache_key, response)
        return response

    async def _parse_user_message(
        self,
        *,
        message: str,
        provided_company: Optional[str],
        provided_role: Optional[str],
        provided_level: Optional[str],
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Lightweight parser that uses heuristics and (optionally) OpenAI to extract company, role, and level.
        """
        message = (message or "").strip()

        if not message and not (provided_company or provided_role):
            return {
                "company": context.get("company"),
                "role": context.get("role"),
                "level": context.get("level"),
                "original_query": message,
            }

        parsed = {
            "company": provided_company or context.get("company") or self._infer_company_from_text(message),
            "role": provided_role or context.get("role") or self._infer_role_from_text(message),
            "level": provided_level or context.get("level"),
            "original_query": message,
        }

        # Simple regex heuristic: "... at Company"
        if message:
            company_match = re.search(r"at\s+([A-Z][A-Za-z0-9&\-\s]+)", message)
            if company_match and not parsed["company"]:
                parsed["company"] = company_match.group(1).strip()

            level_match = re.search(
                r"\b(intern|entry level|junior|mid|senior|staff|principal|lead|manager|director|vp|vice president|c-level|executive)\b",
                message,
                re.IGNORECASE,
            )
            if level_match and not parsed["level"]:
                parsed["level"] = level_match.group(1).lower()

        missing_company = not parsed["company"]
        if self._async_openai and (missing_company or not provided_role):
            try:
                prompt = (
                    "Extract structured fields from the user's message about a job search.\n"
                    "Return JSON with keys: company (string or null), role (string or null), "
                    "level (string or null). Do not include any additional text.\n"
                    f"Message: {message}"
                )
                completion = await self._async_openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You extract job search entities."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.0,
                    max_tokens=150,
                    response_format={"type": "json_object"},
                )
                content = completion.choices[0].message.content
                if content:
                    parsed_json = json.loads(content)
                    parsed["company"] = parsed["company"] or parsed_json.get("company")
                    parsed["role"] = parsed["role"] or parsed_json.get("role")
                    parsed["level"] = parsed["level"] or parsed_json.get("level")
            except Exception as exc:  # pragma: no cover - defensive
                print(f"[Scout] Entity extraction failed: {exc}")

        return parsed

    def _infer_role_from_text(self, text: str | None) -> Optional[str]:
        if not text:
            return None
        cleaned = text.strip()
        if not cleaned or len(cleaned) < 3:
            return None

        common_role_tokens = [
            "engineer",
            "engineering",
            "developer",
            "designer",
            "product",
            "manager",
            "marketing",
            "sales",
            "analyst",
            "scientist",
            "data",
            "finance",
            "consultant",
            "operations",
            "support",
            "specialist",
            "architect",
            "lead",
            "principal",
            "director",
            "intern",
            "associate",
            "staff",
        ]
        lower = cleaned.lower()
        if any(token in lower for token in common_role_tokens):
            return cleaned
        if " role" in lower or lower.startswith("role "):
            return cleaned
        return None

    def _infer_company_from_text(self, text: str | None) -> Optional[str]:
        if not text:
            return None
        cleaned = text.strip()
        if not cleaned:
            return None

        if " " not in cleaned:
            return None

        tokens = cleaned.split()
        if len(tokens) <= 3:
            capitalised_tokens = [t for t in tokens if t[:1].isupper()]
            if len(capitalised_tokens) == len(tokens):
                return cleaned
        return None

    def _determine_missing_fields(self, parsed: Dict[str, Any]) -> List[str]:
        missing = []
        if not parsed.get("company"):
            missing.append("company")
        if not parsed.get("role"):
            missing.append("role")
        return missing

    async def _build_followup_question(
        self,
        parsed: Dict[str, Any],
        missing_fields: List[str],
    ) -> str:
        """
        Generate a natural follow-up question to collect missing context.
        """
        company = parsed.get("company")
        role = parsed.get("role")
        level = parsed.get("level")

        if self._async_openai:
            try:
                prompt = json.dumps(
                    {
                        "known": {
                            "company": company,
                            "role": role,
                            "level": level,
                        },
                        "missing": missing_fields,
                    }
                )
                completion = await self._async_openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are Scout, an assistant that gathers missing context about a user's target job. "
                                "Ask a concise follow-up question (max 25 words) to collect the missing fields. "
                                "Do not mention you are missing data—just ask naturally."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=80,
                )
                content = completion.choices[0].message.content
                if content:
                    return content.strip()
            except Exception as exc:  # pragma: no cover - defensive
                print(f"[Scout] Follow-up generation failed: {exc}")

        if "company" in missing_fields and "role" in missing_fields:
            return "Happy to help—what role and company are you exploring?"
        if "company" in missing_fields:
            return "Which company should I research for you?"
        if "role" in missing_fields:
            return "What type of role are you targeting?"
        return "Could you share a bit more detail?"

    async def _gather_title_candidates(
        self,
        company: str,
        user_role: str,
        experience_level: Optional[str],
    ) -> List[TitleCandidate]:
        """
        Concurrently fetch title candidates from cache, PDL, and SERP.
        """
        tasks = [
            asyncio.to_thread(self._pdl_search, company, user_role, experience_level),
            asyncio.to_thread(self._serp_search, company, user_role),
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        candidates: List[TitleCandidate] = []
        for result in results:
            if isinstance(result, Exception):
                print(f"[Scout] Data source failed: {result}")
                continue
            candidates.extend(result)
        return candidates

    # --------------------
    # Source fetchers
    # --------------------
    def _pdl_search( self,company: str, user_role: str,experience_level: Optional[str],*,size: int = 25,) -> List[TitleCandidate]:
    
        if not PEOPLE_DATA_LABS_API_KEY:
            return []

        company_norm = (company or "").strip()
        role_normalized = user_role.strip()

        # Build SQL query for PDL - use EXACT word boundaries for "intern"
        sql_parts = [
            f"SELECT * FROM person",
            f"WHERE job_company_name='{company_norm}'",
        ]

        # Add job title matching with proper word boundaries
        if experience_level and experience_level.lower() == "intern":
            # Use word boundaries to avoid matching "internal", "international", etc.
            sql_parts.append(
                f"AND ("
                f"job_title LIKE '% intern' OR "           # Ends with " intern"
                f"job_title LIKE '% intern %' OR "         # Contains " intern "
                f"job_title LIKE 'intern %' OR "           # Starts with "intern "
                f"job_title LIKE '% intern,%' OR "         # Has ", intern,"
                f"job_title LIKE '%internship%' OR "       # Contains "internship"
                f"job_title_levels='training' OR "         # PDL training level
                f"job_title_levels='intern'"               # PDL intern level
                f")"
            )
        else:
            # For other roles, broader matching
            sql_parts.append(f"AND job_title LIKE '%{role_normalized}%'")

        sql_query = " ".join(sql_parts)

        payload = {
            "sql": sql_query,
            "size": size,
        }

        try:
            response = requests.post(
                f"{PDL_BASE_URL}/person/search",
                headers={
                    "Content-Type": "application/json",
                    "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
                    "Accept": "application/json",
                },
                json=payload,
                timeout=20,
            )
            if response.status_code != 200:
                print(f"[Scout] PDL search failed {response.status_code}: {response.text[:200]}")
                return []

            data = response.json()
            records = data.get("data") or []

            candidates: List[TitleCandidate] = []
            for person in records:
                title = (
                    person.get("job_title")
                    or person.get("job", {}).get("title")
                    or ""
                )
                if not title:
                    continue

                levels = person.get("job_title_levels") or []
                company_field = person.get("job_company_name")
                metadata = {
                    "source": "pdl",
                    "levels": levels,
                    "categories": person.get("job_title_categories") or [],
                    "role": person.get("job_title_role"),
                    "sub_role": person.get("job_title_sub_role"),
                    "company": company_field,
                }
                score = 0.6
                if experience_level and levels:
                    for lvl in levels:
                        if str(experience_level).lower() in str(lvl).lower():
                            score += 0.2
                            break

                candidates.append(
                    TitleCandidate(title=title, source="pdl", score=score, metadata=metadata)
                )

            return candidates
        except Exception as exc:
            print(f"[Scout] PDL search error: {exc}")
            return []

    def _serp_search(self, company: str, user_role: str) -> List[TitleCandidate]:
        """Query SerpAPI for active job postings."""
        if not SERPAPI_KEY:
            return []

        params = {
            "engine": "google_jobs",
            "hl": "en",
            "q": f"{user_role} {company}".strip(),
            "serp_api_key": SERPAPI_KEY,
        }

        try:
            search = GoogleSearch(params)
            results = search.get_dict()
            jobs = results.get("jobs_results") or []

            candidates: List[TitleCandidate] = []
            for job in jobs:
                title = job.get("title")
                job_company = job.get("company_name")
                if not title or not job_company:
                    continue
                if company.lower() not in job_company.lower():
                    continue

                metadata = {
                    "source": "serp",
                    "location": job.get("location"),
                    "posted_at": job.get("detected_extensions", {}).get("posted_at"),
                    "via": job.get("description"),
                    "job_id": job.get("job_id"),
                    "company": job_company,
                }
                candidates.append(
                    TitleCandidate(title=title, source="serp", score=0.8, metadata=metadata)
                )

            return candidates
        except Exception as exc:
            print(f"[Scout] SERP search error: {exc}")
            return []

    # --------------------
    # Post-processing
    # --------------------
    def _normalize_and_filter_candidates(
        self,
        company: str,
        user_role: str,
        experience_level: Optional[str],
        candidates: List[TitleCandidate],
    ) -> List[TitleCandidate]:
        """Drop noisy titles and keep company/level-consistent rows before ranking."""
        company_norm = (company or "").lower().strip()
        want_intern = (experience_level or "").lower() == "intern"

        def looks_intern(title: str) -> bool:
            t = (title or "").lower()
            return ("intern" in t) or ("internship" in t)

        filtered: List[TitleCandidate] = []
        for c in candidates:
            title = (c.title or "")
            src = c.source
            comp_raw = (c.metadata or {}).get("company")
            comp = (comp_raw or "").lower().strip() if comp_raw else ""
            levels = (c.metadata or {}).get("levels") or []

            # For SERP results (already company-targeted from search queries)
            if src == "serp":
                # Keep all SERP results as they come from targeted job searches
                pass
            # For PDL results, apply strict company + level filtering
            elif src == "pdl":
                # Skip if company doesn't match (PDL can return any company's employees)
                if not comp or comp != company_norm:
                    continue

            # CRITICAL: When targeting interns, enforce strict intern-only filtering
            if want_intern:
                # Must have either "intern" in levels OR "intern/internship" in title
                if not (any(str(l).lower() == "intern" for l in levels) or looks_intern(title)):
                    continue

            filtered.append(c)

        # Boost SERP intern results since they're from actual job postings
        if want_intern and filtered:
            serp_results = [c for c in filtered if c.source == "serp"]
            if serp_results:
                for c in serp_results:
                    # Give SERP intern postings high base score
                    c.score = max(c.score, 0.8)

        # Graceful fallback: only if we have ZERO results after filtering
        if not filtered:
            if want_intern:
                # Try to salvage intern-looking titles from any source
                filtered = [c for c in candidates if looks_intern(c.title)]
            if not filtered:
                # Ultimate fallback: take top 5 candidates regardless
                filtered = candidates[:5]

        return filtered

    def _rank_candidates(self, candidates: Iterable[TitleCandidate]) -> List[Dict[str, Any]]:
        """
        Merge, dedupe, and score the raw candidates.
        """
        aggregated: Dict[str, Dict[str, Any]] = {}
        for candidate in candidates:
            key = candidate.normalised_title()
            if not key:
                continue

            entry = aggregated.setdefault(
                key,
                {
                    "title": candidate.title,
                    "sources": set(),
                    "score": 0.0,
                    "variants": set(),
                    "metadata": [],
                },
            )
            entry["score"] += candidate.score
            entry["sources"].add(candidate.source)
            entry["variants"].add(candidate.title)
            if candidate.metadata:
                entry["metadata"].append(candidate.metadata)

        ranked = sorted(
            aggregated.values(),
            key=lambda item: (item["score"], len(item["sources"])),
            reverse=True,
        )

        formatted: List[Dict[str, Any]] = []
        seen_titles = set()
        for item in ranked:
            tnorm = (item["title"] or "").strip().lower()
            if not tnorm or tnorm in seen_titles:
                continue
            seen_titles.add(tnorm)
            formatted.append(
                {
                    "title": item["title"],
                    "score": round(item["score"], 2),
                    "sources": sorted(item["sources"]),
                    "variants": sorted(item["variants"]),
                    "metadata": item["metadata"],
                }
            )
        return formatted

    async def _analyze_with_gpt(
        self,
        *,
        company: str,
        user_query: str,
        experience_level: Optional[str],
        ranked_candidates: List[Dict[str, Any]],
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Reason over the aggregated candidates using GPT."""
        if not self._async_openai or not ranked_candidates:
            primary = ranked_candidates[0]["title"] if ranked_candidates else user_query
            alternatives = [item["title"] for item in ranked_candidates[1:4]]
            return {
                "summary": f"Here are the closest titles at {company} that match {user_query}.",
                "primary_title": primary,
                "alternatives": alternatives,
                "level_explanation": experience_level or "Level unspecified",
                "cross_company_notes": None,
                "confidence": self.FALLBACK_CONFIDENCE,
                "source_counts": self._summarise_sources(ranked_candidates),
                "raw_candidates": ranked_candidates,
            }

        prompt = {
            "company": company,
            "queried_role": user_query,
            "experience_level": experience_level,
            "conversation_context": context,
            "candidate_titles": ranked_candidates,
        }

        try:
            completion = await self._async_openai.chat.completions.create(
                model=self.DEFAULT_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are Scout, an expert in job title equivalencies across tech companies. "
                            "Select the best matching job title at the specified company and explain the mapping. "
                            "If multiple levels exist, clarify the differences. "
                            "Always respond in JSON with keys: primary_title (string), alternatives (array of strings), "
                            "level_explanation (string), cross_company_notes (string or null), confidence (low|medium|high), "
                            "source_counts (object), raw_candidates (array)."
                        ),
                    },
                    {"role": "user", "content": json.dumps(prompt)},
                ],
                temperature=0.25,
                max_tokens=400,
                response_format={"type": "json_object"},
            )
            content = completion.choices[0].message.content
            if not content:
                raise ValueError("Empty response from OpenAI")
            parsed = json.loads(content)
            parsed.setdefault("primary_title", ranked_candidates[0]["title"] if ranked_candidates else user_query)
            parsed.setdefault(
                "alternatives",
                [item["title"] for item in ranked_candidates[1:4]],
            )
            parsed.setdefault("level_explanation", experience_level or "Level unspecified")
            parsed.setdefault("confidence", self.FALLBACK_CONFIDENCE)
            parsed.setdefault("raw_candidates", ranked_candidates)
            parsed.setdefault("source_counts", self._summarise_sources(ranked_candidates))
            return parsed
        except Exception as exc:
            print(f"[Scout] GPT analysis failed: {exc}")
            return {
                "summary": f"Sharing the best matching titles at {company} for {user_query}.",
                "primary_title": ranked_candidates[0]["title"] if ranked_candidates else user_query,
                "alternatives": [item["title"] for item in ranked_candidates[1:4]],
                "level_explanation": experience_level or "Level unspecified",
                "cross_company_notes": None,
                "confidence": self.FALLBACK_CONFIDENCE,
                "source_counts": self._summarise_sources(ranked_candidates),
                "raw_candidates": ranked_candidates,
            }

    def _summarise_sources(self, ranked_candidates: List[Dict[str, Any]]) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for candidate in ranked_candidates:
            for source in candidate.get("sources", []):
                counts[source] = counts.get(source, 0) + 1
        return counts

    def _augment_context(
        self,
        context: Dict[str, Any],
        company: str,
        role: str,
        level: Optional[str],
    ) -> Dict[str, Any]:
        updated = dict(context or {})
        companies = set(updated.get("companies_discussed", []))
        if company:
            companies.add(company)
        updated["companies_discussed"] = sorted(c for c in companies if c)
        if role:
            updated["role_focus"] = role
        if level:
            updated["level"] = level
        history = updated.get("history", [])
        history.append(
            {
                "company": company,
                "role": role,
                "level": level,
                "timestamp": int(time.time()),
            }
        )
        updated["history"] = history[-20:]
        return updated

    def _build_cache_key(
        self,
        company: str,
        role: str,
        experience_level: Optional[str],
    ) -> str:
        key = f"scout::{company.strip().lower()}::{role.strip().lower()}"
        if experience_level:
            key = f"{key}::{experience_level.strip().lower()}"
        return key


scout_service = ScoutService()