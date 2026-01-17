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
from datetime import datetime

# ============================================================================
# TEMPORARY DEBUG UTILITY - FOR DATA INSPECTION ONLY
# ============================================================================
# Set this to True to enable debug output for ONE contact (the first one)
# This will print the full contact object, sender object, and prompt context
# REMOVE THIS AFTER INSPECTION IS COMPLETE
DEBUG_EMAIL_DATA_INSPECTION = False  # Set to True to enable
# ============================================================================

# ============================================================================
# ANCHOR PRIORITY SYSTEM
# ============================================================================

def _detect_career_transition(contact):
    """
    Detect if contact has made a career transition (e.g., engineering → consulting).
    
    Returns:
        dict with 'type': 'transition', 'value': str, 'priority': 1
        or None if no transition detected
    """
    # Check if we have experience data
    experience = contact.get('experience', [])
    if not isinstance(experience, list) or len(experience) < 2:
        return None
    
    # Handle backward compatibility: if experience is empty, try parsing WorkSummary
    # (This is a fallback for contacts extracted before experience array was added)
    if len(experience) == 0:
        work_summary = contact.get('WorkSummary', '')
        if 'Previously at' in work_summary or 'Previously' in work_summary:
            # Has previous job, but can't determine transition type without structured data
            # Return None to fall back to tenure or title
            return None
    
    # Get current and previous jobs
    current_job = experience[0] if experience else {}
    prev_job = experience[1] if len(experience) > 1 else {}
    
    if not isinstance(current_job, dict) or not isinstance(prev_job, dict):
        return None
    
    # Extract company and title info
    current_company = ''
    current_title = ''
    if isinstance(current_job.get('company'), dict):
        current_company = current_job['company'].get('name', '')
    elif isinstance(current_job.get('company'), str):
        current_company = current_job.get('company', '')
    
    if isinstance(current_job.get('title'), dict):
        current_title = current_job['title'].get('name', '')
    elif isinstance(current_job.get('title'), str):
        current_title = current_job.get('title', '')
    
    prev_company = ''
    prev_title = ''
    if isinstance(prev_job.get('company'), dict):
        prev_company = prev_job['company'].get('name', '')
    elif isinstance(prev_job.get('company'), str):
        prev_company = prev_job.get('company', '')
    
    if isinstance(prev_job.get('title'), dict):
        prev_title = prev_job['title'].get('name', '')
    elif isinstance(prev_job.get('title'), str):
        prev_title = prev_job.get('title', '')
    
    # Check if companies differ (transition indicator)
    if not current_company or not prev_company:
        return None
    
    if current_company.lower() == prev_company.lower():
        return None  # Same company, not a transition
    
    # Determine transition type
    current_lower = current_title.lower()
    prev_lower = prev_title.lower()
    
    # Define transition patterns
    consulting_keywords = ['consultant', 'consulting', 'associate', 'analyst', 'manager']
    banking_keywords = ['analyst', 'associate', 'banking', 'investment', 'finance']
    engineering_keywords = ['engineer', 'developer', 'software', 'technical']
    
    is_consulting = any(kw in current_lower for kw in consulting_keywords)
    is_banking = any(kw in current_lower for kw in banking_keywords)
    is_engineering = any(kw in current_lower for kw in engineering_keywords)
    
    prev_is_consulting = any(kw in prev_lower for kw in consulting_keywords)
    prev_is_banking = any(kw in prev_lower for kw in banking_keywords)
    prev_is_engineering = any(kw in prev_lower for kw in engineering_keywords)
    
    # Detect meaningful transitions
    transition_value = None
    if is_consulting and (prev_is_engineering or prev_is_banking):
        transition_value = "transitioned into consulting"
    elif is_banking and (prev_is_engineering or prev_is_consulting):
        transition_value = "moved into banking"
    elif is_consulting and not prev_is_consulting:
        transition_value = "transitioned into consulting"
    elif is_banking and not prev_is_banking:
        transition_value = "moved into banking"
    elif is_engineering and (prev_is_consulting or prev_is_banking):
        transition_value = "shifted from industry into consulting"
    
    if transition_value:
        return {
            'type': 'transition',
            'priority': 1,
            'value': transition_value
        }
    
    return None


def _detect_tenure(contact):
    """
    Detect if contact has short tenure (<= 3 years) at current role.
    
    Returns:
        dict with 'type': 'tenure', 'value': str, 'priority': 2
        or None if no tenure anchor applies
    """
    experience = contact.get('experience', [])
    if not isinstance(experience, list) or len(experience) == 0:
        return None
    
    current_job = experience[0]
    if not isinstance(current_job, dict):
        return None
    
    # Check for start_date
    start_date = current_job.get('start_date')
    if not isinstance(start_date, dict):
        # Try to parse from WorkSummary as fallback (backward compatibility)
        work_summary = contact.get('WorkSummary', '')
        # Look for years experience pattern like "(2 years experience)"
        import re
        years_match = re.search(r'\((\d+)\s+years?\s+experience\)', work_summary)
        if years_match:
            years_exp = int(years_match.group(1))
            if years_exp <= 3:
                # Estimate start year (current year - years_exp)
                current_year = datetime.now().year
                estimated_start_year = current_year - years_exp
                start_date = {'year': estimated_start_year}
            else:
                return None
        else:
            return None
    
    start_year = start_date.get('year')
    if not start_year:
        return None
    
    # Calculate tenure
    current_year = datetime.now().year
    tenure_years = current_year - start_year
    
    # Check if still at this job (no end_date or end_date is future)
    end_date = current_job.get('end_date')
    if end_date and isinstance(end_date, dict):
        end_year = end_date.get('year')
        if end_year and end_year < current_year:
            # They left, calculate actual tenure
            start_month = start_date.get('month', 1)
            end_month = end_date.get('month', 12)
            # Rough calculation
            tenure_years = end_year - start_year
            if end_month < start_month:
                tenure_years -= 1
    
    # Only use tenure anchor if <= 3 years
    if tenure_years > 3:
        return None
    
    # Bucket tenure into phrases
    if tenure_years <= 1:
        tenure_value = "recently joined"
    elif tenure_years <= 3:
        tenure_value = "early in your time"
    else:
        return None
    
    # Get company name for context
    company = contact.get('Company', '')
    if company:
        tenure_value = f"{tenure_value} at {company}"
    
    return {
        'type': 'tenure',
        'priority': 2,
        'value': tenure_value
    }


def _build_title_anchor(contact):
    """
    Build title anchor as fallback.
    
    Returns:
        dict with 'type': 'title', 'value': str, 'priority': 3
    """
    title = contact.get('Title', '')
    company = contact.get('Company', '')
    
    if not title or not company:
        return None
    
    return {
        'type': 'title',
        'priority': 3,
        'value': f"{title} at {company}"
    }


def _build_anchor_candidates(contact):
    """
    Build anchor candidates for a contact in priority order.
    
    Returns:
        List of anchor candidate dicts, sorted by priority (lowest number = highest priority)
    """
    candidates = []
    
    # 1. Check for transition (highest priority)
    transition = _detect_career_transition(contact)
    if transition:
        candidates.append(transition)
    
    # 2. Check for tenure (medium priority)
    tenure = _detect_tenure(contact)
    if tenure:
        candidates.append(tenure)
    
    # 3. Title anchor (fallback, always available if title/company exist)
    title_anchor = _build_title_anchor(contact)
    if title_anchor:
        candidates.append(title_anchor)
    
    return candidates


def _select_anchor(contact):
    """
    Select exactly ONE anchor based on priority.
    
    Returns:
        dict with 'type', 'value', 'priority' or None if no anchor available
    """
    candidates = _build_anchor_candidates(contact)
    
    if not candidates:
        return None
    
    # Select highest priority (lowest priority number)
    selected = sorted(candidates, key=lambda x: x['priority'])[0]
    return selected

def _debug_print_email_data(contact, user_info, user_profile, contact_context, resume_text, fit_context):
    """
    TEMPORARY: Debug utility to inspect all available data for email personalization.
    Prints full contact object, sender data, and prompt context for inspection.
    
    REMOVE THIS FUNCTION AFTER INSPECTION IS COMPLETE.
    """
    if not DEBUG_EMAIL_DATA_INSPECTION:
        return
    
    print("\n" + "="*80)
    print("🔍 EMAIL PERSONALIZATION DATA INSPECTION (TEMPORARY DEBUG)")
    print("="*80)
    
    # Redact sensitive info
    def redact_email(email):
        if not email or email == "Not available":
            return email
        if "@" in email:
            parts = email.split("@")
            if len(parts[0]) > 2:
                return parts[0][:2] + "***@" + parts[1]
            return "***@" + parts[1]
        return email
    
    def redact_phone(phone):
        if not phone:
            return phone
        if len(phone) > 4:
            return "***" + phone[-4:]
        return "***"
    
    # 1. CONTACT DATA (PDL + LinkedIn)
    print("\n📋 CONTACT DATA (PDL + LinkedIn-derived):")
    print("-" * 80)
    contact_copy = contact.copy()
    if 'Email' in contact_copy:
        contact_copy['Email'] = redact_email(contact_copy['Email'])
    if 'WorkEmail' in contact_copy:
        contact_copy['WorkEmail'] = redact_email(contact_copy['WorkEmail'])
    if 'PersonalEmail' in contact_copy:
        contact_copy['PersonalEmail'] = redact_email(contact_copy['PersonalEmail'])
    if 'Phone' in contact_copy:
        contact_copy['Phone'] = redact_phone(contact_copy['Phone'])
    
    print(json.dumps(contact_copy, indent=2, default=str))
    
    # 2. SENDER DATA (Resume + Profile)
    print("\n👤 SENDER DATA (Resume + Profile-derived):")
    print("-" * 80)
    sender_copy = {
        'user_info': user_info,
        'user_profile': user_profile,
        'resume_text_length': len(resume_text) if resume_text else 0,
        'resume_text_preview': resume_text[:500] if resume_text else None
    }
    print(json.dumps(sender_copy, indent=2, default=str))
    
    # 3. PROMPT CONTEXT
    print("\n📝 PROMPT CONTEXT (What gets sent to LLM):")
    print("-" * 80)
    print(contact_context)
    
    # 4. FIT CONTEXT (if available)
    if fit_context:
        print("\n🎯 FIT CONTEXT (Job fit analysis):")
        print("-" * 80)
        print(json.dumps(fit_context, indent=2, default=str))
    
    # 5. COMMONALITY DETECTION
    commonality_type, commonality_details = detect_commonality(user_info, contact, resume_text)
    print("\n🔗 COMMONALITY DETECTION:")
    print("-" * 80)
    print(f"Type: {commonality_type}")
    print(f"Details: {json.dumps(commonality_details, indent=2, default=str)}")
    
    print("\n" + "="*80)
    print("END OF DATA INSPECTION")
    print("="*80 + "\n")


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
        # Track strong connections for resume gating
        contact_strong_connections = {}  # idx -> bool (True if alumni or shared company)
        contact_contexts = []
        selected_anchors = {}  # idx -> anchor dict or None
        for i, contact in enumerate(contacts):
            # TEMPORARY DEBUG: Print data for first contact only
            if i == 0:
                # Build contact context first (will be built below)
                pass
            
            # Detect commonality
            commonality_type, commonality_details = detect_commonality(user_info, contact, resume_text)
            
            # Get contact info
            firstname = contact.get('FirstName', '').capitalize()
            lastname = contact.get('LastName', '')
            company = contact.get('Company', '')
            title = contact.get('Title', '')
            industry = determine_industry(company, title)
            
            # Select anchor (priority: transition → tenure → title)
            selected_anchor = _select_anchor(contact)
            selected_anchors[i] = selected_anchor
            
            # Get resume details for personalization
            key_experiences = user_info.get('key_experiences', [])[:2]  # Top 2 experiences
            # Handle skills - can be a list or dict (from resume parser)
            skills_raw = user_info.get('skills', [])
            if isinstance(skills_raw, dict):
                # Flatten dict structure into a list
                skills = []
                for category, skill_list in skills_raw.items():
                    if isinstance(skill_list, list):
                        skills.extend(skill_list)
                skills = skills[:3]  # Top 3 skills
            elif isinstance(skills_raw, list):
                skills = skills_raw[:3]  # Top 3 skills
            else:
                skills = []
            achievements = user_info.get('achievements', [])[:1]  # Top achievement
            
            # Build personalization context and track strong connections
            personalization_note = ""
            has_strong_connection = False
            if commonality_type == 'university':
                personalization_note = f"Both attended {sender_university_short} - emphasize the alumni connection naturally"
                has_strong_connection = True
            elif commonality_type == 'hometown':
                hometown = commonality_details.get('hometown', '')
                personalization_note = f"Both from {hometown} - mention the shared hometown connection"
            elif commonality_type == 'company':
                shared_company = commonality_details.get('company', '')
                personalization_note = f"Both worked at {shared_company} - reference the shared experience"
                has_strong_connection = True
            
            contact_strong_connections[i] = has_strong_connection
            
            # Build anchor detail section
            anchor_detail = ""
            if selected_anchor:
                anchor_detail = f"""
ANCHOR DETAIL:
- Use exactly ONE anchoring detail in the email.
- Anchor type: {selected_anchor['type']}
- Anchor value: {selected_anchor['value']}
- Do NOT include any other anchoring facts."""
            
            # Build contact context
            contact_context = f"""Contact {i}: {firstname} {lastname}
- Role: {title} at {company}
- Industry: {industry}
- Connection: {personalization_note if personalization_note else 'No specific connection - find a genuine reason to reach out'}
- Personalize by: Mentioning their role/company, asking about their experience, showing genuine interest in their work{anchor_detail}"""
            
            # TEMPORARY DEBUG: Print data for first contact only
            if i == 0:
                _debug_print_email_data(contact, user_info, user_profile, contact_context, resume_text, fit_context)
            
            contact_contexts.append(contact_context)
        
        # Build comprehensive prompt with resume details
        resume_context = ""
        if user_info.get('key_experiences'):
            resume_context += f"\n- Key Experiences: {', '.join(user_info['key_experiences'][:2])}"
        if user_info.get('skills'):
            # Handle skills - can be a list or dict (from resume parser)
            skills_raw = user_info.get('skills', [])
            if isinstance(skills_raw, dict):
                # Flatten dict structure into a list
                skills_list = []
                for category, skill_list in skills_raw.items():
                    if isinstance(skill_list, list):
                        skills_list.extend(skill_list)
                skills_list = skills_list[:3]  # Top 3 skills
                if skills_list:
                    resume_context += f"\n- Skills: {', '.join(skills_list)}"
            elif isinstance(skills_raw, list) and skills_raw:
                resume_context += f"\n- Skills: {', '.join(skills_raw[:3])}"
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
        
        prompt = f"""You write professional, natural networking emails that feel familiar, thoughtful, and human.

These emails should look like normal cold outreach — just done well.

Do NOT try to be clever, bold, or overly insightful.
Do NOT use marketing language or hype.
Do NOT sound automated.

The goal is simple:
Make the email feel reasonable to receive and easy to reply to.

CRITICAL:
- Always use correct grammar and apostrophes (I'm, I'd, I've, you're, it's, that's).
- Never write incomplete sentences.
- Use only standard ASCII characters.

TASK:
Write {len(contacts)} personalized networking emails.
Each email must be unique and intentionally written for the specific recipient.

ABOUT THE SENDER:
- Name: {sender_name}
- University: {sender_university_short if sender_university_short else 'Not specified'}
- Major: {user_info.get('major', 'Not specified')}
- Year: {user_info.get('year', 'Not specified')}{resume_context}
{fit_context_section}
{outreach_type_guidance}

QUALITY BAR (SAFE-HUMAN):
Before writing each email, decide:
- Why is it reasonable for this person to receive this email?
- What single detail explains why the sender chose them?

Avoid:
- "I hope you're doing well"
- "Hope this finds you well"
- "I came across your profile"
- "My name is…"
- Generic praise ("impressed by your background")

Prefer:
- A clear, simple reason for reaching out
- One specific reference
- Plain, professional language

CONTACTS:
{chr(10).join(contact_contexts)}

ANCHOR PRIORITY RULE:
If multiple anchors are available, prioritize:
1) Career transition
2) Tenure / timing
3) Title (fallback)

Use exactly ONE anchor.
Never stack anchors.

CONNECTION USAGE RULES:
If the sender and recipient share a strong connection (same university or same company):
- Mention it naturally once, either in the subject OR first sentence (not both)

If the connection is weaker (industry, location):
- Reference it lightly, without overemphasis

If no connection exists:
- Lead with a simple reason tied to the recipient's role or experience

WRITING GUIDELINES:
1. Write like a thoughtful student or early-career professional
2. Keep the tone professional, natural, and calm
3. Use at most one personalized detail per email
4. Keep length between 60–90 words
5. Vary opening sentences across emails
6. Favor clarity over creativity
7. Avoid buzzwords, hype, or sales language

If targeted outreach:
- Reference the role or path naturally
- Ask one relevant, straightforward question

If general networking:
- Focus on their experience or decisions
- Ask one simple, genuine question

CALL TO ACTION:
End with ONE polite, low-pressure ask.
Examples:
- "Would you be open to a quick 10–15 minute chat?"
- "I'd appreciate hearing your perspective."
- "Would you be open to connecting briefly?"
Do not ask multiple questions at the end.
Do not sound like you are asking for a favor.

RESUME ATTACHMENT RULE:
Only include a resume mention if (a) outreach is targeted OR (b) a strong connection exists (same university or same company).
If included:
- Mention it once, near the end
- Use neutral language only: "I've attached my resume below for context." or "I've attached my resume below in case helpful."
- Do NOT ask them to review it and do NOT ask for feedback.
If no strong reason exists, do NOT mention a resume.

FINAL CHECK:
Before returning the email, ask:
"Does this sound like a normal, well-written cold email a real person would send?"
If it feels robotic, clever, or forced — rewrite it.

FORMATTING:
- Start with: "Hi [FirstName],"
- Use \\n\\n for paragraph breaks in JSON
- End with:
  "Best,\\n[Sender Full Name]\\n{sender_university_short} | Class of {user_info.get('year', '')}"
  (only include university/year if available)
- Do NOT mention attached resumes unless RESUME ATTACHMENT RULE says to include it
- NEVER write sentences like "I'm studying at ."

Return ONLY valid JSON:
{{"0": {{"subject": "...", "body": "..."}}, "1": {{"subject": "...", "body": "..."}}, ...}}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You write professional, natural networking emails that feel familiar, thoughtful, and human. These emails should look like normal cold outreach — just done well. Do NOT try to be clever, bold, or overly insightful. Do NOT use marketing language or hype. Do NOT sound automated. The goal is simple: Make the email feel reasonable to receive and easy to reply to. Use only standard ASCII characters. CRITICAL: Always use proper grammar with correct apostrophes in contractions (I'm, I'd, couldn't, I've, you're, it's, that's, etc.). Never write 'Im', 'Id', 'couldnt', 'Ive', 'youre', 'thats' - always include the apostrophe."},
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
                
            # Post-processing: Fix banned filler openers
            if idx < len(contacts):
                contact = contacts[idx]
                firstname = contact.get('FirstName', '')
                greeting = f"Hi {firstname},"
                # Find greeting line (case-insensitive, handle variations)
                lines = body.split('\n')
                greeting_line_idx = None
                for i, line in enumerate(lines):
                    if line.strip().lower().startswith('hi ') and firstname.lower() in line.lower():
                        greeting_line_idx = i
                        break
                
                if greeting_line_idx is not None and greeting_line_idx + 1 < len(lines):
                    # Extract first sentence after greeting
                    first_sentence = lines[greeting_line_idx + 1].strip()
                    # Check for banned openers
                    banned_openers = ["I hope", "Hope", "My name is", "I came across"]
                    if first_sentence and any(first_sentence.startswith(banned) for banned in banned_openers):
                        # Replace with context-first opener
                        company = contact.get('Company', '')
                        title = contact.get('Title', '')
                        # Build a simple context-first opener
                        if company:
                            new_opener = f"Your work at {company} caught my attention."
                        elif title:
                            new_opener = f"Your experience as a {title} caught my attention."
                        else:
                            new_opener = "I'd like to learn more about your experience."
                        # Replace the first sentence in the line
                        lines[greeting_line_idx + 1] = new_opener
                        body = '\n'.join(lines)
            
            # Post-processing: Ensure only ONE anchor appears
            selected_anchor = selected_anchors.get(idx)
            if selected_anchor:
                anchor_value = selected_anchor['value'].lower()
                anchor_type = selected_anchor['type']
                
                # Detect multiple anchor mentions
                anchor_patterns = {
                    'transition': ['transitioned', 'moved into', 'shifted from'],
                    'tenure': ['recently joined', 'early in your time'],
                    'title': [contact.get('Title', '').lower(), contact.get('Company', '').lower()]
                }
                
                # Count anchor mentions
                body_lower = body.lower()
                anchor_mentions = []
                
                # Check for transition mentions
                if anchor_type == 'transition':
                    for pattern in anchor_patterns['transition']:
                        if pattern in body_lower:
                            anchor_mentions.append(pattern)
                # Check for tenure mentions
                elif anchor_type == 'tenure':
                    for pattern in anchor_patterns['tenure']:
                        if pattern in body_lower:
                            anchor_mentions.append(pattern)
                # Check for title/company mentions (only if title anchor)
                elif anchor_type == 'title':
                    title_mentions = 0
                    company_mentions = 0
                    if contact.get('Title', '').lower() in body_lower:
                        title_mentions = body_lower.count(contact.get('Title', '').lower())
                    if contact.get('Company', '').lower() in body_lower:
                        company_mentions = body_lower.count(contact.get('Company', '').lower())
                    # If both title and company appear multiple times, flag it
                    if title_mentions > 1 or company_mentions > 1:
                        anchor_mentions.append('multiple_title_company')
                
                # If multiple anchor patterns detected, keep only the first occurrence
                if len(anchor_mentions) > 1:
                    # Find first anchor mention and remove subsequent ones
                    # This is a simple heuristic - keep the first sentence with anchor, remove others
                    lines = body.split('\n')
                    cleaned_lines = []
                    anchor_found = False
                    
                    for line in lines:
                        line_lower = line.lower()
                        has_anchor = False
                        
                        if anchor_type == 'transition':
                            has_anchor = any(pattern in line_lower for pattern in anchor_patterns['transition'])
                        elif anchor_type == 'tenure':
                            has_anchor = any(pattern in line_lower for pattern in anchor_patterns['tenure'])
                        elif anchor_type == 'title':
                            # For title, check if this line has both title and company (likely the anchor)
                            has_title = contact.get('Title', '').lower() in line_lower
                            has_company = contact.get('Company', '').lower() in line_lower
                            has_anchor = has_title and has_company
                        
                        if has_anchor:
                            if not anchor_found:
                                # Keep first anchor mention
                                cleaned_lines.append(line)
                                anchor_found = True
                            # Skip subsequent anchor mentions
                        else:
                            cleaned_lines.append(line)
                    
                    if anchor_found:
                        body = '\n'.join(cleaned_lines)
            
            # Post-processing: Add resume line if appropriate
            should_include_resume = is_targeted_outreach or contact_strong_connections.get(idx, False)
            if should_include_resume:
                # Check if resume line already exists
                resume_mentions = ["attached my resume", "attached resume", "resume below", "resume attached"]
                has_resume_mention = any(mention in body.lower() for mention in resume_mentions)
                
                if not has_resume_mention:
                    # Insert resume line before the sign-off
                    # Find the sign-off (usually "Best," or "Best regards,")
                    sign_off_patterns = ["Best,", "Best regards,", "Thank you,", "Thanks,"]
                    resume_line = "I've attached my resume below for context."
                    
                    # Try to insert before sign-off
                    inserted = False
                    for pattern in sign_off_patterns:
                        if pattern in body:
                            # Insert before the sign-off
                            body = body.replace(pattern, f"{resume_line}\n\n{pattern}", 1)
                            inserted = True
                            break
                    
                    # If no sign-off found, append before the last line (signature)
                    if not inserted:
                        lines = body.split('\n')
                        if len(lines) > 1:
                            # Insert before last non-empty line (likely signature)
                            last_non_empty = len(lines) - 1
                            while last_non_empty > 0 and not lines[last_non_empty].strip():
                                last_non_empty -= 1
                            lines.insert(last_non_empty, resume_line)
                            body = '\n'.join(lines)
                        else:
                            # Fallback: append at end
                            body = f"{body}\n\n{resume_line}"
            else:
                # Remove resume mentions if they shouldn't be there
                resume_mentions = ["attached my resume", "attached resume", "resume below", "resume attached"]
                lines = body.split('\n')
                # Filter out lines containing any resume mention
                filtered_lines = []
                for line in lines:
                    has_resume_mention = any(mention in line.lower() for mention in resume_mentions)
                    if not has_resume_mention:
                        filtered_lines.append(line)
                body = '\n'.join(filtered_lines)
                
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
{signature}"""
                # Only add resume line in fallback if appropriate
                if should_include_resume:
                    body += "\n\nI've attached my resume below for context."
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

