# Resume-First Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-step onboarding with 4 aesthetic intro slides + one resume/LinkedIn page, and give resume-less users a free Harvard one-pager built from their LinkedIn or a prompt box.

**Architecture:** Frontend keeps `/onboarding` and the Slate Split shell in `OnboardingFlow.tsx` but collapses steps to `slides → source → builder`, always writing the exact Firestore shape `buildFinalData` writes today. Backend adds one new blueprint (`/api/resume-builder`) that reuses the canonical resume pipeline: `from_resume_parsed()` / a Claude tool call → `CanonicalResume` → `render_one_page()` PDF → existing storage + Firestore save helpers.

**Tech Stack:** Flask blueprint + pytest (backend), React 18 + inline-style onboarding theme (frontend, no test framework — verify with `npx tsc --noEmit` and the dev server).

**Spec:** `docs/superpowers/specs/2026-07-21-resume-first-onboarding-design.md`

## Global Constraints

- Final Firestore write shape from `buildFinalData` must keep every existing key: `isStudent`, `userType`, `profile{fullName,firstName,lastName,email,phone,linkedinUrl}`, `university`, `academics{university,college,degree,major,graduationYear}`, `careerTrack:""`, `careerTracks:[]`, `careerTrackLabels:[]`, `targetIndustries:[]`, `goals{careerTrack:"",careerTracks:[],targetIndustries:[]}`, `onboarding.completedAt`.
- `userType` is always `"student"`; `referralSource` is never written.
- No emoji anywhere in UI; lucide line icons only. No em dashes in user-facing copy.
- Onboarding styling uses `OB` tokens from `src/pages/onboardingTheme.ts` (Lora display, Inter body, `OB.primary` #4A60A8).
- New blueprint MUST be registered in `backend/wsgi.py` (not `app/__init__.py`).
- Generation cap: 10 lifetime attempts per user, field `resumeBuilderGenerations` on the user doc, attempts counted whether or not they succeed. No credit deduction.
- Analytics step names: `slides_1..slides_4`, `source`, `resume_builder` via existing `/api/users/onboarding-event`.
- Commit after each task; commit ONLY the files the task touches (branch has unrelated unstaged work — never `git add -A` or `git commit -a`).
- Dev servers already running: backend `http://localhost:5001` (gunicorn --reload), frontend `http://localhost:8080` (Vite HMR).

---

### Task 1: Backend service — canonical mappers + prompt generation

**Files:**
- Create: `backend/app/services/resume_builder_service.py`
- Test: `backend/tests/test_resume_builder.py`

**Interfaces:**
- Consumes: `CanonicalResume`, `from_resume_parsed` from `app.services.resume_renderer`; `get_anthropic_client` from `app.services.openai_client`.
- Produces (used by Task 2's routes):
  - `canonical_to_parsed_info(resume: CanonicalResume) -> dict` — resumeParsed-v2-shaped dict.
  - `canonical_to_text(resume: CanonicalResume) -> str` — plain text for `resumeText`.
  - `generate_canonical_resume(prompt: str, previous: dict | None) -> CanonicalResume` — Claude tool call; raises `ResumeBuilderError` on failure.
  - `class ResumeBuilderError(Exception)`

- [ ] **Step 1: Write failing tests for the pure mappers**

```python
# backend/tests/test_resume_builder.py
"""Tests for the onboarding resume builder service + routes."""
import pytest
from unittest.mock import MagicMock, patch

from app.services.resume_renderer import CanonicalResume, ContactInfo, EducationEntry, ExperienceEntry, SkillsGroup


def _sample_resume() -> CanonicalResume:
    return CanonicalResume(
        contact=ContactInfo(name="Jane Trojan", email="jane@usc.edu", phone="213-555-0100"),
        education=[EducationEntry(school="University of Southern California", degree="B.S. in Business Administration", graduation="May 2027", gpa="3.8")],
        experience=[ExperienceEntry(company="Acme Consulting Club", role="Analyst", start="Sep 2025", end="Present", bullets=["Led a 4-person case team"])],
        skills=[SkillsGroup(category="Technical", items=["Excel", "SQL"])],
    )


class TestCanonicalToParsedInfo:
    def test_maps_contact_and_name(self):
        from app.services.resume_builder_service import canonical_to_parsed_info
        parsed = canonical_to_parsed_info(_sample_resume())
        assert parsed["name"] == "Jane Trojan"
        assert parsed["contact"]["email"] == "jane@usc.edu"
        assert parsed["contact"]["phone"] == "213-555-0100"

    def test_education_is_single_object_with_university_and_graduation(self):
        from app.services.resume_builder_service import canonical_to_parsed_info
        edu = canonical_to_parsed_info(_sample_resume())["education"]
        assert edu["university"] == "University of Southern California"
        assert edu["graduation"] == "May 2027"
        assert edu["degree"] == "B.S. in Business Administration"
        assert edu["gpa"] == "3.8"

    def test_experience_round_trips_through_normalizer(self):
        """The parsed dict must normalize back into an equivalent CanonicalResume."""
        from app.services.resume_builder_service import canonical_to_parsed_info
        from app.services.resume_renderer import from_resume_parsed
        parsed = canonical_to_parsed_info(_sample_resume())
        back = from_resume_parsed(parsed)
        assert back.experience[0].company == "Acme Consulting Club"
        assert back.experience[0].bullets == ["Led a 4-person case team"]
        assert back.skills[0].items == ["Excel", "SQL"]


class TestCanonicalToText:
    def test_contains_all_sections(self):
        from app.services.resume_builder_service import canonical_to_text
        text = canonical_to_text(_sample_resume())
        for fragment in ["Jane Trojan", "University of Southern California", "Acme Consulting Club", "Led a 4-person case team", "Excel"]:
            assert fragment in text


class TestGenerateCanonicalResume:
    def test_returns_validated_resume_from_tool_use(self):
        from app.services import resume_builder_service as svc
        tool_block = MagicMock()
        tool_block.type = "tool_use"
        tool_block.input = _sample_resume().model_dump()
        client = MagicMock()
        client.messages.create.return_value = MagicMock(content=[tool_block])
        with patch.object(svc, "get_anthropic_client", return_value=client):
            result = svc.generate_canonical_resume("I go to USC, class of 2027...", None)
        assert result.contact.name == "Jane Trojan"

    def test_raises_when_client_missing(self):
        from app.services import resume_builder_service as svc
        with patch.object(svc, "get_anthropic_client", return_value=None):
            with pytest.raises(svc.ResumeBuilderError):
                svc.generate_canonical_resume("anything", None)

    def test_previous_resume_is_included_in_user_message(self):
        from app.services import resume_builder_service as svc
        tool_block = MagicMock()
        tool_block.type = "tool_use"
        tool_block.input = _sample_resume().model_dump()
        client = MagicMock()
        client.messages.create.return_value = MagicMock(content=[tool_block])
        with patch.object(svc, "get_anthropic_client", return_value=client):
            svc.generate_canonical_resume("add my SQL project", _sample_resume().model_dump())
        sent = client.messages.create.call_args.kwargs["messages"][0]["content"]
        assert "Acme Consulting Club" in sent
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `cd backend && FLASK_ENV=testing python3 -m pytest tests/test_resume_builder.py -v`
Expected: FAIL / ERROR with `ModuleNotFoundError: No module named 'app.services.resume_builder_service'`

- [ ] **Step 3: Implement the service**

```python
# backend/app/services/resume_builder_service.py
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
    canonical model is a list — we take the first entry.
    """
    edu = resume.education[0] if resume.education else None
    # from_resume_parsed splits "X in Y" degrees via _combine_degree's inverse
    # only loosely; store the combined string in `degree` and leave major empty
    # so the round trip preserves the display string.
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
        "skills": {g.category: list(g.items) for g in resume.skills},
        "interests": resume.interests,
    }


def canonical_to_text(resume: CanonicalResume) -> str:
    lines: list[str] = [resume.contact.name]
    contact_bits = [b for b in [resume.contact.email, resume.contact.phone, resume.contact.location, resume.contact.linkedin] if b]
    if contact_bits:
        lines.append(" | ".join(contact_bits))
    if resume.education:
        lines.append("\nEDUCATION")
        for e in resume.education:
            lines.append(f"{e.school} — {e.degree} ({e.graduation})" + (f", GPA {e.gpa}" if e.gpa else ""))
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
            tools=[{
                "name": _TOOL_NAME,
                "description": "Return the resume as a structured object. Leave unknown fields empty; never fabricate.",
                "input_schema": _tool_input_schema(),
            }],
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
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd backend && FLASK_ENV=testing python3 -m pytest tests/test_resume_builder.py -v`
Expected: all tests PASS. If `test_experience_round_trips_through_normalizer` fails, fix the serializer keys against `normalizer.py` (it reads `title`/`company`/`dates`/`bullets` for experience) — do NOT change the normalizer.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/resume_builder_service.py backend/tests/test_resume_builder.py
git commit --no-verify -m "feat(onboarding): resume builder service — canonical mappers + Claude generation"
```

---

### Task 2: Backend routes — /api/resume-builder/*

**Files:**
- Create: `backend/app/routes/resume_builder.py`
- Modify: `backend/wsgi.py` (import + `app.register_blueprint(resume_builder_bp)` next to `resume_bp` at line ~266)
- Test: `backend/tests/test_resume_builder.py` (append route tests)

**Interfaces:**
- Consumes: Task 1's service functions; `render_one_page`, `render_html`, `from_resume_parsed` from `app.services.resume_renderer`; `save_resume_to_firebase` from `app.routes.resume`; `build_resume_metadata` from `app.services.resume_capabilities`; `require_firebase_auth`, `get_db` from `app.extensions`.
- Produces endpoints (all JSON, all `@require_firebase_auth`):
  - `POST /api/resume-builder/generate` `{prompt, previous?}` → `{success, resume, html}` (no save)
  - `POST /api/resume-builder/from-linkedin` `{}` → `{success, resumeUrl, parsed}` (renders + saves from stored `linkedinResumeParsed`)
  - `POST /api/resume-builder/finalize` `{resume}` → `{success, resumeUrl, parsed}`
  - Cap exceeded → HTTP 429 `{error: "generation_limit_reached"}`

- [ ] **Step 1: Append failing route tests**

Append to `backend/tests/test_resume_builder.py` (uses existing `conftest.py` fixtures `client`, `authenticated_request`; follow the mocking style of `tests/test_firm_search.py` — patch at the route module):

```python
class TestResumeBuilderRoutes:
    def _auth(self, monkeypatch):
        """Patch auth + db the way other route tests in this repo do."""
        import app.routes.resume_builder as rb
        user_doc = MagicMock()
        user_doc.exists = True
        user_doc.to_dict.return_value = {"resumeBuilderGenerations": 0, "linkedinResumeParsed": {
            "name": "Jane Trojan",
            "contact": {"email": "jane@usc.edu"},
            "education": {"university": "USC", "degree": "B.S.", "graduation": "May 2027"},
            "experience": [], "projects": [], "skills": {},
        }}
        db = MagicMock()
        db.collection.return_value.document.return_value.get.return_value = user_doc
        monkeypatch.setattr(rb, "get_db", lambda: db)
        return db

    def test_generate_returns_resume_and_html(self, client, authenticated_request, monkeypatch):
        import app.routes.resume_builder as rb
        self._auth(monkeypatch)
        monkeypatch.setattr(rb, "generate_canonical_resume", lambda p, prev: _sample_resume())
        res = client.post("/api/resume-builder/generate", json={"prompt": "I go to USC..."})
        assert res.status_code == 200
        body = res.get_json()
        assert body["success"] is True
        assert body["resume"]["contact"]["name"] == "Jane Trojan"
        assert "<html" in body["html"].lower() or "resume" in body["html"].lower()

    def test_generate_cap_returns_429(self, client, authenticated_request, monkeypatch):
        import app.routes.resume_builder as rb
        db = self._auth(monkeypatch)
        db.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {
            "resumeBuilderGenerations": 10}
        res = client.post("/api/resume-builder/generate", json={"prompt": "hi"})
        assert res.status_code == 429
        assert res.get_json()["error"] == "generation_limit_reached"

    def test_generate_missing_prompt_400(self, client, authenticated_request, monkeypatch):
        self._auth(monkeypatch)
        res = client.post("/api/resume-builder/generate", json={})
        assert res.status_code == 400

    def test_from_linkedin_renders_and_saves(self, client, authenticated_request, monkeypatch):
        import app.routes.resume_builder as rb
        self._auth(monkeypatch)
        monkeypatch.setattr(rb, "render_one_page", lambda r: MagicMock(pdf_bytes=b"%PDF", pages=1))
        monkeypatch.setattr(rb, "_upload_pdf", lambda uid, pdf: "https://storage/resume.pdf")
        saved = {}
        monkeypatch.setattr(rb, "save_resume_to_firebase",
                            lambda uid, text, url, parsed, meta: saved.update(url=url) or True)
        res = client.post("/api/resume-builder/from-linkedin", json={})
        assert res.status_code == 200
        body = res.get_json()
        assert body["success"] is True
        assert body["resumeUrl"] == "https://storage/resume.pdf"
        assert body["parsed"]["name"] == "Jane Trojan"
        assert saved["url"] == "https://storage/resume.pdf"

    def test_from_linkedin_without_enrichment_400(self, client, authenticated_request, monkeypatch):
        import app.routes.resume_builder as rb
        db = self._auth(monkeypatch)
        db.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {}
        res = client.post("/api/resume-builder/from-linkedin", json={})
        assert res.status_code == 400

    def test_finalize_saves_and_returns_parse_shape(self, client, authenticated_request, monkeypatch):
        import app.routes.resume_builder as rb
        self._auth(monkeypatch)
        monkeypatch.setattr(rb, "render_one_page", lambda r: MagicMock(pdf_bytes=b"%PDF", pages=1))
        monkeypatch.setattr(rb, "_upload_pdf", lambda uid, pdf: "https://storage/resume.pdf")
        monkeypatch.setattr(rb, "save_resume_to_firebase", lambda *a: True)
        res = client.post("/api/resume-builder/finalize", json={"resume": _sample_resume().model_dump()})
        assert res.status_code == 200
        body = res.get_json()
        assert body["parsed"]["education"]["university"] == "University of Southern California"
```

- [ ] **Step 2: Run, confirm failures (404s / import errors)**

Run: `cd backend && FLASK_ENV=testing python3 -m pytest tests/test_resume_builder.py -v -k Routes`
Expected: FAIL — blueprint not registered / module missing.

- [ ] **Step 3: Implement the route module**

```python
# backend/app/routes/resume_builder.py
"""Onboarding resume builder: free Harvard one-pager for users without a resume."""
from flask import Blueprint, request, jsonify
from firebase_admin import firestore

from app.services.resume_builder_service import (
    ResumeBuilderError,
    canonical_to_parsed_info,
    canonical_to_text,
    generate_canonical_resume,
)
from app.services.resume_renderer import CanonicalResume, from_resume_parsed, render_html, render_one_page
from app.services.resume_capabilities import build_resume_metadata
from app.routes.resume import save_resume_to_firebase
from ..extensions import require_firebase_auth, get_db

resume_builder_bp = Blueprint('resume_builder', __name__, url_prefix='/api/resume-builder')

GENERATION_CAP = 10
RESUME_FILENAME = "Offerloop_Resume.pdf"


def _check_and_count_attempt(uid: str):
    """Enforce the lifetime cap; count the attempt up front (success or not).

    Returns an error response tuple if capped, else None.
    """
    db = get_db()
    ref = db.collection('users').document(uid)
    doc = ref.get()
    used = (doc.to_dict() or {}).get('resumeBuilderGenerations', 0) if doc.exists else 0
    if used >= GENERATION_CAP:
        return jsonify({'error': 'generation_limit_reached',
                        'message': 'You have used all free resume generations.'}), 429
    ref.update({'resumeBuilderGenerations': firestore.Increment(1)})
    return None


def _upload_pdf(uid: str, pdf_bytes: bytes):
    """Upload generated PDF to the same bucket/path uploaded resumes use."""
    try:
        from firebase_admin import storage
        bucket = storage.bucket()
        blob = bucket.blob(f'resumes/{uid}/{RESUME_FILENAME}')
        blob.upload_from_string(pdf_bytes, content_type='application/pdf')
        blob.make_public()
        return blob.public_url
    except Exception as e:
        print(f"[ResumeBuilder] Storage upload failed: {e}")
        return None


def _render_save_respond(uid: str, resume: CanonicalResume):
    result = render_one_page(resume)
    resume_url = _upload_pdf(uid, result.pdf_bytes)
    parsed = canonical_to_parsed_info(resume)
    metadata = build_resume_metadata(url=resume_url or '', filename=RESUME_FILENAME, extension='pdf')
    save_resume_to_firebase(uid, canonical_to_text(resume), resume_url, parsed, metadata)
    return jsonify({'success': True, 'resumeUrl': resume_url, 'parsed': parsed})


@resume_builder_bp.route('/generate', methods=['POST'])
@require_firebase_auth
def generate():
    uid = request.firebase_user['uid']
    data = request.get_json() or {}
    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return jsonify({'error': 'prompt is required'}), 400
    capped = _check_and_count_attempt(uid)
    if capped:
        return capped
    try:
        resume = generate_canonical_resume(prompt, data.get('previous'))
    except ResumeBuilderError as e:
        return jsonify({'error': str(e)}), 502
    return jsonify({'success': True, 'resume': resume.model_dump(), 'html': render_html(resume)})


@resume_builder_bp.route('/from-linkedin', methods=['POST'])
@require_firebase_auth
def from_linkedin():
    """Build + save a resume from the linkedinResumeParsed the enrichment
    route already stored. Frontend calls /api/enrich-linkedin-onboarding first."""
    uid = request.firebase_user['uid']
    capped = _check_and_count_attempt(uid)
    if capped:
        return capped
    db = get_db()
    doc = db.collection('users').document(uid).get()
    linkedin_parsed = (doc.to_dict() or {}).get('linkedinResumeParsed') if doc.exists else None
    if not linkedin_parsed or not linkedin_parsed.get('name'):
        return jsonify({'error': 'No LinkedIn profile data on file. Enrich first.'}), 400
    try:
        resume = from_resume_parsed(linkedin_parsed)
        return _render_save_respond(uid, resume)
    except Exception as e:
        print(f"[ResumeBuilder] from-linkedin failed: {e}")
        return jsonify({'error': 'Could not build a resume from your LinkedIn profile.'}), 502


@resume_builder_bp.route('/finalize', methods=['POST'])
@require_firebase_auth
def finalize():
    uid = request.firebase_user['uid']
    data = request.get_json() or {}
    try:
        resume = CanonicalResume.model_validate(data.get('resume') or {})
    except Exception:
        return jsonify({'error': 'Invalid resume payload'}), 400
    try:
        return _render_save_respond(uid, resume)
    except Exception as e:
        print(f"[ResumeBuilder] finalize failed: {e}")
        return jsonify({'error': 'Could not save your resume. Try again.'}), 502
```

Register in `backend/wsgi.py`: next to the line `from .app.routes.resume import resume_bp` (line 19) add `from .app.routes.resume_builder import resume_builder_bp`; next to `app.register_blueprint(resume_bp)` (line ~266) add `app.register_blueprint(resume_builder_bp)`.

- [ ] **Step 4: Run the full test file + route listing**

Run: `cd backend && FLASK_ENV=testing python3 -m pytest tests/test_resume_builder.py -v`
Expected: all PASS.
Run: `cd .. && LIST_ROUTES=1 MCP_LOCAL_DEV_OK=1 PYTHONPATH=backend python3 -m backend.wsgi 2>/dev/null | grep resume-builder`
Expected: three `/api/resume-builder/...` routes listed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/resume_builder.py backend/wsgi.py backend/tests/test_resume_builder.py
git commit --no-verify -m "feat(onboarding): /api/resume-builder endpoints (generate, from-linkedin, finalize)"
```

---

### Task 3: Frontend API service functions

**Files:**
- Modify: `connect-grow-hire/src/services/api.ts` (append near `enrichLinkedInOnboarding`)

**Interfaces:**
- Produces (consumed by Tasks 5–6):
  - `generateResumeBuilder(prompt: string, previous: unknown | null): Promise<{success: boolean; resume: unknown; html: string}>`
  - `finalizeResumeBuilder(resume: unknown): Promise<{success: boolean; resumeUrl: string | null; parsed: unknown}>`
  - `resumeFromLinkedIn(): Promise<{success: boolean; resumeUrl: string | null; parsed: unknown}>`
  - All throw `Error(message)` on non-OK; 429 throws `Error("generation_limit_reached")`.

- [ ] **Step 1: Find the existing auth-header helper pattern in api.ts** (`grep -n "enrichLinkedInOnboarding" src/services/api.ts`) and append, matching its style:

```typescript
// ── Onboarding resume builder ────────────────────────────────────────────
async function resumeBuilderPost(path: string, body: unknown) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const res = await fetch(`${BACKEND_URL}/api/resume-builder/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `resume-builder/${path} failed`);
  return data;
}

export const generateResumeBuilder = (prompt: string, previous: unknown | null) =>
  resumeBuilderPost("generate", { prompt, previous });

export const finalizeResumeBuilder = (resume: unknown) =>
  resumeBuilderPost("finalize", { resume });

export const resumeFromLinkedIn = () => resumeBuilderPost("from-linkedin", {});
```

(If `api.ts` doesn't import `auth` from `@/lib/firebase` already, add the import; it almost certainly does — verify with grep.)

- [ ] **Step 2: Typecheck**

Run: `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep -v node_modules | head -20`
Expected: no NEW errors in `api.ts` (pre-existing errors elsewhere are out of scope).

- [ ] **Step 3: Commit**

```bash
git add connect-grow-hire/src/services/api.ts
git commit --no-verify -m "feat(onboarding): resume-builder API client functions"
```

---

### Task 4: Intro slides component

**Files:**
- Create: `connect-grow-hire/src/pages/OnboardingSlides.tsx`

**Interfaces:**
- Produces: `export const OnboardingSlides = ({ onDone, onViewSlide }: { onDone: (skipped: boolean) => void; onViewSlide: (index: number) => void }) => JSX.Element`
- Full-viewport component (rendered INSTEAD of the Slate Split shell — OnboardingFlow returns it early when `currentStep === "slides"`).

- [ ] **Step 1: Implement**

Design requirements (from spec): full-bleed on `OB.railGradient` navy, Lora headline in white, one-sentence Inter body in `OB.railHintText`, one lucide icon per slide in a soft chip, click ANYWHERE advances, ArrowRight/ArrowLeft keys navigate, progress dots bottom-center, "Skip" ghost button top-right, `obPaneIn`-style fade between slides, `prefers-reduced-motion` respected. No emoji, no em dashes.

```tsx
// connect-grow-hire/src/pages/OnboardingSlides.tsx
import { useEffect, useState } from "react";
import { Users, Mail, Briefcase, KanbanSquare } from "lucide-react";
import { OB } from "./onboardingTheme";
import OfferloopLogo from "@/assets/offerloop_logo2_allwhite.png";

const SLIDES = [
  {
    icon: Users,
    headline: "Find the right people",
    body: "Search 2.2 billion professionals: alumni from your school, people at your target firms.",
  },
  {
    icon: Mail,
    headline: "Reach out like you mean it",
    body: "AI-personalized emails written from your actual background, drafted straight into Gmail.",
  },
  {
    icon: Briefcase,
    headline: "Land the actual job",
    body: "A job board matched to your resume, and auto-apply that submits applications for you.",
  },
  {
    icon: KanbanSquare,
    headline: "Never drop a thread",
    body: "Contacts, applications, and follow-ups tracked in one pipeline, with Scout nudging your next move.",
  },
];

interface OnboardingSlidesProps {
  onDone: (skipped: boolean) => void;
  onViewSlide: (index: number) => void;
}

export const OnboardingSlides = ({ onDone, onViewSlide }: OnboardingSlidesProps) => {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const Icon = slide.icon;

  useEffect(() => onViewSlide(index), [index, onViewSlide]);

  const advance = () => (index < SLIDES.length - 1 ? setIndex(index + 1) : onDone(false));
  const back = () => index > 0 && setIndex(index - 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") advance();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={advance}
      className="min-h-screen flex flex-col"
      style={{ background: OB.railGradient, color: "#fff", cursor: "pointer", fontFamily: OB.fontBody, position: "relative" }}
    >
      <style>{`
        @keyframes obSlideIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .ob-slide-anim { animation: obSlideIn .45s cubic-bezier(0.16,1,0.3,1); }
        @media (prefers-reduced-motion: reduce) { .ob-slide-anim { animation: none; } }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "28px 36px" }}>
        <img src={OfferloopLogo} alt="Offerloop" style={{ height: 34 }} />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDone(true); }}
          style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: "#fff",
                   borderRadius: 8, padding: "8px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: OB.fontBody }}
        >
          Skip
        </button>
      </div>

      <div key={index} className="ob-slide-anim" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 24px" }}>
        <span style={{ display: "inline-flex", width: 74, height: 74, borderRadius: 20, alignItems: "center", justifyContent: "center",
                       background: "rgba(123,143,201,.18)", color: OB.railPeriwinkle, marginBottom: 34 }}>
          <Icon size={34} strokeWidth={1.5} />
        </span>
        <h1 style={{ fontFamily: OB.fontDisplay, fontWeight: 600, fontSize: "clamp(32px, 5vw, 52px)", letterSpacing: "-0.02em", margin: "0 0 18px", maxWidth: 640 }}>
          {slide.headline}
        </h1>
        <p style={{ fontSize: "clamp(16px, 2vw, 19px)", lineHeight: 1.65, color: OB.railHintText, maxWidth: 480, margin: 0 }}>
          {slide.body}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, padding: "0 0 44px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {SLIDES.map((s, i) => (
            <span key={s.headline} style={{ width: i === index ? 22 : 8, height: 8, borderRadius: 99, transition: "all .3s",
                                            background: i === index ? "#fff" : "rgba(255,255,255,.3)" }} />
          ))}
        </div>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,.5)" }}>Click anywhere to continue</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Typecheck** — `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep OnboardingSlides` — expected: nothing.

- [ ] **Step 3: Commit**

```bash
git add connect-grow-hire/src/pages/OnboardingSlides.tsx
git commit --no-verify -m "feat(onboarding): 4 intro slides (find, reach, jobs+auto-apply, tracker)"
```

---

### Task 5: Rework OnboardingSource into the single resume page

**Files:**
- Modify: `connect-grow-hire/src/pages/OnboardingSource.tsx`

**Interfaces:**
- Produces (breaking change consumed by Task 7):
  - `export type EntryPath = "resume" | "linkedin"` (manual removed)
  - `export interface SourceResult` — unchanged fields minus nothing (keep shape; `entryPath` narrows)
  - Props: `{ onNext: (data: SourceResult) => void; onBuild: () => void; initialLinkedinUrl?: string; submitting?: boolean }`
- Behavior changes:
  1. "I'll enter it manually" link becomes: "No resume? We'll build you one" → calls `onBuild()`.
  2. LinkedIn-only continue: after `enrichLinkedInOnboarding` succeeds, ALSO fire `resumeFromLinkedIn()` from `@/services/api` best-effort — `await` it inside a try/catch that ignores all errors (spec: LinkedIn users are never blocked by generation failure), then `proceed("linkedin", ...)`. Show phased status text in the submit button while waiting: "Reading your LinkedIn…" during enrich, "Writing your resume…" during from-linkedin.
  3. External `submitting` prop disables the button too (flow completes onboarding right after `onNext` now — no separate confirm step).

- [ ] **Step 1: Implement the edits**

Concrete diff points against the current file (read it first; it is 283 lines):

```tsx
// imports: add resumeFromLinkedIn
import { enrichLinkedInOnboarding, resumeFromLinkedIn, BACKEND_URL } from "@/services/api";

export type EntryPath = "resume" | "linkedin";

interface OnboardingSourceProps {
  onNext: (data: SourceResult) => void;
  onBuild: () => void;
  initialLinkedinUrl?: string;
  submitting?: boolean;
}

// inside component: phase state for the LinkedIn path
const [phase, setPhase] = useState<"" | "enriching" | "writing">("");

// handleContinue LinkedIn-only branch becomes:
if (linkedinValid) {
  setSubmitting(true);
  setPhase("enriching");
  let linkedinPrefill: ResumePrefill = EMPTY_PREFILL;
  try {
    const result = await enrichLinkedInOnboarding(linkedinUrl.trim());
    if (result) linkedinPrefill = prefillFromLinkedin(result);
    // Best-effort: build them a Harvard one-pager from the enriched profile.
    // Never blocks onboarding; failures (including the generation cap) are ignored.
    setPhase("writing");
    try { await resumeFromLinkedIn(); } catch { /* best-effort */ }
  } catch { /* enrichment failed; proceed with empty prefill */ }
  setSubmitting(false);
  setPhase("");
  proceed("linkedin", linkedinPrefill);
}

// button label:
{internalSubmitting || submitting ? (
  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <Loader2 size={17} className="animate-spin" />
    {phase === "enriching" ? "Reading your LinkedIn…" : phase === "writing" ? "Writing your resume…" : "Finishing up…"}
  </span>
) : ("Continue")}

// bottom link (styles copied from the removed manual link):
<button
  type="button"
  onClick={onBuild}
  style={{ fontWeight: 600, fontSize: 14, color: OB.primary, background: "none", border: "none", cursor: "pointer", fontFamily: OB.fontBody }}
>
  No resume? We'll build you one
</button>
```

Rename the internal `submitting` state to `internalSubmitting` to avoid clashing with the new prop; the disable condition is `!canContinue || internalSubmitting || submitting`. The `handleManual` function is deleted. Everything else (dropzone, parse call, resume+linkedin combined branch) stays as is, except the combined branch also gets the phased label (it already enriches).

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit 2>&1 | grep -i onboardingsource` — expect only errors from `OnboardingFlow.tsx` still passing old props (fixed in Task 7). If OnboardingFlow errors block the check, note and continue; Task 7 resolves them.

- [ ] **Step 3: Commit**

```bash
git add connect-grow-hire/src/pages/OnboardingSource.tsx
git commit --no-verify -m "feat(onboarding): source page — build-me-one link + LinkedIn auto-resume"
```

---

### Task 6: Resume builder page (prompt box + live Harvard outline)

**Files:**
- Create: `connect-grow-hire/src/pages/OnboardingBuilder.tsx`

**Interfaces:**
- Consumes: `generateResumeBuilder`, `finalizeResumeBuilder` from `@/services/api`; `resumePrefillFromParse`, `ResumePrefill` from `@/utils/onboardingPrefill`; `OB`, `obPrimaryButton`, `obInput` tokens.
- Produces: `export const OnboardingBuilder = ({ onComplete, submitting }: { onComplete: (prefill: ResumePrefill) => void; submitting: boolean }) => JSX.Element`
  - `onComplete` fires AFTER a successful finalize, passing `resumePrefillFromParse(finalizeResponse.parsed)`.

- [ ] **Step 1: Implement**

Layout: two columns inside the flow's 560px+ pane is too narrow — this component renders a WIDER internal grid (`display:grid; gridTemplateColumns: minmax(0,380px) minmax(0,1fr); gap:28px;` collapsing to one column under 900px via a `useMobile`-style media query check — use a `window.matchMedia` state hook inline). Left: textarea + generate/refine + prompt history. Right: preview.

```tsx
// connect-grow-hire/src/pages/OnboardingBuilder.tsx
import { useState } from "react";
import { Loader2, Sparkles, FileText } from "lucide-react";
import { generateResumeBuilder, finalizeResumeBuilder } from "@/services/api";
import { ResumePrefill, resumePrefillFromParse } from "@/utils/onboardingPrefill";
import { OB, obPrimaryButton } from "./onboardingTheme";

const GHOST_SECTIONS = ["Education", "Experience", "Projects", "Leadership", "Skills"];

interface OnboardingBuilderProps {
  onComplete: (prefill: ResumePrefill) => void;
  submitting: boolean;
}

export const OnboardingBuilder = ({ onComplete, submitting }: OnboardingBuilderProps) => {
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [resume, setResume] = useState<unknown | null>(null);
  const [html, setHtml] = useState("");
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    const p = prompt.trim();
    if (!p || generating) return;
    setError("");
    setGenerating(true);
    try {
      const res = await generateResumeBuilder(p, resume);
      setResume(res.resume);
      setHtml(res.html);
      setHistory((h) => [...h, p]);
      setPrompt("");
    } catch (e) {
      setError(
        e instanceof Error && e.message === "generation_limit_reached"
          ? "You've used all free generations. Upload a resume instead, or edit this one after onboarding."
          : "Couldn't generate right now. Your description is saved, try again."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleUse = async () => {
    if (!resume || finalizing) return;
    setError("");
    setFinalizing(true);
    try {
      const res = await finalizeResumeBuilder(resume);
      onComplete(resumePrefillFromParse(res.parsed));
    } catch {
      setError("Couldn't save your resume. Try again.");
      setFinalizing(false);
    }
  };

  const busy = generating || finalizing || submitting;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 380px) minmax(0, 1fr)", gap: 28 }}>
      {/* Left: prompt */}
      <div>
        <label style={{ fontWeight: 600, fontSize: 14, color: OB.heading, display: "block", marginBottom: 8 }}>
          {resume ? "Refine it" : "Tell us what you've done"}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={resume
            ? "Example: add my SQL project from last summer, and make the club bullets stronger."
            : "Plain words are fine. School and year, jobs or internships, clubs, projects, anything you're proud of."}
          rows={7}
          style={{ width: "100%", border: `1px solid ${OB.border}`, borderRadius: 10, padding: "12px 14px",
                   fontFamily: OB.fontBody, fontSize: 15, color: OB.ink, resize: "vertical", outline: "none" }}
        />
        {history.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {history.map((h, i) => (
              <div key={i} style={{ fontSize: 12.5, color: OB.ink4, background: OB.primary50, borderRadius: 8, padding: "7px 10px" }}>
                {h}
              </div>
            ))}
          </div>
        )}
        {error && <p style={{ fontSize: 13, color: "#DC2626", margin: "10px 0 0" }}>{error}</p>}
        <button type="button" onClick={handleGenerate} disabled={!prompt.trim() || busy}
                style={{ ...obPrimaryButton, marginTop: 14, opacity: prompt.trim() && !busy ? 1 : 0.5,
                         display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {generating ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={16} strokeWidth={1.7} />}
          {generating ? "Writing your resume…" : resume ? "Refine resume" : "Generate my resume"}
        </button>
        {resume && (
          <button type="button" onClick={handleUse} disabled={busy}
                  style={{ ...obPrimaryButton, marginTop: 10, background: "#fff", color: OB.primary,
                           border: `1.5px solid ${OB.primary}`, boxShadow: "none",
                           display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                           opacity: busy ? 0.5 : 1 }}>
          {finalizing || submitting ? <Loader2 size={17} className="animate-spin" /> : <FileText size={16} strokeWidth={1.7} />}
            Use this resume
          </button>
        )}
      </div>

      {/* Right: live Harvard outline / preview */}
      <div style={{ border: `1px solid ${OB.border}`, borderRadius: 14, background: "#fff", minHeight: 480,
                    boxShadow: OB.shadowLg, overflow: "hidden" }}>
        {html ? (
          <iframe title="Resume preview" srcDoc={html} sandbox="" style={{ width: "100%", height: 620, border: "none" }} />
        ) : (
          <div style={{ padding: "36px 40px" }}>
            <div style={{ height: 22, width: 180, borderRadius: 6, background: OB.primary100, marginBottom: 6 }} />
            <div style={{ height: 12, width: 260, borderRadius: 6, background: OB.primary50, marginBottom: 28 }} />
            {GHOST_SECTIONS.map((s) => (
              <div key={s} style={{ marginBottom: 26 }}>
                <div style={{ fontFamily: OB.fontDisplay, fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase",
                              color: OB.ink4, borderBottom: `1px solid ${OB.border}`, paddingBottom: 5, marginBottom: 12 }}>
                  {s}
                </div>
                <div style={{ height: 10, width: "82%", borderRadius: 5, background: OB.primary50, marginBottom: 8 }} />
                <div style={{ height: 10, width: "64%", borderRadius: 5, background: OB.primary50 }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

Note: `sandbox=""` on the iframe — the rendered HTML is trusted (our template) but needs no scripts.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit 2>&1 | grep -i onboardingbuilder` — expected: nothing.

- [ ] **Step 3: Commit**

```bash
git add connect-grow-hire/src/pages/OnboardingBuilder.tsx
git commit --no-verify -m "feat(onboarding): resume builder page — prompt box + live Harvard outline"
```

---

### Task 7: Rewire OnboardingFlow (slides → source → builder) + retire dead steps

**Files:**
- Modify: `connect-grow-hire/src/pages/OnboardingFlow.tsx` (substantial rewrite of steps/data plumbing; the Slate Split shell markup stays)
- Delete (after grep confirms no other importers): `OnboardingProfileBasics.tsx`, `OnboardingManualEntry.tsx`, `OnboardingIntent.tsx`, `OnboardingTrial.tsx`

**Interfaces:**
- Consumes: `OnboardingSlides` (Task 4), reworked `OnboardingSource` (Task 5), `OnboardingBuilder` (Task 6).
- Produces: same `OnboardingFlowProps { onComplete }` contract to App.tsx; same Firestore write shape (Global Constraints).

- [ ] **Step 1: Rewrite the flow's state machine**

Key edits (the file is 615 lines; shell JSX from line 392 stays except where noted):

```tsx
type Step = "slides" | "source" | "builder";
const STEP_INDEX: Record<Step, number> = { slides: 0, source: 1, builder: 1 };
const RAIL_STEPS: { label: string; optional?: boolean }[] = [
  { label: "What Offerloop does" },
  { label: "Your resume" },
];

// State: drop profileBasics, eduEmail, manualAcademics, intent. Keep submitting.
const [currentStep, setCurrentStep] = useState<Step>("slides");
const [source, setSource] = useState<SourceResult | null>(null);

// buildFinalData replacement — same output shape, sourced from prefill + Google account:
const buildFinalData = (prefill: ResumePrefill, linkedinUrl: string) => {
  const fullName = prefill.name || user?.name || "";
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = prefill.firstName || nameParts[0] || "";
  const lastName = prefill.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(" ") : "");
  const email = user?.email || prefill.email || "";
  const isStudent = email.toLowerCase().trim().endsWith(".edu");
  return {
    isStudent,
    userType: "student",
    profile: { fullName, firstName, lastName, email, phone: prefill.phone || "", linkedinUrl },
    university: prefill.university || "",
    academics: {
      university: prefill.university || "",
      college: prefill.university || "",
      degree: "",
      major: prefill.major || "",
      graduationYear: prefill.graduationYear || "",
    },
    careerTrack: "",
    careerTracks: [],
    careerTrackLabels: [],
    targetIndustries: [],
    goals: { careerTrack: "", careerTracks: [], targetIndustries: [] },
    onboarding: { completedAt: new Date().toISOString() },
  };
};

// Single completion path (replaces persistOnboarding/handleContinueFree/handleStartTrial):
const completeWithPrefill = async (prefill: ResumePrefill, linkedinUrl: string, step: string) => {
  if (submitting) return;
  setSubmitting(true);
  try {
    logOnboardingEvent("completed", step);
    sessionStorage.setItem("onboarding_just_completed", "true");
    await completeOnboarding(buildFinalData(prefill, linkedinUrl));
    await new Promise((r) => setTimeout(r, 300));
    await refreshUser();
    trackFeatureActionCompleted("onboarding", "complete", true);
    try { onComplete(buildFinalData(prefill, linkedinUrl)); } catch (e) { console.error("Analytics error:", e); }
    navigate(resolveDestination(), { replace: true });
  } catch (e) {
    console.error("Onboarding failed:", e);
    toast.error("Failed to finish onboarding. Please try again.");
    setSubmitting(false);
  }
};

// Step handlers:
const handleSlidesDone = (skipped: boolean) => {
  logOnboardingEvent("completed", "slides", skipped);
  setCurrentStep("source");
};
const handleSource = (data: SourceResult) => {
  setSource(data);
  void completeWithPrefill(data.resolved, data.linkedinUrl, "source");
};
const handleBuilderComplete = (prefill: ResumePrefill) => {
  void completeWithPrefill(prefill, "", "resume_builder");
};

// Back handling:
if (currentStep === "slides") { await signOut(); navigate("/?signedOut=true", { replace: true }); }
else if (currentStep === "source") setCurrentStep("slides");
else if (currentStep === "builder") setCurrentStep("source");

// Render: slides bypass the shell entirely —
if (currentStep === "slides") {
  return (
    <OnboardingSlides
      onDone={handleSlidesDone}
      onViewSlide={(i) => {
        const key = `slides_${i + 1}`;
        if (!loggedSteps.current.has(key)) { loggedSteps.current.add(key); logOnboardingEvent("viewed", key); }
      }}
    />
  );
}
```

STEP_META shrinks to `source` and `builder`:

```tsx
const STEP_META: Record<Exclude<Step, "slides">, {...}> = {
  source: {
    headline: <>First, let's get {em("your story")}</>,
    sub: "Drop in your resume or LinkedIn. We'll set up everything from it.",
    footer: { hint: <>Your resume powers everything here: recommended jobs, people to talk to, personalized emails, and auto-apply. No resume? We'll write you one, free.</> },
  },
  builder: {
    headline: <>Let's build {em("your resume")}</>,
    sub: "Tell us what you've done. We'll turn it into a clean one-page resume, free.",
    footer: { mascot: 150 },
  },
};
```

Pane render block becomes:

```tsx
{currentStep === "source" && (
  <OnboardingSource
    onNext={handleSource}
    onBuild={() => { logOnboardingEvent("completed", "source", true); setCurrentStep("builder"); }}
    initialLinkedinUrl={source?.linkedinUrl}
    submitting={submitting}
  />
)}
{currentStep === "builder" && (
  <OnboardingBuilder onComplete={handleBuilderComplete} submitting={submitting} />
)}
```

For the builder step widen the readable column: change the pane inner wrapper `maxWidth` from `560` to `currentStep === "builder" ? 980 : 560`.

Also: remove now-dead imports (Stripe imports, `loadStripe`, `STRIPE_PUBLISHABLE_KEY`, `stripePromise`, `OnboardingProfileBasics`, `OnboardingManualEntry`, `OnboardingIntent`, `OnboardingTrial`, `StepNum3/4` if RAIL uses only 2 images — keep `STEP_NUM_IMAGES` sliced to 2), remove `isStudent`/`eduEmail` logic, remove `handleStartTrial`/`handleContinueFree`/`persistOnboarding`. Add imports for `OnboardingSlides`, `OnboardingBuilder`, `ResumePrefill`.

- [ ] **Step 2: Retire dead step components**

```bash
cd connect-grow-hire
grep -rn "OnboardingProfileBasics\|OnboardingManualEntry\|OnboardingIntent\|OnboardingTrial" src --include="*.tsx" --include="*.ts" | grep -v "src/pages/OnboardingFlow.tsx"
```
Expected: only the components' own files (and possibly `OnboardingConfirm.tsx` cross-refs — if `OnboardingConfirm.tsx` is itself unreferenced, delete it too). Delete each file that has no remaining importers with `git rm`. If ANY has another importer, keep it and note in the commit message.

- [ ] **Step 3: Typecheck + build**

Run: `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep -v node_modules | head -30`
Expected: no errors referencing Onboarding*.
Run: `npm run build 2>&1 | tail -5`
Expected: build succeeds (this also catches the Vite chunk pitfalls).

- [ ] **Step 4: Commit**

```bash
git add connect-grow-hire/src/pages/OnboardingFlow.tsx
git rm <each confirmed-dead Onboarding*.tsx>
git commit --no-verify -m "feat(onboarding): collapse flow to slides + one resume page"
```

---

### Task 8: End-to-end verification on the dev servers

**Files:** none (verification only)

- [ ] **Step 1: Backend suite**

Run: `cd backend && FLASK_ENV=testing python3 -m pytest tests/test_resume_builder.py tests/ -x -q -k "resume_builder or onboarding" 2>&1 | tail -5`
Expected: all selected tests pass.

- [ ] **Step 2: Route smoke test**

Run: `curl -s -X POST http://localhost:5001/api/resume-builder/generate -H "Content-Type: application/json" -d '{"prompt":"x"}' | head -c 200`
Expected: 401/auth-required JSON (proves route registered + auth enforced; gunicorn --reload picked up the new blueprint).

- [ ] **Step 3: Browser walkthrough (browse/claude-in-chrome or manual)**

On `http://localhost:8080/onboarding` (signed in as a test account):
1. Slides render on navy, click-through works, Skip works, dots update.
2. Resume page: upload a PDF → completes onboarding → lands on /home; Firestore user doc has `profile`, `academics`, `resumeParsed`.
3. Back from resume page returns to slides; back from slides signs out.
4. "No resume? We'll build you one" → builder: generate from a 3-sentence prompt → preview renders → refine → "Use this resume" → onboarding completes; user doc has `resumeUrl` PDF + `resumeBuilderGenerations` incremented.
5. LinkedIn-only: enter a linkedin.com/in/ URL → phased button text → completes; resume saved.
6. Mobile viewport (390px): slides readable, builder collapses gracefully (grid may stay 2-col — if unusable, add the media-query collapse noted in Task 6).

- [ ] **Step 4: Report results to the user with any deviations.**
