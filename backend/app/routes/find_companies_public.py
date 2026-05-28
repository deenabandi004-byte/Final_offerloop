"""Public, anonymous "Find Companies" recommender (lead magnet).

Mounted at /api/tools/find-companies. No auth, no credits, no Firestore
user lookup. The student supplies a resume PDF, a free-text prompt
describing what kind of company they want, or both. Backend parses the
PDF (if given) and asks GPT-4o-mini for 5 matched companies. The only
Firestore write is a best-effort `lead_magnet_emails` row, mirroring
the other public widgets.

Endpoints:
    POST /api/tools/find-companies/capture-email - email-only capture
    POST /api/tools/find-companies/search        - resume and/or prompt -> 5 companies
    GET  /api/tools/find-companies/health        - liveness check

Anti-abuse:
    - 11 MB hard request body cap (rejected before Flask buffers the upload)
    - 10 MB PDF byte cap after read
    - 2 KB prompt cap
    - email + format validation
    - 1 successful /search per IP per 24 h (in-memory, per-worker)
    - Global daily search ceiling backed by Firestore (fail-open if unreachable)
    - PDF parsing runs on a worker thread with a 25 s wall-clock timeout
    - Control characters stripped from logged headers / user-controlled fields
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import logging
import re
import threading
import time
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

try:
    from firebase_admin import firestore as fb_firestore
    _SERVER_TIMESTAMP = fb_firestore.SERVER_TIMESTAMP
except Exception:
    _SERVER_TIMESTAMP = None

from app.extensions import get_db
from app.services.find_companies_public.finder import recommend_companies
from app.services.find_companies_public.resume_parser import (
    extract_text_from_pdf_bytes,
    parse_resume_to_profile,
)

logger = logging.getLogger(__name__)

find_companies_public_bp = Blueprint(
    "find_companies_public",
    __name__,
    url_prefix="/api/tools/find-companies",
)


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_PDF_BYTES = 10 * 1024 * 1024
# 11 MB hard body cap. ~1 MB of slack above MAX_PDF_BYTES covers the email
# field, prompt, multipart boundary, and source field without letting a 100 MB
# upload stream all the way through Flask before we 413.
MAX_BODY_BYTES = 11 * 1024 * 1024
MIN_RESUME_CHARS = 100
MAX_PROMPT_CHARS = 2000
PDF_PARSE_TIMEOUT_SECONDS = 25
# Global daily budget — caps the total number of successful /search calls
# from ANY IP per UTC day. Sized for free-tier OpenAI spend tolerance, not
# for legitimate traffic shape; legitimate traffic should never come close.
GLOBAL_DAILY_BUDGET = 5000
GLOBAL_BUDGET_COLLECTION = "rate_limit_find_companies_public"
LEADS_COLLECTION = "lead_magnet_emails"

# Strip control characters before logging or storing anything that came from
# a header / form field. Used for fields that should never legitimately
# contain newlines (source, user-agent, referer, ip) - prevents CRLF log
# injection where an attacker writes "evil\r\nFAKE_LOG_LINE" into a header.
_HEADER_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")


def _scrub(s: str, max_len: int = 300) -> str:
    if not s:
        return ""
    return _HEADER_CONTROL_RE.sub("", s)[:max_len]


# Dedicated thread pool for PDF parsing so a slow PDF doesn't tie up a
# gunicorn worker thread indefinitely.
_pdf_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=4, thread_name_prefix="find-companies-pdf"
)

# In-memory IP rate limit: 1 successful /search per IP per 24h, per worker.
# Across N gunicorn workers this allows up to N hits per IP per day, which is
# fine for a free lead magnet anti-abuse net.
_RATE_WINDOW_SECONDS = 24 * 60 * 60
_rate_lock = threading.Lock()
_rate_hits: dict[str, float] = {}


def _client_ip() -> str:
    fwd = request.headers.get("X-Forwarded-For", "") or ""
    if fwd:
        return fwd.split(",")[0].strip()
    return (request.remote_addr or "").strip() or "0.0.0.0"


def _ip_recently_succeeded(ip: str) -> bool:
    """Return True if this IP has had a successful /search in the last 24h.

    Also opportunistically evicts stale entries to keep the map small.
    """
    from app.utils.public_ratelimit_bypass import public_ratelimits_disabled
    if public_ratelimits_disabled():
        return False
    now = time.time()
    with _rate_lock:
        # Evict old entries (cheap; map stays tiny).
        stale = [k for k, ts in _rate_hits.items() if now - ts > _RATE_WINDOW_SECONDS]
        for k in stale:
            _rate_hits.pop(k, None)
        last = _rate_hits.get(ip)
        return last is not None and now - last < _RATE_WINDOW_SECONDS


def _record_ip_success(ip: str) -> None:
    with _rate_lock:
        _rate_hits[ip] = time.time()


def _global_budget_exceeded() -> bool:
    """Check the Firestore daily counter. Fail-open on any error so a
    Firestore hiccup doesn't take down the public tool, but log loudly.
    """
    db = get_db()
    if db is None:
        return False
    try:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        doc = db.collection(GLOBAL_BUDGET_COLLECTION).document(day).get()
        if not doc.exists:
            return False
        count = (doc.to_dict() or {}).get("count", 0)
        return count >= GLOBAL_DAILY_BUDGET
    except Exception:
        logger.warning("Global budget check failed; failing open", exc_info=True)
        return False


def _bump_global_budget() -> None:
    """Atomic-ish increment of today's counter. Best-effort; never blocks."""
    db = get_db()
    if db is None:
        return
    try:
        from firebase_admin import firestore as _fs
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        ref = db.collection(GLOBAL_BUDGET_COLLECTION).document(day)
        ref.set(
            {"count": _fs.Increment(1), "last_hit": _SERVER_TIMESTAMP},
            merge=True,
        )
    except Exception:
        logger.warning("Global budget bump failed", exc_info=True)


def _parse_pdf_with_timeout(pdf_bytes: bytes) -> str:
    """Run pdfplumber on a worker thread with a wall-clock timeout.

    Raises TimeoutError on overrun. pdfplumber doesn't expose a timeout
    knob, and a malicious PDF can stall for minutes; this caps the cost.
    """
    future = _pdf_executor.submit(extract_text_from_pdf_bytes, pdf_bytes)
    try:
        return future.result(timeout=PDF_PARSE_TIMEOUT_SECONDS)
    except concurrent.futures.TimeoutError:
        future.cancel()
        raise TimeoutError(
            f"PDF parsing exceeded {PDF_PARSE_TIMEOUT_SECONDS} s"
        )


def _is_valid_email(email: str) -> bool:
    if not email or len(email) > 254:
        return False
    return bool(EMAIL_RE.match(email))


def _log_lead(
    *,
    email: str,
    source: str,
    resume_hash: str = "",
    has_prompt: bool = False,
    has_resume: bool = False,
    n_recommendations: int = 0,
    extra: dict | None = None,
) -> None:
    """Best-effort write to lead_magnet_emails. Never blocks the response."""
    db = get_db()
    if db is None:
        return
    try:
        doc = {
            "email": email.strip().lower()[:254],
            "tool": "find-companies",
            "source": _scrub(source, 120) or "unknown",
            "resume_hash": resume_hash,
            "has_prompt": has_prompt,
            "has_resume": has_resume,
            "n_recommendations": n_recommendations,
            "created_at": _SERVER_TIMESTAMP,
            "ip": _scrub(_client_ip(), 60),
            "user_agent": _scrub(request.headers.get("User-Agent", ""), 300),
            "referer": _scrub(request.headers.get("Referer", ""), 300),
        }
        if extra:
            doc.update(extra)
        db.collection(LEADS_COLLECTION).add(doc)
    except Exception:
        logger.warning("find-companies lead capture failed", exc_info=True)


# ── Routes ───────────────────────────────────────────────────────────


@find_companies_public_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "find_companies_public"})


@find_companies_public_bp.route("/capture-email", methods=["POST"])
def capture_email():
    """Capture an email pre-flight (used by the email gate, mirrors cover-letter)."""
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip()
    source = (payload.get("source") or "standalone-tools-email-gate").strip()
    if not _is_valid_email(email):
        return jsonify({
            "error": "invalid_email",
            "message": "Please enter a valid email address.",
        }), 400

    _log_lead(email=email, source=source)
    return jsonify({"ok": True})


@find_companies_public_bp.route("/search", methods=["POST"])
def search():
    """Return 5 company recommendations from a resume PDF and/or a prompt.

    Multipart form-data fields:
        resume_pdf  file (PDF, <=10 MB) - optional
        prompt      string (<=2000 chars) - optional
        email       string - required (lead capture, not auth)
        source      string - optional, identifies the embedding surface

    Either `resume_pdf` or `prompt` must be present and non-empty.

    Response 200:
        {
            "recommendations": [
                {name, industry, why_match, key_roles, link}, ...  # up to 5
            ],
            "request_id": "..."
        }
    """
    request_id = uuid.uuid4().hex[:12]
    started = time.time()

    # 0. Cheap body-size pre-check. Reject 100+ MB uploads BEFORE Flask
    #    buffers the whole multipart body into memory/tmp. content_length
    #    is set by werkzeug from the Content-Length header; trust it for
    #    coarse rejection only (the byte-level check below is authoritative).
    content_length = request.content_length or 0
    if content_length and content_length > MAX_BODY_BYTES:
        return jsonify({
            "error": "payload_too_large",
            "message": f"Request body exceeds {MAX_BODY_BYTES // (1024 * 1024)} MB.",
        }), 413

    # 1. Validate inputs
    email = (request.form.get("email") or "").strip()
    source = _scrub(request.form.get("source") or "", 120) or "unknown"
    if not _is_valid_email(email):
        return jsonify({
            "error": "invalid_email",
            "message": "A valid email is required.",
        }), 400

    user_prompt = (request.form.get("prompt") or "").strip()
    if len(user_prompt) > MAX_PROMPT_CHARS:
        return jsonify({
            "error": "prompt_too_long",
            "message": f"Your prompt is too long. Keep it under {MAX_PROMPT_CHARS} characters.",
        }), 400

    pdf_file = request.files.get("resume_pdf")
    has_pdf_upload = bool(pdf_file and pdf_file.filename)

    if not has_pdf_upload and not user_prompt:
        return jsonify({
            "error": "missing_input",
            "message": "Upload your resume, describe the kind of company you're looking for, or both.",
        }), 400

    pdf_bytes = b""
    if has_pdf_upload:
        pdf_bytes = pdf_file.read()
        if not pdf_bytes:
            return jsonify({
                "error": "empty_resume",
                "message": "Your resume PDF appears to be empty.",
            }), 400
        if len(pdf_bytes) > MAX_PDF_BYTES:
            return jsonify({
                "error": "resume_too_large",
                "message": f"Resume PDF exceeds {MAX_PDF_BYTES // (1024 * 1024)} MB.",
            }), 400

    # 2. Rate limit by IP (after cheap input checks so abusers don't get
    #    cheap signal on whether their email/file shape was valid).
    ip = _client_ip()
    if _ip_recently_succeeded(ip):
        return jsonify({
            "error": "rate_limited",
            "message": "You've already used the free Find Companies tool today. Create a free account for unlimited searches.",
        }), 429

    # 2b. Global circuit breaker. Stops a botnet with rotating IPs from
    #     blowing the OpenAI bill. Generic message to avoid leaking that
    #     a global limit exists (otherwise an attacker knows when they're
    #     succeeding at exhausting it).
    if _global_budget_exceeded():
        logger.warning(
            "[%s] global daily budget exceeded; rejecting request from %s",
            request_id, _scrub(ip, 60),
        )
        return jsonify({
            "error": "tool_unavailable",
            "message": "The free tool is at capacity right now. Try again in a few hours, or create a free account for unlimited searches.",
        }), 429

    # 3. Extract resume text (if a PDF was uploaded). PDF parsing is wrapped
    #    in a wall-clock timeout because pdfplumber has no native one and a
    #    malicious PDF (deeply nested objects, decompression bomb) can stall.
    resume_text = ""
    resume_hash = ""
    profile: dict = {}
    if pdf_bytes:
        try:
            resume_text = _parse_pdf_with_timeout(pdf_bytes)
        except TimeoutError:
            logger.warning(
                "[%s] PDF parse timed out (>%ss)",
                request_id, PDF_PARSE_TIMEOUT_SECONDS,
            )
            return jsonify({
                "error": "resume_parse_timeout",
                "message": "Your PDF took too long to parse. Try a smaller or simpler PDF, or paste a prompt instead.",
            }), 400
        except Exception as exc:
            logger.error("[%s] PDF parse failed: %s", request_id, exc)
            return jsonify({
                "error": "resume_unreadable",
                "message": "Could not read your PDF. Make sure it's a text-based PDF, not a scanned image.",
            }), 400

        if not resume_text or len(resume_text.strip()) < MIN_RESUME_CHARS:
            return jsonify({
                "error": "resume_too_short",
                "message": "Your resume PDF has too little text. It may be a scanned image - try exporting a text-based PDF.",
            }), 400

        resume_hash = hashlib.sha256(pdf_bytes).hexdigest()[:16]

        try:
            profile = parse_resume_to_profile(resume_text) or {}
        except Exception:
            logger.exception("[%s] parse_resume_to_profile crashed", request_id)
            profile = {}
        logger.info(
            "[%s] resume parsed: %d chars, %d profile keys",
            request_id, len(resume_text), len(profile),
        )

    # 4. Recommend
    recommendations = recommend_companies(
        profile=profile,
        resume_text=resume_text,
        user_prompt=user_prompt,
    )
    if not recommendations:
        return jsonify({
            "error": "recommendation_failed",
            "message": "We couldn't generate company recommendations right now. Try again in a moment.",
        }), 502

    # 5. Lead capture + record rate-limit hit (only on success)
    _record_ip_success(ip)
    _bump_global_budget()
    _log_lead(
        email=email,
        source=source,
        resume_hash=resume_hash,
        has_prompt=bool(user_prompt),
        has_resume=bool(resume_text),
        n_recommendations=len(recommendations),
        extra={"request_id": request_id},
    )

    elapsed = time.time() - started
    logger.info(
        "[%s] find-companies returned %d recommendations in %.1fs (resume=%s, prompt=%s)",
        request_id, len(recommendations), elapsed,
        bool(resume_text), bool(user_prompt),
    )

    return jsonify({
        "recommendations": recommendations,
        "request_id": request_id,
    })
