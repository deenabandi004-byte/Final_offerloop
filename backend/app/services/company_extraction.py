"""
Company Data Extraction Service - Uses ChatGPT to generate firm names, then SERP to get details
"""
import json
import re
from typing import List, Dict, Any, Optional
from app.services.openai_client import get_openai_client


def generate_firm_names_with_chatgpt(
    filters: Dict[str, Any],
    limit: int = 20
) -> List[str]:
    """
    Use ChatGPT to generate a list of specific firm names based on search criteria.
    This is the first step - ChatGPT suggests actual company names.
    
    Args:
        filters: Search filters (industry, location, size, keywords)
        limit: Maximum number of firm names to generate
    
    Returns:
        List of firm names (strings)
    """
    client = get_openai_client()
    if not client:
        print("⚠️ OpenAI client not available")
        return []
    
    industry = filters.get("industry", "")
    location_info = filters.get("location", {})
    location_str = ", ".join([v for v in [
        location_info.get("locality"),
        location_info.get("region"),
        location_info.get("country")
    ] if v])
    size = filters.get("size", "none")
    keywords = filters.get("keywords", [])
    
    # Optimized prompt - shorter, more focused
    system_prompt = """Generate specific company names matching criteria. Return JSON array only."""

    user_prompt = f"""Industry: {industry}, Location: {location_str}, Size: {size if size != 'none' else 'any'}{f', Keywords: {", ".join(keywords)}' if keywords else ''}

List {limit} well-known companies matching these criteria. Return JSON array:
["Company 1", "Company 2", ...]"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,  # Slightly higher for more variety
            max_tokens=1000
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Clean up response - remove markdown code blocks if present
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()
        
        # Parse JSON response
        try:
            parsed = json.loads(result_text)
            
            # Handle different response formats
            if isinstance(parsed, list):
                firm_names = [str(name).strip() for name in parsed if name]
            elif isinstance(parsed, dict):
                # Check for common keys
                firm_names = parsed.get("companies", parsed.get("names", parsed.get("firms", [])))
                if not isinstance(firm_names, list):
                    firm_names = []
                firm_names = [str(name).strip() for name in firm_names if name]
            else:
                firm_names = []
            
            # Remove duplicates and STRICTLY limit to requested amount
            seen = set()
            unique_names = []
            for name in firm_names:
                name_lower = name.lower().strip()
                if name_lower and name_lower not in seen:
                    seen.add(name_lower)
                    unique_names.append(name.strip())
                    if len(unique_names) >= limit:
                        break
            
            # STRICT LIMIT: Ensure we never return more than requested
            unique_names = unique_names[:limit]
            
            print(f"✅ Generated {len(unique_names)} firm names from ChatGPT (limit: {limit})")
            return unique_names
            
        except json.JSONDecodeError as e:
            print(f"⚠️ Failed to parse ChatGPT JSON response: {e}")
            print(f"Response text (first 500 chars): {result_text[:500]}")
            # Try to extract JSON array from text
            json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
            if json_match:
                try:
                    parsed = json.loads(json_match.group())
                    if isinstance(parsed, list):
                        firm_names = [str(name).strip() for name in parsed if name]
                        print(f"✅ Recovered {len(firm_names)} firm names after JSON parse error")
                        return firm_names[:limit]
                except:
                    pass
            return []
        
    except Exception as e:
        print(f"❌ Error generating firm names: {e}")
        import traceback
        traceback.print_exc()
        return []


def extract_company_data_from_serp(
    serp_results: List[Dict[str, Any]],
    filters: Dict[str, Any],
    limit: int = 20
) -> List[Dict[str, Any]]:
    """
    Use ChatGPT to extract structured company data from SERP search results.
    
    Args:
        serp_results: List of SERP result objects (organic, knowledge_graph, local)
        filters: Original search filters (industry, location, size, keywords)
        limit: Maximum number of companies to extract
    
    Returns:
        List of extracted company data dictionaries
    """
    if not serp_results:
        return []
    
    client = get_openai_client()
    if not client:
        print("⚠️ OpenAI client not available")
        return []
    
    # Prepare SERP results for ChatGPT
    results_text = []
    for i, result in enumerate(serp_results[:limit * 2], 1):  # Get more to account for filtering
        source = result.get("source", "unknown")
        title = result.get("title", "")
        link = result.get("link", "")
        snippet = result.get("snippet", "")
        displayed_link = result.get("displayed_link", link)
        
        # Include knowledge graph data if available
        kg_data = ""
        if result.get("knowledge_graph"):
            kg = result["knowledge_graph"]
            kg_data = f"\n  Knowledge Graph: {json.dumps(kg, indent=2)}"
        
        result_str = f"""
Result {i} ({source}):
  Title: {title}
  Link: {link}
  Displayed Link: {displayed_link}
  Snippet: {snippet}{kg_data}
"""
        results_text.append(result_str)
    
    serp_text = "\n".join(results_text)
    
    # Build extraction prompt
    industry = filters.get("industry", "")
    location_info = filters.get("location", {})
    location_str = ", ".join([v for v in [
        location_info.get("locality"),
        location_info.get("region"),
        location_info.get("country")
    ] if v])
    size = filters.get("size", "none")
    keywords = filters.get("keywords", [])
    
    system_prompt = """You are a company data extraction assistant. Extract structured company information from Google search results.

Your task is to identify companies from search results and extract their information. Focus on:
1. Companies that match the search criteria (industry, location, size)
2. Real companies (not job listings, news articles, or directories)
3. Companies with official websites or LinkedIn pages

For each company found, extract:
- name: Official company name
- website: Official website URL (if found)
- linkedinUrl: LinkedIn company page URL (if found)
- location: {city: string or null, state: string or null, country: string or null}
- industry: Primary industry/sector
- employeeCount: Estimated employee count (number or null if unknown)
- sizeBucket: "small" (1-50), "mid" (51-500), "large" (500+), or null if unknown
- founded: Year founded (number or null if unknown)

IMPORTANT:
- Only extract companies that are actual businesses (not directories, job sites, or news articles)
- If employee count is not available, try to infer from size descriptions (e.g., "mid-sized", "small", "large")
- Extract location from the result snippet, link, or knowledge graph
- Return a valid JSON array of company objects, no markdown code blocks, no explanations
- If a result is not a company, skip it
- Deduplicate companies by website domain
- Format: [{"name": "...", "website": "...", ...}, ...]"""

    user_prompt = f"""Search Criteria:
- Industry: {industry}
- Location: {location_str}
- Size: {size if size != 'none' else 'any'}
- Keywords: {', '.join(keywords) if keywords else 'none'}

Search Results:
{serp_text}

Extract company information for up to {limit} companies that match the criteria. 

Return ONLY a JSON array in this exact format (no markdown, no code blocks, no explanations):
[
  {{
    "name": "Company Name",
    "website": "https://example.com",
    "linkedinUrl": "https://linkedin.com/company/example",
    "location": {{"city": "City", "state": "State", "country": "Country"}},
    "industry": "Industry",
    "employeeCount": 100,
    "sizeBucket": "mid",
    "founded": 2010
  }}
]"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            max_tokens=2000
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Clean up response - remove markdown code blocks if present
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()
        
        # Parse JSON response
        # The response might be wrapped in a "companies" key or be a direct array
        try:
            parsed = json.loads(result_text)
            
            # Handle different response formats
            if isinstance(parsed, list):
                companies = parsed
            elif isinstance(parsed, dict):
                # Check for common keys
                companies = parsed.get("companies", parsed.get("data", parsed.get("results", [])))
                if not isinstance(companies, list):
                    companies = [parsed] if parsed else []
            else:
                companies = []
            
            # Validate and clean extracted data
            validated_companies = []
            for company in companies[:limit]:
                if not isinstance(company, dict):
                    continue
                
                # Ensure required fields exist
                if not company.get("name"):
                    continue
                
                # Normalize data
                validated_company = {
                    "name": company.get("name", "").strip(),
                    "website": company.get("website") or company.get("websiteUrl") or None,
                    "linkedinUrl": company.get("linkedinUrl") or company.get("linkedin") or None,
                    "location": company.get("location") or {},
                    "industry": company.get("industry") or company.get("sector") or None,
                    "employeeCount": company.get("employeeCount") or company.get("employees") or None,
                    "sizeBucket": company.get("sizeBucket") or company.get("size") or None,
                    "founded": company.get("founded") or company.get("foundedYear") or None
                }
                
                # Ensure location is a dict
                if not isinstance(validated_company["location"], dict):
                    validated_company["location"] = {}
                
                validated_companies.append(validated_company)
            
            print(f"✅ Extracted {len(validated_companies)} companies from SERP results")
            if len(validated_companies) == 0:
                print(f"⚠️ DEBUG: No companies validated. Parsed companies: {len(companies)}")
                print(f"⚠️ DEBUG: First parsed item type: {type(companies[0]) if companies else 'None'}")
                if companies:
                    print(f"⚠️ DEBUG: First parsed item: {json.dumps(companies[0], indent=2)[:500]}")
            return validated_companies
            
        except json.JSONDecodeError as e:
            print(f"⚠️ Failed to parse ChatGPT JSON response: {e}")
            print(f"Response text (first 1000 chars): {result_text[:1000]}")
            # Try to extract JSON from the response if it's wrapped in text
            import re
            json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
            if json_match:
                try:
                    parsed = json.loads(json_match.group())
                    if isinstance(parsed, list):
                        companies = parsed
                    else:
                        companies = []
                except:
                    companies = []
            else:
                companies = []
            
            # Continue with validation if we found companies
            if companies:
                validated_companies = []
                for company in companies[:limit]:
                    if not isinstance(company, dict) or not company.get("name"):
                        continue
                    validated_company = {
                        "name": company.get("name", "").strip(),
                        "website": company.get("website") or company.get("websiteUrl") or None,
                        "linkedinUrl": company.get("linkedinUrl") or company.get("linkedin") or None,
                        "location": company.get("location") or {},
                        "industry": company.get("industry") or company.get("sector") or None,
                        "employeeCount": company.get("employeeCount") or company.get("employees") or None,
                        "sizeBucket": company.get("sizeBucket") or company.get("size") or None,
                        "founded": company.get("founded") or company.get("foundedYear") or None
                    }
                    if not isinstance(validated_company["location"], dict):
                        validated_company["location"] = {}
                    validated_companies.append(validated_company)
                print(f"✅ Recovered {len(validated_companies)} companies after JSON parse error")
                return validated_companies
            
            return []
        
    except Exception as e:
        print(f"❌ Error extracting company data: {e}")
        import traceback
        traceback.print_exc()
        return []
