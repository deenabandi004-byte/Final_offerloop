"""
Coffee chat prep utilities - commonality detection, similarity generation
"""
from app.utils.users import (
    extract_hometown_from_resume,
    extract_companies_from_resume,
    get_university_shorthand,
    get_university_mascot
)


def detect_commonality(user_info, contact, resume_text):
    """
    Detect strongest commonality between user and contact.
    Returns: (commonality_type, details_dict)
    """
    user_university = (user_info.get('university', '') or '').lower()
    contact_education = (
        (contact.get('College', '') or '') + ' ' + 
        (contact.get('EducationTop', '') or '')
    ).lower()
    contact_company = (contact.get('Company', '') or '').lower()
    
    # 1. Check same university (STRONGEST commonality)
    if user_university and user_university in contact_education:
        university = user_info.get('university', '')
        return ('university', {
            'university': university,
            'university_short': get_university_shorthand(university),
            'mascot': get_university_mascot(university)
        })
    
    # 2. Check same hometown
    user_hometown = extract_hometown_from_resume(resume_text or '')
    contact_city = (contact.get('City', '') or '').lower()
    if user_hometown and user_hometown.lower() in contact_city:
        return ('hometown', {
            'hometown': user_hometown
        })
    
    # 3. Check same company/internship
    user_companies = extract_companies_from_resume(resume_text or '')
    if contact_company and any(uc.lower() in contact_company for uc in user_companies if uc):
        connection_type = 'interned' if 'intern' in (resume_text or '').lower() else 'worked'
        role_type = 'Intern' if 'intern' in (resume_text or '').lower() else 'Team Member'
        return ('company', {
            'company': contact.get('Company', ''),
            'connection_type': connection_type,
            'role_type': role_type
        })
    
    # 4. No strong commonality - use general template
    return ('general', {})


def generate_coffee_chat_similarity(user_data, contact_data):
    """Generate similarity summary for coffee chat"""
    try:
        from app.services.openai_client import get_openai_client
        client = get_openai_client()
        if not client:
            return "Both professionals share a commitment to excellence in their respective fields."
        
        prompt = f"""You are an expert in identifying meaningful personal commonalities for networking. 
Given structured profile data for User and Contact, analyze and describe shared similarities between them in 40-60 words.

USER DATA:
Name: {user_data.get('name', '')}
University: {user_data.get('university', '')}
Major: {user_data.get('major', '')}

CONTACT DATA:
Name: {contact_data.get('firstName', '')} {contact_data.get('lastName', '')}
Company: {contact_data.get('company', '')}
Education: {', '.join(contact_data.get('education', [])[:2])}
Location: {contact_data.get('location', '')}

Focus only on personal, human-connection similarities. Be conversational and natural."""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.7
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        print(f"Similarity generation failed: {e}")
        return "Both professionals share a commitment to excellence in their respective fields."


def generate_coffee_chat_questions(contact_data, user_data):
    """Generate 8 coffee chat questions"""
    try:
        from app.services.openai_client import get_openai_client
        client = get_openai_client()
        if not client:
            return []
        
        prompt = f"""Generate 8 thoughtful coffee chat questions for a student to ask a professional.

PROFESSIONAL:
Name: {contact_data.get('firstName', '')} {contact_data.get('lastName', '')}
Role: {contact_data.get('jobTitle', '')} at {contact_data.get('company', '')}

STUDENT:
Field of Study: {user_data.get('major', '')}

Return ONLY a JSON array of 8 questions, no other text:
["question 1", "question 2", ...]"""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You generate thoughtful networking questions. Return only valid JSON arrays."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0.7
        )
        
        import json
        result_text = response.choices[0].message.content.strip()
        # Remove markdown if present
        if '```' in result_text:
            result_text = result_text.split('```')[1]
            if result_text.startswith('json'):
                result_text = result_text[4:]
            result_text = result_text.strip()
        
        questions = json.loads(result_text)
        return questions if isinstance(questions, list) else []
        
    except Exception as e:
        print(f"Question generation failed: {e}")
        return [
            "What drew you to this field?",
            "What's a typical day like in your role?",
            "What skills are most important for success?",
            "What advice would you give to someone starting out?",
            "What's the most rewarding part of your work?",
            "How has the industry changed since you started?",
            "What challenges do you face in your role?",
            "What would you do differently if you were starting over?"
        ]

