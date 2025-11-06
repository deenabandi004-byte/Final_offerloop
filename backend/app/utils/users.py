"""
User utilities - university helpers, resume parsing, industry detection
"""
import re
from datetime import datetime
from app.services.openai_client import get_openai_client


def get_university_shorthand(university):
    """Convert university name to shorthand."""
    if not university:
        return university
    shortcuts = {
        'University of Southern California': 'USC',
        'University of California, Los Angeles': 'UCLA',
        'University of California, Berkeley': 'UC Berkeley',
        'Stanford University': 'Stanford',
        'Harvard University': 'Harvard',
        'Yale University': 'Yale',
        'Princeton University': 'Princeton',
        'Columbia University': 'Columbia',
        'University of Pennsylvania': 'Penn',
        'Cornell University': 'Cornell',
        'Dartmouth College': 'Dartmouth',
        'Brown University': 'Brown',
        'Duke University': 'Duke',
        'Northwestern University': 'Northwestern',
        'University of Chicago': 'UChicago',
        'New York University': 'NYU',
        'University of Michigan': 'Michigan',
        'University of Virginia': 'UVA',
        'University of North Carolina': 'UNC',
        'Georgetown University': 'Georgetown',
        'University of Texas': 'UT',
        'University of Notre Dame': 'Notre Dame',
    }
    return shortcuts.get(university, university)


def get_university_mascot(university):
    """Get university mascot for alumni emails."""
    if not university:
        return ''
    mascots = {
        'University of Southern California': 'Trojan',
        'University of California, Los Angeles': 'Bruin',
        'University of California, Berkeley': 'Golden Bear',
        'Stanford University': 'Cardinal',
        'Harvard University': 'Crimson',
        'Yale University': 'Bulldog',
        'University of Michigan': 'Wolverine',
        'Duke University': 'Blue Devil',
        'Northwestern University': 'Wildcat',
        'University of Notre Dame': 'Fighting Irish',
        'University of Texas': 'Longhorn',
        'University of North Carolina': 'Tar Heel',
    }
    return mascots.get(university, '')


def get_current_season():
    """Get current season based on date."""
    month = datetime.now().month
    if month in [12, 1, 2]:
        return "winter"
    elif month in [3, 4, 5]:
        return "spring"
    elif month in [6, 7, 8]:
        return "summer"
    else:
        return "fall"


def determine_industry(company, title):
    """Determine industry from company and title."""
    if not company and not title:
        return "this field"
    
    company_lower = (company or '').lower()
    title_lower = (title or '').lower()
    
    # Investment Banking
    if any(word in company_lower or word in title_lower for word in [
        'bank', 'goldman', 'morgan', 'jp', 'jpmorgan', 'credit', 'wells fargo', 
        'citigroup', 'barclays', 'deutsche bank', 'ubs', 'merrill'
    ]):
        return "Investment Banking"
    
    # Consulting
    elif any(word in company_lower or word in title_lower for word in [
        'mckinsey', 'bain', 'bcg', 'consult', 'deloitte', 'pwc', 'kpmg', 
        'ey', 'accenture', 'booz'
    ]):
        return "Consulting"
    
    # Tech
    elif any(word in company_lower for word in [
        'tech', 'google', 'meta', 'amazon', 'microsoft', 'apple', 'facebook',
        'netflix', 'tesla', 'uber', 'airbnb', 'salesforce'
    ]):
        return "Tech"
    
    # Private Equity / Venture Capital
    elif any(word in company_lower or word in title_lower for word in [
        'private equity', 'venture', 'vc', 'capital', 'blackstone', 'kkr', 
        'carlyle', 'apollo'
    ]):
        return "Private Equity"
    
    else:
        return "this field"


def extract_experience_summary(resume_text):
    """Extract a one-sentence summary of experience from resume."""
    if not resume_text:
        return "I've been working on developing my skills"
    
    # Look for lines with action verbs
    action_verbs = ['led', 'managed', 'developed', 'created', 'analyzed', 'designed', 
                    'built', 'launched', 'implemented', 'coordinated', 'conducted']
    
    lines = resume_text.split('\n')
    for line in lines:
        line_lower = line.lower()
        if any(verb in line_lower for verb in action_verbs):
            # Clean up and return first relevant sentence
            sentence = line.strip()
            if len(sentence) > 20 and len(sentence) < 150:
                # Make it flow naturally
                if not sentence.lower().startswith('i '):
                    sentence = f"I {sentence.lower()}"
                return sentence[:120]  # Max 120 chars
    
    return "I've been working on data analysis and business projects"


def extract_hometown_from_resume(resume_text):
    """Extract hometown from resume text."""
    if not resume_text:
        return None
    
    patterns = [
        r'[Ff]rom\s+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})',
        r'[Hh]ometown:\s*([A-Z][a-zA-Z\s]+)',
        r'[Bb]ased in\s+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})',
    ]
    for pattern in patterns:
        match = re.search(pattern, resume_text)
        if match:
            return match.group(1).strip()
    return None


def extract_companies_from_resume(resume_text):
    """Extract company names from resume."""
    if not resume_text:
        return []
    
    companies = []
    # Look for common patterns
    lines = resume_text.split('\n')
    for line in lines:
        if any(word in line.lower() for word in ['intern', 'analyst', 'associate', 'consultant', 'manager']):
            # Extract capitalized sequences (likely company names)
            words = re.findall(r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}', line)
            companies.extend(words)
    
    # Return unique companies, max 5
    return list(set(companies))[:5]


def parse_resume_info(resume_text):
    """Parse basic info from resume text using OpenAI"""
    try:
        client = get_openai_client()
        if not client or not resume_text:
            return {}
        
        prompt = f"""Extract the following information from this resume text. Return ONLY a JSON object with these exact keys:
{{
  "name": "Full Name",
  "university": "University Name",
  "major": "Major/Field of Study",
  "year": "Graduation Year or Class Year"
}}

Resume text:
{resume_text[:2000]}

Return ONLY the JSON object, no other text."""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You extract structured information from resumes. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=200,
            temperature=0.1
        )
        
        import json
        result_text = response.choices[0].message.content.strip()
        # Remove markdown code blocks if present
        if '```' in result_text:
            result_text = result_text.split('```')[1]
            if result_text.startswith('json'):
                result_text = result_text[4:]
            result_text = result_text.strip()
        
        return json.loads(result_text)
        
    except Exception as e:
        print(f"Resume parsing failed: {e}")
        return {}


def extract_comprehensive_user_info(resume_text=None, user_profile=None):
    """Extract comprehensive user information from all available sources"""
    user_info = {
        'name': '',
        'year': '',
        'major': '',
        'university': '',
        'experiences': [],
        'skills': [],
        'interests': [],
        'projects': [],
        'leadership': []
    }
    
    # Priority 1: Extract from resume if available
    if resume_text and len(resume_text.strip()) > 50:
        try:
            parsed = parse_resume_info(resume_text)
            if parsed:
                user_info.update(parsed)
        except Exception as e:
            print(f"Resume parsing failed: {e}")
    
    # Priority 2: Fallback to user profile
    if user_profile:
        if not user_info.get('name'):
            user_info['name'] = user_profile.get('name') or f"{user_profile.get('firstName', '')} {user_profile.get('lastName', '')}".strip()
        if not user_info.get('year'):
            user_info['year'] = user_profile.get('year') or user_profile.get('graduationYear') or ""
        if not user_info.get('major'):
            user_info['major'] = user_profile.get('major') or user_profile.get('fieldOfStudy') or ""
        if not user_info.get('university'):
            user_info['university'] = user_profile.get('university') or ""
    
    return user_info


def extract_user_info_from_resume_priority(resume_text, profile):
    """
    Extract user info prioritizing resume text, falling back to profile.
    This is the main function used by email generation.
    """
    user_info = {}
    
    # Priority 1: Try to extract from resume if available
    if resume_text and len(resume_text.strip()) > 50:
        try:
            parsed = parse_resume_info(resume_text)
            if parsed:
                user_info.update(parsed)
        except Exception as e:
            print(f"Resume parsing failed: {e}")
    
    # Priority 2: Fallback to profile if resume didn't provide enough info
    if profile:
        if not user_info.get('name'):
            user_info['name'] = profile.get('name') or f"{profile.get('firstName', '')} {profile.get('lastName', '')}".strip()
        if not user_info.get('year'):
            user_info['year'] = profile.get('year') or profile.get('graduationYear') or ""
        if not user_info.get('major'):
            user_info['major'] = profile.get('major') or profile.get('fieldOfStudy') or ""
        if not user_info.get('university'):
            user_info['university'] = profile.get('university') or ""
    
    return user_info

