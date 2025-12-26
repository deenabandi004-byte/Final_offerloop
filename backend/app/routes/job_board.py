"""
Job Board API endpoints - job listings, resume optimization, and cover letter generation.
Uses SerpAPI Google Jobs for real job listings with Firestore caching.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, parse_qs

from flask import Blueprint, jsonify, request
import requests
from bs4 import BeautifulSoup

from app.extensions import require_firebase_auth, get_db
from app.services.auth import deduct_credits_atomic, check_and_reset_credits
from app.services.openai_client import get_async_openai_client

job_board_bp = Blueprint("job_board", __name__, url_prefix="/api/job-board")


# =============================================================================
# CONSTANTS
# =============================================================================

OPTIMIZATION_CREDIT_COST = 20
COVER_LETTER_CREDIT_COST = 15
CACHE_DURATION_HOURS = 6  # How long to cache job results

# SerpAPI Configuration
SERPAPI_KEY = os.getenv("SERPAPI_KEY") or os.getenv("SERP_API_KEY")


# =============================================================================
# FIRESTORE CACHING
# =============================================================================

def get_cache_key(query: str, location: str, job_type: Optional[str] = None, page_token: Optional[str] = None) -> str:
    """
    Generate a unique cache key for a job search query.
    Includes page_token for pagination support.
    """
    cache_string = f"{query.lower().strip()}|{location.lower().strip()}|{job_type or 'all'}|{page_token or 'first'}"
    return hashlib.md5(cache_string.encode()).hexdigest()


def get_cached_jobs(cache_key: str) -> Optional[List[Dict[str, Any]]]:
    """
    Retrieve cached job results from Firestore if not expired.
    """
    try:
        db = get_db()
        if not db:
            return None
            
        cache_ref = db.collection("job_cache").document(cache_key)
        cache_doc = cache_ref.get()
        
        if not cache_doc.exists:
            print(f"[JobBoard Cache] Miss - no cache for key {cache_key[:8]}...")
            return None
        
        cache_data = cache_doc.to_dict()
        cached_at = cache_data.get("cached_at")
        
        if not cached_at:
            return None
        
        # Convert Firestore timestamp to datetime, handling timezone
        if hasattr(cached_at, 'timestamp'):
            # Firestore Timestamp object
            cache_time = datetime.fromtimestamp(cached_at.timestamp(), tz=timezone.utc).replace(tzinfo=None)
        elif hasattr(cached_at, 'tzinfo') and cached_at.tzinfo is not None:
            # Timezone-aware datetime
            cache_time = cached_at.replace(tzinfo=None)
        else:
            # Already naive datetime
            cache_time = cached_at
        
        expiry_time = cache_time + timedelta(hours=CACHE_DURATION_HOURS)
        now = datetime.utcnow()
        
        if now > expiry_time:
            print(f"[JobBoard Cache] Expired - key {cache_key[:8]}...")
            return None
        
        jobs = cache_data.get("jobs", [])
        print(f"[JobBoard Cache] Hit - returning {len(jobs)} cached jobs")
        return jobs
        
    except Exception as e:
        print(f"[JobBoard Cache] Error reading cache: {e}")
        return None


def set_cached_jobs(
    cache_key: str, 
    jobs_data: Any,  # Can be List[Dict] or tuple of (List[Dict], next_token)
    query: str, 
    location: str,
    job_type: Optional[str] = None
) -> None:
    """
    Store job results in Firestore cache.
    Accepts either a list of jobs (legacy) or tuple of (jobs, next_token).
    """
    try:
        db = get_db()
        if not db:
            return
        
        # Handle both tuple format (new) and list format (legacy)
        if isinstance(jobs_data, tuple) and len(jobs_data) == 2:
            jobs, next_token = jobs_data
        else:
            jobs = jobs_data if isinstance(jobs_data, list) else []
            next_token = None
            
        cache_ref = db.collection("job_cache").document(cache_key)
        cache_data = {
            "jobs": jobs,
            "query": query,
            "location": location,
            "job_type": job_type,
            "cached_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(hours=CACHE_DURATION_HOURS),
            "result_count": len(jobs),
        }
        
        if next_token:
            cache_data["next_page_token"] = next_token
            
        cache_ref.set(cache_data)
        print(f"[JobBoard Cache] Stored {len(jobs)} jobs for key {cache_key[:8]}...")
        
    except Exception as e:
        print(f"[JobBoard Cache] Error writing cache: {e}")


def clear_expired_cache() -> int:
    """
    Clean up expired cache entries. Call periodically or via cron.
    Returns number of deleted entries.
    """
    try:
        db = get_db()
        if not db:
            return 0
            
        expired_docs = db.collection("job_cache").where(
            "expires_at", "<", datetime.utcnow()
        ).limit(100).get()
        
        deleted = 0
        for doc in expired_docs:
            doc.reference.delete()
            deleted += 1
        
        if deleted > 0:
            print(f"[JobBoard Cache] Cleaned up {deleted} expired entries")
        
        return deleted
        
    except Exception as e:
        print(f"[JobBoard Cache] Error clearing expired cache: {e}")
        return 0


# =============================================================================
# SERPAPI GOOGLE JOBS INTEGRATION
# =============================================================================

def get_best_job_link(job: Dict[str, Any]) -> str:
    """
    Extract the best direct job link from SerpAPI job data.
    
    Priority order:
    1. LinkedIn link (if available) - look for "linkedin.com" in the URL
    2. First apply option (company's direct job posting link)
    3. Fallback to related_links or share_link
    
    Args:
        job: Raw job data from SerpAPI
        
    Returns:
        Best available job link URL
    """
    apply_options = job.get("apply_options", [])
    
    # First priority: Look for LinkedIn link in apply_options
    if apply_options:
        for option in apply_options:
            link = option.get("link", "")
            if link and "linkedin.com" in link.lower():
                print(f"[JobBoard] Using LinkedIn link: {link[:80]}...")
                return link
    
    # Second priority: Use first apply option (company's direct job posting)
    if apply_options and len(apply_options) > 0:
        direct_link = apply_options[0].get("link", "")
        if direct_link:
            print(f"[JobBoard] Using direct company link: {direct_link[:80]}...")
            return direct_link
    
    # Fallback: Try related_links
    related_links = job.get("related_links", [])
    if related_links:
        fallback_link = related_links[0].get("link", "")
        if fallback_link:
            print(f"[JobBoard] Using related link: {fallback_link[:80]}...")
            return fallback_link
    
    # Last resort: share_link or empty
    share_link = job.get("share_link", "")
    if share_link:
        print(f"[JobBoard] Using share link: {share_link[:80]}...")
        return share_link
    
    print(f"[JobBoard] WARNING: No valid job link found for job: {job.get('title', 'Unknown')}")
    return ""


def fetch_jobs_from_serpapi(
    query: str,
    location: str = "United States",
    job_type: Optional[str] = None,
    num_results: int = 20,
    use_cache: bool = True,
    page_token: Optional[str] = None,  # Can be next_page_token string or "start=10" format
) -> tuple[List[Dict[str, Any]], Optional[str]]:
    """
    Fetch job listings from SerpAPI Google Jobs with Firestore caching.
    Uses next_page_token for pagination (start parameter is deprecated).
    
    Args:
        query: Job search query (e.g., "Software Engineer Intern")
        location: Location to search (e.g., "San Francisco, CA")
        job_type: Optional filter - "Internship", "Full-Time", "Part-Time", "Contract"
        num_results: Number of results to fetch (max 10 per request for Google Jobs)
        use_cache: Whether to use Firestore cache
        page_token: Next page token from previous response (None for first page)
    
    Returns:
        Tuple of (list of job dictionaries, next_page_token for pagination)
    """
    # Check cache first (but only for single-page requests to avoid stale pagination)
    if use_cache and page_token is None:  # Only cache first page to avoid pagination issues
        cache_key = get_cache_key(query, location, job_type, page_token)
        cached_data = get_cached_jobs(cache_key)
        if cached_data is not None:
            # Cache stores tuple of (jobs, next_token) or legacy list format
            if isinstance(cached_data, tuple) and len(cached_data) == 2:
                cached_jobs, cached_token = cached_data
                print(f"[JobBoard Cache] Hit - returning {len(cached_jobs)} cached jobs, next_token={'Yes' if cached_token else 'No'}")
                return cached_jobs, cached_token
            # Legacy cache format (just jobs list) - if we only have 10 jobs and no next_token,
            # it might be incomplete, so bypass cache to get fresh data with pagination tokens
            elif isinstance(cached_data, list):
                if len(cached_data) <= 10:
                    # Legacy cache with 10 or fewer jobs likely doesn't have next_token info
                    # Bypass cache to get fresh data with proper pagination
                    print(f"[JobBoard Cache] Legacy cache with {len(cached_data)} jobs (likely incomplete), bypassing cache to fetch fresh data")
                    use_cache = False  # Fall through to fetch fresh data
                else:
                    # If we have more than 10 jobs in cache, it might be complete
                    print(f"[JobBoard Cache] Hit - returning {len(cached_data)} cached jobs (legacy format, no next_token)")
                    return cached_data, None
    
    if not SERPAPI_KEY:
        print("[JobBoard] WARNING: SERPAPI_KEY not found, using mock data")
        return [], None
    
    try:
        url = "https://serpapi.com/search"
        
        # Build query with job type included (chips parameter causes 400 errors)
        search_query = query
        if job_type:
            if job_type == "Internship" and "internship" not in query.lower():
                search_query = f"{query} internship"
            elif job_type == "Full-Time" and "full time" not in query.lower() and "full-time" not in query.lower():
                search_query = f"{query} full time"
            elif job_type == "Part-Time" and "part time" not in query.lower() and "part-time" not in query.lower():
                search_query = f"{query} part time"
            elif job_type == "Contract" and "contract" not in query.lower():
                search_query = f"{query} contract"
        
        params = {
            "engine": "google_jobs",
            "q": search_query,
            "location": location,
            "api_key": SERPAPI_KEY,
            "hl": "en",
            "num": min(num_results, 10),  # SerpAPI Google Jobs typically returns 10 results per page
        }
        
        # Use next_page_token for pagination if available
        # Fallback to 'start' parameter if next_page_token is not available
        if page_token:
            if isinstance(page_token, str) and page_token.startswith("start="):
                # Using start parameter for pagination (fallback method)
                start_offset = int(page_token.replace("start=", ""))
                params["start"] = start_offset
                print(f"[JobBoard] Using start parameter for pagination: start={start_offset}")
            else:
                # Using next_page_token (preferred method)
                params["next_page_token"] = page_token
        
        print(f"[JobBoard] Fetching jobs from SerpAPI: {search_query} in {location}")
        print(f"[JobBoard] Request params (masked): engine={params['engine']}, q={params['q']}, location={params['location']}, num={params['num']}, page_token={'***' if page_token else 'None'}")
        
        response = requests.get(url, params=params, timeout=30)
        
        # Check for HTTP errors
        if response.status_code != 200:
            print(f"[JobBoard] SerpAPI HTTP error {response.status_code}: {response.text[:500]}")
            return [], None
        
        try:
            data = response.json()
        except ValueError as e:
            print(f"[JobBoard] SerpAPI JSON parse error: {e}, response: {response.text[:500]}")
            return [], None
        
        if "error" in data:
            print(f"[JobBoard] SerpAPI API error: {data.get('error', 'Unknown error')}")
            if "error" in data and isinstance(data["error"], dict):
                print(f"[JobBoard] Error details: {data['error']}")
            return [], None
        
        jobs_results = data.get("jobs_results", [])
        
        # Debug: Log response structure to understand pagination
        print(f"[JobBoard] Response keys: {list(data.keys())}")
        print(f"[JobBoard] Found {len(jobs_results)} jobs from SerpAPI")
        
        # Extract next_page_token from pagination object
        pagination = data.get("pagination", {})
        if pagination:
            print(f"[JobBoard] Pagination object keys: {list(pagination.keys())}")
        next_page_token = pagination.get("next_page_token") if pagination else None
        
        # Also check for pagination at root level
        if not next_page_token:
            next_page_token = data.get("next_page_token")
        
        # Check for serpapi_pagination (alternative format - this contains the full URL or token)
        serpapi_pagination = data.get("serpapi_pagination", {})
        if serpapi_pagination and not next_page_token:
            next_page_value = serpapi_pagination.get("next")
            print(f"[JobBoard] Found next value in serpapi_pagination: {next_page_value[:100] if next_page_value else 'None'}...")
            if next_page_value:
                # The value might be a full URL or just a token
                # If it's a URL, extract the token from the query string
                if isinstance(next_page_value, str) and "next_page_token=" in next_page_value:
                    # Extract token from URL
                    try:
                        parsed = urlparse(next_page_value)
                        params = parse_qs(parsed.query)
                        if "next_page_token" in params:
                            next_page_token = params["next_page_token"][0]
                            print(f"[JobBoard] Extracted token from URL: {next_page_token[:50]}...")
                    except Exception as e:
                        print(f"[JobBoard] Error extracting token from URL: {e}")
                        # Fallback: try to extract manually
                        if "next_page_token=" in next_page_value:
                            parts = next_page_value.split("next_page_token=")
                            if len(parts) > 1:
                                token_part = parts[1].split("&")[0]
                                next_page_token = token_part
                                print(f"[JobBoard] Extracted token manually: {next_page_token[:50]}...")
                elif isinstance(next_page_value, str):
                    # It's already a token
                    next_page_token = next_page_value
                    print(f"[JobBoard] Using next_page_value as token directly")
        
        if next_page_token:
            print(f"[JobBoard] Next page token available for pagination: {next_page_token[:50]}...")
        else:
            print(f"[JobBoard] No next_page_token found in response. Checking if we can use 'start' parameter for pagination...")
        
        # Transform SerpAPI format to our format
        jobs = []
        for idx, job in enumerate(jobs_results):
            # Extract salary if available
            salary = None
            if job.get("detected_extensions", {}).get("salary"):
                salary = job["detected_extensions"]["salary"]
            elif job.get("extensions"):
                for ext in job["extensions"]:
                    if "$" in ext or "hour" in ext.lower() or "year" in ext.lower():
                        salary = ext
                        break
            
            # Determine job type
            detected_type = "Full-Time"
            extensions = job.get("extensions", [])
            extensions_str = " ".join(extensions).lower()
            if "intern" in extensions_str or "internship" in job.get("title", "").lower():
                detected_type = "Internship"
            elif "part-time" in extensions_str or "part time" in extensions_str:
                detected_type = "Part-Time"
            elif "contract" in extensions_str or "contractor" in extensions_str:
                detected_type = "Contract"
            
            # Check if remote
            is_remote = "remote" in extensions_str or "work from home" in extensions_str
            
            # Get posted time
            posted = "Recently"
            detected_extensions = job.get("detected_extensions", {})
            if detected_extensions.get("posted_at"):
                posted = detected_extensions["posted_at"]
            elif extensions:
                for ext in extensions:
                    if "ago" in ext.lower() or "day" in ext.lower() or "hour" in ext.lower():
                        posted = ext
                        break
            
            # Extract requirements from description highlights
            requirements = []
            highlights = job.get("job_highlights", [])
            for highlight in highlights:
                if highlight.get("title", "").lower() in ["qualifications", "requirements", "what you need"]:
                    requirements = highlight.get("items", [])[:5]
                    break
            
            # Get best apply link using priority: LinkedIn > Direct company link > Fallback
            apply_link = get_best_job_link(job)
            
            # Build job object
            transformed_job = {
                "id": job.get("job_id", f"serp_{idx}_{hash(job.get('title', ''))}"),
                "title": job.get("title", "Unknown Title"),
                "company": job.get("company_name", "Unknown Company"),
                "location": job.get("location", location),
                "salary": salary,
                "type": detected_type,
                "posted": posted,
                "description": job.get("description", "")[:2000],  # Limit description size for cache
                "requirements": requirements,
                "url": apply_link,
                "logo": job.get("thumbnail"),
                "remote": is_remote,
                "experienceLevel": "entry" if any(x in extensions_str for x in ["entry", "junior", "intern", "graduate"]) else "mid",
                "via": job.get("via", ""),
            }
            
            jobs.append(transformed_job)
        
        # Cache the results with next_page_token
        if use_cache and jobs:
            cache_key = get_cache_key(query, location, job_type, page_token)
            # Store tuple of (jobs, next_token) in cache
            set_cached_jobs(cache_key, (jobs, next_page_token), query, location, job_type)
        
        return jobs, next_page_token
        
    except requests.exceptions.RequestException as e:
        print(f"[JobBoard] SerpAPI request error: {e}")
        return [], None
    except Exception as e:
        print(f"[JobBoard] Error fetching jobs: {e}")
        return [], None


# =============================================================================
# ENHANCED RESUME DATA EXTRACTION & MAPPINGS (Parts 1-3)
# =============================================================================

def get_user_career_profile(uid: str) -> dict:
    """
    Extract comprehensive career profile from user's Firestore data.
    
    Returns:
        {
            "major": str,
            "minor": str | None,
            "skills": List[str],
            "extracurriculars": List[dict],  # {name, role, description, keywords}
            "experiences": List[dict],        # {title, company, keywords}
            "interests": List[str],
            "graduation_year": int | None,
            "gpa": float | None,
            "target_industries": List[str],
            "job_types": List[str]
        }
    """
    db = get_db()
    if not db:
        return {}
    
    try:
        user_ref = db.collection("users").document(uid)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return {}
        
        user_data = user_doc.to_dict()
        professional_info = user_data.get("professionalInfo", {})
        resume_parsed = user_data.get("resumeParsed", {})
        
        # Sanitize data to handle DocumentReferences
        if resume_parsed:
            resume_parsed = sanitize_firestore_data(resume_parsed, depth=0, max_depth=10)
        
        # Extract major (check multiple locations)
        major = (
            professional_info.get("fieldOfStudy") or
            professional_info.get("major") or
            resume_parsed.get("major", "") if resume_parsed else ""
        )
        
        # Extract minor
        minor = professional_info.get("minor") or None
        
        # Extract skills
        skills = []
        if resume_parsed and isinstance(resume_parsed.get("skills"), list):
            skills = [s for s in resume_parsed.get("skills", []) if isinstance(s, str)]
        
        # Extract extracurriculars (handle both array and dict formats)
        extracurriculars = []
        if resume_parsed:
            ec_data = resume_parsed.get("extracurriculars")
            if isinstance(ec_data, list):
                extracurriculars = [
                    ec if isinstance(ec, dict) else {"name": str(ec), "role": "", "description": ""}
                    for ec in ec_data
                ]
            elif isinstance(ec_data, dict):
                # Single extracurricular object
                extracurriculars = [ec_data]
        
        # Extract experiences (convert key_experiences to structured format)
        experiences = []
        if resume_parsed:
            key_experiences = resume_parsed.get("key_experiences", [])
            if isinstance(key_experiences, list):
                experiences = [
                    {
                        "title": exp if isinstance(exp, str) else exp.get("title", ""),
                        "company": "" if isinstance(exp, str) else exp.get("company", ""),
                        "keywords": [] if isinstance(exp, str) else exp.get("keywords", [])
                    }
                    for exp in key_experiences[:10]  # Limit to top 10
                ]
            
            # Also check for structured experience field
            experience_data = resume_parsed.get("experience")
            if isinstance(experience_data, list):
                for exp in experience_data:
                    if isinstance(exp, dict):
                        experiences.append({
                            "title": exp.get("title", ""),
                            "company": exp.get("company", ""),
                            "keywords": exp.get("keywords", [])
                        })
        
        # Extract interests
        interests = []
        if resume_parsed and isinstance(resume_parsed.get("interests"), list):
            interests = [i for i in resume_parsed.get("interests", []) if isinstance(i, str)]
        
        # Extract graduation year
        graduation_year = None
        year_str = (
            professional_info.get("graduationYear") or
            resume_parsed.get("year", "") if resume_parsed else ""
        )
        if year_str:
            try:
                graduation_year = int(str(year_str).strip()[:4])  # Take first 4 digits
            except (ValueError, TypeError):
                pass
        
        # Extract GPA
        gpa = professional_info.get("gpa")
        if gpa:
            try:
                gpa = float(gpa)
            except (ValueError, TypeError):
                gpa = None
        
        # Extract target industries
        target_industries = professional_info.get("targetIndustries", [])
        if not target_industries:
            target_industries = user_data.get("targetIndustries", [])
        if not isinstance(target_industries, list):
            target_industries = []
        
        # Extract job types
        job_types = user_data.get("jobTypes", [])
        if not isinstance(job_types, list):
            job_types = []
        
        return {
            "major": major or "",
            "minor": minor,
            "skills": skills[:20],  # Limit to top 20 skills
            "extracurriculars": extracurriculars[:15],  # Limit to top 15
            "experiences": experiences[:10],  # Limit to top 10
            "interests": interests[:10],  # Limit to top 10
            "graduation_year": graduation_year,
            "gpa": gpa,
            "target_industries": target_industries,
            "job_types": job_types
        }
        
    except Exception as e:
        print(f"[JobBoard] Error extracting user career profile: {e}")
        import traceback
        traceback.print_exc()
        return {}


# Extracurricular to career signal mapping
EC_CAREER_SIGNALS = {
    # Technical/Engineering
    "robotics": ["hardware engineer", "mechanical engineer", "automation", "embedded systems"],
    "coding club": ["software engineer", "developer", "programmer"],
    "hackathon": ["software engineer", "startup", "product", "innovation"],
    "data science": ["data analyst", "data scientist", "machine learning", "analytics"],
    "cybersecurity": ["security engineer", "security analyst", "InfoSec"],
    "ai club": ["machine learning engineer", "AI researcher", "data scientist"],
    "engineering": ["engineer", "technical", "R&D"],
    
    # Business/Finance
    "finance club": ["investment banking", "private equity", "financial analyst", "trader"],
    "consulting club": ["consultant", "strategy", "management consulting", "advisory"],
    "entrepreneurship": ["startup", "founder", "business development", "venture"],
    "investment club": ["asset management", "portfolio", "equity research"],
    "business": ["analyst", "operations", "strategy", "business development"],
    "economics": ["economist", "policy analyst", "research analyst"],
    
    # Leadership/Management
    "student government": ["operations", "program manager", "policy", "administration"],
    "president": ["leadership", "management", "executive"],
    "captain": ["team lead", "management", "leadership"],
    "founder": ["entrepreneur", "startup", "founder"],
    "board member": ["governance", "strategy", "leadership"],
    
    # Communications/Creative
    "debate": ["law", "consulting", "policy", "communications", "public affairs"],
    "journalism": ["content", "communications", "media", "editor", "writer"],
    "marketing club": ["marketing", "brand", "digital marketing", "social media"],
    "public speaking": ["communications", "sales", "client-facing"],
    "theater": ["communications", "creative", "public relations"],
    "film": ["video production", "content creator", "media"],
    
    # Research/Academic
    "research": ["research assistant", "R&D", "scientist", "lab", "academia"],
    "lab": ["research", "scientist", "lab technician", "R&D"],
    "honors society": ["research", "academic", "graduate school"],
    "teaching assistant": ["education", "training", "curriculum"],
    "tutoring": ["education", "teaching", "mentoring"],
    
    # Social Impact
    "volunteer": ["nonprofit", "social impact", "community", "NGO"],
    "community service": ["nonprofit", "community outreach", "social work"],
    "sustainability": ["environmental", "ESG", "green energy", "climate"],
    "social entrepreneurship": ["social impact", "nonprofit", "mission-driven"],
    
    # Healthcare/Science
    "pre-med": ["healthcare", "medical", "clinical", "hospital"],
    "biology club": ["biotech", "pharmaceutical", "life sciences", "research"],
    "chemistry": ["pharmaceutical", "chemical engineer", "lab", "R&D"],
    "health": ["healthcare", "wellness", "public health", "clinical"],
    
    # Sports/Athletics
    "athlete": ["teamwork", "discipline", "competitive", "performance"],
    "sports": ["athletics", "coaching", "sports management", "fitness"],
    "intramural": ["teamwork", "recreation", "wellness"],
    
    # Arts/Design
    "design": ["UI/UX", "graphic design", "product design", "creative"],
    "art": ["creative", "design", "visual", "artistic"],
    "music": ["creative", "entertainment", "production"],
    "photography": ["visual", "content", "creative", "media"],
}

LEADERSHIP_ROLES = [
    "president", "vice president", "vp", "captain", "lead", "leader",
    "founder", "co-founder", "director", "head", "chief", "chair",
    "chairman", "coordinator", "manager", "officer", "executive"
]


def extract_career_signals(extracurriculars: List[dict]) -> List[str]:
    """
    Extract career-relevant signals from extracurricular activities.
    
    Args:
        extracurriculars: List of {name, role, description} dicts
        
    Returns:
        List of career keywords/job titles that align with activities
    """
    signals = []
    has_leadership = False
    
    for ec in extracurriculars:
        ec_name = ec.get("name", "").lower()
        ec_role = ec.get("role", "").lower()
        ec_desc = ec.get("description", "").lower()
        combined_text = f"{ec_name} {ec_role} {ec_desc}"
        
        # Check for leadership roles
        if any(role in ec_role for role in LEADERSHIP_ROLES):
            has_leadership = True
            signals.extend(["leadership", "management"])
        
        # Match against EC career signals
        for keyword, careers in EC_CAREER_SIGNALS.items():
            if keyword in combined_text:
                signals.extend(careers[:3])  # Take top 3 career matches
    
    # Add general leadership signal if detected
    if has_leadership and "leadership" not in signals:
        signals.append("leadership roles")
    
    # Deduplicate and limit
    seen = set()
    unique_signals = []
    for s in signals:
        if s.lower() not in seen:
            seen.add(s.lower())
            unique_signals.append(s)
    
    return unique_signals[:10]  # Return top 10 signals


# Major to job title mapping
MAJOR_TO_JOBS = {
    # Computer Science & Engineering
    "computer science": ["software engineer", "developer", "SWE", "data scientist", "ML engineer", "backend engineer", "frontend engineer", "full stack developer"],
    "computer engineering": ["software engineer", "hardware engineer", "embedded systems", "firmware engineer", "systems engineer"],
    "software engineering": ["software engineer", "developer", "SWE", "DevOps", "platform engineer"],
    "data science": ["data scientist", "data analyst", "ML engineer", "analytics", "business intelligence"],
    "information technology": ["IT analyst", "systems administrator", "technical support", "network engineer"],
    "cybersecurity": ["security engineer", "security analyst", "penetration tester", "InfoSec"],
    "artificial intelligence": ["ML engineer", "AI researcher", "data scientist", "research scientist"],
    
    # Engineering
    "electrical engineering": ["electrical engineer", "hardware engineer", "embedded systems", "power systems"],
    "mechanical engineering": ["mechanical engineer", "design engineer", "manufacturing", "product engineer"],
    "civil engineering": ["civil engineer", "structural engineer", "construction", "infrastructure"],
    "chemical engineering": ["chemical engineer", "process engineer", "manufacturing", "R&D"],
    "biomedical engineering": ["biomedical engineer", "medical devices", "healthcare technology", "R&D"],
    "aerospace engineering": ["aerospace engineer", "systems engineer", "defense", "aviation"],
    "industrial engineering": ["industrial engineer", "operations", "supply chain", "process improvement"],
    "environmental engineering": ["environmental engineer", "sustainability", "ESG", "consulting"],
    
    # Business & Economics
    "business": ["analyst", "consultant", "operations", "business development", "strategy"],
    "business administration": ["business analyst", "operations", "management", "strategy", "consulting"],
    "finance": ["financial analyst", "investment banking", "private equity", "asset management", "trader"],
    "accounting": ["accountant", "auditor", "tax", "financial analyst", "controller"],
    "economics": ["economist", "analyst", "policy", "research", "consulting"],
    "marketing": ["marketing", "brand manager", "digital marketing", "product marketing", "growth"],
    "management": ["management", "operations", "strategy", "consulting", "program manager"],
    "entrepreneurship": ["startup", "founder", "business development", "venture capital"],
    "supply chain": ["supply chain", "logistics", "operations", "procurement"],
    "real estate": ["real estate analyst", "property management", "development", "investments"],
    
    # Sciences
    "biology": ["research", "biotech", "pharmaceutical", "lab", "life sciences"],
    "chemistry": ["chemist", "pharmaceutical", "R&D", "lab", "materials science"],
    "physics": ["physicist", "research", "data scientist", "quantitative", "engineering"],
    "mathematics": ["quantitative analyst", "data scientist", "actuary", "research", "analyst"],
    "statistics": ["statistician", "data analyst", "data scientist", "quantitative", "research"],
    "neuroscience": ["research", "neuroscience", "healthcare", "pharmaceutical", "biotech"],
    "environmental science": ["environmental", "sustainability", "conservation", "research", "ESG"],
    
    # Healthcare
    "nursing": ["nurse", "healthcare", "clinical", "patient care", "medical"],
    "public health": ["public health", "healthcare", "epidemiology", "policy", "research"],
    "pre-med": ["healthcare", "clinical", "research", "medical", "hospital"],
    "health administration": ["healthcare administration", "hospital management", "health policy"],
    "pharmacy": ["pharmacist", "pharmaceutical", "clinical", "research"],
    
    # Social Sciences
    "psychology": ["research", "HR", "UX research", "counseling", "behavioral"],
    "sociology": ["research", "policy", "social work", "community", "nonprofit"],
    "political science": ["policy", "government", "law", "political", "public affairs"],
    "international relations": ["international", "policy", "diplomacy", "NGO", "global"],
    "communications": ["communications", "PR", "marketing", "media", "content"],
    "journalism": ["journalist", "editor", "content", "media", "writer"],
    "public relations": ["PR", "communications", "media relations", "corporate communications"],
    
    # Arts & Humanities
    "english": ["writer", "editor", "content", "communications", "publishing"],
    "history": ["research", "education", "policy", "museum", "archives"],
    "philosophy": ["law", "consulting", "ethics", "policy", "research"],
    "art": ["designer", "creative", "art director", "visual", "UX"],
    "graphic design": ["graphic designer", "UI designer", "creative", "visual design", "brand"],
    "film": ["video production", "film", "media", "content", "entertainment"],
    "music": ["music", "entertainment", "production", "creative", "education"],
    
    # Other
    "education": ["teacher", "education", "curriculum", "training", "instructional design"],
    "law": ["legal", "paralegal", "compliance", "policy", "law clerk"],
    "architecture": ["architect", "design", "urban planning", "construction"],
    "urban planning": ["urban planner", "city planning", "policy", "development"],
}


def get_job_keywords_for_major(major: str) -> List[str]:
    """
    Get relevant job title keywords for a given major.
    
    Args:
        major: User's academic major
        
    Returns:
        List of relevant job title keywords
    """
    if not major:
        return ["entry level", "associate", "analyst"]
    
    major_lower = major.lower().strip()
    
    # Direct match
    if major_lower in MAJOR_TO_JOBS:
        return MAJOR_TO_JOBS[major_lower]
    
    # Partial match
    for key, jobs in MAJOR_TO_JOBS.items():
        if key in major_lower or major_lower in key:
            return jobs
    
    # Keyword matching
    for key, jobs in MAJOR_TO_JOBS.items():
        key_words = key.split()
        if any(word in major_lower for word in key_words):
            return jobs
    
    # Default fallback
    return ["entry level", "associate", "analyst", "coordinator"]


def build_search_query(
    job_types: List[str],
    industries: List[str],
    user_major: Optional[str] = None,
    user_skills: Optional[List[str]] = None,
    user_key_experiences: Optional[List[str]] = None,
) -> str:
    """
    Build an optimized search query based on user preferences and resume data.
    """
    query_parts = []
    
    # Add job type
    if "Internship" in job_types:
        query_parts.append("internship")
    elif "Full-Time" in job_types:
        query_parts.append("entry level")
    
    # Add resume-based skills (top 2-3 most relevant)
    if user_skills and len(user_skills) > 0:
        # Take top skills and add them to query
        top_skills = user_skills[:3]
        skills_query = " OR ".join(top_skills)
        query_parts.append(f"({skills_query})")
    
    # Add industries/interests
    if industries:
        top_industries = industries[:2]  # Focus on top 2
        
        industry_mapping = {
            "Technology": "software engineer OR product manager",
            "Finance": "financial analyst OR investment banking",
            "Consulting": "consultant OR strategy",
            "Healthcare": "healthcare OR medical",
            "Marketing": "marketing OR brand manager",
            "Engineering": "engineer",
            "Data Science": "data scientist OR machine learning",
            "Design": "UX designer OR product designer",
            "Sales": "sales OR business development",
            "Operations": "operations OR supply chain",
            "Accounting": "accountant OR audit",
            "Legal": "legal OR paralegal",
            "Human Resources": "HR OR recruiting",
            "Real Estate": "real estate OR property",
        }
        
        for industry in top_industries:
            if industry in industry_mapping:
                query_parts.append(industry_mapping[industry])
            else:
                query_parts.append(industry.lower())
    
    # Add major if no industries
    if not industries and user_major:
        query_parts.append(user_major.lower())
    
    # Default fallback
    if not query_parts:
        query_parts.append("entry level jobs")
    
    return " ".join(query_parts)


def build_location_query(locations: List[str]) -> str:
    """
    Build location string for SerpAPI.
    """
    if not locations:
        return "United States"
    
    primary_location = locations[0]
    
    if "remote" in primary_location.lower():
        return "United States"
    
    return primary_location


def score_jobs_by_resume_match(
    jobs: List[Dict[str, Any]],
    user_skills: Optional[List[str]] = None,
    user_key_experiences: Optional[List[str]] = None,
    user_major: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Score and rank jobs based on how well they match the user's resume.
    Adds a 'matchScore' field to each job (0-100).
    """
    if not jobs:
        return jobs
    
    user_skills_lower = [s.lower() for s in (user_skills or [])]
    user_experiences_lower = [e.lower() for e in (user_key_experiences or [])]
    user_major_lower = (user_major or "").lower()
    
    scored_jobs = []
    for job in jobs:
        score = 50  # Base score
        
        # Combine job text for matching
        job_text = " ".join([
            job.get("title", ""),
            job.get("description", ""),
            job.get("company", ""),
        ]).lower()
        
        # Score based on skills match
        if user_skills_lower:
            skills_found = sum(1 for skill in user_skills_lower if skill in job_text)
            if skills_found > 0:
                score += min(30, skills_found * 10)  # Up to 30 points for skills
        
        # Score based on experience match
        if user_experiences_lower:
            exp_matches = sum(1 for exp in user_experiences_lower if any(word in job_text for word in exp.split()[:3]))
            if exp_matches > 0:
                score += min(20, exp_matches * 7)  # Up to 20 points for experience
        
        # Score based on major match
        if user_major_lower and user_major_lower in job_text:
            score += 10  # 10 points for major match
        
        # Normalize score to 0-100
        score = min(100, max(0, score))
        
        # Add match score to job
        job_with_score = job.copy()
        job_with_score["matchScore"] = score
        scored_jobs.append(job_with_score)
    
    # Sort by match score (highest first)
    scored_jobs.sort(key=lambda x: x.get("matchScore", 0), reverse=True)
    
    return scored_jobs


# =============================================================================
# DATA SANITIZATION HELPERS
# =============================================================================

def is_document_reference(obj):
    """Check if an object is a Firestore DocumentReference."""
    if obj is None:
        return False
    # Check by type name
    obj_type = str(type(obj))
    if 'DocumentReference' in obj_type or 'Reference' in obj_type:
        return True
    # Check by attributes
    if hasattr(obj, 'path') and hasattr(obj, 'id'):
        # DocumentReference has both path and id
        return True
    # Check by module
    if hasattr(obj, '__class__') and hasattr(obj.__class__, '__module__'):
        module = obj.__class__.__module__
        if module and 'firestore' in module.lower() and 'reference' in obj_type.lower():
            return True
    return False

def sanitize_firestore_data(obj, depth=0, max_depth=10):
    """
    Recursively convert Firestore-specific types to JSON-serializable types.
    """
    # Prevent infinite recursion
    if depth > max_depth:
        return str(obj) if obj is not None else None
    
    if obj is None:
        return None
    elif isinstance(obj, str):
        return obj
    elif isinstance(obj, (int, float, bool)):
        return obj
    
    # Check for DocumentReference FIRST - before other checks
    # This is critical because DocumentReference can appear anywhere
    if is_document_reference(obj):
        try:
            if hasattr(obj, 'path'):
                path_str = str(obj.path)
                print(f"[JobBoard] Found DocumentReference, converting to: {path_str}")
                return path_str
            elif hasattr(obj, 'id'):
                id_str = str(obj.id)
                print(f"[JobBoard] Found DocumentReference (by id), converting to: {id_str}")
                return id_str
            else:
                obj_str = str(obj)
                print(f"[JobBoard] Found DocumentReference (fallback), converting to: {obj_str}")
                return obj_str
        except Exception as e:
            print(f"[JobBoard] Error converting DocumentReference: {e}")
            return None
    
    elif isinstance(obj, dict):
        return {str(k): sanitize_firestore_data(v, depth+1, max_depth) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_firestore_data(item, depth+1, max_depth) for item in obj]
    elif hasattr(obj, 'isoformat'):  # datetime
        try:
            return obj.isoformat()
        except:
            return str(obj)
    elif hasattr(obj, 'latitude'):  # GeoPoint
        try:
            return {"lat": obj.latitude, "lng": obj.longitude}
        except:
            return str(obj)
    elif hasattr(obj, '_pb'):  # Firestore protobuf types
        return str(obj)
    elif hasattr(obj, '__class__'):
        class_name = str(type(obj))
        if 'firestore' in class_name.lower() or 'DocumentReference' in class_name:
            # Catch any Firestore types
            try:
                if hasattr(obj, 'path'):
                    return str(obj.path)
                return str(obj)
            except:
                return None
    # Last resort: try to convert to string
    try:
        return str(obj)
    except:
        return None

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def parse_job_url(url: str) -> Optional[Dict[str, Any]]:
    """
    Scrape job details from a URL.
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "html.parser")
        
        job_data = {
            "title": None,
            "company": None,
            "location": None,
            "description": None,
            "requirements": [],
        }
        
        # LinkedIn parsing
        if "linkedin.com" in url:
            title_elem = soup.find("h1", class_="top-card-layout__title")
            company_elem = soup.find("a", class_="topcard__org-name-link")
            location_elem = soup.find("span", class_="topcard__flavor--bullet")
            description_elem = soup.find("div", class_="description__text")
            
            job_data["title"] = title_elem.get_text(strip=True) if title_elem else None
            job_data["company"] = company_elem.get_text(strip=True) if company_elem else None
            job_data["location"] = location_elem.get_text(strip=True) if location_elem else None
            job_data["description"] = description_elem.get_text(strip=True) if description_elem else None
            
        # Indeed parsing
        elif "indeed.com" in url:
            title_elem = soup.find("h1", class_="jobsearch-JobInfoHeader-title")
            company_elem = soup.find("div", {"data-company-name": True})
            description_elem = soup.find("div", id="jobDescriptionText")
            
            job_data["title"] = title_elem.get_text(strip=True) if title_elem else None
            job_data["company"] = company_elem.get_text(strip=True) if company_elem else None
            job_data["description"] = description_elem.get_text(strip=True) if description_elem else None
        
        # beBee parsing
        elif "bebee.com" in url:
            print(f"[JobBoard] Parsing beBee URL: {url}")
            # beBee typically has the title in h1
            title_elem = soup.find("h1")
            if title_elem:
                title_text = title_elem.get_text(strip=True)
                # Remove location from title if present (format: "Title - Location")
                if " - " in title_text:
                    title_text = title_text.split(" - ")[0]
                job_data["title"] = title_text
                print(f"[JobBoard] Found beBee title: {job_data['title']}")
            
            # Try to find company - might be in various places
            company_selectors = [
                "span[class*='company']",
                "div[class*='company']",
                "a[class*='company']",
                "[class*='employer']",
                "[class*='organization']"
            ]
            for selector in company_selectors:
                elem = soup.select_one(selector)
                if elem:
                    company_text = elem.get_text(strip=True)
                    if company_text and len(company_text) > 2:
                        job_data["company"] = company_text[:100]
                        print(f"[JobBoard] Found beBee company: {job_data['company']}")
                        break
            
            # Try to find job description
            desc_selectors = [
                "div[class*='description']",
                "div[class*='job-description']",
                "div[class*='content']",
                "article",
                "div[id*='description']",
                "section[class*='description']"
            ]
            for selector in desc_selectors:
                elem = soup.select_one(selector)
                if elem:
                    desc_text = elem.get_text(strip=True)
                    # Skip if it's just Lorem ipsum placeholder text
                    if desc_text and "lorem ipsum" not in desc_text.lower()[:100]:
                        job_data["description"] = desc_text[:5000]
                        print(f"[JobBoard] Found beBee description: {len(job_data['description'])} chars")
                        break
            
            # If no description found, try to get summary
            if not job_data["description"]:
                summary_elem = soup.find("div", class_=lambda x: x and "summary" in x.lower())
                if summary_elem:
                    job_data["description"] = summary_elem.get_text(strip=True)[:5000]
                    print(f"[JobBoard] Found beBee summary: {len(job_data['description'])} chars")
            
            # Extract location from title if present
            if title_elem:
                title_full = title_elem.get_text(strip=True)
                if " - " in title_full:
                    location_part = title_full.split(" - ")[-1]
                    if "," in location_part or any(word in location_part.lower() for word in ["ca", "ny", "tx", "fl", "il"]):
                        job_data["location"] = location_part
                        print(f"[JobBoard] Found beBee location: {job_data['location']}")
            
        # Generic fallback
        else:
            print(f"[JobBoard] Using generic fallback parsing for URL: {url}")
            # Try multiple title selectors
            title_selectors = [
                "h1",
                "h2[class*='title']",
                "[class*='job-title']",
                "[class*='position-title']",
                "title"  # HTML title tag as last resort
            ]
            for selector in title_selectors:
                elem = soup.select_one(selector)
                if elem:
                    title_text = elem.get_text(strip=True)
                    # Remove location from title if present (format: "Title - Location")
                    if " - " in title_text and len(title_text.split(" - ")) == 2:
                        title_text = title_text.split(" - ")[0]
                    if title_text and len(title_text) > 3:
                        job_data["title"] = title_text[:200]
                        print(f"[JobBoard] Found title: {job_data['title']}")
                        break
                    
            # Try multiple company selectors
            company_selectors = [
                "[class*='company']",
                "[class*='employer']",
                "[class*='organization']",
                "[class*='recruiter']",
                "a[href*='company']"
            ]
            for selector in company_selectors:
                elem = soup.select_one(selector)
                if elem:
                    company_text = elem.get_text(strip=True)
                    if company_text and len(company_text) > 2 and len(company_text) < 100:
                        job_data["company"] = company_text[:100]
                        print(f"[JobBoard] Found company: {job_data['company']}")
                        break
                    
            # Try multiple description selectors
            desc_selectors = [
                "[class*='description']",
                "[class*='job-description']",
                "[class*='content']",
                "article",
                "[id*='description']",
                "section[class*='description']",
                "div[class*='details']"
            ]
            for selector in desc_selectors:
                elem = soup.select_one(selector)
                if elem:
                    desc_text = elem.get_text(strip=True)
                    # Skip if it's just placeholder text
                    if desc_text and len(desc_text) > 50:
                        # Check for Lorem ipsum
                        if "lorem ipsum" not in desc_text.lower()[:200]:
                            job_data["description"] = desc_text[:5000]
                            print(f"[JobBoard] Found description: {len(job_data['description'])} chars")
                            break
        
        return job_data if any(job_data.values()) else None
        
    except Exception as e:
        print(f"[JobBoard] Error parsing URL {url}: {e}")
        return None


def extract_keywords_from_job(description: str) -> List[str]:
    """
    Extract important keywords from a job description for ATS optimization.
    """
    skill_patterns = [
        r'\b(Python|Java|JavaScript|TypeScript|C\+\+|Go|Rust|Ruby|PHP|Swift|Kotlin|Scala)\b',
        r'\b(React|Angular|Vue|Node\.js|Django|Flask|Spring|Rails|Next\.js|Express)\b',
        r'\b(AWS|Azure|GCP|Docker|Kubernetes|CI/CD|DevOps|Terraform|Jenkins)\b',
        r'\b(SQL|PostgreSQL|MySQL|MongoDB|Redis|GraphQL|NoSQL|Elasticsearch)\b',
        r'\b(Machine Learning|AI|Deep Learning|NLP|Computer Vision|LLM|PyTorch|TensorFlow)\b',
        r'\b(Agile|Scrum|JIRA|Git|GitHub|GitLab|Confluence|Asana)\b',
        r'\b(Excel|PowerPoint|Tableau|Power BI|Salesforce|SAP|Oracle)\b',
        r'\b(Leadership|Communication|Problem.solving|Analytical|Teamwork|Collaboration)\b',
        r'\b(Financial Modeling|Valuation|DCF|LBO|M&A|Due Diligence|Bloomberg)\b',
        r'\b(Product Management|Roadmap|Stakeholder|Cross-functional|PRD|OKR)\b',
        r'\b(Figma|Sketch|Adobe|InDesign|Photoshop|Illustrator|UI|UX)\b',
    ]
    
    keywords = set()
    for pattern in skill_patterns:
        matches = re.findall(pattern, description, re.IGNORECASE)
        keywords.update([m.strip() for m in matches])
    
    return list(keywords)[:20]


async def optimize_resume_with_ai(
    user_resume: Dict[str, Any],
    job_description: str,
    job_title: str = "",
    company: str = "",
) -> Dict[str, Any]:
    """
    Use AI to optimize a resume for a specific job posting.
    """
    print(f"[JobBoard optimize_resume_with_ai] Starting. Resume type: {type(user_resume)}")
    # Sanitize user_resume one more time to be absolutely sure
    user_resume = sanitize_firestore_data(user_resume, depth=0, max_depth=20)
    
    # Aggressive cleanup: recursively remove any DocumentReferences
    def deep_clean_refs(obj, path="root"):
        """Recursively remove all DocumentReferences."""
        if is_document_reference(obj):
            print(f"[JobBoard] deep_clean_refs: Removing DocumentReference at {path}")
            return None
        elif isinstance(obj, dict):
            cleaned = {}
            for k, v in obj.items():
                if not is_document_reference(v):
                    cleaned[k] = deep_clean_refs(v, f"{path}.{k}")
            return cleaned
        elif isinstance(obj, list):
            cleaned = []
            for i, item in enumerate(obj):
                if not is_document_reference(item):
                    cleaned_item = deep_clean_refs(item, f"{path}[{i}]")
                    if cleaned_item is not None:
                        cleaned.append(cleaned_item)
            return cleaned
        return obj
    
    print(f"[JobBoard optimize_resume_with_ai] Running deep_clean_refs...")
    user_resume = deep_clean_refs(user_resume)
    print(f"[JobBoard optimize_resume_with_ai] Deep clean complete")
    
    keywords = extract_keywords_from_job(job_description)
    # Ensure all keywords are strings and filter out any None/empty values
    keywords = [str(k) for k in keywords if k and k is not None]
    
    # Custom JSON encoder that aggressively handles DocumentReferences
    def json_default(obj):
        """Custom default handler for json.dumps that catches DocumentReferences."""
        if is_document_reference(obj):
            try:
                if hasattr(obj, 'path'):
                    return str(obj.path)
                elif hasattr(obj, 'id'):
                    return str(obj.id)
                return str(obj)
            except:
                return None
        # Fallback to string conversion
        try:
            return str(obj)
        except:
            return None
    
    # Safely serialize resume for prompt - with multiple passes to catch all DocumentReferences
    print(f"[JobBoard] Starting JSON serialization. Resume keys: {list(user_resume.keys()) if isinstance(user_resume, dict) else 'N/A'}")
    resume_json = None
    for attempt in range(5):  # Try up to 5 times with increasingly aggressive sanitization
        try:
            # Deep sanitize before each attempt
            print(f"[JobBoard] Serialization attempt {attempt + 1}: sanitizing...")
            user_resume = sanitize_firestore_data(user_resume, depth=0, max_depth=20)
            
            # Final check for any remaining DocumentReferences before serialization
            def check_and_remove_refs(obj, path=""):
                """Recursively check and remove DocumentReferences."""
                if is_document_reference(obj):
                    print(f"[JobBoard] Found DocumentReference at {path}, removing...")
                    return None
                elif isinstance(obj, dict):
                    cleaned = {}
                    for k, v in obj.items():
                        if not is_document_reference(v):
                            cleaned_v = check_and_remove_refs(v, f"{path}.{k}")
                            if cleaned_v is not None:
                                cleaned[k] = cleaned_v
                    return cleaned
                elif isinstance(obj, list):
                    cleaned = []
                    for i, item in enumerate(obj):
                        if not is_document_reference(item):
                            cleaned_item = check_and_remove_refs(item, f"{path}[{i}]")
                            if cleaned_item is not None:
                                cleaned.append(cleaned_item)
                    return cleaned
                return obj
            
            user_resume = check_and_remove_refs(user_resume, "root")
            
            # Convert all remaining non-serializable objects to strings
            def force_stringify(obj):
                """Force convert any remaining problematic objects to strings."""
                if is_document_reference(obj):
                    return str(obj.path) if hasattr(obj, 'path') else str(obj)
                elif isinstance(obj, dict):
                    return {k: force_stringify(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [force_stringify(item) for item in obj]
                elif not isinstance(obj, (str, int, float, bool, type(None))):
                    # Convert any other non-basic types to string
                    try:
                        return str(obj)
                    except:
                        return None
                return obj
            
            user_resume = force_stringify(user_resume)
            
            # Try to serialize with custom default handler
            print(f"[JobBoard] Attempting json.dumps...")
            resume_json = json.dumps(user_resume, indent=2, default=json_default, ensure_ascii=False)
            
            # Verify the JSON doesn't contain any problematic objects by parsing it back
            print(f"[JobBoard] Verifying JSON by parsing back...")
            test_parse = json.loads(resume_json)
            print(f"[JobBoard] ✅ JSON serialization successful!")
            break  # Success
        except (TypeError, ValueError) as e:
            print(f"[JobBoard] Serialization attempt {attempt + 1} failed: {e}")
            import traceback
            traceback.print_exc()
            if attempt == 4:  # Last attempt
                # Final fallback: convert everything to basic types, remove any remaining problematic fields
                print(f"[JobBoard] Final fallback: aggressive cleanup...")
                user_resume = sanitize_firestore_data(user_resume, depth=0, max_depth=20)
                # Remove any fields that might still have issues
                if isinstance(user_resume, dict):
                    user_resume = {k: v for k, v in user_resume.items() if not is_document_reference(v)}
                resume_json = json.dumps(user_resume, indent=2, default=json_default, ensure_ascii=False)
    
    # Ensure keywords are all strings - double check for any DocumentReferences
    print(f"[JobBoard] Processing keywords. Count: {len(keywords)}")
    safe_keywords = []
    for idx, kw in enumerate(keywords):
        if is_document_reference(kw):
            print(f"[JobBoard] WARNING: DocumentReference found in keywords[{idx}], skipping...")
            continue
        safe_keywords.append(str(kw))
    keywords_str = ', '.join(safe_keywords) if safe_keywords else 'None specified'
    print(f"[JobBoard] Keywords string created. Length: {len(keywords_str)}")
    
    # Ensure all string values are safe
    job_title_safe = str(job_title or 'Not specified')
    company_safe = str(company or 'Not specified')
    job_desc_safe = str(job_description[:3000])
    
    # Ensure resume_json is actually a string and doesn't contain any issues
    if not isinstance(resume_json, str):
        print(f"[JobBoard] ERROR: resume_json is not a string! Type: {type(resume_json)}")
        raise ValueError(f"resume_json must be a string, got {type(resume_json)}")
    
    print(f"[JobBoard] Building prompt. resume_json length: {len(resume_json)}")
    
    # Verify resume_json is actually a string and doesn't contain DocumentReferences
    if not isinstance(resume_json, str):
        raise ValueError("resume_json is not a string")
    
    # Test that we can safely use it in the prompt
    try:
        # Try to parse it back to ensure it's valid JSON
        json.loads(resume_json)
        print(f"[JobBoard] ✅ JSON validation passed")
    except json.JSONDecodeError as e:
        print(f"[JobBoard] Invalid JSON in resume_json: {e}")
        raise
    
    # Build prompt with try-catch to see exactly where it fails
    try:
        prompt = f"""TASK:
Optimize the resume below to better match the job description while maintaining full authenticity.

JOB DETAILS:
- Title: {job_title_safe}
- Company: {company_safe}
- Description: {job_desc_safe}

KEYWORDS TO CONSIDER (use only when relevant):
{keywords_str}

CURRENT RESUME:
{resume_json}

INSTRUCTIONS:
1. Rewrite experience bullets to better align with job requirements
2. Use keywords ONLY where they naturally fit existing experience
3. Highlight transferable skills where direct experience is missing
4. Improve action verbs and quantifiable impact (without inventing metrics)
5. Ensure clean ATS-readable formatting (no tables, clear sections)
6. Do NOT fabricate roles, employers, certifications, or responsibilities

ATS SCORE DEFINITIONS:
- keywords: Coverage and relevance of job-specific keywords
- formatting: ATS readability and structure
- relevance: Alignment of experience to role responsibilities
- overall: Weighted judgment of the above (not a simple average)

SCORING RULES:
- Scores must range from 0–100
- Scores should reflect real gaps; values below 60 are acceptable
- Do not default to high scores

OUTPUT JSON FORMAT:
{{
  "optimized_content": "Full optimized resume text with clear sections (Summary, Experience, Education, Skills)",
  "ats_score": {{
    "overall": "<0-100>",
    "keywords": "<0-100>",
    "formatting": "<0-100>",
    "relevance": "<0-100>"
  }},
  "keywords_added": ["keyword1", "keyword2"],
  "important_keywords_missing": ["keywordA", "keywordB"],
  "sections_optimized": [
    {{
      "section": "Experience",
      "changes_made": "Description of how this section was improved"
    }}
  ],
  "suggestions": ["Concrete next-step improvement suggestions"],
  "confidence_level": "high | medium | low"
}}"""
    except Exception as prompt_error:
        print(f"[JobBoard] ERROR building prompt f-string: {prompt_error}")
        import traceback
        traceback.print_exc()
        raise

    try:
        print("[JobBoard] Getting OpenAI client...")
        openai_client = get_async_openai_client()
        print(f"[JobBoard] Got OpenAI client: {openai_client}")
        if not openai_client:
            raise Exception("OpenAI client not available")
        
        print("[JobBoard] About to call OpenAI API...")
        print(f"[JobBoard] Prompt length: {len(prompt)}")
        print(f"[JobBoard] Prompt type: {type(prompt)}")
        print(f"[JobBoard] Prompt preview: {prompt[:200]}...")
        
        # Ensure prompt is a plain string (not containing any DocumentReferences)
        if not isinstance(prompt, str):
            print(f"[JobBoard] ERROR: Prompt is not a string! Type: {type(prompt)}")
            prompt = str(prompt)
        
        # Ensure all message content is strings
        system_content = "You are an expert resume optimizer and ATS specialist.\nReturn ONLY valid JSON. Do not include explanations or markdown."
        user_content = str(prompt)  # Force to string
        
        print(f"[JobBoard] System content type: {type(system_content)}")
        print(f"[JobBoard] User content type: {type(user_content)}")
        
        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content}
        ]
        
        print(f"[JobBoard] Messages list created. About to call API...")
        print(f"[JobBoard] Setting timeout to 120 seconds (2 minutes)...")
        print(f"[JobBoard] Model: gpt-4-turbo-preview, Max tokens: 3500")
        
        try:
            # Use asyncio.wait_for for explicit timeout handling
            response = await asyncio.wait_for(
                openai_client.chat.completions.create(
                    model="gpt-4-turbo-preview",
                    messages=messages,
                    temperature=0.7,
                    max_tokens=3500,  # Reduced from 4000 to speed up generation
                    timeout=120.0,  # Client-level timeout as backup
                ),
                timeout=120.0  # Explicit asyncio timeout (2 minutes)
            )
            print("[JobBoard] ✅ OpenAI API call completed successfully")
        except asyncio.TimeoutError:
            print("[JobBoard] ❌ API call timed out after 120 seconds")
            import traceback
            traceback.print_exc()
            raise Exception("Resume optimization timed out after 2 minutes. Please try again with a shorter job description or contact support.")
        except Exception as api_error:
            print(f"[JobBoard] ❌ API call failed: {api_error}")
            print(f"[JobBoard] Error type: {type(api_error)}")
            import traceback
            traceback.print_exc()
            raise
        print(f"[JobBoard] Response type: {type(response)}")
        print(f"[JobBoard] Number of choices: {len(response.choices) if hasattr(response, 'choices') else 'N/A'}")
        
        content = response.choices[0].message.content.strip()
        print(f"[JobBoard] Content length: {len(content)}")
        print(f"[JobBoard] Content preview: {content[:200]}...")
        
        if content.startswith("```"):
            content = re.sub(r"```json?\n?", "", content)
            content = re.sub(r"\n?```", "", content)
        
        print("[JobBoard] About to parse JSON from content...")
        result = json.loads(content)
        print("[JobBoard] JSON parsed successfully")
        
        print("[JobBoard] Building return dictionary...")
        ats_score = result.get("ats_score", {})
        print(f"[JobBoard] ATS score type: {type(ats_score)}")
        
        # Safely convert all list items to strings, filtering out any DocumentReferences
        def safe_string_list(items):
            """Convert list items to strings, filtering out DocumentReferences."""
            safe_items = []
            for item in items:
                if is_document_reference(item):
                    print(f"[JobBoard] WARNING: Found DocumentReference in list, skipping...")
                    continue
                try:
                    safe_items.append(str(item))
                except Exception as e:
                    print(f"[JobBoard] WARNING: Could not convert item to string: {e}")
                    continue
            return safe_items
        
        suggestions = safe_string_list(result.get("suggestions", []))
        keywords_added = safe_string_list(result.get("keywords_added", []))
        important_keywords_missing = safe_string_list(result.get("important_keywords_missing", []))
        
        # Handle sections_optimized - can be array of strings or array of objects
        sections_optimized_raw = result.get("sections_optimized", [])
        sections_optimized = []
        for item in sections_optimized_raw:
            if is_document_reference(item):
                print(f"[JobBoard] WARNING: Found DocumentReference in sections_optimized, skipping...")
                continue
            if isinstance(item, dict):
                # New format: extract section name from object
                section_name = item.get("section", "")
                if section_name:
                    sections_optimized.append(str(section_name))
            else:
                # Old format: already a string
                try:
                    sections_optimized.append(str(item))
                except Exception as e:
                    print(f"[JobBoard] WARNING: Could not convert section to string: {e}")
                    continue
        
        confidence_level = result.get("confidence_level", "medium")
        if confidence_level not in ["high", "medium", "low"]:
            confidence_level = "medium"
        
        print(f"[JobBoard] Suggestions count: {len(suggestions)}")
        print(f"[JobBoard] Keywords added count: {len(keywords_added)}")
        print(f"[JobBoard] Important keywords missing count: {len(important_keywords_missing)}")
        print(f"[JobBoard] Sections optimized count: {len(sections_optimized)}")
        print(f"[JobBoard] Confidence level: {confidence_level}")
        
        return_dict = {
            "content": str(result.get("optimized_content", "")),
            "atsScore": {
                "overall": int(ats_score.get("overall", 75)) if ats_score else 75,
                "keywords": int(ats_score.get("keywords", 70)) if ats_score else 70,
                "formatting": int(ats_score.get("formatting", 85)) if ats_score else 85,
                "relevance": int(ats_score.get("relevance", 75)) if ats_score else 75,
                "suggestions": suggestions,
            },
            "keywordsAdded": keywords_added,
            "importantKeywordsMissing": important_keywords_missing,
            "sectionsOptimized": sections_optimized,
            "confidenceLevel": confidence_level,
        }
        
        # Final check - ensure return_dict is JSON serializable
        print("[JobBoard] Verifying return dictionary is JSON serializable...")
        try:
            test_json = json.dumps(return_dict, default=str)
            print("[JobBoard] ✅ Return dictionary is JSON serializable")
        except Exception as json_error:
            print(f"[JobBoard] ERROR: Return dictionary is not JSON serializable: {json_error}")
            import traceback
            traceback.print_exc()
            raise
        
        print("[JobBoard] Return dictionary built successfully")
        return return_dict
        
    except Exception as e:
        print(f"[JobBoard] AI optimization error: {e}")
        print(f"[JobBoard] Error type: {type(e)}")
        print(f"[JobBoard] Error args: {e.args}")
        import traceback
        print("[JobBoard] Full traceback:")
        traceback.print_exc()
        raise


async def generate_cover_letter_with_ai(
    user_resume: Dict[str, Any],
    job_description: str,
    job_title: str = "",
    company: str = "",
) -> Dict[str, Any]:
    """
    Generate a personalized cover letter using AI.
    """
    # Sanitize user_resume one more time to be absolutely sure
    user_resume = sanitize_firestore_data(user_resume, depth=0, max_depth=20)
    
    # Extract name for closing signature
    user_name = str(user_resume.get("name", "") or "")
    
    # Custom JSON encoder that handles DocumentReferences and other non-serializable objects
    def json_default(obj):
        """Custom default handler for json.dumps that catches DocumentReferences."""
        if is_document_reference(obj):
            try:
                if hasattr(obj, 'path'):
                    return str(obj.path)
                elif hasattr(obj, 'id'):
                    return str(obj.id)
                return str(obj)
            except:
                return None
        try:
            return str(obj)
        except:
            return None
    
    # Safely serialize the entire resume as JSON for comprehensive context
    # This gives the AI full access to all resume information, not just limited fields
    print(f"[JobBoard] Serializing full resume for cover letter generation...")
    print(f"[JobBoard] Resume keys: {list(user_resume.keys()) if isinstance(user_resume, dict) else 'N/A'}")
    resume_json = None
    for attempt in range(3):
        try:
            user_resume = sanitize_firestore_data(user_resume, depth=0, max_depth=20)
            resume_json = json.dumps(user_resume, indent=2, default=json_default, ensure_ascii=False)
            # Verify it's valid JSON
            json.loads(resume_json)
            print(f"[JobBoard] ✅ Resume serialized successfully (length: {len(resume_json)} chars)")
            break
        except Exception as e:
            print(f"[JobBoard] Error serializing resume (attempt {attempt + 1}): {e}")
            if attempt == 2:
                raise
    
    if not resume_json:
        raise ValueError("Failed to serialize resume data")
    
    prompt = f"""You are an expert cover letter writer who creates compelling, personalized cover letters.

TASK: Write a professional cover letter for this job application.

APPLICANT'S FULL RESUME:
{resume_json}

JOB DETAILS:
- Title: {job_title or 'Not specified'}
- Company: {company or 'Not specified'}
- Description: {job_description[:3000]}

COVER LETTER REQUIREMENTS:
1. Professional but personable tone - suitable for a college student/new grad
2. 3-4 paragraphs max (keep it concise)
3. Reference specific experiences, achievements, and skills from the resume that match job requirements
4. Highlight 2-3 concrete accomplishments or projects from the resume that demonstrate relevant capabilities
5. Show genuine interest in the company/role with specific reasons
6. Strong opening hook and confident closing with call-to-action
7. Don't be generic - use actual details from the resume to show why you're a strong fit

OUTPUT FORMAT (JSON):
{{
    "content": "Dear Hiring Manager,\\n\\n[Paragraph 1: Hook + why this role]\\n\\n[Paragraph 2: Relevant experience/achievements]\\n\\n[Paragraph 3: Why this company + enthusiasm]\\n\\n[Closing: Call to action]\\n\\nSincerely,\\n{user_name}",
    "highlights": ["Achievement 1 emphasized", "Skill 2 highlighted", "Experience 3 connected"],
    "tone": "Professional and enthusiastic"
}}

Return ONLY valid JSON."""

    try:
        openai_client = get_async_openai_client()
        if not openai_client:
            raise Exception("OpenAI client not available")
            
        print(f"[JobBoard] Calling OpenAI API for cover letter generation...")
        print(f"[JobBoard] Prompt length: {len(prompt)} chars, max_tokens: 2000")
        try:
            # Double-wrap with asyncio.wait_for for extra safety (OpenAI client timeout can be unreliable)
            api_call = openai_client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {"role": "system", "content": "You are an expert cover letter writer. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,
                max_tokens=2000,
                timeout=120.0,  # 2 minute timeout to prevent hanging
            )
            # Additional asyncio.wait_for wrapper for extra reliability
            response = await asyncio.wait_for(api_call, timeout=125.0)  # 125s wrapper (5s buffer over client timeout)
            print(f"[JobBoard] ✅ OpenAI API call completed for cover letter")
        except asyncio.TimeoutError as timeout_err:
            print(f"[JobBoard] ❌ OpenAI API call timed out after 125 seconds")
            raise
        except Exception as api_err:
            print(f"[JobBoard] ❌ OpenAI API call error: {api_err}")
            print(f"[JobBoard] Error type: {type(api_err)}")
            raise
        
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = re.sub(r"```json?\n?", "", content)
            content = re.sub(r"\n?```", "", content)
        
        result = json.loads(content)
        return {
            "content": result.get("content", ""),
            "highlights": result.get("highlights", []),
            "tone": result.get("tone", "Professional"),
        }
        
    except Exception as e:
        print(f"[JobBoard] Cover letter generation error: {e}")
        raise


# =============================================================================
# API ROUTES
# =============================================================================

@job_board_bp.route("/jobs", methods=["POST"])
@require_firebase_auth
def get_job_listings():
    """
    Get job listings based on user preferences using SerpAPI Google Jobs.
    Uses Firestore caching to reduce API calls.
    
    Request body:
    {
        "jobTypes": ["Internship", "Full-Time"],
        "industries": ["Technology", "Finance"],
        "locations": ["San Francisco, CA"],
        "refresh": false,
        "searchQuery": "optional direct search query"
    }
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        user_id = request.firebase_user.get('uid')
        
        job_types = data.get("jobTypes", ["Internship"])
        industries = data.get("industries", [])
        locations = data.get("locations", [])
        search_query = data.get("searchQuery", "")
        refresh = data.get("refresh", False)  # Force refresh bypasses cache
        
        # Get pagination parameters
        page = data.get("page", 1)
        per_page = data.get("perPage", 20)
        start = (page - 1) * per_page
        
        # Get user data for resume-based matching
        db = get_db()
        user_major = None
        user_skills = None
        user_key_experiences = None
        if db and user_id:
            user_ref = db.collection("users").document(user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                professional_info = user_data.get("professionalInfo", {})
                user_major = professional_info.get("fieldOfStudy") or professional_info.get("major")
                
                # Extract resume data for better job matching
                resume_parsed = user_data.get("resumeParsed", {})
                if resume_parsed:
                    # Sanitize resume data to avoid DocumentReference issues
                    resume_parsed = sanitize_firestore_data(resume_parsed, depth=0, max_depth=10)
                    user_skills = resume_parsed.get("skills", [])
                    user_key_experiences = resume_parsed.get("key_experiences", [])
                    # Ensure they're lists and filter out any non-string items
                    if isinstance(user_skills, list):
                        user_skills = [s for s in user_skills if isinstance(s, str)]
                    else:
                        user_skills = []
                    if isinstance(user_key_experiences, list):
                        user_key_experiences = [e for e in user_key_experiences if isinstance(e, str)]
                    else:
                        user_key_experiences = []
        
        # Build search query with resume data
        if search_query:
            query = search_query
        else:
            query = build_search_query(
                job_types, 
                industries, 
                user_major,
                user_skills,
                user_key_experiences
            )
        
        # Build location
        location = build_location_query(locations)
        
        # Determine primary job type for filtering
        primary_job_type = job_types[0] if job_types else None
        
        # For first page, fetch a large batch (100 jobs) to get more results
        # For subsequent pages, fetch normally
        if page == 1:
            # Fetch 100 jobs on first page to get more results
            fetch_size = 100
            fetch_start = 0
        else:
            fetch_size = per_page
            fetch_start = start
        
        # Fetch jobs using next_page_token pagination (with fallback to start parameter)
        # For first page, we'll make multiple requests to get more jobs
        all_jobs = []
        current_token = None
        current_start = 0  # Fallback pagination using start parameter
        max_pages_to_fetch = 20 if page == 1 else 1  # Fetch up to 20 pages (200 jobs) on first request
        consecutive_empty_results = 0
        use_start_pagination = False  # Track if we're using start parameter pagination
        
        for page_num in range(max_pages_to_fetch):
            # Determine which pagination method to use
            pagination_param = None
            if use_start_pagination:
                # Using start parameter pagination
                pagination_param = f"start={current_start}"
            elif current_token:
                # Using next_page_token pagination
                pagination_param = current_token
            
            jobs_batch, next_token = fetch_jobs_from_serpapi(
                query=query,
                location=location,
                job_type=primary_job_type,
                num_results=10,  # Google Jobs returns 10 per page
                use_cache=not refresh and page_num == 0,  # Only use cache for first page, bypass for subsequent pages to ensure fresh data
                page_token=pagination_param,
            )
            
            if not jobs_batch:
                consecutive_empty_results += 1
                # If we got no results and no next token, definitely stop
                if not next_token:
                    print(f"[JobBoard] No more results available (no next_token), stopping after {page_num} pages")
                    break
                # If we get 3 consecutive empty results, stop (likely exhausted)
                if consecutive_empty_results >= 3:
                    print(f"[JobBoard] Got {consecutive_empty_results} consecutive empty results, stopping")
                    break
                # Otherwise, try next page even if this one was empty
                if next_token:
                    current_token = next_token
                    continue
                else:
                    break
            else:
                consecutive_empty_results = 0  # Reset counter on successful fetch
                
            # Avoid duplicates
            existing_ids = {job["id"] for job in all_jobs}
            new_jobs = [job for job in jobs_batch if job["id"] not in existing_ids]
            all_jobs.extend(new_jobs)
            
            print(f"[JobBoard] Page {page_num + 1}: Got {len(jobs_batch)} jobs ({len(new_jobs)} new), Total: {len(all_jobs)}, Next token: {'Yes' if next_token else 'No'}, Using start param: {use_start_pagination}")
            
            # For first page, fetch up to 200 jobs if available
            # For other pages, stop after getting per_page jobs
            if page == 1:
                # Continue fetching until we have 200 jobs or run out of pages
                if len(all_jobs) >= 200:
                    print(f"[JobBoard] Reached target of 200 jobs, stopping")
                    break
                
                # If no next token and we got exactly 10 jobs, try using start parameter
                if not next_token and len(jobs_batch) == 10 and not use_start_pagination:
                    # Switch to start parameter pagination
                    print(f"[JobBoard] No next_page_token but got 10 jobs, switching to 'start' parameter pagination")
                    use_start_pagination = True
                    current_start = 10  # Start at offset 10 for next page
                    current_token = None
                    continue
                elif not next_token and len(jobs_batch) < 10:
                    # Less than 10 jobs and no next token means we've reached the end
                    print(f"[JobBoard] No next_page_token and got {len(jobs_batch)} jobs (less than 10), reached end of results")
                    break
                elif not next_token and use_start_pagination:
                    # Using start parameter but no more results
                    if len(jobs_batch) < 10:
                        print(f"[JobBoard] Got {len(jobs_batch)} jobs with start parameter (less than 10), reached end of results")
                        break
                    # Continue with next start offset (will be updated below)
                elif not next_token:
                    print(f"[JobBoard] No next_page_token available, stopping with {len(all_jobs)} jobs")
                    break
            else:
                # For subsequent pages, stop after getting per_page results
                if len(all_jobs) >= per_page or (not next_token and not use_start_pagination):
                    break
            
            # Update pagination state for next iteration
            if next_token and not use_start_pagination:
                current_token = next_token
            elif use_start_pagination:
                # Increment start offset for next page
                current_start += 10
                current_token = None  # Will use start parameter next iteration
            elif not next_token and not use_start_pagination:
                # No more pages available
                break
        
        jobs = all_jobs
        print(f"[JobBoard] Fetched {len(jobs)} total jobs for page {page}")
        
        # Score and rank jobs based on resume match (if resume data available)
        if user_skills or user_key_experiences:
            jobs = score_jobs_by_resume_match(jobs, user_skills, user_key_experiences, user_major)
        
        # For first page, return all jobs (up to 200)
        # For subsequent pages, return paginated slice
        if page == 1:
            paginated_jobs = jobs  # Return all jobs on first page (up to 200)
        else:
            paginated_jobs = jobs[:per_page]
        
        # Fallback to mock data if needed
        if not paginated_jobs:
            print("[JobBoard] Falling back to mock data")
            paginated_jobs = get_mock_jobs(job_types, industries, locations)
            source = "demo"
        else:
            source = "serpapi"
        
        # Determine if there are more jobs available
        # For first page, if we got 200 jobs, assume there are more
        # For other pages, if we got a full page, assume there are more
        if page == 1:
            has_more = len(paginated_jobs) >= 200  # If we got 200, there are likely more
        else:
            has_more = len(paginated_jobs) >= per_page
        
        # Estimate total - be more optimistic (Google Jobs typically has thousands of results)
        estimated_total = len(paginated_jobs) + (500 if has_more else 0)
        
        print(f"[JobBoard] Returning {len(paginated_jobs)} jobs, hasMore={has_more}, estimatedTotal={estimated_total}")
        
        return jsonify({
            "jobs": paginated_jobs,
            "total": len(paginated_jobs),
            "estimatedTotal": estimated_total,
            "page": page,
            "perPage": per_page,
            "hasMore": has_more,
            "source": source,
            "query": query,
            "location": location,
            "cached": source == "serpapi" and not refresh,
        }), 200
        
    except Exception as e:
        print(f"[JobBoard] Error fetching jobs: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@job_board_bp.route("/search", methods=["POST"])
@require_firebase_auth
def search_jobs():
    """
    Direct job search with custom query.
    
    Request body:
    {
        "query": "software engineer intern",
        "location": "San Francisco, CA",
        "jobType": "Internship"
    }
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        
        query = data.get("query", "entry level jobs")
        location = data.get("location", "United States")
        job_type = data.get("jobType")
        
        jobs, _ = fetch_jobs_from_serpapi(
            query=query,
            location=location,
            job_type=job_type,
            num_results=10,
            page_token=None,
        )
        
        return jsonify({
            "jobs": jobs,
            "total": len(jobs),
            "query": query,
            "location": location,
        }), 200
        
    except Exception as e:
        print(f"[JobBoard] Search error: {e}")
        return jsonify({"error": str(e)}), 500


@job_board_bp.route("/optimize-resume", methods=["POST"])
@require_firebase_auth
def optimize_resume():
    """
    Optimize user's resume for a specific job.
    Cost: 20 credits
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        user_id = request.firebase_user.get('uid')
        
        job_url = data.get("jobUrl")
        job_description = data.get("jobDescription", "")
        job_title = data.get("jobTitle", "")
        company = data.get("company", "")
        
        # Check credits
        db = get_db()
        if not db:
            return jsonify({"error": "Database not available"}), 500
            
        user_ref = db.collection("users").document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({"error": "User not found"}), 404
        
        user_data = user_doc.to_dict()
        # Sanitize user_data before using it - it might contain DocumentReferences
        print(f"[JobBoard] Sanitizing user_data before credit check...")
        user_data = sanitize_firestore_data(user_data, depth=0, max_depth=20)
        current_credits = check_and_reset_credits(user_ref, user_data)
        
        # Check credits first
        if current_credits < OPTIMIZATION_CREDIT_COST:
            return jsonify({
                "error": "Insufficient credits",
                "required": OPTIMIZATION_CREDIT_COST,
                "current": current_credits,
            }), 402
        
        # Deduct credits BEFORE doing the expensive optimization
        # This prevents negative balances and ensures we have credits before proceeding
        print(f"[JobBoard] Deducting credits before optimization...")
        print(f"[JobBoard] Current credits: {current_credits}, Required: {OPTIMIZATION_CREDIT_COST}")
        success, new_credits = deduct_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization")
        
        if not success:
            # Deduction failed (likely insufficient credits due to race condition)
            return jsonify({
                "error": "Failed to deduct credits. Insufficient credits or system error.",
                "current": new_credits,
                "required": OPTIMIZATION_CREDIT_COST,
            }), 402
        
        print(f"[JobBoard] Credits deducted successfully. New balance: {new_credits}")
        
        # Get job details from URL if provided
        # Always parse URL when provided to ensure we get the latest job info
        if job_url:
            print(f"[JobBoard] Parsing job URL: {job_url}")
            parsed_job = parse_job_url(job_url)
            if parsed_job:
                print(f"[JobBoard] Successfully parsed job from URL")
                print(f"[JobBoard] Parsed title: {parsed_job.get('title')}")
                print(f"[JobBoard] Parsed company: {parsed_job.get('company')}")
                print(f"[JobBoard] Parsed description length: {len(parsed_job.get('description', '') or '')}")
                # URL data takes precedence over existing fields
                if parsed_job.get("title"):
                    job_title = parsed_job.get("title")
                if parsed_job.get("company"):
                    company = parsed_job.get("company")
                if parsed_job.get("description"):
                    job_description = parsed_job.get("description")
            else:
                print(f"[JobBoard] Failed to parse job from URL, using provided fields")
        
        if not job_description:
            return jsonify({"error": "Job description is required. Please paste the job description or provide a valid URL."}), 400
        
        # Get user's resume - sanitize to remove Firestore-specific types
        raw_resume = user_data.get("resumeParsed", {})
        if not raw_resume:
            return jsonify({
                "error": "No resume found. Please upload your resume in Account Settings first."
            }), 400
        
        # Deep sanitization - run multiple times to catch nested references
        # Run sanitization multiple times to catch deeply nested DocumentReferences
        print(f"[JobBoard] Starting sanitization of resume data. Type: {type(raw_resume)}")
        user_resume = raw_resume
        for i in range(3):  # Multiple passes
            print(f"[JobBoard] Sanitization pass {i+1}")
            user_resume = sanitize_firestore_data(user_resume, depth=0, max_depth=20)
            # Check if any DocumentReferences remain
            if isinstance(user_resume, dict):
                for key, value in user_resume.items():
                    if is_document_reference(value):
                        print(f"[JobBoard] WARNING: DocumentReference still found in key '{key}' after pass {i+1}")
                    elif isinstance(value, (list, tuple)):
                        for idx, item in enumerate(value):
                            if is_document_reference(item):
                                print(f"[JobBoard] WARNING: DocumentReference still found in {key}[{idx}] after pass {i+1}")
        
        # Additional check: manually inspect and clean ALL list fields
        list_fields = ['experience', 'key_experiences', 'achievements', 'interests', 'skills']
        for field_name in list_fields:
            if isinstance(user_resume, dict) and field_name in user_resume:
                field_value = user_resume.get(field_name, [])
                print(f"[JobBoard] Cleaning {field_name} array. Type: {type(field_value)}, Length: {len(field_value) if isinstance(field_value, list) else 'N/A'}")
                if isinstance(field_value, list):
                    cleaned_list = []
                    for idx, item in enumerate(field_value):
                        if item is not None:
                            if is_document_reference(item):
                                print(f"[JobBoard] Found DocumentReference in {field_name}[{idx}], converting...")
                            # Recursively sanitize nested structures
                            cleaned_item = sanitize_firestore_data(item, depth=0, max_depth=20)
                            # Check if item is a dict with nested DocumentReferences
                            if isinstance(cleaned_item, dict):
                                cleaned_item = {k: sanitize_firestore_data(v, depth=0, max_depth=20) for k, v in cleaned_item.items()}
                            # Remove any remaining DocumentReference-like objects
                            if cleaned_item is not None and not is_document_reference(cleaned_item):
                                cleaned_list.append(cleaned_item)
                            else:
                                print(f"[JobBoard] Removed problematic item from {field_name}[{idx}]")
                    user_resume[field_name] = cleaned_list
                    print(f"[JobBoard] {field_name} array cleaned. New length: {len(cleaned_list)}")

        if not user_resume:
            return jsonify({
                "error": "No resume found. Please upload your resume in Account Settings first."
            }), 400
        
        # Final check before passing to AI function - check ALL keys and nested structures
        print(f"[JobBoard] Final check before AI call. Resume type: {type(user_resume)}")
        
        def recursive_check_for_refs(obj, path="root", max_depth=5, current_depth=0):
            """Recursively check for DocumentReferences and remove them."""
            if current_depth > max_depth:
                return obj
            if is_document_reference(obj):
                print(f"[JobBoard]   ⚠️ Found DocumentReference at {path}, removing...")
                return None
            elif isinstance(obj, dict):
                cleaned = {}
                for k, v in obj.items():
                    cleaned_v = recursive_check_for_refs(v, f"{path}.{k}", max_depth, current_depth+1)
                    if cleaned_v is not None and not is_document_reference(cleaned_v):
                        cleaned[k] = cleaned_v
                return cleaned
            elif isinstance(obj, list):
                cleaned = []
                for i, item in enumerate(obj):
                    cleaned_item = recursive_check_for_refs(item, f"{path}[{i}]", max_depth, current_depth+1)
                    if cleaned_item is not None and not is_document_reference(cleaned_item):
                        cleaned.append(cleaned_item)
                return cleaned
            return obj
        
        # Final aggressive cleanup
        print(f"[JobBoard] Running final recursive cleanup...")
        user_resume = recursive_check_for_refs(user_resume, "root")
        print(f"[JobBoard] Final cleanup complete")
        
        # Optimize resume
        print(f"[JobBoard] Calling optimize_resume_with_ai...")
        try:
            # Final safety check - ensure user_resume is completely clean
            print(f"[JobBoard] Final pre-call check: ensuring all values are serializable...")
            def final_clean(obj):
                """Final aggressive clean - convert everything to basic types."""
                if is_document_reference(obj):
                    return str(obj.path) if hasattr(obj, 'path') else str(obj)
                elif isinstance(obj, dict):
                    return {k: final_clean(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [final_clean(item) for item in obj]
                elif not isinstance(obj, (str, int, float, bool, type(None))):
                    return str(obj)
                return obj
            user_resume = final_clean(user_resume)
            print(f"[JobBoard] Final clean complete, calling AI function...")
            
            try:
                # Wrap in timeout to prevent indefinite hanging
                async def optimize_with_timeout():
                    return await optimize_resume_with_ai(user_resume, job_description, job_title, company)
                
                print(f"[JobBoard] Starting async optimization with 130 second timeout...")
                optimized = asyncio.run(
                    asyncio.wait_for(optimize_with_timeout(), timeout=130.0)  # 130 seconds total timeout (slightly longer than inner 120s)
                )
                print(f"[JobBoard] ✅ AI function returned successfully")
            except asyncio.TimeoutError:
                print(f"[JobBoard] ❌ Resume optimization timed out after 130 seconds")
                import traceback
                traceback.print_exc()
                return jsonify({
                    "error": "Resume optimization timed out after 2 minutes. Please try again with a shorter job description.",
                }), 504
            except Exception as async_error:
                print(f"[JobBoard] ❌ Error in async optimization: {async_error}")
                print(f"[JobBoard] Error type: {type(async_error)}")
                import traceback
                traceback.print_exc()
                # Re-raise to be caught by outer exception handler
                raise
            print(f"[JobBoard] Optimized result type: {type(optimized)}")
            print(f"[JobBoard] Optimized result keys: {list(optimized.keys()) if isinstance(optimized, dict) else 'N/A'}")
            
            # Final sanitization of the optimized result before returning
            print(f"[JobBoard] Sanitizing optimized result before jsonify...")
            optimized = sanitize_firestore_data(optimized, depth=0, max_depth=20)
            
            # Verify it's JSON serializable
            try:
                test_json = json.dumps(optimized, default=str)
                print(f"[JobBoard] ✅ Optimized result is JSON serializable")
            except Exception as json_error:
                print(f"[JobBoard] ERROR: Optimized result is not JSON serializable: {json_error}")
                import traceback
                traceback.print_exc()
                raise
            
        except Exception as e:
            print(f"[JobBoard] Error in optimize_resume_with_ai: {e}")
            print(f"[JobBoard] Error type: {type(e)}")
            import traceback
            print(f"[JobBoard] Full traceback:")
            traceback.print_exc()
            raise
        
        # Credits were already deducted before the optimization
        # Use the new_credits from the earlier deduction
        print(f"[JobBoard] Using credits from pre-deduction. Balance: {new_credits}")
        
        # Build response - ensure all values are basic types
        print(f"[JobBoard] Building final response...")
        response_data = {
            "optimizedResume": optimized,
            "creditsUsed": int(OPTIMIZATION_CREDIT_COST),
            "creditsRemaining": int(new_credits) if new_credits is not None else 0,
        }
        
        # Sanitize the entire response one more time
        print(f"[JobBoard] Sanitizing final response...")
        response_data = sanitize_firestore_data(response_data, depth=0, max_depth=20)
        
        # Final check before jsonify
        print(f"[JobBoard] Testing final response JSON serialization...")
        try:
            test_response_json = json.dumps(response_data, default=str)
            print(f"[JobBoard] ✅ Final response is JSON serializable")
        except Exception as json_error:
            print(f"[JobBoard] ERROR: Final response is not JSON serializable: {json_error}")
            print(f"[JobBoard] Response data: {response_data}")
            import traceback
            traceback.print_exc()
            raise
        
        print(f"[JobBoard] Calling jsonify...")
        try:
            result = jsonify(response_data)
            print(f"[JobBoard] ✅ jsonify successful, returning response...")
            return result, 200
        except Exception as jsonify_error:
            print(f"[JobBoard] ERROR in jsonify: {jsonify_error}")
            import traceback
            traceback.print_exc()
            raise
        
    except Exception as e:
        print(f"[JobBoard] Resume optimization error: {e}")
        return jsonify({"error": str(e)}), 500


@job_board_bp.route("/generate-cover-letter", methods=["POST"])
@require_firebase_auth
def generate_cover_letter():
    """
    Generate a personalized cover letter for a job.
    Cost: 15 credits
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        user_id = request.firebase_user.get('uid')
        
        job_url = data.get("jobUrl")
        job_description = data.get("jobDescription", "")
        job_title = data.get("jobTitle", "")
        company = data.get("company", "")
        
        # Check credits
        db = get_db()
        if not db:
            return jsonify({"error": "Database not available"}), 500
            
        user_ref = db.collection("users").document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({"error": "User not found"}), 404
        
        user_data = user_doc.to_dict()
        current_credits = check_and_reset_credits(user_ref, user_data)
        
        if current_credits < COVER_LETTER_CREDIT_COST:
            return jsonify({
                "error": "Insufficient credits",
                "required": COVER_LETTER_CREDIT_COST,
                "current": current_credits,
            }), 402
        
        # Get job details from URL if provided
        # Always parse URL when provided to ensure we get the latest job info
        if job_url:
            print(f"[JobBoard] Parsing job URL for cover letter: {job_url}")
            parsed_job = parse_job_url(job_url)
            if parsed_job:
                print(f"[JobBoard] Successfully parsed job from URL")
                print(f"[JobBoard] Parsed title: {parsed_job.get('title')}")
                print(f"[JobBoard] Parsed company: {parsed_job.get('company')}")
                print(f"[JobBoard] Parsed description length: {len(parsed_job.get('description', '') or '')}")
                # URL data takes precedence over existing fields
                if parsed_job.get("title"):
                    job_title = parsed_job.get("title")
                if parsed_job.get("company"):
                    company = parsed_job.get("company")
                if parsed_job.get("description"):
                    job_description = parsed_job.get("description")
            else:
                print(f"[JobBoard] Failed to parse job from URL, using provided fields")
        
        if not job_description:
            return jsonify({"error": "Job description is required. Please paste the job description or provide a valid URL."}), 400
        
        # Get user's resume - sanitize to remove Firestore-specific types
        raw_resume = user_data.get("resumeParsed", {})
        if not raw_resume:
            return jsonify({
                "error": "No resume found. Please upload your resume in Account Settings first."
            }), 400
        
        # Deep sanitization - run multiple times to catch nested references
        # Run sanitization multiple times to catch deeply nested DocumentReferences
        user_resume = raw_resume
        for _ in range(3):  # Multiple passes
            user_resume = sanitize_firestore_data(user_resume, depth=0, max_depth=20)
        
        # Additional check: manually inspect and clean experience array if it exists
        if isinstance(user_resume, dict) and 'experience' in user_resume:
            experience = user_resume.get('experience', [])
            if isinstance(experience, list):
                cleaned_experience = []
                for item in experience:
                    if item is not None:
                        cleaned_item = sanitize_firestore_data(item, depth=0, max_depth=20)
                        # Remove any remaining DocumentReference-like objects
                        if cleaned_item is not None and not any(x in str(type(cleaned_item)).lower() for x in ['reference', 'firestore']):
                            cleaned_experience.append(cleaned_item)
                user_resume['experience'] = cleaned_experience

        if not user_resume:
            return jsonify({
                "error": "No resume found. Please upload your resume in Account Settings first."
            }), 400
        
        # Deduct credits BEFORE doing the expensive generation
        # This prevents negative balances and ensures we have credits before proceeding
        print(f"[JobBoard] Deducting credits before cover letter generation...")
        print(f"[JobBoard] Current credits: {current_credits}, Required: {COVER_LETTER_CREDIT_COST}")
        success, new_credits = deduct_credits_atomic(user_id, COVER_LETTER_CREDIT_COST, "cover_letter_generation")
        
        if not success:
            # Deduction failed (likely insufficient credits due to race condition)
            return jsonify({
                "error": "Failed to deduct credits. Insufficient credits or system error.",
                "current": new_credits,
                "required": COVER_LETTER_CREDIT_COST,
            }), 402
        
        print(f"[JobBoard] Credits deducted successfully. New balance: {new_credits}")
        
        # Generate cover letter
        print(f"[JobBoard] Starting cover letter generation...")
        try:
            # Wrap in timeout to prevent indefinite hanging
            # Use the same pattern as optimize_resume for consistency
            async def generate_with_timeout():
                return await generate_cover_letter_with_ai(user_resume, job_description, job_title, company)
            
            print(f"[JobBoard] Starting async cover letter generation with 130 second timeout...")
            cover_letter = asyncio.run(
                asyncio.wait_for(generate_with_timeout(), timeout=130.0)  # 130 seconds total timeout (slightly longer than inner 120s)
            )
            print(f"[JobBoard] ✅ Cover letter generation completed successfully")
        except asyncio.TimeoutError:
            print(f"[JobBoard] ❌ Cover letter generation timed out after 130 seconds")
            import traceback
            traceback.print_exc()
            return jsonify({
                "error": "Cover letter generation timed out after 2 minutes. Please try again.",
            }), 504
        except Exception as gen_error:
            print(f"[JobBoard] ❌ Error during cover letter generation: {gen_error}")
            print(f"[JobBoard] Error type: {type(gen_error)}")
            import traceback
            traceback.print_exc()
            raise
        
        return jsonify({
            "coverLetter": cover_letter,
            "creditsUsed": COVER_LETTER_CREDIT_COST,
            "creditsRemaining": new_credits,
        }), 200
        
    except Exception as e:
        print(f"[JobBoard] Cover letter generation error: {e}")
        return jsonify({"error": str(e)}), 500


@job_board_bp.route("/parse-job-url", methods=["POST"])
@require_firebase_auth
def parse_job_url_endpoint():
    """
    Parse a job URL to extract job details.
    No credit cost - just URL parsing.
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        url = data.get("url", "")
        
        if not url:
            return jsonify({"error": "URL is required"}), 400
        
        try:
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                return jsonify({"error": "Invalid URL format"}), 400
        except Exception:
            return jsonify({"error": "Invalid URL"}), 400
        
        job_data = parse_job_url(url)
        
        if not job_data:
            return jsonify({
                "error": "Could not parse job details from URL",
                "suggestion": "Please paste the job description manually"
            }), 400
        
        return jsonify({"job": job_data}), 200
        
    except Exception as e:
        print(f"[JobBoard] URL parsing error: {e}")
        return jsonify({"error": str(e)}), 500


@job_board_bp.route("/clear-cache", methods=["POST"])
@require_firebase_auth
def clear_cache():
    """
    Admin endpoint to clear expired cache entries.
    """
    try:
        deleted = clear_expired_cache()
        return jsonify({
            "message": f"Cleared {deleted} expired cache entries",
            "deleted": deleted,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# MOCK DATA FALLBACK
# =============================================================================

def get_mock_jobs(
    job_types: List[str],
    industries: List[str],
    locations: List[str],
) -> List[Dict[str, Any]]:
    """
    Fallback mock job listings when SerpAPI is unavailable.
    """
    all_jobs = [
        {
            "id": "mock_1",
            "title": "Software Engineering Intern",
            "company": "Google",
            "location": "Mountain View, CA",
            "salary": "$8,000/mo",
            "type": "Internship",
            "posted": "2 days ago",
            "description": "Join Google's engineering team for a summer internship focused on building scalable systems and innovative products that impact billions of users worldwide. You'll work with experienced engineers on real projects.",
            "requirements": ["Currently pursuing BS/MS in Computer Science", "Experience with Python, Java, or C++", "Strong problem-solving skills"],
            "url": "https://careers.google.com/jobs/",
            "remote": False,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_2",
            "title": "Product Management Intern",
            "company": "Meta",
            "location": "Menlo Park, CA",
            "salary": "$9,000/mo",
            "type": "Internship",
            "posted": "1 week ago",
            "description": "Work alongside experienced PMs to ship products used by billions. You'll define strategy, work cross-functionally, and drive impact on Facebook, Instagram, or WhatsApp.",
            "requirements": ["MBA or BS/MS in relevant field", "Strong analytical skills", "Excellent communication"],
            "url": "https://www.metacareers.com/",
            "remote": True,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_3",
            "title": "Investment Banking Analyst",
            "company": "Goldman Sachs",
            "location": "New York, NY",
            "salary": "$110,000/yr",
            "type": "Full-Time",
            "posted": "3 days ago",
            "description": "Join our Investment Banking Division to work on high-profile M&A, capital markets, and restructuring transactions for Fortune 500 clients.",
            "requirements": ["Bachelor's degree in Finance, Economics, or related", "Strong financial modeling skills", "Excellent attention to detail"],
            "url": "https://www.goldmansachs.com/careers/",
            "remote": False,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_4",
            "title": "Data Science Intern",
            "company": "Netflix",
            "location": "Los Gatos, CA",
            "salary": "$8,500/mo",
            "type": "Internship",
            "posted": "4 days ago",
            "description": "Apply machine learning and statistical methods to personalization, content recommendations, and business analytics that shape what 200M+ members watch.",
            "requirements": ["Pursuing MS/PhD in Statistics, CS, or related", "Proficiency in Python and SQL", "Experience with ML frameworks"],
            "url": "https://jobs.netflix.com/",
            "remote": True,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_5",
            "title": "Consulting Analyst",
            "company": "McKinsey & Company",
            "location": "Chicago, IL",
            "salary": "$95,000/yr",
            "type": "Full-Time",
            "posted": "2 weeks ago",
            "description": "Solve complex business problems for Fortune 500 clients across industries. Develop strategy, drive implementation, and create lasting impact.",
            "requirements": ["Outstanding academic record", "Strong analytical and problem-solving skills", "Leadership experience"],
            "url": "https://www.mckinsey.com/careers",
            "remote": False,
            "experienceLevel": "entry",
        },
        # Additional internship jobs
        {
            "id": "mock_6",
            "title": "Software Engineering Intern",
            "company": "Apple",
            "location": "Cupertino, CA",
            "salary": "$8,200/mo",
            "type": "Internship",
            "posted": "5 days ago",
            "description": "Work on cutting-edge iOS, macOS, or cloud infrastructure projects. Collaborate with world-class engineers to build products used by billions.",
            "requirements": ["Pursuing CS degree", "Experience with Swift, Objective-C, or C++", "Passion for technology"],
            "url": "https://www.apple.com/careers/",
            "remote": False,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_7",
            "title": "Investment Banking Summer Analyst",
            "company": "JPMorgan Chase",
            "location": "New York, NY",
            "salary": "$10,000/mo",
            "type": "Internship",
            "posted": "1 week ago",
            "description": "Summer internship in Investment Banking. Work on live deals, financial modeling, and client presentations.",
            "requirements": ["Strong academic performance", "Interest in finance", "Analytical mindset"],
            "url": "https://careers.jpmorgan.com/",
            "remote": False,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_8",
            "title": "Product Design Intern",
            "company": "Airbnb",
            "location": "San Francisco, CA",
            "salary": "$7,500/mo",
            "type": "Internship",
            "posted": "3 days ago",
            "description": "Design experiences that make travel more accessible and meaningful. Work on user research, prototyping, and visual design.",
            "requirements": ["Portfolio demonstrating design skills", "Experience with Figma or Sketch", "User-centered design thinking"],
            "url": "https://careers.airbnb.com/",
            "remote": True,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_9",
            "title": "Software Engineering Intern",
            "company": "Amazon",
            "location": "Seattle, WA",
            "salary": "$8,400/mo",
            "type": "Internship",
            "posted": "6 days ago",
            "description": "Build scalable systems that power Amazon's retail, AWS, and Alexa services. Work on distributed systems, machine learning, or frontend applications.",
            "requirements": ["CS or related degree", "Programming experience", "Problem-solving skills"],
            "url": "https://www.amazon.jobs/",
            "remote": False,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_10",
            "title": "Business Development Intern",
            "company": "Salesforce",
            "location": "San Francisco, CA",
            "salary": "$7,800/mo",
            "type": "Internship",
            "posted": "4 days ago",
            "description": "Help drive growth by identifying new business opportunities, building partnerships, and supporting strategic initiatives.",
            "requirements": ["Business or related major", "Strong communication skills", "Entrepreneurial mindset"],
            "url": "https://www.salesforce.com/careers/",
            "remote": True,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_11",
            "title": "Research Intern",
            "company": "Microsoft",
            "location": "Redmond, WA",
            "salary": "$8,600/mo",
            "type": "Internship",
            "posted": "2 days ago",
            "description": "Work on cutting-edge research in AI, cloud computing, or human-computer interaction. Collaborate with world-renowned researchers.",
            "requirements": ["Research experience", "Strong technical background", "Publication record preferred"],
            "url": "https://careers.microsoft.com/",
            "remote": False,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_12",
            "title": "Marketing Intern",
            "company": "Nike",
            "location": "Beaverton, OR",
            "salary": "$7,200/mo",
            "type": "Internship",
            "posted": "1 week ago",
            "description": "Support marketing campaigns, social media strategy, and brand initiatives for one of the world's most recognized brands.",
            "requirements": ["Marketing or communications major", "Creative thinking", "Social media experience"],
            "url": "https://jobs.nike.com/",
            "remote": False,
            "experienceLevel": "entry",
        },
    ]
    
    # Filter by job type if specified
    if job_types and "all" not in [t.lower() for t in job_types]:
        all_jobs = [j for j in all_jobs if j["type"] in job_types]
    
    # Return more jobs (up to 50) to simulate real API behavior
    return all_jobs * 3  # Repeat the list 3 times to get ~36 jobs for internships

