"""
Prompt parser service - converts natural language prompts into structured search filters
"""
import json
import re
from typing import Dict, List, Optional, Any
from app.services.openai_client import get_openai_client

# Default timeout for OpenAI prompt parsing (keep prompt search fast)
PROMPT_PARSE_TIMEOUT = 10.0


def parse_search_prompt_structured(prompt: str) -> Dict[str, Any]:
    """
    Parse a natural language search prompt into structured params with company-specific
    job titles. Uses OpenAI with structured JSON output for the new prompt-based contact search.

    Returns:
        Dict with: original_prompt, company_context (brief description of what the company does),
        companies [{name, matched_titles}], locations, schools, seniority_levels, industries,
        confidence ("high"|"low"), title_variations (flat list). On error: includes "error" key.
        If confidence is "low", caller should reject or ask user to be more specific.
    """
    client = get_openai_client()
    if not client:
        return {
            "error": "OpenAI client not available",
            "confidence": "low",
            "original_prompt": prompt,
            "company_context": "",
            "companies": [],
            "locations": [],
            "schools": [],
            "seniority_levels": [],
            "industries": [],
            "title_variations": [],
        }

    system_prompt = """You are a contact search query parser. Extract structured search parameters from a user's natural language prompt for finding professional contacts.

RULES:
1. Extract companies, locations, schools, and seniority when mentioned.
2. For EACH company mentioned, generate the REAL job titles that actual employees at that company have on LinkedIn — not job posting titles, not generic titles. Use company-specific naming:
   - Amazon: use "SDE", "Software Development Engineer", not "Software Engineer".
   - Google: use "Software Engineer", "Product Manager", not "SDE".
   - Meta: use "Software Engineer" with team suffixes where relevant, "Product Manager".
   - Finance: "Investment Banking Analyst", "Investment Banking Associate", "Investment Banking VP" — never standalone "Associate" or "VP".
3. Title variations must contain the core domain keyword. Do not use standalone generic titles like "associate", "vp", "manager", "analyst" without the domain qualifier. Examples: "investment banker", "investment banking analyst", "investment banking associate" (not "associate", "vp" alone); "software engineer", "senior software engineer" (not just "engineer" or "manager" alone).
4. Include seniority only when combined with the domain: e.g. "investment banking associate", "software engineering manager".
5. Include closely related roles: if user says "PM", include "Product Manager", "Technical Program Manager", "Program Manager".
6. Expand shorthand:
   - "FAANG" → Google, Apple, Meta, Amazon, Netflix
   - "Big 4" → Deloitte, PwC, EY, KPMG
   - "MBB" → McKinsey, Bain, BCG
7. Expand location shorthand: "NYC" → "New York", "SF" → "San Francisco", "LA" → "Los Angeles", "DC" → "Washington".
8. Set confidence to "low" ONLY when the prompt has no specifics at all — no job titles/roles, no companies, no schools, and no location. Examples of LOW confidence: "find me people", "help", "good contacts". Examples of HIGH confidence: "Software engineers from USC" (title + school), "Product managers in NYC" (title + location), "People at Google" (company), "USC alumni in consulting" (school + industry). If the prompt has at least one of: title_variations, companies, schools, or locations, set confidence to "high".
9. title_variations must be a flat, deduplicated list of ALL job titles across all companies for use in search.
10. When a company is specified, generate title variations that people ACTUALLY use at that company, not generic industry titles. Think about what the company does and what titles exist there. If the user's role description doesn't match what the company does, interpret the user's INTENT — they probably want to connect with people in a related function at that company. Examples:
   - "Investment bankers at Bain" → Bain is a consulting firm, not an investment bank. The user likely wants finance-related or client-facing roles at Bain. Generate titles like: "Consultant", "Associate Consultant", "Manager", "Senior Manager", "Partner".
   - "Investment bankers at Goldman Sachs" → Goldman IS an investment bank. Generate: "Investment Banking Analyst", "Investment Banking Associate", "Vice President", "Managing Director".
   - "Engineers at McKinsey" → McKinsey is a consulting firm that does have engineers. Generate: "Software Engineer", "Data Engineer", "Engineering Manager".
   Always think about what titles actually exist at the specified company before generating variations.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "original_prompt": "<user prompt>",
  "company_context": "<brief description of what the specified company/companies do, e.g. 'Bain & Company is a management consulting firm'. Empty string if no company specified.>",
  "companies": [{"name": "<company name>", "matched_titles": ["<title1>", "<title2>"]}],
  "locations": ["<location1>", "<location2>"],
  "schools": [],
  "seniority_levels": [],
  "industries": [],
  "confidence": "high" or "low",
  "title_variations": ["<title1>", "<title2>", ...]
}"""

    user_prompt = f'Extract search parameters from this prompt:\n\n"{prompt}"'

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=800,
            temperature=0.2,
            response_format={"type": "json_object"},
            timeout=PROMPT_PARSE_TIMEOUT,
        )
        result_text = (response.choices[0].message.content or "").strip()
        if not result_text:
            return {
                "error": "Empty response from OpenAI",
                "confidence": "low",
                "original_prompt": prompt,
                "company_context": "",
                "companies": [],
                "locations": [],
                "schools": [],
                "seniority_levels": [],
                "industries": [],
                "title_variations": [],
            }
        parsed = json.loads(result_text)
        return _validate_structured_parse(parsed, prompt)
    except json.JSONDecodeError as e:
        print(f"⚠️ Prompt parser JSON decode error: {e}")
        return {
            "error": "Failed to parse OpenAI response",
            "confidence": "low",
            "original_prompt": prompt,
            "company_context": "",
            "companies": [],
            "locations": [],
            "schools": [],
            "seniority_levels": [],
            "industries": [],
            "title_variations": [],
        }
    except Exception as e:
        print(f"⚠️ Prompt parser error: {e}")
        return {
            "error": str(e),
            "confidence": "low",
            "original_prompt": prompt,
            "company_context": "",
            "companies": [],
            "locations": [],
            "schools": [],
            "seniority_levels": [],
            "industries": [],
            "title_variations": [],
        }


def _validate_structured_parse(parsed: Dict, original_prompt: str) -> Dict[str, Any]:
    """Ensure all required keys and types; normalize lists and confidence."""
    out = {
        "original_prompt": str(parsed.get("original_prompt") or original_prompt),
        "company_context": str(parsed.get("company_context") or "").strip(),
        "companies": [],
        "locations": [],
        "schools": [],
        "seniority_levels": [],
        "industries": [],
        "confidence": "low",
        "title_variations": [],
    }
    if isinstance(parsed.get("companies"), list):
        for c in parsed["companies"]:
            if isinstance(c, dict) and c.get("name"):
                titles = c.get("matched_titles") or []
                out["companies"].append({
                    "name": str(c["name"]).strip(),
                    "matched_titles": [str(t).strip() for t in titles if t and str(t).strip()],
                })
    for key in ("locations", "schools", "seniority_levels", "industries", "title_variations"):
        val = parsed.get(key)
        if isinstance(val, list):
            out[key] = [str(x).strip() for x in val if x and str(x).strip()]
        elif isinstance(val, str) and val.strip():
            out[key] = [val.strip()]
    # Flatten title_variations from companies if not already populated
    if not out["title_variations"] and out["companies"]:
        seen = set()
        for c in out["companies"]:
            for t in c.get("matched_titles") or []:
                if t and t not in seen:
                    seen.add(t)
                    out["title_variations"].append(t)
    # Override confidence: high if we have at least one search dimension (title, company, school, or location)
    has_specifics = bool(
        out["title_variations"] or out["companies"] or out["schools"] or out["locations"]
    )
    if has_specifics:
        out["confidence"] = "high"
    else:
        conf = (parsed.get("confidence") or "").strip().lower()
        out["confidence"] = "high" if conf == "high" else "low"
    return out


def parse_search_prompt(prompt: str) -> Dict:
    """
    Parse a natural language prompt into structured search filters.
    
    Args:
        prompt: Natural language description of desired contacts
        
    Returns:
        Dictionary with extracted filters:
        {
            "company": List[str],
            "roles": List[str],
            "location": List[str],
            "schools": List[str],
            "industries": List[str],
            "max_results": int,
            "confidence": float
        }
    """
    client = get_openai_client()
    if not client:
        # Fallback if OpenAI is not available
        return _fallback_parse(prompt)
    
    system_prompt = """You are a contact search filter extraction assistant. Your job is to extract structured search parameters from natural language prompts.

CRITICAL RULES:
1. Only extract fields that are explicitly mentioned or strongly implied
2. Never hallucinate or invent filters that aren't in the prompt
3. If a field is unclear or not mentioned, use an empty array []
4. Normalize company names (e.g., "GS" → "Goldman Sachs", "JPM" → "JPMorgan Chase")
5. Normalize school names (e.g., "USC" → "University of Southern California", "NYU" → "New York University")
6. Extract job titles/roles as they appear or common variations
7. Location can be city, state, or region
8. Always return valid JSON with no additional text

SUPPORTED FIELDS:
- company: Array of company names (normalized)
- roles: Array of job titles/roles
- location: Array of locations (cities, states, regions)
- schools: Array of school/university names (normalized)
- industries: Array of industry names (if mentioned)
- max_results: Number (default 15, max 15)
- confidence: Float between 0.0 and 1.0 indicating extraction confidence

EXAMPLES:

Input: "Find USC alumni in investment banking at Goldman Sachs in New York"
Output: {
  "company": ["Goldman Sachs"],
  "roles": ["Investment Banking Analyst", "Investment Banker"],
  "location": ["New York"],
  "schools": ["University of Southern California"],
  "industries": [],
  "max_results": 15,
  "confidence": 0.95
}

Input: "Software engineers at Google in San Francisco"
Output: {
  "company": ["Google"],
  "roles": ["Software Engineer"],
  "location": ["San Francisco"],
  "schools": [],
  "industries": [],
  "max_results": 15,
  "confidence": 0.9
}

Input: "Find people"
Output: {
  "company": [],
  "roles": [],
  "location": [],
  "schools": [],
  "industries": [],
  "max_results": 15,
  "confidence": 0.1
}

Return ONLY valid JSON, no markdown, no explanations."""

    user_prompt = f"""Extract search filters from this prompt:

"{prompt}"

Return a JSON object with the exact structure shown in the examples."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=500,
            temperature=0.1  # Low temperature for consistent extraction
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Remove markdown code blocks if present
        if '```' in result_text:
            result_text = result_text.split('```')[1]
            if result_text.startswith('json'):
                result_text = result_text[4:]
            result_text = result_text.strip()
        
        # Parse JSON response
        parsed = json.loads(result_text)
        
        # Validate and normalize the response
        return _validate_and_normalize(parsed)
        
    except json.JSONDecodeError as e:
        print(f"⚠️ Failed to parse JSON from LLM response: {e}")
        print(f"Response was: {result_text}")
        return _fallback_parse(prompt)
    except Exception as e:
        print(f"⚠️ Error in prompt parsing: {e}")
        return _fallback_parse(prompt)


def _validate_and_normalize(parsed: Dict) -> Dict:
    """
    Validate and normalize the parsed response.
    
    Ensures:
    - All arrays contain only strings
    - max_results is capped at 15
    - confidence is between 0.0 and 1.0
    - All required fields are present
    """
    # Ensure all array fields are lists of strings
    array_fields = ["company", "roles", "location", "schools", "industries"]
    for field in array_fields:
        if field not in parsed:
            parsed[field] = []
        elif not isinstance(parsed[field], list):
            parsed[field] = []
        else:
            # Filter to only strings and remove empty strings
            parsed[field] = [str(item).strip() for item in parsed[field] if item and str(item).strip()]
    
    # Validate max_results
    if "max_results" not in parsed:
        parsed["max_results"] = 15
    else:
        try:
            max_results = int(parsed["max_results"])
            parsed["max_results"] = min(max(1, max_results), 15)  # Cap at 15, min 1
        except (ValueError, TypeError):
            parsed["max_results"] = 15
    
    # Validate confidence
    if "confidence" not in parsed:
        parsed["confidence"] = 0.5
    else:
        try:
            confidence = float(parsed["confidence"])
            parsed["confidence"] = max(0.0, min(1.0, confidence))
        except (ValueError, TypeError):
            parsed["confidence"] = 0.5
    
    return parsed


def _fallback_parse(prompt: str) -> Dict:
    """
    Fallback parser using simple keyword matching when LLM is unavailable.
    """
    prompt_lower = prompt.lower()
    
    # Simple keyword extraction (very basic)
    companies = []
    roles = []
    locations = []
    schools = []
    
    # Common company patterns
    company_keywords = {
        "goldman sachs": ["goldman", "gs"],
        "morgan stanley": ["morgan stanley", "ms"],
        "jpmorgan": ["jpmorgan", "jpm", "jp morgan"],
        "mckinsey": ["mckinsey"],
        "bain": ["bain"],
        "bcg": ["bcg", "boston consulting"],
        "google": ["google"],
        "microsoft": ["microsoft", "msft"],
        "amazon": ["amazon"],
        "apple": ["apple"],
        "meta": ["meta", "facebook"],
    }
    
    for company, keywords in company_keywords.items():
        if any(kw in prompt_lower for kw in keywords):
            companies.append(company)
    
    # Common role patterns
    if "investment banking" in prompt_lower or "ib" in prompt_lower:
        roles.append("Investment Banking Analyst")
    if "software engineer" in prompt_lower or "swe" in prompt_lower:
        roles.append("Software Engineer")
    if "consultant" in prompt_lower:
        roles.append("Consultant")
    
    # Common school patterns
    school_keywords = {
        "university of southern california": ["usc", "southern california"],
        "new york university": ["nyu", "new york university"],
        "stanford": ["stanford"],
        "harvard": ["harvard"],
        "mit": ["mit", "massachusetts institute"],
    }
    
    for school, keywords in school_keywords.items():
        if any(kw in prompt_lower for kw in keywords):
            schools.append(school)
    
    # Location patterns (very basic)
    if "new york" in prompt_lower:
        locations.append("New York")
    if "san francisco" in prompt_lower or "sf" in prompt_lower:
        locations.append("San Francisco")
    if "los angeles" in prompt_lower or "la" in prompt_lower:
        locations.append("Los Angeles")
    
    return {
        "company": companies,
        "roles": roles,
        "location": locations,
        "schools": schools,
        "industries": [],
        "max_results": 15,
        "confidence": 0.3  # Low confidence for fallback
    }


def parse_search_prompt_simple(prompt: str) -> Dict[str, str]:
    """
    Parse natural language search prompt into structured fields.
    
    This is a simpler version that returns single string values instead of arrays,
    designed to work with search_contacts_with_smart_location_strategy().
    
    Example: "Find me USC alumni in investment banking at Goldman in NYC"
    Returns: {
        "job_title": "investment banking analyst",
        "company": "Goldman Sachs",
        "location": "New York, NY", 
        "school": "University of Southern California"
    }
    
    Args:
        prompt: Natural language description of desired contacts
        
    Returns:
        Dictionary with extracted fields (empty strings if not mentioned):
        {
            "job_title": str,
            "company": str,
            "location": str,
            "school": str
        }
    """
    print(f"🔍 parse_search_prompt_simple called with: '{prompt}'")
    
    client = get_openai_client()
    if not client:
        print("⚠️ OpenAI client not available, using fallback parser")
        # Fallback if OpenAI is not available
        return _fallback_parse_simple(prompt)
    
    system_prompt = """You extract structured search parameters from natural language queries about finding professional contacts.

Extract these fields (use empty string "" if not mentioned):
- job_title: The role/position. Expand abbreviations: "IB" → "investment banking analyst", "PM" → "product manager", "SWE" → "software engineer"
- company: Company name. Use full official name: "Goldman" → "Goldman Sachs", "Google" → "Google"
- location: City and state. Format as "City, ST" or "City, State" when possible
- school: University for alumni filter. Use full name: "USC" → "University of Southern California", "Cal" → "UC Berkeley"

Return ONLY valid JSON with these 4 keys, no markdown, no explanation.

Example:
Input: "Find me USC alumni in investment banking at Goldman in NYC"
Output: {"job_title": "investment banking analyst", "company": "Goldman Sachs", "location": "New York, NY", "school": "University of Southern California"}

Example:
Input: "Software engineers at Google in San Francisco"
Output: {"job_title": "software engineer", "company": "Google", "location": "San Francisco, CA", "school": ""}"""

    user_prompt = f"""Extract search parameters from this prompt:

"{prompt}"

Return ONLY valid JSON with keys: job_title, company, location, school"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=300,
            temperature=0.1  # Low temperature for consistent extraction
        )
        
        result_text = response.choices[0].message.content.strip()
        print(f"🤖 LLM raw response: {result_text}")
        
        # Remove markdown code blocks if present
        if '```' in result_text:
            result_text = result_text.split('```')[1]
            if result_text.startswith('json'):
                result_text = result_text[4:]
            result_text = result_text.strip()
        
        # Parse JSON response
        parsed = json.loads(result_text)
        print(f"📋 Parsed JSON: {parsed}")
        
        # Validate and normalize - ensure all fields are strings
        result = {
            "job_title": str(parsed.get("job_title", "")).strip(),
            "company": str(parsed.get("company", "")).strip(),
            "location": str(parsed.get("location", "")).strip(),
            "school": str(parsed.get("school", "")).strip()
        }
        
        print(f"✅ Final result: {result}")
        return result
        
    except json.JSONDecodeError as e:
        print(f"⚠️ Failed to parse JSON from LLM response: {e}")
        print(f"Response was: {result_text}")
        return _fallback_parse_simple(prompt)
    except Exception as e:
        print(f"⚠️ Error in prompt parsing: {e}")
        return _fallback_parse_simple(prompt)


def _fallback_parse_simple(prompt: str) -> Dict[str, str]:
    """
    Fallback parser for simple format when LLM is unavailable.
    """
    prompt_lower = prompt.lower()
    
    job_title = ""
    company = ""
    location = ""
    school = ""
    
    # Common company patterns
    company_keywords = {
        "Goldman Sachs": ["goldman", "gs"],
        "Morgan Stanley": ["morgan stanley", "ms"],
        "JPMorgan Chase": ["jpmorgan", "jpm", "jp morgan"],
        "McKinsey": ["mckinsey"],
        "Bain": ["bain"],
        "BCG": ["bcg", "boston consulting"],
        "Google": ["google"],
        "Microsoft": ["microsoft", "msft"],
        "Amazon": ["amazon"],
        "Apple": ["apple"],
        "Meta": ["meta", "facebook"],
        "Illumina": ["illumina"],
    }
    
    for comp_name, keywords in company_keywords.items():
        if any(kw in prompt_lower for kw in keywords):
            company = comp_name
            break
    
    # Common role patterns
    if "investment banking" in prompt_lower or "ib" in prompt_lower:
        job_title = "investment banking analyst"
    elif "software engineer" in prompt_lower or "swe" in prompt_lower:
        job_title = "software engineer"
    elif "product manager" in prompt_lower or "pm" in prompt_lower:
        job_title = "product manager"
    elif "consultant" in prompt_lower:
        job_title = "consultant"
    
    # Common school patterns
    school_keywords = {
        "University of Southern California": ["usc", "southern california"],
        "New York University": ["nyu", "new york university"],
        "Stanford University": ["stanford"],
        "Harvard University": ["harvard"],
        "MIT": ["mit", "massachusetts institute"],
        "UC Berkeley": ["cal", "berkeley", "uc berkeley"],
    }
    
    for school_name, keywords in school_keywords.items():
        if any(kw in prompt_lower for kw in keywords):
            school = school_name
            break
    
    # Location patterns (very basic)
    if "new york" in prompt_lower or "nyc" in prompt_lower:
        location = "New York, NY"
    elif "san francisco" in prompt_lower or "sf" in prompt_lower:
        location = "San Francisco, CA"
    elif "los angeles" in prompt_lower or "la" in prompt_lower:
        location = "Los Angeles, CA"
    elif "san diego" in prompt_lower:
        location = "San Diego, CA"
    elif "seattle" in prompt_lower:
        location = "Seattle, WA"
    elif "boston" in prompt_lower:
        location = "Boston, MA"
    elif "chicago" in prompt_lower:
        location = "Chicago, IL"
    elif "austin" in prompt_lower:
        location = "Austin, TX"
    
    return {
        "job_title": job_title,
        "company": company,
        "location": location,
        "school": school
    }

