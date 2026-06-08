"""
cohort_assignment — sticky A/B cohort assignment for Loops Setup V2.

The V2 wizard rollout is gated by per-user cohort assignment so we can
sample treatment effects without flipping the experience for everyone
at once. Two design constraints from the plan:

  1. Sticky: a user must NOT bounce between cohorts across sessions —
     that would make funnel comparisons meaningless. Assignment is
     recorded in Firestore on first read and persists until manually
     reset.

  2. Hash-based, not random: assignment is `hash(uid + salt) % 100`,
     so two readers on the same uid concurrent-first-time-look will
     converge on the same cohort even before the Firestore write
     races to land. Random would force a transactional read-modify-
     write loop to stay sticky.

Rollout percentage:
  Set via LOOPS_SETUP_V2_ROLLOUT_PCT env var. Defaults to 0 (control
  cohort for everyone) — flip up to 10/50/100 as we collect data.
  Existing assignments stay sticky regardless of rollout changes;
  only fresh users see the new percentage applied.

What this module does NOT do:
  - Backfill cohort for users who already created Loops on V1 — they
    stay "control" implicit until they next hit the wizard. Acceptable.
  - Metrics emission — there's a separate doc per assignment with a
    timestamp; aggregate funnel metrics can be a Firestore query later.
"""
from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Literal

from app.extensions import get_db

logger = logging.getLogger(__name__)

Cohort = Literal["treatment", "control"]

LOOPS_SETUP_V2_FLAG = "loops_setup_v2"

# Cohort assignment is `hash(uid + SALT) % 100 < pct`. The salt prevents
# trivial uid → cohort prediction (e.g. via the LinkedIn URL leak) and
# isolates this experiment's hash space from any future ones. Don't
# rotate it once Live — that would re-shuffle existing users and break
# the stickiness contract.
_COHORT_SALT = "loops_v2_2026"


def _rollout_pct(flag_name: str) -> int:
    """Read the current rollout percentage [0, 100] from env. Returns 0 on
    invalid / missing values so a fat-fingered env never accidentally
    treats every user."""
    env_key = f"{flag_name.upper()}_ROLLOUT_PCT"
    raw = os.getenv(env_key, "")
    try:
        v = int(raw) if raw else 0
    except ValueError:
        logger.warning(
            "cohort_assignment: invalid %s=%r — defaulting to 0", env_key, raw,
        )
        return 0
    return max(0, min(100, v))


def _hash_bucket(uid: str) -> int:
    """Stable [0, 99] bucket for the given uid + salt."""
    digest = hashlib.sha256(f"{_COHORT_SALT}:{uid}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def _classify(uid: str, rollout_pct: int) -> Cohort:
    return "treatment" if _hash_bucket(uid) < rollout_pct else "control"


def _doc_ref(db, uid: str, flag_name: str):
    return (
        db.collection("users")
        .document(uid)
        .collection("cohorts")
        .document(flag_name)
    )


def get_or_assign(uid: str, flag_name: str = LOOPS_SETUP_V2_FLAG) -> Cohort:
    """Read the user's sticky cohort assignment, or compute + persist one.

    First call writes the assignment to Firestore so subsequent calls
    (within this process or any other) return the same value even if
    the rollout percentage changes underneath.
    """
    if not uid:
        return "control"

    db = get_db()
    ref = _doc_ref(db, uid, flag_name)
    try:
        snap = ref.get()
        if snap.exists:
            data = snap.to_dict() or {}
            existing = data.get("cohort")
            if existing in ("treatment", "control"):
                return existing  # type: ignore[return-value]
    except Exception:
        logger.exception(
            "cohort_assignment: read failed uid=%s flag=%s — falling back to fresh classify",
            uid, flag_name,
        )

    pct = _rollout_pct(flag_name)
    cohort = _classify(uid, pct)
    try:
        ref.set({
            "cohort": cohort,
            "assignedAt": datetime.now(timezone.utc).isoformat(),
            "rolloutPctAtAssignment": pct,
        })
    except Exception:
        logger.exception(
            "cohort_assignment: persist failed uid=%s flag=%s cohort=%s",
            uid, flag_name, cohort,
        )
    return cohort


def is_v2_enabled(uid: str) -> bool:
    """Shortcut for the agent route — does this user see the V2 wizard?"""
    return get_or_assign(uid, LOOPS_SETUP_V2_FLAG) == "treatment"
