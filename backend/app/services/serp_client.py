"""
SERP API Client - Google Search integration for company discovery
Replaces PDL Company Search with SERP API + ChatGPT extraction
"""
import requests
import json
from typing import Optional, List, Dict, Any
from app.config import SERPAPI_KEY

SERPAPI_BASE_URL = "https://serpapi.com/search"


def build_google_search_query(
    industry: str,
    location: Dict[str, Optional[str]],
    size: str = "none",
    keywords: List[str] = None,
    strictness: int = 3
) -> str:
    """
    Build a Google search query from structured filters.
    Mimics the PDL query building logic but for Google search.
    
    STRICTNESS LEVELS:
    - 3 (strict): All filters applied (industry + location + size + keywords)
    - 2 (medium): Industry + location + size only
    - 1 (loose): Industry + location only
    - 0 (minimal): Location only
    """
    if keywords is None:
        keywords = []
    
    query_parts = []
    
    # LEVEL 0+: Location (always include)
    if strictness >= 1:
        if location.get("locality"):
            query_parts.append(location["locality"])
        if location.get("region"):
            query_parts.append(location["region"])
        if location.get("metro"):
            query_parts.append(location["metro"])
    
    # Always include country if available
    if location.get("country"):
        country = location["country"]
        # Normalize country name
        if country.lower() in ["united states", "usa", "us"]:
            country = "United States"
        query_parts.append(country)
    
    # LEVEL 1+: Industry
    if strictness >= 1 and industry:
        # Convert industry to search-friendly terms
        industry_terms = {
            "investment banking": "investment banks",
            "real estate private equity": "real estate private equity firms",
            "venture capital": "venture capital firms",
            "private equity": "private equity firms",
            "consulting": "consulting companies",
            "software engineering": "software companies",
            "product management": "product management companies",
            "hedge fund": "hedge funds",
            "asset management": "asset management firms",
            "accounting": "accounting firms"
        }
        industry_query = industry_terms.get(industry.lower(), f"{industry} companies")
        query_parts.append(industry_query)
    
    # LEVEL 2+: Size
    if strictness >= 2 and size != "none":
        size_terms = {
            "small": "small companies",
            "mid": "mid-sized companies",
            "large": "large companies"
        }
        if size in size_terms:
            query_parts.append(size_terms[size])
    
    # LEVEL 3: Keywords
    if strictness >= 3 and keywords:
        query_parts.extend(keywords[:2])  # Limit to first 2 keywords
    
    # Build final query
    if query_parts:
        query = " ".join(query_parts)
    else:
        # Fallback: at least search by location
        if location.get("country"):
            query = f"companies in {location['country']}"
        else:
            query = "companies"
    
    return query


def search_companies_with_serp(
    industry: str,
    location: Dict[str, Optional[str]],
    size: str = "none",
    keywords: List[str] = None,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Search for companies using ChatGPT to generate firm names, then SERP to get details.
    Mimics the signature and return format of search_companies_with_pdl().
    
    NEW APPROACH:
    1. Use ChatGPT to generate a list of specific firm names based on criteria
    2. Use SERP API to search for each firm individually and get details
    3. Return structured firm data
    
    Returns:
        {
            "success": bool,
            "firms": list[Firm],
            "total": int,
            "error": str or None,
            "queryLevel": int (always 3 for this approach)
        }
    """
    # Validate API key is configured
    if not SERPAPI_KEY:
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "error": "Search service configuration error. Please contact support.",
            "queryLevel": None
        }
    
    if keywords is None:
        keywords = []
    
    try:
        # Step 1: Generate firm names using ChatGPT
        from app.services.company_extraction import generate_firm_names_with_chatgpt
        
        print(f"🤖 Step 1: Generating firm names with ChatGPT...")
        firm_names = generate_firm_names_with_chatgpt(
            filters={
                "industry": industry,
                "location": location,
                "size": size,
                "keywords": keywords
            },
            limit=limit
        )
        
        if not firm_names:
            return {
                "success": False,
                "firms": [],
                "total": 0,
                "error": "Could not generate firm names. Please try rephrasing your search.",
                "queryLevel": None
            }
        
        print(f"✅ Generated {len(firm_names)} firm names: {firm_names[:5]}...")
        
        # Step 2: Get details for each firm using SERP API (parallel processing)
        from app.services.firm_details_extraction import get_firm_details_batch
        
        print(f"🔍 Step 2: Getting details for {len(firm_names)} firms via SERP API (parallel)...")
        
        # Progress tracking
        progress_data = {"completed": 0, "total": len(firm_names)}
        
        def progress_callback(current, total):
            progress_data["completed"] = current
            if current % max(1, total // 5) == 0 or current == total:  # Log every 20% or at completion
                print(f"📊 Progress: {current}/{total} firms ({int(current/total*100)}%)")
        
        firms_data = get_firm_details_batch(
            firm_names, 
            location,
            max_workers=5,  # Process 5 firms in parallel
            progress_callback=progress_callback,
            max_results=limit  # STRICT LIMIT: Don't fetch more than requested
        )
        
        # Return partial results even if not all firms were found
        if not firms_data:
            return {
                "success": False,
                "firms": [],
                "total": 0,
                "error": "Could not retrieve firm details. Please try again.",
                "queryLevel": 3
            }
        
        # Log partial success if applicable
        if len(firms_data) < len(firm_names):
            print(f"⚠️ Retrieved {len(firms_data)}/{len(firm_names)} firms (partial results)")
        
        # Step 3: Transform to Firm format
        from app.services.company_search import transform_serp_company_to_firm
        
        firms = []
        seen_domains = set()
        
        for company_data in firms_data:
            website = company_data.get("website") or company_data.get("linkedinUrl", "")
            domain = website.replace("https://", "").replace("http://", "").split("/")[0] if website else ""
            
            if domain and domain in seen_domains:
                continue
            if domain:
                seen_domains.add(domain)
            
            firm = transform_serp_company_to_firm(company_data)
            if firm:
                firms.append(firm)
        
        # Sort firms by employee count
        firms.sort(key=lambda f: f.get('employeeCount') if f.get('employeeCount') is not None else 0)
        
        # STRICT LIMIT ENFORCEMENT: Only return exactly the number requested
        firms = firms[:limit]
        
        # Return partial results if we got some firms (better UX)
        if len(firms) > 0:
            print(f"✅ Successfully retrieved {len(firms)} firms (limit: {limit})")
            
            # If we got fewer firms than requested, include a note but still return success
            error_msg = None
            if len(firms) < limit:
                error_msg = f"Found {len(firms)} firms (requested {limit}). Some firms may not have been found."
            
            return {
                "success": True,
                "firms": firms,  # Already limited above
                "total": len(firms),
                "error": error_msg,  # Informational, not a failure
                "queryLevel": 3,
                "partial": len(firms) < len(firm_names)  # Indicate if partial results
            }
        else:
            # No firms found at all
            return {
                "success": False,
                "firms": [],
                "total": 0,
                "error": "Could not retrieve firm details. Please try again.",
                "queryLevel": 3
            }
        
    except Exception as e:
        print(f"❌ Error in search_companies_with_serp: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "error": f"Search failed: {str(e)}",
            "queryLevel": None
        }
