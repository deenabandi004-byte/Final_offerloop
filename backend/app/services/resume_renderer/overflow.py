"""One-page-fit overflow rules."""
from __future__ import annotations

import logging
from copy import deepcopy
from dataclasses import dataclass, field

from .contract import CanonicalResume
from .renderer import render_and_count

logger = logging.getLogger(__name__)


MAX_ATTEMPTS = 10
MIN_BODY_SIZE_PT = 9.5
MIN_MARGIN_IN = 0.4


@dataclass
class RenderResult:
    pdf_bytes: bytes
    page_count: int
    reductions_applied: list[str] = field(default_factory=list)
    body_size_pt: float = 10.5
    page_margin_in: float = 0.5


def _trim_interests(resume: CanonicalResume) -> tuple[CanonicalResume, bool]:
    if not resume.interests:
        return resume, False
    new = deepcopy(resume)
    new.interests = None
    return new, True


def _trim_coursework(resume: CanonicalResume) -> tuple[CanonicalResume, bool]:
    changed = False
    new = deepcopy(resume)
    for edu in new.education:
        if len(edu.coursework) > 3:
            edu.coursework = edu.coursework[:3]
            changed = True
    return new, changed


def _trim_leadership_bullets(resume: CanonicalResume) -> tuple[CanonicalResume, bool]:
    if not resume.leadership:
        return resume, False
    changed = False
    new = deepcopy(resume)
    for entry in new.leadership:
        if len(entry.bullets) > 1:
            entry.bullets = entry.bullets[:1]
            changed = True
    return new, changed


def _drop_leadership(resume: CanonicalResume) -> tuple[CanonicalResume, bool]:
    if not resume.leadership:
        return resume, False
    new = deepcopy(resume)
    new.leadership = []
    return new, True


def _trim_oldest_bullets(resume: CanonicalResume) -> tuple[CanonicalResume, bool]:
    changed = False
    new = deepcopy(resume)
    for entry in new.experience[2:]:
        if len(entry.bullets) > 2:
            entry.bullets = entry.bullets[:2]
            changed = True
    for entry in new.projects[2:]:
        if len(entry.bullets) > 2:
            entry.bullets = entry.bullets[:2]
            changed = True
    return new, changed


def _cap_all_experience_bullets_3(resume: CanonicalResume) -> tuple[CanonicalResume, bool]:
    changed = False
    new = deepcopy(resume)
    for entry in new.experience:
        if len(entry.bullets) > 3:
            entry.bullets = entry.bullets[:3]
            changed = True
    return new, changed


def _trim_projects_to_top_3(resume: CanonicalResume) -> tuple[CanonicalResume, bool]:
    if len(resume.projects) <= 3:
        return resume, False
    new = deepcopy(resume)
    new.projects = new.projects[:3]
    return new, True


def _cap_all_project_bullets_2(resume: CanonicalResume) -> tuple[CanonicalResume, bool]:
    changed = False
    new = deepcopy(resume)
    for entry in new.projects:
        if len(entry.bullets) > 2:
            entry.bullets = entry.bullets[:2]
            changed = True
    return new, changed


def _trim_experience_to_top_3(resume: CanonicalResume) -> tuple[CanonicalResume, bool]:
    if len(resume.experience) <= 3:
        return resume, False
    new = deepcopy(resume)
    new.experience = new.experience[:3]
    return new, True


CONTENT_REDUCTIONS = [
    ("trim_interests", _trim_interests),
    ("trim_coursework_to_3", _trim_coursework),
    ("trim_leadership_bullets_to_1", _trim_leadership_bullets),
    ("drop_leadership", _drop_leadership),
    ("trim_oldest_bullets_to_2", _trim_oldest_bullets),
    ("cap_all_experience_bullets_3", _cap_all_experience_bullets_3),
    ("trim_projects_to_top_3", _trim_projects_to_top_3),
    ("cap_all_project_bullets_2", _cap_all_project_bullets_2),
    ("trim_experience_to_top_3", _trim_experience_to_top_3),
]

FONT_STEPS_PT = [10.5, 10.0, 9.5]
MARGIN_STEPS_IN = [0.5, 0.45, 0.4]


def render_one_page(resume: CanonicalResume) -> RenderResult:
    current = resume
    applied: list[str] = []

    body_size = FONT_STEPS_PT[0]
    margin = MARGIN_STEPS_IN[0]

    pdf, pages = render_and_count(current, body_size_pt=body_size, page_margin_in=margin)
    if pages <= 1:
        return RenderResult(pdf, pages, applied, body_size, margin)

    for name, fn in CONTENT_REDUCTIONS:
        current, changed = fn(current)
        if not changed:
            continue
        applied.append(name)
        pdf, pages = render_and_count(current, body_size_pt=body_size, page_margin_in=margin)
        if pages <= 1:
            return RenderResult(pdf, pages, applied, body_size, margin)

    for size in FONT_STEPS_PT[1:]:
        body_size = size
        applied.append(f"body_size_{size}pt")
        pdf, pages = render_and_count(current, body_size_pt=body_size, page_margin_in=margin)
        if pages <= 1:
            return RenderResult(pdf, pages, applied, body_size, margin)

    for m in MARGIN_STEPS_IN[1:]:
        margin = m
        applied.append(f"page_margin_{m}in")
        pdf, pages = render_and_count(current, body_size_pt=body_size, page_margin_in=margin)
        if pages <= 1:
            return RenderResult(pdf, pages, applied, body_size, margin)

    applied.append("still_overflowing")
    logger.warning(
        "resume_renderer: exhausted reductions, still %d pages after %s",
        pages,
        applied,
    )
    return RenderResult(pdf, pages, applied, body_size, margin)
