# Multi-Provider Auth + Universal Draft Delivery (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone sign in (email+password, Google, Apple) and always receive their generated outreach emails: native Gmail drafts when Gmail is connected, downloadable `.eml` files with resume attached otherwise.

**Architecture:** Firebase Auth gains two providers (password, Apple) behind one shared post-auth pipeline in `FirebaseAuthContext`. The backend `/emails/generate-and-draft` route stops hard-requiring a Gmail service: with no per-user Gmail integration it returns the generated emails in a `fallback` delivery mode, and a new `.eml` endpoint turns any of them into a downloadable draft file (with `X-Unsent: 1` so mail clients open it editable). Frontend surfaces render "Open in Gmail" or "Download / Copy" per draft, with a domain-aware nudge to connect the right inbox.

**Tech Stack:** React 18 + TypeScript + Firebase JS SDK (frontend), Flask 3 + firebase-admin + Gmail API (backend), pytest (backend tests only — the frontend has no test framework; frontend tasks verify via `npm run build`).

**Spec:** `docs/superpowers/specs/2026-07-21-multi-provider-auth-design.md`

## Global Constraints

- Branch: `feat/multi-provider-auth` (already cut from `upstream/main` @ `945a79c`). Commit frequently; push only when Nick asks.
- The Gmail draft path must remain behaviorally identical for users with a connected Gmail.
- No emojis in UI; lucide line icons only. No em dashes in user-facing copy (use periods/commas/colons).
- Keep brand styling: existing SignIn card styles, `var(--font-body)`, brand blue `#2563EB`/`#3B82F6`.
- Apple sign-in ships behind `VITE_ENABLE_APPLE_SIGNIN` (default off) because it needs Apple Developer setup (manual, Nick).
- Backend tests: `cd backend && pytest tests/ -k "<name>"`. Set `FLASK_ENV=testing`.
- Frontend check: `cd connect-grow-hire && npm run build` must pass (tsc runs as part of Vite build).
- Python: function-based services, no classes. Follow surrounding code style, incl. print-logging.

---

### Task 1: Backend `.eml` builder service

**Files:**
- Create: `backend/app/services/eml_builder.py`
- Test: `backend/tests/test_eml_builder.py`

**Interfaces:**
- Produces: `build_eml(to_addr: str, subject: str, body_text: str, body_html: str | None = None, resume_bytes: bytes | None = None, resume_filename: str | None = None, resume_ctype: str | None = None) -> bytes` — complete RFC 5322 message bytes with `X-Unsent: 1`.
- Produces: `eml_filename(first_name: str | None, company: str | None) -> str` — safe download filename like `Jane-Google.eml`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_eml_builder.py
import email
from email import policy

from app.services.eml_builder import build_eml, eml_filename


def _parse(raw: bytes):
    return email.message_from_bytes(raw, policy=policy.default)


def test_build_eml_basic_headers_and_unsent_flag():
    raw = build_eml("jane@company.com", "Quick question", "Hi Jane,\n\nBody here.")
    msg = _parse(raw)
    assert msg["To"] == "jane@company.com"
    assert msg["Subject"] == "Quick question"
    # X-Unsent: 1 makes Outlook desktop / Apple Mail open the file as an editable draft
    assert msg["X-Unsent"] == "1"
    assert "Body here." in msg.get_body(preferencelist=("plain",)).get_content()


def test_build_eml_html_alternative():
    raw = build_eml("a@b.com", "S", "plain text", body_html="<p>rich text</p>")
    msg = _parse(raw)
    assert "rich text" in msg.get_body(preferencelist=("html",)).get_content()
    assert "plain text" in msg.get_body(preferencelist=("plain",)).get_content()


def test_build_eml_attaches_resume():
    pdf = b"%PDF-1.4 fake"
    raw = build_eml(
        "a@b.com", "S", "body",
        resume_bytes=pdf, resume_filename="MyResume.pdf", resume_ctype="application/pdf",
    )
    msg = _parse(raw)
    atts = list(msg.iter_attachments())
    assert len(atts) == 1
    assert atts[0].get_filename() == "MyResume.pdf"
    assert atts[0].get_content_type() == "application/pdf"
    assert atts[0].get_payload(decode=True) == pdf


def test_build_eml_no_resume_no_attachment():
    msg = _parse(build_eml("a@b.com", "S", "body"))
    assert list(msg.iter_attachments()) == []


def test_eml_filename_sanitizes():
    assert eml_filename("Jane", "Goldman Sachs") == "Jane-Goldman-Sachs.eml"
    assert eml_filename(None, None) == "Outreach.eml"
    # path separators and weird chars must not survive into a download filename
    assert "/" not in eml_filename("a/b", "c\\d")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_eml_builder.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.eml_builder'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/services/eml_builder.py
"""Builds downloadable .eml draft files for users without a connected inbox.

The X-Unsent: 1 header tells Outlook desktop and Apple Mail to open the file
as an editable draft (compose window) instead of a received message.
"""
import re
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def build_eml(to_addr, subject, body_text, body_html=None,
              resume_bytes=None, resume_filename=None, resume_ctype=None):
    """Return complete RFC 5322 message bytes for a draft email.

    Mirrors the MIME structure used by the Gmail draft path in
    routes/emails.py (multipart/mixed > multipart/alternative > plain+html,
    resume as base64 attachment) so the two delivery modes produce the
    same email.
    """
    msg = MIMEMultipart("mixed")
    msg["To"] = to_addr
    msg["Subject"] = subject or ""
    msg["X-Unsent"] = "1"

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(body_text or "", "plain", "utf-8"))
    if body_html:
        alt.attach(MIMEText(body_html, "html", "utf-8"))
    msg.attach(alt)

    if resume_bytes:
        ctype = (resume_ctype or "application/pdf").split(";", 1)[0].strip()
        main, sub = ctype.split("/", 1) if "/" in ctype else ("application", "pdf")
        part = MIMEBase(main, sub)
        part.set_payload(resume_bytes)
        encoders.encode_base64(part)
        filename = resume_filename or "Resume.pdf"
        part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
        msg.attach(part)

    return msg.as_bytes()


def eml_filename(first_name, company):
    """Safe download filename: letters/digits/dashes only, .eml extension."""
    parts = [p for p in (first_name, company) if p and str(p).strip()]
    stem = "-".join(str(p).strip() for p in parts) or "Outreach"
    stem = re.sub(r"[^A-Za-z0-9-]+", "-", stem).strip("-") or "Outreach"
    return f"{stem}.eml"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_eml_builder.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/eml_builder.py backend/tests/test_eml_builder.py
git commit -m "feat(emails): .eml draft file builder with X-Unsent header"
```

---

### Task 2: Backend strict per-user Gmail helper (no shared-inbox fallback)

**Files:**
- Modify: `backend/app/services/gmail_client.py` (add function near `get_gmail_service_for_user`, ~line 986)
- Test: `backend/tests/test_gmail_service_strict.py`

**Interfaces:**
- Produces: `get_user_gmail_service_strict(uid: str)` — returns a Gmail service built ONLY from the user's own OAuth creds (`users/{uid}/integrations/gmail`), or `None`. Never falls back to the shared `token.pickle` account. Task 3 consumes this.
- Consumes: existing `_load_user_gmail_creds(uid)` and `_gmail_service(creds)` in the same file.

**Why:** `get_gmail_service_for_user` silently falls back to a shared Offerloop mailbox (`gmail_client.py:1016-1019`), so a user without Gmail gets drafts written into an inbox they cannot see. User-facing draft creation must never do that. Leave the old function untouched: other callers (system flows) still use it.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_gmail_service_strict.py
from unittest.mock import patch, MagicMock

from app.services import gmail_client


def test_strict_returns_service_when_user_creds_exist():
    fake_service = MagicMock()
    fake_service.users.return_value.getProfile.return_value.execute.return_value = {"emailAddress": "u@gmail.com"}
    with patch.object(gmail_client, "_load_user_gmail_creds", return_value=MagicMock()), \
         patch.object(gmail_client, "_gmail_service", return_value=fake_service):
        assert gmail_client.get_user_gmail_service_strict("uid123") is fake_service


def test_strict_returns_none_without_creds_never_touches_shared_account():
    with patch.object(gmail_client, "_load_user_gmail_creds", return_value=None), \
         patch.object(gmail_client, "get_gmail_service") as shared:
        assert gmail_client.get_user_gmail_service_strict("uid123") is None
        shared.assert_not_called()


def test_strict_returns_none_when_profile_check_fails():
    fake_service = MagicMock()
    fake_service.users.return_value.getProfile.return_value.execute.side_effect = Exception("invalid_grant")
    with patch.object(gmail_client, "_load_user_gmail_creds", return_value=MagicMock()), \
         patch.object(gmail_client, "_gmail_service", return_value=fake_service), \
         patch.object(gmail_client, "get_gmail_service") as shared:
        assert gmail_client.get_user_gmail_service_strict("uid123") is None
        shared.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_gmail_service_strict.py -v`
Expected: FAIL with `AttributeError: ... has no attribute 'get_user_gmail_service_strict'`

- [ ] **Step 3: Implement**

Add directly below `get_gmail_service_for_user` in `backend/app/services/gmail_client.py`:

```python
def get_user_gmail_service_strict(uid):
    """Gmail service from the user's OWN OAuth creds only. No shared fallback.

    Returns None when the user has no (working) Gmail integration. Used by
    user-facing draft creation, where falling back to the shared inbox would
    write drafts into a mailbox the user cannot see.
    """
    if not uid:
        return None
    try:
        creds = _load_user_gmail_creds(uid)
        if not creds:
            return None
        service = _gmail_service(creds)
        if not service:
            return None
        service.users().getProfile(userId='me').execute()
        return service
    except Exception as e:
        print(f"[GmailClient] strict per-user service unavailable for {uid}: {e}")
        return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_gmail_service_strict.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/gmail_client.py backend/tests/test_gmail_service_strict.py
git commit -m "feat(gmail): strict per-user service helper, no shared-inbox fallback"
```

---

### Task 3: Backend `/emails/generate-and-draft` fallback delivery mode

**Files:**
- Modify: `backend/app/routes/emails.py` (route `generate-and-draft`: service acquisition ~lines 161-168, profile fetch ~lines 312-318, draft loop ~lines 494-710, response ~lines 712-720)
- Modify: `backend/app/config.py:104` (delete dead `CREATE_GMAIL_DRAFTS`)
- Test: `backend/tests/test_generate_and_draft_fallback.py`

**Interfaces:**
- Consumes: `get_user_gmail_service_strict(uid)` from Task 2.
- Produces (API contract Task 6/8 relies on): response gains top-level `"deliveryMode": "gmail" | "fallback"`. In fallback mode each entry in `drafts` is `{"index", "to", "subject", "body", "deliveryMode": "fallback", "activelyHiring", "recentHiringSignal"}` (no `draftId`/`gmailUrl`), HTTP 200, and contacts are still saved to Firestore with `emailSubject`/`emailBody` (but no `gmailDraftId`/`gmailDraftUrl`, and `inOutbox: False` since reply tracking needs Gmail).

- [ ] **Step 1: Write the failing test**

The route is huge; test the routing seam, not the LLM. Mock generation and Firestore. Reuse fixtures from `backend/tests/conftest.py` (`client`, `authenticated_request` pattern — read that file first and follow how existing route tests authenticate; `mock_firebase_user` sets `request.firebase_user`).

```python
# backend/tests/test_generate_and_draft_fallback.py
import json
from unittest.mock import patch, MagicMock


CONTACT = {"FirstName": "Jane", "LastName": "Doe", "Email": "jane@acme.com",
           "Company": "Acme", "emailSubject": "Hello Jane", "emailBody": "Body text"}


def _mock_db():
    db = MagicMock()
    user_doc = MagicMock()
    user_doc.to_dict.return_value = {"email": "u@icloud.com", "resumeText": "x" * 100}
    db.collection.return_value.document.return_value.get.return_value = user_doc
    # contact lookup returns no existing contacts
    db.collection.return_value.document.return_value.collection.return_value \
      .where.return_value.limit.return_value.stream.return_value = []
    return db


def test_no_gmail_integration_returns_200_fallback(client, authenticated_request):
    with patch("app.routes.emails.get_user_gmail_service_strict", return_value=None), \
         patch("app.routes.emails.get_db", return_value=_mock_db()):
        res = client.post(
            "/api/emails/generate-and-draft",
            json={"contacts": [CONTACT]},
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 200
    data = res.get_json()
    assert data["deliveryMode"] == "fallback"
    assert data["success"] is True
    d = data["drafts"][0]
    assert d["to"] == "jane@acme.com"
    assert d["subject"] == "Hello Jane"
    assert d["body"].startswith("Body text")  # signature may be appended
    assert d["deliveryMode"] == "fallback"
    assert "gmailUrl" not in d and "draftId" not in d


def test_gmail_connected_keeps_gmail_mode(client, authenticated_request):
    svc = MagicMock()
    svc.users.return_value.getProfile.return_value.execute.return_value = {"emailAddress": "u@gmail.com"}
    draft = {"id": "d1", "message": {"id": "m1", "threadId": "t1"}}
    svc.users.return_value.drafts.return_value.create.return_value.execute.return_value = draft
    with patch("app.routes.emails.get_user_gmail_service_strict", return_value=svc), \
         patch("app.routes.emails.get_db", return_value=_mock_db()):
        res = client.post(
            "/api/emails/generate-and-draft",
            json={"contacts": [CONTACT]},
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 200
    data = res.get_json()
    assert data["deliveryMode"] == "gmail"
    assert data["drafts"][0]["draftId"] == "d1"
    assert "gmailUrl" in data["drafts"][0]
```

Adapt fixture names/auth mocking to what `conftest.py` actually provides; the assertions are the contract. Contacts arrive pre-written (`emailSubject`/`emailBody` present) so `batch_generate_emails` is skipped — the existing route already short-circuits generation for such contacts (`emails.py:170-183`), keeping this test off the LLM path.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_generate_and_draft_fallback.py -v`
Expected: FAIL — first test gets HTTP 500 ("Gmail service unavailable"), second may fail on `get_user_gmail_service_strict` not being imported.

- [ ] **Step 3: Implement the routing**

In `backend/app/routes/emails.py`:

3a. Import the strict helper where gmail_client functions are imported:

```python
from app.services.gmail_client import get_user_gmail_service_strict
```

3b. Replace the hard requirement (current lines 161-168):

```python
    # Per-user Gmail only. No shared-inbox fallback for user-facing drafts:
    # without an integration we return the generated emails in fallback mode
    # (downloadable .eml on the frontend) instead of erroring.
    gmail_service = get_user_gmail_service_strict(uid)
    fallback_mode = gmail_service is None
    if fallback_mode:
        print(f"[EmailGen] No Gmail integration for {uid}: fallback delivery mode")
```

3c. Guard the profile fetch (current lines 312-318). `gmail = gmail_service` stays; wrap the `getProfile` try/except in `if not fallback_mode:` and add `else: connected_email = None`.

3d. In the per-contact loop, branch before the `# --- Create Gmail draft ---` block (current line ~531). The subject/body/signature/to_addr resolution above it is shared and stays. Structure:

```python
        if fallback_mode:
            created.append({
                "index": i,
                "to": to_addr,
                "subject": r["subject"],
                "body": body,
                "deliveryMode": "fallback",
                "activelyHiring": c.get("_actively_hiring"),
                "recentHiringSignal": c.get("_recent_hiring_signal"),
            })
            # Save the contact so My Network / surfaces show the drafted email.
            # No gmailDraftId/gmailDraftUrl and inOutbox stays False: reply
            # tracking requires Gmail.
            try:
                contacts_ref = db.collection("users").document(uid).collection("contacts")
                to_addr_clean = (to_addr or "").strip().lower()
                existing_contacts = list(contacts_ref.where("email", "==", to_addr_clean).limit(1).stream())
                contact_data = {
                    "emailSubject": r["subject"],
                    "emailBody": body,
                    "draftToEmail": to_addr_clean,
                    "emailGeneratedAt": datetime.utcnow().isoformat(),
                    "lastActivityAt": datetime.utcnow().isoformat(),
                    "updatedAt": datetime.utcnow().isoformat(),
                    "pipelineStage": "draft_created",
                    "inOutbox": False,
                }
                # (same optional fields as the gmail path: personalization,
                # wordCountFinal, name/company/title/linkedin/college/location/pdlId —
                # copy that block verbatim from the gmail branch)
                if existing_contacts:
                    existing_contacts[0].reference.update(contact_data)
                else:
                    contact_data["email"] = to_addr_clean
                    contact_data["createdAt"] = datetime.utcnow().isoformat()
                    contacts_ref.document().set(contact_data)
            except Exception as e:
                print(f"[{i}] Failed to save fallback contact: {e}")
            continue
```

Implementation note: rather than duplicating the shared `contact_data` enrichment block (personalization fields etc., current lines 610-682), extract it into a small local helper `_base_contact_fields(r, c, body)` used by both branches. Do not change the gmail branch's resulting Firestore writes in any way.

3e. Response (current lines 712-720): add `"deliveryMode": "fallback" if fallback_mode else "gmail"` to the jsonify dict. In fallback mode `success` should be `len(created) > 0 or len(contacts) == 0` (unchanged expression works since fallback entries land in `created`).

3f. Delete `backend/app/config.py:104` (`CREATE_GMAIL_DRAFTS = False ...`) — dead flag, superseded by this routing. Verify nothing imports it: `grep -rn CREATE_GMAIL_DRAFTS backend/` must return nothing after removal.

- [ ] **Step 4: Run tests, including existing email tests**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_generate_and_draft_fallback.py -v && FLASK_ENV=testing pytest tests/ -k "email or draft" -v`
Expected: new tests pass; no existing test regresses.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/emails.py backend/app/config.py backend/tests/test_generate_and_draft_fallback.py
git commit -m "feat(emails): fallback delivery mode when no Gmail integration"
```

---

### Task 4: Backend `.eml` download endpoint

**Files:**
- Modify: `backend/app/routes/emails.py` (new route on the existing `emails_bp`)
- Test: `backend/tests/test_eml_endpoint.py`

**Interfaces:**
- Consumes: `build_eml`, `eml_filename` (Task 1).
- Produces (Task 8 consumes): `POST /api/emails/eml` with JSON `{"to": str, "subject": str, "body": str, "firstName"?: str, "company"?: str}` → `200` with `message/rfc822` bytes, `Content-Disposition: attachment; filename="<name>.eml"`. Resume comes from the caller's own Firestore doc (`resumeUrl`/`resumeFileName`), attached when downloadable; missing resume is not an error. `400` when `to`/`subject`/`body` missing.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_eml_endpoint.py
import email
from email import policy
from unittest.mock import patch, MagicMock


def _mock_db(resume_url=None):
    db = MagicMock()
    doc = MagicMock()
    doc.to_dict.return_value = {"resumeUrl": resume_url, "resumeFileName": "Resume.pdf"}
    db.collection.return_value.document.return_value.get.return_value = doc
    return db


def test_eml_download_no_resume(client, authenticated_request):
    with patch("app.routes.emails.get_db", return_value=_mock_db()):
        res = client.post(
            "/api/emails/eml",
            json={"to": "jane@acme.com", "subject": "Hi", "body": "Text",
                  "firstName": "Jane", "company": "Acme"},
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 200
    assert res.mimetype == "message/rfc822"
    assert 'filename="Jane-Acme.eml"' in res.headers["Content-Disposition"]
    msg = email.message_from_bytes(res.data, policy=policy.default)
    assert msg["To"] == "jane@acme.com"
    assert msg["X-Unsent"] == "1"
    assert list(msg.iter_attachments()) == []


def test_eml_download_attaches_resume(client, authenticated_request):
    pdf = b"%PDF-1.4 fake"
    fake_res = MagicMock(status_code=200, content=pdf, headers={"content-type": "application/pdf"})
    fake_res.raise_for_status = MagicMock()
    with patch("app.routes.emails.get_db", return_value=_mock_db("https://storage/x.pdf")), \
         patch("app.routes.emails.requests.get", return_value=fake_res), \
         patch("app.routes.emails.validate_fetch_url", side_effect=lambda u: u):
        res = client.post(
            "/api/emails/eml",
            json={"to": "a@b.com", "subject": "Hi", "body": "Text"},
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 200
    msg = email.message_from_bytes(res.data, policy=policy.default)
    atts = list(msg.iter_attachments())
    assert len(atts) == 1 and atts[0].get_filename() == "Resume.pdf"


def test_eml_download_missing_fields_400(client, authenticated_request):
    res = client.post("/api/emails/eml", json={"to": "a@b.com"},
                      headers={"Authorization": "Bearer test"})
    assert res.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_eml_endpoint.py -v`
Expected: FAIL with 404 (route not defined)

- [ ] **Step 3: Implement the route**

Add to `backend/app/routes/emails.py` (after the generate-and-draft route; reuse existing imports — `requests`, `validate_fetch_url`, `_normalize_drive_url` are already imported there):

```python
from flask import Response  # extend the existing flask import line

from app.services.eml_builder import build_eml, eml_filename


@emails_bp.route("/eml", methods=["POST"])
@require_firebase_auth
def download_eml():
    """Build a downloadable .eml draft for users without a connected inbox.

    The frontend posts back the subject/body it received from
    generate-and-draft in fallback mode; the user's resume (from their own
    Firestore doc, never from the request) is attached when available.
    """
    uid = request.firebase_user["uid"]
    payload = request.get_json(silent=True) or {}
    to_addr = (payload.get("to") or "").strip()
    subject = (payload.get("subject") or "").strip()
    body = payload.get("body") or ""
    if not to_addr or not subject or not body:
        return jsonify({"error": "to, subject and body are required"}), 400

    db = get_db()
    user_data = (db.collection("users").document(uid).get().to_dict() or {})

    resume_bytes = None
    resume_ctype = None
    resume_filename = user_data.get("resumeFileName") or "Resume.pdf"
    resume_url = user_data.get("resumeUrl")
    if resume_url:
        try:
            resume_url = validate_fetch_url(_normalize_drive_url(resume_url))
            res = requests.get(resume_url, timeout=15, headers={"User-Agent": "Offerloop/1.0"})
            res.raise_for_status()
            if len(res.content) >= 1024 and b"<html" not in res.content[:2048].lower() \
                    and len(res.content) <= 8 * 1024 * 1024:
                resume_bytes = res.content
                resume_ctype = res.headers.get("content-type", "application/pdf")
        except Exception as e:
            print(f"[EML] resume download failed, sending without attachment: {e}")

    html_body = "".join(
        f'<p style="margin:12px 0; line-height:1.6;">{p.strip()}</p>'
        for p in body.split("\n") if p.strip()
    )
    raw = build_eml(to_addr, subject, body, body_html=html_body,
                    resume_bytes=resume_bytes, resume_filename=resume_filename,
                    resume_ctype=resume_ctype)
    filename = eml_filename(payload.get("firstName"), payload.get("company"))
    return Response(
        raw,
        mimetype="message/rfc822",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_eml_endpoint.py tests/test_eml_builder.py -v`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/emails.py backend/tests/test_eml_endpoint.py
git commit -m "feat(emails): POST /api/emails/eml downloadable draft endpoint"
```

---

### Task 5: Backend hardening: token email may be missing or a relay

**Files:**
- Modify: `backend/app/routes/gmail_oauth.py:56,137` (login_hint), `backend/app/routes/emails.py` (remaining `request.firebase_user.get("email")` uses at ~830, 887), `backend/app/routes/job_board.py:8653,8712,9569`, `backend/app/routes/coffee_chat_prep.py:329`, `backend/app/routes/runs.py:140`, `backend/app/routes/linkedin_import.py:664`, `backend/app/routes/contact_import.py:604`, `backend/app/routes/alumni_discovery_routes.py:163,272`, `backend/app/routes/billing.py` (email reads at ~134,177,241,346,488), `backend/app/services/stripe_client.py:335`
- Test: `backend/tests/test_missing_token_email.py`

(Line numbers are from the branch point; re-grep before editing: `grep -rn "firebase_user.get(\"email\")\|firebase_user\[.email.\]" backend/app/`)

**Interfaces:**
- Produces: no route raises when the Firebase token lacks `email` (Apple can omit it; relays like `@privaterelay.appleid.com` appear otherwise). Preference order anywhere an email identity is needed: Firestore user doc `email` → token email → `""`/omitted.

- [ ] **Step 1: Audit every site**

Run: `grep -rn 'firebase_user.get("email")\|firebase_user\["email"\]' backend/app/ --include='*.py'`

For each hit classify: (a) passed as optional hint/log → verify `None` flows safely (no `.lower()`, `.split()`, f-string into a URL param without guard); (b) used as a real identity (Stripe customer email, signature, outreach) → switch to user-doc-first.

- [ ] **Step 2: Apply the two concrete fixes that are not already None-safe**

`gmail_oauth.py` (both login_hint sites, lines 56 and 137): the surrounding code already does `if user_email:` before setting `params["login_hint"]` — verify, and where absent add the guard:

```python
    if user_email:
        params["login_hint"] = user_email
```

`billing.py` / `stripe_client.py`: where a Stripe customer is created/updated with `email=`, resolve first:

```python
    user_doc_email = (user_data or {}).get("email") or ""
    token_email = (request.firebase_user.get("email") or "")
    billing_email = user_doc_email or token_email  # may be "" — Stripe accepts omission
```

and pass `**({"email": billing_email} if billing_email else {})` where the dict is built. Match each site's local variable names.

- [ ] **Step 3: Write a regression test for the main draft route**

```python
# backend/tests/test_missing_token_email.py
from unittest.mock import patch, MagicMock


def test_generate_and_draft_tolerates_missing_token_email(client, authenticated_request_no_email):
    # authenticated_request_no_email: same as authenticated_request but the
    # decoded token has no "email" key. Add this fixture to conftest.py by
    # copying authenticated_request and deleting the email field.
    with patch("app.routes.emails.get_user_gmail_service_strict", return_value=None), \
         patch("app.routes.emails.get_db") as gdb:
        db = MagicMock()
        doc = MagicMock()
        doc.to_dict.return_value = {"email": "user@icloud.com", "resumeText": "x" * 100}
        db.collection.return_value.document.return_value.get.return_value = doc
        db.collection.return_value.document.return_value.collection.return_value \
          .where.return_value.limit.return_value.stream.return_value = []
        gdb.return_value = db
        res = client.post(
            "/api/emails/generate-and-draft",
            json={"contacts": [{"FirstName": "J", "Email": "j@a.com",
                               "emailSubject": "S", "emailBody": "B"}]},
            headers={"Authorization": "Bearer test"},
        )
    assert res.status_code == 200
```

- [ ] **Step 4: Run the new test plus the full backend suite**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_missing_token_email.py -v && FLASK_ENV=testing pytest tests/ -x -q`
Expected: new test passes; suite green (pre-existing failures on the branch point, if any, noted and unchanged).

- [ ] **Step 5: Commit**

```bash
git add -A backend/
git commit -m "fix(auth): tolerate missing/relay token email across routes"
```

---

### Task 6: Frontend auth context: password + Apple providers

**Files:**
- Modify: `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx` (imports lines 7-16, `AuthContextType` lines 60-70, `signIn` lines 280-338)

**Interfaces:**
- Produces (Task 7 consumes), all returning `Promise<NextRoute>` (`"onboarding" | "home"`) and sharing one post-auth Firestore pipeline:
  - `signIn(opts?: SignInOptions)` — unchanged Google popup (keep name: 10+ call sites).
  - `signInWithApple()` — popup with `new OAuthProvider("apple.com")` + `email`/`name` scopes.
  - `signUpWithEmail(name: string, email: string, password: string)`
  - `signInWithEmail(email: string, password: string)`
  - `resetPassword(email: string): Promise<void>`
- Produces: exported `friendlyAuthError(err: unknown): string` mapping Firebase error codes to plain copy.

- [ ] **Step 1: Extend imports**

```tsx
import {
  User as FirebaseUser,
  signInWithPopup,
  signOut as firebaseSignOut,
  onIdTokenChanged,
  setPersistence,
  browserLocalPersistence,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  UserCredential,
} from "firebase/auth";
```

- [ ] **Step 2: Extract the shared post-auth pipeline**

Refactor the body of `signIn` (lines 294-329: doc get/create/update, sign_up capture, NextRoute) into:

```tsx
const finishSignIn = async (
  result: UserCredential,
  method: "google" | "apple" | "password",
): Promise<NextRoute> => {
  const info = getAdditionalUserInfo(result);
  const uid = result.user.uid;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid,
      email: result.user.email || "",
      name: result.user.displayName || "",
      picture: result.user.photoURL || undefined,
      tier: "free",
      credits: 300,
      maxCredits: 300,
      emailsMonthKey: getMonthKey(),
      emailsUsedThisMonth: 0,
      needsOnboarding: true,
      createdAt: new Date().toISOString(),
      lastSignIn: new Date().toISOString(),
    });
    if (info?.isNewUser) {
      posthog.capture("sign_up", { signup_method: method });
    }
    return "onboarding";
  }
  await updateDoc(ref, { lastSignIn: new Date().toISOString() });
  const data = snap.data() as Partial<User>;
  return (data.needsOnboarding ?? !!info?.isNewUser) ? "onboarding" : "home";
};
```

`signIn` becomes: build Google provider + custom params exactly as today (lines 283-291), then `return await finishSignIn(result, "google")`, keeping the existing try/catch/finally with `setIsLoading`.

- [ ] **Step 3: Add the new methods**

```tsx
const signInWithApple = async (): Promise<NextRoute> => {
  try {
    setIsLoading(true);
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    const result = await signInWithPopup(auth, provider);
    return await finishSignIn(result, "apple");
  } finally {
    setIsLoading(false);
  }
};

const signUpWithEmail = async (name: string, email: string, password: string): Promise<NextRoute> => {
  try {
    setIsLoading(true);
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (name.trim()) {
      await updateProfile(result.user, { displayName: name.trim() });
    }
    // Non-blocking: banner elsewhere, product not gated on verification.
    sendEmailVerification(result.user).catch(() => {});
    return await finishSignIn(result, "password");
  } finally {
    setIsLoading(false);
  }
};

const signInWithEmail = async (email: string, password: string): Promise<NextRoute> => {
  try {
    setIsLoading(true);
    const result = await signInWithEmailAndPassword(auth, email, password);
    return await finishSignIn(result, "password");
  } finally {
    setIsLoading(false);
  }
};

const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);
```

Note: `finishSignIn` uses `result.user.displayName` for the doc `name`; in `signUpWithEmail` the `updateProfile` call runs before `finishSignIn`, so pass the name through: after `updateProfile`, `result.user.displayName` may still be stale on the credential object — set the doc name explicitly by extending `finishSignIn` with an optional `nameOverride?: string` parameter used as `name: nameOverride || result.user.displayName || ""`, and pass `name.trim()` from `signUpWithEmail`.

- [ ] **Step 4: Add the error copy helper (exported from the same file)**

```tsx
export const friendlyAuthError = (err: unknown): string => {
  const code = (err as { code?: string })?.code || "";
  switch (code) {
    case "auth/email-already-in-use":
      return "That email already has an account. Sign in instead, or use Google if you signed up with it.";
    case "auth/account-exists-with-different-credential":
      return "That email is registered with a different sign-in method. Try Google.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    default:
      return "Sign-in failed. Please try again.";
  }
};
```

- [ ] **Step 5: Wire into context**

Extend `AuthContextType` with the four new methods and add them to the provider `value`. Keep `signIn` untouched in the type.

- [ ] **Step 6: Build check + commit**

Run: `cd connect-grow-hire && npm run build`
Expected: build succeeds, no TS errors.

```bash
git add connect-grow-hire/src/contexts/FirebaseAuthContext.tsx
git commit -m "feat(auth): password + Apple providers behind shared post-auth pipeline"
```

---

### Task 7: SignIn page: real forms, provider buttons, no forced Gmail redirect

**Files:**
- Modify: `connect-grow-hire/src/pages/SignIn.tsx`
- Modify: `connect-grow-hire/.env.production` + `connect-grow-hire/.env` if present (add `VITE_ENABLE_APPLE_SIGNIN=false`)

**Interfaces:**
- Consumes: `signIn`, `signInWithApple`, `signUpWithEmail`, `signInWithEmail`, `resetPassword`, `friendlyAuthError` (Task 6).
- Produces: after ANY successful auth, navigation is `next === "onboarding" ? "/onboarding" : "/home"` via existing `forceNavigate`. The Gmail consent step moves to onboarding (Task 8) — remove the forced redirect.

- [ ] **Step 1: Remove the forced Gmail OAuth handoff**

In `handleGoogleAuth` (lines 233-283): delete the `checkNeedsGmailConnection` / `initiateGmailOAuth` branch (lines 252-267) and always `forceNavigate(next === "onboarding" ? "/onboarding" : "/home")`. Keep `initiateGmailOAuth` and `checkNeedsGmailConnection` helpers in the file ONLY if the auto-check effect (lines 108-224) still uses them; the auto-check effect for already-signed-in visitors also stops redirecting to OAuth: simplify it to navigate signed-in users straight to `/home` (or `/onboarding`). Delete the `redirecting` state + overlay (lines 27-28, 293-310) if nothing uses them after this change.

- [ ] **Step 2: Add form state + handlers**

```tsx
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [fullName, setFullName] = useState("");
const [resetSent, setResetSent] = useState(false);

const finishAuth = (next: "onboarding" | "home") =>
  forceNavigate(next === "onboarding" ? "/onboarding" : "/home");

const handleEmailSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (submitting || isLoading) return;
  setSubmitting(true);
  try {
    const next =
      activeTab === "signup"
        ? await signUpWithEmail(fullName, email.trim(), password)
        : await signInWithEmail(email.trim(), password);
    finishAuth(next);
  } catch (err) {
    setSubmitting(false);
    toast({ variant: "destructive", title: "Sign-in failed", description: friendlyAuthError(err) });
  }
};

const handleAppleAuth = async () => {
  if (submitting || isLoading) return;
  setSubmitting(true);
  try {
    finishAuth(await signInWithApple());
  } catch (err) {
    setSubmitting(false);
    toast({ variant: "destructive", title: "Sign-in failed", description: friendlyAuthError(err) });
  }
};

const handleForgotPassword = async () => {
  if (!email.trim()) {
    toast({ title: "Enter your email first", description: "Type your email above, then tap Forgot password." });
    return;
  }
  try {
    await resetPassword(email.trim());
    setResetSent(true);
  } catch (err) {
    toast({ variant: "destructive", title: "Could not send reset email", description: friendlyAuthError(err) });
  }
};
```

- [ ] **Step 3: Layout inside the card (below the tabs, replacing the lone Google button block at lines 440-486)**

Order: email form first, divider, then provider buttons with Google marked Recommended.

```tsx
{/* Email + password form */}
<form onSubmit={handleEmailSubmit} className="space-y-3">
  {activeTab === "signup" && (
    <input
      type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
      placeholder="Full name" autoComplete="name" required
      className="w-full py-3 px-4 rounded-[10px] text-sm"
      style={{ border: "1px solid var(--border-light)", fontFamily: "var(--font-body)", fontSize: "15px" }}
    />
  )}
  <input
    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
    placeholder="Email address" autoComplete="email" required
    className="w-full py-3 px-4 rounded-[10px] text-sm"
    style={{ border: "1px solid var(--border-light)", fontFamily: "var(--font-body)", fontSize: "15px" }}
  />
  <input
    type="password" value={password} onChange={(e) => setPassword(e.target.value)}
    placeholder="Password" required minLength={6}
    autoComplete={activeTab === "signup" ? "new-password" : "current-password"}
    className="w-full py-3 px-4 rounded-[10px] text-sm"
    style={{ border: "1px solid var(--border-light)", fontFamily: "var(--font-body)", fontSize: "15px" }}
  />
  {activeTab === "signin" && (
    <div className="text-right">
      <button type="button" onClick={handleForgotPassword}
        style={{ fontFamily: "var(--font-body)", fontSize: "13px", color: "#2563EB", background: "none", border: "none", cursor: "pointer" }}>
        {resetSent ? "Reset email sent. Check your inbox." : "Forgot password?"}
      </button>
    </div>
  )}
  <button type="submit" disabled={submitting || isLoading}
    className="w-full py-3.5 rounded-[10px] text-sm font-medium transition-all"
    style={{ background: "#2563EB", color: "white", fontFamily: "var(--font-body)", fontSize: "15px", fontWeight: 600, border: "none", cursor: submitting || isLoading ? "not-allowed" : "pointer", opacity: submitting || isLoading ? 0.6 : 1 }}>
    {submitting ? "Working..." : activeTab === "signup" ? "Create account" : "Sign in"}
  </button>
</form>

{/* Divider */}
<div className="flex items-center gap-3 my-5">
  <div style={{ flex: 1, height: 1, background: "var(--border-light)" }} />
  <span style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-tertiary)" }}>or</span>
  <div style={{ flex: 1, height: 1, background: "var(--border-light)" }} />
</div>
```

Then the existing Google button (keep its SVG and styles) with a small "Recommended" pill after the label text:

```tsx
<span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: "11px", fontWeight: 600 }}>
  Recommended
</span>
```

and below it, the Apple button, rendered only when enabled:

```tsx
{import.meta.env.VITE_ENABLE_APPLE_SIGNIN === "true" && (
  <button onClick={handleAppleAuth} disabled={submitting || isLoading}
    className="w-full flex items-center justify-center gap-3 py-3.5 rounded-[10px] text-sm font-medium transition-all mt-3"
    style={{ background: "white", color: "#0F172A", fontFamily: "var(--font-body)", fontSize: "15px", fontWeight: 600, border: "1px solid var(--border-light)", cursor: submitting || isLoading ? "not-allowed" : "pointer" }}>
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
    Continue with Apple
  </button>
)}
```

- [ ] **Step 4: Update trust copy (lines 488-544)**

Replace the Gmail-specific paragraph with provider-neutral copy, keeping the check-item list structure:

- paragraph: `"Use any email. Connecting Gmail later puts drafts directly in your inbox."`
- items: `"Works with any email address"`, `"We never send emails without your permission"`, `"You review and send everything yourself"`

- [ ] **Step 5: Env flag**

Add `VITE_ENABLE_APPLE_SIGNIN=false` to `connect-grow-hire/.env.production` (and `.env` if the file exists). Flip to `true` after Nick completes Apple Developer + Firebase console setup.

- [ ] **Step 6: Build + manual check + commit**

Run: `cd connect-grow-hire && npm run build` — must pass.
Manual: `npm run dev`, open `http://localhost:8080/signin` — form renders on both tabs, Google button shows Recommended pill, Apple hidden.

```bash
git add connect-grow-hire/src/pages/SignIn.tsx connect-grow-hire/.env.production
git commit -m "feat(signin): email+password form, Apple button (flagged), no forced Gmail redirect"
```

---

### Task 8: Onboarding "Connect your inbox" step

**Files:**
- Create: `connect-grow-hire/src/pages/OnboardingInbox.tsx`
- Modify: `connect-grow-hire/src/pages/OnboardingFlow.tsx` (`Step` type line 34, `STEP_INDEX` line 36, handlers lines 94-131, step rendering switch)
- Modify: `connect-grow-hire/src/services/api.ts` (no change needed: `startGmailOAuth` + `gmailStatus` already exist, lines 1704/1714)

**Interfaces:**
- Consumes: `apiService.startGmailOAuth()`, `apiService.gmailStatus()`; popup pattern copied from `SignIn.tsx` `initiateGmailOAuth(autoClose=true)` (lines 63-84 pre-Task-7).
- Produces: new step `"inbox"` between `"intent"` and `"trial"`; `STEP_INDEX` gives `inbox: 3` sharing the rail slot with `trial` (like `manual` shares `source`). On skip, `completeOnboarding` payload gains `inboxConnectSkipped: true` (Task 10 reads it from the user doc).

- [ ] **Step 1: Create `OnboardingInbox.tsx`**

```tsx
// src/pages/OnboardingInbox.tsx
// Optional inbox-connect step. Gmail is the recommended path: drafts are
// written directly into the user's Gmail. Skipping is fine: emails are
// delivered as downloadable drafts instead.
import React, { useState } from "react";
import { Mail, Download, Check } from "lucide-react";
import { apiService } from "@/services/api";

export interface InboxStepResult {
  connected: boolean;
  skipped: boolean;
}

interface Props {
  onNext: (result: InboxStepResult) => void;
  onBack: () => void;
}

const OnboardingInbox: React.FC<Props> = ({ onNext, onBack }) => {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  const handleConnectGmail = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const authUrl = await apiService.startGmailOAuth();
      if (!authUrl) throw new Error("no auth url");
      const popup = window.open(authUrl, `gmail-oauth-${Date.now()}`,
        "width=600,height=700,scrollbars=yes,resizable=yes");
      if (!popup) { setConnecting(false); return; }
      const timer = setInterval(async () => {
        if (popup.closed) {
          clearInterval(timer);
          try {
            const status = await apiService.gmailStatus();
            setConnected(!!status.connected);
            if (status.connected) onNext({ connected: true, skipped: false });
          } finally {
            setConnecting(false);
          }
        }
      }, 500);
    } catch {
      setConnecting(false);
    }
  };

  return (
    <div className="w-full max-w-[520px] mx-auto">
      <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "32px", fontWeight: 400, color: "var(--text-primary)", marginBottom: "8px" }}>
        Where should your drafts go?
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: "15px", color: "var(--text-secondary)", marginBottom: "28px" }}>
        Offerloop writes personalized outreach emails for you. Pick how you want to receive them.
      </p>

      <button onClick={handleConnectGmail} disabled={connecting || connected}
        className="w-full flex items-start gap-4 p-5 rounded-[12px] text-left transition-all mb-3"
        style={{ border: "2px solid #2563EB", background: "rgba(59,130,246,0.04)", cursor: "pointer" }}>
        <Mail className="h-6 w-6 mt-0.5" style={{ color: "#2563EB" }} />
        <div>
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: "var(--font-body)", fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
              {connected ? "Gmail connected" : connecting ? "Waiting for Google..." : "Connect Gmail"}
            </span>
            <span style={{ padding: "2px 8px", borderRadius: 999, background: "#2563EB", color: "white", fontSize: "11px", fontWeight: 600 }}>
              Recommended
            </span>
            {connected && <Check className="h-4 w-4" style={{ color: "#16A34A" }} />}
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Drafts appear directly in your Gmail, ready to review and send. Works with any Gmail account, even if you signed up with a different email.
          </p>
        </div>
      </button>

      <button onClick={() => onNext({ connected: false, skipped: true })}
        className="w-full flex items-start gap-4 p-5 rounded-[12px] text-left transition-all"
        style={{ border: "1px solid var(--border-light)", background: "var(--bg-white)", cursor: "pointer" }}>
        <Download className="h-6 w-6 mt-0.5" style={{ color: "var(--text-tertiary)" }} />
        <div>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
            Skip for now
          </span>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Your emails arrive as one-tap downloads that open in any mail app, resume attached. You can connect Gmail anytime from Settings.
          </p>
        </div>
      </button>

      <button onClick={onBack} className="mt-6"
        style={{ fontFamily: "var(--font-body)", fontSize: "14px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }}>
        Back
      </button>
    </div>
  );
};

export default OnboardingInbox;
```

Match the actual step-component conventions in `OnboardingFlow.tsx` (how `OnboardingIntent` etc. receive props and render inside the rail layout) — mirror whatever wrapper the sibling steps use.

- [ ] **Step 2: Wire into `OnboardingFlow.tsx`**

- Line 34: `type Step = "profile" | "source" | "manual" | "intent" | "inbox" | "trial";`
- Line 36: `const STEP_INDEX: Record<Step, number> = { profile: 0, source: 1, manual: 1, intent: 2, inbox: 3, trial: 3 };`
- State: `const [inboxResult, setInboxResult] = useState<InboxStepResult | null>(null);`
- `handleIntent` (line 111-115): `setCurrentStep("inbox")` instead of `"trial"`.
- New handler:

```tsx
const handleInbox = (result: InboxStepResult) => {
  setInboxResult(result);
  logOnboardingEvent("completed", "inbox", result.skipped);
  setCurrentStep("trial");
};
```

- `handleBack` (lines 117-131): `inbox` goes back to `intent`; `trial` goes back to `inbox`.
- `buildFinalData` return (line 157-184): add `...(inboxResult?.skipped ? { inboxConnectSkipped: true } : {}),`
- Render the step where the others render, passing `onNext={handleInbox}` and `onBack={handleBack}`.

- [ ] **Step 3: Build + manual check + commit**

Run: `cd connect-grow-hire && npm run build` — must pass.
Manual: run onboarding as a fresh user; inbox step appears after intent; Skip proceeds to trial; Connect opens the Google popup.

```bash
git add connect-grow-hire/src/pages/OnboardingInbox.tsx connect-grow-hire/src/pages/OnboardingFlow.tsx
git commit -m "feat(onboarding): optional Connect-your-inbox step, Gmail recommended"
```

---

### Task 9: Frontend fallback draft delivery (download / copy) + api method

**Files:**
- Create: `connect-grow-hire/src/components/DraftDeliveryActions.tsx`
- Modify: `connect-grow-hire/src/services/api.ts` (next to `generateAndDraftEmails`, line 1488)
- Modify: `connect-grow-hire/src/pages/ContactSearchPage.tsx:3413-3420` (draft link block), `connect-grow-hire/src/components/jobs/FindHumansModal.tsx:151`, `connect-grow-hire/src/pages/NetworkTracker.tsx:225`, `connect-grow-hire/src/components/tracker/ActionBar.tsx:68`, `connect-grow-hire/src/components/NotificationBell.tsx:49`

**Interfaces:**
- Consumes: Task 3's response contract (`deliveryMode`, fallback drafts carry `subject`/`body`, no `gmailUrl`); Task 4's endpoint.
- Produces:
  - `apiService.downloadEml(payload: { to: string; subject: string; body: string; firstName?: string; company?: string }): Promise<void>` — fetches the file and triggers the browser download.
  - `<DraftDeliveryActions draft={{ to, subject, body, gmailUrl?, firstName?, company? }} />` — renders "Open in Gmail" when `gmailUrl` exists, else "Download draft" + "Copy email".
  - Update `generateAndDraftEmails` return type (line 1497-1499): add `deliveryMode?: "gmail" | "fallback"` top-level and `deliveryMode?: string` per draft; `draftId` becomes optional.

- [ ] **Step 1: api.ts additions**

```tsx
  /** Download a .eml draft file (fallback delivery for users without Gmail). */
  async downloadEml(payload: { to: string; subject: string; body: string; firstName?: string; company?: string }): Promise<void> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/emails/eml`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Could not build the email file");
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const filename = /filename="([^"]+)"/.exec(cd)?.[1] || "Outreach.eml";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
```

Check how other api.ts methods build URLs (`this.makeRequest` wraps JSON; raw fetch is needed here for the blob — follow the file's existing pattern for `BACKEND_URL`/base path; if the class uses a `baseUrl` field, use that instead).

Update the `generateAndDraftEmails` return type as specified in Interfaces.

- [ ] **Step 2: `DraftDeliveryActions.tsx`**

```tsx
// src/components/DraftDeliveryActions.tsx
// One component so every draft surface renders delivery identically:
// native Gmail link when a draft exists, download/copy otherwise.
import React, { useState } from "react";
import { ExternalLink, Download, Copy, Check } from "lucide-react";
import { apiService } from "@/services/api";
import { useToast } from "@/hooks/use-toast";

export interface DeliverableDraft {
  to: string;
  subject?: string;
  body?: string;
  gmailUrl?: string;
  firstName?: string;
  company?: string;
}

const DraftDeliveryActions: React.FC<{ draft: DeliverableDraft; size?: "sm" | "md" }> = ({ draft, size = "sm" }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pad = size === "sm" ? "6px 10px" : "10px 16px";
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: pad,
    borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
    border: "1px solid var(--border-light)", background: "var(--bg-white)",
    color: "#2563EB", cursor: "pointer", textDecoration: "none",
  };

  if (draft.gmailUrl) {
    return (
      <a href={draft.gmailUrl} target="_blank" rel="noopener noreferrer" style={base}>
        <ExternalLink className="h-3.5 w-3.5" /> Open in Gmail
      </a>
    );
  }
  if (!draft.subject || !draft.body) return null;

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apiService.downloadEml({
        to: draft.to, subject: draft.subject!, body: draft.body!,
        firstName: draft.firstName, company: draft.company,
      });
      toast({ title: "Draft downloaded", description: "Open the file and it appears in your mail app, resume attached." });
    } catch {
      toast({ variant: "destructive", title: "Download failed", description: "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span style={{ display: "inline-flex", gap: 8 }}>
      <button onClick={download} disabled={busy} style={base}>
        <Download className="h-3.5 w-3.5" /> {busy ? "Building..." : "Download draft"}
      </button>
      <button onClick={copy} style={{ ...base, color: "var(--text-secondary)" }}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy email"}
      </button>
    </span>
  );
};

export default DraftDeliveryActions;
```

- [ ] **Step 3: Update the surfaces**

Each surface currently renders an anchor to `gmailUrl`/`gmailDraftUrl` only when present. Replace with `DraftDeliveryActions`, passing what the surface has:

- `ContactSearchPage.tsx:3413`: contact rows have `c.gmailDraftUrl`, `c.emailSubject`, `c.emailBody`, `c.Email`, `c.FirstName`, `c.Company`. Render `<DraftDeliveryActions draft={{ to: c.Email || c.email, subject: c.emailSubject, body: c.emailBody, gmailUrl: c.gmailDraftUrl, firstName: c.FirstName, company: c.Company }} />` in place of the existing `{!isSent && c.gmailDraftUrl && (<a ...>)}` block (keep the `!isSent` guard).
- `FindHumansModal.tsx:151`: draft state holds `gmailUrl`, `subject`; extend the state at line ~409 to also keep `body: d.body, deliveryMode: d.deliveryMode` from the response, then render `DraftDeliveryActions` instead of the hardcoded `href={draft.gmailUrl || "https://mail.google.com/..."}` anchor.
- `NetworkTracker.tsx:225`, `ActionBar.tsx:68`, `NotificationBell.tsx:49`: same substitution pattern; where only a URL exists today and no subject/body is at hand, `DraftDeliveryActions` renders nothing for fallback users — acceptable for these Gmail-centric tracker surfaces (tracker requires Gmail anyway).

- [ ] **Step 4: Build + commit**

Run: `cd connect-grow-hire && npm run build` — must pass.

```bash
git add connect-grow-hire/src/components/DraftDeliveryActions.tsx connect-grow-hire/src/services/api.ts connect-grow-hire/src/pages/ContactSearchPage.tsx connect-grow-hire/src/components/jobs/FindHumansModal.tsx connect-grow-hire/src/pages/NetworkTracker.tsx connect-grow-hire/src/components/tracker/ActionBar.tsx connect-grow-hire/src/components/NotificationBell.tsx
git commit -m "feat(drafts): universal download/copy delivery on all draft surfaces"
```

---

### Task 10: Inbox-connect nudge on fallback drafts

**Files:**
- Create: `connect-grow-hire/src/components/InboxConnectNudge.tsx`
- Modify: `connect-grow-hire/src/pages/ContactSearchPage.tsx` (draft results area, after the `generateAndDraftEmails` call at line 359), `connect-grow-hire/src/components/jobs/FindHumansModal.tsx` (results area, response handling at line ~397)

**Interfaces:**
- Consumes: `useFirebaseAuth()` for `user.email`; `apiService.startGmailOAuth`/`gmailStatus` (popup pattern from Task 8).
- Produces: `<InboxConnectNudge />` — renders nothing until a surface reports fallback mode (`show` prop), then a dismissible inline banner. Dismissal persists per session: `sessionStorage["inbox_nudge_dismissed"] = "1"`.

- [ ] **Step 1: Component**

```tsx
// src/components/InboxConnectNudge.tsx
// Shown when drafts were delivered in fallback mode. Suggests the right
// integration for the user's email domain. Session-dismissible: reappears
// on the next session's first fallback draft, by design.
import React, { useState } from "react";
import { Mail, X } from "lucide-react";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { apiService } from "@/services/api";

const GOOGLE_DOMAINS = ["gmail.com", "googlemail.com"];
const MICROSOFT_DOMAINS = ["outlook.com", "hotmail.com", "live.com", "msn.com"];

const InboxConnectNudge: React.FC<{ show: boolean }> = ({ show }) => {
  const { user } = useFirebaseAuth();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("inbox_nudge_dismissed") === "1");
  const [connecting, setConnecting] = useState(false);

  if (!show || dismissed) return null;

  const domain = (user?.email || "").split("@")[1]?.toLowerCase() || "";
  const isGoogle = GOOGLE_DOMAINS.includes(domain);
  const isMicrosoft = MICROSOFT_DOMAINS.includes(domain);

  const dismiss = () => {
    sessionStorage.setItem("inbox_nudge_dismissed", "1");
    setDismissed(true);
  };

  const connectGmail = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const authUrl = await apiService.startGmailOAuth();
      if (authUrl) window.open(authUrl, `gmail-oauth-${Date.now()}`, "width=600,height=700");
    } finally {
      setConnecting(false);
    }
  };

  const headline = isGoogle
    ? "Put these drafts straight into your Gmail"
    : isMicrosoft
      ? "Outlook drafts are coming soon"
      : "Your drafts arrive as downloads";
  const detail = isGoogle
    ? "Connect Gmail once and every draft appears in your inbox, ready to send."
    : isMicrosoft
      ? "For now, download your drafts or connect a Gmail account if you have one."
      : "Each file opens in your mail app with your resume attached. Have a Gmail? Connect it for drafts written directly to your inbox.";

  return (
    <div className="flex items-start gap-3 p-4 rounded-[10px] mb-4"
      style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)" }}>
      <Mail className="h-5 w-5 mt-0.5" style={{ color: "#2563EB" }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{headline}</p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{detail}</p>
        {(isGoogle || !isMicrosoft) && (
          <button onClick={connectGmail} disabled={connecting} className="mt-2"
            style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "#2563EB", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {connecting ? "Opening Google..." : "Connect Gmail"}
          </button>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default InboxConnectNudge;
```

- [ ] **Step 2: Wire into the two draft-generation surfaces**

In `ContactSearchPage.tsx`: add state `const [fallbackDelivery, setFallbackDelivery] = useState(false);`; after the `generateAndDraftEmails` response (line ~359-380) set `setFallbackDelivery((res as any).deliveryMode === "fallback")`; render `<InboxConnectNudge show={fallbackDelivery} />` above the results table/list where drafts render.

In `FindHumansModal.tsx`: same pattern around the call at line ~397, rendered at the top of the drafts section.

- [ ] **Step 3: Build + commit**

Run: `cd connect-grow-hire && npm run build` — must pass.

```bash
git add connect-grow-hire/src/components/InboxConnectNudge.tsx connect-grow-hire/src/pages/ContactSearchPage.tsx connect-grow-hire/src/components/jobs/FindHumansModal.tsx
git commit -m "feat(drafts): domain-aware inbox-connect nudge on fallback delivery"
```

---

### Task 11: Account Settings: Integrations section + skip badge

**Files:**
- Modify: `connect-grow-hire/src/pages/AccountSettings.tsx` (nav item line 111, section lines 2445-2560)
- Modify: `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx` (`User` interface lines 31-52: add `inboxConnectSkipped?: boolean;` and include it where the user doc is mapped in `loadUserData`)

**Interfaces:**
- Consumes: `inboxConnectSkipped` written by onboarding (Task 8); existing `gmailConnected`/`gmailEmail` state in AccountSettings.
- Produces: section renamed to "Integrations"; when disconnected, copy states fallback mode; blue dot on the nav item while `user.inboxConnectSkipped && !gmailConnected`; visiting the section clears the flag (Firestore `updateDoc users/{uid} { inboxConnectSkipped: false }`).

- [ ] **Step 1: Rename and generalize**

- Line 111: `{ id: 'gmail', label: 'Integrations', icon: Mail },` (keep `id: 'gmail'` so deep links/scroll anchors keep working).
- Section title (line 2449): `title="Integrations"`, description: `"Connect your inbox so Offerloop can write drafts directly into it"`.
- Inside the section, label the existing card "Gmail" (it already shows Connected/Not connected states). Below it add a static teaser row, same card styling, no buttons: title `Outlook`, body `Coming soon. Until then, drafts arrive as downloadable files that open in any mail app.`
- Disconnected Gmail copy (line 2498): `"Not connected. Your drafts arrive as downloadable files. Connect Gmail to have them written directly into your inbox."`

- [ ] **Step 2: Skip badge + clear-on-visit**

- In the sidebar nav render, next to the Integrations label: `{user?.inboxConnectSkipped && !gmailConnected && (<span style={{ width: 8, height: 8, borderRadius: 999, background: '#2563EB', display: 'inline-block', marginLeft: 6 }} />)}`
- Add an effect: when the Integrations section becomes the active/visible section and `user?.inboxConnectSkipped`, call `updateDoc(doc(db, "users", user.uid), { inboxConnectSkipped: false })` (follow how AccountSettings already writes user fields — it may use `updateUser` from the auth context; prefer `updateUser({ inboxConnectSkipped: false } as any)` if that helper persists to Firestore).

- [ ] **Step 3: Build + commit**

Run: `cd connect-grow-hire && npm run build` — must pass.

```bash
git add connect-grow-hire/src/pages/AccountSettings.tsx connect-grow-hire/src/contexts/FirebaseAuthContext.tsx
git commit -m "feat(settings): Integrations section with fallback copy and skip badge"
```

---

### Task 12: Full verification + manual setup checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-07-21-multi-provider-auth-design.md` (mark Phase 1 shipped when done)

- [ ] **Step 1: Full backend suite**

Run: `cd backend && FLASK_ENV=testing pytest tests/ -q`
Expected: green (any pre-existing branch-point failures documented in the task notes, not introduced).

- [ ] **Step 2: Frontend build**

Run: `cd connect-grow-hire && npm run build`
Expected: success.

- [ ] **Step 3: Manual QA flows (dev servers: `python3 backend/wsgi.py` + `npm run dev`)**

1. Create account with a non-Gmail email + password → onboarding shows inbox step → Skip → complete onboarding → Find contacts → draft emails → results show Download draft / Copy email + nudge → download opens in a mail client as editable draft with resume attached.
2. Google sign-in with Gmail connected → draft flow unchanged: "Open in Gmail" links work.
3. Sign out / sign in with the password account → "Forgot password" sends the reset email.
4. Settings → Integrations shows the right state in both modes; badge shows for the skipped user and clears on visit.

- [ ] **Step 4: Nick's manual checklist (blockers for production, not for merge)**

- Firebase console → Authentication → Sign-in method → enable **Email/Password**.
- (Optional now) Apple: Apple Developer account → Services ID + Sign in with Apple key → configure the Apple provider in Firebase console → set `VITE_ENABLE_APPLE_SIGNIN=true`.
- Verify the password-reset and verification email templates in Firebase console (Authentication → Templates) say Offerloop.

- [ ] **Step 5: Commit any final fixes and stop**

Per repo rules: push/PR only when Nick says so (PR target: `upstream` main; deploy flow is Final_offerloop main via PR).

---

## Self-review notes

- Spec coverage: 1a→Tasks 6-7, 1b→Tasks 1-4, 1c→Task 8, 1d→Task 5, 1e→Task 9, 1f→Task 12 checklist, 1g→Tasks 10-11. Phase 2 (Outlook) intentionally excluded: separate plan after Phase 1 ships.
- Line numbers are anchors from `945a79c`; executors must re-verify with grep before editing (files are large and drift).
- Frontend has no test framework (global constraint): frontend tasks verify via build + scripted manual QA in Task 12.
