"""
Scout Service v2.0 - Conversational job search assistant with URL parsing,
job discovery, and SERP-powered research capabilities.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
import hashlib
import traceback
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Tuple, Literal
from urllib.parse import urlparse

import httpx
from serpapi import GoogleSearch

from app.config import SERPAPI_KEY, JINA_API_KEY
from app.services.openai_client import get_async_openai_client


# ============================================================================
# CONFIGURATION
# ============================================================================

JINA_READER_URL = "https://r.jina.ai/"
JINA_SEARCH_URL = "https://s.jina.ai/"

# Intent types
IntentType = Literal["URL_PARSE", "JOB_SEARCH", "FIELD_HELP", "RESEARCH", "CONVERSATION"]


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class SearchFields:
    """Fields that can be auto-populated in the Professional Search form."""
    job_title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    experience_level: Optional[str] = None  # intern, entry, mid, senior, etc.
    
    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}
    
    def has_any(self) -> bool:
        return any([self.job_title, self.company, self.location])


@dataclass
class JobListing:
    """A job posting found via search."""
    title: str
    company: str
    location: Optional[str] = None
    url: Optional[str] = None
    snippet: Optional[str] = None
    source: str = "serp"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ScoutResponse:
    """Response returned to the frontend."""
    status: str  # "ok", "needs_input", "error"
    message: str  # Conversational response to display
    fields: Optional[SearchFields] = None  # Fields to auto-populate
    job_listings: List[JobListing] = field(default_factory=list)  # Job results
    intent: Optional[str] = None  # What Scout understood
    context: Dict[str, Any] = field(default_factory=dict)  # Session context
    
    def to_dict(self) -> Dict[str, Any]:
        result = {
            "status": self.status,
            "message": self.message,
            "intent": self.intent,
            "context": self.context,
        }
        if self.fields and self.fields.has_any():
            result["fields"] = self.fields.to_dict()
        if self.job_listings:
            result["job_listings"] = [j.to_dict() for j in self.job_listings]
        return result


# ============================================================================
# CACHING
# ============================================================================

class TTLCache:
    """Simple in-memory TTL cache."""
    
    def __init__(self, default_ttl: int = 3600):  # 1 hour default
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

    def make_key(self, *args) -> str:
        return hashlib.md5(":".join(str(a) for a in args).encode()).hexdigest()


# ============================================================================
# SCOUT SERVICE
# ============================================================================

class ScoutService:
    """Main Scout service orchestrating all functionality."""

    DEFAULT_MODEL = "gpt-4o-mini"
    
    def __init__(self):
        self._cache = TTLCache()
        self._openai = get_async_openai_client()
    
    async def _get_http_client(self) -> httpx.AsyncClient:
        """Create a new HTTP client for each request to avoid event loop issues."""
        return httpx.AsyncClient(timeout=30.0)
    
    # ========================================================================
    # MAIN ENTRY POINT
    # ========================================================================

    async def handle_chat(
        self,
        *,
        message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Main entry point for Scout chat interactions.
        
        Args:
            message: User's message (can be URL, question, or natural language)
            context: Session context from previous messages
        
        Returns:
            ScoutResponse as dictionary
        """
        context = context or {}
        message = (message or "").strip()
        
        if not message:
            return ScoutResponse(
                status="needs_input",
                message="Hi! I'm Scout 🐕 I can help you find the right professionals to network with. You can:\n\n"
                        "• Paste a job posting URL and I'll extract the details\n"
                        "• Tell me what kind of roles you're looking for (e.g., 'data analyst jobs in NYC')\n"
                        "• Ask me about companies or roles\n\n"
                        "What would you like to do?",
            context=context,
            ).to_dict()
        
        # Classify intent
        intent, extracted = await self._classify_intent(message, context)
        print(f"[Scout] Intent: {intent}, Extracted: {extracted}")
        
        # Route to appropriate handler
        try:
            if intent == "URL_PARSE":
                response = await self._handle_url_parse(extracted.get("url", message), context)
            elif intent == "JOB_SEARCH":
                response = await self._handle_job_search(message, extracted, context)
            elif intent == "FIELD_HELP":
                response = await self._handle_field_help(message, extracted, context)
            elif intent == "RESEARCH":
                response = await self._handle_research(message, extracted, context)
            else:  # CONVERSATION
                response = await self._handle_conversation(message, context)
            
            response.intent = intent
            return response.to_dict()
            
        except Exception as e:
            print(f"[Scout] Error handling message: {e}")
            return ScoutResponse(
                status="error",
                message="I ran into an issue processing that. Could you try rephrasing or paste the job description text directly?",
                        context=context,
        ).to_dict()

    # ========================================================================
    # INTENT CLASSIFICATION
    # ========================================================================

    async def _classify_intent(
        self,
        message: str,
        context: Dict[str, Any]
    ) -> Tuple[IntentType, Dict[str, Any]]:
        """
        Classify user intent using regex patterns first, then LLM if needed.
        Returns (intent_type, extracted_entities).
        """
        extracted: Dict[str, Any] = {}
        
        # Pattern 1: URL detection (fast path)
        url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
        urls = re.findall(url_pattern, message)
        if urls:
            extracted["url"] = urls[0]
            return "URL_PARSE", extracted
        
        # Pattern 2: Job search patterns - improved to catch more variations
        job_search_patterns = [
            r'\b(find|search|look for|looking for|show me|get me|can you find)\b.*\b(jobs?|roles?|positions?|openings?|postings?)\b',
            r'\b(jobs?|roles?|positions?|openings?|postings?)\b.*\b(in|at|near)\b',
            r'\b(hiring|openings?|postings?)\b.*\b(for|at|in)\b',
            r'\bwho.*(is hiring|are hiring)\b',
            r'\b(data|software|product|marketing|sales|finance|engineering|engineer|analyst|scientist|manager|designer|developer)\b.*\b(jobs?|roles?|positions?|postings?)\b.*\b(in|at|near)\b',
            r'\b(find|search|look for)\b.*\b(postings?|openings?)\b.*\b(in|at|near)\b',
            # Catch "find [role] postings in [location]" pattern
            r'\b(find|search|look for|show me)\b.*\b(postings?|openings?|jobs?)\b',
        ]
        for pattern in job_search_patterns:
            if re.search(pattern, message, re.IGNORECASE):
                # Extract job title/role if mentioned
                # Look for role before "postings/jobs in location"
                role_match = re.search(
                    r'\b(find|search|look for|show me|get me)\s+(.+?)\s+(?:postings?|openings?|jobs?|roles?|positions?)\s+(?:in|at|near)',
                    message, re.IGNORECASE
                )
                if role_match:
                    extracted["job_title"] = role_match.group(2).strip()
                
                # Extract location if mentioned
                location_match = re.search(
                    r'\b(?:in|at|near)\s+([A-Za-z\s,]+?)(?:\s*$|\s+(?:for|as|with|postings?|openings?|jobs?))',
                    message, re.IGNORECASE
                )
                if location_match:
                    extracted["location"] = location_match.group(1).strip()
                
                # Also try to extract role from common patterns
                if not extracted.get("job_title"):
                    # Pattern: "software engineering postings" -> "software engineer"
                    role_patterns = [
                        r'\b([a-z\s]+?)\s+(?:postings?|openings?|jobs?|roles?|positions?)\s+(?:in|at|near)',
                        r'\b(?:find|search|look for)\s+([a-z\s]+?)\s+(?:postings?|openings?|jobs?)',
                    ]
                    for rp in role_patterns:
                        rm = re.search(rp, message, re.IGNORECASE)
                        if rm:
                            potential_role = rm.group(1).strip()
                            # Clean up common words
                            potential_role = re.sub(r'\b(postings?|openings?|jobs?|roles?|positions?)\b', '', potential_role, flags=re.IGNORECASE).strip()
                            if potential_role and len(potential_role) > 3:
                                extracted["job_title"] = potential_role
                                break
                
                return "JOB_SEARCH", extracted
        
        # Pattern 3: Field help patterns
        field_help_patterns = [
            r'\b(what|which)\b.*\b(title|job title|role)\b.*\b(should|would|to use)\b',
            r'\b(help|assist)\b.*\b(fill|input|enter)\b',
            r'\bhow (do|should) i (search|find|look)\b',
            r'\bwhat.*(put|enter|type|input)\b',
        ]
        for pattern in field_help_patterns:
            if re.search(pattern, message, re.IGNORECASE):
                return "FIELD_HELP", extracted
        
        # Pattern 4: Research patterns (questions about companies/roles)
        research_patterns = [
            r'\b(what|how|tell me about|describe)\b.*\b(interview|culture|salary|compensation|benefits)\b',
            r'\bwhat.*(like|about)\b.*\b(work|working)\b.*\bat\b',
            r'\b(interview process|hiring process)\b',
            r'\bhow (hard|difficult|easy)\b.*\b(get|land)\b.*\b(job|role|position)\b',
        ]
        for pattern in research_patterns:
            if re.search(pattern, message, re.IGNORECASE):
                # Extract company if mentioned
                company_match = re.search(r'\bat\s+([A-Z][A-Za-z0-9\s&]+)', message)
                if company_match:
                    extracted["company"] = company_match.group(1).strip()
                return "RESEARCH", extracted
        
        # Fall back to LLM classification for ambiguous cases
        # But first, check if it looks like a job search with a quick heuristic
        if any(word in message.lower() for word in ['find', 'search', 'look for', 'postings', 'openings', 'jobs']) and \
           any(word in message.lower() for word in ['in', 'at', 'near']):
            # Likely a job search - extract what we can
            location_match = re.search(
                r'\b(?:in|at|near)\s+([A-Za-z\s,]+?)(?:\s*$|\s+(?:for|as|with))',
                message, re.IGNORECASE
            )
            if location_match:
                extracted["location"] = location_match.group(1).strip()
            # Try to extract role
            role_match = re.search(
                r'\b(find|search|look for|show me)\s+(.+?)\s+(?:postings?|openings?|jobs?)\s+(?:in|at|near)',
                message, re.IGNORECASE
            )
            if role_match:
                extracted["job_title"] = role_match.group(2).strip()
            return "JOB_SEARCH", extracted
        
        # Fall back to LLM classification for ambiguous cases
        return await self._llm_classify_intent(message, context)
    
    async def _llm_classify_intent(
        self, 
        message: str, 
        context: Dict[str, Any]
    ) -> Tuple[IntentType, Dict[str, Any]]:
        """Use LLM to classify intent when regex patterns don't match."""
        if not self._openai:
            print("[Scout] OpenAI client not available for classification")
            return "CONVERSATION", {}
        
        try:
            prompt = f"""Classify this user message for a job search assistant. Return JSON only.

Message: "{message}"

Recent context: {json.dumps(context.get('recent_topics', []))}

Classify as one of:
- URL_PARSE: User shared a URL to a job posting
- JOB_SEARCH: User wants to find job listings (e.g., "data analyst jobs in SF")
- FIELD_HELP: User needs help with what to enter in search fields
- RESEARCH: User asking about a company, role, interview process, etc.
- CONVERSATION: General chat, follow-up, or unclear intent

Also extract any entities mentioned:
- job_title: specific role mentioned
- company: company name mentioned  
- location: city/location mentioned
- experience_level: intern, entry, mid, senior, etc.

Return format:
{{"intent": "INTENT_TYPE", "entities": {{"job_title": null, "company": null, "location": null, "experience_level": null}}}}
"""
            
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You classify user intents. Return only valid JSON."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0,
                    max_tokens=150,
                    response_format={"type": "json_object"},
                ),
                timeout=5.0
            )
            
            result = json.loads(completion.choices[0].message.content)
            intent = result.get("intent", "CONVERSATION")
            entities = result.get("entities", {})
            # Filter out null values
            entities = {k: v for k, v in entities.items() if v}
            
            return intent, entities
            
        except asyncio.TimeoutError:
            print("[Scout] LLM classification timed out - using heuristic fallback")
            # Quick heuristic: if message has job search keywords, treat as job search
            if any(word in message.lower() for word in ['find', 'search', 'look for', 'postings', 'openings', 'jobs']) and \
               any(word in message.lower() for word in ['in', 'at', 'near', 'los angeles', 'san francisco', 'new york']):
                # Extract location
                location_match = re.search(
                    r'\b(?:in|at|near)\s+([A-Za-z\s,]+?)(?:\s*$|\s+(?:for|as|with))',
                    message, re.IGNORECASE
                )
                if location_match:
                    extracted["location"] = location_match.group(1).strip()
                # Extract role
                role_match = re.search(
                    r'\b(find|search|look for|show me|can you find)\s+(.+?)\s+(?:postings?|openings?|jobs?)\s+(?:in|at|near)',
                    message, re.IGNORECASE
                )
                if role_match:
                    extracted["job_title"] = role_match.group(2).strip()
                return "JOB_SEARCH", extracted
            return "CONVERSATION", {}
        except json.JSONDecodeError as e:
            print(f"[Scout] LLM classification JSON decode error: {e}")
            return "CONVERSATION", {}
        except Exception as e:
            print(f"[Scout] LLM classification failed: {e}")
            print(f"[Scout] Traceback: {traceback.format_exc()}")
            return "CONVERSATION", {}
    
    # ========================================================================
    # URL PARSING (Jina Reader)
    # ========================================================================
    
    async def _handle_url_parse(
        self, 
        url: str, 
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Parse a job posting URL using Jina Reader and extract fields."""
        
        # Check cache first
        cache_key = self._cache.make_key("url", url)
        cached = self._cache.get(cache_key)
        if cached:
            return cached
        
        # Fetch page content via Jina Reader
        content = await self._fetch_url_content(url)
        
        if not content:
            # Fallback: Try SERP search for the URL
            return await self._handle_url_fallback(url, context)
        
        # Extract job details using LLM
        fields, summary = await self._extract_job_details_from_content(content, url)
        
        if not fields.has_any():
            return ScoutResponse(
                status="needs_input",
                message="I found the page but couldn't extract job details. Could you paste the job title and company name directly?",
                context=self._update_context(context, url=url),
            )
        
        # Build response message
        message_parts = ["📋 **Got it!** I found these details from the job posting:\n"]
        if fields.job_title:
            message_parts.append(f"• **Job Title:** {fields.job_title}")
        if fields.company:
            message_parts.append(f"• **Company:** {fields.company}")
        if fields.location:
            message_parts.append(f"• **Location:** {fields.location}")
        if fields.experience_level:
            message_parts.append(f"• **Level:** {fields.experience_level}")
        
        message_parts.append("\n✨ I've filled these into your search. Click **Find Contacts** to discover professionals in this role!")
        
        if summary:
            message_parts.append(f"\n\n💡 **About this role:** {summary}")
        
        response = ScoutResponse(
            status="ok",
            message="\n".join(message_parts),
            fields=fields,
            context=self._update_context(context, url=url, fields=fields),
        )
        
        self._cache.set(cache_key, response)
        return response
    
    async def _fetch_url_content(self, url: str) -> Optional[str]:
        """Fetch URL content using Jina Reader API."""
        client = None
        try:
            client = await self._get_http_client()
            jina_url = f"{JINA_READER_URL}{url}"
            
            headers = {}
            if JINA_API_KEY:
                headers["Authorization"] = f"Bearer {JINA_API_KEY}"
            
            response = await client.get(jina_url, headers=headers, timeout=15.0)
            
            if response.status_code == 200:
                content = response.text
                # Limit content length to avoid token limits
                if len(content) > 15000:
                    content = content[:15000] + "\n... [truncated]"
                return content
            else:
                print(f"[Scout] Jina Reader returned {response.status_code} for {url}")
                return None
                
        except asyncio.TimeoutError:
            print(f"[Scout] Jina Reader timeout for {url}")
            return None
        except RuntimeError as e:
            if "Event loop is closed" in str(e):
                print(f"[Scout] Event loop closed error for {url} - this is usually harmless")
            else:
                print(f"[Scout] Runtime error fetching URL via Jina: {e}")
            return None
        except Exception as e:
            print(f"[Scout] Error fetching URL via Jina: {type(e).__name__}: {e}")
            print(f"[Scout] Traceback: {traceback.format_exc()}")
            return None
        finally:
            # Always close the client to avoid resource leaks
            if client:
                try:
                    await client.aclose()
                except Exception:
                    pass  # Ignore errors when closing

    async def _extract_job_details_from_content(
        self,
        content: str,
        url: str
    ) -> Tuple[SearchFields, Optional[str]]:
        """Extract job details from page content using LLM."""
        if not self._openai:
            print("[Scout] OpenAI client not available for job extraction")
            return SearchFields(), None
        
        try:
            # Infer company from URL if possible
            domain_hint = self._extract_company_from_url(url)
            
            prompt = f"""Extract job posting details from this content. Return JSON only.

URL: {url}
Domain hint: {domain_hint or "unknown"}

Content:
{content[:8000]}

Extract:
- job_title: A simplified, searchable job title (e.g., "Software Engineer", "Data Analyst Intern"). 
  Remove team names, project names, and extra qualifiers. Keep only the core role.
  Example: "AI Research Scientist, Text Data Research - MSL FAIR" -> "AI Research Scientist"
- company: Company name
- location: City, State or "Remote" if mentioned
- experience_level: One of: intern, entry, mid, senior, lead, manager, director, or null
- summary: 1-2 sentence summary of the role (for context)

Return format:
{{"job_title": "...", "company": "...", "location": "...", "experience_level": "...", "summary": "..."}}

If a field cannot be determined, use null.
"""
            
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You extract structured job posting data. Return only valid JSON."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0,
                    max_tokens=300,
                    response_format={"type": "json_object"},
                ),
                timeout=15.0  # Increased from 10s to handle complex pages
            )
            
            result = json.loads(completion.choices[0].message.content)
            
            # Simplify job title if it's too specific
            raw_title = result.get("job_title")
            simplified_title = self._simplify_job_title(raw_title) if raw_title else None
            
            fields = SearchFields(
                job_title=simplified_title,
                company=result.get("company") or domain_hint,
                location=result.get("location"),
                experience_level=result.get("experience_level"),
            )
            summary = result.get("summary")
            
            return fields, summary
            
        except asyncio.TimeoutError:
            print("[Scout] Job extraction timed out (15s limit)")
            return SearchFields(), None
        except json.JSONDecodeError as e:
            print(f"[Scout] Job extraction JSON decode error: {e}")
            return SearchFields(), None
        except Exception as e:
            print(f"[Scout] Error extracting job details: {type(e).__name__}: {e}")
            print(f"[Scout] Traceback: {traceback.format_exc()}")
            return SearchFields(), None
    
    def _extract_company_from_url(self, url: str) -> Optional[str]:
        """Try to extract company name from URL domain."""
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            
            # Common ATS patterns
            ats_patterns = {
                "greenhouse.io": lambda d: d.split(".greenhouse.io")[0].replace("-", " ").title(),
                "lever.co": lambda d: d.split(".lever.co")[0].replace("-", " ").title(),
                "jobs.lever.co": lambda d: d.replace("jobs.lever.co/", "").split("/")[0].replace("-", " ").title(),
                "myworkdayjobs.com": lambda d: d.split(".myworkdayjobs.com")[0].replace("-", " ").title(),
                "smartrecruiters.com": lambda d: None,  # Company in path
                "linkedin.com": lambda d: None,  # Can't extract
            }
            
            for pattern, extractor in ats_patterns.items():
                if pattern in domain:
                    return extractor(domain)
            
            # Try to get company from subdomain or path
            if "careers" in domain or "jobs" in domain:
                parts = domain.replace("careers.", "").replace("jobs.", "").split(".")
                if parts[0] not in ["www", "apply"]:
                    return parts[0].replace("-", " ").title()
            
            return None
            
        except Exception:
            return None
    
    async def _handle_url_fallback(
        self, 
        url: str, 
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Fallback when URL fetching fails - try SERP or ask user."""
        # Try to extract company from URL
        company = self._extract_company_from_url(url)
        
        if company:
            # Search for jobs at this company
            return await self._handle_job_search(
                f"jobs at {company}",
                {"company": company},
                context
            )
        
        return ScoutResponse(
            status="needs_input",
            message="I couldn't access that URL directly. Could you try one of these:\n\n"
                    "1. **Paste the job description text** directly\n"
                    "2. **Tell me the job title and company** (e.g., 'Software Engineer at Google')\n"
                    "3. **Share a different URL** to the same posting",
            context=self._update_context(context, failed_url=url),
        )
    
    # ========================================================================
    # JOB SEARCH (SERP)
    # ========================================================================
    
    async def _handle_job_search(
        self, 
        message: str,
        extracted: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Handle job search queries using SERP API."""
        
        # Build search query
        query = await self._build_job_search_query(message, extracted, context)
        print(f"[Scout] Job search query: {query}")
        
        # Search for jobs
        jobs = await self._search_jobs(query)
        
        if not jobs:
            # Fallback: suggest common job titles
            return await self._handle_no_jobs_found(message, extracted, context)
        
        # Extract fields from first few results
        fields = self._aggregate_fields_from_jobs(jobs, extracted)
        
        # Build response with actionable job listings
        message_parts = [f"🔍 **Found {len(jobs)} relevant positions!** Here are the top matches:\n"]
        
        for i, job in enumerate(jobs[:5], 1):
            job_line = f"{i}. **{job.title}** at {job.company}"
            if job.location:
                job_line += f" ({job.location})"
            message_parts.append(job_line)
        
        message_parts.append("\n✨ **I've filled in the search form with:**")
        if fields.job_title:
            message_parts.append(f"• Job Title: **{fields.job_title}**")
        if fields.company:
            message_parts.append(f"• Company: **{fields.company}**")
        if fields.location:
            message_parts.append(f"• Location: **{fields.location}**")
        
        message_parts.append("\n💡 **Next step:** Click **Find Contacts** to discover professionals in these roles! You can also click any job listing above to use that specific role.")
        
        return ScoutResponse(
            status="ok",
            message="\n".join(message_parts),
            fields=fields,
            job_listings=jobs[:10],
            context=self._update_context(context, search_query=query, fields=fields),
        )
    
    async def _build_job_search_query(
        self,
        message: str,
        extracted: Dict[str, Any],
        context: Dict[str, Any]
    ) -> str:
        """Build an optimized search query for job postings."""
        # Start with user's message, clean it up
        query_parts = []
        
        # Add job title/role if extracted
        if extracted.get("job_title"):
            query_parts.append(extracted["job_title"])
        
        # Add location if extracted
        if extracted.get("location"):
            query_parts.append(f"in {extracted['location']}")
        
        # Add company if extracted
        if extracted.get("company"):
            query_parts.append(f"at {extracted['company']}")
        
        # If we have parts, use them; otherwise clean up the message
        if query_parts:
            query = " ".join(query_parts) + " jobs"
        else:
            # Clean message for search
            query = re.sub(r'\b(find|search|look for|looking for|show me|get me)\b', '', message, flags=re.IGNORECASE)
            query = query.strip()
            if "job" not in query.lower():
                query += " jobs"
        
        return query
    
    async def _search_jobs(self, query: str) -> List[JobListing]:
        """Search for job postings using SERP API."""
        try:
            # Check cache
            cache_key = self._cache.make_key("jobs", query)
            cached = self._cache.get(cache_key)
            if cached:
                return cached
            
            # Use Google Jobs engine for better results
            search = GoogleSearch({
            "engine": "google_jobs",
                "q": query,
                "api_key": SERPAPI_KEY,
                "num": 10,
            "hl": "en",
                "gl": "us",
            })
            
            # Run in thread pool to not block
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, search.get_dict)
            
            jobs = []
            
            # Parse jobs_results from Google Jobs
            for result in results.get("jobs_results", [])[:10]:
                title = result.get("title", "").strip()
                company = result.get("company_name", "").strip()
                location = result.get("location", "").strip()
                description = result.get("description", "")
                
                # Try multiple possible URL fields from Google Jobs API
                # Google Jobs API often uses apply_options for direct links to actual job postings
                # share_link points to Google search results, not the actual job
                link = None
                
                # Priority 1: Try apply_options first (these are direct links to actual job postings)
                # LinkedIn is usually the best source, so prefer it if available
                apply_options = result.get("apply_options", [])
                if isinstance(apply_options, list) and len(apply_options) > 0:
                    # First, try to find LinkedIn link (most reliable)
                    for option in apply_options:
                        if isinstance(option, dict):
                            option_title = (option.get("title") or "").lower()
                            apply_url = (option.get("link") or option.get("url") or "").strip()
                            if apply_url and apply_url.startswith("http"):
                                # Prefer LinkedIn, but take the first valid one if no LinkedIn found
                                if "linkedin" in option_title or "linkedin" in apply_url.lower():
                                    link = apply_url
                                    break
                                elif not link:  # Keep first valid link as fallback
                                    link = apply_url
                    
                    # If we found LinkedIn, use it; otherwise use first valid link
                    # (link is already set above if found)
                
                # Priority 2: Try other direct link fields (skip share_link as it's a Google search URL)
                if not link:
                    link = (
                        result.get("link") or 
                        result.get("apply_link") or 
                        result.get("url") or
                        ""
                    ).strip()
                    if link and link.startswith("http") and "google.com/search" not in link:
                        pass  # Keep it if it's not a Google search URL
                    else:
                        link = None
                
                # Priority 3: Only use share_link as last resort if it's not a Google search URL
                # (Usually share_link is a Google search URL, so we skip it)
                if not link:
                    share_link = result.get("share_link", "").strip()
                    if share_link and share_link.startswith("http") and "google.com/search" not in share_link:
                        link = share_link
                
                # Debug: Log available fields for first result
                if len(jobs) == 0:
                    print(f"[Scout] Debug - First job result fields: {list(result.keys())}")
                    print(f"[Scout] Debug - share_link: {result.get('share_link')}")
                    print(f"[Scout] Debug - apply_options: {result.get('apply_options')}")
                    print(f"[Scout] Debug - Final link: {link}")
                
                # Skip invalid results
                if not title or title.lower() in ["job search", "jobs", "careers", "hiring"]:
                    continue
                if not company or company.lower() in ["unknown", "jobs", "careers"]:
                    continue
                
                # Simplify the title before storing
                simplified_title = self._simplify_job_title(title)
                
                jobs.append(JobListing(
                    title=simplified_title,  # Use simplified title
                    company=company,
                    location=location,
                    url=link,  # Will be None if we couldn't find a valid URL
                    snippet=description[:200] if description else None,
                    source="google_jobs"
                ))
            
            # If no jobs_results, try organic results as fallback
            if not jobs:
                for result in results.get("organic_results", [])[:5]:
                    title = result.get("title", "").strip()
                    snippet = result.get("snippet", "").strip()
                    link = (result.get("link") or result.get("url") or "").strip()
                    
                    # Skip generic job board pages
                    if any(skip in title.lower() for skip in ["job search", "jobs at", "careers at", "hiring"]):
                        continue
                    
                    # Only use if we have a valid URL
                    if not link or not link.startswith("http"):
                        link = None
                    
                    # Try to extract job details
                    job_title, company, location = self._parse_job_from_serp_result(title, snippet, link or "")
                    
                    if job_title and job_title.lower() not in ["job search", "jobs", "careers"]:
                        # Simplify the title before storing
                        simplified_title = self._simplify_job_title(job_title)
                        
                        jobs.append(JobListing(
                            title=simplified_title,  # Use simplified title
                            company=company or "Unknown",
                            location=location,
                            url=link,  # Will be None if invalid
                            snippet=snippet[:200] if snippet else None,
                            source="serp"
                        ))
            
            self._cache.set(cache_key, jobs, ttl=1800)  # Cache for 30 min
            return jobs
            
        except Exception as e:
            print(f"[Scout] SERP search failed: {e}")
            print(f"[Scout] Traceback: {traceback.format_exc()}")
            return []

    def _parse_job_from_serp_result(
        self,
        title: str,
        snippet: str,
        url: str
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Parse job title, company, and location from SERP result."""
        job_title = None
        company = None
        location = None
        
        # Skip generic titles
        generic_titles = ["job search", "jobs", "careers", "hiring", "openings"]
        if title.lower() in generic_titles:
            return None, None, None
        
        # Common patterns in job listing titles
        # "Software Engineer - Google" or "Software Engineer at Google"
        patterns = [
            r'^(.+?)\s*[-–—]\s*(.+?)(?:\s*[-–—]\s*(.+))?$',  # Title - Company - Location
            r'^(.+?)\s+at\s+(.+?)(?:\s*[-–—,]\s*(.+))?$',   # Title at Company - Location
            r'^(.+?)\s*\|\s*(.+?)(?:\s*\|\s*(.+))?$',       # Title | Company | Location
        ]
        
        for pattern in patterns:
            match = re.match(pattern, title, re.IGNORECASE)
            if match:
                potential_title = match.group(1).strip()
                potential_company = match.group(2).strip() if match.group(2) else None
                potential_location = match.group(3).strip() if match.lastindex >= 3 and match.group(3) else None
                
                # Validate that we got meaningful data
                if potential_title and potential_title.lower() not in generic_titles:
                    job_title = potential_title
                    if potential_company and potential_company.lower() not in ["jobs", "careers", "hiring"]:
                        company = potential_company
                    if potential_location:
                        location = potential_location
                    break
        
        # If no match, use the whole title as job title (if it's not generic)
        if not job_title and title.lower() not in generic_titles:
            job_title = title
        
        # Try to extract company from snippet if not found
        if not company and snippet:
            # Look for "at Company" or "Company is hiring" patterns
            company_match = re.search(r'\b(at|from|with)\s+([A-Z][A-Za-z0-9\s&]+?)(?:\s|,|\.|$)', snippet, re.IGNORECASE)
            if company_match:
                potential_company = company_match.group(2).strip()
                if potential_company.lower() not in ["jobs", "careers", "hiring", "the", "a", "an"]:
                    company = potential_company
        
        # Try to get company from URL
        if not company:
            company = self._extract_company_from_url(url)
        
        # Extract location from snippet if not found
        if not location and snippet:
            # Look for location patterns like "in City, State" or "City, State"
            location_match = re.search(r'\b(in|at|near)\s+([A-Z][A-Za-z\s,]+?)(?:\s|,|\.|$)', snippet, re.IGNORECASE)
            if location_match:
                potential_location = location_match.group(2).strip()
                # Basic validation - should contain letters and possibly commas
                if len(potential_location) > 2 and any(c.isalpha() for c in potential_location):
                    location = potential_location
        
        return job_title, company, location
    
    def _aggregate_fields_from_jobs(
        self,
        jobs: List[JobListing],
        extracted: Dict[str, Any]
    ) -> SearchFields:
        """Aggregate the most common/relevant fields from job listings."""
        # Use extracted fields as base
        raw_job_title = extracted.get("job_title")
        # Simplify the job title if it's too specific
        job_title = self._simplify_job_title(raw_job_title) if raw_job_title else None
        company = extracted.get("company")
        location = extracted.get("location")
        
        # Filter out invalid jobs
        valid_jobs = [
            j for j in jobs 
            if j.title 
            and j.title.lower() not in ["job search", "jobs", "careers", "hiring", "unknown"]
            and j.company 
            and j.company.lower() not in ["unknown", "jobs", "careers", "hiring"]
        ]
        
        # If not extracted, use most common from results
        if not job_title and valid_jobs:
            # Get the most common job title (not the shortest, but the most frequent)
            # First simplify all titles
            simplified_titles = {}
            for j in valid_jobs:
                simplified = self._simplify_job_title(j.title)
                if simplified:
                    simplified_titles[simplified] = simplified_titles.get(simplified, 0) + 1
            
            if simplified_titles:
                # Get the most common simplified title
                most_common = max(simplified_titles.items(), key=lambda x: x[1])[0]
                job_title = most_common
        
        if not company and valid_jobs:
            companies = [j.company for j in valid_jobs if j.company and j.company != "Unknown"]
            if companies:
                # Get most common company
                company_counts = {}
                for c in companies:
                    company_key = c.strip().lower()
                    company_counts[company_key] = company_counts.get(company_key, 0) + 1
                if company_counts:
                    most_common_company = max(company_counts.items(), key=lambda x: x[1])
                    company = most_common_company[0].title()
        
        if not location and valid_jobs:
            locations = [j.location for j in valid_jobs if j.location]
            if locations:
                # Get most common location
                location_counts = {}
                for loc in locations:
                    loc_key = loc.strip().lower()
                    location_counts[loc_key] = location_counts.get(loc_key, 0) + 1
                if location_counts:
                    most_common_location = max(location_counts.items(), key=lambda x: x[1])
                    location = most_common_location[0].title()
        
        return SearchFields(
            job_title=job_title,
            company=company,
            location=location,
        )
    
    async def _handle_no_jobs_found(
        self,
        message: str,
        extracted: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Handle case when no jobs are found - suggest alternatives."""
        suggestions = await self._get_title_suggestions(message, extracted)
        
        message_parts = [
            "🤔 I couldn't find exact matches. Here are some suggestions:\n"
        ]
        
        if suggestions:
            message_parts.append("**Try searching for:**")
            for s in suggestions[:5]:
                message_parts.append(f"• {s}")
        
        message_parts.append("\n💡 **Tips:**")
        message_parts.append("• Try broader job titles (e.g., 'Analyst' instead of 'Junior Data Analyst')")
        message_parts.append("• Check the spelling of company names")
        message_parts.append("• Try a larger city or metro area")
        
        return ScoutResponse(
            status="needs_input",
            message="\n".join(message_parts),
            context=context,
        )
    
    async def _get_title_suggestions(
        self,
        message: str,
        extracted: Dict[str, Any]
    ) -> List[str]:
        """Get alternative job title suggestions."""
        if not self._openai:
            return []
        
        try:
            prompt = f"""The user is looking for: "{message}"
Extracted info: {json.dumps(extracted)}

Suggest 5 alternative, commonly-used job titles they might search for.
Focus on titles that would have many professionals on LinkedIn.

Return as JSON: {{"suggestions": ["title1", "title2", ...]}}
"""
            
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You suggest job titles. Return JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.7,
                    max_tokens=150,
                    response_format={"type": "json_object"},
                ),
                timeout=5.0
            )
            
            result = json.loads(completion.choices[0].message.content)
            return result.get("suggestions", [])
            
        except Exception as e:
            print(f"[Scout] Error getting suggestions: {e}")
            print(f"[Scout] Traceback: {traceback.format_exc()}")
            return []
    
    # ========================================================================
    # FIELD HELP
    # ========================================================================
    
    async def _handle_field_help(
        self,
        message: str,
        extracted: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Help users understand what to enter in search fields."""
        
        if not self._openai:
            return ScoutResponse(
                status="ok",
                message="Here are some tips for filling in the search:\n\n"
                        "• **Job Title**: Use common titles like 'Software Engineer', 'Product Manager', 'Data Analyst'\n"
                        "• **Company**: Optional - leave blank to search across all companies\n"
                        "• **Location**: Use city names like 'San Francisco, CA' or 'New York, NY'\n\n"
                        "What specific role are you interested in? I can help you find the right search terms!",
                context=context,
            )
        
        prompt = f"""The user needs help with job search fields. Their message: "{message}"

Context from conversation: {json.dumps(context.get('recent_topics', []))}

Provide helpful, specific advice about:
1. What job titles to search for (be specific based on their interests)
2. Whether to include company name or leave it broad
3. Best practices for location (city vs metro area)

Keep response concise and actionable. Use bullet points.
If you can infer specific titles they should try, list them.
"""
        
        try:
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You are Scout, a helpful job search assistant. Be friendly and concise."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.7,
                    max_tokens=400,
                ),
                timeout=8.0
            )
            
            response_text = completion.choices[0].message.content
            
            return ScoutResponse(
                status="ok",
                message=response_text,
                context=self._update_context(context, topic="field_help"),
            )
            
        except Exception as e:
            print(f"[Scout] Field help failed: {e}")
            print(f"[Scout] Traceback: {traceback.format_exc()}")
            return ScoutResponse(
                status="ok",
                message="Here are some tips for filling in the search:\n\n"
                        "• **Job Title**: Use common titles like 'Software Engineer', 'Product Manager', 'Data Analyst'\n"
                        "• **Company**: Optional - leave blank to search across all companies\n"
                        "• **Location**: Use city names like 'San Francisco, CA' or 'New York, NY'\n\n"
                        "What specific role are you interested in? I can help you find the right search terms!",
                context=context,
            )
    
    # ========================================================================
    # RESEARCH (Company/Role Info)
    # ========================================================================
    
    async def _handle_research(
        self,
        message: str,
        extracted: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Handle research questions about companies, roles, interviews, etc."""
        
        # Build search query for research
        search_query = message
        if extracted.get("company"):
            search_query = f"{extracted['company']} {message}"
        
        # Search for information
        try:
            search = GoogleSearch({
                "q": search_query,
                "api_key": SERPAPI_KEY,
                "num": 5,
            })
            
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, search.get_dict)
            
            # Collect snippets for context
            snippets = []
            for result in results.get("organic_results", [])[:5]:
                snippet = result.get("snippet", "")
                source = result.get("displayed_link", "")
                if snippet:
                    snippets.append(f"[{source}]: {snippet}")
            
            research_context = "\n".join(snippets)
            
        except Exception as e:
            print(f"[Scout] Research SERP failed: {e}")
            research_context = ""
        
        # Generate response with LLM
        if not self._openai:
            return ScoutResponse(
                status="ok",
                message="I found some information but had trouble summarizing it. Try asking a more specific question, like:\n\n"
                        "• 'What's the interview process at [Company]?'\n"
                        "• 'What skills are needed for [Role]?'\n"
                        "• 'How is the culture at [Company]?'",
                context=context,
            )
        
        try:
            prompt = f"""The user is researching: "{message}"
            
Company mentioned: {extracted.get('company', 'not specified')}
Role mentioned: {extracted.get('job_title', 'not specified')}

Search results for context:
{research_context}

Provide a helpful, informative response. Include:
1. Direct answer to their question
2. Relevant insights from search results
3. A follow-up suggestion for their job search

Keep it concise but informative. Use formatting for readability.
"""
            
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                model=self.DEFAULT_MODEL,
                messages=[
                        {"role": "system", "content": "You are Scout, a knowledgeable job search assistant. Provide helpful research insights."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.7,
                    max_tokens=500,
                ),
                timeout=10.0
            )
            
            response_text = completion.choices[0].message.content
            
            # If we found fields, include them
            fields = None
            if extracted.get("job_title") or extracted.get("company"):
                fields = SearchFields(
                    job_title=extracted.get("job_title"),
                    company=extracted.get("company"),
                    location=extracted.get("location"),
                )
            
            return ScoutResponse(
                status="ok",
                message=response_text,
                fields=fields,
                context=self._update_context(context, topic="research", company=extracted.get("company")),
            )
            
        except Exception as e:
            print(f"[Scout] Research response failed: {e}")
            print(f"[Scout] Traceback: {traceback.format_exc()}")
            return ScoutResponse(
                status="ok",
                message="I found some information but had trouble summarizing it. Try asking a more specific question, like:\n\n"
                        "• 'What's the interview process at [Company]?'\n"
                        "• 'What skills are needed for [Role]?'\n"
                        "• 'How is the culture at [Company]?'",
                context=context,
            )
    
    # ========================================================================
    # CONVERSATION (General Chat)
    # ========================================================================
    
    async def _handle_conversation(
        self,
        message: str,
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Handle general conversation and follow-ups."""
        
        # Quick check: if this looks like a job search, handle it as such
        if any(word in message.lower() for word in ['find', 'search', 'look for', 'postings', 'openings', 'jobs']) and \
           any(word in message.lower() for word in ['in', 'at', 'near', 'los angeles', 'san francisco', 'new york', 'nyc', 'sf', 'la']):
            # Extract what we can
            extracted = {}
            location_match = re.search(
                r'\b(?:in|at|near)\s+([A-Za-z\s,]+?)(?:\s*$|\s+(?:for|as|with))',
                message, re.IGNORECASE
            )
            if location_match:
                extracted["location"] = location_match.group(1).strip()
            role_match = re.search(
                r'\b(find|search|look for|show me|can you find)\s+(.+?)\s+(?:postings?|openings?|jobs?)\s+(?:in|at|near)',
                message, re.IGNORECASE
            )
            if role_match:
                extracted["job_title"] = role_match.group(2).strip()
            # Treat as job search
            return await self._handle_job_search(message, extracted, context)
        
        if not self._openai:
            print("[Scout] OpenAI client not available for conversation")
            return ScoutResponse(
                status="ok",
                message="I'm here to help you find professionals to network with! You can:\n\n"
                        "🔗 **Paste a job posting URL** - I'll extract the details\n"
                        "🔍 **Describe what you're looking for** - e.g., 'data analyst jobs in NYC'\n"
                        "❓ **Ask me anything** - about companies, roles, or interviews\n\n"
                        "What would you like to do?",
                context=context,
            )
        
        # Build conversation history
        history = context.get("history", [])
        
        try:
            messages = [
                {
                    "role": "system",
                    "content": """You are Scout, a friendly and helpful job search assistant for Offerloop.ai.
                    
Your capabilities:
- Parse job posting URLs to extract details
- Find job listings based on descriptions
- Help users choose the right search terms
- Answer questions about companies, roles, and interviews

You help users fill in the Professional Search form with:
- Job Title (required)
- Company (optional)
- Location (required)

Be concise, friendly, and action-oriented. Use emojis sparingly.
If the user seems stuck, suggest concrete next steps.
If you can extract job search fields from the conversation, mention them."""
                }
            ]
            
            # Add recent history
            for h in history[-6:]:  # Last 6 messages
                messages.append({"role": h["role"], "content": h["content"]})
            
            messages.append({"role": "user", "content": message})
            
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=400,
                ),
                timeout=8.0
            )
            
            response_text = completion.choices[0].message.content
            
            # Update history
            new_history = history + [
                {"role": "user", "content": message},
                {"role": "assistant", "content": response_text},
            ]
            
            return ScoutResponse(
                status="ok",
                message=response_text,
                context=self._update_context(context, history=new_history[-10:]),
            )
            
        except asyncio.TimeoutError:
            print("[Scout] Conversation timed out")
            return ScoutResponse(
                status="ok",
                message="I'm here to help you find professionals to network with! You can:\n\n"
                        "🔗 **Paste a job posting URL** - I'll extract the details\n"
                        "🔍 **Describe what you're looking for** - e.g., 'data analyst jobs in NYC'\n"
                        "❓ **Ask me anything** - about companies, roles, or interviews\n\n"
                        "What would you like to do?",
                context=context,
            )
        except Exception as e:
            print(f"[Scout] Conversation failed: {e}")
            print(f"[Scout] Traceback: {traceback.format_exc()}")
            return ScoutResponse(
                status="ok",
                message="I'm here to help you find professionals to network with! You can:\n\n"
                        "🔗 **Paste a job posting URL** - I'll extract the details\n"
                        "🔍 **Describe what you're looking for** - e.g., 'data analyst jobs in NYC'\n"
                        "❓ **Ask me anything** - about companies, roles, or interviews\n\n"
                        "What would you like to do?",
                context=context,
            )
    
    # ========================================================================
    # HELPERS
    # ========================================================================
    
    def _simplify_job_title(self, job_title: str) -> str:
        """
        Simplify overly specific job titles to improve search results.
        Removes department names, team names, project names, and extra qualifiers while keeping core role.
        
        Examples:
        - "Consulting Services - Senior Consultant" -> "Senior Consultant"
        - "AI Research Scientist, Text Data Research - MSL FAIR" -> "AI Research Scientist"
        - "Software Engineer, Infrastructure Team" -> "Software Engineer"
        - "Product Manager - Growth" -> "Product Manager"
        """
        if not job_title:
            return job_title
        
        title = job_title.strip()
        original_title = title
        
        # Common job role keywords (the actual role, not department)
        role_keywords = [
            'engineer', 'manager', 'scientist', 'analyst', 'designer',
            'developer', 'director', 'lead', 'architect', 'specialist',
            'consultant', 'coordinator', 'assistant', 'intern', 'researcher',
            'executive', 'officer', 'president', 'vice president', 'vp',
            'associate', 'senior', 'junior', 'principal', 'staff'
        ]
        
        # Department/service name indicators (usually not the actual role)
        department_keywords = [
            'services', 'solutions', 'department', 'division', 'team', 'group',
            'consulting', 'advisory', 'practice', 'unit', 'organization'
        ]
        
        # If title has dash, intelligently choose which part is the actual role
        if ' - ' in title or ' – ' in title or ' — ' in title:
            # Try different dash types
            for dash in [' - ', ' – ', ' — ']:
                if dash in title:
                    parts = [p.strip() for p in title.split(dash)]
                    
                    # Score each part: higher score = more likely to be the actual role
                    best_part = None
                    best_score = -1
                    
                    for i, part in enumerate(parts):
                        score = 0
                        part_lower = part.lower()
                        
                        # Points for having role keywords
                        for keyword in role_keywords:
                            if keyword in part_lower:
                                score += 2
                        
                        # Negative points for department keywords (unless it's clearly a role)
                        for dept_word in department_keywords:
                            if dept_word in part_lower:
                                # Only penalize if it's the ONLY word or clearly a department
                                if len(part.split()) <= 2 and not any(rk in part_lower for rk in role_keywords):
                                    score -= 3
                        
                        # Prefer parts that have both a role keyword AND a level (senior, junior, etc.)
                        if any(level in part_lower for level in ['senior', 'junior', 'principal', 'lead', 'staff', 'associate']):
                            if any(rk in part_lower for rk in role_keywords):
                                score += 3
                        
                        # Prefer second part if first looks like a department
                        if i == 1 and len(parts) > 0:
                            first_lower = parts[0].lower()
                            if any(dept in first_lower for dept in department_keywords):
                                score += 2
                        
                        if score > best_score:
                            best_score = score
                            best_part = part
                    
                    # Use the best part if we found one with a positive score
                    if best_part and best_score > 0:
                        title = best_part
                    # Fallback: if first part looks like department, use second
                    elif len(parts) > 1:
                        first_lower = parts[0].lower()
                        second = parts[1]
                        if any(dept in first_lower for dept in department_keywords):
                            if any(rk in second.lower() for rk in role_keywords):
                                title = second
                    break
        
        # If title has comma, find the part with the most role keywords
        if ',' in title:
            parts = [p.strip() for p in title.split(',')]
            
            best_part = None
            best_score = -1
            
            for part in parts:
                score = sum(1 for keyword in role_keywords if keyword in part.lower())
                # Penalize if it looks like a department
                part_lower = part.lower()
                if any(dept in part_lower for dept in department_keywords):
                    if not any(rk in part_lower for rk in role_keywords):
                        score -= 2
                
                if score > best_score:
                    best_score = score
                    best_part = part
            
            if best_part and best_score > 0:
                title = best_part
            else:
                # Default to first part
                title = parts[0]
        
        # Remove parenthetical team/project names: "Title (Team Name)"
        if '(' in title and ')' in title:
            title = re.sub(r'\s*\([^)]+\)', '', title).strip()
        
        # Remove trailing department/team indicators
        title = re.sub(r'\s*[-–—]\s*[A-Z][^a-z]*$', '', title)  # Remove " - MSL FAIR" type patterns
        title = re.sub(r',\s*[A-Z][^,]+$', '', title)  # Remove ", Team Name" at end
        
        # Final cleanup - remove extra spaces
        title = ' '.join(title.split())
        
        # If we ended up with something too short or just a department name, keep original
        if len(title) < 3 or title.lower() in department_keywords:
            return original_title
        
        return title
    
    def _update_context(self, context: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        """Update context with new information."""
        updated = dict(context)
        
        for key, value in kwargs.items():
            if value is not None:
                if key == "fields" and isinstance(value, SearchFields):
                    updated["last_fields"] = value.to_dict()
                elif key == "history":
                    updated["history"] = value
                else:
                    updated[key] = value
        
        # Track recent topics
        topics = updated.get("recent_topics", [])
        if kwargs.get("topic"):
            topics.append(kwargs["topic"])
            updated["recent_topics"] = topics[-5:]  # Keep last 5
        
        return updated


# ============================================================================
# SINGLETON INSTANCE
# ============================================================================

scout_service = ScoutService()
