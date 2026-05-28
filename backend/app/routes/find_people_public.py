"""Public, anonymous people-search routes (lead magnet).

Mounted at /api/tools/find-people. No auth, no credits, no user-doc
writes. The existing authenticated FindPage / ContactSearchPage flow
(backend/app/services/recruiter_finder.py + /api/runs) is completely
untouched.

Owns its own blueprint and only touches two Firestore collections:

    * find_people_public_ip_quota — sha256(ip) -> last_success_at
    * lead_magnet_emails           — shared lead bucket (tool="find-people")

Anti-abuse:
    * Email gate before /search (captured to lead_magnet_emails)
    * IP rate limit: 1 successful search per sha256(ip) per 24h. The
      quota is only stamped on success, so 0-result queries don't burn
      the day.

Endpoints:
    GET  /api/tools/find-people/health         liveness
    POST /api/tools/find-people/capture-email  email -> Firestore lead doc
    POST /api/tools/find-people/search         company + role -> 5 contacts
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
from app.services.find_people_public.finder import search_public_people

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

logger = logging.getLogger(__name__)

find_people_public_bp = Blueprint(
    "find_people_public",
    __name__,
    url_prefix="/api/tools/find-people",
)

_IP_QUOTA_COLLECTION = "find_people_public_ip_quota"
_LEADS_COLLECTION = "lead_magnet_emails"
_IP_QUOTA_WINDOW_HOURS = 24
_TOOL_NAME = "find-people"
_RESULT_LIMIT = 5


# ── Input helpers ────────────────────────────────────────────────────


def _read_field(name: str) -> str:
    payload = request.get_json(silent=True) or {}
    value = payload.get(name)
    if value is None:
        value = request.form.get(name)
    return (value or "").strip() if isinstance(value, str) else ""


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


# ── IP rate limit (Firestore-backed, mirrors find_hiring_manager_public) ─


def _check_ip_quota(ip: str) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds). If Firestore is down we
    fail open — better to let one extra search through than to lock out
    every visitor when the DB hiccups."""
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


def _push_to_beehiiv(email: str, source: str) -> None:
    """Stub: Beehiiv is not wired up in this repo yet. When the
    Beehiiv integration ships, push the email to the relevant
    publication / segment here. Until then, the Firestore write to
    `lead_magnet_emails` is the source of truth and a future backfill
    job can replay from there.
    """
    return None


def _capture_lead(
    *,
    email: str,
    source: str | None,
    search_id: str,
    stage: str = "search",
    company: str = "",
    role: str = "",
    result_count: int | None = None,
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
            "company": (company or "")[:200] or None,
            "role": (role or "")[:200] or None,
            "result_count": result_count,
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


# ── Routes ───────────────────────────────────────────────────────────


@find_people_public_bp.route("/health", methods=["GET"])
def health() -> Any:
    return jsonify({"status": "ok", "service": "find_people_public"})


@find_people_public_bp.route("/capture-email", methods=["POST"])
def capture_email() -> Any:
    """Standalone email-gate write. The widget calls this on email
    submit BEFORE running the heavier /search call, so leads are
    recorded even if the user bails before seeing results."""
    email = _read_field("email")
    source = _read_field("source") or "find-people-email-gate"
    if not _is_valid_email(email):
        return jsonify({
            "error": "invalid_email",
            "message": "Please enter a valid email address.",
        }), 400

    _capture_lead(
        email=email,
        source=source,
        search_id=uuid.uuid4().hex[:12],
        stage="email_gate",
    )
    _push_to_beehiiv(email, source)
    return jsonify({"ok": True})


@find_people_public_bp.route("/search", methods=["POST"])
def search() -> Any:
    """Run one public people-search.

    JSON body:
        company  string  required  e.g. "Goldman Sachs"
        role     string  required  e.g. "Investment Banking Analyst"
        email    string  required  (already captured at the gate; resent here
                                    so the lead row can be linked to results)
        source   string  optional  identifies the embedding surface

    Response (200):
        {
          "request_id": "...",
          "company": "...",
          "role": "...",
          "results": [ { name, title, company, school, linkedin }, ... ],
          "count": 0..5
        }
    """
    search_id = uuid.uuid4().hex[:12]

    email = _read_field("email")
    company = _read_field("company")
    role = _read_field("role")
    source = _read_field("source") or "unknown"

    if not _is_valid_email(email):
        return jsonify({"error": "invalid_email", "message": "A valid email is required."}), 400
    if not company:
        return jsonify({"error": "missing_company", "message": "Please enter a company name."}), 400
    if not role:
        return jsonify({"error": "missing_role", "message": "Please enter a role or job title."}), 400

    ip = _client_ip()
    allowed, retry_after = _check_ip_quota(ip)
    if not allowed:
        hours = max(1, retry_after // 3600)
        return jsonify({
            "error": "rate_limited",
            "message": (
                f"Free search is limited to once every 24 hours. Try again in "
                f"about {hours} hour(s), or sign up for full access."
            ),
            "retry_after_sec": retry_after,
        }), 429

    try:
        results = search_public_people(company, role, limit=_RESULT_LIMIT)
    except Exception:
        logger.exception("[%s] find_people_public search crashed", search_id)
        return jsonify({
            "error": "search_failed",
            "message": "Something went wrong on our side. Try again in a minute.",
        }), 500

    logger.info(
        "[%s] find-people: company=%r role=%r results=%d",
        search_id, company, role, len(results),
    )

    # Only consume the user's daily slot if PDL actually returned matches.
    # A 0-result query shouldn't lock them out of trying a different role.
    if results:
        _stamp_ip_quota(ip, search_id)

    _capture_lead(
        email=email,
        source=source,
        search_id=search_id,
        stage="search",
        company=company,
        role=role,
        result_count=len(results),
    )

    return jsonify({
        "request_id": search_id,
        "company": company,
        "role": role,
        "results": results,
        "count": len(results),
    })
