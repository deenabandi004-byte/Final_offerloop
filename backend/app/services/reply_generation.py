"""
Email generation service - batch email generation with AI
"""
import json
from app.services.openai_client import get_openai_client
from app.utils.contact import clean_email_text
from app.utils.users import (
    extract_user_info_from_resume_priority,
    extract_experience_summary,
    extract_hometown_from_resume,
    extract_companies_from_resume,
    get_university_shorthand,
    get_current_season,
    determine_industry
)
from app.utils.coffee_chat_prep import detect_commonality


def batch_generate_emails(contacts, resume_text, user_profile, career_interests):
    """Generate all emails using the new compelling prompt template"""
    try:
        if not contacts:
            return {}
        
        client = get_openai_client()
        if not client:
            raise Exception("OpenAI client not available")
        
        # Ensure career_interests are in user_profile
        if career_interests and user_profile:
            if 'careerInterests' not in user_profile and 'career_interests' not in user_profile:
                user_profile = {**user_profile, 'careerInterests': career_interests}
        elif career_interests and not user_profile:
            user_profile = {'careerInterests': career_interests}
        
        # Extract user info
        user_info = extract_user_info_from_resume_priority(resume_text, user_profile)
        
        # Build sender description
        sender_desc = f"{user_info.get('name', 'Student')} - {user_info.get('year', '')} {user_info.get('major', '')} at {user_info.get('university', '')}"
        
        # Get user contact info for signature
        user_email = user_profile.get('email', '') if user_profile else ''
        user_phone = user_profile.get('phone', '') if user_profile else ''
        user_linkedin = user_profile.get('linkedin', '') if user_profile else ''
        
        contact_info_lines = []
        if user_email:
            contact_info_lines.append(user_email)
        if user_phone:
            contact_info_lines.append(user_phone)
        if user_linkedin:
            contact_info_lines.append(user_linkedin)
        contact_info_str = " | ".join(contact_info_lines) if contact_info_lines else ""
        
        # === UPDATED: Generate individual prompts with template-based personalization ===
        email_prompts = []
        for i, contact in enumerate(contacts):
            # Detect commonality for this contact
            commonality_type, commonality_details = detect_commonality(user_info, contact, resume_text)
            
            company = contact.get('Company', '')
            title = contact.get('Title', '')
            firstname = contact.get('FirstName', '')
            # Capitalize first name properly
            firstname_capitalized = firstname.capitalize() if firstname else 'there'
            
            # Determine industry
            industry = determine_industry(company, title)
            
            # Get user info for template
            sender_firstname = user_info.get('name', '').split()[0] if user_info.get('name') else ''
            sender_university = user_info.get('university', '')
            sender_university_short = get_university_shorthand(sender_university)
            sender_major = user_info.get('major', '')
            sender_year = user_info.get('year', '')
            
            # Get season and experience
            season = get_current_season()
            experience_summary = extract_experience_summary(resume_text)
            
            # Build template instructions based on commonality
            if commonality_type == 'university':
                mascot = commonality_details.get('mascot', '')
                mascot_text = f" {mascot}" if mascot else ""
                template_instructions = f"""TEMPLATE TYPE: ALUMNI EMAIL
Subject: Fellow {sender_university_short}{mascot_text} Interested in {industry}

Format:
Hi {firstname_capitalized},

I saw that you are a {sender_university_short} alum. I'm {sender_firstname}, a {sender_year} studying {sender_major}. This {season} {experience_summary}.

I'm interested in {industry} and was wondering if you would be available for a short call to speak about your experience at {company}?

For context, I've attached my resume below.

Best regards,
[Sender Name]
{sender_university_short} | Class of [Year]"""
                
            elif commonality_type == 'hometown':
                hometown = commonality_details.get('hometown', '')
                template_instructions = f"""TEMPLATE TYPE: HOMETOWN EMAIL
Subject: From {hometown} to {company} — Would Love to Connect

Format:
Hi {firstname_capitalized},

I saw we're both from {hometown}. I'm {sender_firstname}, a {sender_year} at {sender_university_short} studying {sender_major}. This {season} {experience_summary}.

I'd love to hear about your journey to {company} and get your perspective. Would you be open to a quick 15-minute chat?

For context, I've attached my resume below.

Best regards,
[Sender Name]"""
                
            elif commonality_type == 'company':
                shared_company = commonality_details.get('company', '')
                role_type = commonality_details.get('role_type', 'Team Member')
                connection = commonality_details.get('connection_type', 'worked')
                template_instructions = f"""TEMPLATE TYPE: COMPANY EMAIL
Subject: Fellow {shared_company} {role_type} — Quick Chat?

Format:
Hi {firstname_capitalized},

I noticed we both {connection} at {shared_company}. I'm {sender_firstname}, a {sender_year} at {sender_university_short} studying {sender_major}. This {season} {experience_summary}.

I'd really appreciate hearing about your time there and how that experience shaped your next steps. Would you be open to a quick chat?

For context, I've attached my resume below.

Best regards,
[Sender Name]"""
                
            else:
                # General template
                template_instructions = f"""TEMPLATE TYPE: GENERAL EMAIL
Subject: {sender_university_short} Student Interested in {industry}

Format:
Hi {firstname_capitalized},

I'm {sender_firstname}, a {sender_year} at {sender_university_short} studying {sender_major}. This {season} {experience_summary}.

I'm hoping to pursue a career in {industry}, and I was wondering if you would be available in the coming weeks for a short call to speak about your experience at {company}?

For context, I've attached my resume below.

Best regards,
[Sender Name]
{sender_university_short} | Class of [Year]"""
            
            recipient_desc = f"{firstname_capitalized} {contact.get('LastName', '')} at {company}"
            
            email_prompts.append(f"""Contact {i}:
RECIPIENT: {recipient_desc}
{template_instructions}""")
        
        # Build the complete prompt with template guidance
        prompt = f"""Write {len(contacts)} professional networking emails using the specified template type for each contact.

SENDER INFO:
- Name: {user_info.get('name', '')}
- University: {sender_university_short}
- Major: {sender_major}
- Year: {sender_year}

{chr(10).join(email_prompts)}

CRITICAL FORMATTING RULES FOR ALL EMAILS (MUST FOLLOW EXACTLY):
1. Line 1: "Hi [FirstName]," THEN press Enter twice (create blank line) 
2. DO NOT put any text on the same line as "Hi [FirstName]," - greeting must be on its own line
3. Line 3: Start the email body after the blank line
4. Each paragraph separated by blank lines (use \\n\\n in JSON)
5. Signature format: "Best regards," on one line, THEN press Enter, THEN sender name on next line
6. Signature name should be PLAIN TEXT (no bold, no formatting, normal size)
7. Keep emails SHORT (60-80 words max)
8. Use \\n\\n for paragraph breaks in the JSON body field
9. DO NOT mention resume or attachments - those are added separately

EXAMPLE FORMAT IN JSON:
"body": "Hi Sarah,\\n\\nI saw that you are a USC alum. I'm Deena, a Junior studying Data Science. This fall I have focused on data-driven storytelling.\\n\\nI'm interested in Investment Banking and was wondering if you would be available for a short call?\\n\\nFor context, I've attached my resume below.\\n\\nBest regards,\\nDeena Siddharth Bandi\\nUSC | Class of 2025"

CRITICAL: For alumni/hometown/company emails, MUST use the opening line specified in the template.

Return ONLY valid JSON with \\n\\n for line breaks:
{{"0": {{"subject": "...", "body": "..."}}, "1": {{"subject": "...", "body": "..."}}, ...}}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You write short, punchy networking emails that create immediate interest. Each email must be unique, memorable, and ~50 words. Use only standard ASCII characters - no smart quotes, em dashes, or special characters."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=2000,
            temperature=0.8,
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Clean the response text of any unicode issues
        response_text = response_text.encode('ascii', 'ignore').decode('ascii')
        
        # Remove markdown if present
        if '```' in response_text:
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
            response_text = response_text.strip()
        
        results = json.loads(response_text)
        
        # Process and clean results
        cleaned_results = {}
        for k, v in results.items():
            idx = int(k)
            subject = clean_email_text(v.get('subject', 'Quick question about your work'))
            body = clean_email_text(v.get('body', ''))
            
            # Light sanitization only - preserve the punchy style
            if idx < len(contacts):
                contact = contacts[idx]
                # Only replace obvious placeholders, keep the natural flow
                body = body.replace('[FirstName]', contact.get('FirstName', ''))
                body = body.replace('[Name]', user_info.get('name', ''))
                body = body.replace('[Company]', contact.get('Company', ''))
                
            cleaned_results[idx] = {'subject': subject, 'body': body}
        
        return cleaned_results
        
    except Exception as e:
        print(f"Batch email generation failed: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback emails
        fallback_results = {}
        user_info = extract_user_info_from_resume_priority(resume_text, user_profile) if resume_text else {'name': ''}
        for i, contact in enumerate(contacts):
            fallback_results[i] = {
                'subject': f"Question about {contact.get('Company', 'your work')}",
                'body': f"""Hi {contact.get('FirstName', '')},

I'm {user_info.get('name', 'a student')} studying {user_info.get('major', '')} at {user_info.get('university', '')}. Your work at {contact.get('Company', 'your company')} caught my attention.

Would you be open to a brief 15-minute chat about your experience?

Thank you,
{user_info.get('name', '')}

I've attached my resume in case helpful for context."""
            }
        return fallback_results

