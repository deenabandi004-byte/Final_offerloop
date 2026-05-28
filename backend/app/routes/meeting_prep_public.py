"""Public, anonymous meeting-prep routes (lead magnet).

Mounted at /api/tools/meeting-prep. No auth, no credits, no user-doc
writes. The widget posts a pasted LinkedIn URL; we PDL-enrich the
person, run Perplexity research, synthesize a question/tips bundle via
OpenAI, and ship a PDF.

Status is persisted to a top-level Firestore collection
(meeting_preps_public) so it survives worker restarts and works across
multiple gunicorn workers. The existing authenticated /api/coffee-chat-prep
flow is completely untouched.

Anti-abuse:
    - Email gate before generate (captured to lead_magnet_emails)
    - IP rate limit: 1 successful PDF per sha256(ip) per 24h, stored in
      Firestore collection `meeting_prep_public_ip_quota`. The quota is
      only stamped on success, so failed runs don't burn the day.

Endpoints:
    POST /api/tools/meeting-prep/capture-email      -> {ok: true}
    POST /api/tools/meeting-prep/generate           -> {prep_id, status}
    GET  /api/tools/meeting-prep/status/<prep_id>   -> status dict
    GET  /api/tools/meeting-prep/download/<prep_id> -> 302 -> PDF
    GET  /api/tools/meeting-prep/health             -> liveness
"""
from __future__ import annotations

import hashlib
import logging
import re
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from firebase_admin import firestore, storage
from flask import Blueprint, jsonify, redirect, request

from app.extensions import get_db
from app.services.meeting_prep_public.pdf_generator import (
    generate_public_meeting_prep_pdf,
)
from app.services.meeting_prep_public.prep_generator import (
    collect_citations,
    enrich_contact,
    gather_research,
    synthesize_insights,
)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
LINKEDIN_RE = re.compile(r"linkedin\.com/(in|pub)/[^/?\s]+", re.IGNORECASE)

logger = logging.getLogger(__name__)

meeting_prep_public_bp = Blueprint(
    "meeting_prep_public",
    __name__,
    url_prefix="/api/tools/meeting-prep",
)


# ── Firestore status store ───────────────────────────────────────────

_STATUS_COLLECTION = "meeting_preps_public"
_IP_QUOTA_COLLECTION = "meeting_prep_public_ip_quota"
_LEADS_COLLECTION = "lead_magnet_emails"
_IP_QUOTA_WINDOW_HOURS = 24


def _doc(prep_id: str):
    return get_db().collection(_STATUS_COLLECTION).document(prep_id)


def _new_status() -> dict[str, Any]:
    return {
        "status": "queued",
        "progress": "Queued...",
        "progressPercent": 0,
        "currentStep": 0,
        "totalSteps": 5,
        "error": None,
        "pdf_url": None,
        "pdf_storage_path": None,
        "contactSummary": None,
        "created_at": firestore.SERVER_TIMESTAMP,
    }


def _create_status(prep_id: str) -> None:
    _doc(prep_id).set(_new_status())


def _update_status(prep_id: str, **fields) -> None:
    try:
        _doc(prep_id).update(fields)
    except Exception:
        logger.warning("Failed to update public meeting prep %s", prep_id, exc_info=True)


def _get_status(prep_id: str) -> dict[str, Any] | None:
    snap = _doc(prep_id).get()
    if not snap.exists:
        return None
    return snap.to_dict()


# ── Input helpers ────────────────────────────────────────────────────


def _read_field(name: str) -> str:
    """Read a field from either a JSON body or multipart form."""
    payload = request.get_json(silent=True) or {}
    value = payload.get(name)
    if value is None:
        value = request.form.get(name)
    return (value or "").strip() if isinstance(value, str) else ""


def _is_valid_linkedin(url: str) -> bool:
    if not url:
        return False
    return bool(LINKEDIN_RE.search(url))


def _client_ip() -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()


# ── IP rate limit ────────────────────────────────────────────────────


def _check_ip_quota(ip: str) -> tuple[bool, int]:
    """Return (allowed, seconds_until_reset). When allowed=True the
    second value is 0. The quota is only stamped on success, so a 429
    here means an IP got a PDF successfully within the last 24h."""
    from app.utils.public_ratelimit_bypass import public_ratelimits_disabled
    if public_ratelimits_disabled():
        return True, 0
    db = get_db()
    if db is None:
        return True, 0
    try:
        snap = db.collection(_IP_QUOTA_COLLECTION).document(_ip_hash(ip)).get()
        if not snap.exists:
            return True, 0
        data = snap.to_dict() or {}
        last_success = data.get("last_success_at")
        if last_success is None:
            return True, 0
        # Firestore Timestamp -> datetime
        if hasattr(last_success, "isoformat"):
            last_dt = last_success
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
        else:
            return True, 0
        elapsed = datetime.now(timezone.utc) - last_dt
        window = timedelta(hours=_IP_QUOTA_WINDOW_HOURS)
        if elapsed >= window:
            return True, 0
        remaining = window - elapsed
        return False, int(remaining.total_seconds())
    except Exception:
        logger.warning("IP quota lookup failed; allowing request", exc_info=True)
        return True, 0


def _stamp_ip_quota(ip: str, prep_id: str) -> None:
    db = get_db()
    if db is None:
        return
    try:
        db.collection(_IP_QUOTA_COLLECTION).document(_ip_hash(ip)).set({
            "last_success_at": firestore.SERVER_TIMESTAMP,
            "last_prep_id": prep_id,
        })
    except Exception:
        logger.warning("IP quota stamp failed for %s", prep_id, exc_info=True)


# ── Lead capture ─────────────────────────────────────────────────────


def _capture_lead(
    *,
    email: str,
    source: str | None,
    prep_id: str,
    linkedin_url: str,
) -> str | None:
    db = get_db()
    if not db:
        return None
    try:
        ref = db.collection(_LEADS_COLLECTION).add({
            "email": email.lower().strip(),
            "tool": "meeting-prep",
            "source": (source or "unknown").strip()[:120],
            "prep_id": prep_id,
            "linkedin_url": linkedin_url[:500],
            "contact_name": None,
            "contact_company": None,
            "created_at": firestore.SERVER_TIMESTAMP,
            "ip": _client_ip(),
            "user_agent": (request.headers.get("User-Agent") or "")[:300],
            "referer": (request.headers.get("Referer") or "")[:300],
        })
        doc_ref = ref[1] if isinstance(ref, tuple) else ref
        return getattr(doc_ref, "id", None)
    except Exception as exc:
        logger.warning("Lead capture failed: %s", exc)
        return None


def _enrich_lead(lead_doc_id: str | None, *, contact_name: str, contact_company: str) -> None:
    if not lead_doc_id:
        return
    db = get_db()
    if not db:
        return
    try:
        db.collection(_LEADS_COLLECTION).document(lead_doc_id).update({
            "contact_name": contact_name or None,
            "contact_company": contact_company or None,
        })
    except Exception as exc:
        logger.warning("Lead enrichment failed for %s: %s", lead_doc_id, exc)


# ── PDF upload ───────────────────────────────────────────────────────


def _upload_pdf(prep_id: str, pdf_bytes: bytes) -> dict:
    bucket = storage.bucket()
    blob_path = f"meeting_preps_public/{prep_id}.pdf"
    blob = bucket.blob(blob_path)
    blob.upload_from_string(pdf_bytes, content_type="application/pdf")
    try:
        blob.make_public()
        pdf_url = blob.public_url
    except Exception as exc:
        logger.info("make_public failed for %s, signing URL instead: %s", blob_path, exc)
        pdf_url = blob.generate_signed_url(expiration=timedelta(hours=24))
    return {"pdf_url": pdf_url, "pdf_storage_path": blob_path}


# ── Background worker ────────────────────────────────────────────────


def _process_background(
    prep_id: str,
    linkedin_url: str,
    ip: str,
    lead_doc_id: str | None,
) -> None:
    start_total = time.time()
    try:
        # Step 1: PDL enrichment
        _update_status(
            prep_id,
            status="enriching",
            progress="Looking up the LinkedIn profile...",
            progressPercent=15,
            currentStep=1,
        )
        contact_data = enrich_contact(linkedin_url)
        if not contact_data:
            _update_status(
                prep_id,
                status="failed",
                error=(
                    "We couldn't find that LinkedIn profile in our data. "
                    "Double-check the URL is a public profile (linkedin.com/in/...) "
                    "and try again."
                ),
            )
            return

        contact_name = contact_data.get("fullName") or ""
        contact_company = contact_data.get("company") or ""
        contact_title = contact_data.get("jobTitle") or ""
        logger.info(
            "Public meeting prep %s: enriched %s (%s at %s)",
            prep_id, contact_name, contact_title, contact_company,
        )
        _update_status(prep_id, contactSummary={
            "name": contact_name,
            "jobTitle": contact_title,
            "company": contact_company,
            "location": contact_data.get("location") or "",
        })
        _enrich_lead(lead_doc_id, contact_name=contact_name, contact_company=contact_company)

        # Step 2: Perplexity research
        _update_status(
            prep_id,
            status="researching",
            progress=f"Researching {contact_company or 'the company'}...",
            progressPercent=40,
            currentStep=2,
        )
        research = gather_research(contact_data)

        # Step 3: OpenAI synthesis
        _update_status(
            prep_id,
            status="synthesizing",
            progress="Drafting smart questions and tips...",
            progressPercent=65,
            currentStep=3,
        )
        insights = synthesize_insights(contact_data, research)

        # Step 4: PDF
        _update_status(
            prep_id,
            progress="Building your PDF...",
            progressPercent=85,
            currentStep=4,
        )
        citations = collect_citations(research)
        pdf_buf = generate_public_meeting_prep_pdf(
            prep_id=prep_id,
            contact_data=contact_data,
            insights=insights,
            citations=citations,
        )
        pdf_bytes = pdf_buf.getvalue()

        # Step 5: upload + done
        upload = _upload_pdf(prep_id, pdf_bytes)
        elapsed = time.time() - start_total
        logger.info("Public meeting prep %s: completed in %.1fs", prep_id, elapsed)
        _update_status(
            prep_id,
            status="completed",
            progress="Ready to download.",
            progressPercent=100,
            currentStep=5,
            pdf_url=upload["pdf_url"],
            pdf_storage_path=upload["pdf_storage_path"],
        )
        # Only stamp the IP quota on success.
        _stamp_ip_quota(ip, prep_id)
    except Exception as exc:
        logger.exception("Public meeting prep %s: background failure", prep_id)
        _update_status(prep_id, status="failed", error=str(exc) or "Unexpected error.")


# ── Routes ───────────────────────────────────────────────────────────


@meeting_prep_public_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "meeting_prep_public"})


@meeting_prep_public_bp.route("/capture-email", methods=["POST"])
def capture_email():
    """Legacy email-gate endpoint, parallels cover_letter_public. The
    widget captures email + linkedin_url together at /generate; this
    endpoint exists for standalone-page email gates that want to record
    the lead before kicking off the heavier call."""
    email = _read_field("email")
    source = _read_field("source") or "standalone-tools-email-gate"
    if not email or not EMAIL_RE.match(email):
        return jsonify({"error": "invalid_email", "message": "Please enter a valid email address."}), 400

    db = get_db()
    if db is not None:
        try:
            db.collection(_LEADS_COLLECTION).add({
                "email": email.lower(),
                "tool": "meeting-prep",
                "source": (source or "unknown")[:120],
                "stage": "email-gate",
                "created_at": firestore.SERVER_TIMESTAMP,
                "ip": _client_ip(),
                "user_agent": (request.headers.get("User-Agent") or "")[:300],
                "referer": (request.headers.get("Referer") or "")[:300],
            })
        except Exception:
            logger.warning("capture_email write failed", exc_info=True)
    return jsonify({"ok": True})


@meeting_prep_public_bp.route("/generate", methods=["POST"])
def generate():
    linkedin_url = _read_field("linkedin_url")
    if not linkedin_url:
        return jsonify({"error": "linkedin_url is required"}), 400
    if len(linkedin_url) > 500:
        return jsonify({"error": "linkedin_url is too long"}), 400
    if not _is_valid_linkedin(linkedin_url):
        return jsonify({
            "error": "invalid_linkedin_url",
            "message": "Paste a full LinkedIn profile URL, e.g. https://www.linkedin.com/in/jane-doe",
        }), 400

    email = _read_field("email")
    source = _read_field("source") or None
    if email and not EMAIL_RE.match(email):
        return jsonify({"error": "valid email required"}), 400

    # IP rate limit (1 successful PDF per IP per 24h)
    ip = _client_ip()
    allowed, retry_after = _check_ip_quota(ip)
    if not allowed:
        hours_remaining = max(1, retry_after // 3600)
        resp = jsonify({
            "error": "rate_limited",
            "message": (
                "You've already generated a free meeting prep from this network "
                f"in the last 24 hours. Try again in about {hours_remaining} hour(s), "
                "or create a free account at offerloop.ai for unlimited preps."
            ),
            "retry_after_seconds": retry_after,
        })
        resp.status_code = 429
        resp.headers["Retry-After"] = str(retry_after)
        return resp

    prep_id = uuid.uuid4().hex
    _create_status(prep_id)
    if source:
        _update_status(prep_id, source=source)

    lead_doc_id: str | None = None
    if email:
        lead_doc_id = _capture_lead(
            email=email,
            source=source,
            prep_id=prep_id,
            linkedin_url=linkedin_url,
        )

    thread = threading.Thread(
        target=_process_background,
        args=(prep_id, linkedin_url, ip, lead_doc_id),
        daemon=True,
        name=f"public-meeting-prep-{prep_id[:8]}",
    )
    thread.start()

    return jsonify({"prep_id": prep_id, "status": "queued"})


def _json_safe(value):
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    return value


@meeting_prep_public_bp.route("/status/<prep_id>", methods=["GET"])
def status(prep_id: str):
    entry = _get_status(prep_id)
    if entry is None:
        return jsonify({"error": "not_found"}), 404
    entry = {k: _json_safe(v) for k, v in entry.items()}
    return jsonify(entry)


@meeting_prep_public_bp.route("/download/<prep_id>", methods=["GET"])
def download(prep_id: str):
    entry = _get_status(prep_id)
    if entry is None:
        return jsonify({"error": "not_found"}), 404
    if entry.get("status") != "completed" or not entry.get("pdf_url"):
        return jsonify({"error": "not_ready", "status": entry.get("status")}), 409
    return redirect(entry["pdf_url"], code=302)
