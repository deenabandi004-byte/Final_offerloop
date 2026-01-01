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
from app.services.openai_client import get_openai_client

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


def generate_recruiter_emails(
    recruiters: List[Dict],
    job_title: str,
    company: str,
    job_description: str,
    user_resume: Dict,
    user_contact: Dict
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
            used_approaches=used_approaches
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
    used_approaches: List[str] = None
) -> Optional[Dict]:
    """
    Generate a single personalized email for one recruiter.
    """
    if used_approaches is None:
        used_approaches = []
    
    recruiter_first_name = recruiter.get("FirstName", "")
    recruiter_email = recruiter.get("Email") or recruiter.get("WorkEmail", "")
    
    if not recruiter_email or recruiter_email == "Not available":
        return None
    
    # Extract user info
    user_name = user_contact.get("name", "")
    user_phone = user_contact.get("phone", "")
    user_linkedin = user_contact.get("linkedin", "")
    user_email = user_contact.get("email", "")
    
    # Build resume summary for the prompt
    resume_summary = build_resume_summary(user_resume)
    
    # Select approach for variation
    approaches = ["direct_confident", "warm_personable", "enthusiastic_specific", "brief_respectful", "story_driven"]
    available_approaches = [a for a in approaches if a not in used_approaches]
    if not available_approaches:
        available_approaches = approaches  # Reset if we've used all
    
    selected_approach = random.choice(available_approaches)
    used_approaches.append(selected_approach)
    
    # Generate email using GPT
    prompt = f"""Generate a personalized recruiter outreach email for a job application.

APPROACH STYLE: {selected_approach.replace('_', ' ').title()}
- direct_confident: Professional, assertive, gets to the point
- warm_personable: Friendly, conversational, builds rapport
- enthusiastic_specific: High energy, very specific about why they're excited
- brief_respectful: Short, respects recruiter's time, punchy
- story_driven: Opens with a hook, tells a mini narrative

RECRUITER INFO:
- Name: {recruiter_first_name}
- Title: {recruiter.get('Title', 'Recruiter')}
- Company: {company}

JOB INFO:
- Title: {job_title}
- Company: {company}
- Description: {job_description[:2000]}

CANDIDATE INFO:
- Name: {user_name}
- Phone: {user_phone}
- LinkedIn: {user_linkedin}
- Resume Summary:
{resume_summary}

REQUIREMENTS:
1. Address recruiter by first name ({recruiter_first_name})
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
13. CRITICAL: Always use proper grammar with correct apostrophes in contractions:
    - "I'm" not "Im"
    - "I'd" not "Id"
    - "couldn't" not "couldnt"
    - "I've" not "Ive"
    - "you're" not "youre"
    - "it's" not "its" (when meaning "it is")
    - "that's" not "thats"
    Always use proper English grammar with correct apostrophes in contractions.

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
                user_name=user_name
            )
        else:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert at writing compelling, personalized job application outreach emails. Your emails feel human, genuine, and eager without being desperate. You never use clichés or generic phrases. Every email you write feels like it was written by a real person who genuinely wants the job. CRITICAL: Always use proper grammar with correct apostrophes in contractions (I'm, I'd, couldn't, I've, you're, it's, that's, etc.). Never write 'Im', 'Id', 'couldnt', 'Ive', 'youre', 'thats' - always include the apostrophe."
                    },
                    {
                        "role": "user", 
                        "content": prompt
                    }
                ],
                temperature=0.85,  # Higher for more variation
                max_tokens=500
            )
            
            email_body = response.choices[0].message.content.strip()
        
    except Exception as e:
        print(f"[RecruiterEmail] GPT error: {e}")
        # Fallback to simple template
        email_body = generate_fallback_email(
            recruiter_first_name=recruiter_first_name,
            job_title=job_title,
            company=company,
            user_name=user_name
        )
    
    # Generate subject line
    subject_template = random.choice(SUBJECT_LINE_TEMPLATES)
    subject = subject_template.format(job_title=job_title, company=company)
    
    # Generate sign-off
    sign_off = random.choice(SIGN_OFFS)
    
    # Build signature block
    signature_parts = [user_name]
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
        "to_name": f"{recruiter.get('FirstName', '')} {recruiter.get('LastName', '')}".strip(),
        "subject": subject,
        "body": html_body,
        "plain_body": full_body,
        "approach_used": selected_approach
    }


def build_resume_summary(resume: Dict) -> str:
    """
    Build a concise summary of the resume for the GPT prompt.
    """
    parts = []
    
    # Name
    if resume.get("name"):
        parts.append(f"Name: {resume['name']}")
    
    # Education
    education = resume.get("education", {})
    if education:
        if isinstance(education, dict):
            edu_str = f"Education: {education.get('degree', '')} in {education.get('major', '')} from {education.get('university', '')}"
            parts.append(edu_str)
        elif isinstance(education, list) and len(education) > 0:
            edu = education[0]
            edu_str = f"Education: {edu.get('degree', '')} from {edu.get('school', '')}"
            parts.append(edu_str)
    
    # Experience
    experience = resume.get("experience", [])
    if experience:
        parts.append("Experience:")
        for i, exp in enumerate(experience[:3]):  # Top 3 experiences
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
            parts.append(f"Skills: {', '.join(all_skills[:10])}")
        elif isinstance(skills, list):
            parts.append(f"Skills: {', '.join(skills[:10])}")
    
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
                parts.append(f"  - {name}: {desc[:150]}")
    
    return "\n".join(parts)


def generate_fallback_email(
    recruiter_first_name: str,
    job_title: str,
    company: str,
    user_name: str
) -> str:
    """
    Generate a simple fallback email if GPT fails.
    """
    return f"""Hi {recruiter_first_name},

I recently applied for the {job_title} position at {company} and wanted to reach out directly to express my enthusiasm for this opportunity.

I believe my background and skills make me a strong fit for this role, and I'm genuinely excited about the possibility of contributing to your team.

I'd love the chance to discuss how I can add value. Would you have a few minutes to connect?

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

