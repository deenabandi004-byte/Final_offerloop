"""
Derived profile service — Phase 1 placeholder.

The full Phase 4 implementation will synthesize a `DerivedProfile`
(VoiceModel + InterestModel + BehaviorStats) from raw events. For
Phase 1 we only need a writer that lays down the `derivedProfile/v1`
document so reading code in Phases 5-8 has a stable place to look.

When Phase 4 lands, replace `synthesize` and `_render_placeholder` with
real LLM-driven synthesis. The signature should not change — both the
generator (`email_generator.generate_email`) and the recommendation
service expect to read this single doc and ignore it when fields are None.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.extensions import get_db


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_derived_profile(uid: str) -> Optional[Dict[str, Any]]:
    """Read users/{uid}/derivedProfile/v1. Returns None if it doesn't exist yet."""
    if not uid:
        return None
    db = get_db()
    doc = (
        db.collection('users')
        .document(uid)
        .collection('derivedProfile')
        .document('v1')
        .get()
    )
    if not doc.exists:
        return None
    return doc.to_dict()


def write_placeholder_derived_profile(uid: str) -> Dict[str, Any]:
    """Lay down an empty derivedProfile/v1 document.

    Phase 1 callers (e.g. backfill, profile-confirm) invoke this so the
    document exists before Phase 4 starts firing event-triggered syntheses.
    All model fields are None — readers must already be tolerant of that.
    """
    if not uid:
        raise ValueError('uid is required')

    payload: Dict[str, Any] = {
        'voiceModel': None,
        'interestModel': None,
        'behaviorStats': None,
        'lastSynthesizedAt': None,
        'synthesizedFromEventCount': 0,
        'sourceEventCutoff': None,
        'placeholder': True,
        'createdAt': _now_iso(),
    }

    db = get_db()
    ref = (
        db.collection('users')
        .document(uid)
        .collection('derivedProfile')
        .document('v1')
    )
    ref.set(payload, merge=True)
    return payload


def synthesize(uid: str) -> Dict[str, Any]:
    """Phase 4 entry point — stubbed in Phase 1.

    Phase 1 returns the placeholder profile so callers don't break when
    the synthesis pipeline isn't wired up yet. Phase 4 replaces this with
    actual LLM synthesis from the event log.
    """
    existing = get_derived_profile(uid)
    if existing:
        return existing
    return write_placeholder_derived_profile(uid)
