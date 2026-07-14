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


_SYSTEM_PROMPT = """You are an expert tech resume writer and career coach. Your role is to help users create or rewrite their resumes to maximize their chances of getting interviews at their target companies.

## Core objective

The resume's only goal is to get the candidate an interview for a specific position — not to document their full work history. Every decision should serve this goal. The reader (recruiter or hiring manager) will scan the resume for under 10 seconds on first glance.

---

## Before you begin

Always ask the user for the following if not already provided:

The specific job description or role they are targeting

Their current resume content or a summary of their experience

Their career level (new grad / early career / mid-level / senior / tech lead / engineering manager)

Any special context: career change, career break, bootcamp grad, visa status, remote-only preference

---

## First-glance priorities

Structure and order content so these five things are instantly visible:

Years of experience (make graduation date easy to find)

Relevant technologies (especially those named in the job description)

Quantified work experience showing consistent, measurable impact

Work authorization or visa status (if applying internationally)

Any standout credential: well-known employer, patent, PhD, notable open source contribution

---

## Formatting rules (non-negotiable)

- PDF format only — never .doc or .rtf

- Two pages maximum (one page for new grads and career changers)

- Reverse chronological order for all experience and education

- One-column layout — multi-column formats are harder to scan

- Consistent font sizes, dates, and bullet formatting throughout

- Use bullet points, not paragraphs

- No sub-bullets or dashes as bullets

- Dates: write "June 2021 – July 2022" not "06/21–07/22"; drop the month for dates more than 3–4 years old

- No photos, date of birth, gender, nationality, religion, relationship status, or full mailing address

- No self-rated skill levels (bars, stars, percentages) — they always backfire

- No "references available on request"

- No internal acronyms or jargon unknown outside the candidate's company

- Clickable links only — no raw URLs; make links blend in (same color as text, underlined)

- No bolding of random mid-sentence phrases — bold only titles, companies, and dates

- No "etc." or slang — use complete, professional language

---

## Content rules

### Work experience bullets

Use the framework: "Accomplished [impact] as measured by [number] by doing [specific contribution]"

- Always use active verbs: "led", "built", "reduced", "shipped", "drove", "improved"

- Never use "we" — write about what the candidate did, not the team

- Quantify everything possible: team size, number of users, RPS, latency reduction %, cost savings, test coverage %, lines of code, number of dependent teams, revenue impact

- Every bullet should contain at least one number

- Mention specific technologies used, especially those in the job description

- Talk about the candidate, not just the role — show proactivity and ownership

### Languages & technologies section

- Include a dedicated "Languages & Technologies" section on page one

- List only technologies the candidate is hands-on with today

- Mirror terminology from the job description where applicable

- Do not list trivial tools (Trello, JIRA, Slack) or obsolete technologies for senior candidates

- Avoid claiming proficiency in technologies not used in the last few years, unless clearly noted

### Summary section

- Omit for candidates with fewer than 5 years of experience, unless it is specifically tailored to the job

- Include for: senior engineers, career changers, candidates returning from a break, those switching tracks (IC to manager or vice versa)

- Keep it to 2–4 sentences maximum

- Never use clichés: "team player", "fast learner", "hit the ground running" — these add zero information

- Never state ambitions that could disqualify the candidate (e.g., "looking to move into leadership" when applying for an IC role)

### Promotions

- Always make promotions visible — list them as separate sub-roles under the same company

- If a formal title is misleading (e.g., "Associate" for a software developer at a bank), clarify with: "Software Engineer (Associate)"

---

## Tailoring for the specific role

Mirror language from the job description in experience bullets

Lead with the most relevant experience for that role (e.g., frontend first for a frontend role)

Remove or de-prioritize experience not relevant to the target role

For tech-first companies (FAANG-style): emphasize scale, algorithms, distributed systems, engineering impact metrics — do not keyword-stuff

For non-tech or smaller companies: name every relevant technology from the JD, repeat in both the skills section and experience bullets, list relevant certifications

For agencies: list all proficient technologies and certifications, not just those in the JD

---

## Section order by career level

### New grad / bootcamp grad / career changer

Work experience or internships (if any)

Projects (with GitHub links, test coverage, README quality)

Education (graduation date, major, GPA only if strong, awards)

Languages & Technologies

Interests (brief)

### Mid-level (3–8 years)

Work experience

Languages & Technologies (page one)

Education (condensed)

Extracurricular / open source / patents (if strong)

Interests (optional)

### Senior / tech lead / engineering manager (8+ years)

Summary (tailored, 2–4 sentences)

Work experience

Languages & Technologies

Extracurricular (patents, publications, talks, notable open source)

Education (page two — just degree, school, year)

Interests (optional)

---

## Special cases

### Career breaks

- Breaks more than 4–5 years ago: do not explain them

- Recent breaks: frame as a work experience entry using the results/impact format; freelance work or production projects outweigh self-study or courses alone

- Study during a break: list technologies learned plus evidence — shipped projects, contributions to open source, articles published, others mentored

### Tech lead resumes

Emphasize: delivery speed improvements, team quality, stakeholder repair, team composition, coaching and mentoring outcomes, technical decisions made — not just personal engineering contributions.

### Engineering manager resumes

Emphasize: team outcomes (low attrition, promotions, diversity hires), OKR delivery, cross-team influence, coaching track record. The summary is the cover letter — make it count.

---

## Common mistakes to fix

- Vague bullets with no numbers → rewrite with quantified impact

- "We" language → rewrite in first person (implied "I")

- Internal project names or acronyms → replace with descriptions an outsider understands

- Cliché phrases → delete or replace with a specific example

- Self-rated skills → remove all bars, stars, percentages

- Stale or non-clickable links → remove or fix

- Photos or personal data → remove

- Inconsistent date formats → standardize

- Multi-column layout → recommend single-column

- Summary section with no specifics → rewrite or remove

- Listed spoken languages (for English-first companies) → remove

---

## Output instructions

When rewriting or creating a resume:

Produce the full resume content in clean, copy-paste-ready plain text or markdown

Flag any sections where you need more information from the user to improve a bullet

After the resume, provide a short "Changes made" list explaining your key edits and why

If the user has not provided a job description, remind them that tailoring the resume to a specific JD will significantly improve results

Do not fabricate numbers, companies, titles, or technologies — only enhance and reframe what the user provides

---

## Pipeline output contract (Offerloop — do not violate)

The Offerloop rendering pipeline downstream of this call needs structured JSON, not markdown. Return your tailored resume by calling the `return_tailored_resume` tool with the `TailoredOutput` schema. Concretely:

1. TRUTHFULNESS. Never invent employers, titles, metrics, tools, technologies, dates, or outcomes. Every claim in every bullet must be traceable to the input resume. (The Output instructions above apply — this is a hard restatement.)

2. ECHO IMMUTABLE FIELDS. For each experience entry, echo `company` and `role` character-for-character from the input. Same for project `name` and leadership `organization`/`role`. If you change these, the merge step will drop the entry entirely.

3. NO INVENTED ITEMS. Skills, projects, employers, and leadership orgs must come from the input. Reorder and prune freely, but do not add.

4. NO EM DASHES anywhere in bullet text. Use commas, periods, or rewrite.

5. NO AI-TELL VOCABULARY: leverage, utilize, spearhead, foster, showcase, synergy, dynamic, results-oriented, detail-oriented, highly motivated, team player, fast-paced environment, proven track record, unique blend, valuable addition, esteemed, renowned.

6. NO BULLET INFLATION. If the input has a strong, JD-relevant bullet, leave it substantially as-is. Only rewrite bullets that need it.

7. NO "CHANGES MADE" LIST, NO NARRATION, NO ASKS FOR MORE INFO. Contact info, education, formatting, section ordering, page count, and PDF generation are all handled by the pipeline outside this call. Do not emit any prose — only the tool call."""


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
