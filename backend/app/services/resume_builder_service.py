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
# Best-effort research: give the model real context about each employer so it
# can write credible bullets from thin input ("I worked at Kiva" -> what Kiva
# does, what that role typically involves). Failures return "" and generation
# proceeds without context.
# ---------------------------------------------------------------------------

def research_role_context(description: str) -> str:
    """One cheap Perplexity lookup over the user's whole description."""
    try:
        from app.services.perplexity_client import quick_search
        query = (
            "For each employer, organization, or program mentioned in this "
            "career description, give 1-2 sentences on what the organization "
            "does and what the stated role typically involves day to day. "
            "Be factual and brief.\n\nDescription:\n" + description[:1500]
        )
        result = quick_search(query)
        content = (result or {}).get("content", "")
        return content[:2500] if content else ""
    except Exception:
        logger.warning("resume_builder: role research failed", exc_info=True)
        return ""


# ---------------------------------------------------------------------------
# Prompt-path generation (Claude forced tool call, per resume_tailor.py)
# ---------------------------------------------------------------------------

_TOOL_NAME = "return_resume"

# The rubric below encodes Harvard's published resume guidance (Harvard
# College OCS / Harvard Business School career development): accomplishment
# bullets over duty lists, action-verb openers, quantification, one page,
# no pronouns, consistent tense.
_SYSTEM_PROMPT = """You build one-page resumes in the Harvard resume format. You follow the resume-writing guidance published by Harvard's career offices (Harvard College OCS and Harvard Business School career development), summarized in the rubric below.

FACTUAL DISCIPLINE — the hard boundary:
1. NEVER invent employers, schools, job titles, degrees, dates, GPAs, awards, or specific numbers the user did not state. If a field is unknown, leave it empty. Do not guess a graduation year.
2. You MAY flesh out thin descriptions: when the user names a real role but gives little detail, write 2-3 credible bullets describing what that role typically involves, grounded in the ROLE CONTEXT research when provided. Keep such bullets qualitative. Example: "sales associate at Men's Wearhouse" can become bullets about advising customers on fit and style, meeting sales goals, and coordinating fittings, but never "increased sales 40%" unless the user said so.
3. Quantify ONLY with numbers the user provided. Never fabricate metrics, team sizes, or dollar amounts.

HARVARD BULLET RUBRIC — every bullet must pass all of these:
4. Start with a strong action verb: led, built, analyzed, launched, negotiated, designed, coordinated, advised, streamlined, researched, presented, managed, organized, taught, drove. Vary the verbs; never start two consecutive bullets with the same verb.
5. Accomplishment over duty: describe what was achieved or delivered, not job-description boilerplate. Banned phrases: "responsible for", "duties included", "helped with", "worked on", "assisted with", "tasked with".
6. Shape: action verb + what + how or for whom + result or scale when the user gave one.
7. No personal pronouns anywhere (no I, my, we, our). No periods needed at bullet ends, but be consistent.
8. Past tense for past roles, present tense for current roles.
9. Each bullet is one line of substance: specific enough to be believable, tight enough to scan. 8 to 18 words.

STRUCTURE:
10. Section order: education, experience, projects, leadership, skills. Include a section only if there is content for it.
11. One page: at most 4 experience entries with 3 bullets each, at most 3 projects, at most 3 leadership entries.
12. Education lists school, degree and major, graduation date, GPA only if given, honors only if given.
13. Skills section groups concrete skills (software, languages, technical methods). Interests are one short line, only if the user gave them.

STYLE:
14. Plain professional wording. No emoji. NEVER use an em dash or en dash in any text; use a comma, colon, or period instead.
15. No first person, no objective statement, no references line.
16. If a previous resume draft is provided, apply the user's new instructions to it: change only what the instructions require and preserve everything else exactly."""


def _tool_input_schema() -> dict:
    schema = CanonicalResume.model_json_schema()
    schema.setdefault("additionalProperties", False)
    return schema


_DASH_EXEMPT_KEYS = {"start", "end", "graduation", "date", "dates"}


def _strip_dashes(value, key: str = ""):
    """Recursively replace em/en dashes in generated text with plain
    punctuation. Date fields are exempt (serializers join ranges with a dash
    downstream; single date strings never need one)."""
    if isinstance(value, str):
        if key in _DASH_EXEMPT_KEYS:
            return value
        cleaned = value.replace(" — ", ", ").replace("—", ", ")
        cleaned = cleaned.replace(" – ", ", ").replace("–", "-")
        return cleaned
    if isinstance(value, list):
        return [_strip_dashes(v, key) for v in value]
    if isinstance(value, dict):
        return {k: _strip_dashes(v, k) for k, v in value.items()}
    return value


def _generate_via_openai(parts: list[str]) -> CanonicalResume:
    """Fallback generator on the app's primary provider (OpenAI) for
    environments without a CLAUDE_API_KEY. Same system prompt, same schema,
    forced function call instead of a forced Claude tool call."""
    from app.services.openai_client import get_openai_client

    client = get_openai_client()
    if client is None:
        raise ResumeBuilderError("No AI provider configured (missing CLAUDE_API_KEY and OPENAI_API_KEY)")
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=4000,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": "\n\n".join(parts)},
            ],
            tools=[{
                "type": "function",
                "function": {
                    "name": _TOOL_NAME,
                    "description": "Return the resume as a structured object. Leave unknown fields empty; never fabricate.",
                    "parameters": _tool_input_schema(),
                },
            }],
            tool_choice={"type": "function", "function": {"name": _TOOL_NAME}},
        )
        call = response.choices[0].message.tool_calls[0]
        payload = json.loads(call.function.arguments)
    except ResumeBuilderError:
        raise
    except Exception as exc:
        logger.exception("resume_builder: OpenAI fallback failed")
        raise ResumeBuilderError(f"Resume generation failed: {exc}") from exc
    try:
        return CanonicalResume.model_validate(_strip_dashes(payload))
    except Exception as exc:
        logger.exception("resume_builder: OpenAI fallback schema validation failed")
        raise ResumeBuilderError(f"Generated resume failed validation: {exc}") from exc


def generate_canonical_resume(prompt: str, previous: dict | None) -> CanonicalResume:
    client = get_anthropic_client()

    parts = []
    if previous:
        parts.append("PREVIOUS RESUME DRAFT (JSON):\n" + json.dumps(previous, indent=2))
        parts.append("USER'S NEW INSTRUCTIONS:\n" + prompt.strip())
    else:
        parts.append("THE USER'S DESCRIPTION OF WHAT THEY'VE DONE:\n" + prompt.strip())
        # Research pass only on first generation; refinements keep the draft's
        # facts and don't need it.
        context = research_role_context(prompt)
        if context:
            parts.append(
                "ROLE CONTEXT (web research on the organizations mentioned; "
                "use to write credible qualitative bullets, never to invent "
                "employers or numbers):\n" + context
            )

    # No Anthropic key: generate on the app's primary provider instead of
    # failing the whole builder (the exact failure mode behind local 502s).
    if client is None:
        logger.warning("resume_builder: CLAUDE_API_KEY missing, using OpenAI fallback")
        return _generate_via_openai(parts)

    try:
        response = client.messages.create(
            model="claude-opus-4-8",
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
    except Exception:
        logger.exception("resume_builder: Claude call failed; trying OpenAI fallback")
        return _generate_via_openai(parts)

    tool_use = next((b for b in response.content if getattr(b, "type", None) == "tool_use"), None)
    if tool_use is None:
        raise ResumeBuilderError("Model did not return a structured resume")
    try:
        cleaned = _strip_dashes(tool_use.input)
        return CanonicalResume.model_validate(cleaned)
    except Exception as exc:
        logger.exception("resume_builder: schema validation failed")
        raise ResumeBuilderError(f"Generated resume failed validation: {exc}") from exc
