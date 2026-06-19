"""
Referral program logic.

Functions are split into pure helpers (no I/O, unit-tested directly) and
orchestration functions that touch Firestore / Stripe.
"""
import secrets
from datetime import datetime, timezone

from app.config import REFERRAL_TARGET_COUNT, REFERRAL_REWARD_TIER

# Unambiguous alphabet (no 0/O/1/I)
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 8


def generate_code() -> str:
    """Return a random 8-char referral code from an unambiguous alphabet."""
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))


def is_self_referral(owner_uid: str, owner_email: str,
                     new_uid: str, new_email: str) -> bool:
    """True if the referred user is (or looks like) the code owner."""
    if owner_uid and new_uid and owner_uid == new_uid:
        return True
    if owner_email and new_email and owner_email.strip().lower() == new_email.strip().lower():
        return True
    return False


def is_eligible(qualified_count: int, reward_claimed: bool) -> bool:
    """True when the referrer can claim their (one-time) reward."""
    return qualified_count >= REFERRAL_TARGET_COUNT and not reward_claimed
