"""
Company Search Service - PDL Company Search + OpenAI NLP Parsing
Handles firm discovery based on natural language prompts

BULLETPROOF VERSION - Multiple fallback levels to always return results
"""
import requests
import json
import hashlib
from datetime import datetime
from typing import Optional, List, Dict, Any

from app.config import PEOPLE_DATA_LABS_API_KEY, PDL_BASE_URL
from app.services.openai_client import get_openai_client


# =============================================================================
# INDUSTRY MAPPING - Maps user-friendly names to PDL industry codes
# =============================================================================

INDUSTRY_MAPPING = {
    "investment banking": {
        "industries": ["investment banking", "financial services", "banking"],
        "sub_industries": ["investment banking", "mergers and acquisitions", "capital markets"],
        "tags": ["investment bank", "m&a", "ib", "bulge bracket", "boutique bank"]
    },
    "real estate private equity": {
        "industries": ["real estate", "investment management", "private equity"],
        "sub_industries": ["real estate investment", "private equity", "real estate development"],
        "tags": ["repe", "real estate fund", "property investment"]
    },
    "venture capital": {
        "industries": ["venture capital", "investment management", "financial services"],
        "sub_industries": ["venture capital", "startup funding", "growth equity"],
        "tags": ["vc", "seed funding", "series a", "startup investor"]
    },
    "private equity": {
        "industries": ["private equity", "investment management", "financial services"],
        "sub_industries": ["private equity", "leveraged buyout", "growth equity"],
        "tags": ["pe", "buyout", "lbo", "portfolio company"]
    },
    "consulting": {
        "industries": ["management consulting", "consulting", "professional services"],
        "sub_industries": ["strategy consulting", "management consulting", "business consulting"],
        "tags": ["mbb", "strategy", "big 4", "advisory"]
    },
    "software engineering": {
        "industries": ["software", "technology", "information technology"],
        "sub_industries": ["software development", "saas", "enterprise software"],
        "tags": ["tech", "software", "engineering", "developer"]
    },
    "product management": {
        "industries": ["technology", "software", "internet"],
        "sub_industries": ["product development", "product management", "technology"],
        "tags": ["product", "pm", "tech product"]
    },
    "hedge fund": {
        "industries": ["hedge funds", "investment management", "financial services"],
        "sub_industries": ["hedge fund", "asset management", "alternative investments"],
        "tags": ["hf", "quant", "trading", "alpha"]
    },
    "asset management": {
        "industries": ["asset management", "investment management", "financial services"],
        "sub_industries": ["wealth management", "portfolio management", "institutional investing"],
        "tags": ["am", "wealth", "portfolio", "aum"]
    },
    "accounting": {
        "industries": ["accounting", "professional services", "financial services"],
        "sub_industries": ["public accounting", "audit", "tax"],
        "tags": ["big 4", "cpa", "audit", "tax"]
    }
}

# Size bucket mapping
SIZE_MAPPING = {
    "small": {"min": 1, "max": 50},
    "mid": {"min": 51, "max": 500},
    "large": {"min": 501, "max": None},
    "none": None  # No filter
}

# Country code mapping
COUNTRY_CODE_MAP = {
    "united states": "us",
    "usa": "us",
    "u.s.": "us",
    "u.s.a.": "us",
    "united kingdom": "gb",
    "uk": "gb",
    "u.k.": "gb",
    "canada": "ca",
    "germany": "de",
    "france": "fr",
    "australia": "au",
    "singapore": "sg",
    "hong kong": "hk",
    "japan": "jp",
    "china": "cn",
    "india": "in",
    "brazil": "br",
    "mexico": "mx"
}


# =============================================================================
# OPENAI PROMPT PARSING - Extract structured fields from natural language
# =============================================================================

def parse_firm_search_prompt(prompt: str) -> Dict[str, Any]:
    """
    Use OpenAI to extract structured search parameters from natural language.
    
    Returns:
        {
            "success": bool,
            "parsed": {
                "industry": str or None,
                "location": str or None,
                "size": "small" | "mid" | "large" | "none" or None,
                "keywords": list[str]
            },
            "error": str or None (if required fields missing)
        }
    """
    client = get_openai_client()
    
    system_prompt = """You are a search query parser for a professional networking platform. 
Extract structured information from natural language queries about finding companies/firms.

You must extract:
1. industry (REQUIRED) - The type of business/industry. Must be one of:
   - "investment banking"
   - "real estate private equity" 
   - "venture capital"
   - "private equity"
   - "consulting"
   - "software engineering"
   - "product management"
   - "hedge fund"
   - "asset management"
   - "accounting"
   If the user mentions something similar, map it to the closest option.

2. location (REQUIRED) - City, state, region, or country. Examples:
   - "New York, NY"
   - "San Francisco Bay Area"
   - "Los Angeles"
   - "United States"
   - "London, UK"

3. size (OPTIONAL) - Company size preference:
   - "small" = 1-50 employees (startups, boutiques)
   - "mid" = 51-500 employees (mid-market)
   - "large" = 500+ employees (large firms, bulge bracket)
   - "none" = no preference
   Default to "none" if not specified.

4. keywords (OPTIONAL) - Specific focus areas, specialties, or niches. Examples:
   - ["healthcare", "M&A"]
   - ["technology", "growth equity"]
   - ["real estate", "hospitality"]
   Extract any specific sectors, deal types, or specializations mentioned.

Respond with ONLY valid JSON in this exact format:
{
    "industry": "string or null",
    "location": "string or null", 
    "size": "small|mid|large|none",
    "keywords": ["array", "of", "strings"]
}

If the query is missing required fields (industry or location), still return what you can parse but set missing required fields to null."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Parse this search query: {prompt}"}
            ],
            temperature=0.1,
            max_tokens=500
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Clean up response - remove markdown code blocks if present
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()
        
        parsed = json.loads(result_text)
        
        # Validate required fields
        missing_fields = []
        if not parsed.get("industry"):
            missing_fields.append("industry")
        if not parsed.get("location"):
            missing_fields.append("location")
        
        if missing_fields:
            return {
                "success": False,
                "parsed": parsed,
                "error": f"Missing required fields: {', '.join(missing_fields)}. Please include the industry (e.g., investment banking, consulting, venture capital) and location (e.g., New York, San Francisco Bay Area) in your search. You can also add keywords like 'healthcare M&A' or 'technology focused' to narrow results.",
                "missing_fields": missing_fields
            }
        
        # Normalize industry to lowercase for mapping
        if parsed.get("industry"):
            parsed["industry"] = parsed["industry"].lower().strip()
            
        # Ensure size has a default
        if not parsed.get("size"):
            parsed["size"] = "none"
            
        # Ensure keywords is a list
        if not parsed.get("keywords"):
            parsed["keywords"] = []
        elif isinstance(parsed["keywords"], str):
            parsed["keywords"] = [parsed["keywords"]]
            
        return {
            "success": True,
            "parsed": parsed,
            "error": None
        }
        
    except json.JSONDecodeError as e:
        print(f"Failed to parse OpenAI response as JSON: {e}")
        return {
            "success": False,
            "parsed": None,
            "error": "Failed to understand your search query. Please try rephrasing, for example: 'mid-sized investment banks in New York focused on healthcare'"
        }
    except Exception as e:
        print(f"OpenAI parsing error: {e}")
        return {
            "success": False,
            "parsed": None,
            "error": f"Error processing your search: {str(e)}"
        }


# =============================================================================
# LOCATION NORMALIZATION - Parse location strings for PDL query
# =============================================================================

# Common US state abbreviations and names
US_STATES = {
    "al": "alabama", "ak": "alaska", "az": "arizona", "ar": "arkansas",
    "ca": "california", "co": "colorado", "ct": "connecticut", "de": "delaware",
    "fl": "florida", "ga": "georgia", "hi": "hawaii", "id": "idaho",
    "il": "illinois", "in": "indiana", "ia": "iowa", "ks": "kansas",
    "ky": "kentucky", "la": "louisiana", "me": "maine", "md": "maryland",
    "ma": "massachusetts", "mi": "michigan", "mn": "minnesota", "ms": "mississippi",
    "mo": "missouri", "mt": "montana", "ne": "nebraska", "nv": "nevada",
    "nh": "new hampshire", "nj": "new jersey", "nm": "new mexico", "ny": "new york",
    "nc": "north carolina", "nd": "north dakota", "oh": "ohio", "ok": "oklahoma",
    "or": "oregon", "pa": "pennsylvania", "ri": "rhode island", "sc": "south carolina",
    "sd": "south dakota", "tn": "tennessee", "tx": "texas", "ut": "utah",
    "vt": "vermont", "va": "virginia", "wa": "washington", "wv": "west virginia",
    "wi": "wisconsin", "wy": "wyoming", "dc": "district of columbia"
}

# Reverse mapping (full name -> abbreviation)
STATE_ABBREVS = {v: k.upper() for k, v in US_STATES.items()}

# Known metro areas
METRO_AREAS = [
    "san francisco bay area", "bay area", "sf bay area",
    "new york metro", "nyc metro", "tri-state area",
    "los angeles metro", "la metro", "socal",
    "chicago metro", "chicagoland",
    "boston metro", "greater boston",
    "seattle metro", "puget sound",
    "dallas-fort worth", "dfw metro",
    "miami metro", "south florida",
    "washington dc metro", "dmv area"
]

# Countries
COUNTRIES = [
    "united states", "usa", "us", "united kingdom", "uk", "canada",
    "germany", "france", "australia", "singapore", "hong kong",
    "japan", "china", "india", "brazil", "mexico"
]


def normalize_location(location_input: str) -> Dict[str, Optional[str]]:
    """
    Parse a location string and return structured location data for PDL query.
    
    Returns:
        {
            "locality": str or None (city),
            "region": str or None (state/province),
            "metro": str or None (metro area),
            "country": str or None
        }
    """
    if not location_input:
        return {"locality": None, "region": None, "metro": None, "country": None}
    
    location = location_input.lower().strip()
    result = {"locality": None, "region": None, "metro": None, "country": None}
    
    # Check for metro areas first
    for metro in METRO_AREAS:
        if metro in location:
            result["metro"] = location_input  # Use original casing
            # Also set country for US metros
            if any(us_metro in metro for us_metro in ["bay area", "nyc", "la", "chicago", "boston", "seattle", "dallas", "miami", "dc", "dmv"]):
                result["country"] = "united states"
            return result
    
    # Check for country-only input
    for country in COUNTRIES:
        if location == country or location.replace(".", "") == country:
            result["country"] = country.title() if country not in ["usa", "us", "uk"] else country.upper()
            return result
    
    # Try to parse "City, State" or "City, State, Country" format
    parts = [p.strip() for p in location.split(",")]
    
    if len(parts) >= 2:
        city = parts[0]
        second = parts[1].strip().lower()
        
        # Check if second part is a US state
        if second in US_STATES or second in US_STATES.values():
            result["locality"] = parts[0].title()
            # Convert to full state name for PDL
            if second in US_STATES:
                result["region"] = US_STATES[second].title()
            else:
                result["region"] = second.title()
            result["country"] = "united states"
        else:
            # Might be "City, Country"
            result["locality"] = parts[0].title()
            for country in COUNTRIES:
                if second == country or second.replace(".", "") == country:
                    result["country"] = country.title() if country not in ["usa", "us", "uk"] else country.upper()
                    break
            if not result["country"]:
                # Assume it's a region/state in another country
                result["region"] = parts[1].title()
                
        if len(parts) >= 3:
            # Third part is likely country
            third = parts[2].strip().lower()
            for country in COUNTRIES:
                if third == country or third.replace(".", "") == country:
                    result["country"] = country.title() if country not in ["usa", "us", "uk"] else country.upper()
                    break
    else:
        # Single value - could be city, state, or country
        # Check if it's a state
        if location in US_STATES:
            result["region"] = US_STATES[location].title()
            result["country"] = "united states"
        elif location in US_STATES.values():
            result["region"] = location.title()
            result["country"] = "united states"
        else:
            # Assume it's a city
            result["locality"] = location_input.title()
    
    return result


def firm_location_matches(firm_location: Dict[str, Any], requested_location: Dict[str, Optional[str]]) -> bool:
    """
    Check if a firm's location matches the requested location criteria.
    
    Args:
        firm_location: Firm's location dict with keys: city, state, country
        requested_location: Requested location dict with keys: locality, region, metro, country
    
    Returns:
        True if firm location matches requested location, False otherwise
    """
    if not firm_location or not requested_location:
        # If no location data available, be lenient (don't filter out)
        if not firm_location:
            print(f"⚠️ No firm location data available, allowing firm")
            return True
        return False
    
    firm_city = (firm_location.get("city") or "").lower().strip()
    firm_state = (firm_location.get("state") or "").lower().strip()
    firm_country = (firm_location.get("country") or "").lower().strip()
    
    # Normalize country names
    country_normalizations = {
        "united states": ["usa", "us", "u.s.", "u.s.a.", "united states", "united states of america"],
        "united kingdom": ["uk", "u.k.", "united kingdom", "great britain", "gb"],
    }
    
    def normalize_country(country_str):
        if not country_str:
            return None
        country_lower = country_str.lower().strip()
        for normalized, variants in country_normalizations.items():
            if country_lower in variants or country_lower == normalized:
                return normalized
        return country_lower
    
    firm_country_norm = normalize_country(firm_country)
    req_country_norm = normalize_country(requested_location.get("country"))
    
    # Check country match first (required if country is specified)
    if req_country_norm:
        if not firm_country_norm:
            # If firm has no country but we require one, fail
            return False
        if firm_country_norm != req_country_norm:
            # Country mismatch
            return False
    
    # Check metro area match (most flexible)
    if requested_location.get("metro"):
        metro_lower = requested_location["metro"].lower()
        # For metro areas, we're more lenient - check if city/state is in the metro
        metro_cities = {
            "san francisco bay area": ["san francisco", "palo alto", "mountain view", "sunnyvale", "san jose", "fremont", "oakland", "redwood city", "menlo park"],
            "bay area": ["san francisco", "palo alto", "mountain view", "sunnyvale", "san jose", "fremont", "oakland"],
            "sf bay area": ["san francisco", "palo alto", "mountain view", "sunnyvale", "san jose", "fremont", "oakland"],
            "new york metro": ["new york", "nyc", "manhattan", "brooklyn", "queens", "bronx", "staten island"],
            "nyc metro": ["new york", "nyc", "manhattan", "brooklyn", "queens", "bronx"],
            "tri-state area": ["new york", "nyc", "new jersey", "connecticut"],
            "los angeles metro": ["los angeles", "la", "santa monica", "beverly hills", "pasadena", "glendale"],
            "la metro": ["los angeles", "la", "santa monica", "beverly hills"],
            "socal": ["los angeles", "la", "san diego", "orange county"],
            "chicago metro": ["chicago"],
            "chicagoland": ["chicago"],
            "boston metro": ["boston", "cambridge", "somerville"],
            "greater boston": ["boston", "cambridge", "somerville"],
            "seattle metro": ["seattle", "bellevue", "redmond"],
            "puget sound": ["seattle", "bellevue", "redmond"],
            "dallas-fort worth": ["dallas", "fort worth", "arlington"],
            "dfw metro": ["dallas", "fort worth", "arlington"],
            "miami metro": ["miami", "miami beach"],
            "south florida": ["miami", "miami beach", "fort lauderdale"],
            "washington dc metro": ["washington", "dc", "arlington", "alexandria", "bethesda"],
            "dmv area": ["washington", "dc", "arlington", "alexandria", "bethesda", "maryland", "virginia"]
        }
        
        metro_cities_list = metro_cities.get(metro_lower, [])
        if metro_cities_list:
            firm_location_str = f"{firm_city} {firm_state}".lower()
            if any(city in firm_location_str for city in metro_cities_list):
                return True
            # If no match found for metro, fail
            return False
    
    # Check region/state match
    if requested_location.get("region"):
        req_region = requested_location["region"].lower().strip()
        # Check if it's a US state abbreviation
        if req_region in US_STATES:
            req_region_full = US_STATES[req_region].lower()
        else:
            req_region_full = req_region
        
        # Check state match
        if firm_state:
            # Direct match
            if firm_state == req_region_full or firm_state == req_region:
                return True
            # Partial match (e.g., "new york" matches "new york state")
            if req_region_full in firm_state or firm_state in req_region_full:
                return True
            # Check abbreviation match
            if req_region in US_STATES:
                if firm_state == req_region:
                    return True
            # Check if firm_state is abbreviation for requested state
            if req_region_full in US_STATES.values():
                for abbrev, full_name in US_STATES.items():
                    if full_name == req_region_full and firm_state == abbrev:
                        return True
        
        # If we have a region requirement but no match, fail
        # Exception: if we also have a city requirement, city match might override
        if not requested_location.get("locality"):
            return False
    
    # Check locality/city match
    if requested_location.get("locality"):
        req_city = requested_location["locality"].lower().strip()
        if firm_city:
            # Direct match
            if firm_city == req_city:
                return True
            # Partial match (e.g., "new york" matches "new york city")
            if req_city in firm_city or firm_city in req_city:
                return True
        # If we have a city requirement but no match, fail
        return False
    
    # If we got here and country matched (or no country requirement), location matches
    # This handles the case where only country is specified
    return True


# =============================================================================
# PDL COMPANY SEARCH - BULLETPROOF QUERY BUILDER
# =============================================================================

def escape_sql_string(s: str) -> str:
    """Escape single quotes for SQL strings."""
    if not s:
        return s
    return s.replace("'", "''")


def get_country_code(country: str) -> str:
    """Convert country name to ISO code."""
    if not country:
        return ""
    country_lower = country.lower().strip()
    return COUNTRY_CODE_MAP.get(country_lower, country_lower)


def build_pdl_sql_query(
    industry: str,
    location: Dict[str, Optional[str]],
    size: str = "none",
    keywords: List[str] = None,
    strictness: int = 3
) -> str:
    """
    Build a PDL Company Search SQL query with configurable strictness.
    
    STRICTNESS LEVELS:
    - 3 (strict): All filters applied (industry + location + size + keywords)
    - 2 (medium): Industry + location + size only
    - 1 (loose): Industry + location only
    - 0 (minimal): Location only (country)
    
    PDL SQL RULES:
    - Use LIKE (not ILIKE) for text matching - PDL is case-insensitive by default
    - Use subfields: location.locality, location.region, location.country, location.metro
    - Tags: use tags LIKE '%value%' (not ANY())
    - Size: use employee_count ranges, not size buckets for better matching
    """
    if keywords is None:
        keywords = []
    
    conditions = []
    
    # LEVEL 0+: Location filter (always include at minimum country)
    location_conditions = []
    
    if strictness >= 1:
        # Include locality and region for stricter searches
        if location.get("locality"):
            loc_safe = escape_sql_string(location['locality'])
            location_conditions.append(f"location.locality LIKE '%{loc_safe}%'")
        
        if location.get("region"):
            region_safe = escape_sql_string(location['region'])
            location_conditions.append(f"location.region LIKE '%{region_safe}%'")
        
        if location.get("metro"):
            metro_safe = escape_sql_string(location['metro'])
            location_conditions.append(f"location.metro LIKE '%{metro_safe}%'")
    
    # Always include country if available
    if location.get("country"):
        country_code = get_country_code(location['country'])
        country_safe = escape_sql_string(country_code)
        location_conditions.append(f"location.country='{country_safe}'")
    
    if location_conditions:
        if len(location_conditions) == 1:
            conditions.append(location_conditions[0])
        else:
            # Use OR for location flexibility
            conditions.append(f"({' OR '.join(location_conditions)})")
    
    # LEVEL 1+: Industry filter
    if strictness >= 1:
        industry_config = INDUSTRY_MAPPING.get(industry, {})
        if industry_config:
            industry_terms = industry_config.get("industries", [])
            if industry_terms:
                # Include multiple industry terms with OR
                industry_clauses = []
                for term in industry_terms[:3]:  # Top 3 industry terms
                    term_safe = escape_sql_string(term)
                    industry_clauses.append(f"industry LIKE '%{term_safe}%'")
                
                if industry_clauses:
                    conditions.append(f"({' OR '.join(industry_clauses)})")
    
    # LEVEL 2+: Size filter (use employee_count for better reliability)
    if strictness >= 2 and size != "none":
        size_config = SIZE_MAPPING.get(size)
        if size_config:
            min_emp = size_config.get("min", 1)
            max_emp = size_config.get("max")
            
            if max_emp:
                conditions.append(f"(employee_count >= {min_emp} AND employee_count <= {max_emp})")
            else:
                conditions.append(f"employee_count >= {min_emp}")
    
    # LEVEL 3: Keywords filter (optional boost)
    if strictness >= 3 and keywords:
        keyword_conditions = []
        for kw in keywords[:2]:  # Limit to first 2 keywords for safety
            kw_safe = escape_sql_string(kw)
            # Search in name, summary, and tags
            keyword_conditions.append(
                f"(name LIKE '%{kw_safe}%' OR summary LIKE '%{kw_safe}%' OR tags LIKE '%{kw_safe}%')"
            )
        
        if keyword_conditions:
            # Keywords are optional boosters - use OR between them
            conditions.append(f"({' OR '.join(keyword_conditions)})")
    
    # Build final SQL query
    if conditions:
        where_clause = " AND ".join(conditions)
    else:
        # Fallback: at least search by country if nothing else
        where_clause = "location.country='us'"
    
    sql = f"SELECT * FROM company WHERE {where_clause}"
    
    return sql


def search_companies_with_pdl(
    industry: str,
    location: Dict[str, Optional[str]],
    size: str = "none",
    keywords: List[str] = None,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Search for companies using PDL Company Search API.
    
    BULLETPROOF APPROACH:
    1. Try strictest query first (all filters)
    2. If <3 results, progressively loosen filters
    3. Always return something if possible
    
    Returns:
        {
            "success": bool,
            "firms": list[Firm],
            "total": int,
            "error": str or None,
            "queryLevel": int (strictness level that succeeded)
        }
    """
    # Validate API key is configured
    if not PEOPLE_DATA_LABS_API_KEY:
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "error": "Search service configuration error. Please contact support.",
            "queryLevel": None
        }
    
    if keywords is None:
        keywords = []
    
    # Try queries from strict to loose
    strictness_levels = [3, 2, 1, 0]
    min_results_needed = 3
    
    last_error = None
    best_result = None
    best_count = 0
    successful_level = None
    
    for strictness in strictness_levels:
        try:
            sql_query = build_pdl_sql_query(
                industry=industry,
                location=location,
                size=size,
                keywords=keywords,
                strictness=strictness
            )
            
            level_names = {3: "strict", 2: "medium", 1: "loose", 0: "minimal"}
            print(f"🔍 Trying {level_names[strictness]} query (level {strictness}): {sql_query}")
            
            payload = {
                "sql": sql_query,
                "size": limit,
                "dataset": "all",  # Use 'all' instead of 'all_companies'
                "pretty": True
            }
            
            response = requests.post(
                f"{PDL_BASE_URL}/company/search",
                headers={
                    "Content-Type": "application/json",
                    "X-Api-Key": PEOPLE_DATA_LABS_API_KEY
                },
                json=payload,
                timeout=30
            )
            
            print(f"📡 PDL Response Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get("status") == 200:
                    raw_companies = data.get("data", [])
                    total = data.get("total", len(raw_companies))
                    
                    # DEBUG: Log first raw company to see exact field structure
                    if raw_companies:
                        print(f"📋 DEBUG - First raw company from PDL:")
                        first = raw_companies[0]
                        print(f"   name: {first.get('name')}")
                        print(f"   display_name: {first.get('display_name')}")
                        print(f"   website: {first.get('website')}")
                        print(f"   employee_count: {first.get('employee_count')}")
                        print(f"   size: {first.get('size')}")
                        print(f"   industry: {first.get('industry')}")
                        print(f"   location: {first.get('location')}")
                    
                    # Transform to our Firm format
                    firms = []
                    seen_domains = set()
                    
                    for company in raw_companies:
                        domain = company.get("website") or company.get("linkedin_url", "")
                        
                        if domain and domain in seen_domains:
                            continue
                        if domain:
                            seen_domains.add(domain)
                        
                        firm = transform_pdl_company_to_firm(company)
                        if firm:
                            firms.append(firm)
                    
                    # Sort firms to ensure consistent ordering and handle None values properly
                    # Sort by employee_count, treating None as 0 for comparison purposes
                    firms.sort(key=lambda f: f.get('employeeCount') if f.get('employeeCount') is not None else 0)
                    
                    firms_count = len(firms)
                    print(f"✅ Level {strictness} returned {firms_count} unique firms")
                    
                    # Track best result so far
                    if firms_count > best_count:
                        best_count = firms_count
                        best_result = {
                            "success": True,
                            "firms": firms[:limit],
                            "total": total,
                            "error": None,
                            "queryLevel": strictness
                        }
                        successful_level = strictness
                    
                    # If we have enough results, return immediately
                    if firms_count >= min_results_needed:
                        return best_result
                    
                    # Otherwise, continue to try looser queries
                    
            elif response.status_code == 400:
                error_data = response.json()
                error_msg = error_data.get("error", {}).get("message", "Invalid query")
                print(f"⚠️ Level {strictness} failed: {error_msg}")
                last_error = error_msg
                # Continue to try looser query
                
            elif response.status_code == 404:
                # No results at this strictness, try looser
                print(f"📭 Level {strictness}: No results found")
                continue
                
            elif response.status_code == 401:
                return {
                    "success": False,
                    "firms": [],
                    "total": 0,
                    "error": "API authentication failed. Please contact support.",
                    "queryLevel": None
                }
                
            elif response.status_code == 402:
                error_detail = ""
                try:
                    error_data = response.json()
                    error_detail = error_data.get("error", {}).get("message", "") if isinstance(error_data.get("error"), dict) else str(error_data.get("error", ""))
                except:
                    error_detail = response.text[:200] if response.text else ""
                
                print(f"⚠️ PDL API returned 402 (Payment Required): {error_detail}")
                
                # Check if it's a quota/credits issue
                if "maximum" in error_detail.lower() or "matches used" in error_detail.lower() or "quota" in error_detail.lower():
                    error_message = "The company search service has reached its monthly limit. Please try again later or contact support for assistance."
                else:
                    error_message = "The search service is temporarily unavailable. Please try again in a few minutes."
                
                return {
                    "success": False,
                    "firms": [],
                    "total": 0,
                    "error": error_message,
                    "queryLevel": None
                }
            
            else:
                error_text = response.text[:500] if response.text else "No response body"
                print(f"⚠️ Unexpected PDL status {response.status_code}: {error_text}")
                last_error = f"Unexpected error (status {response.status_code})"
                
        except requests.exceptions.Timeout:
            print(f"⏰ Level {strictness}: Request timed out after 30s")
            last_error = "Search timed out. Please try again."
            continue
            
        except requests.exceptions.ConnectionError as e:
            print(f"🔌 Level {strictness}: Connection error: {e}")
            last_error = "Unable to connect to search service. Please check your connection."
            continue
            
        except requests.exceptions.RequestException as e:
            print(f"🌐 Level {strictness}: Request error: {e}")
            last_error = f"Network error: {str(e)}"
            continue
            
        except Exception as e:
            print(f"❌ Level {strictness} unexpected error: {e}")
            import traceback
            traceback.print_exc()
            last_error = f"Unexpected error: {str(e)}"
            continue
    
    # Return best result we found, even if < min_results_needed
    if best_result and best_count > 0:
        print(f"🎯 Returning best result: {best_count} firms from level {successful_level}")
        return best_result
    
    # Nothing worked
    return {
        "success": False,
        "firms": [],
        "total": 0,
        "error": f"No companies found matching your criteria. Last error: {last_error or 'Unknown'}",
        "queryLevel": None
    }


def parse_size_string(size_str: str) -> Optional[int]:
    """
    Parse PDL size string like "51-200" into an estimated employee count.
    Returns the midpoint of the range.
    
    PDL size buckets: '1-10', '11-50', '51-200', '201-500', '501-1000', 
                      '1001-5000', '5001-10000', '10001+'
    """
    if not size_str:
        return None
    
    size_str = size_str.strip()
    
    # Handle "10001+" case
    if size_str.endswith('+'):
        try:
            return int(size_str.rstrip('+'))
        except ValueError:
            return None
    
    # Handle range like "51-200"
    if '-' in size_str:
        try:
            parts = size_str.split('-')
            low = int(parts[0])
            high = int(parts[1])
            return (low + high) // 2  # Return midpoint
        except (ValueError, IndexError):
            return None
    
    # Handle single number
    try:
        return int(size_str)
    except ValueError:
        return None


def get_size_bucket_from_string(size_str: str) -> Optional[str]:
    """
    Convert PDL size string to our size bucket.
    
    PDL buckets -> Our buckets:
    '1-10', '11-50' -> "small" (1-50)
    '51-200', '201-500' -> "mid" (51-500)
    '501-1000', '1001-5000', '5001-10000', '10001+' -> "large" (500+)
    """
    if not size_str:
        return None
    
    size_str = size_str.strip().lower()
    
    small_sizes = ['1-10', '11-50']
    mid_sizes = ['51-200', '201-500']
    large_sizes = ['501-1000', '1001-5000', '5001-10000', '10001+']
    
    if size_str in small_sizes:
        return "small"
    elif size_str in mid_sizes:
        return "mid"
    elif size_str in large_sizes:
        return "large"
    
    # Try to parse and categorize
    count = parse_size_string(size_str)
    if count:
        if count <= 50:
            return "small"
        elif count <= 500:
            return "mid"
        else:
            return "large"
    
    return None


def transform_serp_company_to_firm(company: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Transform a ChatGPT-extracted company record (from SERP) into our Firm format.
    
    ChatGPT-extracted data format:
    - name: Company name
    - website: Website URL
    - linkedinUrl: LinkedIn URL
    - location: {city, state, country}
    - industry: Industry string
    - employeeCount: Integer or None
    - sizeBucket: "small" | "mid" | "large" | None
    - founded: Year (integer) or None
    
    Output format (same as PDL):
    {
        "id": str,
        "name": str,
        "website": str or None,
        "linkedinUrl": str or None,
        "location": {
            "city": str or None,
            "state": str or None,
            "country": str or None,
            "display": str  # Formatted for display
        },
        "industry": str or None,
        "employeeCount": int or None,
        "sizeBucket": "small" | "mid" | "large" | None,
        "sizeRange": str or None,
        "founded": int or None (year)
    }
    """
    try:
        # Get location data
        location_data = company.get("location", {}) or {}
        if not isinstance(location_data, dict):
            location_data = {}
        
        city = location_data.get("city")
        state = location_data.get("state")
        country = location_data.get("country")
        
        # Build display location
        location_parts = [p for p in [city, state, country] if p]
        display_location = ", ".join(location_parts) if location_parts else "Unknown"
        
        # Get employee count and size bucket
        employee_count = company.get("employeeCount")
        size_bucket = company.get("sizeBucket")
        
        # If we have employee count but no size bucket, calculate it
        if employee_count and isinstance(employee_count, int) and employee_count > 0:
            if not size_bucket:
                if employee_count <= 50:
                    size_bucket = "small"
                elif employee_count <= 500:
                    size_bucket = "mid"
                else:
                    size_bucket = "large"
        elif size_bucket and not employee_count:
            # Estimate employee count from size bucket
            if size_bucket == "small":
                employee_count = 25  # Midpoint of 1-50
            elif size_bucket == "mid":
                employee_count = 275  # Midpoint of 51-500
            elif size_bucket == "large":
                employee_count = 1000  # Representative large number
        
        # Get company name
        company_name = company.get("name", "Unknown Company")
        if not company_name or company_name.strip() == "":
            return None
        
        # Get website - ensure it has protocol
        website = company.get("website")
        if website:
            website = str(website).strip()
            if website and website.lower() not in ['null', 'none', '']:
                if not website.startswith("http"):
                    website = f"https://{website}"
            else:
                website = None
        
        # Get LinkedIn URL - ensure it has protocol
        linkedin_url = company.get("linkedinUrl")
        if linkedin_url:
            linkedin_url = str(linkedin_url).strip()
            if linkedin_url and linkedin_url.lower() not in ['null', 'none', '']:
                if not linkedin_url.startswith("http"):
                    linkedin_url = f"https://{linkedin_url}"
            else:
                linkedin_url = None
        
        # Generate stable ID from domain or name
        identifier = website or company_name
        if identifier:
            # Extract domain from URL if needed
            if "://" in identifier:
                identifier = identifier.split("://")[1].split("/")[0]
            firm_id = hashlib.md5(identifier.encode()).hexdigest()[:16]
        else:
            firm_id = hashlib.md5(company_name.encode()).hexdigest()[:16]
        
        # Get industry
        industry = company.get("industry")
        
        # Get founded year
        founded = company.get("founded")
        if founded and not isinstance(founded, int):
            try:
                founded = int(founded)
            except (ValueError, TypeError):
                founded = None
        
        return {
            "id": firm_id,
            "name": company_name,
            "website": website,
            "linkedinUrl": linkedin_url,
            "location": {
                "city": city,
                "state": state,
                "country": country,
                "display": display_location
            },
            "industry": industry,
            "employeeCount": employee_count,
            "sizeBucket": size_bucket,
            "sizeRange": None,  # SERP doesn't provide size ranges like PDL
            "founded": founded
        }
    
    except Exception as e:
        print(f"Error transforming SERP company: {e}")
        import traceback
        traceback.print_exc()
        return None


def transform_pdl_company_to_firm(company: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Transform a PDL company record into our Firm format.
    
    PDL returns:
    - employee_count: Integer (calculated by PDL, may be null/premium)
    - size: String like "51-200" (self-reported from LinkedIn)
    - website: Just domain like "example.com" (no https://)
    - display_name: Properly cased name
    - name: Lowercase name
    
    Output format:
    {
        "id": str,
        "name": str,
        "website": str or None,
        "linkedinUrl": str or None,
        "location": {
            "city": str or None,
            "state": str or None,
            "country": str or None,
            "display": str  # Formatted for display
        },
        "industry": str or None,
        "employeeCount": int or None,
        "sizeBucket": "small" | "mid" | "large" | None,
        "sizeRange": str or None,  # Original PDL size string
        "founded": int or None (year)
    }
    """
    try:
        # Get primary location (HQ)
        location_data = company.get("location", {}) or {}
        
        # Handle location which might be a single object or list
        if isinstance(location_data, list) and location_data:
            # Find HQ or use first
            hq = next((loc for loc in location_data if loc.get("is_hq")), location_data[0])
            location_data = hq
        
        city = location_data.get("locality") or location_data.get("name")
        state = location_data.get("region")
        country = location_data.get("country")
        
        # Build display location
        location_parts = [p for p in [city, state, country] if p]
        display_location = ", ".join(location_parts) if location_parts else "Unknown"
        
        # Get employee count - try employee_count first, then parse size string
        employee_count = company.get("employee_count")
        size_string = company.get("size")  # e.g., "51-200"
        size_bucket = None
        
        if employee_count and isinstance(employee_count, int) and employee_count > 0:
            # Use the actual employee_count if available
            if employee_count <= 50:
                size_bucket = "small"
            elif employee_count <= 500:
                size_bucket = "mid"
            else:
                size_bucket = "large"
        elif size_string:
            # Fall back to parsing size string
            employee_count = parse_size_string(size_string)
            size_bucket = get_size_bucket_from_string(size_string)
        
        # Get industry - might be string or list
        industry = company.get("industry")
        if isinstance(industry, list):
            industry = industry[0] if industry else None
        
        # Get company name - prefer display_name (proper casing) over name (lowercase)
        company_name = company.get("display_name") or company.get("name") or "Unknown Company"
        # Capitalize if it's all lowercase
        if company_name and company_name == company_name.lower():
            company_name = company_name.title()
        
        # Get website - PDL returns just domain, add https://
        # Also handle empty strings and whitespace
        website = company.get("website")
        if website:
            website = str(website).strip()
            if website and website.lower() not in ['null', 'none', '']:
                if not website.startswith("http"):
                    website = f"https://{website}"
            else:
                website = None
        
        # Get LinkedIn URL - PDL returns without protocol
        linkedin_url = company.get("linkedin_url")
        if linkedin_url:
            linkedin_url = str(linkedin_url).strip()
            if linkedin_url and linkedin_url.lower() not in ['null', 'none', '']:
                if not linkedin_url.startswith("http"):
                    linkedin_url = f"https://{linkedin_url}"
            else:
                linkedin_url = None
        
        # Generate stable ID from domain or name
        identifier = company.get("website") or company.get("name", "unknown")
        firm_id = hashlib.md5(identifier.encode()).hexdigest()[:16]
        
        return {
            "id": firm_id,
            "name": company_name,
            "website": website,
            "linkedinUrl": linkedin_url,
            "location": {
                "city": city,
                "state": state,
                "country": country,
                "display": display_location
            },
            "industry": industry,
            "employeeCount": employee_count,
            "sizeBucket": size_bucket,
            "sizeRange": size_string,  # Include original PDL size string
            "founded": company.get("founded")
        }
    
    except Exception as e:
        print(f"Error transforming company: {e}")
        import traceback
        traceback.print_exc()
        return None


# =============================================================================
# MAIN SEARCH FUNCTION - Combines parsing + PDL query
# =============================================================================

def search_firms(prompt: str, limit: int = 20) -> Dict[str, Any]:
    """
    Main entry point for firm search.
    Takes a natural language prompt, parses it, and returns matching firms.
    WITH AUTOMATIC FALLBACK if not enough results found.
    
    Returns:
        {
            "success": bool,
            "firms": list[Firm],
            "total": int,
            "parsedFilters": dict,  # What we extracted from the prompt
            "error": str or None,
            "fallbackApplied": bool,  # True if search was broadened
            "queryLevel": int  # Strictness level that succeeded
        }
    """
    # Step 1: Parse the natural language prompt
    parse_result = parse_firm_search_prompt(prompt)
    
    if not parse_result["success"]:
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "parsedFilters": parse_result.get("parsed"),
            "error": parse_result["error"],
            "fallbackApplied": False,
            "queryLevel": None
        }
    
    parsed = parse_result["parsed"]
    
    # Step 2: Normalize location
    location = normalize_location(parsed.get("location", ""))
    
    # Step 3: Search using SERP API + ChatGPT (bulletproof search handles fallbacks internally)
    from app.services.serp_client import search_companies_with_serp
    
    search_result = search_companies_with_serp(
        industry=parsed["industry"],
        location=location,
        size=parsed.get("size", "none"),
        keywords=parsed.get("keywords", []),
        limit=limit
    )
    
    # Determine if fallback was applied
    query_level = search_result.get("queryLevel")
    if query_level is None:
        query_level = 3  # Default to strictest level if None
    fallback_applied = query_level < 3
    
    # Add parsed filters to result
    search_result["parsedFilters"] = {
        "industry": parsed["industry"],
        "location": parsed["location"],
        "locationNormalized": location,
        "size": parsed.get("size", "none"),
        "keywords": parsed.get("keywords", [])
    }
    search_result["fallbackApplied"] = fallback_applied
    
    return search_result


# =============================================================================
# STRUCTURED SEARCH - For users who prefer dropdowns
# =============================================================================

def search_firms_structured(
    industry: str,
    location: str,
    size: str = "none",
    keywords: List[str] = None,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Alternative entry point using structured inputs (for dropdown UI).
    Bypasses OpenAI parsing.
    """
    if keywords is None:
        keywords = []
    
    # Validate required fields
    if not industry:
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "parsedFilters": None,
            "error": "Industry is required"
        }
    
    if not location:
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "parsedFilters": None,
            "error": "Location is required"
        }
    
    # Normalize inputs
    industry_lower = industry.lower().strip()
    
    # Check if industry is valid
    if industry_lower not in INDUSTRY_MAPPING:
        # Try to find closest match
        valid_industries = list(INDUSTRY_MAPPING.keys())
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "parsedFilters": None,
            "error": f"Invalid industry. Please choose from: {', '.join(valid_industries)}"
        }
    
    # Normalize location
    location_normalized = normalize_location(location)
    
    # Search using SERP API + ChatGPT (bulletproof search handles fallbacks internally)
    from app.services.serp_client import search_companies_with_serp
    
    search_result = search_companies_with_serp(
        industry=industry_lower,
        location=location_normalized,
        size=size,
        keywords=keywords,
        limit=limit
    )
    
    # Determine if fallback was applied
    query_level = search_result.get("queryLevel")
    if query_level is None:
        query_level = 3  # Default to strictest level if None
    fallback_applied = query_level < 3
    
    # Add parsed filters to result
    search_result["parsedFilters"] = {
        "industry": industry_lower,
        "location": location,
        "locationNormalized": location_normalized,
        "size": size,
        "keywords": keywords
    }
    search_result["fallbackApplied"] = fallback_applied
    
    return search_result


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_available_industries() -> List[Dict[str, str]]:
    """Return list of available industries for UI dropdowns."""
    return [
        {"value": "investment banking", "label": "Investment Banking"},
        {"value": "real estate private equity", "label": "Real Estate Private Equity"},
        {"value": "venture capital", "label": "Venture Capital"},
        {"value": "private equity", "label": "Private Equity"},
        {"value": "consulting", "label": "Consulting"},
        {"value": "software engineering", "label": "Software Engineering"},
        {"value": "product management", "label": "Product Management"},
        {"value": "hedge fund", "label": "Hedge Fund"},
        {"value": "asset management", "label": "Asset Management"},
        {"value": "accounting", "label": "Accounting"}
    ]


def get_size_options() -> List[Dict[str, str]]:
    """Return list of size options for UI dropdowns."""
    return [
        {"value": "none", "label": "No preference"},
        {"value": "small", "label": "Small (1-50 employees)"},
        {"value": "mid", "label": "Mid-sized (51-500 employees)"},
        {"value": "large", "label": "Large (500+ employees)"}
    ]

