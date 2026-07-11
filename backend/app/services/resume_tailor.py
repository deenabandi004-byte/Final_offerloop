"""Tailor a `CanonicalResume` to a specific job description via Claude Opus 4.7.

This service is Offerloop's "Claude wrapper" for resume tailoring. Given the
user's parsed resume (in canonical shape) and a job posting, it asks Claude
to do a holistic tailoring pass:
- Rewrite experience/project bullets in XYZ pattern using JD keywords where truthful
- Reorder skill categories so JD-relevant ones come first
- Drop or reorder projects for JD relevance
- Never invent employers, titles, metrics, tools, or outcomes

The user's contact info and education are echoed unchanged from the input.

Structured output uses forced tool-use: we define a `return_tailored_resume`
tool with `input_schema` matching `TailoredOutput`, and `tool_choice` forces
Claude to call it. Works on all recent Anthropic SDK versions (including 0.52.0).

Public surface:
    tailor_resume(resume, jd) -> CanonicalResume
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from pydantic import BaseModel, Field

from app.services.openai_client import get_anthropic_client
from app.services.resume_renderer import (
    CanonicalResume,
    ExperienceEntry,
    LeadershipEntry,
    ProjectEntry,
    SkillsGroup,
)

logger = logging.getLogger(__name__)


class ResumeTailorError(RuntimeError):
    """Raised when Anthropic call fails or output cannot be parsed."""


@dataclass(frozen=True)
class JobPosting:
    """Resolved job description ready for the tailor call."""

    title: str
    company: str
    description: str


# ---------------------------------------------------------------------------
# Output schema — what we ask Claude to return.
#
# We only allow Claude to rewrite bullets and reorder lists. Company / role /
# dates / project names are echoed back so the model can't quietly fabricate.
# We then merge the tailored bullets back into the original resume so that
# immutable facts (dates, locations, contact info, education) are preserved
# verbatim from the input.
# ---------------------------------------------------------------------------


class TailoredExperience(BaseModel):
    company: str = Field(description="Company name — echo exactly from input")
    role: str = Field(description="Role/title — echo exactly from input")
    bullets: list[str] = Field(
        description=(
            "Rewritten bullets in XYZ pattern. 1-2 lines each, 3-5 per role. "
            "Never invent metrics, tools, or outcomes not present in the input."
        )
    )


class TailoredProject(BaseModel):
    name: str = Field(description="Project name — echo exactly from input")
    keep: bool = Field(
        description="True to include this project in the tailored resume, false to drop it."
    )
    bullets: list[str] = Field(
        default_factory=list,
        description="Rewritten bullets. Empty list if keep=false.",
    )


class TailoredLeadership(BaseModel):
    organization: str = Field(description="Organization — echo exactly from input")
    role: str = Field(description="Role — echo exactly from input")
    keep: bool = Field(description="True to include, false to drop.")
    bullets: list[str] = Field(default_factory=list)


class TailoredSkillsGroup(BaseModel):
    category: str = Field(
        description="Category name from the input (Languages, Frameworks & Tools, etc.)"
    )
    items: list[str] = Field(
        description="Skills in relevance-to-JD order. Only use skills present in the input."
    )


class TailoredOutput(BaseModel):
    experience: list[TailoredExperience]
    projects: list[TailoredProject]
    leadership: list[TailoredLeadership]
    skills: list[TailoredSkillsGroup] = Field(
        description="Skill groups in relevance-to-JD order (most relevant first)."
    )


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------


_SYSTEM_PROMPT = """You are a resume tailoring specialist for college students applying to competitive consulting (MBB, Big 4), investment banking (Goldman, JPMorgan, Morgan Stanley), and tech (Google, Meta, Amazon) roles. You produce the same quality output a thoughtful senior recruiter would produce reviewing a resume for one specific posting.

You tailor holistically — one clean pass, not per-bullet approval.

## HARD RULES (non-negotiable)

1. TRUTHFULNESS. Never invent employers, titles, metrics, tools, technologies, dates, or outcomes. If a bullet doesn't mention a metric, don't add one. If a candidate didn't use React, don't say they did. Every claim in every bullet must be traceable to the input resume.

2. ECHO IMMUTABLE FIELDS. For each experience entry, echo `company` and `role` character-for-character from the input. Same for project `name` and leadership `organization`/`role`. If you change these, the pipeline breaks.

3. BULLETS IN XYZ PATTERN. Every rewritten bullet follows Action + Context + Metric + Result where possible. Lead with a strong verb (Built, Led, Shipped, Analyzed, Designed, Reduced). 1-2 lines each. 3-5 bullets per major experience.

4. MIRROR JD KEYWORDS WHERE TRUTHFUL. If the JD asks for "Python" and the candidate has Python, use the word "Python" in the tailored bullets (don't say "scripting"). If the JD asks for "Excel modeling" and the candidate mentions financial modeling, use the phrase "Excel-based financial models". Never mirror keywords the candidate can't back up.

5. DROP OR REORDER PROJECTS. For each project, set `keep=false` if it has zero relevance to the JD (e.g. a game project on an investment banking application). Reorder kept projects so the most JD-relevant comes first.

6. REORDER SKILLS. Return skill groups in relevance order. If the JD is a data engineering role, put Databases and Cloud & DevOps ahead of Frameworks & Tools. Within each group, put JD-relevant items first. Only use items present in the input — never add new skills.

7. LEADERSHIP. For consulting/IB applications, keep leadership entries (they signal leadership). For pure tech applications, drop or shorten leadership entries with no technical relevance.

8. NO EM DASHES. Not in bullets, not anywhere. Non-negotiable.

9. NO AI-TELL VOCABULARY. Never use: leverage, utilize, spearhead, foster, showcase, synergy, dynamic, results-oriented, detail-oriented, highly motivated, team player, fast-paced environment, proven track record, unique blend, valuable addition, esteemed, renowned.

10. NO BULLET INFLATION. If the input has a strong, JD-relevant bullet, leave it substantially as-is. Only rewrite bullets that need it.

## OUTPUT

Return a JSON object matching the TailoredOutput schema. Do not include contact info or education — those are preserved unchanged from the input."""


def _build_user_message(resume: CanonicalResume, jd: JobPosting) -> str:
    lines: list[str] = []

    lines.append("# TARGET JOB")
    lines.append("")
    lines.append(f"Title: {jd.title or 'Not specified'}")
    lines.append(f"Company: {jd.company or 'Not specified'}")
    lines.append("")
    lines.append("Job description:")
    lines.append(jd.description.strip())
    lines.append("")
    lines.append("---")
    lines.append("")

    lines.append("# CANDIDATE RESUME (canonical shape)")
    lines.append("")

    if resume.education:
        lines.append("## Education (for context — do not modify)")
        for e in resume.education:
            parts = [e.school, e.degree]
            if e.gpa:
                parts.append(f"GPA {e.gpa}")
            parts.append(e.graduation)
            lines.append(" | ".join(str(p) for p in parts if p))
        lines.append("")

    if resume.experience:
        lines.append("## Experience")
        for x in resume.experience:
            lines.append(f"- **{x.company}** — {x.role} ({x.start} to {x.end})")
            for b in x.bullets:
                lines.append(f"  * {b}")
        lines.append("")

    if resume.projects:
        lines.append("## Projects")
        for p in resume.projects:
            tech = f" [{', '.join(p.tech)}]" if p.tech else ""
            lines.append(f"- **{p.name}**{tech}")
            for b in p.bullets:
                lines.append(f"  * {b}")
        lines.append("")

    if resume.leadership:
        lines.append("## Leadership")
        for l in resume.leadership:
            lines.append(f"- **{l.organization}** — {l.role}")
            for b in l.bullets:
                lines.append(f"  * {b}")
        lines.append("")

    if resume.skills:
        lines.append("## Skills (current order)")
        for s in resume.skills:
            lines.append(f"- {s.category}: {', '.join(s.items)}")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(
        "Now tailor this resume for the target job. Return only the JSON object "
        "matching TailoredOutput. Preserve every `company`, `role`, `name`, and "
        "`organization` string exactly. Never invent facts."
    )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Merge — take Claude's TailoredOutput and merge back into the original resume
# so contact info, education, dates, and locations are preserved verbatim.
# ---------------------------------------------------------------------------


def _match_experience(
    original: list[ExperienceEntry], tailored: list[TailoredExperience]
) -> list[ExperienceEntry]:
    by_key = {(e.company.strip().lower(), e.role.strip().lower()): e for e in original}
    merged: list[ExperienceEntry] = []

    for t in tailored:
        key = (t.company.strip().lower(), t.role.strip().lower())
        orig = by_key.get(key)
        if orig is None:
            logger.warning(
                "resume_tailor: dropped fabricated experience %r/%r",
                t.company,
                t.role,
            )
            continue
        merged.append(
            ExperienceEntry(
                company=orig.company,
                role=orig.role,
                location=orig.location,
                start=orig.start,
                end=orig.end,
                bullets=t.bullets or orig.bullets,
            )
        )

    if not merged:
        return list(original)

    return merged


def _match_projects(
    original: list[ProjectEntry], tailored: list[TailoredProject]
) -> list[ProjectEntry]:
    by_name = {p.name.strip().lower(): p for p in original}
    merged: list[ProjectEntry] = []
    for t in tailored:
        if not t.keep:
            continue
        orig = by_name.get(t.name.strip().lower())
        if orig is None:
            logger.warning("resume_tailor: dropped fabricated project %r", t.name)
            continue
        merged.append(
            ProjectEntry(
                name=orig.name,
                tech=orig.tech,
                date=orig.date,
                link=orig.link,
                bullets=t.bullets or orig.bullets,
            )
        )
    return merged


def _match_leadership(
    original: list[LeadershipEntry], tailored: list[TailoredLeadership]
) -> list[LeadershipEntry]:
    by_key = {
        (l.organization.strip().lower(), l.role.strip().lower()): l for l in original
    }
    merged: list[LeadershipEntry] = []
    for t in tailored:
        if not t.keep:
            continue
        key = (t.organization.strip().lower(), t.role.strip().lower())
        orig = by_key.get(key)
        if orig is None:
            logger.warning(
                "resume_tailor: dropped fabricated leadership %r/%r",
                t.organization,
                t.role,
            )
            continue
        merged.append(
            LeadershipEntry(
                organization=orig.organization,
                role=orig.role,
                location=orig.location,
                start=orig.start,
                end=orig.end,
                bullets=t.bullets or orig.bullets,
            )
        )
    return merged


def _match_skills(
    original: list[SkillsGroup], tailored: list[TailoredSkillsGroup]
) -> list[SkillsGroup]:
    orig_by_category = {s.category.strip().lower(): s for s in original}
    orig_items_by_cat = {
        s.category.strip().lower(): {i.strip().lower(): i for i in s.items}
        for s in original
    }
    merged: list[SkillsGroup] = []
    seen_categories: set = set()

    for t in tailored:
        cat_key = t.category.strip().lower()
        orig_group = orig_by_category.get(cat_key)
        if orig_group is None:
            logger.warning("resume_tailor: dropped fabricated skills category %r", t.category)
            continue
        allowed_items = orig_items_by_cat[cat_key]
        kept: list[str] = []
        for item in t.items:
            key = item.strip().lower()
            if key in allowed_items:
                kept.append(allowed_items[key])
        for orig_key, orig_item in allowed_items.items():
            if orig_item not in kept:
                kept.append(orig_item)
        merged.append(SkillsGroup(category=orig_group.category, items=kept))
        seen_categories.add(cat_key)

    for orig_group in original:
        if orig_group.category.strip().lower() not in seen_categories:
            merged.append(orig_group)

    return merged


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------


_TOOL_NAME = "return_tailored_resume"


def _tool_input_schema() -> dict:
    schema = TailoredOutput.model_json_schema()
    schema.setdefault("additionalProperties", False)
    return schema


def tailor_resume(
    resume: CanonicalResume,
    jd: JobPosting,
    *,
    model: str = "claude-opus-4-7",
) -> CanonicalResume:
    """Tailor a resume to a job posting via Claude.

    Contact info, education, and interests are echoed unchanged from the input.
    Only experience, projects, leadership, and skills are tailored.
    """
    client = get_anthropic_client()
    if client is None:
        raise ResumeTailorError(
            "Anthropic client is not configured (missing CLAUDE_API_KEY)"
        )

    if not jd.description or len(jd.description.strip()) < 100:
        raise ResumeTailorError(
            "Job description is too short — provide at least 100 characters "
            "or a URL we can read."
        )

    user_message = _build_user_message(resume, jd)

    try:
        response = client.messages.create(
            model=model,
            max_tokens=8000,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
            tools=[
                {
                    "name": _TOOL_NAME,
                    "description": (
                        "Return the tailored resume as a structured object. "
                        "Preserve every company, role, project name, and organization "
                        "exactly from the input."
                    ),
                    "input_schema": _tool_input_schema(),
                }
            ],
            tool_choice={"type": "tool", "name": _TOOL_NAME},
        )
    except Exception as exc:
        logger.exception("resume_tailor: Anthropic call failed")
        raise ResumeTailorError(f"Claude tailor call failed: {exc}") from exc

    tool_use = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"),
        None,
    )
    if tool_use is None:
        raise ResumeTailorError("Claude did not return a tool_use block")

    try:
        tailored = TailoredOutput.model_validate(tool_use.input)
    except Exception as exc:
        logger.exception("resume_tailor: Pydantic validation failed")
        raise ResumeTailorError(f"Claude output failed schema validation: {exc}") from exc

    merged_experience = _match_experience(resume.experience, tailored.experience)
    merged_projects = _match_projects(resume.projects, tailored.projects)
    merged_leadership = _match_leadership(resume.leadership, tailored.leadership)
    merged_skills = _match_skills(resume.skills, tailored.skills)

    return CanonicalResume(
        contact=resume.contact,
        education=resume.education,
        experience=merged_experience,
        projects=merged_projects,
        leadership=merged_leadership,
        skills=merged_skills,
        interests=resume.interests,
    )
