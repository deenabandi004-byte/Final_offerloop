"""
Recruiter Finder Service

Finds the most relevant recruiters at a company for a specific job type.
Uses PDL person search with recruiter-specific job title queries.

Usage:
    from app.services.recruiter_finder import find_recruiters
    
    recruiters = find_recruiters(
        company_name="Google",
        job_type="engineering",  # engineering, sales, intern, general
        job_title="Software Engineer",  # Original job title for context
        location="San Francisco, CA"  # Optional, to prefer local recruiters
    )
"""

import re
from typing import List, Dict, Optional, Literal
from .pdl_client import (
    clean_company_name,
    clean_location_name,
    extract_contact_from_pdl_person_enhanced,
    execute_pdl_search,
    determine_location_strategy
)
from .recruiter_email_generator import generate_recruiter_emails
from ..config import PDL_BASE_URL, PEOPLE_DATA_LABS_API_KEY
import requests

# Job type to recruiter title mapping
RECRUITER_TITLES_BY_JOB_TYPE = {
    "engineering": [
        "technical recruiter",
        "engineering recruiter", 
        "software recruiter",
        "tech recruiter",
        "technology recruiter",
        "IT recruiter",
    ],
    "sales": [
        "sales recruiter",
        "business development recruiter",
        "commercial recruiter",
        "revenue recruiter",
    ],
    "marketing": [
        "marketing recruiter",
        "creative recruiter",
        "brand recruiter",
    ],
    "finance": [
        "finance recruiter",
        "financial recruiter",
        "accounting recruiter",
    ],
    "intern": [
        "university recruiter",
        "campus recruiter",
        "college recruiter",
        "early career recruiter",
        "internship recruiter",
        "university relations",
        "campus relations",
        "early talent",
        "emerging talent",
    ],
    "general": [
        "talent acquisition",
        "recruiter",
        "talent partner",
        "recruiting manager",
        "talent sourcer",
        "sourcer",
        "HR recruiter",
        "people operations",
    ]
}

# Keywords that indicate job type
JOB_TYPE_KEYWORDS = {
    "engineering": [
        "engineer", "developer", "software", "backend", "frontend", 
        "full stack", "fullstack", "devops", "sre", "infrastructure",
        "data engineer", "ml engineer", "machine learning", "platform",
        "systems", "embedded", "firmware", "mobile", "ios", "android",
        "web developer", "programmer", "architect"
    ],
    "sales": [
        "sales", "account executive", "business development", "bdr", "sdr",
        "account manager", "customer success", "revenue"
    ],
    "marketing": [
        "marketing", "brand", "content", "social media", "growth",
        "product marketing", "demand generation", "communications"
    ],
    "finance": [
        "finance", "financial", "accounting", "accountant", "controller",
        "treasury", "tax", "audit", "analyst"
    ],
    "intern": [
        "intern", "internship", "co-op", "coop", "summer", "new grad",
        "entry level", "early career", "graduate", "student"
    ]
}


def determine_job_type(job_title: str, job_description: str = "") -> str:
    """
    Determine the job type based on title and description.
    
    Returns one of: engineering, sales, marketing, finance, intern, general
    """
    combined_text = f"{job_title} {job_description}".lower()
    
    # Check for intern first (highest priority)
    for keyword in JOB_TYPE_KEYWORDS["intern"]:
        if keyword in combined_text:
            return "intern"
    
    # Check other job types
    for job_type, keywords in JOB_TYPE_KEYWORDS.items():
        if job_type == "intern":
            continue
        for keyword in keywords:
            if keyword in combined_text:
                return job_type
    
    return "general"


def get_recruiter_titles_for_job_type(job_type: str) -> List[str]:
    """
    Get list of recruiter titles to search for based on job type.
    
    Always includes general recruiter titles as fallback.
    """
    titles = RECRUITER_TITLES_BY_JOB_TYPE.get(job_type, []).copy()
    
    # Add general titles as fallback (but they'll rank lower)
    if job_type != "general":
        titles.extend(RECRUITER_TITLES_BY_JOB_TYPE["general"])
    
    return titles


def build_recruiter_search_query(
    company_name: str,
    recruiter_titles: List[str],
    location: Optional[str] = None
) -> Dict:
    """
    Build PDL Elasticsearch query for recruiter search.
    
    Args:
        company_name: Cleaned company name
        recruiter_titles: List of recruiter job titles to search for
        location: Optional location to filter by (from job posting)
    
    Returns:
        PDL query dictionary
    """
    # Build job title should clause
    title_should = []
    for title in recruiter_titles:
        title_should.append({"match_phrase": {"job_title": title}})
        title_should.append({"match": {"job_title": title}})
    
    # Build company should clause (both exact and fuzzy)
    company_should = [
        {"match_phrase": {"job_company_name": company_name}},
        {"match": {"job_company_name": company_name}}
    ]
    
    # Base query structure
    must_clauses = [
        {"bool": {"should": title_should}},
        {"bool": {"should": company_should}},
        {"term": {"location_country": "united states"}}  # US only for now
    ]
    
    # Add location filtering if provided
    if location:
        cleaned_location = clean_location_name(location)
        location_strategy = determine_location_strategy(cleaned_location)
        
        strategy = location_strategy.get("strategy", "locality_primary")
        
        if strategy == 'country_only':
            # Already have country filter, no additional location needed
            pass
        elif strategy == 'no_location':
            # Invalid location, skip location filter
            pass
        else:
            # Add location filters
            city = (location_strategy.get("city") or "").lower()
            state = (location_strategy.get("state") or "").lower()
            metro_location = (location_strategy.get("metro_location") or "").lower()
            
            location_must = []
            
            # Use metro if available, otherwise use city/state
            if metro_location and strategy == 'metro_primary':
                location_must.append({"match": {"location_metro": metro_location}})
            elif city:
                location_must.append({"match": {"location_locality": city}})
            
            # Add state if available
            if state:
                location_must.append({
                    "bool": {
                        "should": [
                            {"match": {"location_region": state}},
                            {"match": {"location_locality": state}}  # Sometimes state is in city field
                        ]
                    }
                })
            
            if location_must:
                must_clauses.append({"bool": {"must": location_must}})
    
    query_obj = {
        "bool": {
            "must": must_clauses
        }
    }
    
    return query_obj


def rank_recruiters(
    recruiters: List[Dict],
    job_type: str,
    target_company: str,
    job_location: Optional[str] = None
) -> List[Dict]:
    """
    Rank recruiters by relevance to the job type and location.
    
    Ranking factors:
    1. Title match specificity (technical recruiter > recruiter for eng jobs)
    2. Currently at target company (vs past employment)
    3. Location match (same city/state as job posting)
    4. Title seniority (senior recruiter, recruiting manager)
    
    Returns sorted list with best matches first.
    """
    primary_titles = RECRUITER_TITLES_BY_JOB_TYPE.get(job_type, [])
    
    # Parse job location for matching
    job_city = None
    job_state = None
    if job_location:
        location_lower = job_location.lower().strip()
        if ',' in location_lower:
            parts = [part.strip() for part in location_lower.split(',')]
            job_city = parts[0] if parts else None
            job_state = parts[1] if len(parts) > 1 else None
        else:
            job_city = location_lower
    
    def score_recruiter(recruiter: Dict) -> int:
        score = 0
        title = recruiter.get("Title", "").lower()
        company = recruiter.get("Company", "").lower()
        target = target_company.lower()
        recruiter_city = (recruiter.get("City", "") or "").lower()
        recruiter_state = (recruiter.get("State", "") or "").lower()
        
        # +50 points if currently at target company
        if target in company:
            score += 50
        
        # +20 points for location match (same city)
        if job_city and recruiter_city and job_city in recruiter_city:
            score += 20
        # +10 points for state match (if city doesn't match)
        elif job_state and recruiter_state and job_state in recruiter_state:
            score += 10
        
        # +30 points for specific recruiter title match
        for i, primary_title in enumerate(primary_titles):
            if primary_title in title:
                score += 30 - i  # Earlier titles in list = higher priority
                break
        
        # +10 points for seniority indicators
        if any(word in title for word in ["senior", "lead", "manager", "director", "head"]):
            score += 10
        
        # +15 points for "technical" or "engineering" in title (for eng jobs)
        if job_type == "engineering" and any(word in title for word in ["technical", "engineering", "tech"]):
            score += 15
        
        # +15 points for "campus" or "university" (for intern jobs)
        if job_type == "intern" and any(word in title for word in ["campus", "university", "college", "early"]):
            score += 15
        
        return score
    
    # Sort by score descending
    ranked = sorted(recruiters, key=score_recruiter, reverse=True)
    
    return ranked


def find_recruiters(
    company_name: str,
    job_type: Optional[str] = None,
    job_title: str = "",
    job_description: str = "",
    location: Optional[str] = None,
    max_results: int = 5,
    generate_emails: bool = False,
    user_resume: Dict = None,
    user_contact: Dict = None
) -> Dict:
    """
    Main function to find recruiters at a company.
    
    Args:
        company_name: Company name from job posting
        job_type: Optional explicit job type (engineering, sales, intern, etc.)
        job_title: Job title from posting (used to determine job type if not provided)
        job_description: Job description (used to determine job type if not provided)
        location: Optional location to prefer local recruiters
        max_results: Maximum number of recruiters to return (default 5)
    
    Returns:
        {
            "recruiters": [...],  # List of recruiter contacts
            "job_type_detected": "engineering",
            "company_cleaned": "Google LLC",
            "search_titles": ["technical recruiter", ...],
            "total_found": 12,
            "credits_charged": 75  # 15 per contact
        }
    """
    if not PEOPLE_DATA_LABS_API_KEY:
        return {
            "recruiters": [],
            "job_type_detected": job_type or "general",
            "company_cleaned": company_name,
            "search_titles": [],
            "total_found": 0,
            "credits_charged": 0,
            "error": "PDL API key not configured"
        }
    
    # Clean company name
    cleaned_company = clean_company_name(company_name)
    if not cleaned_company:
        cleaned_company = company_name
    
    # Determine job type if not provided
    if not job_type:
        job_type = determine_job_type(job_title, job_description)
    
    # Get recruiter titles to search for
    recruiter_titles = get_recruiter_titles_for_job_type(job_type)
    
    # Build query
    query_obj = build_recruiter_search_query(
        company_name=cleaned_company.lower(),
        recruiter_titles=recruiter_titles,
        location=location
    )
    
    # Execute PDL search using existing execute_pdl_search function
    PDL_URL = f"{PDL_BASE_URL}/person/search"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }
    
    try:
        # Use existing execute_pdl_search function for consistency
        raw_recruiters = execute_pdl_search(
            headers=headers,
            url=PDL_URL,
            query_obj=query_obj,
            desired_limit=20,  # Fetch more, then rank and filter
            search_type="recruiter_search",
            page_size=20,
            verbose=False
        )
        
        if not raw_recruiters:
            # No results found
            return {
                "recruiters": [],
                "job_type_detected": job_type,
                "company_cleaned": cleaned_company,
                "search_titles": recruiter_titles[:5],
                "total_found": 0,
                "credits_charged": 0,
                "message": f"No recruiters found at {cleaned_company}. Try reaching out via LinkedIn."
            }
        
        # Rank recruiters (include location for ranking)
        ranked_recruiters = rank_recruiters(raw_recruiters, job_type, cleaned_company, location)
        
        # Limit results
        final_recruiters = ranked_recruiters[:max_results]
        
        # Generate emails if requested
        emails = []
        if generate_emails and user_resume and user_contact and final_recruiters:
            try:
                emails = generate_recruiter_emails(
                    recruiters=final_recruiters,
                    job_title=job_title,
                    company=cleaned_company,
                    job_description=job_description,
                    user_resume=user_resume,
                    user_contact=user_contact
                )
                print(f"[RecruiterFinder] Generated {len(emails)} emails for {len(final_recruiters)} recruiters")
            except Exception as e:
                print(f"[RecruiterFinder] Error generating emails: {e}")
                emails = []
        
        return {
            "recruiters": final_recruiters,
            "emails": emails,
            "job_type_detected": job_type,
            "company_cleaned": cleaned_company,
            "search_titles": recruiter_titles[:5],
            "total_found": len(raw_recruiters),
            "credits_charged": 15 * len(final_recruiters)
        }
        
    except requests.exceptions.HTTPError as e:
        if e.response and e.response.status_code == 404:
            return {
                "recruiters": [],
                "job_type_detected": job_type,
                "company_cleaned": cleaned_company,
                "search_titles": recruiter_titles[:5],
                "total_found": 0,
                "credits_charged": 0,
                "message": f"No recruiters found at {cleaned_company}. Try reaching out via LinkedIn."
            }
        return {
            "recruiters": [],
            "job_type_detected": job_type,
            "company_cleaned": cleaned_company,
            "search_titles": recruiter_titles[:5],
            "total_found": 0,
            "credits_charged": 0,
            "error": f"PDL API error: {str(e)}"
        }
    except Exception as e:
        return {
            "recruiters": [],
            "job_type_detected": job_type,
            "company_cleaned": cleaned_company,
            "search_titles": recruiter_titles[:5],
            "total_found": 0,
            "credits_charged": 0,
            "error": str(e)
        }


def find_hiring_manager(
    company_name: str,
    job_title: str,
    location: Optional[str] = None,
    max_results: int = 3
) -> Dict:
    """
    Alternative: Find potential hiring managers instead of recruiters.
    
    Looks for engineering managers, team leads, directors in the relevant area.
    
    This is a secondary option if no recruiters are found or user prefers
    reaching out to hiring managers directly.
    """
    # Implementation similar to find_recruiters but with manager titles
    # TODO: Implement if needed
    pass

