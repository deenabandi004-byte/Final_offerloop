"""
Company contexts service — Phase 1 of the Personalization Data Layer.

A "company context" is the user's reason for caring about a particular
company ("My grandfather was a partner at GS, that's why I care about
M&A"). They feed the email generator at draft time so outreach reads
personalized instead of generic.

Phase 1 ships the writer + reader; the floating-prompt UX that asks for
contexts at draft time lands in Phase 3 (`should_show_prompt` will be
added to this same module then).

Subcollection layout (per §2.2 of the eng review):
    users/{uid}/companyContexts/{companyIdNormalized}
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from app.extensions import get_db
from app.models.users import normalize_company

CompanyContextSource = Literal['explicit', 'inferred_from_resume', 'inferred_from_behavior']

REASON_MAX_CHARS = 1000


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_reason(reason: str) -> str:
    cleaned = (reason or '').strip()
    if not cleaned:
        raise ValueError('reason is required and cannot be empty')
    if len(cleaned) > REASON_MAX_CHARS:
        cleaned = cleaned[:REASON_MAX_CHARS]
    return cleaned


def write_company_context(
    uid: str,
    company_name: str,
    reason: str,
    source: CompanyContextSource = 'explicit',
    company_aliases: Optional[List[str]] = None,
    related_role_types: Optional[List[str]] = None,
    answered: bool = True,
    company_id_normalized: Optional[str] = None,
) -> Dict[str, Any]:
    """Write a company context for a user. Idempotent (uses set with merge).

    Args:
        uid: Firebase user ID.
        company_name: Display name (e.g. "Goldman Sachs").
        reason: The user's answer / extracted reason. Truncated to 1000 chars.
        source: How the context was obtained.
        company_aliases: Known aliases the user uses for this company.
        related_role_types: Role types the user is targeting at this company.
        answered: True if this represents a real answer (vs. just an `askedAt`
            placeholder written when the prompt is shown).
        company_id_normalized: Override slug (otherwise computed from `company_name`).

    Returns:
        The persisted document data.
    """
    if not uid:
        raise ValueError('uid is required')
    if not company_name:
        raise ValueError('company_name is required')

    cleaned_reason = _validate_reason(reason)
    company_id = company_id_normalized or normalize_company(company_name)
    if not company_id:
        raise ValueError(f'could not normalize company name: {company_name!r}')

    now = _now_iso()
    payload: Dict[str, Any] = {
        'companyId': company_id,
        'companyName': company_name.strip(),
        'companyAliases': sorted({a.strip() for a in (company_aliases or []) if a and a.strip()}),
        'reason': cleaned_reason,
        'askedAt': now,
        'answeredAt': now if answered else None,
        'source': source,
        'relatedRoleTypes': list(related_role_types or []),
        'lastUsedAt': now,
        'reaskAfter': None,
        'updatedAt': now,
    }

    db = get_db()
    ref = (
        db.collection('users')
        .document(uid)
        .collection('companyContexts')
        .document(company_id)
    )
    # Preserve original `askedAt` if doc already exists.
    existing = ref.get()
    if existing.exists:
        existing_data = existing.to_dict() or {}
        if existing_data.get('askedAt'):
            payload['askedAt'] = existing_data['askedAt']
        if not answered and existing_data.get('answeredAt'):
            payload['answeredAt'] = existing_data['answeredAt']

    ref.set(payload, merge=True)
    return payload


def get_company_context(uid: str, company_name: str) -> Optional[Dict[str, Any]]:
    """Read a company context by company display name (normalized internally)."""
    if not uid or not company_name:
        return None
    company_id = normalize_company(company_name)
    if not company_id:
        return None
    return get_company_context_by_id(uid, company_id)


def get_company_context_by_id(uid: str, company_id_normalized: str) -> Optional[Dict[str, Any]]:
    """Read by an already-normalized slug (avoids re-running normalize)."""
    if not uid or not company_id_normalized:
        return None
    db = get_db()
    doc = (
        db.collection('users')
        .document(uid)
        .collection('companyContexts')
        .document(company_id_normalized)
        .get()
    )
    if not doc.exists:
        return None
    return doc.to_dict()


def list_company_contexts(uid: str) -> List[Dict[str, Any]]:
    """Return all company contexts for a user, ordered by lastUsedAt desc."""
    if not uid:
        return []
    db = get_db()
    contexts: List[Dict[str, Any]] = []
    for snap in (
        db.collection('users')
        .document(uid)
        .collection('companyContexts')
        .stream()
    ):
        data = snap.to_dict() or {}
        data['_id'] = snap.id
        contexts.append(data)

    def _sort_key(ctx: Dict[str, Any]) -> str:
        return ctx.get('lastUsedAt') or ctx.get('answeredAt') or ''

    contexts.sort(key=_sort_key, reverse=True)
    return contexts


def touch_company_context(uid: str, company_id_normalized: str) -> None:
    """Bump lastUsedAt on a context (called when fed into a generation)."""
    if not uid or not company_id_normalized:
        return
    db = get_db()
    ref = (
        db.collection('users')
        .document(uid)
        .collection('companyContexts')
        .document(company_id_normalized)
    )
    if ref.get().exists:
        ref.update({'lastUsedAt': _now_iso()})
