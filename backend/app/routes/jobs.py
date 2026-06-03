"""
Jobs API routes — feed, feedback, and filters.
"""
from flask import Blueprint, jsonify, request
from backend.app.extensions import require_firebase_auth, get_db
from backend.app.utils.job_ranking import (
    prefilter_candidates,
    rank_with_gpt,
    apply_feedback_adjustments,
    cap_per_company,
    attach_signals_and_buckets,
    _is_excluded as _is_excluded_job,
    _is_non_us as _is_international_job,
)
from backend.app.job_ranking_config import get_active_profile
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
import logging
import threading

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Phase 1: signals + bucket attachment on cached top_jobs + per-render telemetry
# ---------------------------------------------------------------------------

def _attach_signals_from_cache(top_jobs: list, cache: dict) -> list:
    """Attach signals + bucket fields to cached top_jobs.

    Defensive: missing cache keys default to empty dicts, so old cache
    entries written before phase 1 produce signals=None / bucket=None on
    each job (the FeedJob type marks both optional).
    """
    cached_signals = (cache or {}).get("signals") or {}
    cached_buckets = (cache or {}).get("buckets") or {}
    for j in top_jobs:
        jid = j.get("job_id")
        j["signals"] = cached_signals.get(jid)
        j["bucket"] = cached_buckets.get(jid)
    return top_jobs


def _build_telemetry_update(top_jobs: list) -> dict:
    """Build the Firestore update dict for one feed render.

    Aggregates bucket counts and signal sums across the rendered top_jobs
    list. All values use Increment so concurrent renders for the same
    (date, uid) merge cleanly without transactions.
    """
    from google.cloud.firestore_v1.transforms import Sentinel, SERVER_TIMESTAMP
    from google.cloud.firestore_v1 import Increment

    bucket_totals = {"strong": 0, "reach": 0, "hidden": 0}
    signal_sums = {"relevance": 0.0, "landability": 0.0, "pipeline": 0.0, "discovery": 0.0}
    signal_counts = {"relevance": 0, "landability": 0, "pipeline": 0, "discovery": 0}
    for j in top_jobs:
        b = j.get("bucket")
        if b in bucket_totals:
            bucket_totals[b] += 1
        sig = j.get("signals") or {}
        for k in signal_sums:
            v = sig.get(k)
            if v is None:
                continue
            signal_sums[k] += float(v)
            signal_counts[k] += 1

    updates: dict = {
        "n_renders": Increment(1),
        "last_rendered_at": SERVER_TIMESTAMP,
    }
    for b, n in bucket_totals.items():
        updates[f"bucket_totals.{b}"] = Increment(n)
    for k, s in signal_sums.items():
        updates[f"signal_sums.{k}"] = Increment(s)
    for k, c in signal_counts.items():
        updates[f"signal_counts.{k}"] = Increment(c)
    return updates


def _write_telemetry_async(uid: str, top_jobs: list) -> None:
    """Fire-and-forget telemetry write. One doc per (date, uid), merged."""
    def _do():
        try:
            db = get_db()
            if db is None:
                return
            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            doc_id = f"{date_str}__{uid}"
            updates = _build_telemetry_update(top_jobs)
            updates["uid"] = uid
            updates["date"] = date_str
            db.collection("feed_telemetry").document(doc_id).set(updates, merge=True)
        except Exception as e:
            logger.warning("feed_telemetry write failed for %s: %s", uid, e)
    try:
        _ranking_pool.submit(_do)
    except Exception:
        # If the pool refuses (e.g., shutdown), drop telemetry silently.
        pass

jobs_bp = Blueprint("jobs", __name__)

_filters_cache = {"data": None, "cached_at": None}
FILTERS_CACHE_TTL = 3600

_ranking_lock = threading.Lock()
_ranking_in_progress = set()  # UIDs currently being re-ranked
_ranking_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="job-rank")

_pipeline_summary_cache = {"data": None, "cached_at": 0.0}
PIPELINE_SUMMARY_TTL = 60  # seconds


def _format_freshness(minutes: int | None) -> str:
    if minutes is None:
        return "Unknown"
    if minutes < 2:
        return "Just now"
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h ago"
    days = hours // 24
    return f"{days}d ago"


def _get_pipeline_summary() -> dict:
    """Return {last_pipeline_run, freshness_label, stale} for the feed response.

    Cached in-process for PIPELINE_SUMMARY_TTL seconds. Safe no-op shape on any error.
    """
    import time
    now = time.time()
    cached = _pipeline_summary_cache.get("data")
    if cached is not None and (now - _pipeline_summary_cache.get("cached_at", 0)) < PIPELINE_SUMMARY_TTL:
        return cached

    summary = {"last_pipeline_run": None, "freshness_label": "Unknown", "stale": True}
    try:
        db = get_db()
        if not db:
            return summary
        query = (
            db.collection("pipeline_runs")
            .order_by("started_at", direction="DESCENDING")
            .limit(5)
        )
        for doc in query.stream():
            data = doc.to_dict() or {}
            mode = data.get("mode")
            ok = data.get("ok", data.get("error") is None)
            if not ok or mode not in ("full", "fantastic-only", "skip-fantastic"):
                continue
            started = data.get("started_at")
            if started is None:
                continue
            try:
                delta = datetime.now(timezone.utc) - started
                minutes = int(delta.total_seconds() // 60)
            except Exception:
                continue
            summary = {
                "last_pipeline_run": started.isoformat() if hasattr(started, "isoformat") else None,
                "freshness_label": _format_freshness(minutes),
                "stale": minutes > 360,  # >6h
            }
            break
    except Exception:
        logger.warning("pipeline summary lookup failed", exc_info=True)

    _pipeline_summary_cache["data"] = summary
    _pipeline_summary_cache["cached_at"] = now
    return summary


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


import re as _re

_TITLE_NOISE_RE = _re.compile(
    r"\s*[\(\[\-–—|/,]\s*(full[\s-]?time|part[\s-]?time|contract|temporary|temp|seasonal|"
    r"remote|hybrid|on[\s-]?site|in[\s-]?person|i+|ii+|iii+|iv|v|jr|sr|junior|senior|"
    r"associate|lead|level\s*\d+|l\d+|\d+|w\d+\b|location|posted|new)"
    r"[^a-z0-9]*.*$",
    _re.IGNORECASE,
)


def _normalize_title(title: str | None) -> str:
    """Collapse title variants like 'Teller (Full Time)' / 'Teller (Part Time)' to 'teller'."""
    if not title:
        return ""
    t = title.lower().strip()
    t = _TITLE_NOISE_RE.sub("", t)
    t = _re.sub(r"\s+", " ", t).strip(" -–—|/,([")
    return t


def _dedup_by_title_company(jobs: list[dict]) -> list[dict]:
    """Deduplicate jobs by (normalized_title, company), keeping the higher-scored one.

    Normalization collapses 'Teller (Full Time)' and 'Teller (Part Time)' into
    one bucket so they no longer escape `cap_per_company`.
    """
    seen = {}
    for job in jobs:
        key = (_normalize_title(job.get("title")), (job.get("company") or "").lower().strip())
        existing = seen.get(key)
        if existing is None or (job.get("match_score") or 0) > (existing.get("match_score") or 0):
            seen[key] = job
    return sorted(seen.values(), key=lambda j: j.get("match_score") or 0, reverse=True)


def _serialize_jobs(jobs: list[dict]) -> list[dict]:
    """Convert Firestore timestamps to ISO strings, strip large/internal fields."""
    cleaned = []
    for job in jobs:
        doc = dict(job)
        for ts_field in ("posted_at", "fetched_at", "expires_at"):
            val = doc.get(ts_field)
            if val is not None and hasattr(val, "isoformat"):
                doc[ts_field] = val.isoformat()
        # Phase 1 structured payload: serialize its enriched_at timestamp
        structured = doc.get("structured")
        if isinstance(structured, dict):
            sd = dict(structured)
            ea = sd.get("enriched_at")
            if ea is not None and hasattr(ea, "isoformat"):
                sd["enriched_at"] = ea.isoformat()
            doc["structured"] = sd
        doc.pop("description_raw", None)
        # 12KB embedding vector — internal only, never send to the SPA
        doc.pop("titleEmbedding", None)
        cleaned.append(doc)
    return cleaned


def _derive_match_signals(job: dict, profile: dict | None, saved_companies: set[str]) -> list[str]:
    """Build the multi-line 'Why this ranked' signals shown in the editorial UI.

    The ranker only stores a single `match_reason` string; this expands that
    into the bullet-list shape the design expects without re-running GPT.
    """
    profile = profile or {}
    signals: list[str] = []

    reason = (job.get("match_reason") or "").strip()
    if reason:
        signals.append(reason)

    company = (job.get("company") or "").strip()
    if company and company.lower() in saved_companies:
        signals.append(f"{company} is on your saved-companies list")

    posted_at = job.get("posted_at")
    if posted_at is not None:
        try:
            ts = posted_at if isinstance(posted_at, datetime) else None
            if ts and ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts:
                delta_hours = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
                if delta_hours <= 24:
                    signals.append("Posted within the last 24 hours")
                elif delta_hours >= 24 * 10:
                    signals.append(f"Posted {int(delta_hours / 24)} days ago — may be stale")
        except Exception:
            pass

    loc_raw = job.get("location")
    if isinstance(loc_raw, dict):
        loc = " ".join(str(v) for v in loc_raw.values() if v).strip()
    elif isinstance(loc_raw, str):
        loc = loc_raw.strip()
    else:
        loc = ""
    target_locs = profile.get("targetLocations") or profile.get("preferredLocations") or []
    if loc and target_locs:
        if any(t and t.lower() in loc.lower() for t in target_locs if isinstance(t, str)):
            signals.append(f"{loc} matches your geo preferences")

    school = (profile.get("university") or profile.get("school") or "").strip()
    if school and (job.get("alumni_count") or 0) > 0:
        signals.append(f"{job['alumni_count']} {school} alum{'i' if job['alumni_count'] != 1 else 'us'} on team")

    return signals[:4]


# ---------------------------------------------------------------------------
# GET /api/jobs/feed
# ---------------------------------------------------------------------------

@jobs_bp.route("/api/jobs/feed", methods=["GET"])
@require_firebase_auth
def get_feed():
    uid = request.firebase_user["uid"]
    db = get_db()
    now = datetime.now(timezone.utc)
    refresh = request.args.get("refresh", "").lower() == "true"
    # Phase 2 escape hatch: ?ungated=true skips hard intent gates even when
    # the feature flag is on for this user. Useful for "Show all" toggle.
    ungated = request.args.get("ungated", "").lower() == "true"

    # Load user profile
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()
    if not user_doc.exists:
        return jsonify({"error": "User not found"}), 404

    # Clear cache on explicit refresh OR ungated toggle (different feed shape)
    if refresh or ungated:
        user_ref.update({"jobFeedCache": None})

    profile = user_doc.to_dict()

    # ----- Phase 2: hard intent gates (feature-flag gated) ---------------
    # Built once per request so all 4 return paths can call _apply_gates().
    from backend.app.services import feature_flags
    from backend.app.utils.intent_gates import (
        build_user_intent, apply_intent_gates, intent_hash, expand_intent_with_pdl,
    )

    _gating_on = (
        not ungated
        and feature_flags.is_enabled("hardIntentGating", uid=uid, default=False)
    )
    _user_intent = build_user_intent(profile) if _gating_on else None
    # Independent flag — flippable without touching the gates themselves.
    # When on, augments career_interests with PDL synonyms so jobs titled
    # "Associate Product Manager" pass the gate for users who picked
    # "Product Manager".
    if _user_intent and feature_flags.is_enabled(
        "pdlInterestExpansion", uid=uid, default=False
    ):
        _user_intent = expand_intent_with_pdl(_user_intent)
    _intent_hash_str = intent_hash(_user_intent) if _user_intent else None

    def _apply_gates(new_matches, top_jobs):
        """Return (new_matches, top_jobs, gated_dict) honoring flag + ungated."""
        if not _gating_on or _user_intent is None:
            return new_matches, top_jobs, {
                "by_level": 0, "by_location": 0, "by_interest": 0,
                "applied": False, "ungated": ungated,
            }
        gated_top, counts = apply_intent_gates(top_jobs, _user_intent)
        gated_new, counts_new = apply_intent_gates(new_matches, _user_intent)
        for k in ("by_level", "by_location", "by_interest"):
            counts[k] = counts.get(k, 0) + counts_new.get(k, 0)
        counts["applied"] = True
        counts["ungated"] = False
        counts["intent_hash"] = _intent_hash_str
        return gated_new, gated_top, counts

    # Load negative-signal job_ids so dismissed rows stop reappearing.
    dismissed_ids: set[str] = set()
    try:
        prefs_snap = (
            user_ref.collection("jobPreferences")
            .where("signal", "==", "negative")
            .stream()
        )
        for d in prefs_snap:
            pd = d.to_dict() or {}
            jid = pd.get("job_id") or d.id
            if jid:
                dismissed_ids.add(jid)
    except Exception as e:
        logger.debug(f"could not load dismissed jobs for {uid}: {e}")

    saved_companies: set[str] = set()
    try:
        saved_snap = user_ref.collection("savedJobs").stream()
        for d in saved_snap:
            sd = d.to_dict() or {}
            co = (sd.get("company") or "").strip().lower()
            if co:
                saved_companies.add(co)
    except Exception:
        pass

    def _enrich(jobs: list[dict]) -> list[dict]:
        """Filter dismissed jobs and attach the editorial match_signals array."""
        out: list[dict] = []
        for j in jobs:
            jid = j.get("job_id")
            if jid and jid in dismissed_ids:
                continue
            j["match_signals"] = _derive_match_signals(j, profile, saved_companies)
            out.append(j)
        return out

    # Check cache
    cache = profile.get("jobFeedCache") or {}
    cache_ranked_at = cache.get("ranked_at")
    cache_valid = False
    if cache_ranked_at and not refresh:
        if hasattr(cache_ranked_at, "timestamp"):
            cache_age = (now - cache_ranked_at.replace(tzinfo=timezone.utc)).total_seconds()
        elif hasattr(cache_ranked_at, "isoformat"):
            cache_age = (now - cache_ranked_at).total_seconds()
        else:
            cache_age = float("inf")
        cache_valid = cache_age < 1800
        cache_stale_ok = not cache_valid and cache_age < 7200  # 2 hours
    else:
        cache_stale_ok = False

    # Check new_matches cache (short TTL — 5 min)
    nm_cache = cache.get("new_matches_cache") or {}
    nm_cached_at = nm_cache.get("cached_at")
    nm_valid = False
    if nm_cached_at and not refresh:
        if hasattr(nm_cached_at, "timestamp"):
            nm_age = (now - nm_cached_at.replace(tzinfo=timezone.utc)).total_seconds()
        elif hasattr(nm_cached_at, "isoformat"):
            nm_age = (now - nm_cached_at).total_seconds()
        else:
            nm_age = float("inf")
        nm_valid = nm_age < 300  # 5 minutes

    twenty_four_hours_ago = now - timedelta(hours=24)

    def _fetch_new_matches(cached_scores=None, cached_reasons=None):
        """Fetch new_matches from Firestore, or return from cache if fresh."""
        if nm_valid:
            return nm_cache.get("jobs", []), True
        # Pull a wider window so dedup + cap_per_company have headroom to keep 20 varied results
        new_query = (
            db.collection("jobs")
            .where("posted_at", ">=", twenty_four_hours_ago)
            .order_by("posted_at", direction="DESCENDING")
            .limit(120)
        )
        raw = []
        for d in new_query.stream():
            j = d.to_dict()
            if _is_international_job(j) or _is_excluded_job(j):
                continue
            jid = j.get("job_id", d.id)
            if cached_scores:
                j["match_score"] = cached_scores.get(jid)
                j["match_reason"] = (cached_reasons or {}).get(jid)
                j["ranked"] = j["match_score"] is not None
            else:
                j["match_score"] = None
                j["match_reason"] = None
                j["ranked"] = False
            raw.append(j)

        # Collapse title variants ("Teller (Full Time)" + "Teller (Part Time)" → one),
        # then cap to max 2 per company so a single batch poster can't fill the feed.
        deduped = _dedup_by_title_company(raw)
        # _dedup_by_title_company sorts by score; for unranked new_matches we want recency.
        deduped.sort(key=lambda j: (j.get("posted_at") or 0), reverse=True)
        new_matches = cap_per_company(deduped, max_per_company=2)[:20]
        # Persist new_matches to cache (fire-and-forget)
        try:
            user_ref.update({
                "jobFeedCache.new_matches_cache": {
                    "jobs": _serialize_jobs(new_matches),
                    "cached_at": now,
                }
            })
        except Exception:
            pass
        return new_matches, False

    def _load_top_jobs_from_cache(cached_ids, cached_scores, cached_reasons):
        """Hydrate top_jobs from cached job IDs."""
        top_jobs = []
        if cached_ids:
            for i in range(0, len(cached_ids), 100):
                chunk = cached_ids[i:i + 100]
                refs = [db.collection("jobs").document(jid) for jid in chunk]
                docs = db.get_all(refs)
                for d in docs:
                    if d.exists:
                        j = d.to_dict()
                        jid = j.get("job_id", d.id)
                        j["match_score"] = cached_scores.get(jid)
                        j["match_reason"] = cached_reasons.get(jid)
                        j["ranked"] = j["match_score"] is not None
                        top_jobs.append(j)
            top_jobs.sort(key=lambda j: j.get("match_score") or 0, reverse=True)
        return top_jobs

    if cache_valid:
        cached_ids = cache.get("job_ids", [])
        cached_scores = cache.get("scores", {})
        cached_reasons = cache.get("reasons", {})
        top_jobs = _enrich(_load_top_jobs_from_cache(cached_ids, cached_scores, cached_reasons))
        top_jobs = _attach_signals_from_cache(top_jobs, cache)
        new_matches_raw, nm_from_cache = _fetch_new_matches(cached_scores, cached_reasons)
        new_matches = _enrich(new_matches_raw)
        new_matches, top_jobs, gated_info = _apply_gates(new_matches, top_jobs)
        _write_telemetry_async(uid, top_jobs)

        return jsonify({
            "new_matches": _serialize_jobs(new_matches) if not nm_from_cache else new_matches,
            "top_jobs": _serialize_jobs(top_jobs),
            "new_matches_count": len(new_matches),
            "top_jobs_count": len(top_jobs),
            "ranked": True,
            "no_resume": False,
            "cached": True,
            "summary": _get_pipeline_summary(),
            "gated": gated_info,
        })

    if not cache_valid and cache_stale_ok:
        cached_ids = cache.get("job_ids", [])
        cached_scores = cache.get("scores", {})
        cached_reasons = cache.get("reasons", {})
        top_jobs = _enrich(_load_top_jobs_from_cache(cached_ids, cached_scores, cached_reasons))
        top_jobs = _attach_signals_from_cache(top_jobs, cache)
        new_matches_raw, nm_from_cache = _fetch_new_matches(cached_scores, cached_reasons)
        new_matches = _enrich(new_matches_raw)

        # Trigger background re-rank if not already in progress
        if uid not in _ranking_in_progress:
            _ranking_in_progress.add(uid)
            _ranking_pool.submit(_background_rerank, uid)
            logger.info(f"Triggered background re-rank for {uid}")

        new_matches, top_jobs, gated_info = _apply_gates(new_matches, top_jobs)
        _write_telemetry_async(uid, top_jobs)
        return jsonify({
            "new_matches": _serialize_jobs(new_matches) if not nm_from_cache else new_matches,
            "top_jobs": _serialize_jobs(top_jobs),
            "new_matches_count": len(new_matches),
            "top_jobs_count": len(top_jobs),
            "ranked": True,
            "no_resume": False,
            "cached": True,
            "stale": True,
            "summary": _get_pipeline_summary(),
            "gated": gated_info,
        })

    # No resume — return unranked jobs by recency
    has_resume = bool(profile.get("resumeParsed") or profile.get("resumeText"))
    if not has_resume:
        new_matches_raw, nm_from_cache = _fetch_new_matches()
        new_matches = _enrich(new_matches_raw)
        top_query = (
            db.collection("jobs")
            .order_by("posted_at", direction="DESCENDING")
            .limit(80)
        )
        top_jobs = [d.to_dict() for d in top_query.stream()]
        top_jobs = [j for j in top_jobs if not _is_international_job(j) and not _is_excluded_job(j)]
        top_jobs = cap_per_company(top_jobs, max_per_company=3)[:50]
        for j in top_jobs:
            j["match_score"] = None
            j["match_reason"] = None
            j["ranked"] = False
        top_jobs = _enrich(top_jobs)
        new_matches, top_jobs, gated_info = _apply_gates(new_matches, top_jobs)
        _write_telemetry_async(uid, top_jobs)

        return jsonify({
            "new_matches": _serialize_jobs(new_matches) if not nm_from_cache else new_matches,
            "top_jobs": _serialize_jobs(top_jobs),
            "new_matches_count": len(new_matches),
            "top_jobs_count": len(top_jobs),
            "ranked": False,
            "no_resume": True,
            "cached": False,
            "summary": _get_pipeline_summary(),
            "gated": gated_info,
        })

    # Has resume but no cache — return unranked jobs immediately, rank in background
    top_query = (
        db.collection("jobs")
        .order_by("posted_at", direction="DESCENDING")
        .limit(80)
    )
    top_jobs = [d.to_dict() for d in top_query.stream()]
    top_jobs = [j for j in top_jobs if not _is_international_job(j) and not _is_excluded_job(j)]
    top_jobs = cap_per_company(top_jobs, max_per_company=3)[:50]
    for j in top_jobs:
        j["match_score"] = None
        j["match_reason"] = None
        j["ranked"] = False
    top_jobs = _enrich(top_jobs)

    new_matches_raw, nm_from_cache = _fetch_new_matches()
    new_matches = _enrich(new_matches_raw)

    # Trigger background ranking so next load is fast
    if uid not in _ranking_in_progress:
        _ranking_in_progress.add(uid)
        t = threading.Thread(target=_background_rerank, args=(uid,), daemon=True)
        t.start()
        logger.info(f"Triggered background ranking for {uid} (first visit)")

    new_matches, top_jobs, gated_info = _apply_gates(new_matches, top_jobs)
    _write_telemetry_async(uid, top_jobs)
    return jsonify({
        "new_matches": _serialize_jobs(new_matches) if not nm_from_cache else new_matches,
        "top_jobs": _serialize_jobs(top_jobs),
        "new_matches_count": len(new_matches),
        "top_jobs_count": len(top_jobs),
        "ranked": False,
        "no_resume": False,
        "cached": False,
        "ranking_in_progress": True,
        "summary": _get_pipeline_summary(),
        "gated": gated_info,
    })


def _is_recent(posted_at, cutoff: datetime) -> bool:
    """Check if a posted_at value is after the cutoff."""
    if posted_at is None:
        return False
    if hasattr(posted_at, "timestamp"):
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    return posted_at >= cutoff


def _get_posted_at_ts(job: dict) -> datetime:
    """Get posted_at as a timezone-aware datetime for sorting."""
    val = job.get("posted_at")
    if val is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if hasattr(val, "timestamp") and val.tzinfo is None:
        return val.replace(tzinfo=timezone.utc)
    return val


def _background_rerank(uid: str):
    """Re-rank jobs in background thread and update cache."""
    try:
        from backend.app.extensions import get_db
        db = get_db()
        now = datetime.now(timezone.utc)

        user_ref = db.collection("users").document(uid)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return
        profile = user_doc.to_dict()

        has_resume = bool(profile.get("resumeParsed") or profile.get("resumeText"))
        if not has_resume:
            return

        all_query = (
            db.collection("jobs")
            .order_by("posted_at", direction="DESCENDING")
            .limit(500)
        )
        all_jobs = [doc.to_dict() for doc in all_query.stream()]

        # Filter out international and senior/irrelevant jobs
        all_jobs = [j for j in all_jobs if not _is_international_job(j) and not _is_excluded_job(j)]

        prefs_query = user_ref.collection("jobPreferences").limit(100)
        preferences = [doc.to_dict() for doc in prefs_query.stream()]

        # Try semantic embedding-based prefilter (text-embedding-3-small),
        # gated by feature flag for safe rollout. Falls back to deterministic
        # keyword scoring if embeddings unavailable or flag disabled.
        from backend.app.services import feature_flags
        candidates = []
        if feature_flags.is_enabled("embedding_ranker", uid=uid, default=False):
            from backend.app.utils.embedding_ranker import embedding_rank
            candidates = embedding_rank(all_jobs, profile, uid, top_n=50)
            if candidates:
                logger.info(
                    "Embedding rank: top score %.1f, bottom %.1f (%d candidates)",
                    candidates[0].get("_embedding_score", 0),
                    candidates[-1].get("_embedding_score", 0),
                    len(candidates),
                )
            else:
                logger.info("Embedding rank returned empty, falling back to deterministic")
        if not candidates:
            candidates = prefilter_candidates(all_jobs, profile, top_n=50)
        ranked = rank_with_gpt(candidates, profile)
        adjusted = apply_feedback_adjustments(ranked, preferences)

        # Deduplicate by title + company, cap per company, then take top 50
        deduped = _dedup_by_title_company(adjusted)
        top_jobs = cap_per_company(deduped, max_per_company=3)[:50]

        # Phase 1: attach four signals + natural bucket + replace match_score
        # with the composite. Hard-drops on landability < hard_drop floor
        # also happen here. Under the default config, composite == relevance
        # so match_score is numerically unchanged.
        top_jobs = attach_signals_and_buckets(top_jobs, get_active_profile(), profile)

        cache_data = {
            "job_ids": [j["job_id"] for j in top_jobs],
            "scores": {j["job_id"]: j.get("match_score") for j in top_jobs},
            "reasons": {j["job_id"]: j.get("match_reason") for j in top_jobs},
            "signals": {j["job_id"]: j.get("signals") for j in top_jobs},
            "buckets": {j["job_id"]: j.get("bucket") for j in top_jobs},
            "ranked_at": datetime.now(timezone.utc),
        }
        user_ref.update({"jobFeedCache": cache_data})
        logger.info(f"Background re-rank complete for {uid}")
    except Exception as e:
        logger.warning(f"Background re-rank failed for {uid}: {e}")
    finally:
        _ranking_in_progress.discard(uid)


# ---------------------------------------------------------------------------
# GET /api/jobs/<job_id>
# ---------------------------------------------------------------------------

@jobs_bp.route("/api/jobs/<job_id>", methods=["GET"])
@require_firebase_auth
def get_job_detail(job_id: str):
    db = get_db()
    doc = db.collection("jobs").document(job_id).get()
    if not doc.exists:
        return jsonify({"error": "Job not found"}), 404
    job = doc.to_dict()
    # Serialize timestamps
    for ts_field in ("posted_at", "fetched_at", "expires_at"):
        val = job.get(ts_field)
        if val is not None and hasattr(val, "isoformat"):
            job[ts_field] = val.isoformat()
    return jsonify(job)


# ---------------------------------------------------------------------------
# POST /api/jobs/feedback
# ---------------------------------------------------------------------------

@jobs_bp.route("/api/jobs/feedback", methods=["POST"])
@require_firebase_auth
def post_feedback():
    uid = request.firebase_user["uid"]
    db = get_db()
    data = request.get_json(silent=True) or {}

    job_id = data.get("job_id")
    signal = data.get("signal")

    if not job_id:
        return jsonify({"error": "job_id is required"}), 400
    if signal not in ("positive", "negative"):
        return jsonify({"error": "signal must be 'positive' or 'negative'"}), 400

    pref_doc = {
        "job_id": job_id,
        "signal": signal,
        "company": data.get("company"),
        "category": data.get("category"),
        "created_at": datetime.now(timezone.utc),
    }
    db.collection("users").document(uid).collection("jobPreferences").document(job_id).set(pref_doc)

    # Invalidate cache
    db.collection("users").document(uid).update({"jobFeedCache.ranked_at": None})

    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# GET /api/jobs/filters
# ---------------------------------------------------------------------------

@jobs_bp.route("/api/jobs/filters", methods=["GET"])
@require_firebase_auth
def get_filters():
    now = datetime.now(timezone.utc)

    # Check module-level cache
    if (
        _filters_cache["data"] is not None
        and _filters_cache["cached_at"] is not None
        and (now - _filters_cache["cached_at"]).total_seconds() < FILTERS_CACHE_TTL
    ):
        return jsonify(_filters_cache["data"])

    db = get_db()
    types = set()
    categories = set()
    total = 0

    query = db.collection("jobs").limit(500)
    for doc in query.stream():
        d = doc.to_dict()
        total += 1
        if d.get("type"):
            types.add(d["type"])
        if d.get("category"):
            categories.add(d["category"])

    result = {
        "types": sorted(types),
        "categories": sorted(categories),
        "total_jobs": total,
    }
    _filters_cache["data"] = result
    _filters_cache["cached_at"] = now

    return jsonify(result)
