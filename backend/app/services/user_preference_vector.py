"""
User preference vector — composes Phase 1 onboarding signals into an embedding
that seeds the Phase 2 job matcher.

Sources composed (in decreasing weight):
  1. onboardingExtract.top_skills + target_industries (from Haiku inference)
  2. onboardingExtract.seniority (intern/new_grad/junior)
  3. onboardingTasteTest.liked_job_ids (5+ real jobs the user picked)
  4. resumeParsed (via the existing embedding_ranker._resume_text distillation)
  5. profile goals.careerTrack + careerInterests

Design decisions:
- Single embedding, not a bag of embeddings. Cheaper to store and query, and
  the combined text captures cross-signal semantics (e.g. "PyTorch + ML
  research + biotech" is meaningfully different from "PyTorch + IB").
- Cache hash includes all input sources so any Phase 1 field change
  invalidates the cached vector.
- Fail-soft: if the LLM extract is missing OR taste test is missing OR
  resume is missing, we still return whatever we can. The ranker prefers
  a partial vector over no vector.
- Written to users/{uid}.preferenceVector alongside the existing
  resumeEmbedding field. Keeps them separate so downstream code that only
  cares about resume matching (e.g. cover letter generation) is unaffected.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8", errors="ignore")).hexdigest()[:16]


def _seniority_expansion(seniority: Optional[str]) -> str:
    """Expand seniority tag to natural language for stronger embedding signal."""
    mapping = {
        "intern": "Currently a student seeking internships and summer roles",
        "new_grad": "Graduating soon seeking new grad full-time roles",
        "junior": "Early career professional seeking junior to mid-level roles",
    }
    if seniority in mapping:
        return mapping[seniority]
    return ""


def _liked_job_ids_expansion(liked_job_ids: list[str], db=None) -> str:
    """Look up the taste-test jobs and produce a compact multi-role summary.

    Returns text like "Roles I like: SWE Intern @ Stripe; ML Intern @ Anthropic;
    ..." — surfaces the pattern in what the user picked so the embedding
    reflects taste, not just declared preferences.
    """
    if not liked_job_ids:
        return ""

    if db is None:
        try:
            from backend.app.extensions import get_db
            db = get_db()
        except Exception:
            return ""
    if db is None:
        return ""

    parts = []
    try:
        refs = [db.collection("jobs").document(jid) for jid in liked_job_ids[:10]]
        docs = db.get_all(refs)
        for d in docs:
            if not d.exists:
                continue
            data = d.to_dict() or {}
            title = data.get("title") or ""
            company = data.get("company") or ""
            if title and company:
                parts.append(f"{title} @ {company}")
            elif title:
                parts.append(title)
    except Exception as e:
        logger.warning("user_preference_vector: taste-test lookup failed: %s", e)
        return ""

    if not parts:
        return ""
    return "Roles I like: " + "; ".join(parts)


def compose_preference_text(profile: dict, db=None) -> str:
    """Build the natural-language input that will be embedded.

    Highest-signal fields come first so short-input attention weighs them.
    """
    parts: list[str] = []

    extract = profile.get("onboardingExtract") or {}
    top_skills = extract.get("top_skills") or []
    target_industries = extract.get("target_industries") or []
    seniority = extract.get("seniority")

    # 1. Seniority framing (short but strong signal)
    seniority_text = _seniority_expansion(seniority)
    if seniority_text:
        parts.append(seniority_text)

    # 2. Target industries (top-of-file, drives industry alignment)
    if target_industries:
        parts.append("Target industries: " + ", ".join(target_industries[:10]))

    # 3. Top skills (drives skill-based match)
    if top_skills:
        parts.append("Top skills: " + ", ".join(top_skills[:20]))

    # 4. Taste-test job titles (real revealed preference)
    taste_test = profile.get("onboardingTasteTest") or {}
    liked_ids = taste_test.get("liked_job_ids") or []
    if liked_ids:
        expanded = _liked_job_ids_expansion(liked_ids, db=db)
        if expanded:
            parts.append(expanded)

    # 5. Career track + interests (declared preferences)
    goals = profile.get("goals") or {}
    track = goals.get("careerTrack")
    if isinstance(track, str) and track.strip():
        parts.append(f"Target career track: {track.strip()}")
    interests = goals.get("careerInterests")
    if isinstance(interests, list):
        clean_interests = [i for i in interests if isinstance(i, str) and i.strip()]
        if clean_interests:
            parts.append("Career interests: " + ", ".join(clean_interests))

    # 6. Compact resume signal (major + school + recent experience titles)
    rp = profile.get("resumeParsed") or {}
    if rp:
        edu = rp.get("education") or {}
        major = edu.get("major") if isinstance(edu, dict) else None
        school = None
        if isinstance(edu, dict):
            school = edu.get("school") or edu.get("university")
        if not major:
            major = profile.get("major")
        if not school:
            school = profile.get("university")
        if major:
            parts.append(f"Major: {major}")
        if school:
            parts.append(f"School: {school}")

        work = rp.get("experience") or rp.get("workExperience") or []
        if isinstance(work, list):
            titles = []
            for w in work[:5]:
                if isinstance(w, dict):
                    t = w.get("title") or w.get("position") or w.get("role")
                    c = w.get("company") or w.get("employer")
                    if isinstance(t, str):
                        titles.append(f"{t} at {c}" if isinstance(c, str) else t)
            if titles:
                parts.append("Recent experience: " + "; ".join(titles))

    return "\n".join(parts).strip()


def get_preference_vector(uid: str, profile: dict, db=None) -> Optional[list[float]]:
    """Return the user's cached preference vector, or compute + cache one.

    Cache key includes all Phase 1 input fields, so any change (user
    edits skills, retakes taste test, uploads new resume) invalidates.
    """
    text = compose_preference_text(profile, db=db)
    if not text:
        return None

    text_hash = _hash(text)

    cached = profile.get("preferenceVector")
    cached_hash = profile.get("preferenceVectorHash")
    from backend.app.utils.embedding_ranker import EMBEDDING_DIM
    if (
        isinstance(cached, list)
        and len(cached) == EMBEDDING_DIM
        and cached_hash == text_hash
    ):
        return cached

    # Reuse the same batch-embed path as the resume path so we share retry
    # logic, timeout config, and any future model changes.
    from backend.app.utils.embedding_ranker import _embed_batch
    embs = _embed_batch([text])
    emb = embs[0] if embs else None
    if emb is None:
        return None

    if db is None:
        try:
            from backend.app.extensions import get_db
            db = get_db()
        except Exception:
            db = None

    if db is not None and uid:
        try:
            db.collection("users").document(uid).update({
                "preferenceVector": emb,
                "preferenceVectorHash": text_hash,
            })
            logger.info(
                "Cached preference vector for uid=%s (hash=%s, text_len=%d)",
                uid, text_hash, len(text)
            )
        except Exception as e:
            logger.warning("failed to cache preference vector uid=%s: %s", uid, e)

    return emb


def invalidate_preference_vector(uid: str, db=None) -> None:
    """Clear the cached preference vector — next read will recompute.

    Called after any Phase 1 field change that isn't already picked up by
    the hash (paranoid explicit invalidation for out-of-band updates).
    """
    if not uid:
        return
    if db is None:
        try:
            from backend.app.extensions import get_db
            db = get_db()
        except Exception:
            return
    if db is None:
        return

    try:
        from firebase_admin import firestore
        db.collection("users").document(uid).update({
            "preferenceVector": firestore.DELETE_FIELD,
            "preferenceVectorHash": firestore.DELETE_FIELD,
        })
    except Exception as e:
        logger.warning("invalidate_preference_vector failed for %s: %s", uid, e)
