"""Public, anonymous Find Hiring Manager routes (lead magnet).

Mounted at /api/tools/find-hiring-manager. No auth, no credits, no
user-doc writes. The widget posts a pasted job-posting URL; we extract
company + role via Firecrawl, run PDL hiring-manager discovery via the
existing recruiter_finder service, and return 1-2 candidates with a
short reasoning string per card.

The existing authenticated /api/job-board/find-hiring-manager flow is
completely untouched. This file owns its own blueprint and only touches
two Firestore collections:

    * find_hiring_manager_public_ip_quota — sha256(ip) -> rate-limit state
    * lead_magnet_emails                  — shared lead bucket (tool="find-hiring-manager")

Anti-abuse layers (defense in depth):
    1. Payload size cap (16 KB) on /search and /capture-email.
    2. SSRF defense on job_url: scheme allowlist + hostname + IP blocklist
       (loopback, private, link-local, cloud metadata, .local/.internal).
    3. Per-IP concurrent-search lock (Firestore transaction). Prevents a
       parallel burst from bypassing the 24h cap.
    4. Per-IP 24h cap on successful searches. Stamped only on success so
       failures don't burn the day.
    5. Per-IP hourly cap on /capture-email so the standalone lead-write
       endpoint can't be sprayed.
    6. Log-injection hygiene: control chars stripped before logging
       user-supplied values.

Endpoints:
    POST /api/tools/find-hiring-manager/capture-email   -> {ok: true}
    POST /api/tools/find-hiring-manager/search          -> result dict
    GET  /api/tools/find-hiring-manager/health          -> liveness
"""

from __future__ import annotations

import hashlib
import ipaddress
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from firebase_admin import firestore
from flask import Blueprint, jsonify, request

from app.extensions import get_db
from app.services.find_hiring_manager_public import find_hiring_managers_from_url
from app.utils.public_ratelimit_bypass import public_ratelimits_disabled

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
URL_RE = re.compile(r"^https?://", re.IGNORECASE)
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f]")
# A "numeric-looking" hostname: only digits, dots, colons, brackets, and the
# hex digits a-f/x. Real DNS hostnames always contain at least one alpha
# character outside the hex range (e.g. 'g', 'i', 'n', 'o', 's', 't' in
# 'stripe.com', 'linkedin.com', 'greenhouse.io'). If a hostname matches this
# regex AND can't be parsed as a canonical IP literal, it is almost certainly
# an IP shortform attempt like '127.1', '2130706433', or '0x7f000001'.
_NUMERIC_HOST_RE = re.compile(r"^[0-9a-fA-FxX.:\[\]]+$")

logger = logging.getLogger(__name__)

find_hiring_manager_public_bp = Blueprint(
    "find_hiring_manager_public",
    __name__,
    url_prefix="/api/tools/find-hiring-manager",
)

_IP_QUOTA_COLLECTION = "find_hiring_manager_public_ip_quota"
_LEADS_COLLECTION = "lead_magnet_emails"
_IP_QUOTA_WINDOW_HOURS = 24
_IN_PROGRESS_TIMEOUT_SEC = 120  # PDL tier search ~10-25s; 2min gives headroom
_CAPTURE_EMAIL_WINDOW_SEC = 3600
_CAPTURE_EMAIL_MAX_PER_WINDOW = 10
_MAX_BODY_BYTES = 16_000
_TOOL_NAME = "find-hiring-manager"

# Hostnames blocked by the SSRF defense (case-insensitive). Any hostname that
# IS or ENDS WITH one of these is rejected before we hand off to Firecrawl.
_BLOCKED_HOSTNAMES: frozenset[str] = frozenset({
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
    "broadcasthost",
})
_BLOCKED_HOSTNAME_SUFFIXES: tuple[str, ...] = (
    ".local",          # mDNS
    ".internal",       # GCP metadata / internal services
    ".localhost",
    ".localdomain",
    ".lan",
    ".home",
    ".intranet",
    ".corp",
    ".private",
)


# ── Input helpers ────────────────────────────────────────────────────


def _read_field(name: str) -> str:
    payload = request.get_json(silent=True) or {}
    value = payload.get(name)
    if value is None:
        value = request.form.get(name)
    if not isinstance(value, str):
        return ""
    return value.strip()


def _client_ip() -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        first = fwd.split(",")[0].strip()
        if first:
            return first
    return request.remote_addr or "unknown"


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()


def _safe_for_log(value: str, max_len: int = 200) -> str:
    """Strip control chars + cap length so user-controlled strings can't
    break log parsers or smuggle fake log entries via newlines/CR."""
    if not isinstance(value, str):
        value = str(value)
    cleaned = _CONTROL_CHAR_RE.sub("", value)
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len] + "…"
    return cleaned


def _check_payload_size():
    """413 if the request body exceeds our limit. Returns a Flask response
    when blocked, or None when ok."""
    if request.content_length is not None and request.content_length > _MAX_BODY_BYTES:
        return jsonify({
            "error": "payload_too_large",
            "message": "Request body is too large.",
        }), 413
    return None


def _validate_job_url(url: str) -> tuple[bool, str]:
    """SSRF defense. Returns (ok, reason). Reason is empty when valid.

    Rejects:
      * non-http(s) schemes (file://, gopher://, ftp://, ...)
      * empty / overly long URLs
      * hostnames in our blocklist or with a blocked suffix
      * IP literals in loopback / private / link-local / multicast /
        reserved / unspecified ranges (including 169.254.169.254 AWS IMDS,
        which is link-local)
    """
    if not url or not isinstance(url, str):
        return False, "missing"
    if len(url) > 1000:
        return False, "too long"
    try:
        parsed = urlparse(url)
    except Exception:
        return False, "unparseable"
    if parsed.scheme.lower() not in ("http", "https"):
        return False, "bad scheme"
    host = (parsed.hostname or "").lower()
    if not host:
        return False, "no host"
    if host in _BLOCKED_HOSTNAMES:
        return False, "blocked host"
    if any(host.endswith(suf) for suf in _BLOCKED_HOSTNAME_SUFFIXES):
        return False, "blocked host suffix"
    # If the hostname is an IP literal, check the range.
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None and (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return False, "blocked ip range"
    # IP-shortform defense: '127.1', '2130706433' (decimal),
    # '0x7f000001' (hex), etc. all resolve to loopback in many HTTP
    # clients but fail Python's strict ip_address(). If the hostname has
    # no alpha character outside the hex range, treat it as a numeric
    # literal and require it to parse canonically.
    if ip is None and _NUMERIC_HOST_RE.match(host):
        return False, "ambiguous numeric host"
    # Final sanity: reject userinfo, which can be used to confuse parsers
    # in downstream consumers (e.g. http://goodhost@badhost/...).
    if parsed.username or parsed.password:
        return False, "credentials in url"
    return True, ""


# ── IP rate limit (search + capture-email) ───────────────────────────


def _try_acquire_search_slot(ip: str) -> tuple[bool, int, str]:
    """Atomic: check the 24h quota AND reserve an in-progress slot.

    Returns:
        (True,  0,                   "")                     — caller may proceed
        (False, retry_after_seconds, "daily_quota")          — used last 24h
        (False, retry_after_seconds, "concurrent_search")    — another search in flight

    Modifies Firestore on success: stamps `in_progress_started_at = SERVER_TIMESTAMP`
    on the IP quota doc. Caller MUST call _release_search_slot(...) after.
    """
    if public_ratelimits_disabled():
        return True, 0, ""
    db = get_db()
    if db is None:
        # Fail-open if Firestore is unreachable — degraded mode keeps the
        # tool working; the consequence is the 24h cap is best-effort.
        return True, 0, ""
    ref = db.collection(_IP_QUOTA_COLLECTION).document(_ip_hash(ip))

    @firestore.transactional
    def _txn(tx):
        snap = ref.get(transaction=tx)
        data = snap.to_dict() if snap.exists else {}
        now = datetime.now(timezone.utc)

        # 24h cooldown
        last_success = data.get("last_success_at")
        if last_success and hasattr(last_success, "isoformat"):
            last_dt = last_success if last_success.tzinfo else last_success.replace(tzinfo=timezone.utc)
            elapsed = now - last_dt
            window = timedelta(hours=_IP_QUOTA_WINDOW_HOURS)
            if elapsed < window:
                return False, int((window - elapsed).total_seconds()), "daily_quota"

        # Concurrent-search lock
        in_prog = data.get("in_progress_started_at")
        if in_prog and hasattr(in_prog, "isoformat"):
            in_prog_dt = in_prog if in_prog.tzinfo else in_prog.replace(tzinfo=timezone.utc)
            age = now - in_prog_dt
            if age < timedelta(seconds=_IN_PROGRESS_TIMEOUT_SEC):
                remaining = _IN_PROGRESS_TIMEOUT_SEC - int(age.total_seconds())
                return False, max(1, remaining), "concurrent_search"

        tx.set(
            ref,
            {"in_progress_started_at": firestore.SERVER_TIMESTAMP},
            merge=True,
        )
        return True, 0, ""

    try:
        return _txn(db.transaction())
    except Exception:
        logger.warning("acquire_search_slot failed; allowing request", exc_info=True)
        return True, 0, ""


def _release_search_slot(ip: str, *, success: bool, search_id: str) -> None:
    db = get_db()
    if db is None:
        return
    ref = db.collection(_IP_QUOTA_COLLECTION).document(_ip_hash(ip))
    try:
        if success:
            ref.set(
                {
                    "last_success_at": firestore.SERVER_TIMESTAMP,
                    "last_search_id": search_id,
                    "in_progress_started_at": firestore.DELETE_FIELD,
                },
                merge=True,
            )
        else:
            ref.set(
                {"in_progress_started_at": firestore.DELETE_FIELD},
                merge=True,
            )
    except Exception:
        logger.warning("release_search_slot failed for %s", search_id, exc_info=True)


def _try_acquire_capture_email_slot(ip: str) -> tuple[bool, int]:
    """Hourly counter on /capture-email so the standalone lead-write can't
    be sprayed. Sliding-window-ish: when the window ages out, the counter
    resets. Stored on the same per-IP quota doc to avoid a 2nd collection.

    Returns (allowed, retry_after_seconds).
    """
    if public_ratelimits_disabled():
        return True, 0
    db = get_db()
    if db is None:
        return True, 0
    ref = db.collection(_IP_QUOTA_COLLECTION).document(_ip_hash(ip))

    @firestore.transactional
    def _txn(tx):
        snap = ref.get(transaction=tx)
        data = snap.to_dict() if snap.exists else {}
        now = datetime.now(timezone.utc)
        window_start = data.get("capture_email_window_started_at")
        count = data.get("capture_email_count") or 0

        if window_start and hasattr(window_start, "isoformat"):
            ws_dt = window_start if window_start.tzinfo else window_start.replace(tzinfo=timezone.utc)
            age = now - ws_dt
            if age >= timedelta(seconds=_CAPTURE_EMAIL_WINDOW_SEC):
                count = 0
                window_started_value = firestore.SERVER_TIMESTAMP
            else:
                if count >= _CAPTURE_EMAIL_MAX_PER_WINDOW:
                    remaining = _CAPTURE_EMAIL_WINDOW_SEC - int(age.total_seconds())
                    return False, max(1, remaining)
                window_started_value = ws_dt  # keep the existing window
        else:
            window_started_value = firestore.SERVER_TIMESTAMP

        tx.set(
            ref,
            {
                "capture_email_window_started_at": window_started_value,
                "capture_email_count": (count or 0) + 1,
            },
            merge=True,
        )
        return True, 0

    try:
        return _txn(db.transaction())
    except Exception:
        logger.warning("acquire_capture_email_slot failed; allowing", exc_info=True)
        return True, 0


# ── Lead capture ─────────────────────────────────────────────────────


def _capture_lead(
    *,
    email: str,
    source: str | None,
    search_id: str,
    job_url: str,
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
            "job_url": job_url[:500],
            "stage": stage,
            "company": None,
            "job_title": None,
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


def _enrich_lead(lead_doc_id: str | None, *, company: str, job_title: str) -> None:
    if not lead_doc_id:
        return
    db = get_db()
    if not db:
        return
    try:
        db.collection(_LEADS_COLLECTION).document(lead_doc_id).update({
            "company": (company or "")[:200] or None,
            "job_title": (job_title or "")[:200] or None,
        })
    except Exception:
        logger.warning("Lead enrichment failed for %s", lead_doc_id, exc_info=True)


# ── Routes ───────────────────────────────────────────────────────────


@find_hiring_manager_public_bp.route("/health", methods=["GET"])
def health() -> Any:
    return jsonify({"status": "ok", "service": "find_hiring_manager_public"})


@find_hiring_manager_public_bp.route("/capture-email", methods=["POST"])
def capture_email() -> Any:
    """Standalone email-gate write. Mirrors the meeting_prep_public pattern:
    the widget can call this on email submit BEFORE running the heavier
    /search call, so leads are recorded even if the user bails. Rate-limited
    per-IP to keep the lead bucket clean."""
    too_big = _check_payload_size()
    if too_big is not None:
        return too_big

    email = _read_field("email")
    source = _read_field("source") or "standalone-tools-email-gate"
    if not email or len(email) > 200 or not EMAIL_RE.match(email):
        return jsonify({
            "error": "invalid_email",
            "message": "Please enter a valid email address.",
        }), 400

    ip = _client_ip()
    allowed, retry_after = _try_acquire_capture_email_slot(ip)
    if not allowed:
        resp = jsonify({
            "error": "rate_limited",
            "message": "Too many email submissions from this network. Try again in an hour.",
            "retry_after_seconds": retry_after,
        })
        resp.status_code = 429
        resp.headers["Retry-After"] = str(retry_after)
        return resp

    db = get_db()
    if db is not None:
        try:
            db.collection(_LEADS_COLLECTION).add({
                "email": email.lower(),
                "tool": _TOOL_NAME,
                "source": (source or "unknown")[:120],
                "stage": "email-gate",
                "created_at": firestore.SERVER_TIMESTAMP,
                "ip": ip,
                "user_agent": (request.headers.get("User-Agent") or "")[:300],
                "referer": (request.headers.get("Referer") or "")[:300],
            })
        except Exception:
            logger.warning("capture_email write failed", exc_info=True)
    return jsonify({"ok": True})


@find_hiring_manager_public_bp.route("/search", methods=["POST"])
def search() -> Any:
    too_big = _check_payload_size()
    if too_big is not None:
        return too_big

    job_url = _read_field("job_url") or _read_field("url")
    if not job_url:
        return jsonify({
            "error": "missing_job_url",
            "message": "Paste a job posting URL to find the hiring manager.",
        }), 400

    # First-pass shape check
    if not URL_RE.match(job_url) or len(job_url) > 1000:
        return jsonify({
            "error": "invalid_job_url",
            "message": "That doesn't look like a valid job posting URL. "
                       "Paste a full link starting with http:// or https://.",
        }), 400

    # Deep SSRF / scheme / host validation
    url_ok, url_reason = _validate_job_url(job_url)
    if not url_ok:
        logger.info(
            "find_hiring_manager_public: rejecting url=%r reason=%s ip=%s",
            _safe_for_log(job_url), url_reason, _safe_for_log(_client_ip(), 64),
        )
        return jsonify({
            "error": "invalid_job_url",
            "message": "That URL isn't supported. Paste a public job posting URL "
                       "(Greenhouse, Lever, Workday, LinkedIn, Indeed, or the company's careers page).",
        }), 400

    email = _read_field("email")
    source = _read_field("source") or None
    if email and (len(email) > 200 or not EMAIL_RE.match(email)):
        return jsonify({
            "error": "invalid_email",
            "message": "Please enter a valid email address.",
        }), 400

    ip = _client_ip()
    allowed, retry_after, reason = _try_acquire_search_slot(ip)
    if not allowed:
        if reason == "concurrent_search":
            message = (
                "A search from this network is already running. Wait a moment "
                "for it to finish before starting another."
            )
        else:
            hours_remaining = max(1, retry_after // 3600)
            message = (
                "You've already used your free hiring-manager search from this "
                f"network in the last 24 hours. Try again in about {hours_remaining} "
                "hour(s), or create a free account at offerloop.ai for unlimited searches."
            )
        resp = jsonify({
            "error": "rate_limited",
            "reason": reason,
            "message": message,
            "retry_after_seconds": retry_after,
        })
        resp.status_code = 429
        resp.headers["Retry-After"] = str(retry_after)
        return resp

    search_id = uuid.uuid4().hex

    lead_doc_id: str | None = None
    if email:
        lead_doc_id = _capture_lead(
            email=email,
            source=source,
            search_id=search_id,
            job_url=job_url,
        )

    try:
        result = find_hiring_managers_from_url(job_url)
    except Exception:
        logger.exception(
            "find_hiring_managers_from_url crashed for url=%r ip=%s",
            _safe_for_log(job_url), _safe_for_log(ip, 64),
        )
        _release_search_slot(ip, success=False, search_id=search_id)
        return jsonify({
            "error": "internal_error",
            "search_id": search_id,
            "status": "no_candidates",
            "message": "Something went wrong. Try again in a minute, or paste a different job URL.",
            "job": {"company": "", "jobTitle": "", "location": ""},
            "hiringManagers": [],
        }), 500

    status = result.get("status")
    if status == "ok":
        job = result.get("job") or {}
        _enrich_lead(
            lead_doc_id,
            company=job.get("company") or "",
            job_title=job.get("jobTitle") or "",
        )
        _release_search_slot(ip, success=True, search_id=search_id)
        return jsonify({"search_id": search_id, **result})

    # Extraction or PDL miss — surface a friendly error, do NOT burn quota.
    _release_search_slot(ip, success=False, search_id=search_id)
    http_status = 200 if status == "no_candidates" else 422
    return jsonify({"search_id": search_id, **result}), http_status
