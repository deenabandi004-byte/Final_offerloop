"""
Company contexts service — stores per-user "why this company" context.

Each context lives at users/{uid}/companyContexts/{companyIdNormalized} with:
    - answer: str          — the user's plain-text reason
    - createdAt: str       — ISO timestamp
    - updatedAt: str       — ISO timestamp
    - source: str          — "floating_prompt" | "cold_start" | "manual"

The floating prompt appears when should_show_prompt() returns True for a
company the user is about to email.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.extensions import get_db
from app.models.users import normalize_company

logger = logging.getLogger("company_contexts_service")

# Staleness threshold: re-prompt after 30 days
STALENESS_DAYS = 30

# Minimum outbound drafts to a company before we stop prompting
# (user clearly knows what they want to say)
AUTO_SUPPRESS_THRESHOLD = 5


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Read / Write
# ---------------------------------------------------------------------------

def get_company_context(uid: str, company: str) -> Optional[dict]:
    """
    Read the saved context for a company. Returns the doc dict or None.
    """
    slug = normalize_company(company)
    if not slug:
        return None
    db = get_db()
    ref = (
        db.collection("users").document(uid)
        .collection("companyContexts").document(slug)
    )
    doc = ref.get()
    if doc.exists:
        return doc.to_dict()
    return None


def save_company_context(
    uid: str,
    company: str,
    answer: str,
    source: str = "floating_prompt",
) -> str:
    """
    Save or update a company context. Returns the normalized company slug.
    """
    slug = normalize_company(company)
    if not slug:
        raise ValueError("company name is required")

    db = get_db()
    now = _now_iso()
    ref = (
        db.collection("users").document(uid)
        .collection("companyContexts").document(slug)
    )
    existing = ref.get()

    if existing.exists:
        ref.update({
            "answer": answer.strip(),
            "updatedAt": now,
            "source": source,
        })
    else:
        ref.set({
            "companyRaw": company.strip(),
            "companyNormalized": slug,
            "answer": answer.strip(),
            "source": source,
            "createdAt": now,
            "updatedAt": now,
        })

    return slug


# ---------------------------------------------------------------------------
# Should-show-prompt logic
# ---------------------------------------------------------------------------

def should_show_prompt(uid: str, company: str) -> dict:
    """
    Determine whether to show the "why this company?" floating prompt.

    Returns:
        {
            "show": bool,
            "reason": str,              — why show/hide
            "existingAnswer": str|None, — the saved context if any
            "suggestions": list[str],   — industry-seeded suggestion chips
        }
    """
    slug = normalize_company(company)
    if not slug:
        return {"show": False, "reason": "empty_company", "existingAnswer": None, "suggestions": []}

    db = get_db()

    # 1. Check for existing context
    ctx = get_company_context(uid, company)
    if ctx:
        updated = ctx.get("updatedAt") or ctx.get("createdAt") or ""
        if updated:
            try:
                updated_dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                age = datetime.now(timezone.utc) - updated_dt
                if age < timedelta(days=STALENESS_DAYS):
                    return {
                        "show": False,
                        "reason": "context_fresh",
                        "existingAnswer": ctx.get("answer"),
                        "suggestions": [],
                    }
                # Context is stale — show prompt with existing answer pre-filled
                return {
                    "show": True,
                    "reason": "context_stale",
                    "existingAnswer": ctx.get("answer"),
                    "suggestions": _get_suggestions(uid, company),
                }
            except (ValueError, TypeError):
                pass

    # 2. Check outbound draft count for this company (auto-suppress)
    try:
        drafts_ref = (
            db.collection("users").document(uid)
            .collection("outboundDrafts")
            .where("companyIdNormalized", "==", slug)
        )
        draft_count = sum(1 for _ in drafts_ref.limit(AUTO_SUPPRESS_THRESHOLD + 1).stream())
        if draft_count >= AUTO_SUPPRESS_THRESHOLD:
            return {
                "show": False,
                "reason": "auto_suppressed_high_volume",
                "existingAnswer": None,
                "suggestions": [],
            }
    except Exception as e:
        logger.warning("Failed to check outbound drafts for uid=%s company=%s: %s", uid, slug, e)

    # 3. No context, under threshold → show prompt
    return {
        "show": True,
        "reason": "no_context",
        "existingAnswer": None,
        "suggestions": _get_suggestions(uid, company),
    }


def _get_suggestions(uid: str, company: str) -> list[str]:
    """
    Return industry-seeded suggestion chips for the floating prompt.
    Based on the user's target industries.
    """
    db = get_db()
    try:
        user_doc = db.collection("users").document(uid).get()
        if not user_doc.exists:
            return _default_suggestions()
        user_data = user_doc.to_dict() or {}
    except Exception:
        return _default_suggestions()

    from app.models.users import get_structured_target_industries
    industries = get_structured_target_industries(user_data)

    suggestions = []
    industry_lower = " ".join(industries).lower() if industries else ""

    if "banking" in industry_lower or "finance" in industry_lower:
        suggestions.extend([
            "Strong deal flow and mentorship culture",
            "Top-ranked analyst program",
            "Industry coverage aligns with my interests",
        ])
    elif "consulting" in industry_lower:
        suggestions.extend([
            "Industry practice matches my background",
            "Strong alumni network from my school",
            "Known for rapid career development",
        ])
    elif "tech" in industry_lower or "software" in industry_lower or "product" in industry_lower:
        suggestions.extend([
            "Cutting-edge product I'm passionate about",
            "Engineering culture and growth opportunities",
            "Team works on problems I care about",
        ])
    elif "private equity" in industry_lower or "vc" in industry_lower:
        suggestions.extend([
            "Investment thesis resonates with me",
            "Portfolio company exposure",
            "Small team with high ownership",
        ])

    if not suggestions:
        suggestions = _default_suggestions()

    return suggestions[:3]


def _default_suggestions() -> list[str]:
    return [
        "Company culture and values align with mine",
        "Specific team or role I'm excited about",
        "Alumni from my school work here",
    ]
