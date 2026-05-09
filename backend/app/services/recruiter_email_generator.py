"""
Recruiter Outreach Email Generator

Generates personalized outreach emails for recruiters found via PDL.
Uses GPT to create natural, varied emails based on proven templates.

Usage:
    from app.services.recruiter_email_generator import generate_recruiter_emails

    emails = generate_recruiter_emails(
        recruiters=[...],  # List of recruiter contacts from PDL
        job_title="Software Engineer",
        company="Google",
        job_description="...",
        user_resume={...},  # User's parsed resume
        user_contact={...}  # User's contact info
    )
"""

from typing import List, Dict, Optional
import random
import html
import re
from app.services.openai_client import get_openai_client


def _normalize_name(name: str) -> str:
    """
    Normalize a person's name to proper title case.
    Handles: extra whitespace, ALL CAPS, all lowercase, Mc/Mac prefixes, hyphens.
    Examples: "john" → "John", "JOHN" → "John", "  john  " → "John",
              "mcdonald" → "McDonald", "jean-pierre" → "Jean-Pierre",
              "O'BRIEN" → "O'Brien"
    """
    if not name or not isinstance(name, str):
        return ""
    name = name.strip()
    if not name:
        return ""

    def _title_part(part: str) -> str:
        # Handle Mc/Mac prefixes
        lower = part.lower()
        if lower.startswith("mc") and len(part) > 2:
            return "Mc" + part[2:].capitalize()
        if lower.startswith("mac") and len(part) > 3 and part[3:].isalpha():
            return "Mac" + part[3:].capitalize()
        # Handle O' prefix
        if lower.startswith("o'") and len(part) > 2:
            return "O'" + part[2:].capitalize()
        return part.capitalize()

    # Split on spaces, handle each word (which may contain hyphens)
    words = name.split()
    result_words = []
    for word in words:
        if "-" in word:
            result_words.append("-".join(_title_part(p) for p in word.split("-")))
        else:
            result_words.append(_title_part(word))

    return " ".join(result_words)

# Template variations for subject lines
SUBJECT_LINE_TEMPLATES = [
    "{job_title} Application - Excited to Connect",
    "Following Up on My {job_title} Application",
    "Eager {job_title} Candidate - Let's Connect!",
    "{job_title} at {company} - Quick Introduction",
    "Why I'm Excited About the {job_title} Role",
    "Reaching Out About the {job_title} Position",
    "{job_title} Role - Passionate Candidate Here",
]

# Sign-off variations
SIGN_OFFS = [
    "Best,",
    "Best regards,",
    "Thanks so much,",
    "Looking forward to hearing from you,",
    "Warm regards,",
    "Thank you for your time,",
    "Cheers,",
]

# Patterns used to detect an LLM-generated sign-off that sneaks into the body
_SIGNOFF_PATTERNS = [
    "best", "best regards", "kind regards", "regards", "warm regards",
    "thanks", "thanks so much", "thank you", "thank you for your time",
    "sincerely", "cheers", "looking forward to hearing from you",
    "looking forward", "many thanks", "all the best",
]


def _strip_trailing_signoff(text: str) -> str:
    """
    Strip any trailing sign-off + name lines from an LLM-generated email body.

    The prompt tells the model not to include a sign-off, but it often does
    anyway (e.g. "Best,\\nDeena"). If we don't strip it, the final email ends
    up with two sign-offs stacked on top of each other.
    """
    if not text:
        return text

    lines = text.rstrip().split("\n")

    # Walk backwards dropping empty trailing lines
    while lines and not lines[-1].strip():
        lines.pop()

    # Look at the last up-to-4 non-empty lines for a sign-off.
    # A sign-off is a short line (<= ~45 chars) whose text (stripped of
    # trailing punctuation) matches one of the known patterns.
    for lookback in range(1, 5):
        if len(lines) < lookback:
            break
        candidate = lines[-lookback].strip().rstrip(",.!").lower()
        if len(candidate) <= 45 and candidate in _SIGNOFF_PATTERNS:
            # Drop the sign-off line AND any lines that came after it
            # (typically the user's name / signature the LLM added)
            del lines[-lookback:]
            break

    # Clean up trailing empties again after removal
    while lines and not lines[-1].strip():
        lines.pop()

    return "\n".join(lines)


def generate_recruiter_emails(
    recruiters: List[Dict],
    job_title: str,
    company: str,
    job_description: str,
    user_resume: Dict,
    user_contact: Dict,
    resume_text: str = "",
    template_instructions: str = "",
    role_type: str = "recruiter"
) -> List[Dict]:
    """
    Generate personalized outreach emails for each recruiter.

    Args:
        recruiters: List of recruiter contacts from PDL
        job_title: Job title from posting
        company: Company name
        job_description: Full job description
        user_resume: User's parsed resume data
        user_contact: User's contact info (name, email, phone, linkedin)
        resume_text: Raw resume text for richer GPT context
        template_instructions: User's custom email template/instructions
        role_type: "recruiter" or "hiring_manager" for tone adjustment

    Returns:
        List of email dictionaries with:
        - recruiter: Original recruiter data
        - to_email: Recruiter's email
        - subject: Email subject line
        - body: Email body (HTML)
        - plain_body: Email body (plain text)
    """
    emails = []
    used_approaches = []  # Track which template styles we've used

    for i, recruiter in enumerate(recruiters):
        # Skip if no email
        recruiter_email = recruiter.get("Email") or recruiter.get("WorkEmail")
        if not recruiter_email or recruiter_email == "Not available":
            continue

        # Generate unique email for this recruiter
        email_data = generate_single_email(
            recruiter=recruiter,
            job_title=job_title,
            company=company,
            job_description=job_description,
            user_resume=user_resume,
            user_contact=user_contact,
            variation_index=i,
            used_approaches=used_approaches,
            resume_text=resume_text,
            template_instructions=template_instructions,
            role_type=role_type
        )

        if email_data:
            emails.append(email_data)

    return emails


def generate_single_email(
    recruiter: Dict,
    job_title: str,
    company: str,
    job_description: str,
    user_resume: Dict,
    user_contact: Dict,
    variation_index: int = 0,
    used_approaches: List[str] = None,
    resume_text: str = "",
    template_instructions: str = "",
    role_type: str = "recruiter"
) -> Optional[Dict]:
    """
    Generate a single personalized email for one recruiter.
    """
    if used_approaches is None:
        used_approaches = []

    recruiter_first_name = _normalize_name(recruiter.get("FirstName", ""))
    recruiter_email = recruiter.get("Email") or recruiter.get("WorkEmail", "")

    if not recruiter_email or recruiter_email == "Not available":
        return None

    # Extract user info
    user_name = user_contact.get("name", "")
    user_phone = user_contact.get("phone", "")
    user_linkedin = user_contact.get("linkedin", "")
    user_email = user_contact.get("email", "")

    # Build resume context: prefer raw text, fall back to structured summary
    if resume_text and len(resume_text.strip()) > 100:
        resume_context = f"Full Resume:\n{resume_text[:3000]}"
    else:
        resume_context = f"Resume Summary:\n{build_resume_summary(user_resume)}"

    # Select approach for variation
    approaches = ["direct_confident", "warm_personable", "enthusiastic_specific", "brief_respectful", "story_driven"]
    available_approaches = [a for a in approaches if a not in used_approaches]
    if not available_approaches:
        available_approaches = approaches  # Reset if we've used all

    selected_approach = random.choice(available_approaches)
    used_approaches.append(selected_approach)

    # Adjust tone for hiring managers vs recruiters
    if role_type == "hiring_manager":
        role_label = "hiring manager"
        tone_note = "This person is a hiring manager (not a recruiter). Focus on how the candidate can contribute to their team and solve problems they face. Be more technical and specific about relevant skills."
    else:
        role_label = "recruiter"
        tone_note = "This person is a recruiter/talent acquisition professional. Focus on enthusiasm for the role and why the candidate is a strong fit. Be professional but personable."

    # Build custom instructions section
    custom_section = ""
    if template_instructions and template_instructions.strip():
        custom_section = f"""
CUSTOM INSTRUCTIONS FROM CANDIDATE:
{template_instructions.strip()[:500]}
Follow these instructions while keeping the email natural and professional.
"""

    # Generate email using GPT
    prompt = f"""Generate a personalized outreach email to a {role_label} for a job application.

APPROACH STYLE: {selected_approach.replace('_', ' ').title()}
- direct_confident: Professional, assertive, gets to the point
- warm_personable: Friendly, conversational, builds rapport
- enthusiastic_specific: High energy, very specific about why they're excited
- brief_respectful: Short, respects recruiter's time, punchy
- story_driven: Opens with a hook, tells a mini narrative

TONE NOTE: {tone_note}

RECIPIENT INFO:
- Name: {recruiter_first_name}
- Title: {recruiter.get('Title', role_label.title())}
- Company: {company}

JOB INFO:
- Title: {job_title}
- Company: {company}
- Description: {job_description[:2000]}

CANDIDATE INFO:
- Name: {user_name}
- {resume_context}
{custom_section}
REQUIREMENTS:
1. Address recipient by first name ({recruiter_first_name})
2. Mention the specific job title ({job_title}) and company ({company})
3. Include ONE specific detail from the job description that excites the candidate
4. Include ONE specific achievement or experience from the resume that's relevant
5. Keep it concise (150-200 words max for body)
6. Sound human and genuine - like someone who really wants this job
7. Don't be generic - make it feel personal
8. End with a call to action (would love to chat, etc.)
9. DO NOT include subject line or sign-off - I'll add those separately
10. DO NOT include "Dear" - start with "Hi {recruiter_first_name},"
11. DO NOT include attachments mentions - I'll handle that
12. Vary sentence structure and length for natural flow

OUTPUT FORMAT:
Return ONLY the email body text. No subject line, no signature block.
Start directly with "Hi {recruiter_first_name},"
"""

    try:
        client = get_openai_client()
        if not client:
            print("[RecruiterEmail] OpenAI client not available")
            email_body = generate_fallback_email(
                recruiter_first_name=recruiter_first_name,
                job_title=job_title,
                company=company,
                user_name=user_name,
                user_resume=user_resume,
                role_type=role_type
            )
        else:
            response = client.with_options(max_retries=0).chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert at writing compelling, personalized job application outreach emails. Your emails feel human, genuine, and eager without being desperate. You never use clichés or generic phrases. Every email you write feels like it was written by a real person who genuinely wants the job."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.85,
                max_tokens=500
            )

            email_body = response.choices[0].message.content.strip()

    except Exception as e:
        print(f"[RecruiterEmail] GPT error: {e}")
        # Fallback to template
        email_body = generate_fallback_email(
            recruiter_first_name=recruiter_first_name,
            job_title=job_title,
            company=company,
            user_name=user_name,
            user_resume=user_resume,
            role_type=role_type
        )

    # Generate subject line
    subject_template = random.choice(SUBJECT_LINE_TEMPLATES)
    subject = subject_template.format(job_title=job_title, company=company)

    # Strip any trailing sign-off the LLM may have snuck in despite the
    # prompt instructing it not to. Prevents duplicate sign-offs in the final email.
    email_body = _strip_trailing_signoff(email_body)

    # Generate sign-off
    sign_off = random.choice(SIGN_OFFS)

    # Build signature block
    signature_parts = [user_name] if user_name else []
    if user_phone:
        signature_parts.append(user_phone)
    if user_linkedin:
        signature_parts.append(user_linkedin)

    signature = "\n".join(signature_parts)

    # Add note about attached resume
    attachment_note = "\n\nI've attached my resume for your reference."

    # Combine full email
    full_body = f"{email_body}{attachment_note}\n\n{sign_off}\n{signature}"

    # Create HTML version
    html_body = plain_to_html(full_body)

    return {
        "recruiter": recruiter,
        "to_email": recruiter_email,
        "to_name": f"{_normalize_name(recruiter.get('FirstName', ''))} {_normalize_name(recruiter.get('LastName', ''))}".strip(),
        "subject": subject,
        "body": html_body,
        "plain_body": full_body,
        "approach_used": selected_approach
    }


def build_resume_summary(resume: Dict) -> str:
    """
    Build a concise summary of the resume for the GPT prompt.
    Used as fallback when raw resume text is not available.
    """
    if not resume:
        return "No resume data available."

    parts = []

    # Name
    if resume.get("name"):
        parts.append(f"Name: {resume['name']}")

    # Education - handle both dict and list formats
    education = resume.get("education", {})
    if education:
        if isinstance(education, dict):
            degree = education.get('degree', '')
            major = education.get('major', '')
            university = education.get('university', '')
            gpa = education.get('gpa', '')
            edu_str = f"Education: {degree}"
            if major:
                edu_str += f" in {major}"
            if university:
                edu_str += f" from {university}"
            if gpa:
                edu_str += f" (GPA: {gpa})"
            parts.append(edu_str)
        elif isinstance(education, list) and len(education) > 0:
            edu = education[0]
            degree = edu.get('degree', '')
            # Handle both 'school' and 'university' field names
            school = edu.get('university', '') or edu.get('school', '')
            major = edu.get('major', '')
            edu_str = f"Education: {degree}"
            if major:
                edu_str += f" in {major}"
            if school:
                edu_str += f" from {school}"
            parts.append(edu_str)

    # Experience
    experience = resume.get("experience", [])
    if experience:
        parts.append("Experience:")
        for exp in experience[:3]:  # Top 3 experiences
            if isinstance(exp, dict):
                title = exp.get("title", exp.get("Title", ""))
                company = exp.get("company", exp.get("Company", ""))
                # Get bullet points/achievements
                bullets = exp.get("bullets", exp.get("achievements", exp.get("description", [])))
                if isinstance(bullets, list) and bullets:
                    achievement = bullets[0] if isinstance(bullets[0], str) else str(bullets[0])
                    parts.append(f"  - {title} at {company}: {achievement[:200]}")
                else:
                    parts.append(f"  - {title} at {company}")

    # Skills
    skills = resume.get("skills", {})
    if skills:
        if isinstance(skills, dict):
            all_skills = []
            for category, skill_list in skills.items():
                if isinstance(skill_list, list):
                    all_skills.extend(skill_list[:5])
                elif isinstance(skill_list, str):
                    all_skills.append(skill_list)
            if all_skills:
                parts.append(f"Skills: {', '.join(all_skills[:10])}")
        elif isinstance(skills, list):
            parts.append(f"Skills: {', '.join(str(s) for s in skills[:10])}")

    # Projects
    projects = resume.get("projects", [])
    if projects:
        parts.append("Notable Projects:")
        for proj in projects[:2]:
            if isinstance(proj, dict):
                name = proj.get("name", proj.get("title", ""))
                desc = proj.get("description", "")
                if isinstance(desc, list):
                    desc = desc[0] if desc else ""
                if name:
                    parts.append(f"  - {name}: {desc[:150]}")

    return "\n".join(parts) if parts else "No resume data available."


def generate_fallback_email(
    recruiter_first_name: str,
    job_title: str,
    company: str,
    user_name: str,
    user_resume: Dict = None,
    role_type: str = "recruiter"
) -> str:
    """
    Generate a fallback email if GPT fails.
    Pulls one detail from resume to avoid being fully generic.
    """
    greeting = f"Hi {recruiter_first_name}," if recruiter_first_name else "Hello,"
    position = job_title or "open"
    org = company or "your company"

    # Try to extract one personal detail from resume
    personal_detail = ""
    if user_resume and isinstance(user_resume, dict):
        # Try education
        education = user_resume.get("education", {})
        if isinstance(education, dict) and education.get("university"):
            personal_detail = f" As a {education.get('degree', 'graduate')} from {education['university']},"
        elif isinstance(education, list) and education:
            edu = education[0]
            school = edu.get("university", "") or edu.get("school", "")
            if school:
                personal_detail = f" As a {edu.get('degree', 'graduate')} from {school},"

        # Try most recent experience if no education detail
        if not personal_detail:
            experience = user_resume.get("experience", [])
            if experience and isinstance(experience[0], dict):
                exp = experience[0]
                exp_title = exp.get("title", exp.get("Title", ""))
                exp_company = exp.get("company", exp.get("Company", ""))
                if exp_title and exp_company:
                    personal_detail = f" With my experience as {exp_title} at {exp_company},"

    if role_type == "hiring_manager":
        action = "I'd welcome the opportunity to discuss how my skills could contribute to your team"
    else:
        action = "I'd love the chance to discuss how I can add value"

    return f"""{greeting}

I recently applied for the {position} position at {org} and wanted to reach out directly to express my enthusiasm for this opportunity.
{f'{personal_detail} I believe I am a strong fit for this role.' if personal_detail else "I believe my background and skills make me a strong fit for this role,"} and I'm genuinely excited about the possibility of contributing to your team.

{action}. Would you have a few minutes to connect?

Thank you for your time!"""


def plain_to_html(text: str) -> str:
    """
    Convert plain text email to simple HTML.
    """
    # Escape HTML characters
    text = html.escape(text)

    # Convert newlines to <br>
    text = text.replace("\n", "<br>")

    # Wrap in basic HTML
    return f"<div style='font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;'>{text}</div>"
