"""
Job posting parser service - extract structured data from job posting URLs
"""
import aiohttp
import asyncio
import json
from bs4 import BeautifulSoup
from typing import Dict, Optional, Tuple
from app.services.openai_client import get_openai_client

# ============================================================================
# ROLE CATEGORY DETECTION - CRITICAL FOR CORRECT CONTENT
# ============================================================================
ROLE_CATEGORY_KEYWORDS = {
    "Consulting": [
        "consultant", "consulting", "advisory", "strategy", "management consulting",
        "case interview", "McKinsey", "BCG", "Bain", "Deloitte Consulting", 
        "Accenture Strategy", "client-facing", "engagement manager"
    ],
    "Software Engineering": [
        "software engineer", "software developer", "SWE", "backend", "frontend",
        "full stack", "fullstack", "developer", "programmer", "coding",
        "algorithms", "data structures", "system design", "DevOps", "SRE",
        "mobile developer", "iOS", "Android", "web developer"
    ],
    "Product Management": [
        "product manager", "PM", "product owner", "product lead",
        "product strategy", "product development", "roadmap", "PRD",
        "user research", "product sense"
    ],
    "Data Science": [
        "data scientist", "data science", "machine learning", "ML engineer",
        "data analyst", "analytics", "statistician", "AI engineer",
        "research scientist", "deep learning", "NLP"
    ],
    "Finance": [
        "investment banking", "IB analyst", "private equity", "PE",
        "hedge fund", "asset management", "equity research", "trader",
        "financial analyst", "M&A", "DCF", "valuation", "capital markets",
        "wealth management", "banking analyst"
    ],
    "Marketing": [
        "marketing", "brand manager", "growth", "digital marketing",
        "content marketing", "SEO", "SEM", "social media", "campaign",
        "marketing manager", "CMO"
    ],
    "Design": [
        "UX designer", "UI designer", "product designer", "design",
        "user experience", "user interface", "visual designer",
        "interaction designer", "design systems"
    ],
    "Operations": [
        "operations", "supply chain", "logistics", "program manager",
        "project manager", "business operations", "chief of staff"
    ]
}

COMPANY_CATEGORY_HINTS = {
    # Consulting firms - ALWAYS use consulting interview style
    "mckinsey": "Consulting",
    "bcg": "Consulting", 
    "bain": "Consulting",
    "deloitte": "Consulting",  # Deloitte is primarily a consulting firm
    "deloitte consulting": "Consulting",
    "accenture": "Consulting",  # Accenture is primarily consulting
    "accenture strategy": "Consulting",
    "kearney": "Consulting",
    "oliver wyman": "Consulting",
    "roland berger": "Consulting",
    "strategy&": "Consulting",
    "lek consulting": "Consulting",
    
    # Banks - Use finance interview style
    "goldman sachs": "Finance",
    "morgan stanley": "Finance",
    "jp morgan": "Finance",
    "jpmorgan": "Finance",
    "bank of america": "Finance",
    "citi": "Finance",
    "barclays": "Finance",
    "credit suisse": "Finance",
    "ubs": "Finance",
    "deutsche bank": "Finance",
    "blackstone": "Finance",
    "kkr": "Finance",
    "carlyle": "Finance",
}


def detect_role_category(job_title: str, job_text: str, company_name: str = "") -> str:
    """
    Detect the role category based on job title, description, and company.
    This is CRITICAL - wrong category = completely wrong prep content!
    """
    # First check company hints (strongest signal)
    if company_name:
        company_lower = company_name.lower()
        for company_key, category in COMPANY_CATEGORY_HINTS.items():
            if company_key in company_lower:
                return category
    
    # Then check keywords in title and text
    combined_text = f"{job_title} {job_text}".lower()
    
    # Score each category based on keyword matches
    scores = {}
    for category, keywords in ROLE_CATEGORY_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword.lower() in combined_text)
        scores[category] = score
    
    # Return the category with highest score, or "Other" if no matches
    best_category = max(scores, key=scores.get)
    if scores[best_category] > 0:
        return best_category
    return "Other"


async def fetch_job_posting(url: str) -> Tuple[str, Dict]:
    """
    Fetch the raw HTML/text content from a job posting URL.
    Returns both the text content and extracted metadata.
    """
    # Normalize URL - add https:// if missing
    url = url.strip()
    if not url.startswith(('http://', 'https://')):
        url = f'https://{url}'
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }
    metadata = {}
    
    max_retries = 3
    retry_delay = 2  # seconds
    
    try:
        async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as session:
            for attempt in range(max_retries):
                async with session.get(url) as resp:
                    # Success
                    if resp.status == 200:
                        html = await resp.text()
                        soup = BeautifulSoup(html, 'html.parser')
                        
                        # Try to extract metadata from structured data (JSON-LD, microdata, meta tags)
                        # Many job sites use structured data for SEO
                        json_ld_scripts = soup.find_all('script', type='application/ld+json')
                        for script in json_ld_scripts:
                            try:
                                data = json.loads(script.string)
                                if isinstance(data, dict):
                                    # Look for job posting schema
                                    if data.get('@type') == 'JobPosting' or 'JobPosting' in str(data.get('@type', '')):
                                        if 'hiringOrganization' in data:
                                            org = data['hiringOrganization']
                                            if isinstance(org, dict):
                                                metadata['company_name'] = org.get('name', '')
                                        if 'title' in data:
                                            metadata['job_title'] = data['title']
                                        if 'jobLocation' in data:
                                            loc = data['jobLocation']
                                            if isinstance(loc, dict):
                                                address = loc.get('address', {})
                                                if isinstance(address, dict):
                                                    metadata['location'] = address.get('addressLocality', '')
                            except:
                                pass
                        
                        # Try meta tags (og:title, og:description, etc.)
                        meta_title = soup.find('meta', property='og:title')
                        if meta_title and meta_title.get('content'):
                            if not metadata.get('job_title'):
                                metadata['job_title'] = meta_title.get('content')
                        
                        meta_desc = soup.find('meta', property='og:description')
                        if meta_desc and meta_desc.get('content'):
                            metadata['description'] = meta_desc.get('content')
                        
                        # Try to find company name in various places
                        if not metadata.get('company_name'):
                            # Check for company in meta tags
                            company_meta = soup.find('meta', attrs={'name': 'company'}) or \
                                          soup.find('meta', attrs={'property': 'og:site_name'})
                            if company_meta:
                                metadata['company_name'] = company_meta.get('content', '')
                        
                        # Remove script and style elements
                        for element in soup(['script', 'style', 'nav', 'footer', 'header']):
                            element.decompose()
                        
                        # Get text content
                        text_content = soup.get_text(separator='\n', strip=True)
                        
                        return text_content, metadata
                    
                    # 202 Accepted - content not ready yet, retry
                    elif resp.status == 202:
                        if attempt < max_retries - 1:
                            await asyncio.sleep(retry_delay)
                            continue
                        else:
                            raise Exception(f"Job posting not ready after {max_retries} attempts (HTTP 202)")
                    
                    # Other errors
                    else:
                        raise Exception(f"Failed to fetch job posting: HTTP {resp.status}")
            
            raise Exception(f"Failed to fetch job posting after {max_retries} attempts")
    except aiohttp.ClientError as e:
        raise Exception(f"Failed to fetch job posting: {str(e)}")
    except Exception as e:
        raise Exception(f"Failed to fetch job posting: {str(e)}")


def extract_job_details(job_text: str) -> Dict:
    """Use OpenAI to extract structured info from job posting text"""
    client = get_openai_client()
    if not client:
        raise Exception("OpenAI client not available")
    
    prompt = """Extract the following information from this job posting. 
Return as JSON. If a field is not found, set it to null.

IMPORTANT for role_category: Choose based on these rules:
- "Consulting" if: Management consulting, strategy consulting, case interviews mentioned (McKinsey, BCG, Bain, Deloitte Consulting, etc.)
- "Software Engineering" if: Software development, coding, algorithms, system design
- "Product Management" if: Product manager, PM, product owner, roadmap
- "Data Science" if: Data scientist, ML engineer, analytics, statistics
- "Finance" if: Investment banking, PE, hedge fund, trading, financial analyst
- "Marketing" if: Marketing, brand, growth, digital marketing
- "Design" if: UX/UI, product design, visual design
- "Operations" if: Operations, supply chain, program management

{
    "company_name": "string",
    "company_domain": "string (e.g., google.com)",
    "job_title": "string",
    "level": "Intern | Entry-Level | Mid-Level | Senior | Staff | Principal | Manager | Director | VP | null",
    "team_division": "string or null (e.g., 'Google Cloud', 'AWS', 'Investment Banking Division')",
    "location": "string",
    "remote_policy": "Remote | Hybrid | On-site | null",
    "required_skills": ["skill1", "skill2", ...],
    "preferred_skills": ["skill1", "skill2", ...],
    "years_experience": "string or null (e.g., '3-5 years')",
    "job_type": "Full-time | Part-time | Contract | Internship",
    "key_responsibilities": ["responsibility1", "responsibility2", ...],
    "interview_hints": "string or null (any mentions of interview process in the posting)",
    "salary_range": "string or null (if mentioned)",
    "role_category": "Consulting | Software Engineering | Product Management | Data Science | Finance | Marketing | Design | Operations | Other"
}

Job Posting:
""" + job_text[:15000]  # Limit to avoid token limits
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at extracting structured information from job postings. You always return valid JSON."
                },
                {"role": "user", "content": prompt}
            ],
            max_tokens=2000,
            temperature=0.1,
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Remove markdown if present
        if '```' in response_text:
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
            response_text = response_text.strip()
        
        # Parse JSON
        result = json.loads(response_text)
        
        # Ensure all required fields exist with defaults
        defaults = {
            "company_name": None,
            "company_domain": None,
            "job_title": None,
            "level": None,
            "team_division": None,
            "location": None,
            "remote_policy": None,
            "required_skills": [],
            "preferred_skills": [],
            "years_experience": None,
            "job_type": "Full-time",
            "key_responsibilities": [],
            "interview_hints": None,
            "salary_range": None,
            "role_category": "Other"
        }
        
        for key, default_value in defaults.items():
            if key not in result:
                result[key] = default_value
        
        # IMPORTANT: Validate/override role_category using detection function as sanity check
        # This ensures we get the right category even if OpenAI misclassifies
        job_title = result.get("job_title", "")
        company_name = result.get("company_name", "")
        detected_category = detect_role_category(
            job_title, 
            job_text[:5000],  # Use first 5000 chars for detection
            company_name
        )
        
        # Use detected category if OpenAI's category seems wrong or is "Other"
        openai_category = result.get("role_category", "Other")
        if openai_category == "Other" or detected_category != "Other":
            # Prefer detected category if it's more specific
            if detected_category != "Other":
                result["role_category"] = detected_category
            elif openai_category != "Other":
                result["role_category"] = openai_category
        else:
            result["role_category"] = openai_category
        
        # Validate that we got essential fields
        company_name = result.get("company_name")
        job_title = result.get("job_title")
        
        # Clean up None values - OpenAI sometimes returns the string "null"
        if company_name in [None, "null", "None", ""]:
            result["company_name"] = None
        else:
            result["company_name"] = str(company_name).strip()
            
        if job_title in [None, "null", "None", ""]:
            result["job_title"] = None
        else:
            result["job_title"] = str(job_title).strip() if job_title else None
        
        # Auto-derive domain from company name if not provided
        if not result.get("company_domain") and result.get("company_name"):
            company_name = result["company_name"].lower().replace(" ", "").replace(".", "")
            result["company_domain"] = f"{company_name}.com"
        
        # If we couldn't extract company_name or job_title, that's a problem
        if not result.get("company_name") or not result.get("job_title"):
            missing = []
            if not result.get("company_name"):
                missing.append("company name")
            if not result.get("job_title"):
                missing.append("job title")
            raise Exception(f"Could not extract {', '.join(missing)} from the job posting. The page structure may not be recognized. Try a job posting from LinkedIn, Greenhouse, Lever, or the company's career page.")
        
        return result
        
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        print(f"Response text: {response_text[:500]}")
        raise Exception(f"Failed to parse job posting: Invalid JSON response")
    except Exception as e:
        print(f"Error extracting job details: {e}")
        raise


async def parse_job_posting_url(job_posting_url: str) -> Dict:
    """
    Main function to parse a job posting URL and return structured job details.
    
    Args:
        job_posting_url: URL to the job posting
        
    Returns:
        Dictionary with structured job details
    """
    try:
        # Step 1: Fetch job posting content and metadata
        job_text, metadata = await fetch_job_posting(job_posting_url)
        
        # Check if we got minimal content (might be JavaScript-rendered)
        if not job_text or len(job_text) < 100:
            # If we have metadata, we can still try to use it
            if metadata.get('company_name') or metadata.get('job_title'):
                print(f"⚠️ Low text content but found metadata: {metadata}")
                # Use metadata as fallback and try to extract more with OpenAI
                if len(job_text) > 50:  # At least some text
                    job_details = extract_job_details(job_text)
                    # Merge metadata into results
                    if metadata.get('company_name'):
                        job_details['company_name'] = metadata['company_name']
                    if metadata.get('job_title'):
                        job_details['job_title'] = metadata['job_title']
                    if metadata.get('location'):
                        job_details['location'] = metadata['location']
                    job_details["job_posting_url"] = job_posting_url
                    return job_details
            # Provide more specific error based on URL type
            if "handshake" in job_posting_url.lower():
                raise Exception("Handshake job postings may require authentication or have restricted access. Try copying the job description text directly, or use a job posting from LinkedIn, Greenhouse, or the company's career page.")
            elif "linkedin.com" in job_posting_url.lower():
                raise Exception("LinkedIn often blocks automated access to job postings. Try copying the job description text directly, or use a job posting from Greenhouse, Lever, or the company's career page.")
            elif "careers.leidos.com" in job_posting_url.lower() or "leidos.com" in job_posting_url.lower():
                raise Exception("This job posting page appears to use JavaScript rendering that we cannot parse automatically. Please try: 1) A job posting from Greenhouse or Lever, or 2) Copy and paste the job description text directly into a text field (we can add this feature).")
            else:
                raise Exception("Could not extract sufficient content from job posting. The page may use JavaScript rendering or block automated access. Try a job posting from Greenhouse, Lever, or the company's career page.")
        
        # Step 2: Extract structured details using OpenAI
        job_details = extract_job_details(job_text)
        
        # Merge any metadata we found (metadata takes precedence if OpenAI missed it)
        if metadata.get('company_name') and not job_details.get('company_name'):
            job_details['company_name'] = metadata['company_name']
        if metadata.get('job_title') and not job_details.get('job_title'):
            job_details['job_title'] = metadata['job_title']
        if metadata.get('location') and not job_details.get('location'):
            job_details['location'] = metadata['location']
        
        # Add the original URL
        job_details["job_posting_url"] = job_posting_url
        
        return job_details
        
    except Exception as e:
        # Re-raise with more context if it's our validation error
        if "Could not extract" in str(e):
            raise e
        raise Exception(f"Failed to parse job posting: {str(e)}")

