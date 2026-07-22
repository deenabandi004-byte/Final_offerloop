"""Build a Harvard-format CanonicalResume for onboarding users without one.

Two producers:
- LinkedIn path: routes call `from_resume_parsed()` directly (no LLM).
- Prompt path: `generate_canonical_resume()` turns a freeform description
  (plus optionally the previous draft) into a CanonicalResume via a forced
  Claude tool call, mirroring resume_tailor.py.

Two serializers used at finalize time:
- `canonical_to_parsed_info()` -> the users/{uid}.resumeParsed v2 shape.
- `canonical_to_text()` -> plain text for resumeText.
"""
from __future__ import annotations

import json
import logging

from app.services.openai_client import get_anthropic_client
from app.services.resume_renderer import CanonicalResume

logger = logging.getLogger(__name__)


class ResumeBuilderError(Exception):
    pass


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def canonical_to_parsed_info(resume: CanonicalResume) -> dict:
    """Serialize to the resumeParsed v2 shape `from_resume_parsed()` reads.

    Education in resumeParsed is a SINGLE object (primary school); the
    canonical model is a list — we take the first entry. The combined degree
    string stays in `degree` (major left empty) so the round trip preserves
    the display string.
    """
    edu = resume.education[0] if resume.education else None
    education = {
        "degree": edu.degree if edu else None,
        "major": None,
        "university": edu.school if edu else None,
        "location": edu.location if edu else None,
        "graduation": edu.graduation if edu else None,
        "gpa": edu.gpa if edu else None,
        "honors": list(edu.honors) if edu else [],
        "coursework": list(edu.coursework) if edu else [],
    }
    return {
        "name": resume.contact.name,
        "contact": {
            "email": resume.contact.email or None,
            "phone": resume.contact.phone,
            "location": resume.contact.location,
            "linkedin": resume.contact.linkedin,
            "github": resume.contact.github,
            "website": resume.contact.website,
        },
        "objective": None,
        "education": education,
        "experience": [
            {
                "title": e.role,
                "company": e.company,
                "location": e.location,
                "dates": f"{e.start} – {e.end}".strip(" –"),
                "bullets": list(e.bullets),
            }
            for e in resume.experience
        ],
        "projects": [
            {
                "name": p.name,
                "tech": list(p.tech),
                "date": p.date,
                "link": p.link,
                "bullets": list(p.bullets),
            }
            for p in resume.projects
        ],
        "leadership": [
            {
                "organization": l.organization,
                "role": l.role,
                "location": l.location,
                "dates": f"{l.start or ''} – {l.end or ''}".strip(" –"),
                "bullets": list(l.bullets),
            }
            for l in resume.leadership
        ],
        # List-of-groups form: the one skills shape from_resume_parsed()
        # round-trips with arbitrary category names.
        "skills": [{"category": g.category, "items": list(g.items)} for g in resume.skills],
        "interests": resume.interests,
    }


def canonical_to_text(resume: CanonicalResume) -> str:
    lines: list[str] = [resume.contact.name]
    contact_bits = [
        b
        for b in [
            resume.contact.email,
            resume.contact.phone,
            resume.contact.location,
            resume.contact.linkedin,
        ]
        if b
    ]
    if contact_bits:
        lines.append(" | ".join(contact_bits))
    if resume.education:
        lines.append("\nEDUCATION")
        for e in resume.education:
            lines.append(
                f"{e.school} — {e.degree} ({e.graduation})" + (f", GPA {e.gpa}" if e.gpa else "")
            )
            for h in e.honors:
                lines.append(f"  {h}")
    if resume.experience:
        lines.append("\nEXPERIENCE")
        for x in resume.experience:
            lines.append(f"{x.role}, {x.company} ({x.start} – {x.end})")
            lines.extend(f"  • {b}" for b in x.bullets)
    if resume.projects:
        lines.append("\nPROJECTS")
        for p in resume.projects:
            lines.append(p.name + (f" ({', '.join(p.tech)})" if p.tech else ""))
            lines.extend(f"  • {b}" for b in p.bullets)
    if resume.leadership:
        lines.append("\nLEADERSHIP")
        for l in resume.leadership:
            lines.append(f"{l.role}, {l.organization}")
            lines.extend(f"  • {b}" for b in l.bullets)
    if resume.skills:
        lines.append("\nSKILLS")
        for g in resume.skills:
            lines.append(f"{g.category}: {', '.join(g.items)}")
    if resume.interests:
        lines.append(f"\nInterests: {resume.interests}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt-path generation (Claude forced tool call, per resume_tailor.py)
# ---------------------------------------------------------------------------

_TOOL_NAME = "return_resume"

_SYSTEM_PROMPT = """You build one-page resumes in the Harvard College resume format for college students.

Rules — follow every one:
1. NEVER invent employers, schools, job titles, dates, GPAs, or metrics the user did not state. If a field is unknown, leave it empty. Do not guess a graduation year.
2. Rewrite what the user DID say into accomplishment bullets: strong action verb + what they did + result or scale when stated.
3. Section order: education, experience, projects, leadership, skills. Include a section only if the user gave content for it.
4. Keep it one page: at most 4 experience entries, 3 bullets each; at most 3 projects.
5. Plain professional wording. No emoji, no em dashes, no first person.
6. If a previous resume draft is provided, apply the user's new instructions to it — change only what the instructions require and preserve everything else exactly."""


def _tool_input_schema() -> dict:
    schema = CanonicalResume.model_json_schema()
    schema.setdefault("additionalProperties", False)
    return schema


def generate_canonical_resume(prompt: str, previous: dict | None) -> CanonicalResume:
    client = get_anthropic_client()
    if client is None:
        raise ResumeBuilderError("Anthropic client is not configured (missing CLAUDE_API_KEY)")

    parts = []
    if previous:
        parts.append("PREVIOUS RESUME DRAFT (JSON):\n" + json.dumps(previous, indent=2))
        parts.append("USER'S NEW INSTRUCTIONS:\n" + prompt.strip())
    else:
        parts.append("THE USER'S DESCRIPTION OF WHAT THEY'VE DONE:\n" + prompt.strip())

    try:
        response = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=8000,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": "\n\n".join(parts)}],
            tools=[
                {
                    "name": _TOOL_NAME,
                    "description": (
                        "Return the resume as a structured object. "
                        "Leave unknown fields empty; never fabricate."
                    ),
                    "input_schema": _tool_input_schema(),
                }
            ],
            tool_choice={"type": "tool", "name": _TOOL_NAME},
        )
    except Exception as exc:
        logger.exception("resume_builder: Claude call failed")
        raise ResumeBuilderError(f"Resume generation failed: {exc}") from exc

    tool_use = next((b for b in response.content if getattr(b, "type", None) == "tool_use"), None)
    if tool_use is None:
        raise ResumeBuilderError("Model did not return a structured resume")
    try:
        return CanonicalResume.model_validate(tool_use.input)
    except Exception as exc:
        logger.exception("resume_builder: schema validation failed")
        raise ResumeBuilderError(f"Generated resume failed validation: {exc}") from exc
