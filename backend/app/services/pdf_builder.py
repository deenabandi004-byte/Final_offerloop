"""
PDF builder service - generate coffee chat prep PDFs
Clean full-width layout with teal header bar
"""
import logging
from io import BytesIO
from typing import Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

from app.utils.coffee_chat_prep import select_relevant_questions
from app.services.coffee_chat import _score_news_relevance

logger = logging.getLogger(__name__)

# Color scheme
COLORS = {
    'header_bg': '#0d4f6e',
    'accent': '#00a8cc',
    'text_white': '#ffffff',
    'text_dark': '#1a1a1a',
    'section_header': '#0d4f6e',
    'divider': '#00a8cc',
}


def generate_coffee_chat_pdf(
    *,
    prep_id: str,
    contact_data: Dict,
    news_items: List[Dict],
    industry_summary: str,
    similarity_summary: str,
    questions: List[str],
    hometown: Optional[str],
    context: Dict,
):
    """
    Generate Coffee Chat PDF with clean full-width layout.
    
    Sections:
    1. Profile Snapshot - name, company/title, LinkedIn, email, office, hometown
    2. Professional Background - current role, experience, education, skills
    3. Organization & Industry Context - company, division, industry, news
    4. Personal Hooks & Shared Background - similarity summary
    5. Sample Coffee Chat Questions - up to 8 questions
    """
    try:
        buffer = BytesIO()
        page_width, page_height = letter
        
        # Full width layout with margins
        margin_left = 0.6 * inch
        margin_right = 0.6 * inch
        content_width = page_width - margin_left - margin_right
        
        c = canvas.Canvas(buffer, pagesize=letter)
        
        # ===================== HEADER BAR =====================
        header_height = 0.7 * inch
        c.setFillColor(colors.HexColor(COLORS['header_bg']))
        c.rect(0, page_height - header_height, page_width, header_height, fill=1, stroke=0)
        
        # Offerloop logo on left
        c.setFillColor(colors.HexColor(COLORS['accent']))
        c.setFont('Helvetica-Bold', 14)
        c.drawString(margin_left, page_height - 0.45 * inch, "Offerloop.ai")
        
        # Contact name centered
        contact_name = f"{contact_data.get('firstName', '')} {contact_data.get('lastName', '')}".strip()
        if contact_name:
            c.setFillColor(colors.HexColor(COLORS['text_white']))
            c.setFont('Helvetica-Bold', 18)
            title_text = f"{contact_name} One "
            title_width = c.stringWidth(title_text, 'Helvetica-Bold', 18)
            pager_width = c.stringWidth("Pager", 'Helvetica-Bold', 18)
            title_x = (page_width - title_width - pager_width) / 2 + 0.5 * inch
            c.drawString(title_x, page_height - 0.45 * inch, title_text)
            
            # "Pager" with underline accent
            c.setFillColor(colors.HexColor(COLORS['accent']))
            pager_x = title_x + title_width
            c.drawString(pager_x, page_height - 0.45 * inch, "Pager")
            c.setStrokeColor(colors.HexColor(COLORS['accent']))
            c.setLineWidth(2)
            c.line(pager_x, page_height - 0.52 * inch, pager_x + pager_width, page_height - 0.52 * inch)
        
        # ===================== HELPER FUNCTIONS =====================
        def draw_section_header(title, y_pos):
            """Draw a section header with underline accent"""
            c.setFillColor(colors.HexColor(COLORS['section_header']))
            c.setFont('Helvetica-Bold', 12)
            c.drawString(margin_left, y_pos, title)
            y_pos -= 5
            c.setStrokeColor(colors.HexColor(COLORS['divider']))
            c.setLineWidth(2)
            title_w = c.stringWidth(title, 'Helvetica-Bold', 12)
            c.line(margin_left, y_pos, margin_left + title_w + 10, y_pos)
            return y_pos - 16
        
        def draw_bullet(text, y_pos, indent=8, font_size=10):
            """Draw a bullet point with text wrapping"""
            if not text or not text.strip():
                return y_pos
            c.setFont('Helvetica', font_size)
            c.setFillColor(colors.HexColor(COLORS['text_dark']))
            lines = simpleSplit(f"• {text}", 'Helvetica', font_size, content_width - indent)
            for line in lines:
                c.drawString(margin_left + indent, y_pos, line)
                y_pos -= (font_size + 4)
            return y_pos
        
        def draw_sub_item(text, y_pos, indent=20, font_size=9):
            """Draw a sub-item (news article, etc.)"""
            if not text or not text.strip():
                return y_pos
            c.setFont('Helvetica', font_size)
            c.setFillColor(colors.HexColor(COLORS['text_dark']))
            lines = simpleSplit(f"- {text}", 'Helvetica', font_size, content_width - indent)
            for line in lines:
                c.drawString(margin_left + indent, y_pos, line)
                y_pos -= (font_size + 3)
            return y_pos
        
        def draw_numbered(num, text, y_pos, indent=8, font_size=10):
            """Draw a numbered item with text wrapping"""
            if not text or not text.strip():
                return y_pos
            c.setFont('Helvetica', font_size)
            c.setFillColor(colors.HexColor(COLORS['text_dark']))
            lines = simpleSplit(f"{num}. {text}", 'Helvetica', font_size, content_width - indent)
            for line in lines:
                c.drawString(margin_left + indent, y_pos, line)
                y_pos -= (font_size + 3)
            return y_pos - 2
        
        # ===================== CONTENT SECTIONS =====================
        y = page_height - header_height - 0.4 * inch
        
        # ---------- SECTION 1: PROFILE SNAPSHOT ----------
        y = draw_section_header("Profile Snapshot", y)
        
        if contact_name:
            y = draw_bullet(contact_name, y)
        
        # Company and job title
        company = contact_data.get('company', '').strip()
        job_title = contact_data.get('jobTitle', '').strip()
        if company and job_title:
            y = draw_bullet(f"{company} | {job_title}", y)
        elif company:
            y = draw_bullet(company, y)
        elif job_title:
            y = draw_bullet(job_title, y)
        
        # LinkedIn URL
        linkedin_url = contact_data.get('linkedinUrl', '') or contact_data.get('linkedin_url', '') or contact_data.get('linkedin', '')
        if linkedin_url and linkedin_url.strip():
            y = draw_bullet(linkedin_url.strip(), y)
        
        # Email
        email = contact_data.get('email', '').strip()
        if email:
            y = draw_bullet(email, y)
        
        # Location/Office
        location = (contact_data.get('location') or context.get('location', '')).strip()
        if location and location.upper() != 'N/A':
            y = draw_bullet(f"Office: {location}", y)
        
        # Hometown
        if hometown and hometown.strip() and hometown.upper() != 'N/A':
            y = draw_bullet(f"Hometown: {hometown.strip()}", y)
        
        y -= 12
        
        # ---------- SECTION 2: PROFESSIONAL BACKGROUND ----------
        y = draw_section_header("Professional Background", y)
        
        # Current role
        if job_title and company:
            y = draw_bullet(f"Current Role: {job_title} at {company}", y)
        
        # Work experience from PDL data
        experience = contact_data.get('experience', []) or []
        if isinstance(experience, list):
            exp_count = 0
            for exp in experience:
                if exp_count >= 3:  # Limit to 3 past roles
                    break
                if isinstance(exp, dict):
                    exp_company = exp.get('company', {})
                    if isinstance(exp_company, dict):
                        exp_company_name = exp_company.get('name', '')
                    else:
                        exp_company_name = str(exp_company) if exp_company else ''
                    
                    exp_title = exp.get('title', {})
                    if isinstance(exp_title, dict):
                        exp_title_name = exp_title.get('name', '')
                    else:
                        exp_title_name = str(exp_title) if exp_title else ''
                    
                    # Skip if this is the current role (already shown)
                    if exp_company_name == company and exp_title_name == job_title:
                        continue
                    
                    if exp_company_name and exp_title_name:
                        y = draw_bullet(f"Previously: {exp_title_name} at {exp_company_name}", y)
                        exp_count += 1
                    elif exp_company_name:
                        y = draw_bullet(f"Previously at {exp_company_name}", y)
                        exp_count += 1
        
        # Education from PDL data
        education = contact_data.get('education', []) or []
        if isinstance(education, list):
            for edu in education[:2]:  # Limit to 2 schools
                if isinstance(edu, dict):
                    school = edu.get('school', {})
                    if isinstance(school, dict):
                        school_name = school.get('name', '')
                    else:
                        school_name = str(school) if school else ''
                    
                    if school_name:
                        edu_text = school_name
                        
                        degrees = edu.get('degrees', [])
                        if degrees and isinstance(degrees, list) and len(degrees) > 0:
                            edu_text += f" - {degrees[0]}"
                        
                        majors = edu.get('majors', [])
                        if majors and isinstance(majors, list) and len(majors) > 0:
                            edu_text += f" in {majors[0]}"
                        
                        y = draw_bullet(edu_text, y)
        
        # Skills
        skills = contact_data.get('skills', []) or []
        if isinstance(skills, list) and len(skills) > 0:
            top_skills = [s for s in skills[:6] if s]  # Top 6 skills
            if top_skills:
                y = draw_bullet(f"Skills: {', '.join(top_skills)}", y)
        
        y -= 12
        
        # ---------- SECTION 3: ORGANIZATION & INDUSTRY CONTEXT ----------
        y = draw_section_header("Organization & Industry Context", y)
        
        if company:
            y = draw_bullet(f"Company: {company}", y)
        
        # Division/team from context
        division = context.get('division', '').strip()
        if division:
            y = draw_bullet(f"Team/Division: {division}", y)
        
        # Industry
        industry = contact_data.get('industry', '') or context.get('industry', '')
        if industry and industry.strip():
            y = draw_bullet(f"Industry: {industry.strip()}", y)
        
        # Score and select news items
        scored_news = []
        for item in news_items:
            score = _score_news_relevance(item)
            summary = (item.get("summary", "") or "").strip()
            title = (item.get("title", "") or "").strip()
            if score >= 0.5 and title:  # Lowered threshold, require title
                scored_news.append((score, item))
        
        scored_news.sort(key=lambda x: x[0], reverse=True)
        top_news = [item for _, item in scored_news[:3]]
        
        if top_news:
            c.setFont('Helvetica', 10)
            c.setFillColor(colors.HexColor(COLORS['text_dark']))
            c.drawString(margin_left + 8, y, "• Recent News:")
            y -= 14
            
            for news in top_news:
                title = (news.get('title', '') or '')
                if len(title) > 60:
                    title = title[:57] + "..."
                source = news.get('source', '')
                
                news_text = title
                if source:
                    news_text += f" ({source})"
                
                y = draw_sub_item(news_text, y)
        
        # Industry summary if available and we have space
        if industry_summary and industry_summary.strip() and y > 4 * inch:
            y -= 4
            summary_text = industry_summary.strip()
            if len(summary_text) > 150:
                summary_text = summary_text[:147] + "..."
            y = draw_bullet(f"Industry Pulse: {summary_text}", y, font_size=9)
        
        y -= 12
        
        # ---------- SECTION 4: PERSONAL HOOKS & SHARED BACKGROUND ----------
        y = draw_section_header("Personal Hooks & Shared Background", y)
        
        if similarity_summary and similarity_summary.strip():
            c.setFont('Helvetica', 10)
            c.setFillColor(colors.HexColor(COLORS['text_dark']))
            lines = simpleSplit(f"• {similarity_summary.strip()}", 'Helvetica', 10, content_width - 8)
            for line in lines:
                c.drawString(margin_left + 8, y, line)
                y -= 14
        else:
            c.setFont('Helvetica-Oblique', 10)
            c.setFillColor(colors.HexColor('#666666'))
            c.drawString(margin_left + 8, y, "• No specific shared background identified")
            y -= 14
        
        y -= 12
        
        # ---------- SECTION 5: SAMPLE COFFEE CHAT QUESTIONS ----------
        y = draw_section_header("Sample Coffee Chat Questions", y)
        
        # Get up to 8 questions
        all_questions = questions or []
        
        if similarity_summary and len(all_questions) > 0:
            selected_questions = select_relevant_questions(all_questions, similarity_summary, max_questions=8)
        else:
            selected_questions = all_questions[:8]
        
        for i, question in enumerate(selected_questions, 1):
            y = draw_numbered(i, question, y)
            
            # Check if we're running out of space
            if y < 0.8 * inch:
                break
        
        # ===================== FOOTER =====================
        c.setFont('Helvetica-Oblique', 8)
        c.setFillColor(colors.HexColor('#666666'))
        c.drawString(margin_left, 0.45 * inch, "We encourage you to not solely rely on our one pager. This is meant as a tentative overview.")
        c.drawString(margin_left, 0.3 * inch, "We recommend you ask scout for additional resources.")
        
        c.setFillColor(colors.HexColor(COLORS['accent']))
        c.setFont('Helvetica-Bold', 10)
        c.drawString(page_width - margin_right - 90, 0.35 * inch, "Offerloop.ai")
        c.setFillColor(colors.HexColor('#666666'))
        c.setFont('Helvetica', 9)
        c.drawString(page_width - margin_right - 30, 0.35 * inch, "2025")
        
        # Save
        c.save()
        buffer.seek(0)
        return buffer

    except Exception as exc:
        logger.error(f"PDF generation failed: {exc}")
        import traceback
        traceback.print_exc()
        
        # Fallback to simple error PDF
        fallback = BytesIO()
        fallback_c = canvas.Canvas(fallback, pagesize=letter)
        fallback_c.setFont('Helvetica', 12)
        fallback_c.drawString(100, 700, "Coffee Chat Prep - Error generating PDF")
        fallback_c.drawString(100, 680, f"Error: {str(exc)[:80]}")
        fallback_c.save()
        fallback.seek(0)
        return fallback


def _safe_paragraph(text: str, style) -> Paragraph:
    """Create a paragraph with newlines converted to breaks"""
    return Paragraph(text.replace("\n", "<br/>"), style)


async def build_resume_pdf_from_text(resume_text: str) -> bytes:
    """Generate a PDF from resume text content"""
    try:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=letter, 
            topMargin=36, 
            bottomMargin=36, 
            leftMargin=54, 
            rightMargin=54
        )
        styles = getSampleStyleSheet()
        story: List = []

        name_style = ParagraphStyle(
            "Name",
            parent=styles["Heading1"],
            fontSize=16,
            textColor="#1a1a1a",
            spaceAfter=6,
            alignment=TA_CENTER,
        )
        section_title = ParagraphStyle(
            "SectionTitle",
            parent=styles["Heading2"],
            fontSize=11,
            textColor="#1a1a1a",
            spaceAfter=6,
            spaceBefore=12,
            borderPadding=(0, 0, 2, 0),
        )
        body_style = ParagraphStyle(
            "Body",
            parent=styles["BodyText"],
            fontSize=10,
            leading=12,
            alignment=TA_LEFT,
            spaceAfter=4,
        )
        bullet_style = ParagraphStyle(
            "Bullets",
            parent=body_style,
            leftIndent=12,
            bulletIndent=0,
            spaceAfter=2,
        )

        lines = resume_text.strip().split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Detect section headers (all caps or ending with :)
            if line.isupper() or (line.endswith(':') and len(line) < 50):
                current_section = line.rstrip(':')
                story.append(_safe_paragraph(f"<b>{current_section}</b>", section_title))
            # Detect bullet points
            elif line.startswith(('•', '-', '*', '—')):
                bullet_text = line.lstrip('•-*— ').strip()
                story.append(Paragraph(f"<bullet>•</bullet> {bullet_text}", bullet_style))
            # First non-section line is often the name
            elif len(story) == 0 and len(line) < 60:
                story.append(_safe_paragraph(f"<b>{line}</b>", name_style))
            else:
                story.append(_safe_paragraph(line, body_style))

        doc.build(story)
        buffer.seek(0)
        return buffer.read()

    except Exception as exc:
        logger.error(f"Resume PDF generation failed: {exc}")
        import traceback
        traceback.print_exc()
        fallback = BytesIO()
        fallback.write(b"%PDF-1.4\nResume - Error generating PDF")
        fallback.seek(0)
        return fallback.read()


def generate_cover_letter_pdf(content: str) -> BytesIO:
    """Generate a PDF from cover letter text content"""
    try:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=letter, 
            topMargin=36, 
            bottomMargin=36
        )
        styles = getSampleStyleSheet()
        story: List = []

        body_style = ParagraphStyle(
            "Body",
            parent=styles["BodyText"],
            fontSize=11,
            leading=14,
            alignment=TA_LEFT,
            spaceAfter=6,
        )

        paragraphs = content.split('\n\n')
        for para in paragraphs:
            if para.strip():
                para_text = para.replace('\n', '<br/>')
                story.append(_safe_paragraph(para_text, body_style))
                story.append(Spacer(1, 0.1 * inch))

        doc.build(story)
        buffer.seek(0)
        return buffer

    except Exception as exc:
        print(f"Cover letter PDF generation failed: {exc}")
        import traceback
        traceback.print_exc()
        fallback = BytesIO()
        fallback.write(b"%PDF-1.4\nCover Letter - Error generating PDF")
        fallback.seek(0)
        return fallback