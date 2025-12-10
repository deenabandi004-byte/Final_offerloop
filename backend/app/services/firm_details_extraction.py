"""
Firm Details Extraction - Uses SERP API to get detailed information about specific firms
OPTIMIZED: Parallel processing, caching, timeout handling, enhanced data extraction
"""
import requests
import json
import hashlib
import time
import re
from typing import List, Dict, Any, Optional, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FutureTimeoutError
from functools import lru_cache
from app.config import SERPAPI_KEY
from app.services.openai_client import get_openai_client

SERPAPI_BASE_URL = "https://serpapi.com/search"

# In-memory cache for firm details (key: firm_name_hash, value: firm_data)
_firm_cache = {}
_cache_ttl = 3600  # 1 hour cache TTL


def _search_linkedin_url(firm_name: str, location: Dict[str, Optional[str]] = None, timeout: int = 8) -> Optional[str]:
    """
    Perform a specific search for LinkedIn company page.
    This is a fallback if LinkedIn isn't found in the main search.
    """
    if not SERPAPI_KEY:
        return None
    
    # Build LinkedIn-specific search query
    query = f"{firm_name} LinkedIn company"
    if location and location.get("locality"):
        query += f" {location['locality']}"
    
    params = {
        "q": query,
        "api_key": SERPAPI_KEY,
        "engine": "google",
        "num": 5,  # Only need a few results for LinkedIn
        "hl": "en",
        "gl": "us"
    }
    
    try:
        response = requests.get(SERPAPI_BASE_URL, params=params, timeout=timeout)
        if response.status_code == 200:
            data = response.json()
            organic_results = data.get("organic_results", [])
            
            # Look for LinkedIn URL
            for result in organic_results:
                link = result.get('link', '').lower()
                if 'linkedin.com/company' in link:
                    linkedin_url = result.get('link', '')
                    if not linkedin_url.startswith('http'):
                        linkedin_url = f"https://{linkedin_url}"
                    print(f"✅ Found LinkedIn URL via dedicated search: {linkedin_url}")
                    return linkedin_url
    except Exception as e:
        print(f"⚠️ LinkedIn search failed for {firm_name}: {e}")
    
    return None


def _get_cache_key(firm_name: str, location: Dict[str, Optional[str]] = None) -> str:
    """Generate cache key for firm search."""
    key_parts = [firm_name.lower().strip()]
    if location:
        if location.get("locality"):
            key_parts.append(location["locality"].lower())
        if location.get("region"):
            key_parts.append(location["region"].lower())
    key_str = "|".join(key_parts)
    return hashlib.md5(key_str.encode()).hexdigest()


def _get_cached_firm(cache_key: str) -> Optional[Dict[str, Any]]:
    """Get firm from cache if not expired."""
    if cache_key in _firm_cache:
        cached_data, timestamp = _firm_cache[cache_key]
        if time.time() - timestamp < _cache_ttl:
            return cached_data
        else:
            # Expired, remove from cache
            del _firm_cache[cache_key]
    return None


def _set_cached_firm(cache_key: str, firm_data: Dict[str, Any]):
    """Cache firm data with timestamp."""
    _firm_cache[cache_key] = (firm_data, time.time())


def search_firm_details_with_serp(
    firm_name: str, 
    location: Dict[str, Optional[str]] = None,
    timeout: int = 12
) -> Optional[Dict[str, Any]]:
    """
    Search for a specific firm using SERP API and extract its details.
    OPTIMIZED: Includes caching and timeout handling.
    
    Args:
        firm_name: Name of the firm to search for
        location: Optional location dict to help narrow results
        timeout: Request timeout in seconds (default: 12)
    
    Returns:
        Dictionary with firm details or None if not found
    """
    if not SERPAPI_KEY:
        return None
    
    # Check cache first
    cache_key = _get_cache_key(firm_name, location)
    cached_result = _get_cached_firm(cache_key)
    if cached_result:
        print(f"✅ Cache hit for {firm_name}")
        return cached_result
    
    # Build search query - search for the firm name with LinkedIn hint
    # For better results, include "LinkedIn" in the query to prioritize LinkedIn pages
    query = f"{firm_name} company"
    if location:
        if location.get("locality"):
            query += f" {location['locality']}"
        if location.get("region"):
            query += f" {location['region']}"
    
    params = {
        "q": query,
        "api_key": SERPAPI_KEY,
        "engine": "google",
        "num": 20,  # Get more results to find LinkedIn and other info
        "hl": "en",
        "gl": "us"
    }
    
    try:
        response = requests.get(SERPAPI_BASE_URL, params=params, timeout=timeout)
        
        if response.status_code != 200:
            print(f"⚠️ SERP API error for {firm_name}: {response.status_code}")
            return None
        
        data = response.json()
        
        # Extract information from knowledge graph (most reliable)
        knowledge_graph = data.get("knowledge_graph")
        organic_results = data.get("organic_results", [])
        
        # Extract structured data from knowledge graph first (most reliable)
        kg_data = {}
        if knowledge_graph:
            kg_data = {
                "name": knowledge_graph.get("title") or knowledge_graph.get("name"),
                "website": knowledge_graph.get("website") or knowledge_graph.get("official_website"),
                "description": knowledge_graph.get("description") or knowledge_graph.get("about"),
                "type": knowledge_graph.get("type"),
                "founded": knowledge_graph.get("founded"),
                "employees": knowledge_graph.get("employees") or knowledge_graph.get("number_of_employees"),
                "headquarters": knowledge_graph.get("headquarters"),
                "industry": knowledge_graph.get("industry") or knowledge_graph.get("sector"),
            }
            
            # Extract location from headquarters if available
            if kg_data.get("headquarters"):
                hq = kg_data["headquarters"]
                if isinstance(hq, str):
                    # Try to parse location string
                    kg_data["location_str"] = hq
                elif isinstance(hq, dict):
                    kg_data["location"] = {
                        "city": hq.get("city") or hq.get("locality"),
                        "state": hq.get("state") or hq.get("region"),
                        "country": hq.get("country")
                    }
        
        # Look for LinkedIn URL specifically in organic results
        linkedin_url = None
        website_url = kg_data.get("website")
        
        # First pass: Look for LinkedIn and website in organic results
        for result in organic_results:
            link = result.get('link', '').lower()
            title = result.get('title', '').lower()
            
            # Check for LinkedIn (prioritize company pages)
            if 'linkedin.com/company' in link:
                linkedin_url = result.get('link', '')
                if not linkedin_url.startswith('http'):
                    linkedin_url = f"https://{linkedin_url}"
                print(f"✅ Found LinkedIn URL in organic results: {linkedin_url}")
                break
            elif 'linkedin.com' in link and not linkedin_url:
                # Fallback to any LinkedIn URL
                linkedin_url = result.get('link', '')
                if not linkedin_url.startswith('http'):
                    linkedin_url = f"https://{linkedin_url}"
        
        # Normalize website URL
        if website_url and not website_url.startswith('http'):
            website_url = f"https://{website_url}"
        
        # If no LinkedIn found, try a specific LinkedIn search
        if not linkedin_url:
            linkedin_url = _search_linkedin_url(firm_name, location, timeout=8)
        
        # Use ChatGPT to extract structured data from SERP results
        client = get_openai_client()
        if not client:
            return None
        
        # Prepare enhanced context for ChatGPT
        context_parts = []
        
        if knowledge_graph:
            # Include full knowledge graph data with extracted fields highlighted
            kg_display = {
                "title": knowledge_graph.get("title"),
                "name": knowledge_graph.get("name"),
                "website": knowledge_graph.get("website") or knowledge_graph.get("official_website"),
                "description": knowledge_graph.get("description") or knowledge_graph.get("about"),
                "type": knowledge_graph.get("type"),
                "founded": knowledge_graph.get("founded"),
                "employees": knowledge_graph.get("employees") or knowledge_graph.get("number_of_employees"),
                "headquarters": knowledge_graph.get("headquarters"),
                "industry": knowledge_graph.get("industry"),
                "sector": knowledge_graph.get("sector"),
                "full_data": knowledge_graph  # Include full data for comprehensive extraction
            }
            context_parts.append(f"Knowledge Graph (MOST RELIABLE - use this data first):\n{json.dumps(kg_display, indent=2)}")
        
        # Add more organic results (up to 10) to find more information
        for i, result in enumerate(organic_results[:10], 1):
            link = result.get('link', '')
            # Highlight LinkedIn and company website results
            is_linkedin = 'linkedin.com' in link.lower()
            is_company_site = any(domain in link.lower() for domain in ['.com', '.org', '.io']) and not any(skip in link.lower() for skip in ['wikipedia', 'crunchbase', 'glassdoor'])
            
            highlight = ""
            if is_linkedin:
                highlight = " [LINKEDIN PAGE]"
            elif is_company_site and firm_name.lower().replace(' ', '') in link.lower().replace('www.', '').replace('https://', '').replace('http://', '').split('.')[0]:
                highlight = " [COMPANY WEBSITE]"
            
            context_parts.append(f"""
Result {i}{highlight}:
  Title: {result.get('title', '')}
  Link: {link}
  Snippet: {result.get('snippet', '')}
""")
        
        context = "\n".join(context_parts)
        
        # Enhanced prompt - more thorough extraction with location validation
        location_str = ""
        if location:
            location_parts = [v for v in [
                location.get("locality"),
                location.get("region"),
                location.get("country")
            ] if v]
            location_str = ", ".join(location_parts)
        
        system_prompt = """You are an expert at extracting company information from Google search results. 
For well-known companies, you should be able to find comprehensive information including LinkedIn URLs, employee counts, and locations.
Pay special attention to:
- LinkedIn company pages (linkedin.com/company/...)
- Official company websites
- Knowledge Graph data (most reliable)
- Company size information from snippets
- Location validation (CRITICAL: verify company is in the requested location)
Return ONLY valid JSON, no markdown, no explanations."""

        user_prompt = f"""Company Name: {firm_name}
Requested Location: {location_str if location_str else 'Not specified'}

Search Results:
{context}

Extract comprehensive company information. PRIORITIZE Knowledge Graph data - it's the most reliable source.

CRITICAL LOCATION REQUIREMENT:
- The company MUST be located in: {location_str if location_str else 'any location'}
- Extract the EXACT location (city, state, country) from Knowledge Graph headquarters or search results
- If the company's location does not match the requested location, you should still extract the data but note the mismatch

Required fields:
- name: Official company name (exact match to "{firm_name}" or from Knowledge Graph)
- website: Official company website URL (from Knowledge Graph website field, or company domain in results)
- linkedinUrl: LinkedIn company page URL (look for "linkedin.com/company/" URLs in results, format: https://linkedin.com/company/company-name)
- location: {{"city": string or null, "state": string or null, "country": string or null}} 
  * Extract from Knowledge Graph headquarters field first (MOST RELIABLE)
  * Then from result snippets or location mentions
  * Be precise: extract the actual headquarters location, not just any office location
- industry: Primary industry/sector (from Knowledge Graph industry/sector, or infer from description)
  * Be specific: "Investment Banking", "Management Consulting", "Venture Capital", etc.
- employeeCount: Number of employees (integer or null)
  * Look in Knowledge Graph "employees" or "number_of_employees" field
  * Or extract from snippets like "10,000 employees", "50,000+ employees"
  * For large companies, this should be available
- sizeBucket: "small" (1-50), "mid" (51-500), "large" (500+), or null
  * Calculate from employeeCount if available
- founded: Year founded (4-digit integer or null)
  * From Knowledge Graph "founded" field, or extract from snippets

EXTRACTION RULES:
1. ALWAYS check Knowledge Graph first - it has the most accurate data
2. For LinkedIn: Look for "linkedin.com/company/" URLs in organic results
3. For employee count: Knowledge Graph > snippets with numbers > size descriptions
4. For location: Knowledge Graph headquarters > location mentions in snippets
5. For well-known companies (Fortune 500, major brands), most fields should be found
6. Use null (not empty string) if information is truly not available
7. LOCATION ACCURACY: Extract the actual headquarters location, not branch offices

Return ONLY a JSON object (no markdown, no explanations):
{{
  "name": "...",
  "website": "...",
  "linkedinUrl": "...",
  "location": {{"city": "...", "state": "...", "country": "..."}},
  "industry": "...",
  "employeeCount": 10000,
  "sizeBucket": "large",
  "founded": 2010
}}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            max_tokens=800  # Increased for more detailed extraction
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Clean up response
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()
        
        try:
            company_data = json.loads(result_text)
            
            # Validate required fields
            if not company_data.get("name"):
                return None
            
            # Normalize data - use pre-found URLs and Knowledge Graph data if available
            # Prioritize: Knowledge Graph > ChatGPT extraction > Pre-found URLs
            
            # Get employee count - try multiple sources
            employee_count = None
            if kg_data.get("employees"):
                # Knowledge Graph employees might be a string like "10,000" or number
                emp_val = kg_data["employees"]
                if isinstance(emp_val, (int, float)):
                    employee_count = int(emp_val)
                elif isinstance(emp_val, str):
                    # Extract number from string like "10,000 employees" or "50,000+"
                    numbers = re.findall(r'[\d,]+', emp_val.replace(',', ''))
                    if numbers:
                        try:
                            employee_count = int(numbers[0].replace(',', ''))
                        except:
                            pass
            
            # Fallback to ChatGPT extraction
            if not employee_count:
                employee_count = company_data.get("employeeCount") or company_data.get("employees")
                if isinstance(employee_count, str):
                    # Try to extract number from string
                    numbers = re.findall(r'[\d,]+', employee_count.replace(',', ''))
                    if numbers:
                        try:
                            employee_count = int(numbers[0].replace(',', ''))
                        except:
                            employee_count = None
            
            # Get founded year
            founded_year = kg_data.get("founded") or company_data.get("founded") or company_data.get("foundedYear")
            if isinstance(founded_year, str):
                # Extract 4-digit year
                years = re.findall(r'\b(19|20)\d{2}\b', founded_year)
                if years:
                    try:
                        founded_year = int(years[0])
                    except:
                        founded_year = None
            
            # Get location - prioritize Knowledge Graph
            location_data = company_data.get("location") or {}
            if kg_data.get("location"):
                # Use Knowledge Graph location if available
                location_data = kg_data["location"]
            elif kg_data.get("location_str"):
                # Try to parse location string from Knowledge Graph
                loc_str = kg_data["location_str"]
                # Simple parsing - could be improved
                parts = [p.strip() for p in loc_str.split(',')]
                if len(parts) >= 3:
                    location_data = {"city": parts[0], "state": parts[1], "country": parts[2]}
                elif len(parts) == 2:
                    location_data = {"city": parts[0], "state": parts[1], "country": None}
                elif len(parts) == 1:
                    location_data = {"city": parts[0], "state": None, "country": None}
            
            validated_company = {
                "name": kg_data.get("name") or company_data.get("name", "").strip() or firm_name,
                "website": website_url or company_data.get("website") or company_data.get("websiteUrl") or None,
                "linkedinUrl": linkedin_url or company_data.get("linkedinUrl") or company_data.get("linkedin") or None,
                "location": location_data if isinstance(location_data, dict) else {},
                "industry": kg_data.get("industry") or company_data.get("industry") or company_data.get("sector") or None,
                "employeeCount": employee_count,
                "sizeBucket": company_data.get("sizeBucket") or company_data.get("size") or None,
                "founded": founded_year
            }
            
            # Calculate sizeBucket from employeeCount if not provided
            if not validated_company["sizeBucket"] and validated_company["employeeCount"]:
                emp = validated_company["employeeCount"]
                if emp <= 50:
                    validated_company["sizeBucket"] = "small"
                elif emp <= 500:
                    validated_company["sizeBucket"] = "mid"
                else:
                    validated_company["sizeBucket"] = "large"
            
            # Clean up URLs
            if validated_company["website"]:
                website = validated_company["website"].strip()
                if website and not website.startswith("http"):
                    validated_company["website"] = f"https://{website}"
                else:
                    validated_company["website"] = website
            
            if validated_company["linkedinUrl"]:
                linkedin = validated_company["linkedinUrl"].strip()
                if linkedin and not linkedin.startswith("http"):
                    validated_company["linkedinUrl"] = f"https://{linkedin}"
                else:
                    validated_company["linkedinUrl"] = linkedin
            
            # Ensure location is a dict
            if not isinstance(validated_company["location"], dict):
                validated_company["location"] = {}
            
            # Cache the result
            _set_cached_firm(cache_key, validated_company)
            
            return validated_company
            
        except json.JSONDecodeError as e:
            print(f"⚠️ Failed to parse company data for {firm_name}: {e}")
            return None
        
    except requests.exceptions.Timeout:
        print(f"⏰ Timeout searching firm details for {firm_name}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"🌐 Request error for {firm_name}: {e}")
        return None
    except Exception as e:
        print(f"❌ Error searching firm details for {firm_name}: {e}")
        return None


def get_firm_details_batch(
    firm_names: List[str], 
    location: Dict[str, Optional[str]] = None,
    max_workers: int = 5,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    max_results: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Get details for multiple firms in batch using parallel processing.
    OPTIMIZED: Parallel execution, deduplication, timeout handling.
    
    Args:
        firm_names: List of firm names to search for
        location: Optional location to help narrow results
        max_workers: Maximum number of parallel workers (default: 5)
        progress_callback: Optional callback function(current, total) for progress updates
        max_results: Optional maximum number of results to return (enforces strict limit)
    
    Returns:
        List of firm detail dictionaries (limited to max_results if provided)
    """
    # Deduplicate firm names (case-insensitive)
    seen_names = set()
    unique_names = []
    for name in firm_names:
        name_lower = name.lower().strip()
        if name_lower and name_lower not in seen_names:
            seen_names.add(name_lower)
            unique_names.append(name)
    
    if len(unique_names) < len(firm_names):
        print(f"🔍 Deduplicated {len(firm_names)} -> {len(unique_names)} unique firm names")
    
    # Apply max_results limit if provided
    if max_results is not None and len(unique_names) > max_results:
        unique_names = unique_names[:max_results]
        print(f"🔍 Limited to {max_results} firm names (requested limit)")
    
    firms = []
    total = len(unique_names)
    completed = 0
    
    # Use ThreadPoolExecutor for parallel processing
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_name = {
            executor.submit(search_firm_details_with_serp, name, location): name
            for name in unique_names
        }
        
        # Process completed tasks
        for future in as_completed(future_to_name):
            firm_name = future_to_name[future]
            completed += 1
            
            try:
                # Use timeout for individual future (additional safety)
                details = future.result(timeout=15)
                if details:
                    firms.append(details)
                
                # Progress callback
                if progress_callback:
                    progress_callback(completed, total)
                
            except FutureTimeoutError:
                print(f"⏰ Timeout getting details for {firm_name}")
            except Exception as e:
                print(f"❌ Error getting details for {firm_name}: {e}")
    
    # STRICT LIMIT ENFORCEMENT: Apply max_results limit if provided
    if max_results is not None:
        if len(firms) > max_results:
            firms = firms[:max_results]
            print(f"🔍 Limited results to {max_results} firms (requested limit)")
        elif len(firms) < max_results:
            print(f"⚠️ Only retrieved {len(firms)}/{max_results} firms (some may have failed)")
    
    print(f"✅ Retrieved details for {len(firms)}/{total} firms (limit: {max_results})")
    return firms
