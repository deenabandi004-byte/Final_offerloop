"""Render a `CanonicalResume` into a single-column, ATS-safe PDF via WeasyPrint."""
from __future__ import annotations

import logging
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

from .contract import CanonicalResume

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"


class ResumeRenderError(RuntimeError):
    """Raised when template rendering or PDF generation fails."""


_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(enabled_extensions=("html", "j2")),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _load_css() -> str:
    return (_TEMPLATES_DIR / "canonical.css").read_text(encoding="utf-8")


def render_html(
    resume: CanonicalResume,
    *,
    body_size_pt: float = 10.5,
    page_margin_in: float = 0.5,
) -> str:
    template = _env.get_template("canonical.html.j2")
    return template.render(
        contact=resume.contact,
        education=resume.education,
        experience=resume.experience,
        projects=resume.projects,
        leadership=resume.leadership,
        skills=resume.skills,
        interests=resume.interests,
        css=_load_css(),
        body_size_pt=body_size_pt,
        page_margin_in=page_margin_in,
    )


def render_and_count(
    resume: CanonicalResume,
    *,
    body_size_pt: float = 10.5,
    page_margin_in: float = 0.5,
) -> tuple[bytes, int]:
    try:
        html_str = render_html(
            resume,
            body_size_pt=body_size_pt,
            page_margin_in=page_margin_in,
        )
    except Exception as exc:
        raise ResumeRenderError(f"Jinja render failed: {exc}") from exc

    try:
        document = HTML(string=html_str).render()
        page_count = len(document.pages)
        pdf_bytes = document.write_pdf()
    except Exception as exc:
        raise ResumeRenderError(f"WeasyPrint failed: {exc}") from exc

    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise ResumeRenderError("WeasyPrint returned invalid PDF bytes")

    return pdf_bytes, page_count


def render_canonical(
    resume: CanonicalResume,
    *,
    body_size_pt: float = 10.5,
    page_margin_in: float = 0.5,
) -> bytes:
    pdf_bytes, _ = render_and_count(
        resume,
        body_size_pt=body_size_pt,
        page_margin_in=page_margin_in,
    )
    return pdf_bytes
