"""HTTP surface for the iOS ranker.

Thin — algorithm lives in services/person_ranker.py; this module owns
HTTP shape, validation, and credit metering. Rylan's swipe-deck client
hits these three endpoints only.

    GET  /api/ranker/candidates                        — deck (free)
    POST /api/ranker/feedback                          — swipe signal (free)
    POST /api/ranker/candidates/<id>/reveal-email      — metered Hunter lookup

See person_ranker module docstring for algorithm details, sensitive-field
posture, and known gaps.
"""
import logging
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from firebase_admin import firestore

from ..extensions import require_firebase_auth, get_db
from app.services.person_ranker import (
    DEFAULT_RANKED_LIMIT,
    MAX_RANKED_LIMIT,
    rank_people_for_user,
)
from app.utils.recommendation_events import log_recommendation_event

logger = logging.getLogger(__name__)

ranker_bp = Blueprint("ranker", __name__, url_prefix="/api/ranker")


# ── Tunables ──────────────────────────────────────────────────────────
# Reveal-email cache TTL. 30 days is comfortably shorter than typical
# job-change cadence, so cached email stays deliverable. After TTL, we
# re-charge and re-lookup rather than serve stale addresses.
REVEAL_CACHE_TTL_DAYS = 30

# Charge-keeper threshold for reveal-email. Hunter's own "trustworthy"
# cutoff for Email Finder is 80; we put a 10-point safety margin above
# that. `email_verified == True` (Hunter SMTP-confirmed) is stronger
# than any confidence score and unconditionally keeps the charge.
# Refund on everything else — err toward refund because a charged
# bounce hurts trust more than a free miss.
REVEAL_CHARGE_MIN_CONFIDENCE = 90


# ── Helpers ───────────────────────────────────────────────────────────


def _within_ttl(iso_ts: str | None, *, days: int) -> bool:
    """True if an ISO-8601 timestamp is within `days` of now (UTC)."""
    if not iso_ts:
        return False
    try:
        # Handle "Z" suffix (Python <3.11 fromisoformat doesn't parse it).
        parsed = iso_ts.rstrip("Z")
        ts = datetime.fromisoformat(parsed)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return False
    delta = datetime.now(timezone.utc) - ts
    return 0 <= delta.total_seconds() <= days * 86400


def _try_refund(uid: str, amount: int, reason: str) -> None:
    """Refund credits, log-and-continue on failure. Never raises.

    Firestore blip during refund must NOT bubble a 500 to the client —
    that would lose the money silently AND fail the endpoint. Log
    loudly so Sid can eyeball the credits ledger for orphan deductions.
    """
    try:
        from app.services.auth import refund_credits_atomic
        refund_credits_atomic(uid, amount, reason)
    except Exception as exc:
        logger.warning(
            "reveal: refund failed uid=%s amount=%d reason=%s exc=%s "
            "(ledger will show orphan deduction; manual reconcile)",
            uid, amount, reason, exc,
        )


# ── Routes ────────────────────────────────────────────────────────────


@ranker_bp.route("/candidates", methods=["GET"])
@require_firebase_auth
def get_ranked_candidates():
    """GET /api/ranker/candidates?limit=50

    Returns a diversified, scored list of people the authenticated user
    should reach out to. No search-query params — the ranker sources
    candidates from the caller's profile (dreamCompanies +
    academics.school) alone. Deterministic given user profile +
    firm_employees state (same call → same result).

    Response 200:
      {
        "candidates":  [{person, score, tier, reasons, briefing}, ...],
        "count":       int,
        "deck_id":     str,          # opaque token — client MUST echo on
                                     # feedback + reveal-email calls
        "generatedAt": ISO8601
      }

    Response 200 with count=0:
      Deck empty. Causes: sparse profile, no firm_employees hits, or
      (defensively) an unexpected error inside the ranker. `reason`
      distinguishes for the client. Clients render an empty state,
      not an error.

    Response 500:
      Database not initialized (backend health issue, not a user issue).
    """
    uid = request.firebase_user["uid"]
    try:
        limit = int(request.args.get("limit", DEFAULT_RANKED_LIMIT))
    except (TypeError, ValueError):
        limit = DEFAULT_RANKED_LIMIT
    limit = max(1, min(limit, MAX_RANKED_LIMIT))

    db = get_db()
    if not db:
        return jsonify({"error": "Database not initialized"}), 500

    candidates = rank_people_for_user(uid=uid, db=db, limit=limit)
    generated_at = datetime.now(timezone.utc).isoformat()

    # deck_id is generated per-call. Client MUST echo it on feedback +
    # reveal-email calls so the training row can be joined back to the
    # deck context (features_snapshot, rank).
    deck_id = uuid.uuid4().hex[:16]

    if not candidates:
        return jsonify({
            "candidates":  [],
            "count":       0,
            "deck_id":     deck_id,
            "reason":      "no_candidates",
            "generatedAt": generated_at,
        })
    return jsonify({
        "candidates":  candidates,
        "count":       len(candidates),
        "deck_id":     deck_id,
        "generatedAt": generated_at,
    })


@ranker_bp.route("/feedback", methods=["POST"])
@require_firebase_auth
def post_ranker_feedback():
    """POST /api/ranker/feedback

    Record a swipe. Two writes, both idempotent per (deck_id, candidate_id):

      1. users/{uid}/peoplePreferences/{candidate_id} — latest-wins state
         powering "don't show again" exclusion in future decks. Read by
         person_ranker._swiped_person_ids.
      2. recommendation_events/person_swipe_{deck_id}_{candidate_id} —
         training-data label. Deterministic doc_id so client retries
         cannot double-count.

    Request body:
      {
        "candidate_id": str,      # required — from person.id in the deck response
        "signal":       "right" | "left" | "skip",
        "deck_id":      str,      # required — echoed from candidates response
        "rank":         int,      # required — 0-based deck position

        // Recommended for training-data feature snapshotting; if omitted,
        // features_snapshot is empty on the event row but the training
        // pipeline can still join back to context via (deck_id, candidate_id).
        "score":        int,
        "tier":         "warm" | "neutral" | "cold",
        "reasons":      list,
        "briefing":     str
      }

    Response 200 {"ok": true} — normal.
    Response 400 — validation failure (candidate_id / signal / deck_id / rank).
    Response 500 — DB not initialized.
    """
    uid = request.firebase_user["uid"]
    data = request.get_json(silent=True) or {}

    candidate_id = (data.get("candidate_id") or "").strip()
    signal       = (data.get("signal") or "").strip()
    deck_id      = (data.get("deck_id") or "").strip()
    rank_val     = data.get("rank")

    if not candidate_id:
        return jsonify({"error": "candidate_id required"}), 400
    if signal not in ("right", "left", "skip"):
        return jsonify({"error": "signal must be right, left, or skip"}), 400
    if not deck_id:
        return jsonify({
            "error": "deck_id required — echo from /candidates response"
        }), 400
    try:
        rank_int = int(rank_val)
        if rank_int < 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "rank required, must be int >= 0"}), 400

    db = get_db()
    if not db:
        return jsonify({"error": "Database not initialized"}), 500

    # Optional attribution echo (features captured at deck-render time).
    # Client trust model: user is source of truth for their own action
    # (signal + rank); everything else is a best-effort echo of what we
    # returned in the deck response. If we later suspect drift, we can
    # add server-side impression snapshots. MVP accepts client echo.
    score    = data.get("score")
    tier     = data.get("tier") or ""
    reasons  = data.get("reasons") or []
    briefing = data.get("briefing") or ""

    now = datetime.now(timezone.utc)

    # Write 1: peoplePreferences — latest-wins overwrite.
    try:
        (db.collection("users")
           .document(uid)
           .collection("peoplePreferences")
           .document(candidate_id)
           .set({
               "candidate_id": candidate_id,
               "signal":       signal,
               "last_deck_id": deck_id,
               "last_rank":    rank_int,
               "updated_at":   now.isoformat(),
               "updated_ts":   firestore.SERVER_TIMESTAMP,
           }))
    except Exception as exc:
        logger.warning(
            "feedback: peoplePreferences write failed uid=%s cid=%s: %s",
            uid, candidate_id, exc,
        )

    # Write 2: recommendation_events — deterministic doc_id makes at-
    # least-once client retries safe (Pub/Sub-style redelivery too, if
    # this ever ends up behind a queue).
    log_recommendation_event(
        event_type=f"person_swipe_{signal}",
        uid=uid,
        contact_id=candidate_id,
        rank=rank_int,
        score=float(score) if isinstance(score, (int, float)) else None,
        model_version="person_ranker_v0",
        surface="ios_swipe_deck",
        features_snapshot={
            "tier":           tier,
            "warmth_signals": reasons,
            "briefing":       briefing,
            "deck_id":        deck_id,
        },
        attribution_source="ranker_deck",
        extra={"signal": signal},
        doc_id=f"person_swipe_{deck_id}_{candidate_id}",
    )

    return jsonify({"ok": True})


@ranker_bp.route("/candidates/<candidate_id>/reveal-email", methods=["POST"])
@require_firebase_auth
def reveal_candidate_email(candidate_id):
    """POST /api/ranker/candidates/<candidate_id>/reveal-email

    Look up a verified email for a ranker candidate. Metered (see
    CREDIT_COSTS["reveal_email"]) on cache-miss + charge-worthy Hunter
    result. Cache-first: subsequent calls within TTL are free. Refund
    on low-confidence / no-hit / error.

    MUST NOT be called on card render — it charges credits. Client
    wires this into the swipe-right handler only. The 30-day cache
    protects against accidental double-charges from client retries.

    Charge rule (both branches → keep the deduction):
      * Hunter returned email_verified == True (SMTP-confirmed), OR
      * email_source == "hunter_finder" AND confidence >= REVEAL_CHARGE_MIN_CONFIDENCE

    Refund rule (any of):
      * verified == False AND confidence < REVEAL_CHARGE_MIN_CONFIDENCE
      * email_source ∈ {"pattern", "domain_generated", "pdl_fallback"}
        (synthesized / best-guess, not deliverability-verified)
      * no email found
      * Hunter API error / timeout

    Request body (optional):
      {"deck_id": str}      # for cross-endpoint attribution on the
                            # recommendation_events row

    Response 200 (email found + charge-worthy):
      {email, verified: true, source, confidence, cached: bool, charged: true}

    Response 200 (email found but below threshold OR no email):
      {email: str|null, verified: bool, source, confidence,
       reason: "no_email_found" | "below_confidence_threshold",
       cached: false, charged: false}

    Response 402: {"error": "insufficient_credits", "required": int, "have": int}
    Response 404: {"error": "candidate_not_found"}
    Response 500: {"error": "..."}
    """
    uid = request.firebase_user["uid"]
    data = request.get_json(silent=True) or {}
    deck_id = (data.get("deck_id") or "").strip()

    candidate_id = (candidate_id or "").strip()
    if not candidate_id:
        return jsonify({"error": "candidate_id required in path"}), 400

    db = get_db()
    if not db:
        return jsonify({"error": "Database not initialized"}), 500

    # ── 1. Cache-first — no credit deduction, no Hunter call.
    cache_ref = (db.collection("users").document(uid)
                   .collection("revealedEmails").document(candidate_id))
    try:
        cached_snap = cache_ref.get()
    except Exception:
        cached_snap = None
    if cached_snap is not None and getattr(cached_snap, "exists", False):
        cached = cached_snap.to_dict() or {}
        if _within_ttl(cached.get("revealed_at"), days=REVEAL_CACHE_TTL_DAYS):
            return jsonify({
                "email":      cached.get("email"),
                "verified":   bool(cached.get("verified")),
                "source":     cached.get("source"),
                "confidence": cached.get("confidence", 0),
                "cached":     True,
                "charged":    False,
            })

    # ── 2. firm_employees lookup — need first/last/company for Hunter.
    from app.services.firm_cache.schema import FIRM_EMPLOYEES_COLLECTION
    try:
        fs_snap = db.collection(FIRM_EMPLOYEES_COLLECTION).document(candidate_id).get()
    except Exception:
        fs_snap = None
    if fs_snap is None or not getattr(fs_snap, "exists", False):
        # No credit spent yet — safe to fail.
        return jsonify({"error": "candidate_not_found"}), 404
    fs = fs_snap.to_dict() or {}
    first = (fs.get("first_name") or "").strip()
    last  = (fs.get("last_name")  or "").strip()
    company_display = (fs.get("company_display") or "").strip()

    # ── 3. Deduct atomically BEFORE any paid work.
    from app.services.auth import deduct_credits_atomic
    from app.config import CREDIT_COSTS
    cost = int(CREDIT_COSTS.get("reveal_email", 8))
    ok, remaining = deduct_credits_atomic(uid, cost, "reveal_email")
    if not ok:
        return jsonify({
            "error":    "insufficient_credits",
            "required": cost,
            "have":     remaining,
        }), 402

    # ── 4. Hunter. Any exception → refund (safely) and return provider_error.
    try:
        from app.services.hunter import get_verified_email
        result = get_verified_email(
            pdl_email=None,
            first_name=first,
            last_name=last,
            company=company_display,
        ) or {}
    except Exception as exc:
        logger.warning(
            "reveal: Hunter call raised uid=%s cid=%s: %s",
            uid, candidate_id, exc,
        )
        _try_refund(uid, cost, "reveal_email_refund")
        return jsonify({
            "email":    None,
            "verified": False,
            "reason":   "provider_error",
            "cached":   False,
            "charged":  False,
        })

    email      = (result.get("email") or "").strip() or None
    verified   = bool(result.get("email_verified"))
    source     = result.get("email_source") or ""
    try:
        confidence = int(result.get("score") or result.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0

    # Refund unless we have deliverability evidence: SMTP-verified OR
    # Hunter Email Finder with confidence >= threshold. Synthesized
    # sources (pattern / domain_generated / pdl_fallback) never charge.
    charge_worthy = bool(
        email and (
            verified
            or (source == "hunter_finder" and confidence >= REVEAL_CHARGE_MIN_CONFIDENCE)
        )
    )

    if not charge_worthy:
        _try_refund(uid, cost, "reveal_email_refund")
        return jsonify({
            "email":      email,
            "verified":   verified,
            "source":     source,
            "confidence": confidence,
            "reason":     "no_email_found" if not email else "below_confidence_threshold",
            "cached":     False,
            "charged":    False,
        })

    # ── 5. Charge-worthy: write cache + event. Failures here do NOT
    # cost the user the charge — they got the email in the response and
    # kept the value (see reveal-email safety trace in the handoff doc).
    try:
        cache_ref.set({
            "candidate_id": candidate_id,
            "email":        email,
            "verified":     verified,
            "source":       source,
            "confidence":   confidence,
            "revealed_at":  datetime.now(timezone.utc).isoformat(),
            "revealed_ts":  firestore.SERVER_TIMESTAMP,
        })
    except Exception as exc:
        logger.warning(
            "reveal: cache write failed uid=%s cid=%s: %s "
            "(user still gets email + charge; next call will re-Hunter)",
            uid, candidate_id, exc,
        )

    # Reveal event doc_id is deliberately NOT deck-scoped.
    # Reveal is a commercial event (credit-spend), not a training
    # signal — training labels come from person_swipe_* events which
    # ARE deck-scoped. features_snapshot.deck_id preserves the join
    # back to the deck context for the latest reveal. See handoff doc.
    log_recommendation_event(
        event_type="email_revealed",
        uid=uid,
        contact_id=candidate_id,
        contact_email=email or "",
        model_version="person_ranker_v0",
        surface="ios_swipe_deck",
        features_snapshot={
            "deck_id":    deck_id,
            "confidence": confidence,
            "source":     source,
        },
        attribution_source="ranker_deck",
        extra={"cost_credits": cost},
        doc_id=f"email_revealed_{uid}_{candidate_id}",
    )

    return jsonify({
        "email":      email,
        "verified":   verified,
        "source":     source,
        "confidence": confidence,
        "cached":     False,
        "charged":    True,
    })
