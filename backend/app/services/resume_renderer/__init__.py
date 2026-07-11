"""Public surface for the canonical resume renderer."""
from .contract import (
    CanonicalResume,
    ContactInfo,
    EducationEntry,
    ExperienceEntry,
    LeadershipEntry,
    ProjectEntry,
    SkillsGroup,
)
from .normalizer import from_resume_parsed
from .overflow import RenderResult, render_one_page
from .renderer import ResumeRenderError, render_and_count, render_canonical, render_html

__all__ = [
    "CanonicalResume",
    "ContactInfo",
    "EducationEntry",
    "ExperienceEntry",
    "LeadershipEntry",
    "ProjectEntry",
    "SkillsGroup",
    "RenderResult",
    "ResumeRenderError",
    "from_resume_parsed",
    "render_and_count",
    "render_canonical",
    "render_html",
    "render_one_page",
]
