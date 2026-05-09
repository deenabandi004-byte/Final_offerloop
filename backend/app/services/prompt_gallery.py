"""
Prompt gallery service: generates personalized company search prompts
using LLM (gpt-4o-mini, Haiku 4.5 fallback) with weekly Firestore caching.
"""
import json
import logging
import random
import time
from datetime import datetime, timezone

from app.extensions import get_db
from app.services.openai_client import get_openai_client, get_anthropic_client

logger = logging.getLogger(__name__)

# University short names (subset, matches frontend universityUtils)
UNIVERSITY_SHORT = {
    "University of Southern California": "USC",
    "University of Southern California (USC)": "USC",
    "University of California, Los Angeles": "UCLA",
    "University of California, Los Angeles (UCLA)": "UCLA",
    "University of Michigan": "UMich",
    "University of Pennsylvania": "UPenn",
    "New York University": "NYU",
    "Georgetown University": "Georgetown",
    "University of California, Berkeley": "UC Berkeley",
    "University of California, Berkeley (UC Berkeley)": "UC Berkeley",
    "Massachusetts Institute of Technology": "MIT",
    "Stanford University": "Stanford",
    "Columbia University": "Columbia",
    "Harvard University": "Harvard",
    "Yale University": "Yale",
    "Princeton University": "Princeton",
    "Cornell University": "Cornell",
    "Duke University": "Duke",
    "Northwestern University": "Northwestern",
    "University of Chicago": "UChicago",
    "University of Virginia": "UVA",
    "University of Texas at Austin": "UT Austin",
    "Brown University": "Brown",
    "Ivey Business School": "Ivey",
}


def _short_university(uni: str) -> str:
    if not uni:
        return ""
    if uni in UNIVERSITY_SHORT:
        return UNIVERSITY_SHORT[uni]
    # Strip parenthetical suffix: "University of X (UX)" -> check "University of X"
    if "(" in uni:
        base = uni[:uni.index("(")].strip()
        if base in UNIVERSITY_SHORT:
            return UNIVERSITY_SHORT[base]
        # Return the part in parens as short name
        short = uni[uni.index("(") + 1:uni.index(")")].strip()
        if short:
            return short
    return uni


def _get_iso_week() -> str:
    """Return current ISO week as YYYY-Www (e.g. 2026-W17)."""
    now = datetime.now(timezone.utc)
    return f"{now.isocalendar()[0]}-W{now.isocalendar()[1]:02d}"


def _check_cache(uid: str, iso_week: str) -> dict | None:
    """Check Firestore cache for this user+week. Returns cached result or None."""
    db = get_db()
    if not db:
        return None
    try:
        doc = db.collection("users").document(uid).collection("promptGallery").document(iso_week).get()
        if doc.exists:
            data = doc.to_dict()
            logger.info("prompt_gallery cache hit: uid=%s week=%s", uid[:8], iso_week)
            return data
        return None
    except Exception as e:
        logger.warning("prompt_gallery cache read error: %s", e)
        return None


def _write_cache(uid: str, iso_week: str, result: dict):
    """Write result to Firestore cache."""
    db = get_db()
    if not db:
        return
    try:
        doc_data = {
            **result,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "isoWeek": iso_week,
        }
        db.collection("users").document(uid).collection("promptGallery").document(iso_week).set(doc_data)
        logger.info("prompt_gallery cached: uid=%s week=%s tier=%s source=%s", uid[:8], iso_week, result.get("tier"), result.get("source"))
    except Exception as e:
        logger.warning("prompt_gallery cache write error: %s", e)


def _extract_user_context(user_data: dict) -> dict:
    """Extract the 5 real fields from user Firestore doc."""
    academics = user_data.get("academics") or {}
    location = user_data.get("location") or {}

    university = academics.get("university") or ""
    major = academics.get("major") or ""
    graduation_year = str(academics.get("graduationYear") or "")
    career_interests = location.get("careerInterests") or location.get("career_interests") or []
    preferred_location = location.get("preferredLocation") or []

    # Normalize preferredLocation (can be string or list)
    if isinstance(preferred_location, str):
        preferred_location = [preferred_location] if preferred_location else []

    return {
        "university": university,
        "school_short": _short_university(university),
        "major": major,
        "graduation_year": graduation_year,
        "career_interests": career_interests,
        "preferred_locations": preferred_location,
    }


def _determine_tier(ctx: dict) -> int:
    """Tier 1: uni + interests + locations. Tier 2: interests. Tier 3: nothing."""
    has_uni = bool(ctx["university"])
    has_interests = len(ctx["career_interests"]) > 0
    has_loc = len(ctx["preferred_locations"]) > 0

    if has_uni and has_interests and has_loc:
        return 1
    elif has_interests:
        return 2
    else:
        return 3


LLM_SYSTEM_PROMPT = """You generate search prompts for a college student networking platform. The student will use these prompts to discover companies to network with.

You will receive the student profile data. Generate exactly 6 search prompts they can run to find companies. Each prompt is a natural-language query like "Boutique investment banks in NYC hiring summer 2026 analysts".

Rules:
- Output valid JSON: an object with a "prompts" key containing an array of exactly 6 objects, each with "prompt" (string, under 80 chars) and "hint" (string, under 40 chars, UPPERCASE, dot-separated tags like "FINANCE . NEW YORK").
- Prompts must be specific and actionable. They should feel like they were written for this exact student, not pulled from a generic list.
- If school data is provided, at least 2 prompts must explicitly name the school (e.g. "Firms that recruit from USC").
- If location data is provided, distribute prompts across the student preferred cities. Do not repeat the same city in more than 3 prompts.
- Hints should surface what signal drove the prompt (school name, industry, city, company size, etc). Use dot separators, not commas.
- Do not fabricate statistics. Do not claim alumni counts, hiring numbers, or company details unless they are provided in the input.
- Never use em dashes (the long dash character). Use commas or periods instead.
- Prompts should feel editorial and specific, as if written by a career advisor who knows the student personally.
- Do not include generic prompts like "Top companies hiring" or "Best firms in finance". Every prompt must have at least two specific filters (industry + location, school + industry, size + location, etc).
- No prompt should exceed 80 characters. No hint should exceed 40 characters."""


def _build_user_prompt(ctx: dict, tier: int) -> str:
    """Build the user prompt from context."""
    lines = ["Student profile:"]

    if ctx["university"]:
        lines.append(f"- School: {ctx['university']}")
    if ctx["major"]:
        lines.append(f"- Major: {ctx['major']}")
    if ctx["graduation_year"]:
        lines.append(f"- Graduation: {ctx['graduation_year']}")
    if ctx["career_interests"]:
        lines.append(f"- Target industries: {', '.join(ctx['career_interests'][:5])}")
    if ctx["preferred_locations"]:
        lines.append(f"- Preferred cities: {', '.join(ctx['preferred_locations'][:4])}")

    if tier == 3:
        lines.append("")
        lines.append("This student has not provided specific career preferences yet.")
        lines.append("Generate 6 well-crafted, evergreen prompts spanning diverse industries (tech, finance, consulting, healthcare, climate, media).")
        lines.append("Make them specific enough to feel curated, not generic.")

    lines.append("")
    lines.append("Generate 6 search prompts for this student.")
    return "\n".join(lines)


def _call_llm(user_prompt: str) -> list[dict] | None:
    """Call gpt-4o-mini, fall back to Haiku 4.5. Returns list of prompts or None."""
    # Try OpenAI first
    try:
        client = get_openai_client()
        if client:
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": LLM_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=800,
                timeout=10,
            )
            raw = resp.choices[0].message.content
            parsed = json.loads(raw)
            items = parsed.get("prompts", [])
            if isinstance(items, list) and len(items) >= 6:
                return _validate_prompts(items[:6])
            logger.warning("prompt_gallery: LLM returned %d items, expected 6", len(items))
    except Exception as e:
        logger.warning("prompt_gallery: OpenAI failed: %s", e)

    # Fallback to Anthropic
    try:
        anthropic_client = get_anthropic_client()
        if anthropic_client:
            resp = anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=800,
                system=LLM_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
            raw = resp.content[0].text
            # Extract JSON from response
            if "{" in raw:
                json_str = raw[raw.index("{"):raw.rindex("}") + 1]
                parsed = json.loads(json_str)
                items = parsed.get("prompts", [])
                if isinstance(items, list) and len(items) >= 6:
                    return _validate_prompts(items[:6])
    except Exception as e:
        logger.warning("prompt_gallery: Anthropic fallback failed: %s", e)

    return None


def _validate_prompts(items: list[dict]) -> list[dict]:
    """Validate and truncate prompts/hints to spec limits."""
    valid = []
    for item in items:
        prompt = str(item.get("prompt", ""))[:80]
        hint = str(item.get("hint", ""))[:40]
        if prompt:
            valid.append({"prompt": prompt, "hint": hint})
    return valid if len(valid) == 6 else None


# Template fallback (ported from frontend promptGallery.ts, using only the 5 real fields)

TIER_3_DEFAULTS = [
    {"prompt": "AI startups in San Francisco hiring data scientists", "hint": "TECH . SAN FRANCISCO"},
    {"prompt": "Boutique investment banks in New York", "hint": "FINANCE . NEW YORK"},
    {"prompt": "Climate tech companies hiring across the US", "hint": "CLIMATE . NATIONWIDE"},
    {"prompt": "Management consulting firms in Chicago", "hint": "CONSULTING . CHICAGO"},
    {"prompt": "Gaming studios in Los Angeles hiring new grads", "hint": "ENTERTAINMENT . LOS ANGELES"},
    {"prompt": "Healthcare startups in Boston under 100 employees", "hint": "HEALTHCARE . BOSTON"},
]


def _template_fallback(ctx: dict, tier: int) -> list[dict]:
    """Deterministic template fallback using only the 5 real fields."""
    if tier == 3:
        return TIER_3_DEFAULTS[:6]

    school = ctx["school_short"] or ctx["university"] or ""
    interests = ctx["career_interests"][:3]
    locations = ctx["preferred_locations"][:3]
    grad = ctx["graduation_year"]

    candidates = []

    if tier == 1 and school:
        # School-specific prompts
        ind0 = interests[0] if interests else "your industry"
        loc0 = locations[0].split(",")[0].strip() if locations else "major cities"
        candidates.append({"prompt": f"{ind0} firms that recruit from {school}", "hint": f"{school.upper()} . {ind0.upper()}"})
        candidates.append({"prompt": f"Companies in {loc0} with {school} alumni", "hint": f"{school.upper()} . {loc0.upper()}"})

    # Industry + location combos
    for ind in interests[:3]:
        for loc_full in locations[:2]:
            loc = loc_full.split(",")[0].strip()
            p = f"{ind} companies in {loc}"
            if grad:
                p += f" hiring {grad} graduates"
            candidates.append({"prompt": p[:80], "hint": f"{ind.upper()[:18]} . {loc.upper()}"[:40]})

    # Size variants
    if locations:
        loc = locations[0].split(",")[0].strip()
        candidates.append({"prompt": f"Startups in {loc} under 100 employees", "hint": f"SIZE . {loc.upper()}"})

    if interests:
        candidates.append({"prompt": f"{interests[0]} firms hiring across the US", "hint": f"{interests[0].upper()[:20]} . NATIONWIDE"})

    # Deduplicate
    seen = set()
    unique = []
    for c in candidates:
        key = c["prompt"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(c)

    # Pad with generic if needed
    while len(unique) < 6:
        unique.append(TIER_3_DEFAULTS[len(unique) % len(TIER_3_DEFAULTS)])

    return unique[:6]


def get_prompt_gallery(uid: str) -> dict:
    """
    Main entry point. Returns:
    {
        "prompts": [{"prompt": str, "hint": str}, ...],  # exactly 6
        "tier": 1 | 2 | 3,
        "source": "cache" | "llm" | "template"
    }
    """
    iso_week = _get_iso_week()

    # 1. Cache check
    cached = _check_cache(uid, iso_week)
    if cached and cached.get("prompts"):
        return {
            "prompts": cached["prompts"],
            "tier": cached.get("tier", 3),
            "source": "cache",
        }

    # 2. Fetch user data
    db = get_db()
    user_data = {}
    if db:
        try:
            doc = db.collection("users").document(uid).get()
            if doc.exists:
                user_data = doc.to_dict()
        except Exception as e:
            logger.warning("prompt_gallery: user fetch failed: %s", e)

    ctx = _extract_user_context(user_data)
    tier = _determine_tier(ctx)

    # 3. Try LLM
    user_prompt = _build_user_prompt(ctx, tier)
    prompts = _call_llm(user_prompt)

    if prompts:
        result = {"prompts": prompts, "tier": tier, "source": "llm"}
    else:
        # 4. Template fallback
        prompts = _template_fallback(ctx, tier)
        result = {"prompts": prompts, "tier": tier, "source": "template"}

    # 5. Cache result
    _write_cache(uid, iso_week, result)

    return result
