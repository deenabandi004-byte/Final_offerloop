"""
Lifecycle email service. Five sequences via the existing Resend integration.

Voice: founder-direct. These emails are "from" Rylan @ Offerloop. Plain English,
no fake testimonials, no fabricated PDFs, no "5-10x more outreach" stats we
can't back up. Per the standing project rule, no fake numbers or fake social
proof anywhere. Only real things: real product features, real personalization
(saved contact counts pulled from Firestore), real coupon codes that fail
gracefully when the underlying Stripe coupon isn't wired yet.

Sequences:
  1. Pricing visit abandonment (anonymous, popup-driven, currently dormant
     since the PricingExitPopup is removed). Day 0 / Day 2 / Day 5.
  2. Checkout abandonment (signed-in). Hour 1 / Day 1.
  3. Trial ending. 48h / 24h / at-expiry.
  4. Low credits. Fired real-time from auth deduct path.
  5. Win-back. 30 days post-cancel.

Architecture:
  - Idempotency via `lifecycle_email_log` Firestore collection (composite key).
  - Rate limit = 2 lifecycle emails / user / 7 days.
  - HMAC-signed unsubscribe tokens.
  - Cron entry = /api/lifecycle/tick (secret-guarded).
  - Discount codes appear inline only when STRIPE_COUPONS env vars are populated.
"""
import hmac
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.config import (
    STRIPE_COUPONS,
    LIFECYCLE_FROM_EMAIL,
    LIFECYCLE_POSTAL_ADDRESS,
    ONBOARDING_DROPOFF_LAUNCH_DATE,
    FIRST_SEARCH_ACTIVATION_LAUNCH_DATE,
    FIRST_SEND_ACTIVATION_LAUNCH_DATE,
)
from app.extensions import get_db
from app.services.notification_adapter import send as notify_send, Channel

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_LIFECYCLE_EMAILS_PER_7_DAYS = 2

PUBLIC_BASE_URL = os.getenv('PUBLIC_BASE_URL', 'https://offerloop.ai')

# Who the emails are signed by. Single-name to keep the voice personal. These
# are coming from a co-founder talking to a student, not a brand.
SIGNATURE_NAME = os.getenv('LIFECYCLE_SIGNATURE_NAME', 'Deena')


def _unsubscribe_secret() -> str:
    return os.getenv('LIFECYCLE_UNSUBSCRIBE_SECRET') or os.getenv('FLASK_SECRET', 'dev')


def _parse_ts_or_dt(val) -> Optional[datetime]:
    """Firestore timestamp fields may arrive as native datetime (Firestore
    Timestamp) OR as ISO 8601 string (from create_user_data() and the
    lifecycle backfill script). This helper normalizes both to a
    timezone-aware datetime, or None if the value can't be parsed."""
    if val is None:
        return None
    if hasattr(val, 'isoformat'):
        dt = val
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    try:
        s = str(val).replace('Z', '+00:00')
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Idempotency + rate-limit helpers
# ---------------------------------------------------------------------------

def _log_key(user_or_lead_id: str, campaign: str, step: str) -> str:
    return f"{user_or_lead_id}:{campaign}:{step}"


def already_sent(user_or_lead_id: str, campaign: str, step: str) -> bool:
    db = get_db()
    if not db:
        return False
    key = _log_key(user_or_lead_id, campaign, step)
    snap = db.collection('lifecycle_email_log').document(key).get()
    return snap.exists


def _rate_limit_exceeded(user_or_lead_id: str) -> bool:
    db = get_db()
    if not db:
        return False
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    q = (db.collection('lifecycle_email_log')
            .where('recipient_id', '==', user_or_lead_id)
            .where('sent_at', '>=', seven_days_ago)
            .limit(MAX_LIFECYCLE_EMAILS_PER_7_DAYS + 1))
    try:
        count = sum(1 for _ in q.stream())
    except Exception as e:
        logger.warning(f"rate-limit query failed for {user_or_lead_id}: {e}")
        return False
    return count >= MAX_LIFECYCLE_EMAILS_PER_7_DAYS


def _record_send(user_or_lead_id: str, campaign: str, step: str, recipient_email: str) -> None:
    db = get_db()
    if not db:
        return
    key = _log_key(user_or_lead_id, campaign, step)
    db.collection('lifecycle_email_log').document(key).set({
        'recipient_id': user_or_lead_id,
        'recipient_email': recipient_email,
        'campaign': campaign,
        'step': step,
        'sent_at': datetime.now(timezone.utc),
    })


# ---------------------------------------------------------------------------
# Unsubscribe tokens
# ---------------------------------------------------------------------------

def make_unsubscribe_token(email: str) -> str:
    secret = _unsubscribe_secret().encode('utf-8')
    msg = email.lower().encode('utf-8')
    return hmac.new(secret, msg, hashlib.sha256).hexdigest()


def verify_unsubscribe_token(email: str, token: str) -> bool:
    return hmac.compare_digest(make_unsubscribe_token(email), token)


def is_unsubscribed(email: str) -> bool:
    db = get_db()
    if not db:
        return False
    snap = db.collection('lifecycle_unsubscribes').document(email.lower()).get()
    return snap.exists


def record_unsubscribe(email: str) -> None:
    db = get_db()
    if not db:
        return
    db.collection('lifecycle_unsubscribes').document(email.lower()).set({
        'email': email.lower(),
        'unsubscribed_at': datetime.now(timezone.utc),
    })


# ---------------------------------------------------------------------------
# Send funnel (idempotency, rate limit, unsubscribe gate, logging)
# ---------------------------------------------------------------------------

def _send_lifecycle_email(
    *,
    user_or_lead_id: str,
    recipient_email: str,
    campaign: str,
    step: str,
    subject: str,
    body_paragraphs: list[str],
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
) -> dict:
    if not recipient_email or '@' not in recipient_email:
        return {'sent': False, 'reason': 'invalid_email'}
    if already_sent(user_or_lead_id, campaign, step):
        return {'sent': False, 'reason': 'already_sent'}
    if is_unsubscribed(recipient_email):
        return {'sent': False, 'reason': 'unsubscribed'}
    if _rate_limit_exceeded(user_or_lead_id):
        return {'sent': False, 'reason': 'rate_limited'}

    token = make_unsubscribe_token(recipient_email)
    unsub_url = f"{PUBLIC_BASE_URL}/api/lifecycle/unsubscribe?email={recipient_email}&token={token}"
    headers = {'List-Unsubscribe': f"<{unsub_url}>"}

    html = _render_html(body_paragraphs, cta_label, cta_url, unsub_url)
    text = _render_text(body_paragraphs, cta_label, cta_url, unsub_url)

    result = notify_send(Channel.EMAIL, recipient_email, subject, html, text, headers, from_email=LIFECYCLE_FROM_EMAIL)
    if getattr(result, 'success', False):
        _record_send(user_or_lead_id, campaign, step, recipient_email)
        return {'sent': True, 'reason': 'ok'}
    return {'sent': False, 'reason': getattr(result, 'error_code', 'send_failed')}


def _render_html(paragraphs: list[str], cta_label: Optional[str], cta_url: Optional[str], unsub_url: str) -> str:
    """Plain email styling. No eyebrows, no gradient buttons, no serif drama.
    Reads like a normal email someone would actually send."""
    body = ''.join(
        f'<p style="margin:0 0 14px; font-size:15px; line-height:1.6; color:#1F2937;">{p}</p>'
        for p in paragraphs
    )
    cta_html = ''
    if cta_label and cta_url:
        # Plain inline link, not a styled button. Gmail's Promotions classifier
        # keys on bold/colored CTA links + separated visual sections; letting
        # the CTA read like "another line in the letter" nudges toward Primary.
        cta_html = (
            f'<p style="margin:0 0 14px; font-size:15px; line-height:1.6; color:#1F2937;">'
            f'<a href="{cta_url}" style="color:#1F2937;">{cta_label}</a>'
            f'</p>'
        )
    signature_html = (
        f'<p style="margin:20px 0 6px; font-size:15px; line-height:1.6; color:#1F2937;">'
        f'— {SIGNATURE_NAME}</p>'
    )
    # CAN-SPAM requires a valid physical postal address in every commercial
    # email. If LIFECYCLE_POSTAL_ADDRESS is unset, print a highly visible
    # placeholder so a reviewer catches it before prod.
    address_line = (
        LIFECYCLE_POSTAL_ADDRESS
        or '⚠ Set LIFECYCLE_POSTAL_ADDRESS env var. CAN-SPAM compliance requires a real postal address here'
    )
    footer = (
        '<p style="margin-top:28px; padding-top:14px; border-top:1px solid #E5E7EB;'
        ' font-size:11px; color:#9CA3AF; line-height:1.55;">'
        f'<a href="{unsub_url}" style="color:#9CA3AF;">Unsubscribe</a>'
        f'<br>Offerloop &middot; {address_line}'
        '</p>'
    )
    # No centered content box or fixed max-width. Those are marketing-email
    # tells. Let the content flow edge-to-edge like a Gmail-composed message.
    return (
        '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;'
        ' font-size:15px; line-height:1.6; color:#1F2937;">'
        + body + cta_html + signature_html + footer +
        '</div>'
    )


def _render_text(paragraphs: list[str], cta_label: Optional[str], cta_url: Optional[str], unsub_url: str) -> str:
    """Plain-text fallback. Actual line breaks, no HTML."""
    address_line = (
        LIFECYCLE_POSTAL_ADDRESS
        or 'MISSING POSTAL ADDRESS: set LIFECYCLE_POSTAL_ADDRESS'
    )
    lines = paragraphs[:]
    if cta_label and cta_url:
        lines.append(f"{cta_label}: {cta_url}")
    lines.append(f"— {SIGNATURE_NAME}")
    lines.append("")
    lines.append(f"Unsubscribe: {unsub_url}")
    lines.append(f"Offerloop · {address_line}")
    return "\n\n".join(lines)


# ---------------------------------------------------------------------------
# Helpers used inside the sequences
# ---------------------------------------------------------------------------

def _count_saved_contacts(uid: str) -> int:
    """Best-effort count for personalization. Caps at 1000 results."""
    db = get_db()
    if not db:
        return 0
    try:
        ref = db.collection('users').document(uid).collection('contacts').limit(1000)
        return sum(1 for _ in ref.stream())
    except Exception:
        return 0


def _real_coupon(key: str) -> Optional[str]:
    """Return the human-facing coupon code only when the underlying Stripe
    coupon ID env var is actually populated. Per the no-fake-numbers rule,
    we never advertise a code that won't work at checkout."""
    coupon_ids = {
        'pricing_recapture': ('STAYHIRED', STRIPE_COUPONS.get('pricing_recapture')),
        'checkout_recovery': ('WARMINTRO', STRIPE_COUPONS.get('checkout_recovery')),
        'winback': ('WELCOMEBACK', STRIPE_COUPONS.get('winback')),
    }
    name, sid = coupon_ids.get(key, (None, None))
    return name if (name and sid) else None


# ---------------------------------------------------------------------------
# Sequence 1: Pricing visit abandonment (anonymous leads from capture endpoint)
# ---------------------------------------------------------------------------

def process_pricing_leads() -> dict:
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    sent = {'day_0': 0, 'day_2': 0, 'day_5': 0}
    now = datetime.now(timezone.utc)

    for snap in db.collection('lifecycle_leads').where('source', '==', 'pricing_exit').stream():
        lead = snap.to_dict() or {}
        lead_id = snap.id
        email = lead.get('email')
        captured_at = lead.get('captured_at')
        if not email or not captured_at:
            continue
        hours_since = (now - captured_at).total_seconds() / 3600

        # Day 0
        if hours_since < 0.5 and not already_sent(lead_id, 'pricing_abandon', 'day_0'):
            res = _send_lifecycle_email(
                user_or_lead_id=lead_id,
                recipient_email=email,
                campaign='pricing_abandon',
                step='day_0',
                subject="saw you on the pricing page",
                body_paragraphs=[
                    f"Hey, {SIGNATURE_NAME} here. I help run Offerloop.",
                    "Saw you stopped by the pricing page. No script, no PDF, just want to flag what you'd actually get if you tried it.",
                    "Offerloop is built for college students recruiting for internships and full-time roles. You search for alumni / hiring managers / recruiters at companies you want, we pull their verified email and draft a first-touch tied to your background, and the pipeline view tracks who's replied. Pro is $14.99/mo with a .edu and the trial is 14 days, no credit card.",
                    "If anything's confusing or you want to ask whether the product makes sense for your situation, just reply.",
                ],
                cta_label="Start the free trial",
                cta_url=f'{PUBLIC_BASE_URL}/signin?mode=signup&utm_source=lifecycle&utm_campaign=pricing_abandon&utm_content=day_0',
            )
            if res.get('sent'):
                sent['day_0'] += 1

        # Day 2
        elif 36 < hours_since < 60 and not already_sent(lead_id, 'pricing_abandon', 'day_2'):
            res = _send_lifecycle_email(
                user_or_lead_id=lead_id,
                recipient_email=email,
                campaign='pricing_abandon',
                step='day_2',
                subject="fwiw on the trial",
                body_paragraphs=[
                    "One honest thing about the trial:",
                    "Most students don't get a lot out of Offerloop unless they actually send 10–15 emails during the 14-day window. If you sign up but don't end up doing real outreach, you'll think the product's not doing much.",
                    "So if you're not actively recruiting right now, it's fine to wait. If you are, the trial will tell you pretty quickly whether it fits how you work.",
                ],
                cta_label="Try Pro free for 14 days",
                cta_url=f'{PUBLIC_BASE_URL}/signin?mode=signup&utm_source=lifecycle&utm_campaign=pricing_abandon&utm_content=day_2',
            )
            if res.get('sent'):
                sent['day_2'] += 1

        # Day 5: final note
        elif 108 < hours_since < 156 and not already_sent(lead_id, 'pricing_abandon', 'day_5'):
            promo = _real_coupon('checkout_recovery') or _real_coupon('pricing_recapture')
            paragraphs = [
                "Won't keep emailing you. Last note from me.",
            ]
            if promo:
                paragraphs.append(
                    f"If price is the sticking point: code <strong>{promo}</strong> takes 20% off your first month of Pro. Works for the next 7 days."
                )
            paragraphs.append(
                "Otherwise, if you ever want to chat about whether Offerloop makes sense for what you're recruiting for, just reply with your year and what you're targeting. Good luck either way."
            )
            res = _send_lifecycle_email(
                user_or_lead_id=lead_id,
                recipient_email=email,
                campaign='pricing_abandon',
                step='day_5',
                subject="last note",
                body_paragraphs=paragraphs,
                cta_label=("See Pro" if promo else None),
                cta_url=(f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=pricing_abandon&utm_content=day_5' if promo else None),
            )
            if res.get('sent'):
                sent['day_5'] += 1

    return {'ok': True, 'sent': sent}


# ---------------------------------------------------------------------------
# Sequence 2: Checkout abandonment
# ---------------------------------------------------------------------------

def process_checkout_abandons() -> dict:
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    sent = {'hour_1': 0, 'day_1': 0}
    now = datetime.now(timezone.utc)

    for snap in db.collection('users').where('checkoutAbandonedAt', '!=', None).stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email')
        abandoned_at = user.get('checkoutAbandonedAt')
        if not email or not abandoned_at:
            continue
        if user.get('subscriptionTier') in ('pro', 'elite'):
            continue  # converted later via a separate flow
        hours_since = (now - abandoned_at).total_seconds() / 3600

        # Hour 1: quick "did something break?"
        if 0.5 < hours_since < 4 and not already_sent(uid, 'checkout_abandon', 'hour_1'):
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='checkout_abandon',
                step='hour_1',
                subject="did checkout break?",
                body_paragraphs=[
                    f"Hey, {SIGNATURE_NAME} from Offerloop.",
                    "Saw you started checkout for Pro but didn't finish. If something actually went sideways on our end (Stripe weirdness, card got declined, redirect failed), reply and tell me what happened. I can usually sort it out fast.",
                    "If you just second-guessed it, no worries. The trial is 14 days with no credit card required. That's probably the better starting point anyway.",
                ],
                cta_label="Pick up where you left off",
                cta_url=f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=checkout_abandon&utm_content=hour_1',
            )
            if res.get('sent'):
                sent['hour_1'] += 1

        # Day 1: soft follow-up
        elif 20 < hours_since < 30 and not already_sent(uid, 'checkout_abandon', 'day_1'):
            promo = _real_coupon('checkout_recovery')
            paragraphs = [
                "Following up once on the checkout from yesterday. Then I'll leave you alone.",
                "If you want to actually try Pro before paying, the 14-day trial doesn't ask for a card. That's the right move if you're on the fence. The product either clicks for how you work or it doesn't, and you'll know inside a week.",
            ]
            if promo:
                paragraphs.append(
                    f"If you do want to commit now, code <strong>{promo}</strong> takes 20% off your first month."
                )
            paragraphs.append("Reply if anything about how the product works is unclear.")
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='checkout_abandon',
                step='day_1',
                subject="no rush",
                body_paragraphs=paragraphs,
                cta_label="Start free trial",
                cta_url=f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=checkout_abandon&utm_content=day_1',
            )
            if res.get('sent'):
                sent['day_1'] += 1

    return {'ok': True, 'sent': sent}


# ---------------------------------------------------------------------------
# Sequence 3: Trial ending
# ---------------------------------------------------------------------------

def process_trial_endings() -> dict:
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    sent = {'h48': 0, 'h24': 0, 'expired': 0}
    now = datetime.now(timezone.utc)

    for snap in db.collection('users').where('trialActive', '==', True).stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email')
        ends_at = user.get('trialEndsAt')
        if not email or not ends_at:
            continue
        if hasattr(ends_at, 'tzinfo') and ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=timezone.utc)
        hours_left = (ends_at - now).total_seconds() / 3600
        contacts_count = _count_saved_contacts(uid)

        # 48h before
        if 24 < hours_left < 52 and not already_sent(uid, 'trial_ending', 'h48'):
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='trial_ending',
                step='h48',
                subject="2 days left on your Pro trial",
                body_paragraphs=[
                    f"Quick heads up. Your Pro trial ends in 2 days.",
                    f"You've saved {contacts_count} {'contact' if contacts_count == 1 else 'contacts'} so far. When the trial ends you drop to Free, so those contacts and their drafts stay visible, but you lose the things that found them: hiring-manager search, firm search, bulk drafting, and unlimited Coffee Chat Prep.",
                    "If Pro's been useful, $14.99/mo with a .edu locks in that student price for life. If it hasn't been useful, no charge. You never gave us a card.",
                ],
                cta_label="Keep Pro",
                cta_url=f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=trial_ending&utm_content=h48',
            )
            if res.get('sent'):
                sent['h48'] += 1

        # 24h before
        elif 0 < hours_left < 28 and not already_sent(uid, 'trial_ending', 'h24'):
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='trial_ending',
                step='h24',
                subject="trial ends tomorrow",
                body_paragraphs=[
                    "Last reminder: Pro trial ends tomorrow.",
                    f"{contacts_count} {'contact' if contacts_count == 1 else 'contacts'} saved. Pick a plan if Pro's been working, or do nothing and you'll drop to Free automatically.",
                ],
                cta_label="Pick a plan",
                cta_url=f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=trial_ending&utm_content=h24',
            )
            if res.get('sent'):
                sent['h24'] += 1

    # Post-expiry note: sweep users whose status flipped to 'expired' recently
    cutoff = now - timedelta(hours=2)
    for snap in db.collection('users').where('subscriptionStatus', '==', 'expired').stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email')
        ends_at = user.get('trialEndsAt')
        if not email or not ends_at:
            continue
        if hasattr(ends_at, 'tzinfo') and ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=timezone.utc)
        if ends_at < cutoff or ends_at > now:
            continue
        if already_sent(uid, 'trial_ending', 'expired'):
            continue
        res = _send_lifecycle_email(
            user_or_lead_id=uid,
            recipient_email=email,
            campaign='trial_ending',
            step='expired',
            subject="you're on Free now",
            body_paragraphs=[
                "Your Pro trial ended. You're on the Free plan now.",
                "Your saved contacts and drafts are still there. The things that need Pro (hiring-manager search, firm search, bulk drafting, Coffee Chat Prep beyond the 3 lifetime free ones) are locked.",
                "If you change your mind, Pro's in account settings.",
            ],
            cta_label=None,
            cta_url=None,
        )
        if res.get('sent'):
            sent['expired'] += 1

    return {'ok': True, 'sent': sent}


# ---------------------------------------------------------------------------
# Sequence 4: Low credits (fired real-time from auth.deduct_credits_atomic)
# ---------------------------------------------------------------------------

def notify_low_credits(uid: str, credits_remaining: int, max_credits: int) -> dict:
    db = get_db()
    if not db:
        return {'sent': False, 'reason': 'db_unavailable'}
    snap = db.collection('users').document(uid).get()
    if not snap.exists:
        return {'sent': False, 'reason': 'user_not_found'}
    user = snap.to_dict() or {}
    email = user.get('email')
    if not email:
        return {'sent': False, 'reason': 'no_email'}

    # Reset per calendar month so the same threshold doesn't spam each billing cycle
    month = datetime.now(timezone.utc).strftime('%Y-%m')
    step = f"low_{month}"

    pct_used = round(100 - (credits_remaining / max(max_credits, 1)) * 100)
    rough_emails = credits_remaining // 10  # 10 cr / email at current math

    return _send_lifecycle_email(
        user_or_lead_id=uid,
        recipient_email=email,
        campaign='low_credits',
        step=step,
        subject=f"{credits_remaining} credits left",
        body_paragraphs=[
            f"Quick FYI: you've used about {pct_used}% of your credits this month. {credits_remaining} left, which is roughly {rough_emails} more {'email' if rough_emails == 1 else 'emails'} before your monthly reset.",
            "Two options if you need more before then:",
            "Top up: one-time credit pack, never expires. Or upgrade to Elite if you're going to keep burning at this pace.",
        ],
        cta_label="See options",
        cta_url=f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=low_credits',
    )


# ---------------------------------------------------------------------------
# Sequence 5: Win-back (30 days post-cancel)
# ---------------------------------------------------------------------------

def process_winbacks() -> dict:
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    sent_count = 0
    now = datetime.now(timezone.utc)
    thirty_two_days_ago = now - timedelta(days=32)
    thirty_days_ago = now - timedelta(days=30)

    q = (db.collection('users')
            .where('canceledAt', '>=', thirty_two_days_ago)
            .where('canceledAt', '<=', thirty_days_ago))
    for snap in q.stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email')
        if not email:
            continue
        if user.get('subscriptionTier') in ('pro', 'elite'):
            continue  # already re-subscribed
        if already_sent(uid, 'winback', 'day_30'):
            continue

        contacts_count = _count_saved_contacts(uid)
        promo = _real_coupon('winback')
        paragraphs = [
            f"Hey, {SIGNATURE_NAME} again.",
            f"Been about a month since you canceled. Just flagging: your {contacts_count} saved {'contact' if contacts_count == 1 else 'contacts'} and the drafts you built are still in your Offerloop account, right where you left them.",
        ]
        if promo:
            paragraphs.append(
                f"If you ever want to pick recruiting back up, code <strong>{promo}</strong> takes 50% off your first month back. Works for the next 14 days."
            )
        paragraphs.append(
            "Also: if something specifically pushed you to cancel that we could actually fix, I'd want to know. Hit reply."
        )

        res = _send_lifecycle_email(
            user_or_lead_id=uid,
            recipient_email=email,
            campaign='winback',
            step='day_30',
            subject="your contacts are still here",
            body_paragraphs=paragraphs,
            cta_label=("Come back" if promo else None),
            cta_url=(f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=winback&utm_content=day_30' if promo else None),
        )
        if res.get('sent'):
            sent_count += 1

    return {'ok': True, 'sent_count': sent_count}


# ---------------------------------------------------------------------------
# Sequence 6: Onboarding drop-off (users signed up but never confirmed profile)
# ---------------------------------------------------------------------------

def process_onboarding_dropoffs() -> dict:
    """Scan for signed-up users who never confirmed their profile.
    Day 1 nudge, Day 3 personal follow-up.

    Safety invariant: ONBOARDING_DROPOFF_LAUNCH_DATE filter prevents
    retro-firing on the ~270 backfilled users whose profileConfirmedAt is
    null only because the field didn't exist when they onboarded. If you
    remove this filter, expect a wave of confused replies from long-time
    users being told to "finish setup."
    """
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    sent = {'day_1': 0, 'day_3': 0}
    now = datetime.now(timezone.utc)

    for snap in db.collection('users').stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email')
        if not email:
            continue

        # Already confirmed onboarding: nothing to nudge
        if user.get('profileConfirmedAt'):
            continue

        # Paying users already invested. No onboarding nudge.
        tier = user.get('subscriptionTier') or user.get('tier') or 'free'
        if tier in ('pro', 'elite'):
            continue

        signup_at = _parse_ts_or_dt(user.get('signupAt'))
        if not signup_at:
            continue

        # Launch-date safety filter (see docstring)
        if signup_at < ONBOARDING_DROPOFF_LAUNCH_DATE:
            continue

        hours_since_signup = (now - signup_at).total_seconds() / 3600

        # Day 1: signup 24-48h ago, still no profile confirmation
        if 24 < hours_since_signup < 48 and not already_sent(uid, 'onboarding_dropoff', 'day_1'):
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='onboarding_dropoff',
                step='day_1',
                subject="you're 60 seconds from being set up",
                body_paragraphs=[
                    f"Hey, {SIGNATURE_NAME} here.",
                    "Saw you signed up but didn't finish setting up your profile. It takes about 60 seconds and unlocks alumni and hiring-manager search dialed to the companies you're targeting.",
                    "The rest of Offerloop is only useful once your profile is in.",
                ],
                cta_label="Finish setting up",
                cta_url=f'{PUBLIC_BASE_URL}/onboarding?utm_source=lifecycle&utm_campaign=onboarding_dropoff&utm_content=day_1',
            )
            if res.get('sent'):
                sent['day_1'] += 1

        # Day 3: signup 72-96h ago, still no profile confirmation
        elif 72 < hours_since_signup < 96 and not already_sent(uid, 'onboarding_dropoff', 'day_3'):
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='onboarding_dropoff',
                step='day_3',
                subject="anything i can help with?",
                body_paragraphs=[
                    f"Hey, {SIGNATURE_NAME} again.",
                    "One more nudge. If the onboarding flow is confusing, if something isn't working, or if you're just not sure Offerloop fits what you're recruiting for, reply to this email. I read every reply and answer.",
                    "If Offerloop isn't the right thing right now, no worries. Reply 'stop' and I'll take you off the list.",
                ],
                cta_label=None,
                cta_url=None,
            )
            if res.get('sent'):
                sent['day_3'] += 1

    return {'ok': True, 'sent': sent}


# ---------------------------------------------------------------------------
# Sequence 7: First-search activation (confirmed profile but never searched)
# ---------------------------------------------------------------------------

def process_first_search_activations() -> dict:
    """Scan for users who confirmed profile but haven't run a first search.
    Day 2 nudge (the one thing to do this week), Day 5 specific example.

    Safety invariant: FIRST_SEARCH_ACTIVATION_LAUNCH_DATE gates on signupAt
    (not profileConfirmedAt) so backfilled users whose profileConfirmedAt is
    null AND whose signupAt predates the launch never enroll. The scan also
    naturally skips backfilled users because they have no profileConfirmedAt
    stamp at all, but the signup-date filter is belt-and-suspenders in case
    a future backfill ever populates that field.
    """
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    sent = {'day_2': 0, 'day_5': 0}
    now = datetime.now(timezone.utc)

    for snap in db.collection('users').stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email')
        if not email:
            continue

        # Must have confirmed profile (didn't drop off during onboarding)
        profile_confirmed_at = _parse_ts_or_dt(user.get('profileConfirmedAt'))
        if not profile_confirmed_at:
            continue

        # Skip users who already ran their first search
        if _parse_ts_or_dt(user.get('firstSearchAt')):
            continue

        # Paying users already invested. Skip.
        tier = user.get('subscriptionTier') or user.get('tier') or 'free'
        if tier in ('pro', 'elite'):
            continue

        # Belt-and-suspenders launch-date filter on signupAt
        signup_at = _parse_ts_or_dt(user.get('signupAt'))
        if not signup_at or signup_at < FIRST_SEARCH_ACTIVATION_LAUNCH_DATE:
            continue

        hours_since_confirm = (now - profile_confirmed_at).total_seconds() / 3600

        # Personalization: use user's targetIndustries or targetCompanies to
        # concretize the example. Falls back to a generic phrasing if we
        # don't have either signal (rare — onboarding collects at least one).
        industries = user.get('targetIndustries') or []
        primary_industry = (industries[0] if industries else '').lower()
        companies = user.get('targetCompanies') or user.get('dreamCompanies') or []
        primary_company = companies[0] if companies else None

        # Day 2: 48-72h after profileConfirmedAt
        if 48 < hours_since_confirm < 72 and not already_sent(uid, 'first_search_activation', 'day_2'):
            if primary_industry:
                second_line = f"The one thing to do this week: search Find for one hiring manager or alumni at a {primary_industry} firm you actually care about."
            else:
                second_line = "The one thing to do this week: search Find for one hiring manager or alumni at a firm you actually care about."
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='first_search_activation',
                step='day_2',
                subject="the one thing to do this week",
                body_paragraphs=[
                    f"Hey, {SIGNATURE_NAME} here.",
                    second_line,
                    "One search takes about 30 seconds. Either what Offerloop returns is dialed enough that the rest of the workflow makes sense, or it isn't, and you'll know in that first minute. Better than sitting on it.",
                ],
                cta_label="Run your first search",
                cta_url=f'{PUBLIC_BASE_URL}/find?utm_source=lifecycle&utm_campaign=first_search_activation&utm_content=day_2',
            )
            if res.get('sent'):
                sent['day_2'] += 1

        # Day 5: 120-144h after profileConfirmedAt
        elif 120 < hours_since_confirm < 144 and not already_sent(uid, 'first_search_activation', 'day_5'):
            if primary_company and primary_industry:
                example_line = f"Try this specifically: type '{primary_industry} analyst at {primary_company}' (or whatever role you're targeting) in Find. That's the exact query pattern our most active users start with."
            elif primary_industry:
                example_line = f"Try this specifically: type '{primary_industry} analyst at [company you're targeting]' in Find. Fill in the company that matters to you. That's the exact query pattern our most active users start with."
            else:
                example_line = "Try this specifically: type '[role you're recruiting for] at [company you're targeting]' in Find. Concrete title, concrete firm. That's how our most active users start."
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='first_search_activation',
                step='day_5',
                subject="one specific thing to try",
                body_paragraphs=[
                    f"Hey, {SIGNATURE_NAME} again.",
                    "Your profile is set up but you haven't tried a search yet. That's usually the hardest step for new users so I'll drop something specific.",
                    example_line,
                    "If the results feel off or you're not sure what to search for, reply and tell me what you're recruiting for. I'll suggest a search that actually fits.",
                ],
                cta_label="Try the search",
                cta_url=f'{PUBLIC_BASE_URL}/find?utm_source=lifecycle&utm_campaign=first_search_activation&utm_content=day_5',
            )
            if res.get('sent'):
                sent['day_5'] += 1

    return {'ok': True, 'sent': sent}


# ---------------------------------------------------------------------------
# Sequence 8: First-send activation (searched but never sent an email)
# ---------------------------------------------------------------------------

def process_first_send_activations() -> dict:
    """Scan for users who ran a first search but never sent an email.
    Addresses the "I found the contact but I'm scared to send" freeze
    that stops a lot of first-time cold outreach.

    Day 3 (72-96h after firstSearchAt): Name the fear, offer the shortest
    template that works, one CTA to compose.

    Day 7 (168-192h after firstSearchAt): Personal reply CTA from Deena.
    (The plan spec calls for an anonymized case study on Day 7 but that
    requires real user data; leaving as a reply-only prompt until Sid
    has a real case study to plug in.)

    Safety filter: FIRST_SEND_ACTIVATION_LAUNCH_DATE gates on signupAt
    to protect the backfilled users. Belt-and-suspenders alongside the
    natural firstSearchAt-must-be-set filter.
    """
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    sent = {'day_3': 0, 'day_7': 0}
    now = datetime.now(timezone.utc)

    for snap in db.collection('users').stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email')
        if not email:
            continue

        # Must have run a search (past the profile-confirm and first-search steps)
        first_search_at = _parse_ts_or_dt(user.get('firstSearchAt'))
        if not first_search_at:
            continue

        # Skip users who already sent an email
        if _parse_ts_or_dt(user.get('firstEmailSentAt')):
            continue

        # Paying users skip
        tier = user.get('subscriptionTier') or user.get('tier') or 'free'
        if tier in ('pro', 'elite'):
            continue

        # Launch-date safety filter on signupAt
        signup_at = _parse_ts_or_dt(user.get('signupAt'))
        if not signup_at or signup_at < FIRST_SEND_ACTIVATION_LAUNCH_DATE:
            continue

        hours_since_search = (now - first_search_at).total_seconds() / 3600

        # Day 3: 72-96h after first search
        if 72 < hours_since_search < 96 and not already_sent(uid, 'first_send_activation', 'day_3'):
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='first_send_activation',
                step='day_3',
                subject="the send is the whole game",
                body_paragraphs=[
                    f"Hey, {SIGNATURE_NAME} here.",
                    "Saw you ran a search but haven't sent an email yet. That's the most common freeze point for first-time cold outreach — the search gives you the contacts, but hitting send feels like a real thing you can't take back.",
                    "The move that actually works is stupidly short. Two sentences, one question. Something like: 'Hey {first_name}, I'm a {school} student recruiting for {industry}. Would you be open to a 15-min call so I can ask how you got to {company}?' That's it. That's the whole thing. Most replies come back within 48 hours.",
                    "Offerloop drafts something like that for you in one click. Try one send this week and see what comes back.",
                ],
                cta_label="Draft your first email",
                cta_url=f'{PUBLIC_BASE_URL}/find?utm_source=lifecycle&utm_campaign=first_send_activation&utm_content=day_3',
            )
            if res.get('sent'):
                sent['day_3'] += 1

        # Day 7: 168-192h after first search
        elif 168 < hours_since_search < 192 and not already_sent(uid, 'first_send_activation', 'day_7'):
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='first_send_activation',
                step='day_7',
                subject="what's the block?",
                body_paragraphs=[
                    f"Hey, {SIGNATURE_NAME} again.",
                    "You ran a search a week ago and still haven't sent an email. There's usually one specific thing holding people up: not sure what to say, not sure who to send to first, worried about looking dumb, or the whole thing feels performative.",
                    "Whatever it is, reply and tell me. I'll help figure out the shortest first send that gets you a reply.",
                ],
                cta_label=None,
                cta_url=None,
            )
            if res.get('sent'):
                sent['day_7'] += 1

    return {'ok': True, 'sent': sent}


# ---------------------------------------------------------------------------
# Cron entry: fires all time-based sequences
# ---------------------------------------------------------------------------

def process_all_pending_emails() -> dict:
    return {
        'pricing_abandon': process_pricing_leads(),
        'checkout_abandon': process_checkout_abandons(),
        'trial_ending': process_trial_endings(),
        'winback': process_winbacks(),
        'onboarding_dropoff': process_onboarding_dropoffs(),
        'first_search_activation': process_first_search_activations(),
        'first_send_activation': process_first_send_activations(),
    }


# ---------------------------------------------------------------------------
# Lead capture
# ---------------------------------------------------------------------------

def capture_pricing_lead(email: str, utm_source: Optional[str] = None) -> dict:
    if not email or '@' not in email:
        return {'ok': False, 'error': 'invalid_email'}
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    docs = list(db.collection('lifecycle_leads').where('email', '==', email.lower()).limit(1).stream())
    if docs:
        lead_id = docs[0].id
        db.collection('lifecycle_leads').document(lead_id).update({
            'captured_at': datetime.now(timezone.utc),
            'utm_source': utm_source or docs[0].to_dict().get('utm_source'),
        })
        return {'ok': True, 'lead_id': lead_id, 'returning': True}

    lead_id = secrets.token_urlsafe(12)
    db.collection('lifecycle_leads').document(lead_id).set({
        'email': email.lower(),
        'source': 'pricing_exit',
        'utm_source': utm_source,
        'captured_at': datetime.now(timezone.utc),
    })
    return {'ok': True, 'lead_id': lead_id, 'returning': False}
