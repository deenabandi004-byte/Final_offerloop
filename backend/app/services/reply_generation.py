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
        
        # === PERSONALIZED: Generate natural, personalized emails for each contact ===
        sender_university_short = get_university_shorthand(user_info.get('university', ''))
        sender_name = user_info.get('name', '')
        sender_firstname = sender_name.split()[0] if sender_name else ''
        
        # Build personalized context for each contact
        contact_contexts = []
        for i, contact in enumerate(contacts):
            # Detect commonality
            commonality_type, commonality_details = detect_commonality(user_info, contact, resume_text)
            
            # Get contact info
            firstname = contact.get('FirstName', '').capitalize()
            lastname = contact.get('LastName', '')
            company = contact.get('Company', '')
            title = contact.get('Title', '')
            industry = determine_industry(company, title)
            
            # Get resume details for personalization
            key_experiences = user_info.get('key_experiences', [])[:2]  # Top 2 experiences
            skills = user_info.get('skills', [])[:3]  # Top 3 skills
            achievements = user_info.get('achievements', [])[:1]  # Top achievement
            
            # Build personalization context
            personalization_note = ""
            if commonality_type == 'university':
                personalization_note = f"Both attended {sender_university_short} - emphasize the alumni connection naturally"
            elif commonality_type == 'hometown':
                hometown = commonality_details.get('hometown', '')
                personalization_note = f"Both from {hometown} - mention the shared hometown connection"
            elif commonality_type == 'company':
                shared_company = commonality_details.get('company', '')
                personalization_note = f"Both worked at {shared_company} - reference the shared experience"
            
            # Build contact context
            contact_context = f"""Contact {i}: {firstname} {lastname}
- Role: {title} at {company}
- Industry: {industry}
- Connection: {personalization_note if personalization_note else 'No specific connection - find a genuine reason to reach out'}
- Personalize by: Mentioning their role/company, asking about their experience, showing genuine interest in their work"""
            
            contact_contexts.append(contact_context)
        
        # Build comprehensive prompt with resume details
        resume_context = ""
        if user_info.get('key_experiences'):
            resume_context += f"\n- Key Experiences: {', '.join(user_info['key_experiences'][:2])}"
        if user_info.get('skills'):
            resume_context += f"\n- Skills: {', '.join(user_info['skills'][:3])}"
        if user_info.get('achievements'):
            resume_context += f"\n- Notable Achievement: {user_info['achievements'][0]}"
        
        prompt = f"""Write {len(contacts)} personalized, natural networking emails. Each email should be unique and tailored to the specific contact.

ABOUT THE SENDER:
- Name: {sender_name}
- University: {sender_university_short}
- Major: {user_info.get('major', '')}
- Year: {user_info.get('year', '')}{resume_context}

CONTACTS:
{chr(10).join(contact_contexts)}

WRITING GUIDELINES:
1. Be natural and conversational - write like a real person, not a template
2. Each email must be unique - no copy-paste between contacts
3. Personalize based on their role, company, and any connections (alumni, hometown, etc.)
4. Reference specific details from the sender's resume when relevant (experiences, skills, achievements)
5. Show genuine interest in their work and experience
6. Keep it concise (70-90 words) but warm and authentic
7. Subject lines should be specific and interesting, not generic

FORMATTING:
- Start with "Hi [FirstName],"
- Use \\n\\n for paragraph breaks in JSON
- End with "Best regards,\\n[Sender Full Name]\\n{sender_university_short} | Class of {user_info.get('year', '')}"
- Do NOT mention "attached resume" - that's handled separately

Return ONLY valid JSON:
{{"0": {{"subject": "...", "body": "..."}}, "1": {{"subject": "...", "body": "..."}}, ...}}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You write authentic, personalized networking emails that feel genuine and human. Each email should be unique, tailored to the recipient, and reference specific details from the sender's background. Write naturally - like a real person reaching out, not a template. Use only standard ASCII characters."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=2500,  # Increased for more detailed emails
            temperature=0.9,  # Higher for more creativity and naturalness
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

