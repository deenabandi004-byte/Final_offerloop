"""Slim ReportLab PDF for the public meeting-prep lead magnet.

Mirrors the visual language of interview_prep_public/pdf_generator.py
(same accent blue, same fonts, same teaser banner + CTA panel) but
the content is the meeting-prep payload, not the interview-prep one.

The personalized sections that the paid product produces (Common Ground
match against the user's resume, Secret Weapon, fit analysis, prep plan)
are intentionally absent and pointed at the signup CTA panel.
"""
from __future__ import annotations

from io import BytesIO
from typing import List

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


BRAND_BLUE = "#3B82F6"
DEEP_BLUE = "#0B5394"
INK_PRIMARY = "#0F172A"
INK_SECONDARY = "#475569"
SURFACE_BG = "#F1F5F9"


def _p(text: str, style) -> Paragraph:
    return Paragraph((text or "").replace("\n", "<br/>"), style)


def _bullets(items: List[str], style) -> List[Paragraph]:
    out: List[Paragraph] = []
    for item in items or []:
        if item:
            out.append(Paragraph(f"·  {item}", style))
    return out


def _group_questions_by_category(questions: list) -> list[tuple[str, list[dict]]]:
    """Preserve insertion order while grouping. Returns
    [(category, [{question, hook}, ...]), ...]."""
    ordered: list[str] = []
    bucket: dict[str, list[dict]] = {}
    for q in questions or []:
        if not isinstance(q, dict):
            continue
        cat = (q.get("category") or "Other").strip() or "Other"
        text = (q.get("question") or "").strip()
        if not text:
            continue
        if cat not in bucket:
            bucket[cat] = []
            ordered.append(cat)
        bucket[cat].append({
            "question": text,
            "hook": (q.get("hook") or "").strip(),
        })
    return [(cat, bucket[cat]) for cat in ordered]


def generate_public_meeting_prep_pdf(
    *,
    prep_id: str,
    contact_data: dict,
    insights: dict,
    citations: list[str],
) -> BytesIO:
    """Build the public, anonymous meeting-prep PDF.

    Args:
        prep_id: anonymous prep id (used only in the footer for support)
        contact_data: coffee_chat_data dict from pdl_client.build_coffee_chat_data
        insights: dict from prep_generator.synthesize_insights
        citations: deduplicated list of source URLs from the research step
    """
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        topMargin=42,
        bottomMargin=42,
        leftMargin=64,
        rightMargin=64,
        title="Meeting Prep",
        author="Offerloop",
    )

    base = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=base["Heading1"], fontSize=24, leading=28,
        textColor=BRAND_BLUE, alignment=TA_CENTER, spaceAfter=8,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=base["BodyText"], fontSize=11.5, leading=15,
        textColor=INK_SECONDARY, alignment=TA_CENTER, spaceAfter=20,
    )
    section_style = ParagraphStyle(
        "Section", parent=base["Heading2"], fontSize=15, leading=19,
        textColor=DEEP_BLUE, spaceBefore=18, spaceAfter=8,
    )
    sub_style = ParagraphStyle(
        "Sub", parent=base["Heading3"], fontSize=12, leading=16,
        textColor=INK_PRIMARY, spaceBefore=10, spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "Body", parent=base["BodyText"], fontSize=10.5, leading=14.5,
        textColor=INK_PRIMARY, alignment=TA_LEFT, spaceAfter=4,
    )
    muted_style = ParagraphStyle(
        "Muted", parent=body_style, textColor=INK_SECONDARY, fontSize=9.5,
    )
    cta_title_style = ParagraphStyle(
        "CTATitle", parent=base["Heading2"], fontSize=15, leading=19,
        textColor=BRAND_BLUE, alignment=TA_LEFT, spaceAfter=6,
    )

    name = contact_data.get("fullName") or "Your contact"
    title = contact_data.get("jobTitle") or ""
    company = contact_data.get("company") or ""
    location = contact_data.get("location") or ""

    story: list = []

    # ── Header ──
    story.append(_p("Meeting Prep", title_style))
    sub_bits = [f"<b>{name}</b>"]
    if title and company:
        sub_bits.append(f"{title} at {company}")
    elif title:
        sub_bits.append(title)
    elif company:
        sub_bits.append(company)
    if location:
        sub_bits.append(location)
    story.append(_p("  ·  ".join(sub_bits), subtitle_style))

    # Teaser banner
    teaser_text = (
        "This is a sample, public meeting prep built from LinkedIn profile data "
        "and Perplexity research. Create a free Offerloop account to get a "
        "personalized version: Common Ground from your resume, a Secret Weapon "
        "hook unique to you, and a fit analysis against this contact."
    )
    teaser = Table(
        [[_p(teaser_text, muted_style)]],
        colWidths=[6.4 * inch],
    )
    teaser.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(SURFACE_BG)),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(teaser)
    story.append(Spacer(1, 12))

    if insights.get("degraded"):
        story.append(_p(
            "Heads up: some research sources were thin when we built this prep. "
            "The questions and tips below are still grounded in real LinkedIn "
            "profile data, but the personalized version of this report draws "
            "on additional context from your resume.",
            muted_style,
        ))
        story.append(Spacer(1, 6))

    # ── Career Arc ──
    career_arc = insights.get("career_arc") or []
    if career_arc:
        story.append(_p("Career Arc", section_style))
        story.extend(_bullets(career_arc, body_style))

    # ── Smart Questions (grouped by category) ──
    grouped = _group_questions_by_category(insights.get("smart_questions") or [])
    if grouped:
        story.append(_p("Smart Questions to Ask", section_style))
        for category, items in grouped:
            story.append(_p(category, sub_style))
            for q in items:
                line = f"<b>·</b> {q['question']}"
                if q.get("hook"):
                    line += f"<br/><font color='#94A3B8' size='8'>Grounded in: {q['hook']}</font>"
                story.append(_p(line, body_style))

    # ── Recent Company Signal ──
    company_signal = insights.get("company_signal") or []
    if company_signal:
        story.append(_p("Recent Company Signal", section_style))
        story.extend(_bullets(company_signal, body_style))

    # ── Conversation Tips ──
    tips = insights.get("conversation_tips") or []
    if tips:
        story.append(_p("Conversation Tips", section_style))
        story.extend(_bullets(tips, body_style))

    # ── Signup CTA ──
    story.append(Spacer(1, 18))
    cta_header_style = cta_title_style
    cta_lead_style = ParagraphStyle(
        "CTALead", parent=body_style, textColor=INK_PRIMARY,
    )
    cta_panel = Table(
        [
            [_p("Want a personalized version?", cta_header_style)],
            [_p(
                "This sample didn't analyze <b>you</b>. With a free Offerloop "
                "account, the same prep is rebuilt against your resume:",
                cta_lead_style,
            )],
            [_p("·  Common Ground match between your background and this contact's", body_style)],
            [_p("·  A Secret Weapon hook unique to your profile", body_style)],
            [_p("·  A fit analysis tying your skills and experience to their work", body_style)],
            [_p("·  Custom talking points and a conversation strategy for this meeting", body_style)],
            [_p(
                "<b>Create a free account at offerloop.ai</b>, no credit card, "
                "300 credits to start.",
                cta_lead_style,
            )],
        ],
        colWidths=[6.4 * inch],
    )
    cta_panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(BRAND_BLUE)),
        ("LEFTPADDING", (0, 0), (-1, -1), 18),
        ("RIGHTPADDING", (0, 0), (-1, -1), 18),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 16),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 16),
    ]))
    story.append(cta_panel)

    # ── Citations ──
    if citations:
        story.append(PageBreak())
        story.append(_p("Sources", section_style))
        for c in citations[:15]:
            story.append(_p(c, muted_style))

    # ── Footer ──
    story.append(Spacer(1, 12))
    story.append(_p(
        f"Generated by Offerloop · prep id {prep_id}",
        muted_style,
    ))

    doc.build(story)
    buf.seek(0)
    return buf
