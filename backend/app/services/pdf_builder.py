"""
PDF builder service - generate coffee chat prep PDFs
"""
from io import BytesIO
from typing import Dict, List, Optional

from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


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

        story.append(_safe_paragraph(
            f"<b>Contact:</b> {contact_data.get('firstName', '')} {contact_data.get('lastName', '')}",
            styles["Heading2"],
        ))
        summary_bits = []
        title_text = contact_data.get("jobTitle", "N/A")
        if title_text:
            summary_bits.append(f"<b>Role:</b> {title_text}")
        company_text = contact_data.get("company", "N/A")
        if company_text:
            summary_bits.append(f"<b>Company:</b> {company_text}")
        location_display = contact_data.get("location") or context.get("location") or "N/A"
        summary_bits.append(f"<b>Office:</b> {location_display}")
        if hometown:
            summary_bits.append(f"<b>Hometown:</b> {hometown}")
        story.append(_safe_paragraph(" | ".join(summary_bits), body_style))

        story.append(Spacer(1, 0.18 * inch))

        story.append(_safe_paragraph("Why You're a Great Match", section_title))
        story.append(_safe_paragraph(similarity_summary or "Shared interests highlighted here.", body_style))

        trimmed_questions = (questions or [])[:3]
        if trimmed_questions:
            story.append(_safe_paragraph("Conversation Starters", section_title))
            for question in trimmed_questions:
                story.append(Paragraph(f"<bullet>•</bullet> {question}", bullet_style))

        if industry_summary:
            story.append(_safe_paragraph("Industry Pulse", section_title))
            story.append(_safe_paragraph(industry_summary, body_style))

        trimmed_news = news_items[:3]
        if trimmed_news:
            story.append(_safe_paragraph("Recent Headlines", section_title))
            for item in trimmed_news:
                headline = item.get("title", "")
                source = item.get("source", "Unknown source")
                published = item.get("published_at")
                tag = item.get("relevance_tag", "industry").capitalize()
                summary = (item.get("summary", "") or "")[:240]
                meta_parts = [source]
                if published:
                    meta_parts.append(published.split("T")[0])
                meta_parts.append(tag)
                story.append(_safe_paragraph(f"<b>{headline}</b> — " + " | ".join(meta_parts), body_style))
                story.append(_safe_paragraph(summary, body_style))

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

