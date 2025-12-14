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


def batch_generate_emails(contacts, resume_text, user_profile, career_interests, fit_context=None):
    """
    Generate all emails using the new compelling prompt template.
    
    Args:
        contacts: List of contact dicts
        resume_text: User's resume text
        user_profile: User profile dict
        career_interests: Career interests string
        fit_context: Optional dict with job fit analysis:
            {
                "job_title": "Business Analyst Intern",
                "company": "McKinsey",
                "score": 65,
                "match_level": "moderate",
                "pitch": "As a Data Science major with strong analytical skills...",
                "talking_points": ["specific project", "relevant coursework"],
                "strengths": [{"point": "...", "evidence": "..."}],
                "gaps": [{"gap": "...", "mitigation": "..."}],
                "keywords": ["analytical", "data-driven", "business insights"]
            }
    """
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
        
        # Build fit context section if available
        fit_context_section = ""
        if fit_context:
            strengths_list = fit_context.get('strengths', [])
            strengths_text = ""
            if strengths_list:
                strengths_text = "\n".join([
                    f"- {s.get('point', '')}: {s.get('evidence', '')}" 
                    for s in strengths_list[:2]
                ])
            
            talking_points_list = fit_context.get('talking_points', [])
            talking_points_text = ""
            if talking_points_list:
                talking_points_text = "\n".join([
                    f"- {tp}" for tp in talking_points_list[:3]
                ])
            
            keywords_list = fit_context.get('keywords', []) or fit_context.get('keywords_to_use', [])
            keywords_text = ", ".join(keywords_list[:5]) if keywords_list else ""
            
            fit_context_section = f"""

TARGET ROLE CONTEXT:
- Target Role: {fit_context.get('job_title', 'Not specified')}
- Target Company: {fit_context.get('company', 'Not specified')}
- Fit Score: {fit_context.get('score', 'N/A')}%
- Match Level: {fit_context.get('match_level', 'unknown')}

KEY PITCH (use this as inspiration, don't copy verbatim):
{fit_context.get('pitch', '')}

TALKING POINTS TO WEAVE IN:
{talking_points_text if talking_points_text else '- None provided'}

STRENGTHS TO HIGHLIGHT:
{strengths_text if strengths_text else '- None provided'}

KEYWORDS TO NATURALLY INCLUDE:
{keywords_text if keywords_text else 'None specified'}

IMPORTANT: The user is reaching out specifically about {fit_context.get('job_title', 'this role')} opportunities. 
The email should reflect genuine interest in this specific path, not generic networking.
"""
        
        # Determine if this is targeted outreach or general networking
        is_targeted_outreach = bool(fit_context and fit_context.get('job_title'))
        
        outreach_type_guidance = ""
        if is_targeted_outreach:
            target_role = fit_context.get('job_title', '')
            target_company = fit_context.get('company', '')
            outreach_type_guidance = f"""
OUTREACH TYPE: Targeted Role Inquiry
The sender is specifically interested in {target_role} roles{f' at {target_company}' if target_company else ''}.
- Reference the specific role/path naturally
- Show you've done research (use the talking points)
- Ask targeted questions about their experience in this type of role
- Position your background as relevant to this specific opportunity
"""
        else:
            outreach_type_guidance = """
OUTREACH TYPE: General Networking
The sender is exploring broadly and building their network.
- Focus on learning about their career journey
- Ask open-ended questions about their experience
- Show genuine curiosity about their work
"""
        
        prompt = f"""Write {len(contacts)} personalized, natural networking emails. Each email should be unique and tailored to the specific contact.

ABOUT THE SENDER:
- Name: {sender_name}
- University: {sender_university_short if sender_university_short else 'Not specified'}
- Major: {user_info.get('major', 'Not specified')}
- Year: {user_info.get('year', 'Not specified')}{resume_context}
{fit_context_section}
{outreach_type_guidance}

IMPORTANT: Only mention university/major/year if they are provided above and not "Not specified". If information is missing, write naturally without forcing incomplete sentences like "I'm studying at ." or "studying  at".

CONTACTS:
{chr(10).join(contact_contexts)}

WRITING GUIDELINES:
1. Be natural and conversational - write like a real person, not a template
2. Each email must be unique - no copy-paste between contacts
3. Personalize based on their role, company, and any connections (alumni, hometown, etc.)
4. {"Reference the target role and weave in talking points naturally" if is_targeted_outreach else "Reference specific details from the sender's resume when relevant (experiences, skills, achievements)"}
5. {"Position your relevant experience using the strengths provided" if is_targeted_outreach else "Show genuine interest in their work and experience"}
6. Keep it concise (70-90 words) but warm and authentic
7. Subject lines should be specific and interesting, not generic
{"8. Ask a specific question related to the target role" if is_targeted_outreach else "8. Ask about their experience or journey"}
9. NEVER write incomplete sentences - if information is missing, write around it naturally
{"10. Include relevant keywords naturally from the target role context" if is_targeted_outreach else ""}

{"SUBJECT LINE GUIDANCE FOR TARGETED OUTREACH:" if is_targeted_outreach else ""}
{"- Include the role or company naturally: 'Quick question about BA roles at McKinsey' or 'Fellow Trojan exploring consulting'" if is_targeted_outreach else ""}
{"- Avoid generic subjects like 'Coffee chat request' or 'Quick question'" if is_targeted_outreach else ""}

FORMATTING:
- Start with "Hi [FirstName],"
- Use \\n\\n for paragraph breaks in JSON
- End with "Best regards,\\n[Sender Full Name]\\n{sender_university_short} | Class of {user_info.get('year', '')}" (only include university/year if available)
- Do NOT mention "attached resume" - that's handled separately
- NEVER write sentences like "I'm studying at ." - if university is missing, say something like "I'm a student" or "I'm studying [major]" (only if major is available)

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
                
            # Validate email body - check for common malformed patterns
            malformed_patterns = [
                'studying at .',  # Missing university
                'studying  at',   # Double space before "at"
                'at .',           # Missing value after "at"
                'at  ',           # Missing value with extra space
            ]
            
            is_malformed = any(pattern in body for pattern in malformed_patterns)
            if is_malformed:
                print(f"⚠️ Detected malformed email body for contact {idx}, using fallback")
                # Use fallback for this specific contact
                contact = contacts[idx] if idx < len(contacts) else {}
                name = user_info.get('name', 'a student')
                major = user_info.get('major', '').strip()
                university = user_info.get('university', '').strip()
                company = contact.get('Company', 'your company')
                
                # Build introduction with proper handling of missing values
                intro_parts = [f"I'm {name}"]
                if major and university:
                    intro_parts.append(f"studying {major} at {university}")
                elif university:
                    intro_parts.append(f"a student at {university}")
                elif major:
                    intro_parts.append(f"studying {major}")
                
                intro = ". ".join(intro_parts) + "." if intro_parts else "I'm a student."
                signature = user_info.get('name', '') or "Best regards"
                
                body = f"""Hi {contact.get('FirstName', '')},

{intro} Your work at {company} caught my attention.

Would you be open to a brief 15-minute chat about your experience?

Thank you,
{signature}

I've attached my resume in case it's helpful for context."""
                subject = f"Question about {company}"
                
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
            # Build introduction sentence that handles missing values gracefully
            name = user_info.get('name', 'a student')
            major = user_info.get('major', '').strip()
            university = user_info.get('university', '').strip()
            company = contact.get('Company', 'your company')
            
            # Build introduction with proper handling of missing values
            intro_parts = [f"I'm {name}"]
            if major and university:
                intro_parts.append(f"studying {major} at {university}")
            elif university:
                intro_parts.append(f"a student at {university}")
            elif major:
                intro_parts.append(f"studying {major}")
            
            intro = ". ".join(intro_parts) + "." if intro_parts else "I'm a student."
            
            # Build closing signature
            signature = user_info.get('name', '')
            if not signature:
                signature = "Best regards"
            
            fallback_results[i] = {
                'subject': f"Question about {company}",
                'body': f"""Hi {contact.get('FirstName', '')},

{intro} Your work at {company} caught my attention.

Would you be open to a brief 15-minute chat about your experience?

Thank you,
{signature}

I've attached my resume in case it's helpful for context."""
            }
        return fallback_results


def generate_reply_to_message(message_content, contact_data, resume_text=None, user_profile=None, original_email_subject=None):
    """
    Generate an AI-powered reply to a message from a contact.
    
    Args:
        message_content: The text content of the message to reply to
        contact_data: Dict with contact info (firstName, lastName, company, jobTitle, etc.)
        resume_text: Optional resume text for context
        user_profile: Optional user profile dict
        original_email_subject: Optional original email subject for context
    
    Returns:
        Dict with 'body' (reply text) and 'replyType' (positive, referral, delay, decline, question)
    """
    try:
        client = get_openai_client()
        if not client:
            raise Exception("OpenAI client not available")
        
        # Extract user info
        user_info = extract_user_info_from_resume_priority(resume_text, user_profile) if resume_text or user_profile else {}
        
        # Get contact info
        contact_firstname = contact_data.get('firstName') or contact_data.get('first_name') or contact_data.get('FirstName', '')
        contact_company = contact_data.get('company') or contact_data.get('Company', '')
        contact_title = contact_data.get('jobTitle') or contact_data.get('job_title') or contact_data.get('Title', '')
        
        # Get user info
        sender_name = user_info.get('name', '')
        sender_university = get_university_shorthand(user_info.get('university', ''))
        sender_major = user_info.get('major', '')
        sender_year = user_info.get('year', '')
        
        # Analyze the message tone and content
        message_lower = message_content.lower()
        is_positive = any(word in message_lower for word in ['thank', 'appreciate', 'glad', 'happy', 'excited', 'interested', 'sounds great'])
        is_decline = any(word in message_lower for word in ['unfortunately', 'not able', "can't", "cannot", 'decline', 'sorry', 'not interested'])
        is_question = '?' in message_content
        is_referral = any(word in message_lower for word in ['connect', 'introduce', 'refer', 'forward'])
        is_delay = any(word in message_lower for word in ['later', 'follow up', 'busy', 'schedule', 'next week', 'next month'])
        
        # Build context about the sender
        sender_context = ""
        if sender_name:
            sender_context += f"- Name: {sender_name}\n"
        if sender_university:
            sender_context += f"- University: {sender_university}\n"
        if sender_major:
            sender_context += f"- Major: {sender_major}\n"
        if sender_year:
            sender_context += f"- Year: {sender_year}\n"
        
        # Get key experiences for context
        if user_info.get('key_experiences'):
            sender_context += f"- Experience: {', '.join(user_info['key_experiences'][:2])}\n"
        
        # Build prompt with better context
        prompt = f"""You are helping write a professional email reply. Analyze their message and write a natural, authentic response.

ABOUT THE SENDER:
{sender_context}

ABOUT THE CONTACT:
- Name: {contact_firstname}
- Company: {contact_company}
- Title: {contact_title}

THEIR MESSAGE:
{message_content}

ORIGINAL EMAIL SUBJECT (for context):
{original_email_subject or 'Not available'}

ANALYSIS:
- Positive tone: {is_positive}
- Contains questions: {is_question}
- Decline/negative: {is_decline}
- Referral offer: {is_referral}
- Delay/follow-up: {is_delay}

WRITING GUIDELINES:
1. **Be authentic** - Write like a real person, not a template. Match their energy and tone.
2. **Address specifics** - If they asked questions, answer them. If they mentioned something specific, acknowledge it.
3. **Be concise** - Keep it to 3-5 sentences unless they asked detailed questions (then expand appropriately).
4. **Show personality** - Be warm and genuine, but professional.
5. **Match their tone** - If they're casual ("Hey!", "Thanks!"), be casual. If formal, be formal.
6. **Express gratitude** - Always thank them for responding, especially if positive.
7. **Handle declines gracefully** - If they declined, thank them for their time and leave the door open.
8. **Follow up appropriately** - If they're helpful, suggest next steps. If they declined, be gracious.

IMPORTANT:
- Start with a greeting that matches their tone
- Address any questions or points they raised
- Keep it natural - avoid corporate speak
- End with your name (use "{sender_name}" if available, otherwise "[Your Name]")
- Use \\n\\n for paragraph breaks in JSON

Return ONLY a JSON object:
{{
  "body": "the reply text (use \\n\\n for paragraph breaks)",
  "replyType": "one of: positive, referral, delay, decline, question, or general"
}}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You write authentic, natural email replies that sound like a real person. You match the tone of the original message, respond to specific points raised, and maintain a warm but professional tone. Never use templates or generic phrases. Use only standard ASCII characters."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=600,
            temperature=0.85,  # Slightly higher for more natural variation
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Clean the response text
        response_text = response_text.encode('ascii', 'ignore').decode('ascii')
        
        # Remove markdown if present
        if '```' in response_text:
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
            response_text = response_text.strip()
        
        result = json.loads(response_text)
        
        # Clean the body text
        reply_body = clean_email_text(result.get('body', ''))
        reply_type = result.get('replyType', 'general')
        
        # Replace placeholders
        if sender_name:
            reply_body = reply_body.replace('[Your Name]', sender_name)
            reply_body = reply_body.replace('[Name]', sender_name)
        
        # Ensure proper formatting
        reply_body = reply_body.replace('\\n\\n', '\n\n').replace('\\n', '\n')
        
        return {
            'body': reply_body,
            'replyType': reply_type
        }
        
    except Exception as e:
        print(f"Reply generation failed: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback reply
        contact_firstname = contact_data.get('firstName') or contact_data.get('first_name') or contact_data.get('FirstName', 'there')
        sender_name = user_info.get('name', '') if 'user_info' in locals() else ''
        
        fallback_body = f"Hi {contact_firstname},\n\nThank you for your reply! I appreciate you taking the time to respond.\n\nBest regards"
        if sender_name:
            fallback_body += f",\n{sender_name}"
        
        return {
            'body': fallback_body,
            'replyType': 'general'
        }

