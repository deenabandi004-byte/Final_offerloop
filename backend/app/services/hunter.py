import requests
import os
from functools import lru_cache

HUNTER_API_KEY = os.getenv('HUNTER_API_KEY')

# Company domain mapping for common companies
COMPANY_DOMAINS = {
    # Consulting
    'bain & company': 'bain.com',
    'bain and company': 'bain.com',
    'bain': 'bain.com',
    'bcg': 'bcg.com',
    'boston consulting group': 'bcg.com',
    'mckinsey': 'mckinsey.com',
    'mckinsey & company': 'mckinsey.com',
    'mckinsey and company': 'mckinsey.com',
    'deloitte': 'deloitte.com',
    'pwc': 'pwc.com',
    'pricewaterhousecoopers': 'pwc.com',
    'kpmg': 'kpmg.com',
    'ey': 'ey.com',
    'ernst & young': 'ey.com',
    'accenture': 'accenture.com',
    
    # Tech
    'google': 'google.com',
    'meta': 'meta.com',
    'facebook': 'meta.com',
    'amazon': 'amazon.com',
    'microsoft': 'microsoft.com',
    'apple': 'apple.com',
    'netflix': 'netflix.com',
    'uber': 'uber.com',
    'airbnb': 'airbnb.com',
    'salesforce': 'salesforce.com',
    'oracle': 'oracle.com',
    'adobe': 'adobe.com',
    
    # Finance
    'goldman sachs': 'gs.com',
    'morgan stanley': 'morganstanley.com',
    'jp morgan': 'jpmorgan.com',
    'jpmorgan': 'jpmorgan.com',
    'jpmorgan chase': 'jpmorganchase.com',
    'bank of america': 'bofa.com',
    'citigroup': 'citi.com',
    'wells fargo': 'wellsfargo.com',
    'blackrock': 'blackrock.com',
    'evercore': 'evercore.com',
    'lazard': 'lazard.com',
    'centerview': 'centerviewpartners.com',
    
    # Add more as needed
}


@lru_cache(maxsize=1000)
def get_company_domain(company_name: str) -> str:
    """
    Get domain for a company name
    Uses mapping first, falls back to guessing
    """
    if not company_name:
        return None
    
    # Normalize
    company_lower = company_name.lower().strip()
    
    # Check mapping
    if company_lower in COMPANY_DOMAINS:
        return COMPANY_DOMAINS[company_lower]
    
    # Guess: remove spaces, add .com
    # "Bain & Company" -> "baincompany.com"
    guess = company_lower.replace(' & ', '').replace(' and ', '').replace(' ', '').replace('-', '')
    return f"{guess}.com"


def find_email_hunter(first_name: str, last_name: str, company: str, api_key: str = None) -> dict:
    """
    Find email using Hunter.io Email Finder API
    
    Returns:
        {
            'email': 'firstname.lastname@company.com',
            'score': 95,  # Confidence 0-100
            'verified': True,
            'sources': 3
        }
        or None if not found
    """
    if not api_key:
        api_key = HUNTER_API_KEY
    
    if not api_key:
        print("⚠️ Hunter.io API key not configured")
        return None
    
    if not (first_name and last_name and company):
        return None
    
    domain = get_company_domain(company)
    if not domain:
        return None
    
    url = "https://api.hunter.io/v2/email-finder"
    params = {
        'domain': domain,
        'first_name': first_name.strip(),
        'last_name': last_name.strip(),
        'api_key': api_key
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            email_data = data.get('data', {})
            
            if email_data.get('email'):
                return {
                    'email': email_data['email'],
                    'score': email_data.get('score', 0),
                    'verified': email_data.get('verification', {}).get('status') == 'valid',
                    'sources': email_data.get('sources', []),
                    'position': email_data.get('position'),
                    'company': email_data.get('company')
                }
        
        elif response.status_code == 401:
            print("❌ Hunter.io: Invalid API key")
        elif response.status_code == 429:
            # Rate limit exceeded - check if we can retry
            rate_limit_info = response.headers.get('X-RateLimit-Remaining', 'unknown')
            reset_time = response.headers.get('X-RateLimit-Reset', 'unknown')
            print(f"⚠️ Hunter.io: Rate limit exceeded (remaining: {rate_limit_info}, reset: {reset_time})")
            print(f"   💡 Consider upgrading Hunter.io plan or reducing enrichment frequency")
            # Mark that we hit rate limit
            find_email_hunter._last_rate_limit = True
        else:
            print(f"⚠️ Hunter.io returned status {response.status_code}")
        
    except requests.exceptions.Timeout:
        print(f"⚠️ Hunter.io timeout for {first_name} {last_name}")
    except Exception as e:
        print(f"⚠️ Hunter.io error: {e}")
    
    return None


def enrich_contact_with_hunter(contact: dict, api_key: str = None) -> dict:
    """
    Enrich a single contact with Hunter.io if they don't have an email
    
    Args:
        contact: Contact dict with FirstName, LastName, Company, Email
        api_key: Hunter.io API key (optional, uses env var if not provided)
    
    Returns:
        Contact with email enriched if found
    """
    # Already has valid email from PDL
    if contact.get('Email') and contact['Email'] != "Not available":
        return contact
    
    # Try Hunter.io
    first_name = contact.get('FirstName', '')
    last_name = contact.get('LastName', '')
    company = contact.get('Company', '')
    
    if not (first_name and last_name and company):
        return contact
    
    print(f"🔍 Hunter.io: Looking up {first_name} {last_name} @ {company}")
    
    hunter_result = find_email_hunter(first_name, last_name, company, api_key)
    
    if hunter_result:
        contact['Email'] = hunter_result['email']
        contact['EmailSource'] = 'hunter.io'
        contact['EmailConfidence'] = hunter_result['score']
        contact['EmailVerified'] = hunter_result['verified']
        print(f"✅ Hunter.io: Found {hunter_result['email']} (confidence: {hunter_result['score']}%)")
    else:
        # Check if it was a rate limit error
        # Store error info for rate limit detection
        if hasattr(find_email_hunter, '_last_rate_limit'):
            contact['_hunter_error'] = 'rate_limit'
        print(f"❌ Hunter.io: No email found for {first_name} {last_name}")
    
    return contact


def enrich_contacts_with_hunter(contacts: list, api_key: str = None, max_enrichments: int = None) -> list:
    """
    Enrich multiple contacts with Hunter.io
    
    Args:
        contacts: List of contact dicts
        api_key: Hunter.io API key (optional)
        max_enrichments: Max number of Hunter API calls (to save credits)
    
    Returns:
        List of contacts with emails enriched where possible
    """
    import time
    
    if not api_key:
        api_key = HUNTER_API_KEY
    
    if not api_key:
        print("⚠️ Hunter.io enrichment skipped - no API key")
        return contacts
    
    enriched = []
    enrichments_done = 0
    rate_limited = False
    
    # Reset rate limit flag at start of batch
    if hasattr(find_email_hunter, '_last_rate_limit'):
        find_email_hunter._last_rate_limit = False
    
    for contact in contacts:
        # Already has email - no enrichment needed
        if contact.get('Email') and contact['Email'] != "Not available":
            enriched.append(contact)
            continue
        
        # Stop if we hit rate limit
        if rate_limited:
            print(f"⚠️ Stopping Hunter.io enrichment due to rate limit")
            enriched.append(contact)
            continue
        
        # Check if we've hit the enrichment limit
        if max_enrichments and enrichments_done >= max_enrichments:
            print(f"⚠️ Reached Hunter.io enrichment limit ({max_enrichments})")
            enriched.append(contact)
            continue
        
        # Enrich this contact
        enriched_contact = enrich_contact_with_hunter(contact, api_key)
        enriched.append(enriched_contact)
        
        # Check if we hit rate limit (check the function's last call status)
        if enriched_contact.get('EmailSource') == 'hunter.io':
            enrichments_done += 1
        elif hasattr(find_email_hunter, '_last_rate_limit') and find_email_hunter._last_rate_limit:
            rate_limited = True
            print(f"⚠️ Hunter.io rate limit hit, stopping enrichment")
            # Reset the flag
            find_email_hunter._last_rate_limit = False
        
        # Add small delay between requests to avoid rate limits (if not rate limited yet)
        # Delay after each request (not just successful ones) to be respectful of rate limits
        if not rate_limited:
            time.sleep(0.5)  # 500ms delay between requests to avoid hitting rate limits
    
    # Summary
    pdl_emails = sum(1 for c in contacts if c.get('Email') and c['Email'] != "Not available")
    hunter_emails = sum(1 for c in enriched if c.get('EmailSource') == 'hunter.io')
    total_emails = sum(1 for c in enriched if c.get('Email') and c['Email'] != "Not available")
    
    print(f"\n📊 Email Enrichment Summary:")
    print(f"   - PDL had emails: {pdl_emails}/{len(contacts)}")
    print(f"   - Hunter.io found: {hunter_emails}")
    print(f"   - Total with emails: {total_emails}/{len(contacts)} ({total_emails/len(contacts)*100:.0f}%)")
    
    return enriched


def verify_email_hunter(email: str, api_key: str = None) -> dict:
    """
    Verify an email address using Hunter.io
    
    Returns:
        {
            'email': 'test@example.com',
            'status': 'valid',  # valid, invalid, unknown
            'score': 95
        }
    """
    if not api_key:
        api_key = HUNTER_API_KEY
    
    if not api_key:
        return None
    
    url = "https://api.hunter.io/v2/email-verifier"
    params = {
        'email': email,
        'api_key': api_key
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return data.get('data', {})
        
    except Exception as e:
        print(f"Hunter.io verify error: {e}")
    
    return None


if __name__ == "__main__":
    # Test the integration
    print("Testing Hunter.io integration...")
    
    test_contact = {
        'FirstName': 'John',
        'LastName': 'Smith',
        'Company': 'Bain & Company',
        'Email': 'Not available'
    }
    
    enriched = enrich_contact_with_hunter(test_contact)
    print(f"\nTest result: {enriched}")