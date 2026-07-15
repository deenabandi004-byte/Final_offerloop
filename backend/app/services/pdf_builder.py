"""
PDF builder service - generate coffee chat prep PDFs (WeasyPrint + Jinja2)
and resume/cover letter PDFs (ReportLab)
"""
import logging
import os
import re
from datetime import datetime
from io import BytesIO
from typing import Dict, List, Optional

import markdown
from jinja2 import Environment, FileSystemLoader
try:
    from weasyprint import HTML as WeasyHTML
except (ImportError, OSError) as e:
    WeasyHTML = None
    import logging
    logging.getLogger(__name__).warning(f'WeasyPrint unavailable, PDF generation disabled: {e}')

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

logger = logging.getLogger(__name__)

# Resolve templates directory relative to this file
_TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")


def _md_to_html(text: str) -> str:
    """Convert markdown text to HTML snippet."""
    if not text:
        return "<p>Not available.</p>"
    # Strip any code fences the AI wrapped output in (```markdown, ```json, ```, etc.)
    text = re.sub(r"```[\w]*\n?", "", text)
    text = re.sub(r"```", "", text)
    text = text.strip()
    return markdown.markdown(text, extensions=["nl2br"])


def _parse_strategy_sections(strategy_md: str) -> dict:
    """
    Parse strategy markdown into structured sections for template rendering.
    Returns dict with keys: flow_html, do_items, avoid_items
    """
    sections = {
        "flow_html": "",
        "do_items": [],
        "avoid_items": [],
    }
    if not strategy_md:
        return sections

    # Extract DO THIS items — stop at AVOID THIS or end of string
    do_match = re.search(
        r'\*\*DO THIS\*\*.*?\n(.*?)(?=\*\*AVOID THIS\*\*|\Z)',
        strategy_md, re.IGNORECASE | re.DOTALL
    )
    if do_match:
        raw = do_match.group(1)
        sections["do_items"] = [
            re.sub(r'^[-•]\s*', '', line).strip()
            for line in raw.strip().split('\n')
            if line.strip() and re.match(r'^[-•]', line.strip())
        ]

    # Extract AVOID THIS items — stop at next header or end of string
    avoid_match = re.search(
        r'\*\*AVOID THIS\*\*.*?\n(.*?)(?=\*\*[A-Z]|\Z)',
        strategy_md, re.IGNORECASE | re.DOTALL
    )
    if avoid_match:
        raw = avoid_match.group(1)
        sections["avoid_items"] = [
            re.sub(r'^[-•]\s*', '', line).strip()
            for line in raw.strip().split('\n')
            if line.strip() and re.match(r'^[-•]', line.strip())
        ]

    # Everything before DO THIS is the flow section
    do_split = re.split(r'\*\*DO THIS\*\*', strategy_md, flags=re.IGNORECASE)
    if do_split:
        sections["flow_html"] = _md_to_html(do_split[0].strip())

    return sections


def render_coffee_chat_html(
    contact_data: dict,
    research: dict,
    ai_output: dict,
    user_context: dict,
) -> str:
    """Render Jinja2 template to HTML string."""
    env = Environment(loader=FileSystemLoader(_TEMPLATES_DIR))
    tmpl = env.get_template("coffee_chat_prep.html")

    strategy_raw    = ai_output.get("strategy", "")
    strategy_sections = _parse_strategy_sections(strategy_raw)
    strategy_html   = _md_to_html(strategy_raw)
    # Clean up any ordered list tags that cause layout artifacts in WeasyPrint
    strategy_html = strategy_html.replace("<ol>", "<ul>").replace("</ol>", "</ul>")
    # Remove empty list tags
    strategy_html = re.sub(r'<ul[^>]*>\s*</ul>', '', strategy_html)
    strategy_html = re.sub(r'<ol[^>]*>\s*</ol>', '', strategy_html)
    similarity_html = _md_to_html(ai_output.get("similarity", ""))
    cheat_html      = _md_to_html(ai_output.get("cheat_sheet", ""))

    questions_categories = ai_output.get("questions", [])
    logger.info(f'[PDF] questions_categories type={type(questions_categories)} length={len(questions_categories) if questions_categories else 0} preview={str(questions_categories)[:300]}')

    return tmpl.render(
        contact              = contact_data,
        user                 = user_context,
        research             = research,
        questions_categories = questions_categories,
        similarity_html      = similarity_html,
        cheat_sheet_html     = cheat_html,
        strategy_html        = strategy_html,
        strategy_sections    = strategy_sections,
        date                 = datetime.now().strftime("%B %Y"),
    )


def generate_coffee_chat_pdf_v2(
    contact_data: dict,
    research: dict,
    ai_output: dict,
    user_context: dict,
) -> BytesIO:
    """
    Generate a 3-page Coffee Chat Prep PDF using WeasyPrint + Jinja2.
    Returns a BytesIO buffer containing the PDF.
    """
    try:
        html_string = render_coffee_chat_html(contact_data, research, ai_output, user_context)
        _devnull = open(os.devnull, "w")
        _old_stderr = os.dup(2)
        os.dup2(_devnull.fileno(), 2)
        try:
            pdf_bytes = WeasyHTML(string=html_string).write_pdf()
        finally:
            os.dup2(_old_stderr, 2)
            os.close(_old_stderr)
            _devnull.close()
        buffer = BytesIO(pdf_bytes)
        return buffer
    except Exception as exc:
        logger.error(f"WeasyPrint PDF generation failed: {exc}")
        import traceback
        traceback.print_exc()
        raise


# ─── Legacy ReportLab functions (kept for resume & cover letter PDFs) ────────

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

            if line.isupper() or (line.endswith(':') and len(line) < 50):
                current_section = line.rstrip(':')
                story.append(_safe_paragraph(f"<b>{current_section}</b>", section_title))
            elif line.startswith(('•', '-', '*', '—')):
                bullet_text = line.lstrip('•-*— ').strip()
                story.append(Paragraph(f"<bullet>•</bullet> {bullet_text}", bullet_style))
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


def generate_cover_letter_pdf(
    content: str,
    *,
    company: Optional[str] = None,
    applicant: Optional[Dict[str, str]] = None,
    letter_date: Optional[str] = None,
) -> BytesIO:
    """Generate a professionally-formatted cover letter PDF.

    Layout follows recruiter-preferred conventions for consulting, IB, and
    tech applications: 1-inch margins, Times New Roman, left-aligned block
    paragraphs, name header + contact line, date, recipient (company), then
    the letter body (which already includes the salutation and signoff).

    Args:
        content: The letter body starting with the salutation and ending
            with the signature block. Rendered as-is under the header.
        company: Target company; rendered as the recipient block. Skipped
            when empty.
        applicant: Optional applicant contact info. Recognized keys:
            name, email, phone, linkedin, city. Missing keys are silently
            omitted so the header stays clean.
        letter_date: Overrides the date line. Defaults to today formatted
            as "July 15, 2026".
    """
    try:
        # Belt-and-suspenders: sanitize em dashes that may have slipped
        # through the prompt-level kill-list. The PDF is the last surface.
        from app.utils.em_dash import strip_em_dashes
        content = strip_em_dashes(content or "")

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            leftMargin=inch,
            rightMargin=inch,
            topMargin=inch,
            bottomMargin=inch,
            title="Cover Letter",
        )

        name_style = ParagraphStyle(
            "CLName", fontName="Times-Bold", fontSize=15,
            textColor="#000000", leading=17, spaceAfter=2, alignment=TA_LEFT,
        )
        contact_style = ParagraphStyle(
            "CLContact", fontName="Times-Roman", fontSize=10.5,
            textColor="#000000", leading=12, spaceAfter=16, alignment=TA_LEFT,
        )
        meta_style = ParagraphStyle(
            "CLMeta", fontName="Times-Roman", fontSize=11,
            textColor="#000000", leading=13, spaceAfter=14, alignment=TA_LEFT,
        )
        body_style = ParagraphStyle(
            "CLBody", fontName="Times-Roman", fontSize=11,
            textColor="#000000", leading=13, spaceAfter=10, alignment=TA_LEFT,
        )

        story: List = []

        info = applicant or {}
        name = str(info.get("name") or "").strip()
        if name:
            story.append(Paragraph(name, name_style))
            contact_parts = [
                str(info.get(k) or "").strip()
                for k in ("city", "phone", "email", "linkedin")
            ]
            contact_parts = [p for p in contact_parts if p]
            if contact_parts:
                story.append(Paragraph(" &nbsp;|&nbsp; ".join(contact_parts), contact_style))
            else:
                story.append(Spacer(1, 10))

        now = datetime.now()
        date_text = (letter_date or f"{now.strftime('%B')} {now.day}, {now.year}").strip()
        story.append(Paragraph(date_text, meta_style))

        company_clean = (company or "").strip()
        if company_clean:
            story.append(Paragraph(company_clean, meta_style))

        for para in content.split("\n\n"):
            para = para.strip()
            if not para:
                continue
            html = para.replace("\n", "<br/>")
            story.append(Paragraph(html, body_style))

        doc.build(story)
        buffer.seek(0)
        return buffer

    except Exception as exc:
        logger.error(f"Cover letter PDF generation failed: {exc}")
        import traceback
        traceback.print_exc()
        fallback = BytesIO()
        fallback.write(b"%PDF-1.4\nCover Letter - Error generating PDF")
        fallback.seek(0)
        return fallback
