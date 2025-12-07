"""
PDL (People Data Labs) client service - search, enrichment, and caching
"""
import requests
import json
import hashlib
from functools import lru_cache
from datetime import datetime
import requests.exceptions

from app.config import (
    PEOPLE_DATA_LABS_API_KEY, PDL_BASE_URL, PDL_METRO_AREAS,
    pdl_cache, CACHE_DURATION
)
from app.services.openai_client import get_openai_client
from app.utils.retry import retry_with_backoff


"""
Enhanced alumni filtering for PDL client - ensures contacts actually attended the school as degree students
"""

def _school_aliases(raw: str) -> list[str]:
    """
    Generate comprehensive aliases for ANY school (not just USC/Stanford)
    Returns list of normalized variations that PDL might use
    """
    if not raw:
        return []
    
    # Clean and normalize input
    s = " ".join(str(raw).lower().split())
    aliases = {s}
    
    # Remove common words to get core name
    core = s
    for remove in [" university", " college", " school", " institute", " of technology", ", the"]:
        if remove in core:
            core = core.replace(remove, "").strip()
    
    if core and core != s:
        aliases.add(core)
    
    # Add "University of X" variants
    if not s.startswith("university of") and core:
        aliases.add(f"university of {core}")
    
    # Add variations with/without "the"
    if s.startswith("the "):
        aliases.add(s[4:])  # Remove "the"
    else:
        aliases.add(f"the {s}")
    
    # Comprehensive school-specific aliases map
    school_map = {
        # California schools
        "usc": ["university of southern california", "usc viterbi", "viterbi school of engineering", "southern california"],
        "university of southern california": ["usc", "usc viterbi", "viterbi school of engineering", "southern california"],
        "southern california": ["usc", "university of southern california", "usc viterbi"],
        
        "ucla": ["university of california los angeles", "university of california, los angeles", "uc los angeles"],
        "university of california los angeles": ["ucla", "uc los angeles", "cal los angeles"],
        
        "berkeley": ["uc berkeley", "university of california berkeley", "cal", "california berkeley"],
        "university of california berkeley": ["berkeley", "uc berkeley", "cal"],
        
        "ucsd": ["uc san diego", "university of california san diego", "california san diego"],
        "ucsi": ["uc irvine", "university of california irvine", "california irvine"],
        "ucsb": ["uc santa barbara", "university of california santa barbara", "california santa barbara"],
        
        "stanford": ["stanford university", "leland stanford junior university"],
        "stanford university": ["stanford", "leland stanford junior university"],
        
        "caltech": ["california institute of technology", "cal tech"],
        
        # Ivy League
        "harvard": ["harvard university", "harvard college"],
        "harvard university": ["harvard", "harvard college"],
        
        "yale": ["yale university"],
        "yale university": ["yale"],
        
        "princeton": ["princeton university"],
        "princeton university": ["princeton"],
        
        "columbia": ["columbia university", "columbia university in the city of new york"],
        "columbia university": ["columbia", "columbia university in the city of new york"],
        
        "penn": ["university of pennsylvania", "upenn", "wharton"],
        "university of pennsylvania": ["penn", "upenn", "wharton"],
        
        "brown": ["brown university"],
        "brown university": ["brown"],
        
        "dartmouth": ["dartmouth college", "dartmouth university"],
        "dartmouth college": ["dartmouth", "dartmouth university"],
        
        "cornell": ["cornell university"],
        "cornell university": ["cornell"],
        
        # Other top schools
        "mit": ["massachusetts institute of technology", "m.i.t."],
        "massachusetts institute of technology": ["mit", "m.i.t."],
        
        "nyu": ["new york university", "new york u"],
        "new york university": ["nyu", "new york u"],
        
        "duke": ["duke university"],
        "duke university": ["duke"],
        
        "northwestern": ["northwestern university"],
        "northwestern university": ["northwestern"],
        
        "chicago": ["university of chicago", "uchicago", "u of chicago"],
        "university of chicago": ["chicago", "uchicago", "u of chicago"],
        
        "michigan": ["university of michigan", "umich", "u of michigan", "michigan ann arbor"],
        "university of michigan": ["michigan", "umich", "u of michigan", "michigan ann arbor"],
        
        "virginia": ["university of virginia", "uva", "u of virginia"],
        "university of virginia": ["virginia", "uva", "u of virginia"],
        
        "notre dame": ["university of notre dame", "the university of notre dame"],
        "university of notre dame": ["notre dame", "the university of notre dame"],
        
        "carnegie mellon": ["carnegie mellon university", "cmu"],
        "carnegie mellon university": ["carnegie mellon", "cmu"],
        
        "georgia tech": ["georgia institute of technology", "georgia tech"],
        "georgia institute of technology": ["georgia tech"],
        
        "texas": ["university of texas", "ut austin", "texas austin"],
        "university of texas": ["texas", "ut austin", "texas austin"],
        
        "washington": ["university of washington", "uw", "washington seattle"],
        "university of washington": ["washington", "uw", "washington seattle"],
        
        "wisconsin": ["university of wisconsin", "uw madison", "wisconsin madison"],
        "university of wisconsin": ["wisconsin", "uw madison", "wisconsin madison"],
        
        "illinois": ["university of illinois", "uiuc", "illinois urbana champaign"],
        "university of illinois": ["illinois", "uiuc", "illinois urbana champaign"],
        
        # Add more as needed
    }
    
    # Check if any key matches and add expansions
    for key, expansions in school_map.items():
        if key in s or any(key in alias for alias in list(aliases)):
            aliases.update(expansions)
            aliases.add(key)  # Also add the short form
    
    # Clean up and return sorted
    cleaned = {" ".join(a.split()).strip() for a in aliases if a and len(a.strip()) > 1}
    return sorted(cleaned)


def _contact_has_school_as_primary_education(contact: dict, aliases: list[str]) -> bool:
    """
    ENHANCED VERSION: Check if contact has the school as their PRIMARY education (degree-granting)
    Returns True only if the school appears to be where they got their main degree
    """
    # Check if we have detailed education data
    edu = contact.get("education") or []
    
    if isinstance(edu, list) and edu:
        # Sort education by importance (degrees, end dates, etc.)
        primary_schools = []
        
        for e in edu:
            if isinstance(e, dict):
                school = e.get("school") or {}
                school_name = ""
                
                if isinstance(school, dict):
                    school_name = (school.get("name") or "").lower()
                elif isinstance(e.get("school"), str):
                    school_name = e.get("school", "").lower()
                
                # Check if this education entry has degree indicators
                has_degree = False
                degree_fields = e.get("degrees") or []
                
                # Check for degree indicators
                if degree_fields:  # Has explicit degree field
                    has_degree = True
                elif e.get("degree"):  # Alternative degree field
                    has_degree = True
                elif e.get("end_date"):  # Has completion date (suggests full program)
                    has_degree = True
                elif any(deg in school_name for deg in ["university", "college", "institute"]):
                    # If it looks like a degree-granting institution and has other indicators
                    if e.get("start_date") or e.get("field_of_study") or e.get("major"):
                        has_degree = True
                
                # If this looks like a degree-granting education, add to primary schools
                if has_degree and school_name:
                    primary_schools.append(school_name)
        
        # Check if any primary schools match our aliases
        for school_name in primary_schools:
            for alias in aliases:
                if alias in school_name or school_name in alias:
                    return True
    
    # Fallback: Check top-level education fields
    # But weight them lower since they might be less reliable
    edu_top = (contact.get("EducationTop") or "").lower()
    college = (contact.get("College") or contact.get("college") or "").lower()
    
    # Only use these if they look like primary education
    primary_indicators = ["bachelor", "master", "phd", "mba", "degree", "graduated", "alumni"]
    
    for field in [edu_top, college]:
        if field:
            # Check if this field contains both the school AND degree indicators
            has_degree_indicator = any(indicator in field for indicator in primary_indicators)
            
            for alias in aliases:
                if alias in field:
                    # If we have degree indicators OR the field is specifically the "College" field
                    if has_degree_indicator or field == college:
                        return True
    
    return False
def _contact_has_school_as_primary_education_lenient(contact: dict, aliases: list[str]) -> bool:
    """
    MORE LENIENT VERSION - Accept if school appears in education
    Fixed bidirectional substring matching
    """
    # Check if we have detailed education data
    edu = contact.get("education") or []
    
    if isinstance(edu, list) and edu:
        for e in edu:
            if isinstance(e, dict):
                school = e.get("school") or {}
                school_name = ""
                
                if isinstance(school, dict):
                    school_name = (school.get("name") or "").lower()
                elif isinstance(e.get("school"), str):
                    school_name = e.get("school", "").lower()
                
                # ✅ VERY LENIENT: Accept if school name is substantial
                if school_name and len(school_name) > 2:
                    for alias in aliases:
                        # ✅ FIX: Bidirectional substring check
                        if alias in school_name or school_name in alias:
                            # Accept if ANY of these exist (even empty values)
                            has_any_indicator = (
                                "degrees" in e or
                                "degree" in e or
                                "end_date" in e or
                                "start_date" in e or
                                "field_of_study" in e or
                                "major" in e or
                                len(school_name) > 5  # Substantial school name = likely real
                            )
                            if has_any_indicator:
                                return True
    
    # Also check College field (often reliable for primary degree)
    college = (contact.get("College") or contact.get("college") or "").lower()
    if college and len(college) > 2:
        for alias in aliases:
            # ✅ FIX: Bidirectional check
            if alias in college or college in alias:
                return True  # Trust the College field
    
    # Check EducationTop
    edu_top = (contact.get("EducationTop") or "").lower()
    if edu_top and len(edu_top) > 2:
        for alias in aliases:
            # ✅ FIX: Bidirectional check
            if alias in edu_top or edu_top in alias:
                return True
    
    return False
def _contact_hash(contact: dict) -> tuple:
    """Generate a tuple of key fields to identify a contact uniquely"""
    first = (contact.get("FirstName") or "").lower().strip()
    last = (contact.get("LastName") or "").lower().strip()
    email = (contact.get("Email") or "").lower().strip()
    company = (contact.get("Company") or "").lower().strip()
    
    # ALWAYS use (first, last, company) for identity
    # Email can be added later (PDL→Hunter), so it's not reliable for deduplication
    return (first, last, company)
def get_contact_identity(contact: dict) -> str:
    """Generate a unique identity string for a contact"""
    return "||".join(_contact_hash(contact))
def _fetch_verified_alumni_contacts(
    primary_title, similar_titles, cleaned_company,
    location_strategy, job_title_enrichment,
    max_contacts, college_alumni, excluded_keys=None  # ADD excluded_keys parameter
):
    """
    Fetch contacts in batches until we have enough verified alumni
    Guarantees to return the requested number if they exist
    """
    aliases = _school_aliases(college_alumni)
    if not aliases:
        print(f"⚠️ No aliases found for {college_alumni}")
        return []
    
    excluded_keys = excluded_keys or set()  # ADD this line
    verified_alumni = []
    all_fetched_contacts = []
    batch_size = max_contacts * 2  # Start with 2x the requested amount
    max_total_fetch = 200  # Increased to 200 to handle low alumni rates (e.g., 10% = 20 alumni from 200 contacts)
    total_fetched = 0
    attempts = 0
    max_attempts = 4
    
    print(f"🎓 Starting alumni search for {max_contacts} verified {college_alumni} graduates")
    print(f"   Excluding {len(excluded_keys)} previously seen contacts")  # ADD this line
    
    while len(verified_alumni) < max_contacts and attempts < max_attempts and total_fetched < max_total_fetch:
        attempts += 1
        
        # Calculate how many to fetch this round
        current_batch_size = min(batch_size, max_total_fetch - total_fetched)
        if current_batch_size <= 0:
            break
            
        print(f"\n📥 Attempt {attempts}: Fetching {current_batch_size} contacts...")
        
        # Fetch contacts using the appropriate strategy
        if location_strategy['strategy'] == 'metro_primary':
            batch_contacts = try_metro_search_optimized(
                primary_title, similar_titles, cleaned_company,
                location_strategy, current_batch_size,
                college_alumni=college_alumni,
                exclude_keys=excluded_keys  # ADD this parameter
            )
            
            # If not enough, try locality
            if len(batch_contacts) < current_batch_size:
                locality_contacts = try_locality_search_optimized(
                    primary_title, similar_titles, cleaned_company,
                    location_strategy, current_batch_size - len(batch_contacts),
                    college_alumni=college_alumni,
                    exclude_keys=excluded_keys  # ADD this parameter
                )
                batch_contacts.extend([c for c in locality_contacts if c not in batch_contacts])
        else:
            batch_contacts = try_locality_search_optimized(
                primary_title, similar_titles, cleaned_company,
                location_strategy, current_batch_size,
                college_alumni=college_alumni,
                exclude_keys=excluded_keys  # ADD this parameter
            )
            
            # If not enough, try broader search
            if len(batch_contacts) < current_batch_size:
                broader_contacts = try_job_title_levels_search_enhanced(
                    job_title_enrichment, cleaned_company,
                    location_strategy['city'], location_strategy['state'],
                    current_batch_size - len(batch_contacts),
                    college_alumni=college_alumni,
                    exclude_keys=excluded_keys  # ADD this parameter
                )
                batch_contacts.extend([c for c in broader_contacts if c not in batch_contacts])
        
        # Track what we've fetched (with duplicate prevention)
        for contact in batch_contacts:
            if contact not in all_fetched_contacts:
                all_fetched_contacts.append(contact)
        
        total_fetched += len(batch_contacts)
        
        # Apply strict alumni filter to new batch
        # IMPORTANT: Check alumni status FIRST, then exclude duplicates
        new_verified = 0
        for contact in batch_contacts:
            # First verify if they're alumni
            if _contact_has_school_as_primary_education_lenient(contact, aliases):
                # Only now check if we've already added them (by identity, not exclude_keys)
                contact_key = get_contact_identity(contact)
                
                # Skip if already in verified_alumni (duplicate check)
                already_added = any(get_contact_identity(v) == contact_key for v in verified_alumni)
                if already_added:
                    continue
                
                # Skip if in excluded_keys (user's contact library)
                if contact_key in excluded_keys:
                    continue
                
                # Add to verified alumni
                verified_alumni.append(contact)
                new_verified += 1
                
                # Log each verified alumni found
                name = f"{contact.get('FirstName', '')} {contact.get('LastName', '')}".strip()
                print(f"   ✓ Verified alumni #{len(verified_alumni)}: {name}")
                    
                if len(verified_alumni) >= max_contacts:
                    break
        
        print(f"   Found {new_verified} new verified alumni from {len(batch_contacts)} contacts")
        print(f"   Total verified: {len(verified_alumni)}/{max_contacts}")
        
        # If we're not finding many alumni, increase batch size for next attempt
        if new_verified < batch_size * 0.2:  # Less than 20% success rate
            batch_size = min(batch_size * 2, 25)  # Double the batch size, cap at 25
            print(f"   📈 Low alumni rate, increasing next batch size to {batch_size}")
    
    # Final summary
    print(f"\n🎓 Alumni search complete:")
    print(f"   Total contacts fetched: {total_fetched}")
    print(f"   Total verified {college_alumni} alumni: {len(verified_alumni)}")
    
    if len(verified_alumni) < max_contacts:
        print(f"   ⚠️ Only found {len(verified_alumni)} verified alumni (requested {max_contacts})")
        print(f"   Consider broadening search criteria or removing company/location filters")
    else:
        print(f"   ✅ Successfully found {max_contacts} verified alumni")
    
    return verified_alumni[:max_contacts]



def _fetch_contacts_standard(
    primary_title, similar_titles, cleaned_company,
    location_strategy, job_title_enrichment,
    max_contacts, exclude_keys=None
):
    """
    Standard contact fetching without alumni filter (original logic)
    """
    excluded_keys = exclude_keys or set()
    contacts = []
    
    if location_strategy['strategy'] == 'metro_primary':
        contacts = try_metro_search_optimized(
            primary_title, similar_titles, cleaned_company,
            location_strategy, max_contacts,
            college_alumni=None,
            exclude_keys=excluded_keys  # ✅ PASS EXCLUDE_KEYS
        )
        
        if len(contacts) < max_contacts:
            print(f"Metro results insufficient ({len(contacts)}), adding locality results")
            locality_contacts = try_locality_search_optimized(
                primary_title, similar_titles, cleaned_company,
                location_strategy, max_contacts - len(contacts),
                college_alumni=None,
                exclude_keys=excluded_keys
            )
            contacts.extend([c for c in locality_contacts if c not in contacts])
    else:
        contacts = try_locality_search_optimized(
            primary_title, similar_titles, cleaned_company,
            location_strategy, max_contacts,
            college_alumni=None,
            exclude_keys=excluded_keys
        )
        
        if len(contacts) < max_contacts:
            print(f"Locality results insufficient ({len(contacts)}), trying broader search")
            broader_contacts = try_job_title_levels_search_enhanced(
                job_title_enrichment, cleaned_company,
                location_strategy['city'], location_strategy['state'],
                max_contacts - len(contacts),
                college_alumni=None,
                exclude_keys=excluded_keys  # ✅ PASS EXCLUDE_KEYS
            )
            contacts.extend([c for c in broader_contacts if c not in contacts])
    
    return contacts

def _contact_has_school_alias(c: dict, aliases: list[str]) -> bool:
    """
    ORIGINAL VERSION - kept for backward compatibility
    Check if contact has any of the school aliases in their education (loose matching)
    """
    fields = []
    fields.append((c.get("College") or c.get("college") or "").lower())
    edu = c.get("education") or []
    if isinstance(edu, list):
        for e in edu:
            if isinstance(e, dict):
                school = e.get("school") or {}
                if isinstance(school, dict):
                    fields.append((school.get("name") or "").lower())
            elif isinstance(e, str):
                fields.append(e.lower())
    elif isinstance(edu, str):
        fields.append(edu.lower())
    
    edu_top = (c.get("EducationTop") or "").lower()
    if edu_top:
        fields.append(edu_top)
    
    for field in fields:
        for alias in aliases:
            if alias in field or field in alias:
                return True
    return False

def _contact_has_school_as_primary_education(contact: dict, aliases: list[str]) -> bool:
    """
    Enhanced version: Check if contact has the school as their PRIMARY education (degree-granting)
    Returns True only if the school appears to be where they got their main degree
    """
    # Check if we have detailed education data
    edu = contact.get("education") or []
    
    if isinstance(edu, list) and edu:
        # Look for degree-granting education entries
        for e in edu:
            if isinstance(e, dict):
                school = e.get("school") or {}
                school_name = ""
                
                if isinstance(school, dict):
                    school_name = (school.get("name") or "").lower()
                elif isinstance(e.get("school"), str):
                    school_name = e.get("school", "").lower()
                
                # Check if this education entry has degree indicators
                has_degree = False
                
                # Check for explicit degree fields
                if e.get("degrees") or e.get("degree"):
                    has_degree = True
                # Check for graduation/completion indicators  
                elif e.get("end_date") and e.get("start_date"):
                    has_degree = True
                # Check for field of study (usually indicates degree program)
                elif e.get("field_of_study") or e.get("major"):
                    has_degree = True
                
                # If this looks like a degree-granting education, check against aliases
                if has_degree and school_name:
                    for alias in aliases:
                        if alias in school_name or school_name in alias:
                            print(f"✓ Verified {contact.get('FirstName', '')} {contact.get('LastName', '')} has degree from {school_name}")
                            return True
    
    # Fallback: Check College field (usually indicates primary degree)
    college = (contact.get("College") or contact.get("college") or "").lower()
    if college:
        for alias in aliases:
            if alias in college:
                return True
    
    # Don't use EducationTop alone as it might include certificates/courses
    return False
def apply_strict_alumni_filter(contacts: list, college_alumni: str, use_strict: bool = True) -> list:
    """
    Apply alumni filtering with option for strict or loose matching
    
    Args:
        contacts: List of contact dictionaries
        college_alumni: School name to filter by
        use_strict: If True, use strict degree-based filtering. If False, use original loose matching.
    
    Returns:
        Filtered list of contacts who are actual alumni
    """
    if not college_alumni:
        return contacts
    
    aliases = _school_aliases(college_alumni)
    if not aliases:
        return contacts
    
    if use_strict:
        # Use enhanced filtering that checks for actual degrees
        filtered = [c for c in contacts if _contact_has_school_as_primary_education(c, aliases)]
        
        # Log the filtering results
        original_count = len(contacts)
        filtered_count = len(filtered)
        if original_count > filtered_count:
            print(f"🎓 Strict alumni filter: {original_count} → {filtered_count} contacts")
            print(f"   Removed {original_count - filtered_count} contacts without confirmed {college_alumni} degrees")
        
        return filtered
    else:
        # Use original loose filtering
        return [c for c in contacts if _contact_has_school_alias(c, aliases)]


# Enhanced PDL query builder for alumni search
def build_enhanced_alumni_query(aliases: list[str]) -> dict:
    """
    Build a more sophisticated alumni query that prioritizes actual degree holders
    
    This query uses boosting to rank actual alumni higher while still catching edge cases
    """
    should_clauses = []
    
    for alias in aliases:
        # High boost for full school name in education
        should_clauses.append({
            "match_phrase": {
                "education.school.name": {
                    "query": alias,
                    "boost": 3.0  # High priority
                }
            }
        })
        
        # Medium boost for school + degree indicators
        degree_terms = ["bachelor", "bs", "ba", "master", "ms", "ma", "mba", "phd", "degree"]
        for degree in degree_terms:
            should_clauses.append({
                "bool": {
                    "must": [
                        {"match_phrase": {"education.school.name": alias}},
                        {"match": {"education.degrees": degree}}
                    ],
                    "boost": 5.0  # Very high priority for confirmed degrees
                }
            })
        
        # Lower boost for school mentions without degree confirmation
        should_clauses.append({
            "match": {
                "education.summary": {
                    "query": alias,
                    "boost": 0.5  # Low priority
                }
            }
        })
    
    return {"bool": {"should": should_clauses}}


# Integration point for your existing code
def search_contacts_with_smart_location_strategy_enhanced(
    job_title, company, location, max_contacts=8, college_alumni=None, 
    use_strict_alumni_filter=True
):
    """
    Enhanced version of your existing search function with better alumni filtering
    
    This is a wrapper that would call your existing function and apply enhanced filtering
    """
    # Import your existing function (adjust import as needed)
    from app.services.pdl_client import search_contacts_with_smart_location_strategy
    
    # Call existing search function
    contacts = search_contacts_with_smart_location_strategy(
        job_title, company, location, max_contacts=max_contacts * 2,  # Get extra to account for filtering
        college_alumni=college_alumni  # Still pass for query-level filtering
    )
    
    # Apply enhanced post-processing filter
    if college_alumni and use_strict_alumni_filter:
        contacts = apply_strict_alumni_filter(contacts, college_alumni, use_strict=True)
    
    # Return up to max_contacts
    return contacts[:max_contacts]


# Example usage and testing
def test_alumni_filtering():
    """
    Test function to demonstrate the difference between loose and strict filtering
    """
    # Example contact that went to Rutgers but has Stanford certificate
    test_contact = {
        "FirstName": "Ismael",
        "LastName": "Menjivar",
        "education": [
            {
                "school": {"name": "Rutgers University"},
                "degrees": ["Bachelor of Science"],
                "field_of_study": "Computer Science",
                "end_date": "2018"
            },
            {
                "school": {"name": "Stanford University"},
                "summary": "Online Certificate in Machine Learning",
                "end_date": "2020"
            }
        ],
        "EducationTop": "Rutgers University",
        "College": "Rutgers"
    }
    
    stanford_aliases = _school_aliases("Stanford University")
    
    # Test original loose matching
    has_stanford_loose = _contact_has_school_alias(test_contact, stanford_aliases)
    print(f"Loose matching: {has_stanford_loose}")  # Would return True (incorrect)
    
    # Test new strict matching
    has_stanford_strict = _contact_has_school_as_primary_education(test_contact, stanford_aliases)
    print(f"Strict matching: {has_stanford_strict}")  # Would return False (correct)
    
    return test_contact


if __name__ == "__main__":
    # Test the filtering
    test_alumni_filtering()


def _contact_has_school_alias(c: dict, aliases: list[str]) -> bool:
    """Check if contact has any of the school aliases in their education"""
    fields = []
    fields.append((c.get("College") or c.get("college") or "").lower())
    edu = c.get("education") or []
    if isinstance(edu, list):
        for e in edu:
            if isinstance(e, dict):
                school = e.get("school") or {}
                if isinstance(school, dict):
                    fields.append((school.get("name") or "").lower())
            elif isinstance(e, str):
                fields.append(e.lower())
    elif isinstance(edu, str):
        fields.append(edu.lower())
    
    edu_top = (c.get("EducationTop") or "").lower()
    if edu_top:
        fields.append(edu_top)
    
    for field in fields:
        for alias in aliases:
            if alias in field or field in alias:
                return True
    return False


@lru_cache(maxsize=1000)
def cached_enrich_job_title(job_title):
    """Cache job title enrichments to avoid repeated API calls"""
    return enrich_job_title_with_pdl(job_title)


@lru_cache(maxsize=1000)
def cached_clean_company(company):
    """Cache company cleaning to avoid repeated API calls"""
    return clean_company_name(company) if company else ''


@lru_cache(maxsize=1000)
def cached_clean_location(location):
    """Cache location cleaning to avoid repeated API calls"""
    return clean_location_name(location) if location else ''


def clean_company_name(company):
    """Clean company name using PDL Cleaner API for better matching"""
    try:
        print(f"Cleaning company name: {company}")
        
        response = requests.get(
            f"{PDL_BASE_URL}/company/clean",
            params={
                'api_key': PEOPLE_DATA_LABS_API_KEY,
                'name': company
            },
            timeout=10
        )
        
        if response.status_code == 200:
            clean_data = response.json()
            if clean_data.get('status') == 200 and clean_data.get('name'):
                cleaned_name = clean_data['name']
                print(f"Cleaned company: '{company}' -> '{cleaned_name}'")
                return cleaned_name
    
    except Exception as e:
        print(f"Company cleaning failed: {e}")
    
    return company


def clean_location_name(location):
    """Clean location name using PDL Cleaner API for better matching"""
    try:
        print(f"Cleaning location: {location}")
        
        response = requests.get(
            f"{PDL_BASE_URL}/location/clean",
            params={
                'api_key': PEOPLE_DATA_LABS_API_KEY,
                'location': location
            },
            timeout=10
        )
        
        if response.status_code == 200:
            clean_data = response.json()
            if clean_data.get('status') == 200 and clean_data.get('name'):
                cleaned_location = clean_data['name']
                print(f"Cleaned location: '{location}' -> '{cleaned_location}'")
                return cleaned_location
    
    except Exception as e:
        print(f"Location cleaning failed: {e}")
    
    return location


def enrich_job_title_with_pdl(job_title):
    """Use PDL Job Title Enrichment API to get standardized job titles"""
    try:
        print(f"Enriching job title: {job_title}")
        
        response = requests.get(
            f"{PDL_BASE_URL}/job_title/enrich",
            params={
                'api_key': PEOPLE_DATA_LABS_API_KEY,
                'job_title': job_title
            },
            timeout=10
        )
        
        if response.status_code == 200:
            enrich_data = response.json()
            if enrich_data.get('status') == 200 and enrich_data.get('data'):
                enriched_data = enrich_data['data']
                
                # Extract useful enrichment data
                result = {
                    'cleaned_name': enriched_data.get('cleaned_name', job_title),
                    'similar_titles': enriched_data.get('similar_job_titles', []),
                    'levels': enriched_data.get('job_title_levels', []),
                    'categories': enriched_data.get('job_title_categories', [])
                }
                
                print(f"Job title enrichment successful: {result}")
                return result
    
    except Exception as e:
        print(f"Job title enrichment failed: {e}")
    
    return {
        'cleaned_name': job_title,
        'similar_titles': [],
        'levels': [],
        'categories': []
    }


def get_autocomplete_suggestions(query, data_type='job_title'):
    """Enhanced autocomplete with proper PDL field mapping"""
    try:
        print(f"Getting autocomplete suggestions for {data_type}: {query}")
        
        # Map your frontend field names to PDL's supported field names
        pdl_field_mapping = {
            'job_title': 'title',  # This is the key fix
            'company': 'company',
            'location': 'location',
            'school': 'school',
            'skill': 'skill',
            'industry': 'industry',
            'role': 'role',
            'sub_role': 'sub_role'
        }
        
        # Get the correct PDL field name
        pdl_field = pdl_field_mapping.get(data_type, data_type)
        
        print(f"Mapping {data_type} -> {pdl_field} for PDL API")
        
        response = requests.get(
            f"{PDL_BASE_URL}/autocomplete",
            params={
                'api_key': PEOPLE_DATA_LABS_API_KEY,
                'field': pdl_field,  # Use the mapped field name
                'text': query,
                'size': 10
            },
            timeout=15
        )
        
        print(f"PDL autocomplete response: {response.status_code}")
        
        if response.status_code == 200:
            auto_data = response.json()
            if auto_data.get('status') == 200 and auto_data.get('data'):
                suggestions = auto_data['data']
                print(f"Autocomplete suggestions: {suggestions}")
                return suggestions
            else:
                print(f"PDL autocomplete no data: {auto_data}")
                return []
        
        elif response.status_code == 400:
            try:
                error_data = response.json()
                print(f"PDL autocomplete error 400: {error_data}")
                if isinstance(error_data, dict) and 'error' in error_data:
                    msg = error_data['error'].get('message', '')
                    if 'Supported fields are' in msg:
                        print(f"Available fields: {msg}")
            except Exception:
                pass
            return []
        elif response.status_code == 402:
            print("PDL API: Payment required for autocomplete")
            return []
        elif response.status_code == 429:
            print("PDL API rate limited for autocomplete")
            return []
        else:
            print(f"PDL autocomplete error {response.status_code}: {response.text}")
            return []
    
    except requests.exceptions.Timeout:
        print(f"Autocomplete timeout for {data_type}: {query}")
        return []
    except Exception as e:
        print(f"Autocomplete exception for {data_type}: {e}")
        return []


def es_title_block(primary_title: str, similar_titles: list[str] | None):
    """Build Elasticsearch-style title block query with validation"""
    titles = [t.strip().lower() for t in ([primary_title] + (similar_titles or [])) if t and t.strip()]
    
    # ✅ CRITICAL: Don't create empty should clauses
    if not titles:
        print("⚠️ WARNING: No valid titles provided, using fallback query")
        # Fallback to a broad professional query
        return {"exists": {"field": "job_title"}}
    
    # PDL doesn't support minimum_should_match at the top level
    # The "should" clause with at least one match is sufficient
    return {
        "bool": {
            "should": (
                [{"match_phrase": {"job_title": t}} for t in titles] +   # exact phrase
                [{"match": {"job_title": t}} for t in titles]            # token match
            )
        }
    }


def es_title_block_from_enrichment(primary_title: str, similar_titles: list[str] | None):
    """Reuse the already-implemented helper"""
    return es_title_block(primary_title, similar_titles or [])


def determine_location_strategy(location_input):
    """Determine whether to use metro or locality search based on input location"""
    try:
        location_lower = location_input.lower().strip()
        
        # Parse input location
        if ',' in location_lower:
            parts = [part.strip() for part in location_lower.split(',')]
            city = parts[0]
            state = parts[1] if len(parts) > 1 else None
        else:
            city = location_lower
            state = None
        
        # Check if this location maps to a PDL metro area
        metro_key = None
        metro_location = None
        
        # Direct match check
        if city in PDL_METRO_AREAS:
            metro_key = city
            metro_location = PDL_METRO_AREAS[city]
        
        # Also check full location string
        elif location_lower in PDL_METRO_AREAS:
            metro_key = location_lower
            metro_location = PDL_METRO_AREAS[location_lower]
        
        # Check for partial matches (e.g., "san francisco, ca" matches "san francisco")
        else:
            for metro_name in PDL_METRO_AREAS:
                if metro_name in city or city in metro_name:
                    metro_key = metro_name
                    metro_location = PDL_METRO_AREAS[metro_name]
                    break
        
        if metro_location:
            return {
                'strategy': 'metro_primary',
                'metro_location': metro_location,
                'city': city,
                'state': state,
                'original_input': location_input,
                'matched_metro': metro_key
            }
        else:
            return {
                'strategy': 'locality_primary',
                'metro_location': None,
                'city': city,
                'state': state,
                'original_input': location_input,
                'matched_metro': None
            }
            
    except Exception as e:
        print(f"Error determining location strategy: {e}")
        return {
            'strategy': 'locality_primary',
            'metro_location': None,
            'city': location_input,
            'state': None,
            'original_input': location_input,
            'matched_metro': None
        }


def determine_job_level(job_title):
    """Determine job level from job title for JOB_TITLE_LEVELS search"""
    job_title_lower = job_title.lower()
    
    if any(word in job_title_lower for word in ['intern', 'internship']):
        return 'intern'
    elif any(word in job_title_lower for word in ['entry', 'junior', 'associate', 'coordinator']):
        return 'entry'
    elif any(word in job_title_lower for word in ['senior', 'lead', 'principal']):
        return 'senior'
    elif any(word in job_title_lower for word in ['manager', 'director', 'head']):
        return 'manager'
    elif any(word in job_title_lower for word in ['vp', 'vice president', 'executive', 'chief']):
        return 'executive'
    else:
        return 'mid'  # Default to mid-level


def _choose_best_email(emails: list[dict], recommended: str | None = None) -> str | None:
    """Choose the best email from a list of emails"""
    def is_valid(addr: str) -> bool:
        # Handle case where addr might be a boolean or other non-string type
        if not isinstance(addr, str):
            return False
        if not addr or '@' not in addr: 
            return False
        bad = ["example.com", "test.com", "domain.com", "noreply@"]
        return not any(b in addr.lower() for b in bad)
    
    items = []
    for e in emails or []:
        addr = (e.get("address") or "").strip()
        et = (e.get("type") or "").lower()
        if is_valid(addr):
            items.append((et, addr))
    
    for et, a in items:
        if et in ("work","professional"): 
            return a
    for et, a in items:
        if et == "personal": 
            return a
    
    # Handle case where recommended might be a boolean
    if isinstance(recommended, str) and is_valid(recommended): 
        return recommended
        
    return items[0][1] if items else None


def extract_contact_from_pdl_person_enhanced(person):
    """Enhanced contact extraction with relaxed, sensible email acceptance"""
    try:
        print(f"DEBUG: Starting contact extraction")
        
        # Basic identity
        first_name = person.get('first_name', '')
        last_name = person.get('last_name', '')
        if not first_name or not last_name:
            print(f"DEBUG: Missing name")
            return None

        print(f"DEBUG: Name found - {first_name} {last_name}")

        # Experience
        experience = person.get('experience', []) or []
        if not isinstance(experience, list):
            experience = []
            
        work_experience_details, current_job = [], None
        if experience:
            current_job = experience[0]
            for i, job in enumerate(experience[:5]):
                if not isinstance(job, dict):
                    continue
                company_info = job.get('company') or {}
                title_info = job.get('title') or {}
                company_name = company_info.get('name', '') if isinstance(company_info, dict) else ''
                job_title = title_info.get('name', '') if isinstance(title_info, dict) else ''
                start_date = job.get('start_date') or {}
                end_date = job.get('end_date') or {}

                def fmt(d, default_end=False):
                    if not isinstance(d, dict):
                        return ""
                    y = d.get('year')
                    m = d.get('month')
                    if y:
                        return f"{m or 1}/{y}" if m else f"{y}"
                    return "Present" if default_end else ""

                start_str = fmt(start_date)
                end_str = fmt(end_date, default_end=(i == 0))
                if company_name and job_title:
                    duration = f"{start_str} - {end_str}" if start_str else "Date unknown"
                    work_experience_details.append(f"{job_title} at {company_name} ({duration})")

        company_name = ''
        job_title = ''
        if current_job and isinstance(current_job, dict):
            company_info = current_job.get('company') or {}
            title_info = current_job.get('title') or {}
            company_name = company_info.get('name', '') if isinstance(company_info, dict) else ''
            job_title = title_info.get('name', '') if isinstance(title_info, dict) else ''

        # Location
        location_info = person.get('location') or {}
        city = location_info.get('locality', '') if isinstance(location_info, dict) else ''
        state = location_info.get('region', '') if isinstance(location_info, dict) else ''

        # Email selection - FIXED VERSION
        emails = person.get('emails') or []
        if not isinstance(emails, list):
            emails = []
            
        recommended = person.get('recommended_personal_email') or ''
        if not isinstance(recommended, str):
            recommended = ''
            
        best_email = _choose_best_email(emails, recommended)

        # ✅ INCLUDE contacts even without emails (Hunter.io will enrich them)
        if not best_email or best_email == "Not available":
            
            best_email = "Not available"  # Mark as unavailable but include the contact

        # Phone
        phone_numbers = person.get('phone_numbers') or []
        if not isinstance(phone_numbers, list):
            phone_numbers = []
        phone = phone_numbers[0] if phone_numbers else ''

        # LinkedIn
        profiles = person.get('profiles') or []
        if not isinstance(profiles, list):
            profiles = []
            
        linkedin_url = ''
        for p in profiles:
            if isinstance(p, dict) and 'linkedin' in (p.get('network') or '').lower():
                linkedin_url = p.get('url', '') or ''
                break

        # Education
        education = person.get('education') or []
        if not isinstance(education, list):
            education = []
            
        education_details, college_name = [], ""
        for edu in education:
            if not isinstance(edu, dict):
                continue
            school_info = edu.get('school') or {}
            school_name = school_info.get('name', '') if isinstance(school_info, dict) else ''
            degrees = edu.get('degrees') or []
            
            if not isinstance(degrees, list):
                degrees = []
                
            degree = degrees[0] if degrees else ''
            start_date = edu.get('start_date') or {}
            end_date = edu.get('end_date') or {}
            syear = start_date.get('year') if isinstance(start_date, dict) else None
            eyear = end_date.get('year') if isinstance(end_date, dict) else None

            if school_name:
                entry = school_name
                if degree:
                    entry += f" - {degree}"
                if syear or eyear:
                    entry += f" ({syear or '?'} - {eyear or 'Present'})"
                education_details.append(entry)
                if not college_name and 'high school' not in school_name.lower():
                    college_name = school_name
        education_history = '; '.join(education_details) if education_details else 'Not available'

        # Volunteer
        volunteer_work = []
        interests = person.get('interests') or []
        if not isinstance(interests, list):
            interests = []
            
        for interest in interests:
            if isinstance(interest, str):
                if any(k in interest.lower() for k in ['volunteer', 'charity', 'nonprofit', 'community', 'mentor']):
                    volunteer_work.append(interest)
                elif len(volunteer_work) < 3:
                    volunteer_work.append(f"{interest} enthusiast")

        summary = person.get('summary') or ''
        if isinstance(summary, str):
            vk = ['volunteer', 'charity', 'nonprofit', 'community service', 'mentor', 'coach']
            for k in vk:
                if k in summary.lower():
                    for sentence in summary.split('.'):
                        if k in sentence.lower():
                            volunteer_work.append(sentence.strip())
                            break
        volunteer_history = '; '.join(volunteer_work[:5]) if volunteer_work else 'Not available'

        # Safe email extraction for WorkEmail
        work_email = 'Not available'
        for e in emails:
            if isinstance(e, dict) and (e.get('type') or '').lower() in ('work', 'professional'):
                work_email = e.get('address', '') or 'Not available'
                break

        contact = {
            'FirstName': first_name,
            'LastName': last_name,
            'LinkedIn': linkedin_url,
            'Email': best_email or "Not available", 
            'Title': job_title,
            'Company': company_name,
            'City': city,
            'State': state,
            'College': college_name,
            'Phone': phone,
            'PersonalEmail': recommended if isinstance(recommended, str) else '',
            'WorkEmail': work_email,
            'SocialProfiles': f'LinkedIn: {linkedin_url}' if linkedin_url else 'Not available',
            'EducationTop': education_history,
            'VolunteerHistory': volunteer_history,
            'WorkSummary': '; '.join(work_experience_details[:3]) if work_experience_details else f"Professional at {company_name}",
            'Group': f"{company_name} {job_title.split()[0] if job_title else 'Professional'} Team",
            'LinkedInConnections': person.get('linkedin_connections', 0),
            'DataVersion': person.get('dataset_version', 'Unknown')
        }

        print(f"DEBUG: Contact extraction successful")
        return contact
        
    except Exception as e:
        print(f"Failed to extract enhanced contact: {e}")
        import traceback
        traceback.print_exc()
        return None


def add_pdl_enrichment_fields_optimized(contact, person_data):
    """Add enrichment fields based on your product specifications"""
    try:
        # Work summary using experience array (36.8% fill rate)
        experience = person_data.get('experience', [])
        if isinstance(experience, list) and experience:
            current_job = experience[0]
            if isinstance(current_job, dict):
                title_info = current_job.get('title', {})
                company_info = current_job.get('company', {})
                
                title = title_info.get('name', contact.get('Title', '')) if isinstance(title_info, dict) else contact.get('Title', '')
                company = company_info.get('name', contact.get('Company', '')) if isinstance(company_info, dict) else contact.get('Company', '')
                
                work_summary = f"Current {title} at {company}"
                
                # Add years of experience if available (17.5% fill rate)
                years_exp = person_data.get('inferred_years_experience')
                if years_exp:
                    work_summary += f" ({years_exp} years experience)"
                
                if len(experience) > 1:
                    prev_job = experience[1]
                    if isinstance(prev_job, dict):
                        prev_company_info = prev_job.get('company', {})
                        if isinstance(prev_company_info, dict):
                            prev_company = prev_company_info.get('name', '')
                            if prev_company:
                                work_summary += f". Previously at {prev_company}"
                
                contact['WorkSummary'] = work_summary
        else:
            contact['WorkSummary'] = f"Professional at {contact.get('Company', 'current company')}"
        
        # Volunteer History from interests (4.2% fill rate)
        interests = person_data.get('interests', [])
        if isinstance(interests, list) and interests:
            volunteer_activities = []
            for interest in interests[:3]:  # Top 3 interests
                if isinstance(interest, str):
                    volunteer_activities.append(f"{interest} enthusiast")
            
            contact['VolunteerHistory'] = '; '.join(volunteer_activities) if volunteer_activities else 'Not available'
        else:
            contact['VolunteerHistory'] = 'Not available'
        
        # Group/Department (as per your spec)
        contact['Group'] = f"{contact.get('Company', 'Company')} {contact.get('Title', '').split()[0] if contact.get('Title') else 'Professional'} Team"
        
    except Exception as e:
        print(f"Error adding enrichment fields: {e}")


@retry_with_backoff(
    max_retries=3,
    initial_delay=1.0,
    max_delay=60.0,
    retryable_exceptions=(
        requests.exceptions.RequestException,
        requests.exceptions.Timeout,
        requests.exceptions.ConnectionError,
    ),
)
def execute_pdl_search(headers, url, query_obj, desired_limit, search_type, page_size=50, verbose=False, skip_count=0):
    """
    Execute PDL search with pagination
    
    Args:
        skip_count: Number of results to skip from the beginning (for getting different people)
    """
    import random
    
    # Add small random skip to get different results each time
    # Skip between 0-5 results randomly to introduce variation
    if skip_count == 0:
        skip_count = random.randint(0, min(5, desired_limit // 2))
    
    # ---- Page 1
    # Fetch more than needed to account for skipping
    fetch_size = page_size + skip_count if skip_count > 0 else page_size
    # ✅ CRITICAL: Cap at 100 (PDL's max size limit)
    fetch_size = min(100, fetch_size)
    body = {"query": query_obj, "size": fetch_size}
    
    # ✅ ADD DEBUG LOGGING
    print(f"\n=== PDL {search_type} DEBUG ===")
    print(f"Query being sent:")
    print(json.dumps(body, indent=2, ensure_ascii=False))
    print("=" * 50)
    
    if verbose:
        print(f"\n=== PDL {search_type} PAGE 1 BODY ===")
        print(json.dumps(body, ensure_ascii=False))

    r = requests.post(url, headers=headers, json=body, timeout=30)
    
    # ✅ HANDLE 404 GRACEFULLY - Don't crash, just return empty
    if r.status_code == 404:
        print(f"\n❌ PDL 404 ERROR - No records found matching query")
        print(f"Response: {r.text}")
        print(f"\n🔍 DIAGNOSIS:")
        print(f"   This usually means:")
        print(f"   1. The job title doesn't exist in PDL database")
        print(f"   2. The location filter is too restrictive")
        print(f"   3. The combination of filters yields zero results")
        print(f"\n💡 SUGGESTIONS:")
        print(f"   - Try a broader job title (e.g., 'engineer' instead of 'senior software engineer')")
        print(f"   - Remove the company filter")
        print(f"   - Try a different location or just state instead of city")
        return []  # Return empty list to allow other search strategies
    
    # ✅ HANDLE OTHER ERRORS - raise_for_status will handle 4xx/5xx (except 404)
    if r.status_code != 200:
        print(f"\n❌ PDL ERROR {r.status_code}:")
        print(f"Response: {r.text[:1000]}")
        r.raise_for_status()  # Raise exception for retry logic to catch
    
    j = r.json()

    data   = j.get("data", []) or []
    total  = j.get("total")
    scroll = j.get("scroll_token")

    if verbose:
        print(f"{search_type} page 1: got {len(data)}; total={total}; scroll_token={scroll}")
    
    # Skip the first skip_count results to get different people
    if skip_count > 0 and len(data) > skip_count:
        data = data[skip_count:]
        if verbose:
            print(f"⏭️ Skipped first {skip_count} results to get different people")

    # Stop early if we already have enough
    if len(data) >= desired_limit or not scroll:
        # TRANSFORM THE DATA BEFORE RETURNING
        extracted_contacts = []
        for person in data[:desired_limit]:
            contact = extract_contact_from_pdl_person_enhanced(person)
            if contact:  # Only add if extraction was successful
                extracted_contacts.append(contact)
        return extracted_contacts

    # ---- Page 2+
    while scroll and len(data) < desired_limit:
        body2 = {"scroll_token": scroll, "size": page_size}
        if verbose:
            print(f"\n=== PDL {search_type} NEXT PAGE BODY ===")
            print(json.dumps(body2, ensure_ascii=False))

        r2 = requests.post(url, headers=headers, json=body2, timeout=30)

        # Be robust to cluster quirk: require query/sql
        if r2.status_code == 400 and "Either `query` or `sql` must be provided" in (r2.text or ""):
            if verbose:
                print(f"{search_type} retrying with query+scroll_token due to 400…")
            body2_fallback = {"query": query_obj, "scroll_token": scroll, "size": page_size}
            r2 = requests.post(url, headers=headers, json=body2_fallback, timeout=30)

        if r2.status_code != 200:
            if verbose:
                print(f"{search_type} next page status={r2.status_code} err={r2.text}")
            break

        j2 = r2.json()
        batch  = j2.get("data", []) or []
        scroll = j2.get("scroll_token")
        data.extend(batch)

        if verbose:
            print(f"{search_type} next page: got {len(batch)}, total so far={len(data)}, next scroll={scroll}")

    # TRANSFORM ALL THE DATA BEFORE RETURNING
    extracted_contacts = []
    for person in data[:desired_limit]:
        contact = extract_contact_from_pdl_person_enhanced(person)
        if contact:  # Only add if extraction was successful
            extracted_contacts.append(contact)
    
    print(f"Extracted {len(extracted_contacts)} valid contacts from {len(data[:desired_limit])} PDL records")
    return extracted_contacts


def try_metro_search_optimized(clean_title, similar_titles, company, location_strategy, max_contacts=8, college_alumni=None, exclude_keys=None):
    """Metro search with complete validation and exclusion filtering"""
    
    # ✅ Handle exclusion keys
    excluded_keys = exclude_keys or set()
    
    # Validate inputs
    if not clean_title or not clean_title.strip():
        print("❌ No valid job title")
        return []
    
    metro_location = (location_strategy.get("metro_location") or "").lower()
    city = (location_strategy.get("city") or "").lower()
    state = (location_strategy.get("state") or "").lower()
    
    if not metro_location and not city:
        print("❌ No valid location")
        return []
    
    # Build title block with validation
    title_block = es_title_block_from_enrichment(clean_title, similar_titles)
    
    # Validate title block isn't empty
    if not title_block.get("bool", {}).get("should") and not title_block.get("exists"):
        print("❌ Empty title block")
        return []
    
    # Build location filter
    location_must = []
    
    # Use match instead of term for more flexible location matching
    if metro_location and city:
        location_must.append({
            "bool": {
                "should": [
                    {"match": {"location_metro": metro_location}},
                    {"match": {"location_locality": city}}
                ]
            }
        })
    elif metro_location:
        location_must.append({"match": {"location_metro": metro_location}})
    elif city:
        location_must.append({"match": {"location_locality": city}})
    
    # Make state optional - use should instead of must
    if state:
        location_must.append({
            "bool": {
                "should": [
                    {"match": {"location_region": state}},
                    {"match": {"location_locality": state}}  # Sometimes state is in city field
                ]
            }
        })
    
    location_must.append({"term": {"location_country": "united states"}})
    
    loc_block = {"bool": {"must": location_must}}

    # Build final query
    must = [title_block, loc_block]
    
    # Add optional filters - use both match_phrase and match for flexibility
    if company and company.strip():
        company_lower = company.lower().strip()
        must.append({
            "bool": {
                "should": [
                    {"match_phrase": {"job_company_name": company_lower}},
                    {"match": {"job_company_name": company_lower}}
                ]
            }
        })
    
    # ✅ ADD EDUCATION FILTER TO QUERY - use both match_phrase and match
    if college_alumni:
        aliases = _school_aliases(college_alumni)
        if aliases:
            # Use both match_phrase (exact) and match (flexible) for better coverage
            education_clauses = []
            for a in aliases:
                education_clauses.append({"match_phrase": {"education.school.name": a}})
                education_clauses.append({"match": {"education.school.name": a}})
            must.append({
                "bool": {
                    "should": education_clauses
                }
            })

    # ✅ ALL FILTERS IN MUST CLAUSE - PDL only returns people matching ALL criteria:
    #   1. Job title (title_block)
    #   2. Location (loc_block) 
    #   3. Company (if provided)
    #   4. Education/school (if provided)
    # This is efficient - PDL filters at query time, not post-processing
    query_obj = {"bool": {"must": must}}

    # Execute with proper error handling
    try:
        PDL_URL = f"{PDL_BASE_URL}/person/search"
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
        }

        # ✅ Request MORE than needed to account for filtering + variation
        # When alumni filter is active, PDL already narrows results significantly
        # But we need extra for: email filtering + skipping for variation
        if college_alumni:
            # Alumni filter in query means PDL returns mostly alumni
            # But still need more because of flexible matching + variation
            fetch_limit = max_contacts * 2  # Alumni filter in query = high hit rate
        else:
            # No alumni filter means more aggressive over-fetching needed
            # for email filtering, general quality, and variation
            fetch_limit = max_contacts * 5  # No alumni filter = need more buffer
        
        page_size = min(100, max(1, fetch_limit))
        
        raw_contacts = execute_pdl_search(
            headers=headers,
            url=PDL_URL,
            query_obj=query_obj,
            desired_limit=fetch_limit,
            search_type=f"metro_{location_strategy.get('matched_metro','unknown')}",
            page_size=page_size,
            verbose=False,
        )
        
        # ✅ FILTER OUT EXCLUDED CONTACTS
        if excluded_keys:
            filtered_contacts = []
            skipped_count = 0
            
            for contact in raw_contacts:
                contact_key = get_contact_identity(contact)
                if contact_key in excluded_keys:
                    skipped_count += 1
                    continue
                filtered_contacts.append(contact)
                if len(filtered_contacts) >= max_contacts:
                    break
            
            print(f"🔍 Metro search filtering:")
            print(f"   - Raw results from PDL: {len(raw_contacts)}")
            print(f"   - Excluded (already seen): {skipped_count}")
            print(f"   - Unique new contacts: {len(filtered_contacts)}")
            
            return filtered_contacts[:max_contacts]
        else:
            return raw_contacts[:max_contacts]
            
    except Exception as e:
        print(f"Metro search failed: {e}")
        return []

def try_locality_search_optimized(clean_title, similar_titles, company, location_strategy, max_contacts=8, college_alumni=None, exclude_keys=None):
    """
    Locality-focused version (used when metro results are thin).
    STRICT LOCATION: city AND state AND country
    """
    # ✅ Handle exclusion keys
    excluded_keys = exclude_keys or set()
    
    title_block = es_title_block_from_enrichment(clean_title, similar_titles)
    
    # BUILD STRICT LOCATION FILTER
    city = (location_strategy.get("city") or "").lower()
    state = (location_strategy.get("state") or "").lower()
    
    location_must = []
    
    # Use match for more flexible city matching
    if city:
        location_must.append({"match": {"location_locality": city}})
    
    # Make state optional - use should for flexibility
    if state:
        location_must.append({
            "bool": {
                "should": [
                    {"match": {"location_region": state}},
                    {"match": {"location_locality": state}}  # Sometimes state is in city field
                ]
            }
        })
    
    # Always require USA
    location_must.append({"term": {"location_country": "united states"}})
    
    loc_block = {"bool": {"must": location_must}}

    must = [title_block, loc_block]
    if company:
        # Use both match_phrase and match for flexibility
        company_lower = company.lower().strip()
        must.append({
            "bool": {
                "should": [
                    {"match_phrase": {"job_company_name": company_lower}},
                    {"match": {"job_company_name": company_lower}}
                ]
            }
        })
    
    # ✅ ADD EDUCATION FILTER TO QUERY - use both match_phrase and match
    if college_alumni:
        aliases = _school_aliases(college_alumni)
        if aliases:
            # Use both match_phrase (exact) and match (flexible) for better coverage
            education_clauses = []
            for a in aliases:
                education_clauses.append({"match_phrase": {"education.school.name": a}})
                education_clauses.append({"match": {"education.school.name": a}})
            must.append({
                "bool": {
                    "should": education_clauses
                }
            })

    # ✅ ALL FILTERS IN MUST CLAUSE - PDL only returns people matching ALL criteria:
    #   1. Job title (title_block)
    #   2. Location (loc_block) 
    #   3. Company (if provided)
    #   4. Education/school (if provided)
    # This is efficient - PDL filters at query time, not post-processing
    query_obj = {"bool": {"must": must}}

    PDL_URL = f"{PDL_BASE_URL}/person/search"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }

    # ✅ Request MORE than needed to account for filtering + variation
    # When alumni filter is active, PDL already narrows results
    if college_alumni:
        fetch_limit = max_contacts * 2  # Alumni filter in query = high hit rate
    else:
        fetch_limit = max_contacts * 5  # No alumni filter = need more buffer
    
    page_size = min(100, max(1, fetch_limit))

    raw_contacts = execute_pdl_search(
        headers=headers,
        url=PDL_URL,
        query_obj=query_obj,
        desired_limit=fetch_limit,
        search_type=f"locality_{location_strategy.get('city','unknown')}",
        page_size=page_size,
        verbose=False,
     
    )
    
    # ✅ FILTER OUT EXCLUDED CONTACTS
    if excluded_keys:
        filtered_contacts = []
        skipped_count = 0
        
        for contact in raw_contacts:
            contact_key = get_contact_identity(contact)
            if contact_key in excluded_keys:
                skipped_count += 1
                continue
            filtered_contacts.append(contact)
            if len(filtered_contacts) >= max_contacts:
                break
        
        print(f"🔍 Locality search filtering:")
        print(f"   - Raw results from PDL: {len(raw_contacts)}")
        print(f"   - Excluded (already seen): {skipped_count}")
        print(f"   - Unique new contacts: {len(filtered_contacts)}")
        
        return filtered_contacts[:max_contacts]
    else:
        return raw_contacts[:max_contacts]


def try_job_title_levels_search_enhanced(job_title_enrichment, company, city, state, max_contacts, college_alumni=None, exclude_keys=None):
    """Enhanced job title levels search"""
    # ✅ Handle exclusion keys
    excluded_keys = exclude_keys or set()
    
    print("Enhanced job title levels search")

    must = []

    levels = job_title_enrichment.get('levels') or []
    if levels:
        must.append({"bool": {"should": [{"match": {"job_title_levels": lvl}} for lvl in levels]}})
    else:
        jl = determine_job_level(job_title_enrichment.get('cleaned_name', ''))
        if jl:
            must.append({"match": {"job_title_levels": jl}})

    # Also broaden titles
    must.append(es_title_block(job_title_enrichment.get('cleaned_name',''),
                               job_title_enrichment.get('similar_titles') or []))

    if company:
        # Use both match_phrase and match for flexibility
        company_lower = (company or "").lower().strip()
        must.append({
            "bool": {
                "should": [
                    {"match_phrase": {"job_company_name": company_lower}},
                    {"match": {"job_company_name": company_lower}}
                ]
            }
        })

    location_must = []

    # Use match for more flexible city matching
    if city:
        location_must.append({"match": {"location_locality": city}})

    # Make state optional - use should for flexibility
    if state:
        location_must.append({
            "bool": {
                "should": [
                    {"match": {"location_region": state}},
                    {"match": {"location_locality": state}}  # Sometimes state is in city field
                ]
            }
        })

    # Always require USA
    location_must.append({"term": {"location_country": "united states"}})

    must.append({"bool": {"must": location_must}})

    # ✅ ADD EDUCATION FILTER TO QUERY - use both match_phrase and match
    if college_alumni:
        aliases = _school_aliases(college_alumni)
        if aliases:
            # Use both match_phrase (exact) and match (flexible) for better coverage
            education_clauses = []
            for a in aliases:
                education_clauses.append({"match_phrase": {"education.school.name": a}})
                education_clauses.append({"match": {"education.school.name": a}})
            must.append({
                "bool": {
                    "should": education_clauses
                }
            })

    # ✅ ALL FILTERS IN MUST CLAUSE - PDL only returns people matching ALL criteria:
    #   1. Job title (title_block)
    #   2. Location (loc_block) 
    #   3. Company (if provided)
    #   4. Education/school (if provided)
    # This is efficient - PDL filters at query time, not post-processing
    query_obj = {"bool": {"must": must}}

    PDL_URL = f"{PDL_BASE_URL}/person/search"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }

    # ✅ Request MORE than needed to account for filtering + variation
    # When alumni filter is active, PDL already narrows results
    if college_alumni:
        fetch_limit = max_contacts * 2  # Alumni filter in query = high hit rate
    else:
        fetch_limit = max_contacts * 5  # No alumni filter = need more buffer
    
    page_size = min(100, max(1, fetch_limit))

    raw_contacts = execute_pdl_search(
        headers=headers,
        url=PDL_URL,
        query_obj=query_obj,
        desired_limit=fetch_limit,
        search_type="job_levels_enhanced",
        page_size=page_size,
        verbose=False,
        
    )
    
    # ✅ FILTER OUT EXCLUDED CONTACTS
    if excluded_keys:
        filtered_contacts = []
        skipped_count = 0
        
        for contact in raw_contacts:
            contact_key = get_contact_identity(contact)
            if contact_key in excluded_keys:
                skipped_count += 1
                continue
            filtered_contacts.append(contact)
            if len(filtered_contacts) >= max_contacts:
                break
        
        print(f"🔍 Job levels search filtering:")
        print(f"   - Raw results from PDL: {len(raw_contacts)}")
        print(f"   - Excluded (already seen): {skipped_count}")
        print(f"   - Unique new contacts: {len(filtered_contacts)}")
        
        return filtered_contacts[:max_contacts]
    else:
        return raw_contacts[:max_contacts]


def search_contacts_with_smart_location_strategy(
    job_title, company, location, max_contacts=8, college_alumni=None, exclude_keys=None
):

    """
    ENHANCED VERSION: Guarantees the requested number of verified alumni contacts
    
    When alumni filter is active, this function will:
    1. Fetch contacts in batches
    2. Filter for verified degree holders
    3. Continue fetching until we have enough verified alumni
    4. Return exactly the requested number
    """
    try:
        # ✅ ADD COMPREHENSIVE INPUT VALIDATION
        print(f"\n{'='*70}")
        print(f"🔍 PDL SEARCH STARTED")
        print(f"{'='*70}")
        print(f"📥 Input Parameters:")
        print(f"  ├─ job_title: '{job_title}'")
        print(f"  ├─ company: '{company}'")
        print(f"  ├─ location: '{location}'")
        print(f"  ├─ max_contacts: {max_contacts}")
        print(f"  ├─ college_alumni: '{college_alumni}'")
        print(f"  └─ exclude_keys: {len(exclude_keys) if exclude_keys else 0} contacts")
        
        # ✅ VALIDATE REQUIRED INPUTS
        if not job_title or not job_title.strip():
            print(f"❌ ERROR: job_title is required but was empty or None")
            return []
        
        if not location or not location.strip():
            print(f"❌ ERROR: location is required but was empty or None")
            return []
        
        print(f"{'='*70}\n")
        
        print(f"Starting smart location search for {job_title} at {company} in {location}")
        if college_alumni:
            print(f"🎓 Alumni filter enabled: {college_alumni}")
        
        # Step 1: Enrich job title
        job_title_enrichment = cached_enrich_job_title(job_title)
        primary_title = job_title_enrichment.get('cleaned_name', job_title).lower()
        similar_titles = [t.lower() for t in job_title_enrichment.get('similar_titles', [])[:4]]
        
        # Step 2: Clean company
        cleaned_company = clean_company_name(company) if company else ''
        
        # Step 3: Clean and analyze location
        cleaned_location = clean_location_name(location)
        location_strategy = determine_location_strategy(cleaned_location)
        
        print(f"Location strategy: {location_strategy['strategy']}")
        if location_strategy['matched_metro']:
            print(f"Matched metro: {location_strategy['matched_metro']} -> {location_strategy['metro_location']}")
        
        # Step 4: CHANGED - If alumni filter is active, use batch fetching strategy
        if college_alumni:
            return _fetch_verified_alumni_contacts(
                primary_title, similar_titles, cleaned_company,
                location_strategy, job_title_enrichment,
                max_contacts, college_alumni, exclude_keys
            )
        
        # Step 5: For non-alumni searches, use standard logic
        contacts = _fetch_contacts_standard(
            primary_title, similar_titles, cleaned_company,
            location_strategy, job_title_enrichment,
            max_contacts, exclude_keys
        )
        
        # LOG FINAL RESULTS
        if len(contacts) == 0:
            print(f"WARNING: No contacts found with valid emails for {job_title} in {location}")
            print(f"Search parameters: title='{primary_title}', company='{cleaned_company}', location='{cleaned_location}'")
        else:
            print(f"Smart location search completed: {len(contacts)} contacts found with valid emails")
        
        return contacts[:max_contacts]
        
    except Exception as e:
        print(f"Smart location search failed: {e}")
        import traceback
        traceback.print_exc()
        return []



def search_contacts_with_pdl_optimized(job_title, company, location, max_contacts=8):
    """Updated main search function using smart location strategy"""
    return search_contacts_with_smart_location_strategy(job_title, company, location, max_contacts)


def search_contacts_with_pdl(job_title, company, location, max_contacts=8):
    """Wrapper function - redirect to optimized version for backward compatibility"""
    return search_contacts_with_pdl_optimized(job_title, company, location, max_contacts)


def enrich_linkedin_profile(linkedin_url):
    """Use PDL to enrich LinkedIn profile"""
    try:
        # Check cache first
        cached = get_cached_pdl_data(linkedin_url)
        if cached:
            print(f"Using cached data for: {linkedin_url}")
            return cached
        
        print(f"Enriching LinkedIn profile: {linkedin_url}")
        
        # Clean the LinkedIn URL - FIXED VERSION
        linkedin_url = linkedin_url.strip()
        
        # Remove protocol if present
        linkedin_url = linkedin_url.replace('https://', '').replace('http://', '')
        
        # Remove www. if present
        linkedin_url = linkedin_url.replace('www.', '')
        
        # If it's just the username (no linkedin.com), add the full path
        if not linkedin_url.startswith('linkedin.com'):
            linkedin_url = f'https://www.linkedin.com/in/{linkedin_url}'
        else:
            # If it already has linkedin.com, just add https://
            linkedin_url = f'https://{linkedin_url}'
        
        print(f"Cleaned URL: {linkedin_url}")
        
        # Use PDL Person Enrichment API
        response = requests.get(
            f"{PDL_BASE_URL}/person/enrich",
            params={
                'api_key': PEOPLE_DATA_LABS_API_KEY,
                'profile': linkedin_url,
                'pretty': True
            },
            timeout=30
        )
        
        print(f"PDL API response status: {response.status_code}")
        
        if response.status_code == 200:
            person_data = response.json()
            print(f"PDL response status: {person_data.get('status')}")
            
            if person_data.get('status') == 200 and person_data.get('data'):
                print(f"Successfully enriched profile")
                
                # Extract the data using your existing function
                enriched = extract_contact_from_pdl_person_enhanced(person_data['data'])
                
                if not enriched:
                    print(f"Failed to extract contact data")
                    return None
                
                # Transform to coffee chat format
                coffee_chat_data = {
                    'firstName': enriched.get('FirstName', ''),
                    'lastName': enriched.get('LastName', ''),
                    'jobTitle': enriched.get('Title', ''),
                    'company': enriched.get('Company', ''),
                    'location': f"{enriched.get('City', '')}, {enriched.get('State', '')}",
                    'workExperience': [enriched.get('WorkSummary', '')],
                    'education': [enriched.get('EducationTop', '')],
                    'volunteerWork': [enriched.get('VolunteerHistory', '')] if enriched.get('VolunteerHistory') else [],
                    'linkedinUrl': enriched.get('LinkedIn', ''),
                    'email': enriched.get('Email', ''),
                    'city': enriched.get('City', ''),
                    'state': enriched.get('State', ''),
                    'interests': []
                }
                
                print(f"Caching enriched data for: {linkedin_url}")
                set_pdl_cache(linkedin_url, coffee_chat_data)
                return coffee_chat_data
            else:
                print(f"PDL returned status {person_data.get('status')} - no data found")
                if person_data.get('error'):
                    print(f"PDL error: {person_data.get('error')}")
                return None
        
        elif response.status_code == 404:
            print(f"LinkedIn profile not found in PDL database")
            return None
        elif response.status_code == 402:
            print(f"PDL API: Payment required (out of credits)")
            return None
        elif response.status_code == 401:
            print(f"PDL API: Invalid API key")
            return None
        else:
            print(f"PDL enrichment failed with status {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return None
        
    except requests.exceptions.Timeout:
        print(f"⏱️ PDL API timeout for {linkedin_url}")
        return None
    except Exception as e:
        print(f"❌ LinkedIn enrichment error: {e}")
        import traceback
        traceback.print_exc()
        return None


def get_pdl_cache_key(linkedin_url):
    """Generate cache key for LinkedIn URL"""
    return hashlib.md5(linkedin_url.encode()).hexdigest()


def get_cached_pdl_data(linkedin_url):
    """Get cached PDL data if available"""
    cache_key = get_pdl_cache_key(linkedin_url)
    if cache_key in pdl_cache:
        cached = pdl_cache[cache_key]
        # Don't expire - keep forever as requested
        print(f"Using cached PDL data for {linkedin_url}")
        return cached['data']
    return None


def set_pdl_cache(linkedin_url, data):
    """Cache PDL data permanently"""
    cache_key = get_pdl_cache_key(linkedin_url)
    pdl_cache[cache_key] = {
        'data': data,
        'timestamp': datetime.now()
    }