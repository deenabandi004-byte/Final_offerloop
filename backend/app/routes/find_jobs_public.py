"""Public, anonymous Find-Jobs routes (lead magnet).

Mounted at /api/tools/find-jobs. No auth, no credits, no user-doc writes.
The widget uploads a resume PDF, we parse it, build Perplexity job-search
queries from the resume, score the results against the resume, and return
the top 5 recommended jobs.

The authenticated /api/jobs flow is completely untouched. This file owns
its own blueprint and only touches two Firestore collections:

    * find_jobs_public_ip_quota — sha256(ip) -> last_success_at
    * lead_magnet_emails        — shared lead bucket (tool="find-jobs")

Anti-abuse:
    * Email gate before /search (captured to lead_magnet_emails)
    * IP rate limit: 1 successful search per sha256(ip) per 24h. Quota is
      only stamped on success — a failed search doesn't burn the day.

Endpoints:
    POST /api/tools/find-jobs/capture-email   -> {ok: true}
    POST /api/tools/find-jobs/search          -> {jobs, profile_summary, ...}
    GET  /api/tools/find-jobs/health          -> liveness
"""
from __future__ import annotations

import hashlib
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from firebase_admin import firestore
from flask import Blueprint, jsonify, request

from app.extensions import get_db
from app.services.find_jobs_public import find_matching_jobs

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB

logger = logging.getLogger(__name__)

find_jobs_public_bp = Blueprint(
    "find_jobs_public",
    __name__,
    url_prefix="/api/tools/find-jobs",
)

_IP_QUOTA_COLLECTION = "find_jobs_public_ip_quota"
_LEADS_COLLECTION = "lead_magnet_emails"
_IP_QUOTA_WINDOW_HOURS = 24
_TOOL_NAME = "find-jobs"


# ── Input helpers ────────────────────────────────────────────────────


def _client_ip() -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()


def _is_valid_email(email: str) -> bool:
    if not email or len(email) > 254:
        return False
    return bool(EMAIL_RE.match(email))


# ── IP rate limit ────────────────────────────────────────────────────


# Loopback addresses bypass the quota. Why: in production, traffic comes
# through Render's load balancer with real client IPs, so loopback is
# physically unreachable. In local dev, the browser and any curl test both
# present as 127.0.0.1 — bypassing here prevents a developer's smoke test
# from burning their own browser-session quota.
_LOOPBACK_IPS = {"127.0.0.1", "::1", "localhost", "unknown"}


def _is_loopback(ip: str) -> bool:
    return (ip or "").strip().lower() in _LOOPBACK_IPS


def _check_ip_quota(ip: str) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds)."""
    from app.utils.public_ratelimit_bypass import public_ratelimits_disabled
    if public_ratelimits_disabled():
        return True, 0
    if _is_loopback(ip):
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
        if last_success is None or not hasattr(last_success, "isoformat"):
            return True, 0
        last_dt = last_success
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        elapsed = datetime.now(timezone.utc) - last_dt
        window = timedelta(hours=_IP_QUOTA_WINDOW_HOURS)
        if elapsed >= window:
            return True, 0
        remaining = window - elapsed
        return False, int(remaining.total_seconds())
    except Exception:
        logger.warning("IP quota lookup failed; allowing request", exc_info=True)
        return True, 0


def _stamp_ip_quota(ip: str, search_id: str) -> None:
    # Don't write a quota record for loopback traffic. Matches the bypass in
    # _check_ip_quota so local testing never leaves a trail that has to be
    # manually cleaned up.
    if _is_loopback(ip):
        return
    db = get_db()
    if db is None:
        return
    try:
        db.collection(_IP_QUOTA_COLLECTION).document(_ip_hash(ip)).set({
            "last_success_at": firestore.SERVER_TIMESTAMP,
            "last_search_id": search_id,
        })
    except Exception:
        logger.warning("IP quota stamp failed for %s", search_id, exc_info=True)


# ── Lead capture ─────────────────────────────────────────────────────


def _capture_lead(
    *,
    email: str,
    source: str | None,
    search_id: str,
    resume_hash: str,
    stage: str = "search",
) -> str | None:
    db = get_db()
    if not db:
        return None
    try:
        ref = db.collection(_LEADS_COLLECTION).add({
            "email": email.lower().strip(),
            "tool": _TOOL_NAME,
            "source": (source or "unknown").strip()[:120],
            "search_id": search_id,
            "stage": stage,
            "resume_hash": resume_hash,
            "created_at": firestore.SERVER_TIMESTAMP,
            "ip": _client_ip(),
            "user_agent": (request.headers.get("User-Agent") or "")[:300],
            "referer": (request.headers.get("Referer") or "")[:300],
        })
        doc_ref = ref[1] if isinstance(ref, tuple) else ref
        return getattr(doc_ref, "id", None)
    except Exception:
        logger.warning("Lead capture failed", exc_info=True)
        return None


def _enrich_lead(lead_doc_id: str | None, *, top_jobs: list[dict]) -> None:
    if not lead_doc_id or not top_jobs:
        return
    db = get_db()
    if not db:
        return
    try:
        db.collection(_LEADS_COLLECTION).document(lead_doc_id).update({
            "top_job_titles": [j.get("title") for j in top_jobs[:5]],
            "top_companies": [j.get("company") for j in top_jobs[:5]],
        })
    except Exception:
        logger.warning("Lead enrichment failed for %s", lead_doc_id, exc_info=True)


# ── Routes ───────────────────────────────────────────────────────────


@find_jobs_public_bp.route("/health", methods=["GET"])
def health() -> Any:
    return jsonify({"status": "ok", "service": "find_jobs_public"})


@find_jobs_public_bp.route("/capture-email", methods=["POST"])
def capture_email() -> Any:
    """Standalone email-gate write. Mirrors the find-hiring-manager pattern."""
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or request.form.get("email") or "").strip()
    source = (payload.get("source") or request.form.get("source") or "standalone-tools-email-gate").strip()

    if not _is_valid_email(email):
        return jsonify({
            "error": "invalid_email",
            "message": "Please enter a valid email address.",
        }), 400

    db = get_db()
    if db is not None:
        try:
            db.collection(_LEADS_COLLECTION).add({
                "email": email.lower(),
                "tool": _TOOL_NAME,
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


@find_jobs_public_bp.route("/search", methods=["POST"])
def search() -> Any:
    """Multipart form. At least one of resume_pdf / job_query is required.
        resume_pdf: file (PDF, <=10MB) — optional
        job_query:  string             — optional, free-text role description
        email:      string             — required (lead-gate)
        source:     string             — optional (embedding surface)
        location:   string             — optional (default "United States")
    """
    # ── 1. Validate inputs ──────────────────────────────────────────
    pdf_bytes: bytes | None = None
    pdf_file = request.files.get("resume_pdf")
    if pdf_file and pdf_file.filename:
        pdf_bytes = pdf_file.read()
        if not pdf_bytes:
            pdf_bytes = None
        elif len(pdf_bytes) > MAX_PDF_BYTES:
            return jsonify({
                "error": "resume_too_large",
                "message": f"PDF exceeds {MAX_PDF_BYTES // (1024 * 1024)}MB limit.",
            }), 400

    job_query = (request.form.get("job_query") or "").strip()
    if len(job_query) > 500:
        job_query = job_query[:500]

    if not pdf_bytes and not job_query:
        return jsonify({
            "error": "missing_input",
            "message": "Upload your resume or describe the role you're looking for. At least one is required.",
        }), 400

    email = (request.form.get("email") or "").strip()
    if not _is_valid_email(email):
        return jsonify({
            "error": "invalid_email",
            "message": "A valid email is required.",
        }), 400

    source = (request.form.get("source") or "").strip() or None
    location = (request.form.get("location") or "").strip() or "United States"

    # ── 2. IP rate limit (before any expensive work) ────────────────
    ip = _client_ip()
    allowed, retry_after = _check_ip_quota(ip)
    if not allowed:
        hours_remaining = max(1, retry_after // 3600)
        resp = jsonify({
            "error": "rate_limited",
            "message": (
                "You've already used your free job search from this network in the last "
                f"24 hours. Try again in about {hours_remaining} hour(s), or create a "
                "free account at offerloop.ai for unlimited searches."
            ),
            "retry_after_seconds": retry_after,
        })
        resp.status_code = 429
        resp.headers["Retry-After"] = str(retry_after)
        return resp

    # ── 3. Capture the lead BEFORE the heavy call ───────────────────
    search_id = uuid.uuid4().hex
    resume_hash = hashlib.sha256(pdf_bytes).hexdigest()[:16] if pdf_bytes else ""
    lead_doc_id = _capture_lead(
        email=email,
        source=source,
        search_id=search_id,
        resume_hash=resume_hash,
    )

    # ── 4. Run the matcher ──────────────────────────────────────────
    try:
        result = find_matching_jobs(pdf_bytes, job_query=job_query, location=location)
    except ValueError as e:
        return jsonify({"error": "resume_read_failed", "message": str(e)}), 400
    except Exception:
        logger.exception("[%s] find_matching_jobs failed", search_id)
        return jsonify({
            "error": "search_failed",
            "message": "Something went wrong searching for jobs. Try again in a minute.",
        }), 500

    jobs = result.get("jobs") or []
    if not jobs:
        # No quota burn when we couldn't find anything.
        return jsonify({
            "search_id": search_id,
            "jobs": [],
            "profile_summary": result.get("profile_summary") or {},
            "warning": result.get("warning") or (
                "We couldn't find live postings that matched your resume right now. "
                "Try again in a few minutes."
            ),
        })

    # ── 5. Stamp the quota and enrich the lead ──────────────────────
    _stamp_ip_quota(ip, search_id)
    _enrich_lead(lead_doc_id, top_jobs=jobs)

    return jsonify({
        "search_id": search_id,
        "jobs": jobs,
        "profile_summary": result.get("profile_summary") or {},
        "detected_role": result.get("detected_role") or "",
        "detected_stage": result.get("detected_stage") or "",
        "detected_location": result.get("detected_location") or "",
        "total_candidates": result.get("total_candidates", 0),
        "queries_used": result.get("queries_used") or [],
    })
