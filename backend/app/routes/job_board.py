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
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse, parse_qs

from flask import Blueprint, jsonify, request, current_app
import requests
from bs4 import BeautifulSoup

from app.extensions import require_firebase_auth, get_db
from app.services.auth import deduct_credits_atomic, refund_credits_atomic, check_and_reset_credits
from app.services.openai_client import get_async_openai_client, get_openai_client
from app.services.ats_scorer import calculate_ats_score
from app.services.recruiter_finder import find_recruiters, determine_job_type
from app.services.resume_optimizer_v2 import optimize_resume_v2 as run_resume_optimization
from app.services.resume_capabilities import get_capabilities
from firebase_admin import firestore

job_board_bp = Blueprint("job_board", __name__, url_prefix="/api/job-board")


# =============================================================================
# CONSTANTS
# =============================================================================

OPTIMIZATION_CREDIT_COST = 20
COVER_LETTER_CREDIT_COST = 15
CACHE_DURATION_HOURS = 6  # How long to cache job results

# Error Messages for Resume Optimization
ERROR_MESSAGES = {
    'url_parse_failed': 'Could not extract job details from that URL. Try pasting the job description directly.',
    'url_not_supported': 'That job board is not supported yet. Please paste the job description instead.',
    'resume_not_found': 'No resume found. Please upload your resume in Account Settings first.',
    'resume_incomplete': 'Your resume is missing required sections. Please update your profile.',
    'ai_timeout': 'The optimization is taking longer than expected. Your credits have been refunded. Please try again.',
    'ai_rate_limit': 'Our AI service is busy. Your credits have been refunded. Please try again in a few minutes.',
    'ai_error': 'Something went wrong with the optimization. Your credits have been refunded.',
    'invalid_job_description': 'The job description is too short or invalid. Please provide more details.',
    'credits_insufficient': 'Not enough credits. You need 20 credits to optimize your resume.',
    'database_error': 'Database error occurred. Please try again.',
    'json_parse_error': 'Error processing the optimization results. Please try again.',
}

def get_status_code(error_code: str) -> int:
    """Get HTTP status code for error code."""
    if error_code == 'credits_insufficient':
        return 402
    if error_code in ['resume_not_found', 'resume_incomplete', 'url_parse_failed', 'url_not_supported', 'invalid_job_description']:
        return 400
    if error_code in ['ai_timeout', 'ai_rate_limit']:
        return 503
    return 500

# Job Quality Configuration
MAX_JOB_AGE_DAYS = int(os.getenv('MAX_JOB_AGE_DAYS', 30))  # Filter out jobs older than this
MIN_QUALITY_SCORE = int(os.getenv('MIN_QUALITY_SCORE', 15))  # Minimum quality score threshold

# SerpAPI Configuration
SERPAPI_KEY = os.getenv("SERPAPI_KEY") or os.getenv("SERP_API_KEY")


# =============================================================================
# USER PROFILE CACHING (5-minute TTL)
# =============================================================================

_user_profile_cache: Dict[str, Tuple[dict, float]] = {}
_USER_PROFILE_CACHE_TTL = 300  # 5 minutes in seconds

def _get_cached_user_profile(uid: str) -> Optional[dict]:
    """Get cached user profile if not expired."""
    if uid in _user_profile_cache:
        profile, timestamp = _user_profile_cache[uid]
        if time.time() - timestamp < _USER_PROFILE_CACHE_TTL:
            print(f"[JobBoard] ✅ Using cached user profile for {uid[:8]}... (age: {time.time() - timestamp:.1f}s)")
            return profile
        else:
            # Cache expired, remove it
            del _user_profile_cache[uid]
            print(f"[JobBoard] ⏰ User profile cache expired for {uid[:8]}...")
    return None

def _set_cached_user_profile(uid: str, profile: dict):
    """Cache user profile with current timestamp."""
    _user_profile_cache[uid] = (profile, time.time())
    print(f"[JobBoard] 💾 Cached user profile for {uid[:8]}... (TTL: {_USER_PROFILE_CACHE_TTL}s)")

def _clear_user_profile_cache(uid: Optional[str] = None):
    """Clear user profile cache. If uid is None, clear all."""
    if uid:
        if uid in _user_profile_cache:
            del _user_profile_cache[uid]
            print(f"[JobBoard] 🗑️ Cleared cache for {uid[:8]}...")
    else:
        _user_profile_cache.clear()
        print(f"[JobBoard] 🗑️ Cleared all user profile cache")


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
            error_msg = data.get('error', 'Unknown error')
            # Check if this is a "no more results" error (expected when pagination exhausted)
            if isinstance(error_msg, str):
                if "hasn't returned any results" in error_msg.lower() or "no results" in error_msg.lower():
                    # This is expected when there are no more results for pagination
                    print(f"[JobBoard] No more results available for pagination (expected): {error_msg}")
                    return [], None  # Return empty to stop pagination gracefully
                elif "invalid" in error_msg.lower() and "token" in error_msg.lower():
                    # Invalid token - might be expired or malformed
                    print(f"[JobBoard] Invalid pagination token (may be expired): {error_msg}")
                    return [], None
            # For other errors, log as actual errors
            print(f"[JobBoard] SerpAPI API error: {error_msg}")
            if isinstance(data["error"], dict):
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

def extract_user_profile_from_resume(user_data: dict) -> dict:
    """
    Extract user profile data from resumeParsed, handling both old and new formats.
    
    Old format (flat):
        resumeParsed.major, resumeParsed.skills (array), resumeParsed.university
    
    New format (nested):
        resumeParsed.education.major, resumeParsed.skills.programming_languages, etc.
    
    Returns a normalized profile dict.
    """
    resume_parsed = user_data.get('resumeParsed', {})
    professional_info = user_data.get('professionalInfo', {})
    
    # === EDUCATION ===
    # Try new format first (nested under education)
    education = resume_parsed.get('education', {}) if resume_parsed else {}
    major = (
        education.get('major') or 
        (resume_parsed.get('major', '') if resume_parsed else '') or
        professional_info.get('fieldOfStudy') or
        professional_info.get('major') or
        ''
    )
    university = (
        education.get('university') or 
        (resume_parsed.get('university', '') if resume_parsed else '') or
        professional_info.get('university') or
        ''
    )
    graduation = (
        education.get('graduation') or 
        (resume_parsed.get('year', '') if resume_parsed else '') or
        professional_info.get('graduationYear') or
        ''
    )
    coursework = education.get('coursework', [])
    
    # === SKILLS ===
    # Try new format first (nested object with categories)
    skills_data = resume_parsed.get('skills', {}) if resume_parsed else {}
    
    if isinstance(skills_data, dict):
        # New format: skills is an object with categories
        programming_languages = skills_data.get('programming_languages', [])
        tools_frameworks = skills_data.get('tools_frameworks', [])
        core_skills = skills_data.get('core_skills', [])
        databases = skills_data.get('databases', [])
        cloud_devops = skills_data.get('cloud_devops', [])
        soft_skills = skills_data.get('soft_skills', [])
        
        # Combine all skills into a flat list for matching
        all_skills = (
            programming_languages + 
            tools_frameworks + 
            core_skills + 
            databases + 
            cloud_devops
        )
    elif isinstance(skills_data, list):
        # Old format: skills is a flat array
        all_skills = [s for s in skills_data if isinstance(s, str)]
        programming_languages = all_skills
        tools_frameworks = []
        core_skills = []
    else:
        all_skills = []
        programming_languages = []
        tools_frameworks = []
        core_skills = []
    
    # === EXPERIENCE ===
    # Try new format first (array of objects with company, title, bullets)
    experience = resume_parsed.get('experience', []) if resume_parsed else []
    
    if not experience:
        # Fall back to old format
        key_experiences = resume_parsed.get('key_experiences', []) if resume_parsed else []
        experience = [
            {
                'title': exp if isinstance(exp, str) else exp.get('title', ''),
                'company': '' if isinstance(exp, str) else exp.get('company', ''),
                'bullets': [exp] if isinstance(exp, str) else exp.get('bullets', []),
                'keywords': [] if isinstance(exp, str) else exp.get('keywords', [])
            }
            for exp in key_experiences
        ]
    
    # Extract experience details for matching
    experience_titles = []
    experience_companies = []
    experience_bullets = []
    
    for exp in experience:
        if isinstance(exp, dict):
            if exp.get('title'):
                experience_titles.append(exp['title'])
            if exp.get('company'):
                experience_companies.append(exp['company'])
            if exp.get('bullets'):
                if isinstance(exp['bullets'], list):
                    experience_bullets.extend(exp['bullets'])
                else:
                    experience_bullets.append(str(exp['bullets']))
        elif isinstance(exp, str):
            # Old format: just strings
            experience_bullets.append(exp)
    
    # === PROJECTS ===
    projects = resume_parsed.get('projects', []) if resume_parsed else []
    project_names = [p.get('name', '') for p in projects if isinstance(p, dict)]
    project_descriptions = [p.get('description', '') for p in projects if isinstance(p, dict)]
    project_technologies = []
    for p in projects:
        if isinstance(p, dict) and p.get('technologies'):
            if isinstance(p['technologies'], list):
                project_technologies.extend(p['technologies'])
    
    # === EXTRACURRICULARS ===
    extracurriculars = resume_parsed.get('extracurriculars', []) if resume_parsed else []
    if not extracurriculars:
        # Try old format
        extracurriculars = resume_parsed.get('interests', []) if resume_parsed else []
    
    # Normalize extracurriculars to dict format
    normalized_extracurriculars = []
    for ec in extracurriculars:
        if isinstance(ec, dict):
            normalized_extracurriculars.append({
                'name': ec.get('name', ''),
                'role': ec.get('role', ''),
                'description': ec.get('description', '')
            })
        elif isinstance(ec, str):
            normalized_extracurriculars.append({
                'name': ec,
                'role': '',
                'description': ''
            })
    
    # === CONTACT ===
    contact = resume_parsed.get('contact', {}) if resume_parsed else {}
    location = contact.get('location') or resume_parsed.get('location', '') if resume_parsed else ''
    
    return {
        # Education
        'major': major,
        'university': university,
        'graduation': graduation,
        'coursework': coursework,
        
        # Skills (categorized)
        'all_skills': all_skills,
        'programming_languages': programming_languages,
        'tools_frameworks': tools_frameworks,
        'core_skills': core_skills,
        
        # Experience
        'experience': experience,
        'experience_titles': experience_titles,
        'experience_companies': experience_companies,
        'experience_bullets': experience_bullets,
        'experience_count': len(experience),
        
        # Projects
        'projects': projects,
        'project_names': project_names,
        'project_descriptions': project_descriptions,
        'project_technologies': project_technologies,
        'project_count': len(projects),
        
        # Other
        'extracurriculars': normalized_extracurriculars,
        'location': location,
        
        # For logging
        'has_major': bool(major),
        'skills_count': len(all_skills),
        'extracurriculars_count': len(normalized_extracurriculars),
    }


def get_user_career_profile(uid: str) -> dict:
    """
    Extract comprehensive career profile from user's Firestore data.
    Uses 5-minute cache to avoid repeated Firestore lookups.
    
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
    # Check cache first
    cached_profile = _get_cached_user_profile(uid)
    if cached_profile is not None:
        return cached_profile
    
    db = get_db()
    if not db:
        return {}
    
    try:
        user_ref = db.collection("users").document(uid)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return {}
        
        user_data = user_doc.to_dict()
        
        # Sanitize data to handle DocumentReferences
        resume_parsed = user_data.get("resumeParsed", {})
        if resume_parsed:
            resume_parsed = sanitize_firestore_data(resume_parsed, depth=0, max_depth=10)
            user_data["resumeParsed"] = resume_parsed
        
        # Use helper function to extract profile from both old and new formats
        profile = extract_user_profile_from_resume(user_data)
        professional_info = user_data.get("professionalInfo", {})
        
        # Extract minor (only from professionalInfo, not in resumeParsed)
        minor = professional_info.get("minor") or None
        
        # Extract graduation year
        graduation_year = None
        year_str = profile.get('graduation') or professional_info.get("graduationYear")
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
        
        # Extract interests (from professionalInfo or user_data, not resumeParsed)
        interests = professional_info.get("interests", [])
        if not interests:
            interests = user_data.get("interests", [])
        if not isinstance(interests, list):
            interests = []
        
        # Convert experience list to expected format
        experiences = []
        for exp in profile.get('experience', [])[:10]:
            if isinstance(exp, dict):
                experiences.append({
                    "title": exp.get("title", ""),
                    "company": exp.get("company", ""),
                    "keywords": exp.get("keywords", [])
                })
        
        result = {
            "major": profile.get("major", ""),
            "minor": minor,
            "skills": profile.get("all_skills", [])[:20],  # Limit to top 20 skills
            "extracurriculars": profile.get("extracurriculars", [])[:15],  # Limit to top 15
            "experiences": experiences,  # Already limited to top 10
            "interests": interests[:10],  # Limit to top 10
            "graduation_year": graduation_year,
            "gpa": gpa,
            "target_industries": target_industries,
            "job_types": job_types
        }
        
        # Cache the result
        _set_cached_user_profile(uid, result)
        
        return result
        
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
        ec_name = (ec.get("name") or "").lower()
        ec_role = (ec.get("role") or "").lower()
        ec_desc = (ec.get("description") or "").lower()
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
        major: User's academic major (e.g., "Data Science and Economics")
        
    Returns:
        List of relevant job title keywords
    """
    if not major:
        return ["entry level", "associate", "analyst"]
    
    major_lower = major.lower().strip()
    
    # Combined majors (like "Data Science and Economics")
    if 'data' in major_lower and 'economics' in major_lower:
        return ['Data Scientist', 'Data Analyst', 'Quantitative Analyst', 'Financial Analyst', 'Business Intelligence']
    if 'data' in major_lower and 'finance' in major_lower:
        return ['Data Scientist', 'Data Analyst', 'Quantitative Analyst', 'Financial Analyst', 'Business Intelligence']
    
    # Data Science / Analytics
    if 'data science' in major_lower or 'data analytics' in major_lower:
        return ['Data Scientist', 'Data Analyst', 'Machine Learning', 'ML Engineer', 'Data Engineer', 'Analytics']
    
    # Computer Science / Software Engineering
    if 'computer science' in major_lower or 'software' in major_lower:
        return ['Software Engineer', 'Developer', 'SWE', 'Backend', 'Frontend', 'Full Stack']
    
    # Economics / Finance
    if 'economics' in major_lower or 'finance' in major_lower:
        return ['Financial Analyst', 'Investment Banking', 'Quantitative', 'Economics', 'Strategy']
    
    # Business / Management
    if 'business' in major_lower or 'management' in major_lower:
        return ['Business Analyst', 'Product Manager', 'Strategy', 'Consultant', 'Operations']
    
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


# Industry to keywords mapping (for query building)
INDUSTRY_TO_KEYWORDS = {
    "technology": ["software", "tech", "IT", "developer", "engineer"],
    "finance": ["financial", "banking", "investment", "analyst"],
    "consulting": ["consultant", "advisory", "strategy"],
    "healthcare": ["health", "medical", "clinical", "hospital"],
    "marketing": ["marketing", "advertising", "brand", "digital"],
    "media": ["media", "entertainment", "content", "journalism"],
    "retail": ["retail", "e-commerce", "merchandising"],
    "manufacturing": ["manufacturing", "operations", "supply chain"],
    "education": ["education", "teaching", "academic", "learning"],
    "government": ["government", "public sector", "policy", "federal"],
    "nonprofit": ["nonprofit", "NGO", "social impact", "foundation"],
    "real estate": ["real estate", "property", "development"],
    "energy": ["energy", "oil", "gas", "renewable", "utilities"],
    "automotive": ["automotive", "auto", "vehicle", "transportation"],
    "aerospace": ["aerospace", "aviation", "defense", "space"],
}

# ============================================
# COMPANY TIER LISTS (for quality filtering)
# ============================================

TOP_TECH_COMPANIES = [
    # FAANG / MAANG
    "google", "meta", "amazon", "apple", "netflix", "microsoft",
    # Top Tech
    "nvidia", "salesforce", "adobe", "oracle", "ibm", "intel", "cisco",
    # Unicorns & High-Growth
    "stripe", "databricks", "figma", "canva", "notion", "airtable", "plaid",
    "coinbase", "robinhood", "instacart", "doordash", "uber", "lyft", "airbnb",
    "snowflake", "datadog", "mongodb", "twilio", "okta", "crowdstrike",
    "palantir", "splunk", "servicenow", "workday", "zoom", "slack", "dropbox",
    "spotify", "pinterest", "snap", "twitter", "linkedin", "tiktok", "bytedance",
    # Defense/Gov Tech
    "anduril", "scale ai", "openai", "anthropic",
]

TOP_FINANCE_COMPANIES = [
    # Investment Banks (Bulge Bracket)
    "goldman sachs", "jp morgan", "jpmorgan", "morgan stanley", "bank of america",
    "citigroup", "citi", "barclays", "deutsche bank", "ubs", "credit suisse",
    # Elite Boutiques
    "evercore", "lazard", "moelis", "centerview", "perella weinberg", "pwp",
    "pjt partners", "greenhill", "rothschild",
    # Private Equity
    "blackstone", "kkr", "carlyle", "apollo", "tpg", "warburg pincus",
    "advent international", "bain capital", "silver lake", "thoma bravo",
    # Hedge Funds
    "citadel", "bridgewater", "two sigma", "de shaw", "jane street", "point72",
    "millennium", "aqr", "renaissance", "man group",
    # Asset Management
    "blackrock", "vanguard", "fidelity", "t. rowe price", "state street",
    "pimco", "wellington", "capital group",
    # Venture Capital
    "sequoia", "andreessen horowitz", "a16z", "kleiner perkins", "accel",
    "benchmark", "greylock", "lightspeed", "general catalyst",
]

TOP_CONSULTING_COMPANIES = [
    # MBB
    "mckinsey", "bain", "boston consulting", "bcg",
    # Big 4
    "deloitte", "pwc", "pricewaterhousecoopers", "ey", "ernst young", "kpmg",
    # Tier 2 Consulting
    "accenture", "booz allen", "oliver wyman", "roland berger", "strategy&",
    "l.e.k.", "lek", "simon-kucher", "kearney", "atkearney",
    # Boutique/Specialty
    "parthenon", "ey-parthenon", "zs associates", "cornerstone research",
]

FORTUNE_500_KEYWORDS = [
    "fortune 500", "fortune500", "f500",
    "walmart", "exxon", "chevron", "berkshire", "unitedhealth",
    "johnson & johnson", "j&j", "procter & gamble", "p&g",
    "jpmorgan", "visa", "mastercard", "home depot", "pfizer",
    "coca-cola", "pepsi", "nike", "starbucks", "disney", "boeing",
    "3m", "caterpillar", "general electric", "ge", "honeywell",
    "lockheed martin", "raytheon", "northrop grumman",
]

# Generic/Low-Quality company name patterns to filter out
LOW_QUALITY_COMPANY_PATTERNS = [
    "recruiting", "staffing", "placement", "agency", "temp ",
    "personnel", "workforce", "employment services", "hiring",
    "talent acquisition", "job seekers", "career services",
    "remote jobs", "work from home", "wfh jobs",
]

# Spam keywords to detect in descriptions
SPAM_KEYWORDS = [
    "make money fast", "work from home!!!", "earn $", "$$",
    "no experience needed", "hiring immediately!!!", "urgent!!!",
    "apply now!!!", "!!!",
]

# High-quality job sources (prioritize these)
HIGH_QUALITY_SOURCES = [
    "linkedin", "company website", "glassdoor", "indeed", 
    "lever", "greenhouse", "workday", "careers page",
]

# Industry to top companies mapping
INDUSTRY_TOP_COMPANIES = {
    "technology": TOP_TECH_COMPANIES,
    "tech": TOP_TECH_COMPANIES,
    "software": TOP_TECH_COMPANIES,
    "finance": TOP_FINANCE_COMPANIES,
    "banking": TOP_FINANCE_COMPANIES,
    "investment": TOP_FINANCE_COMPANIES,
    "consulting": TOP_CONSULTING_COMPANIES,
    "strategy": TOP_CONSULTING_COMPANIES,
}

# =============================================================================
# SKILL SYNONYMS FOR SEMANTIC MATCHING
# =============================================================================

SKILL_SYNONYMS = {
    # Programming Languages
    "python": ["python3", "python programming", "python development", "py"],
    "javascript": ["js", "node.js", "nodejs", "node", "es6", "typescript", "ts"],
    "java": ["java programming", "j2ee", "spring", "spring boot"],
    "c++": ["cpp", "c plus plus", "cplusplus"],
    "c#": ["csharp", "c sharp", ".net", "dotnet"],
    "sql": ["mysql", "postgresql", "postgres", "sqlite", "database", "queries"],
    "r": ["r programming", "r language", "rstudio"],
    
    # Data Science / ML
    "machine learning": ["ml", "deep learning", "neural networks", "ai", "artificial intelligence"],
    "data science": ["data analytics", "data analysis", "statistical analysis", "analytics"],
    "data analysis": ["data analytics", "analytics", "business intelligence", "bi"],
    "tensorflow": ["tf", "keras", "pytorch", "deep learning framework"],
    "pandas": ["dataframes", "data manipulation", "python data"],
    
    # Web Development
    "react": ["reactjs", "react.js", "react native"],
    "angular": ["angularjs", "angular.js"],
    "vue": ["vuejs", "vue.js"],
    "html": ["html5", "html/css", "web development"],
    "css": ["css3", "scss", "sass", "styling"],
    "flask": ["python flask", "flask framework"],
    "django": ["python django", "django framework"],
    
    # Cloud & DevOps
    "aws": ["amazon web services", "cloud computing", "ec2", "s3", "lambda"],
    "azure": ["microsoft azure", "cloud"],
    "gcp": ["google cloud", "google cloud platform"],
    "docker": ["containers", "containerization", "kubernetes", "k8s"],
    "kubernetes": ["k8s", "container orchestration", "docker"],
    "ci/cd": ["continuous integration", "continuous deployment", "devops", "jenkins", "github actions"],
    
    # Business / Finance
    "financial modeling": ["financial analysis", "dcf", "valuation", "excel modeling"],
    "excel": ["spreadsheets", "microsoft excel", "google sheets", "vlookup", "pivot tables"],
    "powerpoint": ["presentations", "slides", "ppt", "google slides"],
    "accounting": ["bookkeeping", "financial reporting", "gaap"],
    "investment banking": ["ib", "m&a", "mergers and acquisitions", "capital markets"],
    
    # Soft Skills
    "leadership": ["team lead", "management", "leading teams", "team leadership"],
    "communication": ["written communication", "verbal communication", "presentation skills"],
    "project management": ["pm", "agile", "scrum", "project planning", "pmp"],
    "teamwork": ["collaboration", "team player", "cross-functional"],
    "problem solving": ["analytical", "critical thinking", "troubleshooting"],
}

# Build reverse mapping for quick lookup
SKILL_TO_SYNONYMS: Dict[str, Set[str]] = {}
for primary, synonyms in SKILL_SYNONYMS.items():
    all_terms = {primary.lower()} | {s.lower() for s in synonyms}
    for term in all_terms:
        if term not in SKILL_TO_SYNONYMS:
            SKILL_TO_SYNONYMS[term] = set()
        SKILL_TO_SYNONYMS[term].update(all_terms)


def build_personalized_queries(user_profile: dict, job_types: List[str]) -> List[dict]:
    """
    Build multiple targeted search queries based on user's career profile.
    
    Args:
        user_profile: Comprehensive user career profile
        job_types: List of job types (e.g., ["Internship", "Full-Time"])
        
    Returns:
        List of query dicts: [{query: str, priority: int, source: str, weight: float}]
    """
    queries = []
    job_type_str = job_types[0].lower() if job_types else "internship"
    
    # Normalize job type for search
    if job_type_str == "full-time":
        job_type_str = "entry level"
    
    major = user_profile.get("major", "")
    skills = user_profile.get("skills", [])
    extracurriculars = user_profile.get("extracurriculars", [])
    interests = user_profile.get("interests", [])
    target_industries = user_profile.get("target_industries", [])
    
    # Query 1: Major-focused (highest priority)
    if major:
        major_jobs = get_job_keywords_for_major(major)[:4]
        if major_jobs:
            major_query = f"{job_type_str} ({' OR '.join(major_jobs[:3])})"
            queries.append({
                "query": major_query,
                "priority": 1,
                "source": "major",
                "weight": 1.2  # Boost jobs from this query
            })
    
    # Query 2: Top skills focused
    if skills and len(skills) >= 2:
        top_skills = skills[:4]
        skills_query = f"{job_type_str} ({' OR '.join(top_skills[:3])})"
        queries.append({
            "query": skills_query,
            "priority": 2,
            "source": "skills",
            "weight": 1.1
        })
    
    # Query 2.5: Skill-pair combination (targeted matches with 2 skills)
    if skills and len(skills) >= 2:
        top_2_skills = skills[:2]
        skill_pair_query = f"{job_type_str} {top_2_skills[0]} {top_2_skills[1]}"
        queries.append({
            "query": skill_pair_query,
            "priority": 2,
            "source": "skill_pair",
            "weight": 1.15
        })
    
    # Query 3: Extracurricular-aligned
    ec_signals = extract_career_signals(extracurriculars)
    if ec_signals and len(ec_signals) >= 2:
        ec_query = f"{job_type_str} ({' OR '.join(ec_signals[:3])})"
        queries.append({
            "query": ec_query,
            "priority": 3,
            "source": "extracurriculars",
            "weight": 1.15
        })
    
    # Query 4: Industry-focused
    if target_industries:
        industry = target_industries[0]
        industry_keywords = INDUSTRY_TO_KEYWORDS.get(industry.lower(), [industry])
        industry_query = f"{job_type_str} {' OR '.join(industry_keywords[:2])}"
        queries.append({
            "query": industry_query,
            "priority": 4,
            "source": "industry",
            "weight": 1.0
        })
    
    # Query 4.5: Remote-specific query (targets remote opportunities)
    if major:
        major_jobs = get_job_keywords_for_major(major)[:4]
        if major_jobs:
            remote_query = f"remote {job_type_str} ({' OR '.join(major_jobs[:3])})"
            queries.append({
                "query": remote_query,
                "priority": 3,
                "source": "remote",
                "weight": 1.1
            })
    
    # Query 5: Interest-based (if specified)
    if interests:
        interest_query = f"{job_type_str} {interests[0]}"
        queries.append({
            "query": interest_query,
            "priority": 5,
            "source": "interests",
            "weight": 1.0
        })
    
    # Query 6: TOP COMPANIES QUERY (for quality)
    # Add a query specifically targeting prestigious companies based on user's industry
    top_companies_query = build_top_companies_query(user_profile, job_type_str)
    if top_companies_query:
        queries.append({
            "query": top_companies_query,
            "priority": 2,  # High priority
            "source": "top_companies",
            "weight": 1.25  # Highest weight - these are premium jobs
        })
    
    # Fallback: Generic query if no personalized queries built
    if not queries:
        queries.append({
            "query": f"{job_type_str} jobs",
            "priority": 10,
            "source": "fallback",
            "weight": 0.8
        })
    
    return queries


def build_top_companies_query(user_profile: dict, job_type_str: str) -> str:
    """
    Build a query targeting top/prestigious companies based on user's profile.
    
    Args:
        user_profile: User's career profile
        job_type_str: Job type (internship, entry level, etc.)
        
    Returns:
        Query string targeting top companies, or empty string if no match
    """
    major = (user_profile.get("major") or "").lower()
    target_industries = user_profile.get("target_industries", [])
    
    # Determine which company tier list to use
    companies_to_target = []
    
    # Check major for industry signals
    if any(kw in major for kw in ["computer", "software", "data", "information", "electrical"]):
        companies_to_target = TOP_TECH_COMPANIES[:8]
    elif any(kw in major for kw in ["finance", "economics", "accounting", "business"]):
        # Mix of finance and consulting
        companies_to_target = TOP_FINANCE_COMPANIES[:5] + TOP_CONSULTING_COMPANIES[:3]
    elif any(kw in major for kw in ["math", "statistics", "physics"]):
        # Quant-friendly companies
        companies_to_target = ["jane street", "two sigma", "citadel", "de shaw"] + TOP_TECH_COMPANIES[:4]
    
    # Override with target industries if specified
    if target_industries:
        industry = target_industries[0].lower()
        if industry in INDUSTRY_TOP_COMPANIES:
            companies_to_target = INDUSTRY_TOP_COMPANIES[industry][:8]
    
    if not companies_to_target:
        # Default to a mix of top companies
        companies_to_target = TOP_TECH_COMPANIES[:3] + TOP_FINANCE_COMPANIES[:2] + TOP_CONSULTING_COMPANIES[:2]
    
    # Build query with company names
    # Take top 5 to keep query reasonable
    top_5 = companies_to_target[:5]
    company_or_clause = " OR ".join([f'"{c}"' for c in top_5])
    
    return f"{job_type_str} ({company_or_clause})"


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


# =============================================================================
# JOB MATCHING HELPER FUNCTIONS
# =============================================================================

def expand_skill_terms(skill: str) -> Set[str]:
    """Expand a skill into all its synonyms and variations."""
    skill_lower = skill.lower().strip()
    expanded = SKILL_TO_SYNONYMS.get(skill_lower, {skill_lower})
    
    for primary, synonyms in SKILL_SYNONYMS.items():
        all_terms = [primary.lower()] + [s.lower() for s in synonyms]
        if skill_lower in all_terms:
            expanded.update(all_terms)
    
    return expanded


def semantic_skill_match(skill: str, job_text: str) -> Tuple[bool, float]:
    """
    Check if skill matches job text, considering synonyms.
    Returns (matched, confidence_score).
    """
    expanded_skills = expand_skill_terms(skill)
    job_text_lower = job_text.lower()
    
    for term in expanded_skills:
        if len(term) <= 4:
            pattern = r'\b' + re.escape(term) + r'\b'
            if re.search(pattern, job_text_lower):
                confidence = 1.0 if term == skill.lower() else 0.85
                return True, confidence
        else:
            if term in job_text_lower:
                confidence = 1.0 if term == skill.lower() else 0.85
                return True, confidence
    
    return False, 0.0


def calculate_field_affinity(user_major: str, job_title: str, job_desc: str) -> float:
    """
    Calculate how related the user's field is to the job.
    Returns 0.0 - 1.0 affinity score.
    """
    if not user_major:
        return 0.3
    
    major_lower = user_major.lower()
    job_text = f"{job_title} {job_desc}".lower()
    job_title_lower = job_title.lower()
    
    # Field clusters
    tech_fields = ["computer science", "software", "data science", "information", "computer engineering", "cs"]
    finance_fields = ["finance", "accounting", "economics", "business", "mba"]
    engineering_fields = ["mechanical", "electrical", "civil", "chemical", "aerospace", "biomedical"]
    science_fields = ["biology", "chemistry", "physics", "mathematics", "statistics"]
    
    # Job type indicators
    pure_tech_jobs = ["software engineer", "developer", "programmer", "swe", "frontend", "backend", "full stack"]
    data_tech_jobs = ["data scientist", "data science", "data engineer", "data analyst", "machine learning", "ml engineer", "ai engineer", "analytics"]
    pure_finance_jobs = ["investment banking", "investment analyst", "financial analyst", "trader", "equity research"]
    quant_jobs = ["quantitative", "quant analyst", "quant developer", "algorithmic"]
    
    if major_lower in job_text:
        return 1.0
    
    job_is_pure_tech = any(j in job_title_lower for j in pure_tech_jobs)
    job_is_data_tech = any(j in job_title_lower for j in data_tech_jobs)
    job_is_pure_finance = any(j in job_title_lower for j in pure_finance_jobs)
    job_is_quant = any(j in job_title_lower for j in quant_jobs)
    
    user_is_tech = any(f in major_lower for f in tech_fields)
    user_is_finance = any(f in major_lower for f in finance_fields)
    user_is_engineering = any(f in major_lower for f in engineering_fields)
    user_is_science = any(f in major_lower for f in science_fields)
    
    # Combined majors (e.g., "Data Science and Economics")
    # These should match both data tech and finance jobs well
    user_is_data_and_finance = ('data' in major_lower and ('economics' in major_lower or 'finance' in major_lower))
    
    # Strong matches
    if user_is_data_and_finance and (job_is_data_tech or job_is_quant or job_is_pure_finance):
        return 0.9  # Very good match for combined majors
    if user_is_tech and (job_is_pure_tech or job_is_data_tech):
        return 0.95
    if user_is_finance and job_is_pure_finance:
        return 0.95
    if user_is_science and job_is_quant:
        return 0.85
    if user_is_tech and job_is_quant:
        return 0.75
    
    # Partial matches
    if user_is_data_and_finance and job_is_pure_tech:
        return 0.5  # Moderate match for SWE roles
    if user_is_engineering and job_is_pure_tech:
        return 0.6
    if user_is_science and job_is_data_tech:
        return 0.7
    if user_is_finance and job_is_data_tech:
        return 0.4
    
    # Weak matches
    if user_is_tech and job_is_pure_finance:
        return 0.15
    if user_is_finance and job_is_pure_tech:
        return 0.1
    if user_is_science and job_is_pure_finance:
        return 0.3
    
    return 0.2


def score_job_for_user(job: dict, user_profile: dict, query_weight: float = 1.0) -> int:
    """
    Calculate a match score for a job based on user's profile.
    
    Scoring breakdown (100 points max):
    - Base relevance: 20 points (having a profile)
    - Field/Major affinity: 20 points (semantic matching)
    - Skills match: 30 points (with synonym expansion)
    - Experience relevance: 15 points
    - Additional signals: 15 points (extracurriculars, interests, timing)
    
    Args:
        job: Job dict with title, description, requirements
        user_profile: User's career profile
        query_weight: Multiplier based on query source (1.0-1.2)
        
    Returns:
        Match score 0-100
    """
    score = 0.0
    
    job_title = (job.get("title") or "").lower()
    job_desc = (job.get("description") or "").lower()
    job_reqs = " ".join(job.get("requirements") or []).lower()
    job_company = (job.get("company") or "").lower()
    job_text = f"{job_title} {job_desc} {job_reqs} {job_company}"
    
    # 1. BASE RELEVANCE (20 points max)
    has_profile = bool(user_profile.get("major") or user_profile.get("skills"))
    if has_profile:
        score += 15.0
        job_type = (job.get("type") or "").lower()
        user_job_types = user_profile.get("job_types", [])
        if user_job_types and any(jt.lower() in job_type or job_type in jt.lower() for jt in user_job_types):
            score += 5.0
    
    # 2. FIELD/MAJOR AFFINITY (20 points)
    major = user_profile.get("major") or ""
    field_affinity = calculate_field_affinity(major, job_title, job_desc)
    score += field_affinity * 20
    
    # 3. SKILLS MATCH (30 points)
    skills = user_profile.get("skills", [])
    if skills:
        skill_points = 0.0
        generic_terms = {"strong", "excellent", "good", "experience", "skills", "ability", 
                        "abilities", "working", "team", "work", "looking", "candidates"}
        
        title_matches = 0
        desc_matches = 0
        
        for skill in skills[:15]:
            if not skill:
                continue
            skill_lower = skill.lower().strip()
            if len(skill_lower) < 3 or skill_lower in generic_terms:
                continue
            
            matched_title, conf_title = semantic_skill_match(skill, job_title)
            if matched_title:
                title_matches += 1
                skill_points += 6.0 * conf_title
                continue
            
            matched_desc, conf_desc = semantic_skill_match(skill, job_text)
            if matched_desc and conf_desc >= 0.8:
                desc_matches += 1
                skill_points += 3.0 * conf_desc
        
        total_matches = title_matches + desc_matches
        if total_matches > 0:
            skill_points *= (1 + 0.03 * min(total_matches, 5))
        
        score += min(skill_points, 30.0)
    
    # 4. EXPERIENCE RELEVANCE (15 points)
    experiences = user_profile.get("experiences", [])
    if experiences:
        exp_score = 0.0
        for exp in experiences[:5]:
            exp_title = (exp.get("title") or "").lower()
            exp_keywords = exp.get("keywords", [])
            
            title_words = [w for w in exp_title.split() if len(w) > 3]
            for word in title_words:
                if word in job_title:
                    exp_score += 4.0
                    break
            
            for kw in exp_keywords[:5]:
                if not kw:
                    continue
                matched, conf = semantic_skill_match(kw, job_text)
                if matched:
                    exp_score += 1.5 * conf
        
        score += min(15.0, exp_score)
    
    # 5. ADDITIONAL SIGNALS (15 points)
    additional_score = 0.0
    
    # Extracurriculars (6 points max)
    extracurriculars = user_profile.get("extracurriculars", [])
    if extracurriculars:
        ec_matches = 0
        for ec in extracurriculars[:5]:
            ec_name = (ec.get('name') or "")
            ec_role = (ec.get('role') or "")
            ec_desc = (ec.get('description') or "")
            ec_text = f"{ec_name} {ec_role} {ec_desc}".lower()
            ec_words = [w for w in ec_text.split() if len(w) > 3]
            for word in ec_words[:10]:
                if word in job_text:
                    ec_matches += 1
                    break
        additional_score += min(6, ec_matches * 2)
    
    # Interests (4 points max)
    interests = user_profile.get("interests", [])
    interest_score = sum(1.5 for interest in interests[:5] if interest and (interest.lower() in job_text))
    additional_score += min(4, interest_score)
    
    # Industry match (3 points)
    target_industries = user_profile.get("target_industries", [])
    industry_keywords = {
        "technology": ["software", "tech", "developer", "engineering"],
        "finance": ["financial", "banking", "investment", "analyst"],
        "consulting": ["consultant", "advisory", "strategy"],
        "healthcare": ["health", "medical", "clinical"],
    }
    for industry in target_industries[:3]:
        industry_lower = industry.lower()
        if industry_lower in job_text:
            additional_score += 3
            break
        if industry_lower in industry_keywords and any(kw in job_text for kw in industry_keywords[industry_lower]):
            additional_score += 2
            break
    
    # Graduation timing (2 points)
    grad_year = user_profile.get("graduation_year")
    if grad_year:
        current_year = datetime.now().year
        years_to_grad = grad_year - current_year
        job_type = (job.get("type") or "").lower()
        
        if years_to_grad <= 0 and ("new grad" in job_text or "entry level" in job_text or job_type == "full-time"):
            additional_score += 2
        elif years_to_grad == 1 and ("internship" in job_text or "new grad" in job_text):
            additional_score += 2
        elif years_to_grad > 1 and ("internship" in job_text or job_type == "internship"):
            additional_score += 2
    
    score += min(15.0, additional_score)
    
    # Apply query weight and return
    score = score * query_weight
    return max(0, min(100, int(round(score))))


def calculate_quality_score(job: dict) -> int:
    """
    Calculate a quality score for a job based on various signals.
    
    Quality factors (0-50 points):
    - Description quality: 0-15 points
    - Source quality: 0-10 points
    - Company quality: 0-15 points
    - Recency: 0-10 points
    
    Args:
        job: Job dict
        
    Returns:
        Quality score 0-50
    """
    score = 0
    
    # 1. DESCRIPTION QUALITY (0-15 points)
    description = job.get("description", "")
    
    # Length bonus
    if len(description) > 500:
        score += 8
    elif len(description) > 300:
        score += 5
    elif len(description) < 100:
        score -= 5  # Penalty for too short
    
    # Structure bonus - has clear sections
    if any(section in description.lower() for section in ["requirements", "qualifications", "responsibilities", "benefits"]):
        score += 4
    
    # Has salary information
    if job.get("salary") or "$" in description or "salary" in description.lower():
        score += 3
    
    # Spam detection (penalty)
    desc_lower = description.lower()
    if any(spam in desc_lower for spam in SPAM_KEYWORDS):
        score -= 10
    
    # 2. SOURCE QUALITY (0-10 points)
    via = job.get("via", "").lower()
    
    if any(source in via for source in HIGH_QUALITY_SOURCES):
        score += 10
    elif any(pattern in via for pattern in ["recruiter", "staffing", "agency"]):
        score -= 5  # Penalty for generic recruiters
    else:
        score += 3  # Neutral source
    
    # 3. COMPANY QUALITY (0-15 points)
    company = job.get("company", "").lower()
    
    # Check against top company lists
    if any(top_co in company for top_co in TOP_TECH_COMPANIES):
        score += 15
    elif any(top_co in company for top_co in TOP_FINANCE_COMPANIES):
        score += 15
    elif any(top_co in company for top_co in TOP_CONSULTING_COMPANIES):
        score += 15
    elif any(f500 in company for f500 in FORTUNE_500_KEYWORDS):
        score += 12
    elif any(pattern in company for pattern in LOW_QUALITY_COMPANY_PATTERNS):
        score -= 10  # Penalty for generic/staffing companies
    else:
        score += 5  # Neutral company
    
    # 4. RECENCY (0-10 points)
    posted = job.get("posted", "").lower()
    
    try:
        if "hour" in posted or "just" in posted or "today" in posted:
            score += 10  # Very fresh
        elif "day" in posted:
            days = int(''.join(filter(str.isdigit, posted.split("day")[0])) or "0")
            if days <= 3:
                score += 10
            elif days <= 7:
                score += 8
            elif days <= 14:
                score += 5
            else:
                score += 2
        elif "week" in posted:
            weeks = int(''.join(filter(str.isdigit, posted.split("week")[0])) or "0")
            if weeks <= 2:
                score += 5
            else:
                score += 1
        elif "month" in posted:
            score -= 3  # Old posting penalty
    except (ValueError, IndexError):
        score += 3  # Unknown recency, neutral
    
    return max(0, min(50, score))


def _parse_job_age_days(job: dict) -> Optional[int]:
    """
    Parse the job's posted date and return age in days.
    
    Args:
        job: Job dict with 'posted' field
        
    Returns:
        Age in days, or None if cannot be parsed
    """
    posted = job.get("posted", "").lower()
    if not posted:
        return None
    
    try:
        if "hour" in posted or "just" in posted or "today" in posted:
            return 0
        elif "day" in posted:
            days_str = ''.join(filter(str.isdigit, posted.split("day")[0]))
            days = int(days_str) if days_str else 0
            return days
        elif "week" in posted:
            weeks_str = ''.join(filter(str.isdigit, posted.split("week")[0]))
            weeks = int(weeks_str) if weeks_str else 0
            return weeks * 7
        elif "month" in posted:
            months_str = ''.join(filter(str.isdigit, posted.split("month")[0]))
            months = int(months_str) if months_str else 0
            return months * 30
        else:
            return None
    except (ValueError, IndexError):
        return None


def is_job_quality_acceptable(job: dict, min_quality_score: int = 0) -> bool:
    """
    Check if a job meets minimum quality standards.
    
    Args:
        job: Job dict
        min_quality_score: Minimum quality score threshold
        
    Returns:
        True if job is acceptable, False if it should be filtered out
    """
    company = job.get("company", "").lower()
    description = job.get("description", "")
    
    # Hard filters - always exclude these
    
    # 1. Generic/placeholder company names
    if company in ["company", "employer", "organization", "confidential", ""]:
        return False
    
    # 2. Low-quality company patterns
    if any(pattern in company for pattern in LOW_QUALITY_COMPANY_PATTERNS):
        # Allow if description is high quality (might be legit staffing for good company)
        if len(description) < 300:
            return False
    
    # 3. Too short descriptions
    if len(description) < 50:
        return False
    
    # 4. Spam keywords
    desc_lower = description.lower()
    if any(spam in desc_lower for spam in SPAM_KEYWORDS):
        return False
    
    # 5. Recency filter - remove jobs older than MAX_JOB_AGE_DAYS
    job_age_days = _parse_job_age_days(job)
    if job_age_days is not None and job_age_days > MAX_JOB_AGE_DAYS:
        return False
    
    # 6. Quality score threshold
    if min_quality_score > 0:
        quality_score = calculate_quality_score(job)
        if quality_score < min_quality_score:
            return False
    
    return True


def filter_jobs_by_quality(jobs: List[dict], min_quality_score: int = MIN_QUALITY_SCORE) -> List[dict]:
    """
    Filter out low-quality jobs.
    
    Args:
        jobs: List of job dicts
        min_quality_score: Minimum quality score to keep (default 10)
        
    Returns:
        Filtered list of jobs
    """
    filtered = []
    removed_count = 0
    removed_for_recency = 0
    
    for job in jobs:
        # Check recency separately for logging
        job_age_days = _parse_job_age_days(job)
        if job_age_days is not None and job_age_days > MAX_JOB_AGE_DAYS:
            removed_count += 1
            removed_for_recency += 1
            continue
        
        if is_job_quality_acceptable(job, min_quality_score):
            filtered.append(job)
        else:
            removed_count += 1
    
    if removed_count > 0:
        print(f"[JobBoard] Filtered out {removed_count} low-quality jobs (recency: {removed_for_recency}, quality: {removed_count - removed_for_recency})")
    
    return filtered


def score_jobs_by_resume_match(jobs: List[dict], user_profile: dict, query_weights: dict = None) -> List[dict]:
    """
    Score and rank all jobs based on user profile match AND quality.
    
    Combined scoring:
    - Resume Match Score: 0-100 (how well job matches user's profile)
    - Quality Score: 0-50 (job posting quality signals)
    - Final Score: Weighted combination with match prioritized
    
    Args:
        jobs: List of job dicts
        user_profile: User's career profile
        query_weights: Optional dict mapping job_id to query weight
        
    Returns:
        List of jobs with matchScore and qualityScore added, sorted by combined score descending
    """
    # Check if profile is empty or has no meaningful data
    has_profile_data = (
        user_profile and 
        (
            user_profile.get("major") or
            user_profile.get("skills") or
            user_profile.get("extracurriculars") or
            user_profile.get("experiences") or
            user_profile.get("interests") or
            user_profile.get("target_industries")
        )
    )
    
    if not has_profile_data:
        # No profile or empty profile, assign neutral match scores but still calculate quality
        print("[JobBoard] No user profile data found, using neutral scores")
        for job in jobs:
            job["matchScore"] = 50
            job["qualityScore"] = calculate_quality_score(job)
            job["combinedScore"] = 50 + (job["qualityScore"] * 0.5)  # Quality as tiebreaker
        jobs.sort(key=lambda x: x.get("combinedScore", 0), reverse=True)
        return jobs
    
    query_weights = query_weights or {}
    
    for job in jobs:
        weight = query_weights.get(job.get("id"), 1.0)
        
        # Calculate both scores
        match_score = score_job_for_user(job, user_profile, weight)
        quality_score = calculate_quality_score(job)
        
        # Combined score: 70% match, 30% quality
        # This prioritizes relevance while still surfacing higher quality jobs
        combined_score = (match_score * 0.7) + (quality_score * 0.6)
        
        job["matchScore"] = match_score
        job["qualityScore"] = quality_score
        job["combinedScore"] = round(combined_score, 1)
    
    # Sort by combined score descending
    jobs.sort(key=lambda x: x.get("combinedScore", 0), reverse=True)
    
    return jobs


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
    Optimized: Removed verbose logging to improve performance.
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
                return str(obj.path)
            elif hasattr(obj, 'id'):
                return str(obj.id)
            else:
                return str(obj)
        except Exception as e:
            # Only log actual errors, not normal conversions
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

def extract_relevant_resume_data_for_cover_letter(resume: Dict[str, Any], max_length_per_field: int = 500) -> Dict[str, Any]:
    """
    Extract only relevant resume sections for cover letter generation.
    This significantly reduces prompt size and improves generation speed.
    
    Args:
        resume: Full resume dictionary
        max_length_per_field: Maximum characters for text fields
        
    Returns:
        Optimized resume dictionary with only relevant sections
    """
    if not isinstance(resume, dict):
        return {}
    
    relevant = {}
    
    # Always include name
    if resume.get("name"):
        relevant["name"] = str(resume["name"])
    
    # Extract top education entries (max 2)
    if resume.get("education"):
        education = resume["education"]
        if isinstance(education, list):
            relevant["education"] = education[:2]
        elif isinstance(education, dict):
            # Handle single education dict
            edu_copy = education.copy()
            if "coursework" in edu_copy and isinstance(edu_copy["coursework"], list):
                edu_copy["coursework"] = edu_copy["coursework"][:10]  # Limit coursework
            relevant["education"] = [edu_copy]
    
    # Extract top experiences (max 5)
    if resume.get("experience"):
        experience = resume.get("experience", [])
        if isinstance(experience, list):
            cleaned_experience = []
            for exp in experience[:5]:
                if isinstance(exp, dict):
                    exp_copy = exp.copy()
                    # Truncate long descriptions
                    if "description" in exp_copy:
                        desc = str(exp_copy["description"])
                        if len(desc) > max_length_per_field:
                            exp_copy["description"] = desc[:max_length_per_field] + "..."
                    if "bullets" in exp_copy and isinstance(exp_copy["bullets"], list):
                        # Limit bullets per experience
                        exp_copy["bullets"] = exp_copy["bullets"][:8]
                    cleaned_experience.append(exp_copy)
            relevant["experience"] = cleaned_experience
    
    # Extract top projects (max 3)
    if resume.get("projects"):
        projects = resume.get("projects", [])
        if isinstance(projects, list):
            cleaned_projects = []
            for proj in projects[:3]:
                if isinstance(proj, dict):
                    proj_copy = proj.copy()
                    if "description" in proj_copy:
                        desc = str(proj_copy["description"])
                        if len(desc) > max_length_per_field:
                            proj_copy["description"] = desc[:max_length_per_field] + "..."
                    cleaned_projects.append(proj_copy)
            relevant["projects"] = cleaned_projects
    
    # Extract skills (limit to top 20-25 skills total)
    if resume.get("skills"):
        skills = resume.get("skills", {})
        if isinstance(skills, dict):
            cleaned_skills = {}
            for skill_category, skill_list in skills.items():
                if isinstance(skill_list, list):
                    cleaned_skills[skill_category] = skill_list[:15]  # Limit per category
            relevant["skills"] = cleaned_skills
        elif isinstance(skills, list):
            relevant["skills"] = {"all": skills[:25]}
    
    # Extract summary/objective (truncate)
    if resume.get("summary"):
        summary = str(resume["summary"])
        relevant["summary"] = summary[:max_length_per_field] + "..." if len(summary) > max_length_per_field else summary
    
    if resume.get("objective"):
        objective = str(resume["objective"])
        relevant["objective"] = objective[:max_length_per_field] + "..." if len(objective) > max_length_per_field else objective
    
    # Extract contact info (minimal)
    if resume.get("contact"):
        contact = resume.get("contact", {})
        if isinstance(contact, dict):
            relevant["contact"] = {
                "email": contact.get("email"),
                "location": contact.get("location")
            }
    
    return {k: v for k, v in relevant.items() if v}  # Remove empty values


def get_or_cache_sanitized_resume(user_id: str, raw_resume: Dict[str, Any], db) -> Optional[str]:
    """
    Get sanitized resume from cache or generate and cache it.
    This avoids repeated expensive sanitization operations.
    
    Args:
        user_id: User ID
        raw_resume: Raw resume dictionary from Firestore
        db: Firestore database instance
        
    Returns:
        JSON string of sanitized resume, or None if caching disabled
    """
    try:
        user_ref = db.collection("users").document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return None
        
        user_data = user_doc.to_dict()
        
        # Generate hash of raw resume for cache validation
        resume_json_str = json.dumps(raw_resume, sort_keys=True, default=str)
        resume_hash = hashlib.md5(resume_json_str.encode()).hexdigest()
        
        # Check if we have cached sanitized resume with matching hash
        cached = user_data.get("resumeParsedSanitized")
        cached_hash = user_data.get("resumeParsedHash")
        
        if cached and cached_hash == resume_hash and isinstance(cached, str):
            print(f"[JobBoard] ✅ Using cached sanitized resume (hash: {resume_hash[:8]}...)")
            return cached
        
        # Generate and cache sanitized resume
        print(f"[JobBoard] Generating new sanitized resume (hash: {resume_hash[:8]}...)")
        sanitized = sanitize_firestore_data(raw_resume, depth=0, max_depth=20)
        
        # Custom JSON encoder that handles DocumentReferences
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
        
        resume_json = json.dumps(sanitized, default=json_default, ensure_ascii=False)
        
        # Cache the result
        try:
            user_ref.update({
                "resumeParsedSanitized": resume_json,
                "resumeParsedHash": resume_hash
            })
            print(f"[JobBoard] ✅ Cached sanitized resume")
        except Exception as cache_error:
            print(f"[JobBoard] ⚠️ Failed to cache sanitized resume: {cache_error}")
            # Continue anyway, just return the JSON
        
        return resume_json
        
    except Exception as e:
        print(f"[JobBoard] Error in get_or_cache_sanitized_resume: {e}")
        return None


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
            
        # Apple jobs parsing
        elif "jobs.apple.com" in url:
            print(f"[JobBoard] Parsing Apple jobs URL: {url}")
            # Apple typically has the title in h1 or title tag
            title_elem = soup.find("h1") or soup.find("title")
            if title_elem:
                title_text = title_elem.get_text(strip=True)
                # Clean up title (remove " - Jobs - Careers at Apple" suffix)
                if " - " in title_text:
                    title_text = title_text.split(" - ")[0]
                job_data["title"] = title_text[:200]
                print(f"[JobBoard] Found Apple title: {job_data['title']}")
            
            # Company is always Apple for jobs.apple.com
            job_data["company"] = "Apple"
            print(f"[JobBoard] Set company to Apple")
            
            # Try to find description
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
                    if desc_text and len(desc_text) > 50:
                        if "lorem ipsum" not in desc_text.lower()[:200]:
                            job_data["description"] = desc_text[:5000]
                            print(f"[JobBoard] Found Apple description: {len(job_data['description'])} chars")
                            break
        
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
            
            # If company not found via selectors, try extracting from title
            if not job_data["company"] and job_data["title"]:
                title = job_data["title"]
                # Pattern 1: "Careers at [Company]" or "Jobs at [Company]"
                match = re.search(r'(?:Careers|Jobs)\s+at\s+([A-Za-z0-9\s&\.]+?)(?:\s*[-–—]|\s*\||\s*$)', title, re.IGNORECASE)
                if match:
                    company = match.group(1).strip()
                    # Clean up common suffixes
                    company = re.sub(r'\s*(Jobs|Careers|Internships).*$', '', company, flags=re.IGNORECASE)
                    if len(company) > 1 and len(company) < 100:
                        job_data["company"] = company
                        print(f"[JobBoard] Extracted company from title (pattern 1): {job_data['company']}")
                
                # Pattern 2: "[Company] Careers" or "[Company] Jobs"
                if not job_data["company"]:
                    match = re.search(r'^([A-Za-z0-9\s&\.]+?)\s+(?:Careers|Jobs|Internships)', title, re.IGNORECASE)
                    if match:
                        company = match.group(1).strip()
                        if len(company) > 1 and len(company) < 100:
                            job_data["company"] = company
                            print(f"[JobBoard] Extracted company from title (pattern 2): {job_data['company']}")
                
                # Pattern 3: "Title - Company" (if title ends with company name)
                if not job_data["company"] and " - " in title:
                    parts = title.split(" - ")
                    if len(parts) >= 2:
                        # Check if last part looks like a company name (not a location)
                        last_part = parts[-1].strip()
                        # If it doesn't look like a location (no commas, not too long), treat as company
                        if "," not in last_part and len(last_part) < 50 and not any(word in last_part.lower() for word in ["jobs", "careers", "internships", "view", "apply"]):
                            job_data["company"] = last_part
                            print(f"[JobBoard] Extracted company from title suffix: {job_data['company']}")
            
            # If still no company, try extracting from URL domain
            # Only do this for direct company career pages, not job boards
            if not job_data["company"]:
                try:
                    parsed_url = urlparse(url)
                    domain = parsed_url.netloc.lower()
                    
                    # Skip job board sites - they're not company career pages
                    job_board_domains = [
                        "linkedin.com", "indeed.com", "glassdoor.com", "monster.com",
                        "ziprecruiter.com", "simplyhired.com", "careerbuilder.com",
                        "bebee.com", "dice.com", "stackoverflow.com", "github.com"
                    ]
                    is_job_board = any(jb in domain for jb in job_board_domains)
                    
                    if not is_job_board and domain:
                        # Remove common prefixes
                        domain = domain.replace("www.", "").replace("jobs.", "").replace("careers.", "")
                        # Get the main domain part (before first dot)
                        domain_parts = domain.split(".")
                        if domain_parts:
                            main_domain = domain_parts[0]
                            # Capitalize first letter
                            if main_domain and len(main_domain) > 2:
                                company = main_domain.capitalize()
                                # Handle multi-word domains (e.g., "apple-com" -> "Apple Com" -> "Apple Com")
                                company = company.replace("-", " ").title()
                                # Handle common patterns
                                company = company.replace(" Com", "").replace(" Inc", "").replace(" Corp", "")
                                job_data["company"] = company
                                print(f"[JobBoard] Extracted company from URL domain: {job_data['company']}")
                except Exception as e:
                    print(f"[JobBoard] Error extracting company from URL: {e}")
                    
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
    
    # Build prompt with strict rules to prevent fabrication
    try:
        RESUME_OPTIMIZATION_PROMPT = """You are an expert resume optimizer. Your task is to enhance a resume for a specific job while following STRICT rules.

## ABSOLUTE RULES (NEVER VIOLATE)

### Rule 1: NEVER FABRICATE
- NEVER change degree types (Bachelor's stays Bachelor's, not Master's)
- NEVER change or invent dates
- NEVER change company names or job titles
- NEVER add skills, certifications, or experiences the candidate doesn't have
- NEVER guess or fill in missing information
- If something is unclear, keep it exactly as-is

### Rule 2: PRESERVE ALL CONTENT
- Keep ALL sections from the original resume (Education, Experience, Projects, Skills, etc.)
- Keep ALL bullet points — you may reword them but never delete them
- Keep ALL projects listed — these demonstrate technical ability
- Keep ALL skills listed — you may reorder by relevance but never remove
- Keep coursework if present — it shows relevant knowledge

### Rule 3: PRESERVE ALL FACTS
These must remain EXACTLY as in the original:
- Degree type and major (e.g., "Bachelor of Science in Data Science and Economics")
- University name
- Graduation date/expected graduation
- Company names (e.g., "Offerloop.ai" not "AI-powered platform")
- Job titles (e.g., "Student IT Assistant" not "Technical Support Specialist")
- Employment dates (e.g., "March 2024 – May 2025" not "2019-2020")
- Locations
- Quantified achievements (e.g., "100 students" stays "100 students")

### Rule 4: WHAT YOU CAN CHANGE
- Reword bullet points for stronger impact (stronger verbs, clearer outcomes)
- Reorder bullet points to prioritize most relevant ones first
- Reorder skills to put job-relevant skills first
- Add job-relevant keywords INTO existing bullet points where they fit naturally
- Improve action verbs (e.g., "helped with" → "supported", "did" → "executed")
- Make quantified impacts more prominent
- Tighten verbose language

### Rule 5: KEYWORD INTEGRATION
- Review the job keywords provided
- Insert keywords ONLY into existing content where they make sense
- DO NOT add keywords as standalone items if the candidate doesn't have that experience
- Example GOOD: Original "Built data pipelines" → Enhanced "Built ETL data pipelines using Python"
  (if candidate knows Python and job mentions ETL)
- Example BAD: Adding "Kubernetes" when candidate has no container experience

---

## JOB DETAILS

**Target Position:** {job_title}
**Company:** {company}
**Job Description:**
{job_description}

**Key Keywords to Consider (only use where naturally applicable):**
{keywords_list}

---

## ORIGINAL RESUME DATA

{resume_json}

---

## YOUR TASK

1. Read the original resume carefully
2. Identify which experiences and skills are most relevant to the target job
3. Enhance bullet points with stronger language and relevant keywords
4. Reorder content to prioritize relevance (most relevant first)
5. Return the optimized resume in the exact JSON format specified below

## OUTPUT FORMAT

Return ONLY valid JSON in this exact structure:

{{
  "optimized_content": "Full optimized resume text with clear sections (Summary, Experience, Education, Skills). ALL original content must be preserved - only enhanced wording.",
  "relevance_score": 0-100,
  "keywords_added": ["list of keywords you successfully integrated into existing content"],
  "important_keywords_missing": ["list of job keywords that didn't fit candidate's actual experience"],
  "sections_optimized": ["list of sections you improved"],
  "suggestions": ["specific, actionable suggestions for the candidate to genuinely improve their resume"],
  "warnings": ["any concerns, e.g., 'Candidate lacks X skill mentioned in job requirements'"]
}}

Note: "relevance_score" should reflect how well the candidate's actual experience aligns with the role requirements. Consider: relevant job titles, industry experience, years of experience match, responsibility level match. This is a nuanced judgment about how well their background fits the role (not just keyword matching - that's handled separately).

## FINAL CHECKLIST (Verify before responding)

- [ ] All dates match the original exactly
- [ ] All company names match the original exactly  
- [ ] All job titles match the original exactly
- [ ] Degree type matches the original exactly (Bachelor's/Master's/etc.)
- [ ] All projects from original are included
- [ ] All skills from original are included (none removed)
- [ ] All bullet points from original are included (none deleted)
- [ ] No skills or experiences were invented
- [ ] Keywords were only added where they fit existing experience"""

        prompt = RESUME_OPTIMIZATION_PROMPT.format(
            job_title=job_title_safe,
            company=company_safe,
            job_description=job_desc_safe,
            keywords_list=keywords_str,
            resume_json=resume_json
        )
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
        system_content = """You are a resume optimization expert. You MUST follow all rules exactly.
Your primary directive is to ENHANCE the resume without CHANGING any facts.
Never fabricate, never delete content, never change dates/titles/companies/degrees.
If you're unsure about something, keep it exactly as-is.
Return ONLY valid JSON. Do not include explanations or markdown."""
        user_content = str(prompt)  # Force to string
        
        print(f"[JobBoard] System content type: {type(system_content)}")
        print(f"[JobBoard] User content type: {type(user_content)}")
        
        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content}
        ]
        
        print(f"[JobBoard] Messages list created. About to call API...")
        print(f"[JobBoard] Model: gpt-4o, Max tokens: 3500")
        
        # Retry configuration - increased timeouts for large prompts
        max_retries = 2
        base_timeout = 180.0  # 3 minutes per attempt (increased from 120s)
        
        # For long-running requests, create a fresh client to avoid connection pool issues
        from app.services.openai_client import create_async_openai_client
        openai_client = create_async_openai_client()
        if not openai_client:
            raise Exception("OpenAI client not available")
        
        last_error = None
        for retry_attempt in range(max_retries):
            timeout = base_timeout + (retry_attempt * 60.0)  # Increase by 60s for retries (was 30s)
            print(f"[JobBoard] Attempt {retry_attempt + 1}/{max_retries} with {timeout}s timeout...")
            
            try:
                # Create the API call with increased timeout
                # Note: The timeout parameter controls the HTTP client timeout
                api_call = openai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    temperature=0.7,
                    max_tokens=3500,
                    timeout=timeout,  # HTTP client timeout
                )
                
                # Wait for response with additional buffer for connection pool
                # Add extra buffer for connection acquisition and processing
                response = await asyncio.wait_for(api_call, timeout=timeout + 60.0)  # Increased buffer to 60s for connection pool
                print(f"[JobBoard] ✅ OpenAI API call completed successfully (attempt {retry_attempt + 1})")
                last_error = None
                break  # Success, exit retry loop
                
            except asyncio.TimeoutError:
                last_error = TimeoutError(f"OpenAI API call timed out after {timeout} seconds (attempt {retry_attempt + 1}/{max_retries})")
                print(f"[JobBoard] ❌ {last_error}")
                if retry_attempt == max_retries - 1:
                    # Last attempt failed
                    import traceback
                    traceback.print_exc()
                    raise Exception("Resume optimization timed out after multiple attempts. Please try again or contact support if the issue persists.")
                # Wait before retry
                await asyncio.sleep(2.0)
                
            except Exception as api_error:
                last_error = api_error
                print(f"[JobBoard] ❌ API call failed (attempt {retry_attempt + 1}/{max_retries}): {api_error}")
                print(f"[JobBoard] Error type: {type(api_error)}")
                if retry_attempt == max_retries - 1:
                    # Last attempt failed
                    import traceback
                    traceback.print_exc()
                    raise
                # Wait before retry
                await asyncio.sleep(2.0)
        
        # If we exited the loop without success
        if last_error:
            raise last_error
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
        
        # Get AI relevance score (now the only score from AI)
        ai_relevance_score = int(result.get("relevance_score", 75))
        print(f"[JobBoard] AI relevance score: {ai_relevance_score}")
        
        # Get the optimized resume content as text
        optimized_content = str(result.get("optimized_content", ""))
        
        # Calculate programmatic ATS scores
        print("[JobBoard] Calculating programmatic ATS scores...")
        try:
            ats_result = calculate_ats_score(
                resume_text=optimized_content,
                job_description=job_desc_safe,
                ai_relevance_score=ai_relevance_score
            )
            print(f"[JobBoard] ✅ ATS scores calculated: overall={ats_result['overall']}, keywords={ats_result['keywords']}, formatting={ats_result['formatting']}, relevance={ats_result['relevance']}")
        except Exception as ats_error:
            print(f"[JobBoard] ERROR calculating ATS scores: {ats_error}")
            import traceback
            traceback.print_exc()
            # Fallback to defaults if calculation fails
            ats_result = {
                "overall": 75,
                "keywords": 70,
                "formatting": 85,
                "relevance": ai_relevance_score,
                "details": {
                    "matched_keywords": [],
                    "missing_keywords": [],
                    "formatting_checks": {},
                    "formatting_issues": [],
                    "suggestions": ["Could not calculate detailed scores"]
                }
            }
        
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
        warnings = safe_string_list(result.get("warnings", []))
        
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
        print(f"[JobBoard] Warnings count: {len(warnings)}")
        print(f"[JobBoard] Confidence level: {confidence_level}")
        
        # Include structured resume data for PDF generation
        # The optimized resume should maintain the same structure as the original
        structured_resume = None
        if isinstance(user_resume, dict):
            # Create a copy of the structured resume data
            # This will be used by the frontend PDF generator
            structured_resume = {
                "name": user_resume.get("name", ""),
                "contact": user_resume.get("contact") or user_resume.get("Contact") or {},
                "Summary": user_resume.get("summary") or user_resume.get("Summary") or user_resume.get("objective") or user_resume.get("Objective") or "",
                "Experience": user_resume.get("experience") or user_resume.get("Experience") or [],
                "Education": user_resume.get("education") or user_resume.get("Education") or None,
                "Skills": user_resume.get("skills") or user_resume.get("Skills") or None,
                "Projects": user_resume.get("projects") or user_resume.get("Projects") or [],
                "Extracurriculars": user_resume.get("extracurriculars") or user_resume.get("Extracurriculars") or [],
            }
            # Clean up empty contact object
            if structured_resume["contact"] and not any(structured_resume["contact"].values()):
                structured_resume["contact"] = {}
        
        # Combine AI suggestions with ATS scorer suggestions
        all_suggestions = suggestions.copy()
        if ats_result.get("details", {}).get("suggestions"):
            # Add ATS scorer suggestions, avoiding duplicates
            for ats_suggestion in ats_result["details"]["suggestions"]:
                if ats_suggestion not in all_suggestions:
                    all_suggestions.append(ats_suggestion)
        
        # Use missing keywords from ATS scorer (more accurate)
        missing_keywords_from_scorer = ats_result.get("details", {}).get("missing_keywords", [])
        # Combine with AI's important_keywords_missing, avoiding duplicates
        all_missing_keywords = list(set(important_keywords_missing + missing_keywords_from_scorer))
        
        return_dict = {
            "content": optimized_content,
            "structured": structured_resume,  # Add structured data for PDF generation
            "atsScore": {
                "overall": ats_result["overall"],
                "keywords": ats_result["keywords"],
                "formatting": ats_result["formatting"],
                "relevance": ats_result["relevance"],
                "suggestions": all_suggestions[:15],  # Limit to 15 suggestions total
                "jdQualityWarning": ats_result["details"].get("jd_quality_warning"),  # JD quality warning
                "technicalKeywordsInJd": ats_result["details"].get("technical_keywords_in_jd", 0),  # Count of technical keywords
            },
            "keywordsAdded": keywords_added,
            "importantKeywordsMissing": all_missing_keywords[:15],  # Limit to 15 missing keywords
            "sectionsOptimized": sections_optimized,
            "warnings": warnings,
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
    Optimized for performance: reduced retries, smaller prompts, faster generation.
    Uses gpt-4o for faster responses with optimized retry logic.
    """
    # Extract only relevant resume sections to reduce prompt size
    relevant_resume = extract_relevant_resume_data_for_cover_letter(user_resume)
    
    # Extract name for closing signature
    user_name = str(relevant_resume.get("name", "") or "")
    
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
    
    # Serialize optimized resume (no indentation for smaller size)
    try:
        resume_json = json.dumps(relevant_resume, default=json_default, ensure_ascii=False)
        # Verify it's valid JSON
        json.loads(resume_json)
        print(f"[JobBoard] ✅ Resume serialized successfully (length: {len(resume_json)} chars)")
    except Exception as e:
        print(f"[JobBoard] Error serializing resume: {e}")
        raise ValueError(f"Failed to serialize resume data: {e}")
    
    # Truncate job description to prevent overly long prompts
    job_desc_truncated = job_description[:3000] if len(job_description) > 3000 else job_description
    
    prompt = f"""You are an expert cover letter writer who creates compelling, personalized cover letters.

TASK: Write a professional cover letter for this job application.

APPLICANT'S RESUME:
{resume_json}

JOB DETAILS:
- Title: {job_title or 'Not specified'}
- Company: {company or 'Not specified'}
- Description: {job_desc_truncated}

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

    # Use fresh OpenAI client per request to avoid connection pool issues
    from app.services.openai_client import create_async_openai_client
    openai_client = create_async_openai_client()
    if not openai_client:
        raise Exception("OpenAI client not available")
    
    # Use gpt-4o for faster responses
    model = "gpt-4o"
    max_retries = 2  # Reduced from 3
    base_timeout = 45.0  # Reduced from 60s
    
    print(f"[JobBoard] Calling OpenAI API for cover letter generation...")
    print(f"[JobBoard] Model: {model}, Prompt length: {len(prompt)} chars, max_tokens: 1200")
    
    last_error = None
    for retry_attempt in range(max_retries):
        try:
            # Exponential backoff: 45s, 60s
            timeout = base_timeout + (retry_attempt * 15.0)
            
            if retry_attempt > 0:
                wait_time = 2 ** retry_attempt  # 2s, 4s
                print(f"[JobBoard] Retry attempt {retry_attempt + 1}/{max_retries} after {wait_time}s wait...")
                await asyncio.sleep(wait_time)
            
            api_call = openai_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are an expert cover letter writer. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,  # Reduced from 0.8 for slightly faster, more deterministic responses
                max_tokens=1200,  # Reduced from 2000 (cover letters are typically 400-600 words)
                timeout=timeout,
            )
            
            # Wait for response with slightly longer timeout
            response = await asyncio.wait_for(api_call, timeout=timeout + 10.0)
            print(f"[JobBoard] ✅ OpenAI API call completed for cover letter (attempt {retry_attempt + 1})")
            
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
            
        except asyncio.TimeoutError:
            last_error = TimeoutError(f"OpenAI API call timed out after {timeout} seconds (attempt {retry_attempt + 1}/{max_retries})")
            print(f"[JobBoard] ❌ {last_error}")
            if retry_attempt == max_retries - 1:
                raise last_error
        except Exception as api_err:
            last_error = api_err
            print(f"[JobBoard] ❌ OpenAI API call error (attempt {retry_attempt + 1}/{max_retries}): {api_err}")
            if retry_attempt == max_retries - 1:
                raise
    
    # Should never reach here, but just in case
    if last_error:
        raise last_error
    raise Exception("Cover letter generation failed after all retries")


# =============================================================================
# API ROUTES
# =============================================================================

def _fetch_jobs_for_query(
    query_info: dict,
    location: str,
    primary_job_type: Optional[str],
    jobs_per_query: int,
    refresh: bool
) -> tuple[List[dict], dict]:
    """
    Helper function to fetch jobs for a single query.
    Used for parallel execution.
    
    Returns:
        Tuple of (jobs list, query metadata dict)
    """
    query = query_info["query"]
    weight = query_info.get("weight", 1.0)
    source = query_info.get("source", "unknown")
    
    query_jobs = []
    current_token = None
    
    try:
        # QUICK WIN: Fetch jobs for this query (up to 20 per query, reduced from 50)
        # We'll fetch 2 pages (20 jobs) per query (reduced from 5 pages)
        for page_num in range(2):  # 2 pages = 20 jobs max (reduced from 5 pages)
            jobs_batch, next_token = fetch_jobs_from_serpapi(
                query=query,
                location=location,
                job_type=primary_job_type,
                num_results=10,  # Google Jobs returns 10 per page
                use_cache=not refresh and page_num == 0,  # Only cache first page
                page_token=current_token,
            )
            
            if not jobs_batch:
                if page_num == 0:
                    print(f"[JobBoard] No jobs found for query '{query}' on first page")
                else:
                    print(f"[JobBoard] Pagination stopped for query '{query}' at page {page_num + 1} (no more results)")
                break
            
            # Early exit if no new jobs were added (avoid wasting API calls)
            jobs_before = len(query_jobs)
            
            # Deduplicate within this query's results (local deduplication)
            seen_in_query = set()
            for job in jobs_batch:
                job_id = job.get("id")
                if job_id and job_id not in seen_in_query:
                    seen_in_query.add(job_id)
                    job["_query_weight"] = weight  # Store weight in job for later aggregation
                    job["_query_source"] = source  # Track source for debugging
                    query_jobs.append(job)
            
            # Early exit if no new jobs were added
            jobs_after = len(query_jobs)
            if jobs_after == jobs_before:
                print(f"[JobBoard] No new jobs added on page {page_num + 1} for query '{query}', stopping pagination")
                break
            
            if len(query_jobs) >= jobs_per_query:
                print(f"[JobBoard] Reached target jobs per query ({jobs_per_query}) for '{query}'")
                break
            
            if not next_token:
                print(f"[JobBoard] No more pages available for query '{query}' (no next_token)")
                break
            
            current_token = next_token
        
        query_metadata = {
            "query": query,
            "source": source,
            "jobs_found": len(query_jobs),
            "weight": weight
        }
        
        return query_jobs, query_metadata
        
    except Exception as e:
        print(f"[JobBoard] Error fetching for query '{query}': {e}")
        import traceback
        traceback.print_exc()
        return [], {
            "query": query,
            "source": source,
            "jobs_found": 0,
            "weight": weight,
            "error": str(e)
        }


def fetch_personalized_jobs(
    user_profile: dict,
    job_types: List[str],
    locations: List[str],
    max_jobs: int = 50,  # QUICK WIN: Reduced default from 150 to 50 for faster loading
    refresh: bool = False
) -> tuple[List[dict], dict]:
    """
    Fetch jobs using multiple personalized queries and merge results.
    Uses parallel execution for faster performance.
    
    Args:
        user_profile: User's career profile
        job_types: List of job types
        locations: List of preferred locations
        max_jobs: Maximum jobs to return (default 50, QUICK WIN: reduced from 150)
        refresh: Whether to bypass cache
        
    Returns:
        Tuple of (jobs list, metadata dict)
    """
    queries = build_personalized_queries(user_profile, job_types)
    location = build_location_query(locations)
    
    all_jobs = []
    seen_ids = set()
    query_weights = {}  # Track which query each job came from
    queries_used = []
    
    # QUICK WIN: Limit API calls - fetch from top 4 queries (reduced from 6)
    # This reduces API calls by ~33% while keeping the most relevant queries
    max_queries = min(4, len(queries))
    jobs_per_query = 20  # QUICK WIN: Reduced from 50 to 20 (2 pages × 10 jobs/page) per query
    
    primary_job_type = job_types[0] if job_types else None
    
    # Execute queries in parallel
    print(f"[JobBoard] Executing {max_queries} queries in parallel (QUICK WIN: reduced from 6)...")
    start_time = datetime.now()
    
    with ThreadPoolExecutor(max_workers=4) as executor:  # Reduced from 6 to match max_queries
        # Submit all queries
        future_to_query = {
            executor.submit(
                _fetch_jobs_for_query,
                query_info,
                location,
                primary_job_type,
                jobs_per_query,
                refresh
            ): query_info
            for query_info in queries[:max_queries]
        }
        
        # Collect results as they complete
        for future in as_completed(future_to_query):
            query_info = future_to_query[future]
            try:
                query_jobs, query_metadata = future.result()
                
                # Deduplicate across all queries
                for job in query_jobs:
                    job_id = job.get("id")
                    if job_id and job_id not in seen_ids:
                        seen_ids.add(job_id)
                        weight = job.pop("_query_weight", query_info.get("weight", 1.0))
                        query_weights[job_id] = weight
                        all_jobs.append(job)
                
                queries_used.append(query_metadata)
                
                # Stop if we have enough jobs
                if len(all_jobs) >= max_jobs:
                    print(f"[JobBoard] Reached max_jobs ({max_jobs}), stopping query execution")
                    # Cancel remaining futures (they'll complete but we won't process results)
                    break
                    
            except Exception as e:
                print(f"[JobBoard] Query '{query_info.get('query', 'unknown')}' failed: {e}")
                queries_used.append({
                    "query": query_info.get("query", "unknown"),
                    "source": query_info.get("source", "unknown"),
                    "jobs_found": 0,
                    "error": str(e)
                })
    
    elapsed_time = (datetime.now() - start_time).total_seconds()
    print(f"[JobBoard] Parallel query execution completed in {elapsed_time:.2f} seconds")
    
    # Filter out low-quality jobs BEFORE scoring
    filtered_jobs = filter_jobs_by_quality(all_jobs, min_quality_score=MIN_QUALITY_SCORE)
    
    # Score remaining jobs (match + quality scoring)
    scored_jobs = score_jobs_by_resume_match(filtered_jobs, user_profile, query_weights)
    
    # Return top jobs
    metadata = {
        "queries_used": queries_used,
        "total_fetched": len(all_jobs),
        "total_after_filter": len(filtered_jobs),
        "filtered_out": len(all_jobs) - len(filtered_jobs),
        "location": location
    }
    
    return scored_jobs[:max_jobs], metadata


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
        
        # Get comprehensive user profile
        user_profile = get_user_career_profile(user_id)
        
        # Debug: Log profile data (without sensitive info)
        major_value = user_profile.get('major', '')
        print(f"[JobBoard] User profile summary: major={bool(major_value)} ({major_value}), "
              f"skills={len(user_profile.get('skills', []))}, "
              f"extracurriculars={len(user_profile.get('extracurriculars', []))}, "
              f"experiences={len(user_profile.get('experiences', []))}")
        
        # Add request params to profile
        user_profile["target_industries"] = industries or user_profile.get("target_industries", [])
        user_profile["job_types"] = job_types
        
        # QUICK WIN: Fetch personalized jobs using multi-query approach
        # Reduced from 150 to 50 jobs for faster initial load (enough for 2-3 pages)
        if page == 1:
            jobs, metadata = fetch_personalized_jobs(
                user_profile=user_profile,
                job_types=job_types,
                locations=locations,
                max_jobs=50,  # QUICK WIN: Reduced from 150 to 50 jobs for faster loading
                refresh=refresh
            )
        else:
            # For subsequent pages, use simpler single-query approach with pagination
            # (For now, we'll return empty for page > 1 - can be enhanced later)
            # TODO: Implement pagination for multi-query results
            jobs = []
            metadata = {"queries_used": [], "total_fetched": 0, "location": build_location_query(locations)}
        
        # Paginate results
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_jobs = jobs[start_idx:end_idx]
        
        # Fallback to mock data if needed
        if not paginated_jobs:
            print("[JobBoard] Falling back to mock data")
            paginated_jobs = get_mock_jobs(job_types, industries, locations)
            source = "demo"
        else:
            source = "serpapi"
        
        # Determine if there are more jobs available
        has_more = end_idx < len(jobs)
        
        # Estimate total
        estimated_total = len(jobs)
        
        # Get primary query for display
        primary_query = ""
        if metadata.get("queries_used"):
            primary_query = metadata["queries_used"][0].get("query", "")
        elif search_query:
            primary_query = search_query
        
        location = metadata.get("location", build_location_query(locations))
        
        # Quality filter toggle (default to True)
        quality_filter = data.get("qualityFilter", True)
        
        print(f"[JobBoard] Returning {len(paginated_jobs)} jobs, hasMore={has_more}, estimatedTotal={estimated_total}")
        
        return jsonify({
            "jobs": paginated_jobs,
            "total": len(jobs),
            "estimatedTotal": estimated_total,
            "page": page,
            "perPage": per_page,
            "hasMore": has_more,
            "source": source,
            "query": primary_query,
            "location": location,
            "cached": source == "serpapi" and not refresh,
            "quality": {
                "filtered_out": metadata.get("filtered_out", 0),
                "filter_enabled": quality_filter
            },
            "personalization": {
                "major": user_profile.get("major"),
                "skills_used": len(user_profile.get("skills", [])),
                "ec_signals": len(extract_career_signals(user_profile.get("extracurriculars", []))),
                "queries_used": len(metadata.get("queries_used", []))
            }
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
    Cost: 20 credits (refunded on failure)
    """
    stages = {}
    start_time = time.time()
    
    try:
        data = request.get_json(force=True, silent=True) or {}
        user_id = request.firebase_user.get('uid')
        
        job_url = data.get("jobUrl")
        job_description = data.get("jobDescription", "")
        job_title = data.get("jobTitle", "")
        company = data.get("company", "")
        
        # Stage 1: Validate inputs and check database
        stages['validate'] = {'start': time.time()}
        db = get_db()
        if not db:
            return jsonify({
                "error": True,
                "error_code": "database_error",
                "message": ERROR_MESSAGES.get("database_error", "Database not available"),
                "credits_refunded": False
            }), 500
            
        user_ref = db.collection("users").document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({
                "error": True,
                "error_code": "user_not_found",
                "message": "User not found",
                "credits_refunded": False
            }), 404
        
        # Validate job description input
        if not job_url and not job_description:
            stages['validate']['end'] = time.time()
            return jsonify({
                "error": True,
                "error_code": "invalid_job_description",
                "message": ERROR_MESSAGES.get("invalid_job_description"),
                "credits_refunded": False
            }), get_status_code("invalid_job_description")
        
        if job_description and len(job_description.strip()) < 50:
            stages['validate']['end'] = time.time()
            return jsonify({
                "error": True,
                "error_code": "invalid_job_description",
                "message": ERROR_MESSAGES.get("invalid_job_description"),
                "credits_refunded": False
            }), get_status_code("invalid_job_description")
        
        user_data = user_doc.to_dict()
        # Sanitize user_data before using it - it might contain DocumentReferences
        print(f"[JobBoard] Sanitizing user_data before credit check...")
        user_data = sanitize_firestore_data(user_data, depth=0, max_depth=20)
        current_credits = check_and_reset_credits(user_ref, user_data)
        stages['validate']['end'] = time.time()
        
        # Check credits first
        if current_credits < OPTIMIZATION_CREDIT_COST:
            return jsonify({
                "error": True,
                "error_code": "credits_insufficient",
                "message": ERROR_MESSAGES.get("credits_insufficient"),
                "required": OPTIMIZATION_CREDIT_COST,
                "current": current_credits,
                "credits_refunded": False
            }), get_status_code("credits_insufficient")
        
        # Deduct credits BEFORE doing the expensive optimization
        # This prevents negative balances and ensures we have credits before proceeding
        print(f"[JobBoard] Deducting credits before optimization...")
        print(f"[JobBoard] Current credits: {current_credits}, Required: {OPTIMIZATION_CREDIT_COST}")
        success, new_credits = deduct_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization")
        
        if not success:
            # Deduction failed (likely insufficient credits due to race condition)
            return jsonify({
                "error": True,
                "error_code": "credits_insufficient",
                "message": ERROR_MESSAGES.get("credits_insufficient"),
                "current": new_credits,
                "required": OPTIMIZATION_CREDIT_COST,
                "credits_refunded": False
            }), get_status_code("credits_insufficient")
        
        print(f"[JobBoard] Credits deducted successfully. New balance: {new_credits}")
        
        # Stage 2: Parse job URL (if provided)
        stages['parse_job'] = {'start': time.time()}
        if job_url:
            print(f"[JobBoard] Parsing job URL: {job_url}")
            try:
                parsed_job = parse_job_url(job_url)
                if parsed_job:
                    # Parsing succeeded - use title/company from URL if available
                    if parsed_job.get("title"):
                        job_title = parsed_job.get("title")
                        print(f"[JobBoard] Parsed title from URL: {job_title}")
                    if parsed_job.get("company"):
                        company = parsed_job.get("company")
                        print(f"[JobBoard] Parsed company from URL: {company}")
                    # Use description from URL if available and valid, otherwise keep manually pasted one
                    if parsed_job.get("description") and len(parsed_job.get("description", "").strip()) >= 50:
                        job_description = parsed_job.get("description")
                        print(f"[JobBoard] Using description from URL ({len(job_description)} chars)")
                    else:
                        print(f"[JobBoard] URL parsing didn't provide a valid description, will use manually pasted description if available")
                else:
                    print(f"[JobBoard] URL parsing returned None, will use manually pasted description if available")
            except Exception as url_error:
                print(f"[JobBoard] Error parsing URL (non-fatal): {url_error}")
                # Don't fail here - continue to use manually pasted description if available
                import traceback
                traceback.print_exc()
        
        stages['parse_job']['end'] = time.time()
        
        # Validate job description - must have either from URL or manually pasted
        if not job_description or len(job_description.strip()) < 50:
            refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_refund")
            print(f"[JobBoard] Refunded credits due to invalid/missing job description: {refund_success}")
            return jsonify({
                "error": True,
                "error_code": "invalid_job_description",
                "message": ERROR_MESSAGES.get("invalid_job_description"),
                "credits_refunded": True
            }), get_status_code("invalid_job_description")
        
        # Stage 3: Retrieve resume
        stages['retrieve_resume'] = {'start': time.time()}
        raw_resume = user_data.get("resumeParsed", {})
        if not raw_resume:
            stages['retrieve_resume']['end'] = time.time()
            refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_refund")
            print(f"[JobBoard] Refunded credits due to missing resume: {refund_success}")
            return jsonify({
                "error": True,
                "error_code": "resume_not_found",
                "message": ERROR_MESSAGES.get("resume_not_found"),
                "credits_refunded": True
            }), get_status_code("resume_not_found")
        
        # Deep sanitization - run multiple times to catch nested references
        print(f"[JobBoard] Starting sanitization of resume data. Type: {type(raw_resume)}")
        user_resume = raw_resume
        for i in range(3):  # Multiple passes
            print(f"[JobBoard] Sanitization pass {i+1}")
            user_resume = sanitize_firestore_data(user_resume, depth=0, max_depth=20)
        
        # Additional check: manually inspect and clean ALL list fields (handle both old and new formats)
        list_fields = ['experience', 'key_experiences', 'achievements', 'interests', 'skills', 'projects', 'extracurriculars', 'certifications', 'publications', 'awards', 'volunteer']
        for field_name in list_fields:
            if isinstance(user_resume, dict) and field_name in user_resume:
                field_value = user_resume.get(field_name, [])
                if isinstance(field_value, list):
                    cleaned_list = []
                    for idx, item in enumerate(field_value):
                        if item is not None:
                            cleaned_item = sanitize_firestore_data(item, depth=0, max_depth=20)
                            if isinstance(cleaned_item, dict):
                                cleaned_item = {k: sanitize_firestore_data(v, depth=0, max_depth=20) for k, v in cleaned_item.items()}
                            if cleaned_item is not None and not is_document_reference(cleaned_item):
                                cleaned_list.append(cleaned_item)
                    user_resume[field_name] = cleaned_list
        
        def recursive_check_for_refs(obj, path="root", max_depth=5, current_depth=0):
            """Recursively check for DocumentReferences and remove them."""
            if current_depth > max_depth:
                return obj
            if is_document_reference(obj):
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
        
        user_resume = recursive_check_for_refs(user_resume, "root")
        
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
        stages['retrieve_resume']['end'] = time.time()
        
        if not user_resume:
            refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_refund")
            print(f"[JobBoard] Refunded credits due to empty resume after sanitization: {refund_success}")
            return jsonify({
                "error": True,
                "error_code": "resume_incomplete",
                "message": ERROR_MESSAGES.get("resume_incomplete"),
                "credits_refunded": True
            }), get_status_code("resume_incomplete")
        
        # Stage 4: Extract keywords
        stages['extract_keywords'] = {'start': time.time()}
        # Keywords will be extracted in optimize_resume_with_ai
        stages['extract_keywords']['end'] = time.time()
        
        # Stage 5: AI optimization (longest stage)
        stages['ai_optimization'] = {'start': time.time()}
        print(f"[JobBoard] Calling optimize_resume_with_ai...")
        try:
            async def optimize_with_timeout():
                return await optimize_resume_with_ai(user_resume, job_description, job_title, company)
                
            # Increased outer timeout to match increased API timeouts
            # Base: 180s, Retry: 240s, Buffer: 30s, so max is ~270s, use 300s for safety
            print(f"[JobBoard] Starting async optimization with 300 second timeout...")
            optimized = asyncio.run(
                asyncio.wait_for(optimize_with_timeout(), timeout=300.0)  # Increased from 190s to 300s
            )
            print(f"[JobBoard] ✅ AI function returned successfully")
            stages['ai_optimization']['end'] = time.time()
                
            
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
                # Refund credits on JSON serialization error
                refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_refund")
                print(f"[JobBoard] Refunded credits due to JSON serialization error: {refund_success}")
                return jsonify({
                    "error": True,
                    "error_code": "json_parse_error",
                    "message": ERROR_MESSAGES.get("json_parse_error"),
                    "credits_refunded": True
                }), get_status_code("json_parse_error")
            
        except asyncio.TimeoutError:
            print(f"[JobBoard] ❌ Resume optimization timed out after 130 seconds")
            import traceback
            traceback.print_exc()
            stages['ai_optimization']['end'] = time.time()
            refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_refund")
            print(f"[JobBoard] Refunded credits due to timeout: {refund_success}")
            return jsonify({
                "error": True,
                "error_code": "ai_timeout",
                "message": ERROR_MESSAGES.get("ai_timeout"),
                "credits_refunded": True
            }), get_status_code("ai_timeout")
        except Exception as optimization_error:
            print(f"[JobBoard] ❌ Error in optimization: {optimization_error}")
            print(f"[JobBoard] Error type: {type(optimization_error)}")
            import traceback
            traceback.print_exc()
            stages['ai_optimization']['end'] = time.time()
            
            # Check for rate limit errors
            error_str = str(optimization_error).lower()
            if 'rate limit' in error_str or '429' in error_str:
                refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_refund")
                print(f"[JobBoard] Refunded credits due to rate limit: {refund_success}")
                return jsonify({
                    "error": True,
                    "error_code": "ai_rate_limit",
                    "message": ERROR_MESSAGES.get("ai_rate_limit"),
                    "credits_refunded": True
                }), get_status_code("ai_rate_limit")
            else:
                # Generic AI error
                refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_refund")
                print(f"[JobBoard] Refunded credits due to AI error: {refund_success}")
                return jsonify({
                    "error": True,
                    "error_code": "ai_error",
                    "message": ERROR_MESSAGES.get("ai_error"),
                    "credits_refunded": True
                }), get_status_code("ai_error")
        
        # Credits were already deducted before the optimization
        # Use the new_credits from the earlier deduction
        print(f"[JobBoard] Using credits from pre-deduction. Balance: {new_credits}")
        
        # Calculate processing time
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        # Build response - ensure all values are basic types
        print(f"[JobBoard] Building final response...")
        response_data = {
            "optimizedResume": optimized,
            "creditsUsed": int(OPTIMIZATION_CREDIT_COST),
            "creditsRemaining": int(new_credits) if new_credits is not None else 0,
            "processingTimeMs": processing_time_ms,
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
            # Refund credits if response building fails
            refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_refund")
            print(f"[JobBoard] Refunded credits due to response serialization error: {refund_success}")
            return jsonify({
                "error": True,
                "error_code": "json_parse_error",
                "message": ERROR_MESSAGES.get("json_parse_error"),
                "credits_refunded": True
            }), get_status_code("json_parse_error")
        
        print(f"[JobBoard] Calling jsonify...")
        try:
            result = jsonify(response_data)
            print(f"[JobBoard] ✅ jsonify successful, returning response...")
            print(f"[JobBoard] Processing time: {processing_time_ms}ms")
            return result, 200
        except Exception as jsonify_error:
            print(f"[JobBoard] ERROR in jsonify: {jsonify_error}")
            import traceback
            traceback.print_exc()
            # Refund credits if jsonify fails
            refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_refund")
            print(f"[JobBoard] Refunded credits due to jsonify error: {refund_success}")
            return jsonify({
                "error": True,
                "error_code": "json_parse_error",
                "message": ERROR_MESSAGES.get("json_parse_error"),
                "credits_refunded": True
            }), get_status_code("json_parse_error")
        
    except Exception as e:
        print(f"[JobBoard] Unexpected error in resume optimization: {e}")
        import traceback
        traceback.print_exc()
        # Try to refund credits on unexpected error
        try:
            refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_refund")
            print(f"[JobBoard] Refunded credits due to unexpected error: {refund_success}")
        except Exception as refund_error:
            print(f"[JobBoard] Failed to refund credits: {refund_error}")
        return jsonify({
            "error": True,
            "error_code": "ai_error",
            "message": ERROR_MESSAGES.get("ai_error"),
            "credits_refunded": True
        }), get_status_code("ai_error")


@job_board_bp.route("/resume-capabilities", methods=["GET"])
@require_firebase_auth
def get_resume_capabilities_endpoint():
    """
    Get the current user's resume capabilities for frontend UX decisions.
    
    Returns:
        - hasResume: bool
        - resumeFileName: str
        - resumeFileType: str (pdf, docx, doc)
        - resumeCapabilities: dict with available modes
    """
    try:
        uid = request.firebase_user.get('uid')
        
        db = get_db()
        user_doc = db.collection('users').document(uid).get()
        
        if not user_doc.exists:
            return jsonify({"error": "User not found"}), 404
        
        user_data = user_doc.to_dict()
        
        # Get file type, defaulting to pdf for old uploads
        file_type = user_data.get('resumeFileType', 'pdf')
        
        # Get capabilities - either stored or computed
        capabilities = user_data.get('resumeCapabilities')
        if not capabilities:
            # Compute capabilities for old uploads that don't have them stored
            capabilities = get_capabilities(file_type)
            # Add available modes (inline logic to avoid importing private function)
            modes = []
            if file_type == 'docx':
                modes.append({
                    'id': 'direct_edit',
                    'name': 'Format-Preserving Optimization',
                    'description': 'Optimize content while keeping your exact formatting, fonts, and layout.',
                    'recommended': True,
                    'preservesFormatting': True,
                })
            if file_type in ['pdf', 'doc']:
                modes.append({
                    'id': 'suggestions',
                    'name': 'Suggestions Mode',
                    'description': 'Get specific ATS improvements to apply yourself. Your original formatting stays intact.',
                    'recommended': file_type == 'pdf',
                    'preservesFormatting': True,
                })
            modes.append({
                'id': 'template_rebuild',
                'name': 'Template Rebuild',
                'description': 'Rebuild your resume in a clean, ATS-optimized template with fully optimized content.',
                'recommended': False,
                'preservesFormatting': False,
            })
            capabilities['availableModes'] = modes
        
        return jsonify({
            "hasResume": bool(user_data.get('resumeUrl')),
            "resumeFileName": user_data.get('resumeFileName', 'resume.pdf'),
            "resumeFileType": file_type,
            "resumeCapabilities": capabilities,
            "resumeUploadedAt": user_data.get('resumeUploadedAt')
        })
        
    except Exception as e:
        print(f"[ResumeCapabilities] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@job_board_bp.route("/optimize-resume-v2", methods=["POST"])
@require_firebase_auth
def optimize_resume_v2():
    """
    Optimize resume with explicit mode selection.
    
    Request body:
        - jobDescription: str (required, min 50 chars)
        - mode: str (required) - 'direct_edit', 'suggestions', or 'template_rebuild'
        - jobTitle: str (optional)
        - company: str (optional)
        - jobUrl: str (optional) - will be parsed if provided
    
    Returns:
        - For direct_edit: PDF file download
        - For suggestions: JSON with suggestions
        - For template_rebuild: JSON with structured content
    """
    import tempfile
    from flask import Response
    
    user_id = None
    file_path = None
    
    try:
        # Get request data
        data = request.get_json(force=True, silent=True) or {}
        user_id = request.firebase_user.get('uid')
        
        job_url = data.get("jobUrl")
        job_description = data.get("jobDescription", "")
        job_title = data.get("jobTitle", "")
        company = data.get("company", "")
        mode = data.get("mode")
        
        print(f"\n[JobBoardV2] ========================================")
        print(f"[JobBoardV2] Resume Optimization V2 Request")
        print(f"[JobBoardV2] User: {user_id}")
        print(f"[JobBoardV2] Mode: {mode}")
        print(f"[JobBoardV2] Job: {job_title} at {company}")
        print(f"[JobBoardV2] ========================================\n")
        
        # Parse job URL if provided
        if job_url:
            try:
                parsed_job = parse_job_url(job_url)
                if parsed_job:
                    if parsed_job.get("title"):
                        job_title = parsed_job.get("title")
                    if parsed_job.get("company"):
                        company = parsed_job.get("company")
                    if parsed_job.get("description") and len(parsed_job.get("description", "").strip()) >= 50:
                        job_description = parsed_job.get("description")
            except Exception as url_error:
                print(f"[JobBoardV2] Error parsing URL (non-fatal): {url_error}")
        
        # Validate inputs
        if not job_description or len(job_description.strip()) < 50:
            return jsonify({
                "error": "Job description is required (minimum 50 characters)"
            }), 400
        
        if not mode:
            return jsonify({
                "error": "Optimization mode is required. Choose: direct_edit, suggestions, or template_rebuild"
            }), 400
        
        if mode not in ['direct_edit', 'suggestions', 'template_rebuild']:
            return jsonify({
                "error": f"Invalid mode: {mode}. Choose: direct_edit, suggestions, or template_rebuild"
            }), 400
        
        # Get user data
        db = get_db()
        if not db:
            return jsonify({"error": "Database not available"}), 500
        
        user_ref = db.collection("users").document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({"error": "User not found"}), 404
        
        user_data = user_doc.to_dict()
        
        # Check credits
        current_credits = check_and_reset_credits(user_ref, user_data)
        
        if current_credits < OPTIMIZATION_CREDIT_COST:
            return jsonify({
                "error": "Insufficient credits",
                "required": OPTIMIZATION_CREDIT_COST,
                "available": current_credits
            }), 402
        
        # Get resume info
        resume_url = user_data.get("resumeUrl")
        resume_file_type = user_data.get("resumeFileType", "pdf")
        
        if not resume_url:
            return jsonify({
                "error": "No resume found. Please upload a resume first."
            }), 400
        
        # Validate mode for file type
        if mode == "direct_edit" and resume_file_type != "docx":
            return jsonify({
                "error": f"Direct edit mode requires a DOCX file. Your current resume is a {resume_file_type.upper()}. Please upload a DOCX resume or choose 'suggestions' mode.",
                "currentFileType": resume_file_type,
                "recommendedMode": "suggestions"
            }), 400
        
        # Deduct credits BEFORE optimization
        print(f"[JobBoardV2] Deducting {OPTIMIZATION_CREDIT_COST} credits...")
        success, new_credits = deduct_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_v2")
        
        if not success:
            return jsonify({
                "error": "Insufficient credits",
                "required": OPTIMIZATION_CREDIT_COST,
                "available": new_credits
            }), 402
        
        print(f"[JobBoardV2] Credits: {current_credits} → {new_credits}")
        
        # Download resume to temp file
        print(f"[JobBoardV2] Downloading resume from {resume_url[:80]}...")
        
        resume_response = requests.get(resume_url, timeout=30, headers={"User-Agent": "Offerloop/1.0"})
        resume_response.raise_for_status()
        
        # Save to temp file with correct extension
        suffix = f".{resume_file_type}"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(resume_response.content)
            file_path = f.name
        
        print(f"[JobBoardV2] Resume saved to {file_path}")
        
        try:
            # Get OpenAI client
            openai_client = get_openai_client()
            if not openai_client:
                raise Exception("OpenAI client not available")
            
            # Run optimization
            print(f"[JobBoardV2] Running optimization (mode: {mode})...")
            
            pdf_bytes, metadata = run_resume_optimization(
                file_path=file_path,
                file_type=resume_file_type,
                job_description=job_description,
                openai_client=openai_client,
                mode=mode,
                job_title=job_title,
                company=company
            )
            
            print(f"[JobBoardV2] ✅ Optimization complete!")
            
            # Clean up temp file
            try:
                if file_path and os.path.exists(file_path):
                    os.unlink(file_path)
            except Exception as e:
                print(f"[JobBoardV2] Warning: Could not delete temp file: {e}")
            
            # Return based on mode
            if pdf_bytes:
                # Direct edit mode - return PDF file
                print(f"[JobBoardV2] Returning PDF ({len(pdf_bytes)} bytes)")
                
                return Response(
                    pdf_bytes,
                    mimetype="application/pdf",
                    headers={
                        "Content-Disposition": f'attachment; filename=optimized_resume_{company or "ats"}.pdf',
                        "X-Optimization-Mode": mode,
                        "X-Credits-Used": str(OPTIMIZATION_CREDIT_COST),
                        "X-Credits-Remaining": str(new_credits),
                        "X-Replacements-Made": str(metadata.get("replacements_made", 0))
                    }
                )
            else:
                # Suggestions or template rebuild - return JSON
                print(f"[JobBoardV2] Returning JSON response")
                
                return jsonify({
                    **metadata,
                    "creditsUsed": OPTIMIZATION_CREDIT_COST,
                    "creditsRemaining": new_credits
                })
                
        except Exception as e:
            # Refund credits on failure
            print(f"[JobBoardV2] ❌ Optimization error: {e}")
            print(f"[JobBoardV2] Refunding {OPTIMIZATION_CREDIT_COST} credits...")
            refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_v2_refund")
            print(f"[JobBoardV2] Refunded: {refund_success}")
            
            import traceback
            traceback.print_exc()
            
            return jsonify({
                "error": f"Optimization failed: {str(e)}",
                "creditsRefunded": True
            }), 500
            
    except Exception as e:
        print(f"[JobBoardV2] Error: {e}")
        import traceback
        traceback.print_exc()
        
        # Try to refund credits
        if user_id:
            try:
                refund_success, _ = refund_credits_atomic(user_id, OPTIMIZATION_CREDIT_COST, "resume_optimization_v2_refund")
                print(f"[JobBoardV2] Refunded credits: {refund_success}")
            except Exception as refund_error:
                print(f"[JobBoardV2] Failed to refund: {refund_error}")
        
        return jsonify({"error": str(e)}), 500
        
    finally:
        # Cleanup temp file
        if file_path and os.path.exists(file_path):
            try:
                os.unlink(file_path)
            except Exception as cleanup_error:
                print(f"[JobBoardV2] Cleanup error: {cleanup_error}")


def normalize_company_name(company: str) -> str:
    """
    Normalize company names to prefer recognizable brand names over parent company names.
    Maps parent companies to their well-known brand names.
    """
    if not company:
        return company
    
    company_lower = company.lower().strip()
    
    # Map parent companies to their recognizable brand names
    company_mappings = {
        'sie': 'Playstation',  # Sony Interactive Entertainment -> Playstation
        'sony interactive entertainment': 'Playstation',
        'meta': 'Meta',  # Keep as is
        'facebook': 'Meta',
        'alphabet': 'Google',
        'google llc': 'Google',
        'amazon.com services llc': 'Amazon',
        'amazon web services': 'AWS',
        'microsoft corporation': 'Microsoft',
        'apple inc': 'Apple',
        'apple computer': 'Apple',
    }
    
    # Check for exact matches first
    if company_lower in company_mappings:
        return company_mappings[company_lower]
    
    # Check for partial matches (e.g., "SIE" in "SIE America")
    for parent, brand in company_mappings.items():
        if parent in company_lower:
            return brand
    
    return company


def extract_job_details_with_openai(job_description: str) -> Optional[Dict[str, str]]:
    """
    Use OpenAI to extract company name, job title, and location from job description.
    This is the primary extraction method for job details.
    """
    try:
        client = get_openai_client()
        if not client:
            print("[FindRecruiter] OpenAI client not available")
            return None
        
        # Truncate description if too long (keep first 4000 chars for better context)
        truncated_desc = job_description[:4000] if len(job_description) > 4000 else job_description
        
        prompt = f"""Extract the following information from this job posting. Be precise and accurate.

Job Description:
{truncated_desc}

Extract these three pieces of information:
1. company: The primary company name hiring for this position (e.g., "Amazon", "Google", "Microsoft", "Netflix", "Playstation"). 
   - Look for the company name in the header, title, or first few lines
   - PREFER recognizable brand names over parent company names:
     * If you see "Sony Interactive Entertainment" or "SIE", return "Playstation"
     * If you see "Alphabet", return "Google"
     * If you see "Amazon.com Services LLC" or "Amazon", return "Amazon"
     * If you see "Facebook", return "Meta"
   - Ignore generic words like "Employer", "Company", "Organization"
   - Return null ONLY if absolutely no company name can be found

2. job_title: The exact job title/position name (e.g., "Software Development Engineer Intern", "Data Scientist Intern", "Software Engineer")
   - Return null if not found

3. location: The job location in "City, State" format (e.g., "Seattle, WA", "San Francisco, CA", "Los Angeles, CA")
   - Look for location in the header, job details section, or requirements
   - If multiple locations are listed, use the primary one
   - Return null if not found

Return ONLY a valid JSON object in this exact format with no markdown, no code blocks, no explanation:
{{"company": "Company Name or null", "job_title": "Job Title or null", "location": "City, State or null"}}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a JSON extraction assistant. Extract job details from job postings. Return only valid JSON with no explanation or markdown."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=200,
            temperature=0.1
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Remove markdown code blocks if present
        if '```' in result_text:
            result_text = result_text.split('```')[1]
            if result_text.startswith('json'):
                result_text = result_text[4:]
            result_text = result_text.strip()
        
        # Try to extract JSON from response
        import json
        json_match = re.search(r'\{[^{}]*\}', result_text)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = json.loads(result_text)
        
        # Validate and clean the result
        extracted = {}
        if result.get('company') and result['company'].lower() not in ['null', 'none', 'n/a', '']:
            company_name = result['company'].strip()
            # Normalize company name to prefer brand names over parent companies
            extracted['company'] = normalize_company_name(company_name)
        if result.get('job_title') and result['job_title'].lower() not in ['null', 'none', 'n/a', '']:
            extracted['job_title'] = result['job_title'].strip()
        if result.get('location') and result['location'].lower() not in ['null', 'none', 'n/a', '']:
            extracted['location'] = result['location'].strip()
        
        return extracted if extracted else None
        
    except json.JSONDecodeError as e:
        print(f"[FindRecruiter] Failed to parse OpenAI JSON response: {e}")
        print(f"[FindRecruiter] Response was: {result_text[:200]}")
        return None
    except Exception as e:
        print(f"[FindRecruiter] OpenAI extraction error: {e}")
        return None


@job_board_bp.route("/find-recruiter", methods=["POST"])
@require_firebase_auth
def find_recruiter_endpoint():
    """
    Find recruiters at a company for a specific job.
    
    Request:
        {
            "company": "Google",
            "jobTitle": "Software Engineer",
            "jobDescription": "...",  # Optional
            "jobType": "engineering",  # Optional, will be auto-detected
            "location": "San Francisco, CA"  # Optional
        }
    
    Response:
        {
            "recruiters": [...],
            "jobTypeDetected": "engineering",
            "companyCleaned": "Google LLC",
            "totalFound": 12,
            "creditsCharged": 75,
            "creditsRemaining": 135
        }
    """
    try:
        user_id = request.firebase_user.get('uid')
        data = request.get_json()
        
        # Get job information from various sources
        company = data.get('company')
        job_title = data.get('jobTitle', '')
        job_description = data.get('jobDescription', '')
        job_type = data.get('jobType')  # Optional
        location = data.get('location')  # Optional
        job_url = data.get('jobUrl')  # Optional - for external job links
        
        # Log initial values for debugging
        print(f"[FindRecruiter] Initial values - company: '{company}', job_title: '{job_title}', location: '{location}', has_description: {bool(job_description)}, has_url: {bool(job_url)}")
        
        # Reject obviously invalid company names from request
        invalid_company_names = {'job type', 'job details', 'job description', 'employer', 'company', 'organization', 'n/a', 'null', 'none', ''}
        if company and company.lower().strip() in invalid_company_names:
            print(f"[FindRecruiter] Rejecting invalid company name from request: '{company}'")
            company = None
        elif company:
            # Normalize company name from user input
            company = normalize_company_name(company)
        
        # If no company provided but we have a job URL, try to parse it
        if not company and job_url:
            try:
                parsed_job = parse_job_url(job_url)
                if parsed_job:
                    if parsed_job.get('company'):
                        company = normalize_company_name(parsed_job.get('company'))
                    if parsed_job.get('title'):
                        job_title = parsed_job.get('title')
                    if parsed_job.get('location'):
                        location = parsed_job.get('location')
                    if parsed_job.get('description'):
                        job_description = parsed_job.get('description')
            except Exception as e:
                print(f"[FindRecruiter] Error parsing job URL: {e}")
        
        # Use OpenAI to extract missing information from job description (primary extraction method)
        # Always use OpenAI if we have a description - it's more reliable than URL parsing or user input
        if job_description:
            print(f"[FindRecruiter] Using OpenAI to extract job details from description (length: {len(job_description)})...")
            try:
                extracted = extract_job_details_with_openai(job_description)
                if extracted:
                    print(f"[FindRecruiter] OpenAI extraction result: {extracted}")
                    # Always use OpenAI extracted values (they're more reliable than URL parsing or user input)
                    # Override existing values even if they exist, because OpenAI is more accurate
                    if extracted.get('company'):
                        company = extracted['company']  # Already normalized in extract_job_details_with_openai
                        print(f"[FindRecruiter] ✅ OpenAI extracted company: '{company}'")
                    if extracted.get('job_title'):
                        job_title = extracted['job_title']
                        print(f"[FindRecruiter] ✅ OpenAI extracted job_title: '{job_title}'")
                    if extracted.get('location'):
                        location = extracted['location']
                        print(f"[FindRecruiter] ✅ OpenAI extracted location: '{location}'")
                else:
                    print(f"[FindRecruiter] ⚠️ OpenAI extraction returned None or empty result")
            except Exception as e:
                print(f"[FindRecruiter] ❌ OpenAI extraction failed: {e}")
                import traceback
                traceback.print_exc()
        else:
            print(f"[FindRecruiter] ⚠️ No job description provided, skipping OpenAI extraction")
        
        # Final validation - reject invalid company names (common false positives)
        invalid_company_names = {
            'job type', 'job details', 'job description', 'job title', 'job location',
            'employer', 'company', 'organization', 'corporation', 
            'n/a', 'null', 'none', '', 'full-time', 'part-time', 'contract',
            'remote', 'hybrid', 'on-site', 'location', 'details', 'description'
        }
        if company:
            company_lower = company.lower().strip()
            if company_lower in invalid_company_names or len(company_lower) < 2:
                print(f"[FindRecruiter] ❌ Final validation: Rejecting invalid company name: '{company}'")
                company = None
        
        print(f"[FindRecruiter] Final values before validation - company: '{company}', job_title: '{job_title}', location: '{location}'")
        
        # Validate required fields
        if not company:
            return jsonify({
                "error": "Company name is required",
                "suggestion": "Please provide a company name, paste a job URL, or include the company name in the job description."
            }), 400
        
        # Check user credits (minimum 15 for 1 contact)
        db = get_db()
        if not db:
            return jsonify({"error": "Database not available"}), 500
            
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({"error": "User not found"}), 404
        
        user_data = user_doc.to_dict()
        user_data = sanitize_firestore_data(user_data, depth=0, max_depth=20)
        current_credits = check_and_reset_credits(user_ref, user_data)
        
        if current_credits < 15:
            return jsonify({
                "error": "Insufficient credits",
                "creditsRequired": 15,
                "creditsAvailable": current_credits
            }), 402
        
        # Get user's requested max_results (default: 5, max: 10)
        max_results_requested = data.get('maxResults', 5)
        if max_results_requested is not None:
            max_results_requested = int(max_results_requested)
            max_results_requested = min(max(max_results_requested, 1), 10)  # Clamp between 1 and 10
        else:
            max_results_requested = 5
        
        # Calculate how many recruiters user can afford (15 credits per recruiter)
        max_affordable = current_credits // 15
        # Use the minimum of what user requested and what they can afford
        max_results_to_fetch = min(max_results_requested, max_affordable)
        
        # Get user's resume and contact info for email generation
        user_resume = user_data.get('resumeParsed', {})
        user_contact = {
            "name": user_resume.get('name', user_data.get('displayName', '')),
            "email": user_data.get('email', ''),
            "phone": user_resume.get('contact', {}).get('phone', '') if isinstance(user_resume.get('contact'), dict) else '',
            "linkedin": user_resume.get('contact', {}).get('linkedin', '') if isinstance(user_resume.get('contact'), dict) else ''
        }
        
        # Check if user wants to generate emails (default to True)
        generate_emails = data.get('generateEmails', True)
        create_drafts = data.get('createDrafts', True)
        
        # Find recruiters - use the requested amount (limited by affordability)
        result = find_recruiters(
            company_name=company,
            job_type=job_type,
            job_title=job_title,
            job_description=job_description,
            location=location,
            max_results=max_results_to_fetch,  # Use requested amount (limited by credits)
            generate_emails=generate_emails,
            user_resume=user_resume,
            user_contact=user_contact
        )
        
        # Check if we got results
        if result.get("error"):
            return jsonify({
                "error": result["error"],
                "recruiters": [],
                "requestedCount": max_results_requested,
                "foundCount": 0,
                "creditsCharged": 0
            }), 500
        
        # Get results (already limited by max_results_to_fetch)
        all_recruiters = result.get("recruiters", [])
        all_emails = result.get("emails", [])
        total_found = result.get("total_found", 0)
        # Results are already limited to max_results_to_fetch, but we still need to respect credits
        affordable_recruiters = all_recruiters[:max_affordable]
        
        # Limit emails to match affordable recruiters
        # Match by email address (could be Email or WorkEmail field)
        affordable_emails = []
        if all_emails:
            # Build set of all possible emails for affordable recruiters
            affordable_recruiter_emails = set()
            for r in affordable_recruiters:
                if r.get("Email") and r.get("Email") != "Not available":
                    affordable_recruiter_emails.add(r.get("Email"))
                if r.get("WorkEmail") and r.get("WorkEmail") != "Not available":
                    affordable_recruiter_emails.add(r.get("WorkEmail"))
            
            # Filter emails to only those matching affordable recruiters
            affordable_emails = [e for e in all_emails if e.get("to_email") in affordable_recruiter_emails]
        
        # Check if there are more available but user ran out of credits
        has_more = len(all_recruiters) > max_affordable or total_found > max_affordable
        credits_needed_for_more = (len(all_recruiters) - max_affordable) * 15 if has_more else 0
        
        # Create Gmail drafts if requested
        drafts_created = []
        if create_drafts and affordable_emails:
            from app.services.gmail_client import _load_user_gmail_creds, get_gmail_service_for_user
            from app.services.gmail_client import download_resume_from_url
            import base64
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText
            from email.mime.base import MIMEBase
            from email import encoders
            
            # Check Gmail connection - credentials are stored in integrations/gmail subcollection
            gmail_creds = _load_user_gmail_creds(user_id)
            resume_url = user_data.get('resumeURL') or user_data.get('resumeUrl')
            
            if gmail_creds:
                # Download resume once for all drafts
                resume_content = None
                resume_filename = None
                if resume_url:
                    try:
                        resume_content, resume_filename = download_resume_from_url(resume_url)
                        if resume_content:
                            print(f"[FindRecruiter] Downloaded resume ({len(resume_content)} bytes) for {len(affordable_emails)} drafts")
                    except Exception as e:
                        print(f"[FindRecruiter] Failed to download resume: {e}")
                
                # Get Gmail service
                gmail_service = get_gmail_service_for_user(user_data.get('email'), user_id=user_id)
                
                if gmail_service:
                    for email_data in affordable_emails:
                        try:
                            recruiter = email_data.get("recruiter", {})
                            to_email = email_data.get("to_email")
                            to_name = email_data.get("to_name", "")
                            subject = email_data.get("subject", "")
                            body_html = email_data.get("body", "")
                            body_plain = email_data.get("plain_body", "")
                            
                            # Create MIME message
                            message = MIMEMultipart('alternative')
                            message['to'] = to_email
                            message['subject'] = subject
                            
                            # Add plain text and HTML parts
                            part1 = MIMEText(body_plain, 'plain')
                            part2 = MIMEText(body_html, 'html')
                            message.attach(part1)
                            message.attach(part2)
                            
                            # Add resume attachment if available
                            if resume_content and resume_filename:
                                part = MIMEBase('application', 'octet-stream')
                                part.set_payload(resume_content)
                                encoders.encode_base64(part)
                                part.add_header('Content-Disposition', f'attachment; filename= {resume_filename}')
                                message.attach(part)
                            
                            # Encode message
                            raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
                            
                            # Create draft
                            draft_body = {
                                'message': {
                                    'raw': raw_message
                                }
                            }
                            
                            draft = gmail_service.users().drafts().create(userId='me', body=draft_body).execute()
                            draft_id = draft['id']
                            
                            # Get Gmail account email for URL
                            try:
                                profile = gmail_service.users().getProfile(userId='me').execute()
                                connected_email = profile.get('emailAddress', '')
                            except:
                                connected_email = user_data.get('email', '')
                            
                            draft_url = f"https://mail.google.com/mail/?authuser={connected_email}#draft/{draft_id}" if connected_email else f"https://mail.google.com/mail/u/0/#draft/{draft_id}"
                            
                            drafts_created.append({
                                "recruiter_email": to_email,
                                "draft_id": draft_id,
                                "draft_url": draft_url
                            })
                            
                            print(f"[FindRecruiter] Created Gmail draft for {to_email}")
                            
                        except Exception as e:
                            print(f"[FindRecruiter] Failed to create draft for {email_data.get('to_email')}: {e}")
                else:
                    print(f"[FindRecruiter] Gmail service not available")
            else:
                print(f"[FindRecruiter] Gmail not connected (no credentials found in integrations/gmail), skipping draft creation")
                print(f"[FindRecruiter] User ID: {user_id}")
        
        # Deduct credits for what we're returning
        credits_charged = 15 * len(affordable_recruiters)
        if credits_charged > 0:
            user_ref.update({
                'credits': firestore.Increment(-credits_charged)
            })
        
        new_balance = current_credits - credits_charged
        
        response = {
            "recruiters": affordable_recruiters,
            "emails": affordable_emails,
            "draftsCreated": drafts_created,
            "jobTypeDetected": result["job_type_detected"],
            "companyCleaned": result["company_cleaned"],
            "searchTitles": result["search_titles"],
            "totalFound": total_found,
            "requestedCount": max_results_requested,
            "foundCount": len(affordable_recruiters),
            "creditsCharged": credits_charged,
            "creditsRemaining": new_balance,
            "message": result.get("message")
        }
        
        # Add message if there are more available
        if has_more and len(affordable_recruiters) > 0:
            response["hasMore"] = True
            response["moreAvailable"] = len(all_recruiters) - max_affordable
            response["creditsNeededForMore"] = credits_needed_for_more
            response["message"] = f"Found {len(affordable_recruiters)} recruiter(s). {len(all_recruiters) - max_affordable} more available but you need {credits_needed_for_more} more credits."
        elif has_more and len(affordable_recruiters) == 0:
            response["hasMore"] = True
            response["moreAvailable"] = total_found
            response["creditsNeededForMore"] = total_found * 15
            response["message"] = f"Found {total_found} recruiter(s) but you need {total_found * 15} credits to view them. You currently have {current_credits} credits."
        
        return jsonify(response)
        
    except Exception as e:
        print(f"[FindRecruiter] Error: {str(e)}")
        import traceback
        traceback.print_exc()
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
        
        # Get user's resume - use cached sanitized version if available
        raw_resume = user_data.get("resumeParsed", {})
        if not raw_resume:
            return jsonify({
                "error": "No resume found. Please upload your resume in Account Settings first."
            }), 400
        
        # Sanitize resume once (removed redundant multiple passes for performance)
        # The generate_cover_letter_with_ai function will further optimize by extracting only relevant sections
        user_resume = sanitize_firestore_data(raw_resume, depth=0, max_depth=20)
        
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
        # Total timeout: 2 retries * (45s + 15s buffer) + retry delays (2s + 4s) + buffer = ~120s
        total_timeout = 120.0  # Reduced from 200s
        try:
            # Wrap in timeout to prevent indefinite hanging
            # Use a longer timeout to account for retries (3 attempts with exponential backoff)
            async def generate_with_timeout():
                return await generate_cover_letter_with_ai(user_resume, job_description, job_title, company)
            
            print(f"[JobBoard] Starting async cover letter generation with {total_timeout} second timeout...")
            cover_letter = asyncio.run(
                asyncio.wait_for(generate_with_timeout(), timeout=total_timeout)
            )
            print(f"[JobBoard] ✅ Cover letter generation completed successfully")
        except asyncio.TimeoutError:
            print(f"[JobBoard] ❌ Cover letter generation timed out after {total_timeout} seconds")
            # Refund credits on timeout
            print(f"[JobBoard] Refunding {COVER_LETTER_CREDIT_COST} credits due to timeout...")
            refund_success, refunded_credits = refund_credits_atomic(user_id, COVER_LETTER_CREDIT_COST, "cover_letter_timeout_refund")
            if refund_success:
                print(f"[JobBoard] ✅ Credits refunded successfully. New balance: {refunded_credits}")
            else:
                print(f"[JobBoard] ⚠️ Failed to refund credits (user may need manual refund)")
            import traceback
            traceback.print_exc()
            return jsonify({
                "error": "Cover letter generation timed out. Your credits have been refunded. Please try again.",
                "creditsRefunded": refund_success,
            }), 504
        except Exception as gen_error:
            print(f"[JobBoard] ❌ Error during cover letter generation: {gen_error}")
            print(f"[JobBoard] Error type: {type(gen_error)}")
            # Refund credits on error
            print(f"[JobBoard] Refunding {COVER_LETTER_CREDIT_COST} credits due to error...")
            refund_success, refunded_credits = refund_credits_atomic(user_id, COVER_LETTER_CREDIT_COST, "cover_letter_error_refund")
            if refund_success:
                print(f"[JobBoard] ✅ Credits refunded successfully. New balance: {refunded_credits}")
            else:
                print(f"[JobBoard] ⚠️ Failed to refund credits (user may need manual refund)")
            import traceback
            traceback.print_exc()
            return jsonify({
                "error": f"Cover letter generation failed: {str(gen_error)}. Your credits have been refunded.",
                "creditsRefunded": refund_success,
            }), 500
        
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
                "error": "Could not parse job details from URL. Please paste the job description instead.",
                "job": None
            }), 200
        
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

