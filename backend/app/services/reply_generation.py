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
import re

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


def fix_apostrophes_and_formatting(text: str) -> str:
    """Fix common apostrophe and formatting issues in generated emails"""
    
    # Fix missing apostrophes in contractions
    replacements = {
        " Im ": " I'm ",
        " Id ": " I'd ",
        " Ill ": " I'll ",
        " Ive ": " I've ",
        " youre ": " you're ",
        " youve ": " you've ",
        " youd ": " you'd ",
        " youll ": " you'll ",
        " theyre ": " they're ",
        " theyve ": " they've ",
        " theyd ": " they'd ",
        " weve ": " we've ",
        " wed ": " we'd ",
        " wont ": " won't ",
        " cant ": " can't ",
        " dont ": " don't ",
        " doesnt ": " doesn't ",
        " didnt ": " didn't ",
        " isnt ": " isn't ",
        " arent ": " aren't ",
        " wasnt ": " wasn't ",
        " werent ": " weren't ",
        " hasnt ": " hasn't ",
        " havent ": " haven't ",
        " hadnt ": " hadn't ",
        " couldnt ": " couldn't ",
        " wouldnt ": " wouldn't ",
        " shouldnt ": " shouldn't ",
        " thats ": " that's ",
        " whats ": " what's ",
        " heres ": " here's ",
        " theres ": " there's ",
        " lets ": " let's ",
    }
    
    # Also handle start of sentence
    start_replacements = {
        "Im ": "I'm ",
        "Id ": "I'd ",
        "Ill ": "I'll ",
        "Ive ": "I've ",
    }
    
    for wrong, right in replacements.items():
        text = text.replace(wrong, right)
    
    for wrong, right in start_replacements.items():
        if text.startswith(wrong):
            text = right + text[len(wrong):]
    
    # Fix "1015 minute" -> "10-15 minute" and similar patterns
    # Match patterns like "1015", "1520", "2030" followed by "minute"
    text = re.sub(r'(\d{1,2})(\d{2})(\s*minute)', r'\1-\2\3', text)
    
    # Fix other number ranges that got concatenated
    # e.g., "1520 minute" -> "15-20 minute"
    text = re.sub(r'\b(10)(15)\b', r'\1-\2', text)
    text = re.sub(r'\b(15)(20)\b', r'\1-\2', text)
    text = re.sub(r'\b(20)(30)\b', r'\1-\2', text)
    
    return text

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


# Purpose values that should include the resume attachment line in the email. Others (sales, follow_up, custom) omit it.
PURPOSES_INCLUDE_RESUME = (None, "networking", "referral")

# Phrases that indicate the email says a resume is attached (used for actually attaching the file when creating drafts).
RESUME_MENTIONS = ["attached my resume", "attached resume", "resume below", "resume attached"]

# Sign-off phrases that indicate the email has a proper closing (must be followed by sender name).
SIGN_OFF_PHRASES = ("Best,", "Best regards,", "Thank you,", "Thanks,", "Sincerely,", "Kind regards,", "Warm regards,", "Looking forward to connecting,")


def email_has_sign_off(body: str, sender_name: str) -> bool:
    """Return True if the email body already ends with a sign-off line followed by a name."""
    if not body or not isinstance(body, str):
        return False
    text = body.strip()
    if not text:
        return False
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    if len(lines) < 2:
        return False
    last_line = lines[-1]
    prev_line = lines[-2]
    # Last line should look like a name (short, no trailing period)
    name_ok = len(last_line) < 80 and not last_line.endswith(".")
    if not name_ok:
        return False
    # Second-to-last should be a sign-off phrase
    prev_lower = prev_line.strip()
    return any(prev_lower.startswith(p) for p in SIGN_OFF_PHRASES)


def _build_signature_block_for_prompt(signoff_config, user_info):
    """
    Build the signature block string for the LLM prompt.
    signoff_config: {"signoffPhrase": str, "signatureBlock": str} or None.
    If signoff_config has non-empty signatureBlock, return signoff_phrase + "\\n" + signature_block.
    Else return signoff_phrase + "\\n[Full Name]\\n[University] | Class of [Year]".
    """
    phrase = "Best,"
    block = ""
    if signoff_config and isinstance(signoff_config, dict):
        phrase = (signoff_config.get("signoffPhrase") or "").strip() or "Best,"
        block = (signoff_config.get("signatureBlock") or "").strip()
    if block:
        return f"{phrase}\n{block}"
    return f"{phrase}\n[Full Name]\n[University] | Class of [Year]"


def _deduplicate_signoff(body, signoff_config):
    """Remove duplicate signoff blocks from email body. Keeps only the last signoff block."""
    if not body or not signoff_config:
        return body
    phrase = (signoff_config.get("signoffPhrase") or "").strip()
    if not phrase:
        return body

    lines = body.split("\n")
    phrase_norm = phrase.lower().strip().rstrip(",")
    signoff_indices = [i for i, line in enumerate(lines) if line.strip().lower().rstrip(",") == phrase_norm]

    if len(signoff_indices) >= 2:
        sig_block_text = (signoff_config.get("signatureBlock") or "").strip()
        sig_lines_count = len([l for l in sig_block_text.split("\n") if l.strip()]) if sig_block_text else 1
        for idx in signoff_indices[:-1]:
            block_end = min(idx + 1 + sig_lines_count, len(lines))
            for j in range(idx, block_end):
                lines[j] = ""
        body = "\n".join(lines)
        while "\n\n\n" in body:
            body = body.replace("\n\n\n", "\n\n")
        print("DEBUG: Removed duplicate signoff block(s)", flush=True)
    return body


def ensure_sign_off(body: str, sender_name: str, signoff_config=None) -> str:
    """Ensure the email body ends with a sign-off and sender name. Appends if missing."""
    if not body or not body.strip():
        return body
    name = (sender_name or "Student").strip() or "Student"
    if email_has_sign_off(body, name):
        return body
    phrase = "Best regards,"
    extra_lines = ""
    if signoff_config and isinstance(signoff_config, dict):
        phrase = (signoff_config.get("signoffPhrase") or "").strip() or "Best,"
        block = (signoff_config.get("signatureBlock") or "").strip()
        if block:
            extra_lines = "\n" + block
        else:
            extra_lines = "\n" + name
    else:
        extra_lines = "\n" + name
    base = body.rstrip()
    if not base.endswith("\n"):
        base += "\n"
    return f"{base}\n\n{phrase}{extra_lines}"


def email_body_mentions_resume(body):
    """Return True if the email body text says a resume is attached (so we should attach the file to the draft)."""
    if not body or not isinstance(body, str):
        return False
    lower = body.lower()
    return any(phrase in lower for phrase in RESUME_MENTIONS)


def build_template_prompt(context_block: str, template_instructions: str, requirements_block: str) -> str:
    """
    Build the full email generation prompt by inserting optional template_instructions
    between the context block and the EMAIL REQUIREMENTS (structure/rules) block.
    If template_instructions is empty, no injection (backwards compatible).
    """
    if not (template_instructions or "").strip():
        print("[EmailTemplate] build_template_prompt: no template_instructions, skipping injection")
        return f"{context_block}\n\n{requirements_block}"
    print(f"[EmailTemplate] build_template_prompt: injecting {len(template_instructions)} chars of template instructions")
    return f"{context_block}\n\n{template_instructions.strip()}\n\n{requirements_block}"


def batch_generate_emails(contacts, resume_text, user_profile, career_interests, fit_context=None, pre_parsed_user_info=None, template_instructions="", email_template_purpose=None, resume_filename=None, subject_line=None, signoff_config=None, auth_display_name=None):
    """
    Generate all emails using the new compelling prompt template.

    Args:
        ...
        auth_display_name: Optional display name from Firebase Auth; used as last resort before "Student".
    """
    try:
        print(f"DEBUG: batch_generate_emails received auth_display_name={auth_display_name!r}", flush=True)
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
        
        # Extract user info: use pre_parsed_user_info when provided (e.g. Pro tier), else extract from resume/profile
        user_info = extract_user_info_from_resume_priority(resume_text, user_profile)
        if pre_parsed_user_info and isinstance(pre_parsed_user_info, dict):
            # Merge so pre-parsed name/education are used and we don't overwrite with empty
            for key, value in pre_parsed_user_info.items():
                if value is not None and value != "" and (not isinstance(value, (list, dict)) or value):
                    if not user_info.get(key) or user_info.get(key) == "":
                        user_info[key] = value
            # Prefer pre-parsed name if we have it (Pro tier parsed from resume)
            if pre_parsed_user_info.get("name"):
                user_info["name"] = pre_parsed_user_info["name"]
        
        # Never leave name blank — use profile, then Auth display name, never "Student" if we have a real name
        if not (user_info.get("name") or "").strip():
            user_info["name"] = (user_profile.get("name") or "") if user_profile else ""
            if not (user_info.get("name") or "").strip() and user_profile:
                first = (user_profile.get("firstName") or user_profile.get("first_name") or "").strip()
                last = (user_profile.get("lastName") or user_profile.get("last_name") or "").strip()
                user_info["name"] = f"{first} {last}".strip()
            if not (user_info.get("name") or "").strip() and (auth_display_name or "").strip():
                user_info["name"] = (auth_display_name or "").strip()
            if not (user_info.get("name") or "").strip():
                user_info["name"] = "Student"
        print(f"DEBUG sender name final: user_info['name']={user_info.get('name', '')!r}", flush=True)
        
        print(f"[EmailTemplate] batch_generate_emails template_instructions len={len(template_instructions or '')}, sender name={user_info.get('name', '')!r}")
        
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
        sender_name = (user_info.get('name') or '').strip() or 'Student'
        sender_firstname = sender_name.split()[0] if sender_name else 'Student'
        
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
        
        is_custom_purpose = email_template_purpose == "custom"
        include_resume_in_prompt = bool(resume_filename)
        if resume_filename:
            resume_line_section = f"""
RESUME LINE (Third Paragraph - BEFORE signature):
- "I've included my resume ({resume_filename}) for your reference."

"""
        else:
            resume_line_section = ""

        resume_rule_line = "6. Resume mention comes BEFORE the signature, not after\n7. " if include_resume_in_prompt else "6. "
        resume_do_not_line = "- Put resume mention after signature\n- " if include_resume_in_prompt else "- "
        length_rule_num = "8" if include_resume_in_prompt else "7"

        # For custom purpose: no networking-specific rules; user's template_instructions ARE the requirements
        if is_custom_purpose:
            context_block = f"""TASK:
Generate {len(contacts)} personalized emails. Each email must be unique and written for that specific recipient.

ABOUT THE SENDER:
- Name: {sender_name}
- University: {sender_university_short if sender_university_short else 'Not specified'}
- Major: {user_info.get('major', 'Not specified')}
- Year: {user_info.get('year', 'Not specified')}{resume_context}
{fit_context_section}

CONTACTS:
{chr(10).join(contact_contexts)}"""
            subject_instruction = ""
            if subject_line:
                subject_instruction = f'\n- Use this subject line pattern for all emails (personalize with recipient details): "{subject_line}"'
            # Check if custom instructions already contain the signoff phrase — avoid double signoff
            _instructions_lower = (template_instructions or "").lower()
            _signoff_phrase = (signoff_config or {}).get("signoffPhrase", "Best,").strip()
            _phrase_variations = [
                _signoff_phrase.lower(),
                _signoff_phrase.lower().rstrip(","),
                _signoff_phrase.lower().rstrip(",") + ",",
            ]
            instructions_already_have_signoff = any(v in _instructions_lower for v in _phrase_variations if v)

            if instructions_already_have_signoff:
                # Custom instructions already contain a signoff — don't add SIGNATURE block
                print("DEBUG: Skipping SIGNATURE block in prompt — custom instructions already contain signoff phrase", flush=True)
                minimal_formatting = f"""
===== FORMATTING ONLY =====
- Start each email with "Hi [FirstName],"{subject_instruction}
- Use proper grammar with apostrophes (I'm, I'd, you're, it's)
- Use \\n\\n for paragraph breaks in JSON
- Do NOT add a sign-off block — the custom instructions already include one
- IMPORTANT: Replace any name in the sign-off with: {user_info.get('name', 'the sender')}

Return ONLY valid JSON:
{{"0": {{"subject": "...", "body": "..."}}, "1": {{"subject": "...", "body": "..."}}, ...}}"""
            else:
                _sig_block = _build_signature_block_for_prompt(signoff_config, user_info)
                minimal_formatting = f"""
===== FORMATTING ONLY =====
- Start each email with "Hi [FirstName],"{subject_instruction}
- Use proper grammar with apostrophes (I'm, I'd, you're, it's)
- Use \\n\\n for paragraph breaks in JSON
- End each body with this exact sign-off block:
{_sig_block}

Return ONLY valid JSON:
{{"0": {{"subject": "...", "body": "..."}}, "1": {{"subject": "...", "body": "..."}}, ...}}"""
            prompt = f"{context_block}\n\n{(template_instructions or '').strip()}\n\n{minimal_formatting}"
            system_content = "You write personalized emails. Follow the user's custom instructions and style exactly. Do not add networking rules, resume mentions, or coffee chat asks unless the instructions say so. Return only valid JSON."
        else:
            context_block = f"""You write professional, warm networking emails for college students reaching out to industry professionals.

TASK:
Write {len(contacts)} personalized networking emails.
Each email must be unique and specifically written for that recipient.

ABOUT THE SENDER:
- Name: {sender_name}
- University: {sender_university_short if sender_university_short else 'Not specified'}
- Major: {user_info.get('major', 'Not specified')}
- Year: {user_info.get('year', 'Not specified')}{resume_context}
{fit_context_section}
{outreach_type_guidance}

CONTACTS:
{chr(10).join(contact_contexts)}"""
            signature_block_prompt = _build_signature_block_for_prompt(signoff_config, user_info)

            requirements_block = f"""===== EMAIL STRUCTURE (FOLLOW THIS EXACTLY) =====

OPENING (First Paragraph):
- Start with: "Hi [FirstName],"
- Then: "I came across your background at [Company] and noticed your work as a [title] there."
- Then: "I'm a [University] student studying [Major], and I'm especially interested in [something specific about their company/role/industry]."

MIDDLE (Second Paragraph):
- Ask TWO specific questions:
  1. About their projects or work: "I'd love to hear about the projects you've found most engaging"
  2. About their day-to-day: "and what your day-to-day looks like on the [engineering/product/etc.] side"
- End with specific time ask: "If you're open to it, would you have 15 minutes for a quick chat sometime in the next couple of weeks?"
{resume_line_section}SIGNATURE (REQUIRED - every email MUST end with this):
Use exactly this format (sign-off line then name/signature block):
{signature_block_prompt}
CRITICAL: Never end the email without a sign-off and the sender's name.

===== FORMATTING RULES =====

1. Use "I came across your background at [Company]" - NOT "I'm reaching out because I noticed"
2. ALWAYS mention the sender's major: "I'm a [University] student studying [Major]"
3. Show interest in the COMPANY's work, not just generic "your work"
4. Ask TWO questions (projects + day-to-day OR career path + advice)
5. Specific time: "15 minutes" and "next couple of weeks"
{resume_rule_line}No parentheses around university name - use "University of Southern California" not "(USC)"
{length_rule_num}. LENGTH: 4-5 sentences in the body (not counting greeting/signature). Do NOT be too brief.

===== DO NOT =====
- Start with "I'm reaching out because I noticed..."
- Use generic phrases like "I'd be interested in hearing about your work"
{resume_do_not_line}Use parentheses in university name like "(USC)"
- Write emails shorter than 4 sentences
- Use "Hope this finds you well" or "I hope you're doing well"
- Sound templated or robotic
- Write "[your major]" or any placeholder text - always fill in actual values

===== SUBJECT LINES =====
{f'Use this exact subject line pattern for all emails (personalize with [Company] or recipient details): "{subject_line}"' if subject_line else """Make them conversational and specific:
- "Question about your work at [Company]"
- "Curious about your journey at [Company]"
- "Quick question from a [University] student"
- "Learning from your path at [Company]"
- "Insight on your role at [Company]"

NOT these generic ones:
- "Networking request"
- "Introduction"
- "Coffee chat request"
- "Hope to connect\""""}

===== CRITICAL =====
- If major is empty or "Not specified", write "I'm a [University] student" without mentioning major
- Use proper grammar with apostrophes (I'm, I'd, you're, it's)
- Use \\n\\n for paragraph breaks in JSON

Return ONLY valid JSON:
{{"0": {{"subject": "...", "body": "..."}}, "1": {{"subject": "...", "body": "..."}}, ...}}"""

            prompt = build_template_prompt(context_block, template_instructions or "", requirements_block)
            system_content = "You write warm, professional networking emails for college students. Your emails are 4-5 sentences (not counting greeting/signature), show genuine interest in the recipient's company and role, and always ask TWO specific questions. You ALWAYS mention the sender's university and major. You use the exact phrase 'I came across your background at [Company]' to open. The resume mention always comes BEFORE the signature. You ALWAYS end every email with a sign-off line (e.g. Best, or Best regards,) followed by the sender's full name. Use proper apostrophes (I'm, I'd, you're). Never use placeholders like [your major] - always fill in actual values or omit gracefully."

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": prompt}
            ],
            max_tokens=4000,  # ✅ ISSUE 4 FIX: Increased for larger batches (15+ contacts)
            temperature=0.75,  # Balanced for naturalness and consistency
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
            
            # Fix apostrophes and formatting issues
            subject = fix_apostrophes_and_formatting(subject)
            body = fix_apostrophes_and_formatting(body)
            
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
                    banned_openers = ["I hope you're doing well", "Hope you're doing well", "I hope this", "Hope this", "My name is"]
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
            
            # Post-processing: Add resume reference line when user has a resume file
            if resume_filename:
                has_resume_mention = email_body_mentions_resume(body)
                
                if has_resume_mention:
                    # Replace generic resume mention with one that references the actual filename
                    for mention in RESUME_MENTIONS:
                        for line in body.split('\n'):
                            if mention in line.lower():
                                body = body.replace(line, f"I've included my resume ({resume_filename}) for your reference.")
                                break
                        else:
                            continue
                        break
                else:
                    sign_off_patterns = ["Best,", "Best regards,", "Thank you,", "Thanks,", "Warm regards,", "Cheers,", "Sincerely,"]
                    if signoff_config and (signoff_config.get("signoffPhrase") or "").strip():
                        custom_phrase = (signoff_config.get("signoffPhrase") or "").strip()
                        if custom_phrase not in sign_off_patterns:
                            sign_off_patterns.insert(0, custom_phrase)
                    resume_line = f"I've included my resume ({resume_filename}) for your reference."
                    
                    inserted = False
                    for pattern in sign_off_patterns:
                        if pattern in body:
                            body = body.replace(pattern, f"{resume_line}\n\n{pattern}", 1)
                            inserted = True
                            break
                    
                    if not inserted:
                        lines = body.split('\n')
                        if len(lines) > 1:
                            last_non_empty = len(lines) - 1
                            while last_non_empty > 0 and not lines[last_non_empty].strip():
                                last_non_empty -= 1
                            lines.insert(last_non_empty, resume_line)
                            body = '\n'.join(lines)
                        else:
                            body = f"{body}\n\n{resume_line}"
            else:
                # No resume — strip any AI-generated resume mentions so the email doesn't lie
                lines = body.split('\n')
                filtered_lines = [line for line in lines if not any(m in line.lower() for m in RESUME_MENTIONS)]
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
                if signoff_config and isinstance(signoff_config, dict):
                    phrase = (signoff_config.get("signoffPhrase") or "").strip() or "Thank you,"
                    block = (signoff_config.get("signatureBlock") or "").strip()
                    signature = block if block else (user_info.get('name', '') or "Best regards")
                else:
                    phrase = "Thank you,"
                    signature = user_info.get('name', '') or "Best regards"
                
                body = f"""Hi {contact.get('FirstName', '')},

{intro} Your work at {company} caught my attention.

Would you be open to a brief 15-minute chat about your experience?

{phrase}
{signature}"""
                # Only add resume line in fallback if we have a resume file (same as normal path)
                if resume_filename:
                    body += "\n\nI've attached my resume below for context."
                subject = f"Question about {company}"
            
            # Ensure every email ends with a sign-off and sender name
            sender_name = user_info.get('name', '') or 'Student'
            body = ensure_sign_off(body, sender_name, signoff_config)
            body = _deduplicate_signoff(body, signoff_config)
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
            
            # Build closing signature (use signoff_config when available)
            if signoff_config and isinstance(signoff_config, dict):
                phrase = (signoff_config.get("signoffPhrase") or "").strip() or "Thank you,"
                block = (signoff_config.get("signatureBlock") or "").strip()
                signature = block if block else (user_info.get('name', '') or "Best regards")
            else:
                phrase = "Thank you,"
                signature = user_info.get('name', '') or "Best regards"
            
            fallback_results[i] = {
                'subject': f"Question about {company}",
                'body': f"""Hi {contact.get('FirstName', '')},

{intro} Your work at {company} caught my attention.

Would you be open to a brief 15-minute chat about your experience?

{phrase}
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

