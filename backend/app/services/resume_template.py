"""
Resume Template Service - Generate clean, professional, ATS-friendly resume PDFs
"""
import json
from io import BytesIO
from typing import Dict, Any, List, Optional

from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, PageBreak
from reportlab.lib.colors import HexColor


def _safe_paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    """Create a paragraph with safe HTML escaping and newline handling."""
    if not text:
        return Spacer(1, 0)
    # Escape HTML special characters
    text = str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # Convert newlines to HTML breaks
    text = text.replace("\n", "<br/>")
    return Paragraph(text, style)


def generate_resume_pdf(parsed_resume: Dict[str, Any]) -> bytes:
    """
    Generate a clean, professional, ATS-friendly resume PDF from structured resume data.
    
    Template structure:
    - Name and contact at top
    - Summary section
    - Experience section: Company | Title | Dates on one line, bullets below
    - Education section
    - Skills section
    - Projects section (if present)
    
    Args:
        parsed_resume: Structured resume data with sections like:
            - name: str
            - email, phone, linkedin, location: str (optional)
            - summary: str (optional)
            - experience: List[Dict] with keys: title, company, dates, bullets, location
            - education: List[Dict] with keys: degree, school, dates, details
            - skills: Dict[str, List[str]] or List[str]
            - projects: List[Dict] with keys: name, context, bullets (optional)
    
    Returns:
        PDF bytes
    """
    print(f"[Scout] resume_template.generate_resume_pdf called")
    
    # Debug: Check what experience data is being passed
    experience_data = parsed_resume.get('experience', [])
    print(f"[Scout] Experience data: {json.dumps(experience_data[:2] if experience_data else [], indent=2, default=str)}")
    
    try:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            rightMargin=0.75 * inch
        )
        
        styles = getSampleStyleSheet()
        story = []
        
        # Define professional styles - ATS-friendly fonts (Arial/Helvetica family)
        name_style = ParagraphStyle(
            "NameStyle",
            parent=styles["Heading1"],
            fontSize=20,
            textColor=HexColor("#000000"),
            spaceAfter=6,
            alignment=TA_CENTER,
            fontName="Helvetica-Bold"
        )
        
        contact_style = ParagraphStyle(
            "ContactStyle",
            parent=styles["BodyText"],
            fontSize=10,
            alignment=TA_CENTER,
            spaceAfter=12,
            textColor=HexColor("#333333")
        )
        
        section_title_style = ParagraphStyle(
            "SectionTitle",
            parent=styles["Heading2"],
            fontSize=12,
            textColor=HexColor("#000000"),
            spaceAfter=8,
            spaceBefore=14,
            fontName="Helvetica-Bold",
            borderWidth=0,
            borderPadding=0
        )
        
        body_style = ParagraphStyle(
            "BodyStyle",
            parent=styles["BodyText"],
            fontSize=10,
            leading=12,
            alignment=TA_LEFT,
            spaceAfter=4,
            textColor=HexColor("#000000")
        )
        
        # Experience entry header: Company | Title | Dates
        experience_header_style = ParagraphStyle(
            "ExperienceHeader",
            parent=body_style,
            fontSize=10,
            fontName="Helvetica-Bold",
            spaceAfter=2,
            spaceBefore=6
        )
        
        # Experience bullets
        bullet_style = ParagraphStyle(
            "BulletStyle",
            parent=body_style,
            leftIndent=18,
            bulletIndent=8,
            spaceAfter=3,
            fontSize=10
        )
        
        # Education entry style
        education_entry_style = ParagraphStyle(
            "EducationEntry",
            parent=body_style,
            fontSize=10,
            fontName="Helvetica-Bold",
            spaceAfter=2,
            spaceBefore=6
        )
        
        # Skills style
        skills_style = ParagraphStyle(
            "SkillsStyle",
            parent=body_style,
            fontSize=10,
            spaceAfter=4
        )
        
        # Name at top
        name = parsed_resume.get("name", "").strip()
        if name:
            story.append(_safe_paragraph(name.upper(), name_style))
        
        # Contact information
        contact_parts = []
        if parsed_resume.get("email"):
            contact_parts.append(parsed_resume["email"])
        if parsed_resume.get("phone"):
            contact_parts.append(parsed_resume["phone"])
        if parsed_resume.get("linkedin"):
            linkedin = parsed_resume["linkedin"]
            if not linkedin.startswith("http"):
                linkedin = f"linkedin.com/in/{linkedin.lstrip('/')}"
            contact_parts.append(linkedin)
        if parsed_resume.get("location"):
            contact_parts.append(parsed_resume["location"])
        
        if contact_parts:
            story.append(_safe_paragraph(" | ".join(contact_parts), contact_style))
        
        story.append(Spacer(1, 0.15 * inch))
        
        # Professional Summary
        summary = parsed_resume.get("summary", "").strip()
        if summary:
            story.append(_safe_paragraph("PROFESSIONAL SUMMARY", section_title_style))
            story.append(_safe_paragraph(summary, body_style))
            story.append(Spacer(1, 0.1 * inch))
        
        # Experience Section
        experience = parsed_resume.get("experience", [])
        if experience:
            story.append(_safe_paragraph("EXPERIENCE", section_title_style))
            
            for exp in experience:
                company = exp.get("company", "").strip()
                title = exp.get("title", "").strip()
                dates = exp.get("dates", "").strip()
                location = exp.get("location", "").strip()
                
                # Format: Company | Title | Dates (or Company | Title | Location | Dates)
                header_parts = []
                if company:
                    header_parts.append(company)
                if title:
                    header_parts.append(title)
                if location:
                    header_parts.append(location)
                if dates:
                    header_parts.append(dates)
                
                if header_parts:
                    header_text = " | ".join(header_parts)
                    story.append(_safe_paragraph(header_text, experience_header_style))
                
                # Bullet points
                bullets = exp.get("bullets", [])
                for bullet in bullets:
                    if bullet and isinstance(bullet, str) and bullet.strip():
                        story.append(_safe_paragraph(f"• {bullet.strip()}", bullet_style))
                
                story.append(Spacer(1, 0.1 * inch))
        
        # Education Section
        education = parsed_resume.get("education", [])
        if education:
            story.append(_safe_paragraph("EDUCATION", section_title_style))
            
            for edu in education:
                degree = edu.get("degree", "").strip()
                school = edu.get("school", "").strip()
                dates = edu.get("dates", "").strip()
                
                # Format: Degree, School | Dates
                entry_parts = []
                if degree:
                    entry_parts.append(degree)
                if school:
                    entry_parts.append(school)
                
                if entry_parts:
                    entry_text = ", ".join(entry_parts)
                    if dates:
                        entry_text += f" | {dates}"
                    story.append(_safe_paragraph(entry_text, education_entry_style))
                
                # Additional details (GPA, honors, etc.)
                details = edu.get("details", [])
                for detail in details:
                    if detail and isinstance(detail, str) and detail.strip():
                        story.append(_safe_paragraph(f"• {detail.strip()}", bullet_style))
                
                story.append(Spacer(1, 0.08 * inch))
        
        # Skills Section
        skills = parsed_resume.get("skills")
        if skills:
            story.append(_safe_paragraph("SKILLS", section_title_style))
            
            if isinstance(skills, dict):
                # Skills organized by category
                for category, skill_list in skills.items():
                    if not skill_list:
                        continue
                    
                    # Convert skill items to strings
                    skill_strings = []
                    for skill in skill_list:
                        if isinstance(skill, str):
                            skill_strings.append(skill)
                        elif isinstance(skill, dict):
                            skill_str = skill.get('name') or skill.get('skill') or skill.get('value') or str(skill)
                            if skill_str:
                                skill_strings.append(str(skill_str))
                        else:
                            skill_strings.append(str(skill))
                    
                    if skill_strings:
                        category_name = category.replace("_", " ").title()
                        skill_text = f"<b>{category_name}:</b> {', '.join(skill_strings)}"
                        story.append(_safe_paragraph(skill_text, skills_style))
            elif isinstance(skills, list):
                # Skills as a flat list
                skill_strings = []
                for skill in skills:
                    if isinstance(skill, str):
                        skill_strings.append(skill)
                    elif isinstance(skill, dict):
                        skill_str = skill.get('name') or skill.get('skill') or skill.get('value') or str(skill)
                        if skill_str:
                            skill_strings.append(str(skill_str))
                    else:
                        skill_strings.append(str(skill))
                
                if skill_strings:
                    skill_text = ", ".join(skill_strings)
                    story.append(_safe_paragraph(skill_text, skills_style))
            
            story.append(Spacer(1, 0.1 * inch))
        
        # Projects Section (if present)
        projects = parsed_resume.get("projects", [])
        if projects:
            story.append(_safe_paragraph("PROJECTS", section_title_style))
            
            for proj in projects:
                name = proj.get("name", "").strip()
                context = proj.get("context", "").strip()
                
                # Format: Project Name | Context
                if name:
                    proj_header_parts = [name]
                    if context:
                        proj_header_parts.append(context)
                    story.append(_safe_paragraph(" | ".join(proj_header_parts), experience_header_style))
                
                # Bullet points
                bullets = proj.get("bullets", [])
                for bullet in bullets:
                    if bullet and isinstance(bullet, str) and bullet.strip():
                        story.append(_safe_paragraph(f"• {bullet.strip()}", bullet_style))
                
                story.append(Spacer(1, 0.1 * inch))
        
        # Achievements (if present)
        achievements = parsed_resume.get("achievements", [])
        if achievements:
            story.append(_safe_paragraph("ACHIEVEMENTS", section_title_style))
            
            for achievement in achievements:
                if isinstance(achievement, str):
                    achievement_text = achievement.strip()
                elif isinstance(achievement, dict):
                    achievement_text = achievement.get("text", str(achievement)).strip()
                else:
                    achievement_text = str(achievement).strip()
                
                if achievement_text:
                    story.append(_safe_paragraph(f"• {achievement_text}", bullet_style))
            
            story.append(Spacer(1, 0.1 * inch))
        
        # Certifications (if present)
        certifications = parsed_resume.get("certifications", [])
        if certifications:
            story.append(_safe_paragraph("CERTIFICATIONS", section_title_style))
            
            for cert in certifications:
                if isinstance(cert, str):
                    cert_text = cert.strip()
                else:
                    cert_text = str(cert).strip()
                
                if cert_text:
                    story.append(_safe_paragraph(f"• {cert_text}", bullet_style))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer.getvalue()
        
    except Exception as e:
        print(f"[ResumeTemplate] PDF generation failed: {e}")
        import traceback
        traceback.print_exc()
        # Return empty PDF bytes as fallback
        return b""

