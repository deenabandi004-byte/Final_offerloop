"""
PDF builder service - generate coffee chat prep PDFs
"""
import logging
from io import BytesIO
from typing import Dict, List, Optional

from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

from app.utils.coffee_chat_prep import select_relevant_questions
from app.services.coffee_chat import _score_news_relevance

logger = logging.getLogger(__name__)


def _safe_paragraph(text: str, style) -> Paragraph:
    return Paragraph(text.replace("\n", "<br/>"), style)


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
    """Generate an enhanced Coffee Chat PDF"""
    try:
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=36, bottomMargin=36)
        styles = getSampleStyleSheet()
        story: List = []

        title_style = ParagraphStyle(
            "CoffeeTitle",
            parent=styles["Heading1"],
            fontSize=24,
            textColor="#1a73e8",
            spaceAfter=18,
            alignment=TA_CENTER,
        )
        section_title = ParagraphStyle(
            "SectionTitle",
            parent=styles["Heading2"],
            fontSize=14,
            textColor="#0b5394",
            spaceAfter=12,
            spaceBefore=18,
        )
        body_style = ParagraphStyle(
            "Body",
            parent=styles["BodyText"],
            fontSize=10.5,
            leading=14,
            alignment=TA_LEFT,
            spaceAfter=6,
        )
        bullet_style = ParagraphStyle(
            "Bullets",
            parent=body_style,
            leftIndent=16,
            bulletIndent=6,
            bulletFontName="Helvetica-Bold",
        )

        story.append(_safe_paragraph("Coffee Chat Prep", title_style))
        story.append(_safe_paragraph("<i>Use this as context, not a script.</i>", body_style))
        story.append(Spacer(1, 0.1 * inch))

        # Contact name (always render if available)
        contact_name = f"{contact_data.get('firstName', '')} {contact_data.get('lastName', '')}".strip()
        if contact_name:
            story.append(_safe_paragraph(
                f"<b>Contact:</b> {contact_name}",
                styles["Heading2"],
            ))
        
        # Build summary bits - only include non-empty, non-placeholder fields
        # TASK 3: Ensure empty or partial contact fields are never rendered
        summary_bits = []
        title_text = contact_data.get("jobTitle", "").strip()
        if title_text and title_text.upper() != "N/A" and title_text:
            summary_bits.append(f"<b>Role:</b> {title_text}")
        
        company_text = contact_data.get("company", "").strip()
        if company_text and company_text.upper() != "N/A" and company_text:
            summary_bits.append(f"<b>Company:</b> {company_text}")
        
        # Only render Office if location is present and valid (not empty)
        location_display = (contact_data.get("location") or context.get("location") or "").strip()
        if location_display and location_display.upper() != "N/A" and location_display:
            summary_bits.append(f"<b>Office:</b> {location_display}")
        
        if hometown and hometown.strip() and hometown.upper() != "N/A":
            summary_bits.append(f"<b>Hometown:</b> {hometown.strip()}")
        
        # Only render summary line if we have at least one valid field
        if summary_bits:
            story.append(_safe_paragraph(" | ".join(summary_bits), body_style))

        story.append(Spacer(1, 0.18 * inch))

        # Only include similarity section if there's a quality summary (not empty)
        if similarity_summary and similarity_summary.strip():
            story.append(_safe_paragraph("Why This Conversation Makes Sense", section_title))
            story.append(_safe_paragraph(similarity_summary, body_style))
        else:
            logger.debug("SIMILARITY_SKIPPED: similarity summary empty or invalid")

        # Select questions that relate to the similarity summary
        # Only include if we have at least 2 quality questions
        trimmed_questions = select_relevant_questions(questions or [], similarity_summary or "", max_questions=3)
        if trimmed_questions and len(trimmed_questions) >= 2:
            story.append(_safe_paragraph("Good Openers", section_title))
            for question in trimmed_questions:
                story.append(Paragraph(f"<bullet>•</bullet> {question}", bullet_style))
        else:
            logger.debug("QUESTIONS_SKIPPED: fewer than 2 quality questions (found {})".format(len(trimmed_questions) if trimmed_questions else 0))

        # Only include industry summary if it exists and meets quality threshold
        if industry_summary and industry_summary.strip():
            story.append(_safe_paragraph("Industry Pulse", section_title))
            story.append(_safe_paragraph(industry_summary, body_style))
        else:
            logger.debug("NEWS_SKIPPED: industry summary empty or invalid")

        # Score and select top news items by relevance (only include if relevance score >= 0.8)
        scored_news = []
        for item in news_items:
            score = _score_news_relevance(item)
            # Only include news items with strong relevance (score >= 0.8)
            if score >= 0.8:
                summary = (item.get("summary", "") or "").strip()
                # Only include items with non-empty summaries (filtered/skipped items will have empty summaries)
                if summary:
                    scored_news.append((score, item))
        
        # Sort by score (descending) and select top 3
        scored_news.sort(key=lambda x: x[0], reverse=True)
        valid_news = [item for _, item in scored_news[:3]]
        
        # Only include news section if we have at least one high-relevance item with a valid summary
        if valid_news:
            story.append(_safe_paragraph("Recent Headlines", section_title))
            for item in valid_news:
                headline = (item.get("title", "") or "").strip()
                source = (item.get("source", "") or "").strip()
                published = item.get("published_at")
                tag = item.get("relevance_tag", "industry").capitalize()
                summary = (item.get("summary", "") or "").strip()[:240]
                
                # Only render if we have headline and summary
                if headline and summary:
                    meta_parts = []
                    if source:
                        meta_parts.append(source)
                    if published:
                        meta_parts.append(published.split("T")[0])
                    if tag:
                        meta_parts.append(tag)
                    
                    if meta_parts:
                        story.append(_safe_paragraph(f"<b>{headline}</b> — " + " | ".join(meta_parts), body_style))
                    else:
                        story.append(_safe_paragraph(f"<b>{headline}</b>", body_style))
                    story.append(_safe_paragraph(summary, body_style))
        else:
            logger.debug("NEWS_SKIPPED: no eligible news items passed relevance threshold (0.8)")

        doc.build(story)
        buffer.seek(0)
        return buffer

    except Exception as exc:
        print(f"PDF generation failed: {exc}")
        import traceback

        traceback.print_exc()
        fallback = BytesIO()
        fallback.write(b"%PDF-1.4\nCoffee Chat Prep - Error generating PDF")
        fallback.seek(0)
        return fallback


def generate_cover_letter_pdf(content: str) -> BytesIO:
    """Generate a PDF from cover letter text content"""
    try:
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=36, bottomMargin=36)
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

        # Split content into paragraphs and add them
        paragraphs = content.split('\n\n')
        for para in paragraphs:
            if para.strip():
                # Replace single newlines with <br/> for proper line breaks within paragraphs
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

