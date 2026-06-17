"""
Resolve answers for ATS screening questions.

Two surfaces, two very different rules:

  resolve_structured(profile, label)
    For citizenship / sponsorship / EEO / veteran / disability / scheduling.
    Reads the Application Profile. Sensitive demographic fields default to
    "Decline to answer" — we NEVER infer race, gender, ethnicity, veteran
    status, or disability from any other signal.

  generate_open_ended(job, resume, question_text)
    For "why this company" / "describe a project" / "what excites you" type
    prompts. Calls the LLM. Output is editable in the review modal before
    submission.

The form-fillers use keyword matching on form-field labels to decide which
function applies. Anything unmatched falls to the LLM; if the LLM also can't
answer confidently, the question surfaces in the review modal as an unanswered
required field.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from app.services.auto_apply.application_profile import DECLINE, resolve_or_decline
from app.services.openai_client import get_openai_client


def resolve_with_library(
    uid: str,
    profile: Dict[str, Any],
    label: str,
    field_type: str = "text",
    options: Optional[list] = None,
) -> Optional[Any]:
    """Single entry point for the auto-apply orchestrator: given a form-field
    label, return the value to fill, or None if no source has an answer.

    Resolution order (highest priority first):
      1. Application Profile (structured slots — work auth, EEO, preferences).
         Sensitive fields default to DECLINE when unset, never None.
      2. User's persisted answer library (custom screening questions saved
         from past Needs Attention resolutions).

    The LLM open-ended path is NOT touched here — it requires job context and
    is invoked separately by `generate_open_ended` from build_preview."""
    # Local import to avoid a module-level cycle (answer_library imports from
    # this module for map_label_to_field).
    from app.services.auto_apply.answer_library import lookup_answer

    structured = resolve_structured(profile, label)
    if structured is not None:
        return structured

    if uid:
        from_library = lookup_answer(uid, label, field_type, options)
        if from_library is not None:
            return from_library

    return None


logger = logging.getLogger(__name__)


# ---------- Structured: deterministic, profile-driven ----------

_LABEL_KEYWORDS = [
    ("authorized to work", "workAuthorization.authorizedToWorkUS"),
    ("work authorization", "workAuthorization.authorizedToWorkUS"),
    ("legally authorized", "workAuthorization.authorizedToWorkUS"),
    ("legal right to work", "workAuthorization.authorizedToWorkUS"),
    ("right to work in", "workAuthorization.authorizedToWorkUS"),
    ("eligible to work", "workAuthorization.authorizedToWorkUS"),
    ("eligibility to work", "workAuthorization.authorizedToWorkUS"),
    ("sponsorship", "workAuthorization.requiresSponsorship"),
    ("visa sponsor", "workAuthorization.requiresSponsorship"),
    ("require visa", "workAuthorization.requiresSponsorship"),
    ("work permit", "workAuthorization.requiresSponsorship"),
    ("right to work support", "workAuthorization.requiresSponsorship"),
    ("additional right to work", "workAuthorization.requiresSponsorship"),
    ("visa status", "workAuthorization.visaStatus"),
    ("gender", "demographics.gender"),
    ("sex", "demographics.gender"),
    ("race", "demographics.race"),
    ("ethnicity", "demographics.ethnicity"),
    ("hispanic", "demographics.ethnicity"),
    ("sexual orientation", "demographics.lgbtq"),
    ("lgbt", "demographics.lgbtq"),
    ("veteran", "veteranStatus"),
    ("disability", "disabilityStatus"),
    ("disabled", "disabilityStatus"),
    ("start date", "preferences.earliestStartDate"),
    ("available to start", "preferences.earliestStartDate"),
    ("salary", "preferences.expectedSalaryUsd"),
    ("compensation expectation", "preferences.expectedSalaryUsd"),
    ("relocate", "preferences.openToRelocation"),
    ("remote", "preferences.openToRemote"),
]


def map_label_to_field(label: str) -> Optional[str]:
    """Return the dotted profile path for a form-field label, or None."""
    if not label:
        return None
    lower = label.lower()
    for needle, path in _LABEL_KEYWORDS:
        if needle in lower:
            return path
    return None


def resolve_structured(profile: Dict[str, Any], label: str) -> Optional[Any]:
    """Return the value the form-filler should write for `label`, or None if
    this label is not a structured question (caller should try LLM path).

    For EEO / veteran / disability, a `None` saved value resolves to DECLINE,
    not None — we never leave these blank, never guess."""
    path = map_label_to_field(label)
    if not path:
        return None
    value = _get_path(profile, path)

    sensitive_paths = {
        "demographics.gender",
        "demographics.race",
        "demographics.ethnicity",
        "demographics.lgbtq",
        "veteranStatus",
        "disabilityStatus",
    }
    if path in sensitive_paths:
        return resolve_or_decline(value)
    return value


def _get_path(obj: Dict[str, Any], dotted: str) -> Any:
    cur: Any = obj
    for part in dotted.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


# ---------- Open-ended: LLM-generated, user-editable ----------

_OPEN_ENDED_PROMPT = """You are helping a college student answer an open-ended job application question.

Job: {role} at {company}
Job description:
{description}

Student resume highlights:
{resume_summary}

Question on the application:
{question}

Write a short answer (2-4 sentences) in the student's voice. Be specific to the job description and the student's actual background. No corporate buzzwords, no "I am passionate about...", no LLM tells. If the student's resume doesn't credibly support an answer, return the literal string NEEDS_USER.
"""


def generate_open_ended(
    job: Dict[str, Any],
    resume_summary: str,
    question_text: str,
) -> str:
    """Generate one open-ended answer. Returns NEEDS_USER if the LLM cannot
    answer confidently — caller should surface it in the review modal."""
    prompt = _OPEN_ENDED_PROMPT.format(
        role=job.get("title") or "the role",
        company=job.get("company") or "the company",
        description=(job.get("description") or "")[:1500],
        resume_summary=(resume_summary or "")[:1500],
        question=question_text or "",
    )
    try:
        client = get_openai_client()
        # Same 30s timeout discipline as _batch_llm_answer — the SDK default
        # of 10 min can wedge the entire preview build.
        resp = client.with_options(timeout=30.0).chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=300,
        )
        text = (resp.choices[0].message.content or "").strip()
        if not text:
            return "NEEDS_USER"
        return text
    except Exception as exc:
        logger.warning("open-ended LLM failed: %s", exc)
        return "NEEDS_USER"


def summarize_resume_for_prompt(resume_parsed: Dict[str, Any]) -> str:
    """Compact resume blob for the open-ended prompt. Defensive against
    resumes that store experience/education as lists of strings instead of
    lists of dicts (real Offerloop data shape varies)."""
    if not isinstance(resume_parsed, dict):
        return ""
    parts = []
    summary = resume_parsed.get("summary")
    if isinstance(summary, str) and summary.strip():
        parts.append(summary)
    skills = resume_parsed.get("skills")
    # v2 parser writes skills as a dict {category: [skill, ...]}; legacy is a flat list
    if isinstance(skills, dict) and skills:
        flat = []
        for vals in skills.values():
            if isinstance(vals, list):
                flat.extend(str(v) for v in vals if v)
        if flat:
            parts.append("Skills: " + ", ".join(flat[:20]))
    elif isinstance(skills, list) and skills:
        parts.append("Skills: " + ", ".join(str(s) for s in skills[:15] if s))
    experience = resume_parsed.get("experience")
    if isinstance(experience, list):
        for exp in experience[:3]:
            if isinstance(exp, dict):
                title = str(exp.get("title") or "")
                company = str(exp.get("company") or "")
                desc = str(exp.get("description") or "")[:200]
                line = f"{title} @ {company}: {desc}".strip(" :")
            else:
                line = str(exp)[:300]
            if line:
                parts.append(line)
    education = resume_parsed.get("education")
    if isinstance(education, list):
        for edu in education[:2]:
            line = _format_education_entry(edu)
            if line:
                parts.append(line)
    elif isinstance(education, dict):
        # v2 parser sometimes writes education as a single dict instead of a
        # list — either the entry itself, or a nested {college: {...},
        # university: {...}} shape. Handle both.
        line = _format_education_entry(education)
        if line:
            parts.append(line)
        else:
            # Nested shape: walk dict values that look like education entries
            for nested in education.values():
                line = _format_education_entry(nested)
                if line:
                    parts.append(line)
    return "\n".join(p for p in parts if p)


def _format_education_entry(edu) -> str:
    """Render one education entry to a single line. Tolerates the v2 dict
    shape (`school`/`college`/`university` keys) and the legacy free-form."""
    if isinstance(edu, dict):
        school = str(
            edu.get("school")
            or edu.get("college")
            or edu.get("university")
            or edu.get("institution")
            or ""
        ).strip()
        degree = str(edu.get("degree") or "").strip()
        field = str(edu.get("field") or edu.get("major") or edu.get("fieldOfStudy") or "").strip()
        year = str(edu.get("graduationYear") or edu.get("year") or edu.get("endDate") or "").strip()
        bits = []
        if degree:
            bits.append(degree)
        if field:
            bits.append(f"in {field}")
        if school:
            bits.append(f"@ {school}")
        if year:
            bits.append(f"({year})")
        return " ".join(bits).strip()
    return str(edu)[:200] if edu else ""


# ---------- LLM-first batch resolver (v2 brain) ----------
#
# Replaces the per-tenant DOM-specific keyword classifier in greenhouse.py.
# Single batched LLM call per form: given the resume, the job, and every
# custom question (with options if known), return either a truthful answer
# derived from the resume or NEEDS_USER for genuinely user-specific things
# (preferences, sensitive paths, anything not derivable).
#
# Hard rules baked into the prompt and into the resolver flow:
#   - Sensitive paths (race/gender/EEO/work auth) ALWAYS use profile, never LLM.
#   - Preference paths (salary/relocation/start date/etc) → NEEDS_USER if
#     profile didn't set them. LLM is also instructed to refuse these.
#   - Library hits beat LLM. User-typed answers are reused.
#   - LLM never claims experience beyond what the resume shows. The eval
#     harness gates this.


SENSITIVE_PROFILE_PATHS = frozenset({
    "demographics.gender",
    "demographics.race",
    "demographics.ethnicity",
    "demographics.lgbtq",
    "veteranStatus",
    "disabilityStatus",
    # Work auth lives in the profile too, but unlike demographics it does NOT
    # decline-default — the upstream submit gate refuses to run without an
    # explicit answer.
    "workAuthorization.authorizedToWorkUS",
    "workAuthorization.requiresSponsorship",
    "workAuthorization.visaStatus",
})


_BATCH_PROMPT = """You are filling out a job application on behalf of a college student. Your only job is to answer each form question TRUTHFULLY based on the student context below.

STUDENT CONTEXT:
<student>
{resume_summary}
</student>

THE JOB:
Role: {role}
Company: {company}
<job_description>
{description}
</job_description>

THE FORM QUESTIONS:
{questions_block}

HARD RULES — read carefully:

TRUTHFULNESS (the cardinal rule):
1. NEVER claim experience beyond what the context shows. If the context shows 2 years of Python, do NOT pick "4-5" or write "5". Pick the option that matches the context, even if a higher option would help the candidacy.

SAFE DEFAULTS — answer these confidently from context, do NOT route to NEEDS_USER:
2. COUNTRY questions ("country of residence", "where are you based", "where do you live"): if the context shows the student attends a US school OR has US-based experience OR a US location, answer "United States" (or the exact US-matching option from the dropdown). The vast majority of Offerloop users are US college students.
3. SCHOOL questions ("most recent school", "current school", "where did you attend"): use the school from the ACADEMICS context line or the most recent education entry in the resume.
4. DEGREE questions ("most recent degree", "highest degree", "degree obtained"): use the degree from the ACADEMICS context or the most recent education entry. If the student is still enrolled, return their CURRENT degree level (e.g., "Bachelor's" for an undergraduate senior).
5. EDUCATION LEVEL dropdowns: pick the level matching the student's current/highest completed status. A current senior is "Some college" or "Bachelor's" depending on the option phrasing — never "Master's" or "PhD" unless the context shows it.
6. CITY/STATE questions ("if located in the US, what city and state"): use the LOCATION context line if present. If unset but other US signals exist, return NEEDS_USER (don't guess a specific city).
7. CURRENT EMPLOYER / TITLE: use the most recent experience entry.
8. LINKEDIN / GITHUB / PORTFOLIO URL: use the LINKS context.
9. "How did you hear about us?": pick LinkedIn if in the options.
10. "Have you previously worked at {company}?": return "No" unless the context explicitly mentions {company}.
11. NAME / EMAIL / PHONE: use the NAME / EMAIL / CONTACT context.
12. PRE-EMPLOYMENT AUTHORIZATIONS — ALWAYS AUTO-AGREE. The user already opted in by clicking Auto-apply. Refusing to auto-agree forces them to check the same boilerplate on every job application, which is the whole problem we're solving.

   IF the question title or surrounding description contains ANY of these keywords/phrases, return the agreement option ("I Agree", "Yes", "I Acknowledge", or whatever matches the dropdown/checkbox options) with confidence 0.95:
     - privacy policy / privacy notice / data processing
     - confidential / confidentiality / NDA
     - terms of service / terms of use / applicant agreement
     - "certify the information I've provided is accurate"
     - "consent to {company} collecting / storing / processing" (EEO, demographic, application data)
     - background check / background investigation / background screening
     - drug test / drug screen / substance test
     - credit check / credit history
     - third-party verification / third party investigation / reference check
     - "authorize {company} to contact" (references, former employers, schools)
     - at-will employment / employment-at-will

   CONCRETE EXAMPLES — these are the answers you should return:
     Title "Zscaler Confidential Information", label "I Agree" → answer "I Agree"
     Title "Zscaler Privacy Policy", label "I Agree" → answer "I Agree"
     "By checking this box, I consent to [Company] collecting, storing, and processing my responses to the demographic data surveys above." → answer "Yes" (or check the box: "I Agree" / "true")
     "I authorize [Company] to conduct a background check." → answer "I Agree"
     "I consent to drug testing if offered the position." → answer "Yes"

13. FACTUAL DECLARATIONS — return NEEDS_USER. These checkboxes assert a SPECIFIC FACT about the user that could be a lie. The pattern is "I confirm/affirm/have/am [something specific]" rather than "I agree to/authorize/consent to [a process]." Examples that route to NEEDS_USER:
     - "I have no felony convictions in the last 7 years"
     - "I have a valid driver's license / CDL"
     - "I hold an active security clearance (TS/SCI/Secret)"
     - "I have completed [specific certification or training]"
     - "I am bondable / insurable"

   DISTINGUISHING TEST: ask yourself "is this checkbox granting permission for the company to do something (authorization → rule 12), or is the user claiming a specific personal fact (declaration → rule 13)?" If the former, auto-agree. If the latter, NEEDS_USER.

ROUTE TO NEEDS_USER (these are genuinely user-specific):
12. SALARY / COMPENSATION expectations.
13. WILLINGNESS TO RELOCATE.
14. EARLIEST START DATE.
15. SPONSORSHIP needs (visa, work permit) — unless the context's CONTACT/applicationProfile line provides it.
16. WORK SCHEDULE preferences (remote vs in-office, specific days).
17. OPT-IN questions for marketing/recruiting communications (WhatsApp, SMS, etc).
18. Demographic / EEO / veteran / disability / authorization — return NEEDS_USER (these come from profile, not LLM).

OUTPUT:
- For dropdowns: pick from the provided options. If no truthful option exists, return "NEEDS_USER".
- For free-text "Why this role?" / "Why this company?": write 2-3 honest sentences in the student's voice, grounded in resume specifics. No buzzwords, no "I am passionate about".
- When in doubt between a safe default and NEEDS_USER, lean toward the safe default IF the context supports it. Empty drawer beats over-cautious drawer.

OUTPUT FORMAT — return strict JSON only, no prose:
{{
  "answers": {{
    "<field_id>": {{"answer": "<answer or NEEDS_USER>", "confidence": <0.0-1.0>}},
    ...
  }}
}}
"""


# Substring keywords that, when found in a field's label, indicate a routine
# pre-employment consent / acknowledgment. The Python fast-path short-circuits
# these to "I Agree" before the LLM is ever called — bypasses LLM hedging on
# standard click-throughs.
_CONSENT_AUTOFILL_KEYWORDS = (
    "privacy policy", "privacy notice", "data processing",
    "confidential information", "confidentiality agreement", "confidentiality",
    "terms of service", "terms of use", "applicant agreement",
    "at-will employment", "employment at-will", "employment at will",
    "background check", "background investigation", "background screening",
    "drug test", "drug screen",
    "credit check",
    "third-party verification", "third party investigation",
    "authorize to contact", "consent to contact",
    "consent to", "i agree", "i acknowledge",  # broad-but-bounded by field_type=checkbox
    "certify the information",
)


def _normalize_profile_answer(answer: Any, options: Optional[list]) -> Any:
    """Translate profile-stored values into option-shaped strings.

    Profile booleans become "Yes"/"No" so a form whose dropdown options are
    ["Yes", "No"] gets a matching value — without this the filler tries to
    type "True"/"False" into a react-select which then matches nothing,
    the form rejects, and the question lands right back in the drawer."""
    if answer is None or answer == "":
        return answer
    if answer is True:
        return "Yes"
    if answer is False:
        return "No"
    return answer


def _looks_like_consent_checkbox(label: str, field_type: str) -> bool:
    """Heuristic for a routine pre-employment acknowledgment checkbox.

    Two conditions: the field renders as a checkbox AND the label contains
    one of the consent keywords. We don't fast-path dropdowns or radios
    even when the keywords match — those can have non-binary semantics
    (e.g. a 'Privacy Policy' dropdown might offer 'I Agree / I Decline /
    Tell me more') where blindly returning 'I Agree' could be wrong."""
    if field_type != "checkbox":
        return False
    if not label:
        return False
    lower = label.lower()
    return any(kw in lower for kw in _CONSENT_AUTOFILL_KEYWORDS)


def auto_answer_form_questions(
    uid: str,
    profile: Dict[str, Any],
    resume_summary: str,
    job: Dict[str, Any],
    classified_fields: list,
) -> Dict[str, Dict[str, Any]]:
    """Single brain for the auto-apply form-fill flow.

    For each classified field (label + field_type + options + required),
    resolve in priority order:
      1. Sensitive path → Application Profile (DECLINE-defaulted for EEO,
         exact-value for work auth)
      2. Other known profile slot → profile value if set, else NEEDS_USER
         (these are preferences the LLM must not guess: salary, relocate, etc)
      3. Library lookup → user-typed answer from a prior job's drawer
      4. Queue for one batched LLM call with truthfulness rules

    Returns {field_id: {answer, source, llm_confidence?}}. `answer` is None
    when the resolution is NEEDS_USER. `source` ∈ {profile, library, llm,
    needs_user}.

    The LLM is called at most once per form, batching every queued question
    into a single request. Cost: ~$0.003 per form on gpt-4o-mini."""
    from app.services.auto_apply.answer_library import lookup_answer

    results: Dict[str, Dict[str, Any]] = {}
    llm_queue: list = []

    for field in classified_fields:
        field_id = field.get("field_id")
        label = field.get("label") or ""
        field_type = field.get("field_type") or "text"
        options = field.get("options")
        if not field_id:
            continue

        slot = map_label_to_field(label)
        print(
            f"[auto_apply.resolve] field_id={field_id!r} label={label!r} "
            f"field_type={field_type!r} slot={slot!r}",
            flush=True,
        )

        # 1. Sensitive: profile-only with DECLINE fallback for EEO.
        if slot in SENSITIVE_PROFILE_PATHS:
            answer = resolve_structured(profile, label)
            results[field_id] = {
                "answer": _normalize_profile_answer(answer, options),
                "source": "profile",
            }
            print(f"[auto_apply.resolve]   -> sensitive_profile answer={results[field_id]['answer']!r}", flush=True)
            continue

        # 2. Non-sensitive slot match: profile if set, else NEEDS_USER.
        # The slot existing AT ALL is the signal that the answer should come
        # from the user, not the LLM (salary, start date, willingness to
        # relocate are all profile preferences the LLM should never guess).
        if slot:
            value = resolve_structured(profile, label)
            if value is not None:
                results[field_id] = {
                    "answer": _normalize_profile_answer(value, options),
                    "source": "profile",
                }
                print(f"[auto_apply.resolve]   -> profile_slot answer={results[field_id]['answer']!r}", flush=True)
            else:
                results[field_id] = {"answer": None, "source": "needs_user"}
                print(f"[auto_apply.resolve]   -> profile_slot UNSET -> needs_user", flush=True)
            continue

        # 3. Consent fast-path: deterministic auto-agree for routine
        # pre-employment acknowledgment checkboxes (privacy / confidential /
        # terms / background check / etc). Bypasses the LLM entirely so the
        # LLM cannot hedge on standard click-throughs.
        if _looks_like_consent_checkbox(label, field_type):
            # Pick whatever the form's option label is for "agree" if we can
            # see options; default to "I Agree" otherwise. _truthy() in the
            # filler handles "I Agree" / "Yes" / "true" all the same.
            agree_answer = "I Agree"
            if options:
                for opt in options:
                    low = str(opt).lower().strip()
                    if low in ("i agree", "agree", "yes", "i acknowledge", "i consent"):
                        agree_answer = str(opt)
                        break
            results[field_id] = {"answer": agree_answer, "source": "consent_fastpath"}
            print(f"[auto_apply.resolve]   -> consent_fastpath answer={agree_answer!r}", flush=True)
            continue

        # 4. Library hit: a question the user resolved before on a prior job.
        if uid:
            try:
                from_lib = lookup_answer(uid, label, field_type, options)
            except Exception as exc:
                logger.warning("library lookup failed for %r: %s", label, exc)
                from_lib = None
            if from_lib is not None:
                results[field_id] = {"answer": from_lib, "source": "library"}
                continue

        # 5. Queue for the batched LLM call.
        llm_queue.append(field)

    if llm_queue:
        try:
            llm_answers = _batch_llm_answer(resume_summary, job, llm_queue)
        except Exception as exc:
            logger.warning("batched LLM resolver failed: %s", exc)
            llm_answers = {}

        for field in llm_queue:
            field_id = field["field_id"]
            options = field.get("options")
            llm = llm_answers.get(field_id) or {}
            answer = llm.get("answer")
            confidence = llm.get("confidence")

            # Defensive: LLM hallucinated an option not in the dropdown →
            # treat as NEEDS_USER so we don't type a fake value into a select.
            if (
                answer
                and answer != "NEEDS_USER"
                and options
                and str(answer) not in options
            ):
                logger.info(
                    "LLM picked %r not in options %r for field %s — dropping to NEEDS_USER",
                    answer, options, field_id,
                )
                answer = None

            if not answer or answer == "NEEDS_USER":
                results[field_id] = {
                    "answer": None,
                    "source": "needs_user",
                    "llm_confidence": confidence,
                }
            else:
                results[field_id] = {
                    "answer": str(answer),
                    "source": "llm",
                    "llm_confidence": confidence,
                }

    return results


def _batch_llm_answer(
    resume_summary: str,
    job: Dict[str, Any],
    fields: list,
) -> Dict[str, Dict[str, Any]]:
    """One LLM call for every queued question. Returns
    {field_id: {answer, confidence}}. Empty dict on any failure — the caller
    routes those to NEEDS_USER."""
    if not fields:
        return {}

    import time
    _t0 = time.time()
    print(
        f"[auto_apply.llm] starting batch: queue={len(fields)} "
        f"context_chars={len(resume_summary or '')} "
        f"job={(job.get('company') or '?')[:40]}",
        flush=True,
    )

    # Build the questions block. One line per question with options when known.
    questions_lines = []
    for f in fields:
        fid = f.get("field_id")
        label = (f.get("label") or "").replace("\n", " ").strip()
        opts = f.get("options")
        opts_part = ""
        if opts:
            opts_part = f" | Options: {opts}"
        questions_lines.append(f'  - field_id="{fid}" | "{label}"{opts_part}')
    questions_block = "\n".join(questions_lines)

    prompt = _BATCH_PROMPT.format(
        role=job.get("title") or "the role",
        company=job.get("company") or "the company",
        description=(job.get("description") or "")[:1500],
        # Bumped from 1500 to 4000 — the richer student context with name,
        # email, phone, location, current role, links, work auth, resume,
        # academics easily exceeds 1500 chars and truncating early starves
        # the LLM of critical fields like work auth and current employer.
        resume_summary=(resume_summary or "")[:4000],
        questions_block=questions_block,
    )

    client = get_openai_client()
    # Hard 45s timeout — the OpenAI SDK's default is 10 minutes, which can
    # silently hang the entire form-filler when the API is slow or wedged.
    # On timeout we return {} and the caller routes every queued field to
    # NEEDS_USER (drawer), so the user can still resolve manually.
    try:
        resp = client.with_options(timeout=45.0).chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1500,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        elapsed = time.time() - _t0
        print(
            f"[auto_apply.llm] FAILED after {elapsed:.1f}s: {type(exc).__name__}: {exc}",
            flush=True,
        )
        logger.warning("_batch_llm_answer LLM call failed: %s", exc)
        return {}
    text = (resp.choices[0].message.content or "").strip()
    if not text:
        elapsed = time.time() - _t0
        print(f"[auto_apply.llm] empty response after {elapsed:.1f}s", flush=True)
        return {}

    data = json.loads(text)
    # Tolerate both {answers: {...}} and bare {field_id: {...}} shapes.
    payload = data.get("answers") if isinstance(data, dict) and "answers" in data else data
    if not isinstance(payload, dict):
        return {}

    out: Dict[str, Dict[str, Any]] = {}
    for fid, entry in payload.items():
        if isinstance(entry, dict):
            ans = entry.get("answer")
            out[str(fid)] = {
                "answer": str(ans) if ans is not None else None,
                "confidence": entry.get("confidence"),
            }
        elif isinstance(entry, str):
            out[str(fid)] = {"answer": entry, "confidence": None}

    elapsed = time.time() - _t0
    answered = sum(
        1 for v in out.values()
        if v.get("answer") and v["answer"] != "NEEDS_USER"
    )
    needs_user = len(out) - answered
    print(
        f"[auto_apply.llm] completed: queue={len(fields)} duration={elapsed:.1f}s "
        f"answered={answered} needs_user={needs_user}",
        flush=True,
    )
    return out
