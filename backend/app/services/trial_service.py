"""
Trial service — Pro free trial activation, daily credit pool, lazy expiry.

Design decisions (locked 2026-06-10):
  - 14 days for everyone (dropped the .edu / non-student differentiation)
  - No credit card required to start
  - 300 credits/day daily allocation (anti-skim: power users can't burn a pool
    in 2 days and bail; forces daily engagement)
  - Credits do NOT roll over from day to day
  - One trial per account, lifetime (enforced via `trialUsedAt`)
  - At trial end, user is auto-downgraded to Free tier on next authenticated
    request (lazy expiry — no cron required for v1)
  - During trial: subscriptionTier='pro' + subscriptionStatus='trialing' so
    feature gates and frontend status banners just work

Firestore user-doc shape during trial:
  trialStartedAt:           Timestamp  — when activated
  trialEndsAt:              Timestamp  — when it expires
  trialUsedAt:              Timestamp  — same as trialStartedAt; preserved
                                         after expiry so trial can't restart
  trialActive:              bool
  trialDailyCreditsRemaining: int      — refilled each UTC day
  trialLastDailyReset:      str        — ISO UTC date of last refill
  trialDailyExportsUsed:    int        — for the per-day contact-export cap

The user's Free monthly pool (`credits`, `maxCredits`) is preserved untouched
during the trial. When the trial expires they fall back to whatever was there.
"""
import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.config import (
    TIER_CONFIGS,
    TRIAL_DAYS_NON_STUDENT,
    TRIAL_DAILY_CREDITS,
    TRIAL_DAILY_EXPORT_CAP,
)
from app.extensions import get_db

logger = logging.getLogger(__name__)


# Use the unified trial day count — both audience constants are 14 now.
TRIAL_DURATION_DAYS = TRIAL_DAYS_NON_STUDENT


def start_trial(user_id: str) -> dict:
    """Activate a one-time Pro free trial for the user.

    Returns:
      {ok: True, trial_ends_at: ISO, daily_credits: int} on success,
      {ok: False, error: str} on failure (user not found, trial already used,
        already paying).
    """
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    user_ref = db.collection('users').document(user_id)
    user_snap = user_ref.get()
    if not user_snap.exists:
        return {'ok': False, 'error': 'user_not_found'}

    user_data = user_snap.to_dict() or {}

    # One-trial-per-account guard
    if user_data.get('trialUsedAt'):
        return {'ok': False, 'error': 'trial_already_used'}

    # Don't start a trial for users who already have a paid subscription
    current_tier = user_data.get('subscriptionTier') or user_data.get('tier') or 'free'
    has_stripe_sub = bool(user_data.get('stripeSubscriptionId'))
    if current_tier in ('pro', 'elite') and has_stripe_sub:
        return {'ok': False, 'error': 'already_subscribed'}

    now = datetime.now(timezone.utc)
    ends_at = now + timedelta(days=TRIAL_DURATION_DAYS)
    today_utc_date = now.strftime('%Y-%m-%d')

    # Preserve the user's existing Free credit pool — it's untouched during the
    # trial and restored on expiry. We add separate trial fields.
    updates = {
        'subscriptionTier': 'pro',
        'tier': 'pro',  # legacy fallback field
        'subscriptionStatus': 'trialing',
        'trialActive': True,
        'trialStartedAt': now,
        'trialEndsAt': ends_at,
        'trialUsedAt': now,
        'trialDailyCreditsRemaining': TRIAL_DAILY_CREDITS,
        'trialLastDailyReset': today_utc_date,
        'trialDailyExportsUsed': 0,
    }
    user_ref.update(updates)

    logger.info(f"Started Pro trial for user {user_id}, ends {ends_at.isoformat()}")
    return {
        'ok': True,
        'trial_ends_at': ends_at.isoformat(),
        'daily_credits': TRIAL_DAILY_CREDITS,
        'duration_days': TRIAL_DURATION_DAYS,
    }


def get_trial_status(user_data: dict) -> dict:
    """Compute the current trial state from a user doc snapshot.

    Returns a dict with `is_active`, `is_expired_unprocessed`, `days_remaining`,
    `daily_credits_remaining`, `needs_daily_reset`.

    `is_expired_unprocessed` means trial WAS active but `trialEndsAt` has
    passed and we haven't yet flipped them back to Free — the caller (deduct
    path) should run `_apply_trial_expiry` before charging credits.
    """
    trial_ends_at = user_data.get('trialEndsAt')
    if not trial_ends_at:
        return {'is_active': False, 'is_expired_unprocessed': False}

    # Firestore returns timestamps as datetime objects; normalize to UTC
    if hasattr(trial_ends_at, 'tzinfo'):
        ends_dt = trial_ends_at if trial_ends_at.tzinfo else trial_ends_at.replace(tzinfo=timezone.utc)
    elif isinstance(trial_ends_at, str):
        ends_dt = datetime.fromisoformat(trial_ends_at.replace('Z', '+00:00'))
    else:
        return {'is_active': False, 'is_expired_unprocessed': False}

    now = datetime.now(timezone.utc)
    seconds_remaining = (ends_dt - now).total_seconds()
    is_active_flag = bool(user_data.get('trialActive'))

    if seconds_remaining > 0 and is_active_flag:
        # Active trial — figure out daily reset state
        today_utc = now.strftime('%Y-%m-%d')
        last_reset = user_data.get('trialLastDailyReset')
        needs_daily_reset = last_reset != today_utc
        daily_remaining = (
            TRIAL_DAILY_CREDITS if needs_daily_reset
            else int(user_data.get('trialDailyCreditsRemaining', TRIAL_DAILY_CREDITS))
        )
        return {
            'is_active': True,
            'is_expired_unprocessed': False,
            'days_remaining': max(0, int(seconds_remaining // 86400)),
            'hours_remaining': max(0, int(seconds_remaining // 3600)),
            'daily_credits_remaining': daily_remaining,
            'daily_credits_max': TRIAL_DAILY_CREDITS,
            'daily_export_cap': TRIAL_DAILY_EXPORT_CAP,
            'daily_exports_used': int(user_data.get('trialDailyExportsUsed', 0)),
            'needs_daily_reset': needs_daily_reset,
            'trial_ends_at': ends_dt.isoformat(),
        }

    if seconds_remaining <= 0 and is_active_flag:
        # Trial ended but we haven't processed expiry yet
        return {
            'is_active': False,
            'is_expired_unprocessed': True,
            'trial_ends_at': ends_dt.isoformat(),
        }

    # Trial already ended and processed (trialActive=False)
    return {
        'is_active': False,
        'is_expired_unprocessed': False,
        'trial_ends_at': ends_dt.isoformat(),
    }


def apply_trial_expiry(user_id: str) -> dict:
    """Flip a user from active trial → Free tier. Idempotent.

    Called lazily on the next authenticated request after the trial ends.
    The user's Free monthly pool (credits, maxCredits) was preserved
    untouched during the trial so we just need to clear the tier flag and
    `trialActive`. The trial fields stay on the doc for audit.
    """
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    user_ref = db.collection('users').document(user_id)
    snap = user_ref.get()
    if not snap.exists:
        return {'ok': False, 'error': 'user_not_found'}

    user_data = snap.to_dict() or {}
    if not user_data.get('trialActive'):
        # Already expired and processed
        return {'ok': True, 'already_processed': True}

    # If the user upgraded to a paid plan DURING the trial, they should stay
    # on it — don't auto-downgrade. The Stripe webhook handler would have set
    # stripeSubscriptionId at that point.
    if user_data.get('stripeSubscriptionId'):
        user_ref.update({
            'trialActive': False,
            'subscriptionStatus': user_data.get('subscriptionStatus', 'active'),
        })
        return {'ok': True, 'kept_paid': True}

    free_credits = TIER_CONFIGS['free']['credits']
    user_ref.update({
        'subscriptionTier': 'free',
        'tier': 'free',
        'subscriptionStatus': 'expired',
        'trialActive': False,
        # Preserve current `credits` if they had Free credits remaining; otherwise
        # restore to Free monthly allocation. Don't touch maxCredits — that was
        # never changed.
        'credits': max(int(user_data.get('credits', 0)), free_credits),
        'maxCredits': free_credits,
    })

    logger.info(f"Trial expired for user {user_id}, downgraded to Free")
    return {'ok': True, 'downgraded': True}


def deduct_trial_credits(user_id: str, amount: int) -> tuple[bool, int]:
    """Deduct credits from the trial daily pool. Handles lazy daily reset.

    Returns (success, daily_remaining). If the trial is not active, returns
    (False, 0) — caller should fall back to the normal deduct path.
    """
    from firebase_admin import firestore
    db = get_db()
    user_ref = db.collection('users').document(user_id)

    @firestore.transactional
    def deduct_in_tx(transaction):
        snap = user_ref.get(transaction=transaction)
        if not snap.exists:
            return False, 0
        user_data = snap.to_dict() or {}

        status = get_trial_status(user_data)
        if not status['is_active']:
            return False, 0

        now = datetime.now(timezone.utc)
        today_utc = now.strftime('%Y-%m-%d')

        # Apply daily reset if needed (lazy)
        if status['needs_daily_reset']:
            current = TRIAL_DAILY_CREDITS
            reset_fields = {
                'trialLastDailyReset': today_utc,
                'trialDailyExportsUsed': 0,
            }
        else:
            current = int(user_data.get('trialDailyCreditsRemaining', TRIAL_DAILY_CREDITS))
            reset_fields = {}

        if current < amount:
            # Apply any reset fields even if we can't fulfill the deduction
            if reset_fields:
                reset_fields['trialDailyCreditsRemaining'] = current
                transaction.update(user_ref, reset_fields)
            return False, current

        new_remaining = current - amount
        update_fields = {
            'trialDailyCreditsRemaining': new_remaining,
            'lastCreditUpdate': now.isoformat(),
            **reset_fields,
        }
        transaction.update(user_ref, update_fields)
        return True, new_remaining

    try:
        success, remaining = deduct_in_tx(db.transaction())
        return success, remaining
    except Exception as e:
        logger.error(f"trial credit deduction error for {user_id}: {e}")
        return False, 0


def is_user_in_trial(user_data: dict) -> bool:
    """Cheap synchronous check — does this user have an active trial?"""
    return get_trial_status(user_data).get('is_active', False)
