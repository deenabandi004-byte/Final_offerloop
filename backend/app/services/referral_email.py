"""
Referral email orchestrator — Phase 5 quality lift.

The vanilla `/api/emails/generate-and-draft` path produces competent but
generic outreach. For a *warm contact at the hiring company*, we have much
richer data to draw on, and the prompt strategy should be fundamentally
different: ask for a 15-min conversation, NOT a referral. Referrals
follow conversations; they almost never come from cold first-touch asks.

This module orchestrates the click path for "↗ Reach out to {Name}":
  1. Look up the saved contact and the user's profile + signals.
  2. Pull the user's most recent coffee-chat prep for this contact, if any
     (their own notes are by far the best context we'll ever have).
  3. Pull recent professional activity for the contact via Perplexity,
     cached so the same person isn't re-queried more than weekly.
  4. Find 1-3 specific overlaps between the JD requirements and the user's
     resume bullets — concrete, citable, not generic skill claims.
  5. Build a referral-tuned prompt with explicit banned-phrase rules + the
     two-step "ask for a chat" framing.
  6. Call gpt-4o, parse subject/body, create a Gmail draft, return the URL.
  7. Cache the (contact, job) combo so re-clicks reuse the same draft.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from app.extensions import get_db

logger = logging.getLogger(__name__)


REFERRAL_DRAFT_TTL_DAYS = 7
PERPLEXITY_ACTIVITY_TTL_DAYS = 7

# Hard ceiling on prompt input. Coffee-chat preps and recent-activity blobs
# can be large; we trim each segment to keep gpt-4o focused on the highest
# signal context.
MAX_PROMPT_CHARS = 12000
MAX_COFFEE_CHAT_CHARS = 3000
MAX_RECENT_ACTIVITY_CHARS = 1500
MAX_JD_CHARS = 1200
MAX_OVERLAP_BULLETS = 3


# ---------------------------------------------------------------------------
# Cache helpers — (uid, contact_id, job_id) → draft result
# ---------------------------------------------------------------------------

def _cache_key(contact_id: str, job_id: str) -> str:
    """Stable key for the (contact, job) pair, hashed to a fixed length."""
    raw = f"{contact_id}::{job_id}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def _read_cached_draft(uid: str, contact_id: str, job_id: str) -> Optional[dict]:
    """Return a cached draft for this (uid, contact, job) if fresh."""
    if not (uid and contact_id and job_id):
        return None
    try:
        db = get_db()
        if not db:
            return None
        key = _cache_key(contact_id, job_id)
        doc = (
            db.collection("users")
            .document(uid)
            .collection("referral_drafts")
            .document(key)
            .get()
        )
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        expires = data.get("expires_at")
        if isinstance(expires, datetime):
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires < datetime.now(timezone.utc):
                return None
        return data
    except Exception:
        logger.exception("[ReferralEmail] cache read failed uid=%s", uid)
        return None


def _write_cached_draft(uid: str, contact_id: str, job_id: str, payload: dict) -> None:
    """Persist a successful draft for re-clicks within the TTL window."""
    try:
        db = get_db()
        if not db:
            return
        key = _cache_key(contact_id, job_id)
        doc = {
            **payload,
            "contact_id": contact_id,
            "job_id": job_id,
            "cached_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=REFERRAL_DRAFT_TTL_DAYS),
        }
        (
            db.collection("users")
            .document(uid)
            .collection("referral_drafts")
            .document(key)
            .set(doc)
        )
    except Exception:
        logger.exception("[ReferralEmail] cache write failed uid=%s", uid)


# ---------------------------------------------------------------------------
# Context gathering — each helper returns None / empty on error (never raises)
# ---------------------------------------------------------------------------

def _load_contact(uid: str, contact_id: str) -> Optional[dict]:
    """Fetch a saved contact dict from users/{uid}/contacts/{contact_id}."""
    try:
        db = get_db()
        if not db:
            return None
        doc = (
            db.collection("users")
            .document(uid)
            .collection("contacts")
            .document(contact_id)
            .get()
        )
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        data["_id"] = doc.id
        return data
    except Exception:
        logger.exception("[ReferralEmail] contact load failed uid=%s id=%s", uid, contact_id)
        return None


def _load_user_profile(uid: str) -> dict:
    """User doc + resumeParsed for prompt context."""
    try:
        db = get_db()
        if not db:
            return {}
        doc = db.collection("users").document(uid).get()
        return doc.to_dict() or {} if doc.exists else {}
    except Exception:
        logger.exception("[ReferralEmail] user load failed uid=%s", uid)
        return {}


def _load_latest_coffee_chat_prep(uid: str, contact_id: str) -> Optional[dict]:
    """Pull the user's most recent coffee-chat prep for this contact.

    This is the single highest-signal piece of context we have — the
    student already did research on this person. Surfacing it into the
    referral prompt means the email reads like a follow-up, not a cold
    pitch. Returns the raw prep dict (or None if none exists).
    """
    try:
        db = get_db()
        if not db:
            return None
        # Coffee-chat preps are filed under users/{uid}/coffee-chat-preps with
        # a `contactId` field linking back to the contact doc id. Pull the
        # newest one — older preps may be stale.
        prep_query = (
            db.collection("users")
            .document(uid)
            .collection("coffee-chat-preps")
            .where("contactId", "==", contact_id)
            .order_by("createdAt", direction="DESCENDING")
            .limit(1)
        )
        for doc in prep_query.stream():
            data = doc.to_dict() or {}
            data["_id"] = doc.id
            return data
        return None
    except Exception:
        # Missing composite index is the most common failure; log once and
        # carry on without the prep — not a fatal error for the email.
        logger.warning(
            "[ReferralEmail] coffee-chat prep query failed uid=%s contact=%s",
            uid, contact_id, exc_info=True,
        )
        return None


def _load_recent_activity(contact: dict) -> str:
    """Perplexity sonar pull for what the contact is currently working on.

    Returns a short prose paragraph or "" on failure. Cached via the
    Perplexity client's own enrichment cache, so re-queries within the
    TTL window cost nothing.
    """
    name = (contact.get("name") or contact.get("Name") or "").strip()
    company = (contact.get("company") or contact.get("Company") or "").strip()
    title = (contact.get("title") or contact.get("Title") or "").strip()
    if not name or not company:
        return ""
    try:
        from app.services.perplexity_client import quick_search
        query = (
            f"What is {name} ({title} at {company}) currently working on or "
            f"recently posted about? Reply with 1-3 short factual bullets. "
            f"If you cannot find anything specific, reply 'NONE'."
        )
        result = quick_search(query, recency="month")
        content = (result or {}).get("content") or ""
        if not content or "NONE" in content.upper()[:50]:
            return ""
        return content.strip()[:MAX_RECENT_ACTIVITY_CHARS]
    except Exception:
        logger.warning("[ReferralEmail] recent-activity lookup failed", exc_info=True)
        return ""


def _flatten_skills(skills_field: Any) -> list[str]:
    """resumeParsed.skills is sometimes a list, sometimes a dict-of-lists."""
    if isinstance(skills_field, list):
        return [str(s) for s in skills_field if isinstance(s, str)]
    if isinstance(skills_field, dict):
        flat = []
        for v in skills_field.values():
            if isinstance(v, list):
                flat.extend([str(s) for s in v if isinstance(s, str)])
        return flat
    return []


def _extract_jd_resume_overlap(job: dict, profile: dict) -> list[str]:
    """Find 1-3 concrete overlaps between this JD and the user's resume.

    Used as evidence in the prompt — "I noticed the role calls for X; I built
    Y last summer." Specific > generic skill lists.

    Scans, in priority order:
      1. structured.requirements (Firecrawl-extracted, cleanest)
      2. structured.responsibilities
      3. job.description / description_raw (last resort, noisy)
    against the user's:
      a. skill keywords (resumeParsed.skills)
      b. experience titles (resumeParsed.experience[].title)
      c. project keywords (resumeParsed.projects[].keywords)
    """
    resume = profile.get("resumeParsed") or {}
    skills = {s.lower() for s in _flatten_skills(resume.get("skills")) if isinstance(s, str) and len(s) > 2}
    experiences = resume.get("experience") or []
    projects = resume.get("projects") or []

    structured = job.get("structured") or {}
    jd_sources: list[str] = []
    reqs = structured.get("requirements") or []
    if isinstance(reqs, list):
        jd_sources.extend(str(r) for r in reqs if isinstance(r, str))
    resp = structured.get("responsibilities") or []
    if isinstance(resp, list):
        jd_sources.extend(str(r) for r in resp if isinstance(r, str))
    description = (job.get("description") or job.get("description_raw") or "")[:MAX_JD_CHARS]
    if description:
        # Split description into rough sentences as a last-resort source.
        for sent in re.split(r"[\.\n•]+", description):
            sent = sent.strip()
            if 20 <= len(sent) <= 200:
                jd_sources.append(sent)

    # Build experience keyword set
    exp_terms: set[str] = set()
    for exp in experiences[:5]:
        if not isinstance(exp, dict):
            continue
        title = (exp.get("title") or "").lower()
        for w in re.split(r"\W+", title):
            if len(w) > 3:
                exp_terms.add(w)
        keywords = exp.get("keywords") or []
        if isinstance(keywords, list):
            for k in keywords[:8]:
                if isinstance(k, str) and len(k) > 2:
                    exp_terms.add(k.lower())

    project_terms: set[str] = set()
    for proj in projects[:5]:
        if not isinstance(proj, dict):
            continue
        keywords = proj.get("keywords") or []
        if isinstance(keywords, list):
            for k in keywords[:8]:
                if isinstance(k, str) and len(k) > 2:
                    project_terms.add(k.lower())

    overlaps: list[str] = []
    seen: set[str] = set()
    for source in jd_sources:
        source_lower = source.lower()
        # Find which user term matched
        matched_term = None
        for term in skills:
            if term in source_lower:
                matched_term = term
                break
        if not matched_term:
            for term in project_terms:
                if term in source_lower:
                    matched_term = term
                    break
        if not matched_term:
            for term in exp_terms:
                if term in source_lower:
                    matched_term = term
                    break
        if matched_term and source not in seen:
            overlaps.append(f"{source.strip()} (matches your `{matched_term}`)")
            seen.add(source)
        if len(overlaps) >= MAX_OVERLAP_BULLETS:
            break
    return overlaps


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are drafting a referral-outreach email from a college \
student to a saved professional contact at a company where the student is \
interested in a specific open role.

CRITICAL FRAMING (do not deviate):
- This email is the FIRST step of a two-step process. The goal of THIS email \
is to start a 15-minute conversation, NOT to ask for a referral directly. \
Referrals come from conversations.
- Do not use the words "referral", "refer", "vouch", or "introduce me" \
anywhere in the body or subject. Do not ask the recipient to forward the \
student's resume. The ask is a brief chat, period.

HARD RULES:
- Plain prose, no bullet points, no headers, no markdown. 100-130 words for \
the body, hard cap 150.
- Subject line under 60 characters. Do not start with "Quick question" or \
"Referral". Do not include the recipient's name in the subject.
- Open with something specific to the recipient (their work, a shared school, \
your prior conversation, something they recently posted). Never start with \
"I hope this email finds you well", "I came across your profile", or "I'm \
reaching out to". If you have no specific hook, lead with the role and your \
honest interest, not a cliche.
- Reference the specific role briefly and ONE concrete reason it interests \
the student (a particular team, technology, or what the work involves).
- Cite ONE specific overlap between the role and the student's background \
when overlaps are provided. Be honest and specific — name a project, a \
class, or a prior role. Do not list skills generically.
- Ask for a SHORT chat (15 minutes, "in the next couple weeks" or similar). \
Respect their time explicitly.
- End with the student's first name only. Do NOT include a full signature, \
contact info, or resume mention — those are appended automatically by the \
mail system.

BANNED PHRASES (never output these or close paraphrases):
- "I would be a strong fit"
- "I'm a strong candidate"
- "I'd love to learn more about your role"  (cliche)
- "I hope this email finds you well"
- "I came across your profile"
- "your time and consideration"
- "I would love the opportunity"
- "I'm reaching out to"
- "wear many hats"
- generic skill lists like "my Python and machine learning skills"

OUTPUT FORMAT (exact, no extra commentary):
Subject: <subject line>

<body paragraph(s)>
"""


def _profile_summary(profile: dict) -> str:
    """Compact one-paragraph summary of the user for the prompt."""
    parsed = profile.get("resumeParsed") or {}
    edu = parsed.get("education") or {}
    major = (edu.get("major") if isinstance(edu, dict) else None) or profile.get("major") or ""
    school = (
        (edu.get("school") if isinstance(edu, dict) else None)
        or profile.get("university")
        or profile.get("school")
        or ""
    )
    grad = (
        (edu.get("graduation_year") if isinstance(edu, dict) else None)
        or profile.get("graduationYear")
        or ""
    )
    skills = _flatten_skills(parsed.get("skills"))[:8]
    experiences = parsed.get("experience") or []
    exp_strs: list[str] = []
    for e in experiences[:3]:
        if not isinstance(e, dict):
            continue
        title = e.get("title") or ""
        company = e.get("company") or ""
        if title and company:
            exp_strs.append(f"{title} at {company}")
        elif title:
            exp_strs.append(title)
    name = profile.get("name") or parsed.get("name") or "the student"
    parts = [
        f"Name: {name}",
        f"School: {school}" if school else "",
        f"Major: {major}" if major else "",
        f"Graduation: {grad}" if grad else "",
        f"Top skills: {', '.join(skills)}" if skills else "",
        f"Recent experience: {'; '.join(exp_strs)}" if exp_strs else "",
    ]
    return "\n".join(p for p in parts if p)


def _contact_summary(contact: dict, alumni_match_school: str) -> str:
    """How the user knows this contact, plus contact basics."""
    name = (contact.get("name") or contact.get("Name") or "").strip()
    title = (contact.get("title") or contact.get("Title") or "").strip()
    company = (contact.get("company") or contact.get("Company") or "").strip()
    college = (contact.get("college") or contact.get("College") or "").strip()
    note = (contact.get("note") or contact.get("notes") or "").strip()
    linkedin = (contact.get("linkedinUrl") or contact.get("LinkedIn") or "").strip()

    rel = []
    if college and alumni_match_school and college.lower().strip() == alumni_match_school.lower().strip():
        rel.append(f"Shared school: both attended {college}.")
    elif college:
        rel.append(f"Contact attended {college}.")
    if note:
        rel.append(f"User's note about this contact: {note[:400]}")

    parts = [
        f"Name: {name}",
        f"Title: {title}" if title else "",
        f"Company: {company}",
        f"LinkedIn: {linkedin}" if linkedin else "",
        *rel,
    ]
    return "\n".join(p for p in parts if p)


def _job_summary(job: dict) -> str:
    """One-paragraph framing of the role for the prompt."""
    title = job.get("title") or ""
    company = job.get("company") or ""
    location = job.get("location") or ""
    structured = job.get("structured") or {}
    team = structured.get("team") or ""
    employment_type = structured.get("employment_type") or job.get("type") or ""
    parts = [
        f"Role: {title}",
        f"Company: {company}",
        f"Location: {location}" if location else "",
        f"Team: {team}" if team else "",
        f"Type: {employment_type}" if employment_type else "",
    ]
    return "\n".join(p for p in parts if p)


def _build_user_prompt(
    profile: dict,
    contact: dict,
    job: dict,
    coffee_chat_prep: Optional[dict],
    recent_activity: str,
    overlaps: list[str],
) -> str:
    """Compose the full user-side prompt with all gathered context."""
    user_school = (
        ((profile.get("resumeParsed") or {}).get("education") or {}).get("school")
        or profile.get("university")
        or profile.get("school")
        or ""
    )
    sections = []
    sections.append("STUDENT:\n" + _profile_summary(profile))
    sections.append("CONTACT (the recipient):\n" + _contact_summary(contact, user_school))
    sections.append("ROLE THE STUDENT IS INTERESTED IN:\n" + _job_summary(job))

    if overlaps:
        sections.append(
            "SPECIFIC OVERLAPS between this role and the student's background:\n- "
            + "\n- ".join(overlaps)
        )
    else:
        sections.append(
            "SPECIFIC OVERLAPS: none found. Cite the student's major or a concrete "
            "skill from their resume instead of inventing a project."
        )

    if coffee_chat_prep:
        # The prep is rich — pull the strongest text fields and trim.
        prep_bits = []
        for k in ("summary", "background", "talkingPoints", "researchSummary", "notes"):
            v = coffee_chat_prep.get(k)
            if isinstance(v, str) and v.strip():
                prep_bits.append(f"{k}: {v.strip()}")
            elif isinstance(v, list) and v:
                prep_bits.append(f"{k}: " + "; ".join(str(x) for x in v[:5] if x))
        contact_data = coffee_chat_prep.get("contactData") or {}
        if isinstance(contact_data, dict):
            cd_summary = contact_data.get("summary") or contact_data.get("about") or ""
            if isinstance(cd_summary, str) and cd_summary.strip():
                prep_bits.append(f"contactSummary: {cd_summary.strip()}")
        if prep_bits:
            blob = "\n".join(prep_bits)[:MAX_COFFEE_CHAT_CHARS]
            sections.append(
                "STUDENT'S PRIOR RESEARCH on this contact (treat as ground truth — "
                "use it to make the email feel like a continuation, not a cold pitch):\n"
                + blob
            )

    if recent_activity:
        sections.append(
            "CONTACT'S RECENT ACTIVITY (from web search — cite only if it sounds "
            "natural in a brief opener):\n" + recent_activity
        )

    sections.append(
        "WRITE THE EMAIL NOW. Output exactly:\n"
        "Subject: <line>\n\n"
        "<body>"
    )
    full = "\n\n---\n".join(sections)
    return full[:MAX_PROMPT_CHARS]


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------

def _call_llm(system_prompt: str, user_prompt: str) -> tuple[str, str]:
    """Run gpt-4o on the assembled prompts. Returns (subject, body)."""
    from app.services.openai_client import get_openai_client

    client = get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.5,
        max_tokens=600,
    )
    content = (response.choices[0].message.content or "").strip()
    return _parse_subject_body(content)


def _parse_subject_body(content: str) -> tuple[str, str]:
    """Split the model's output into (subject, body).

    Accepts either:
      Subject: ...\n\n<body>
    or
      Subject Line: ...\n\n<body>
    Falls back to "Quick chat?" if no subject line is found.
    """
    if not content:
        return "Quick chat?", ""
    # Strip leading code fences if any
    content = re.sub(r"^```\w*\s*", "", content.strip()).rstrip("`").strip()
    m = re.search(r"^\s*subject(?:\s*line)?\s*:\s*(.+)$", content, flags=re.I | re.M)
    if not m:
        return "Quick chat?", content.strip()
    subject = m.group(1).strip().strip('"').strip("'")
    body = content[m.end():].strip()
    # Strip a leading blank line or "Body:" prefix the model sometimes emits.
    body = re.sub(r"^\s*body\s*:\s*", "", body, flags=re.I)
    return subject or "Quick chat?", body


# ---------------------------------------------------------------------------
# Gmail draft creation
# ---------------------------------------------------------------------------

def _create_gmail_draft(
    uid: str, user_email: str, contact: dict, subject: str, body: str
) -> tuple[Optional[str], Optional[str]]:
    """Create a Gmail draft in the user's Gmail. Returns (draft_id, gmail_url).

    Falls back to (None, None) when the user has no Gmail integration. The
    frontend handles that case by surfacing subject/body in a copy-paste
    fallback.
    """
    try:
        from app.services.gmail_client import (
            create_gmail_draft_for_user,
            get_gmail_service_for_user,
        )

        # Normalize the contact dict to what create_gmail_draft_for_user expects.
        # It probes WorkEmail / Email / PersonalEmail in that order.
        recipient_email = (
            contact.get("Email")
            or contact.get("email")
            or contact.get("WorkEmail")
            or contact.get("work_email")
            or contact.get("PersonalEmail")
            or ""
        )
        if not recipient_email:
            return None, None

        contact_for_draft = {
            "Email": recipient_email,
            "FirstName": (contact.get("name") or contact.get("Name") or "").split()[:1] or [""],
            "LastName": (contact.get("name") or contact.get("Name") or "").split()[1:] or [""],
        }
        # Flatten the FirstName / LastName lists into strings
        contact_for_draft["FirstName"] = contact_for_draft["FirstName"][0] if contact_for_draft["FirstName"] else ""
        contact_for_draft["LastName"] = " ".join(contact_for_draft["LastName"]) if isinstance(contact_for_draft["LastName"], list) else contact_for_draft["LastName"]

        # Check that Gmail is connected before we try.
        if not get_gmail_service_for_user(user_email, user_id=uid):
            return None, None

        draft_id = create_gmail_draft_for_user(
            contact_for_draft,
            subject,
            body,
            tier="referral",
            user_email=user_email,
            user_id=uid,
        )
        if not draft_id or draft_id.startswith("mock_"):
            return None, None

        # Build the Gmail UI URL pointing at the draft.
        gmail_url = f"https://mail.google.com/mail/?authuser={user_email}#draft/{draft_id}"
        return draft_id, gmail_url
    except Exception:
        logger.exception("[ReferralEmail] Gmail draft create failed uid=%s", uid)
        return None, None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def build_referral_draft(uid: str, user_email: str, contact_id: str, job: dict) -> dict:
    """Orchestrate the full click → draft pipeline.

    Returns:
      {
        ok: bool,
        gmailUrl: Optional[str],
        draftId: Optional[str],
        subject: str,
        body: str,
        cached: bool,
        context_used: { has_coffee_chat_prep, has_recent_activity, overlap_count }
      }
    """
    if not uid or not contact_id:
        return {"ok": False, "error": "missing_uid_or_contact"}

    job_id = (job or {}).get("job_id") or (job or {}).get("id") or ""
    if not job_id:
        # No stable job id → cache won't help, generate fresh. Skip cache.
        cached = None
    else:
        cached = _read_cached_draft(uid, contact_id, job_id)
    if cached and cached.get("gmailUrl"):
        return {
            "ok": True,
            "gmailUrl": cached.get("gmailUrl"),
            "draftId": cached.get("draftId"),
            "subject": cached.get("subject"),
            "body": cached.get("body"),
            "cached": True,
            "context_used": cached.get("context_used") or {},
        }

    contact = _load_contact(uid, contact_id)
    if not contact:
        return {"ok": False, "error": "contact_not_found"}

    profile = _load_user_profile(uid)
    coffee_chat = _load_latest_coffee_chat_prep(uid, contact_id)
    recent_activity = _load_recent_activity(contact)
    overlaps = _extract_jd_resume_overlap(job or {}, profile)

    user_prompt = _build_user_prompt(
        profile=profile,
        contact=contact,
        job=job or {},
        coffee_chat_prep=coffee_chat,
        recent_activity=recent_activity,
        overlaps=overlaps,
    )

    try:
        subject, body = _call_llm(SYSTEM_PROMPT, user_prompt)
    except Exception as e:
        logger.exception("[ReferralEmail] LLM call failed uid=%s", uid)
        return {"ok": False, "error": f"llm_failed:{type(e).__name__}"}

    if not subject or not body:
        return {"ok": False, "error": "empty_generation"}

    draft_id, gmail_url = _create_gmail_draft(uid, user_email, contact, subject, body)

    context_used = {
        "has_coffee_chat_prep": bool(coffee_chat),
        "has_recent_activity": bool(recent_activity),
        "overlap_count": len(overlaps),
        "two_step_framing": True,
    }
    payload = {
        "ok": True,
        "gmailUrl": gmail_url,
        "draftId": draft_id,
        "subject": subject,
        "body": body,
        "cached": False,
        "context_used": context_used,
    }
    if job_id and gmail_url:
        _write_cached_draft(uid, contact_id, job_id, payload)
    return payload
