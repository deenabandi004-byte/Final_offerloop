"""
Lifecycle email routes: cron tick, pricing-page capture (anonymous + signed-in),
unsubscribe.

Auth modes:
  - /api/lifecycle/tick             secret-guarded (LIFECYCLE_CRON_SECRET)
  - /api/lifecycle/pricing-capture  anonymous, body-supplied email
  - /api/lifecycle/pricing-view     Firebase-auth'd, extracts email from user doc
  - /api/lifecycle/job-board-view   Firebase-auth'd, stamps jobBoardVisitedAt
  - /api/lifecycle/unsubscribe      HMAC-verified token

See `backend/app/services/lifecycle_emails.py` for the campaign logic itself.
"""
import os
import logging
from flask import Blueprint, request, jsonify, render_template_string

from app.extensions import require_firebase_auth, get_db
from app.services.lifecycle_emails import (
    process_all_pending_emails,
    capture_pricing_lead,
    verify_unsubscribe_token,
    is_unsubscribed,
    record_unsubscribe,
)

logger = logging.getLogger(__name__)

lifecycle_bp = Blueprint('lifecycle', __name__, url_prefix='/api/lifecycle')


@lifecycle_bp.route('/tick', methods=['POST', 'GET'])
def tick():
    """Cron entrypoint. Runs every sequence's time-based scan.

    Auth: shared secret in `X-Cron-Secret` header (or `?secret=` query string
    for dev). The Render cron job sets the same secret in its config.
    """
    expected = os.getenv('LIFECYCLE_CRON_SECRET', '')
    provided = request.headers.get('X-Cron-Secret') or request.args.get('secret', '')
    if not expected or not provided or provided != expected:
        return jsonify({'error': 'unauthorized'}), 401

    try:
        results = process_all_pending_emails()
    except Exception as e:
        logger.exception("lifecycle tick failed")
        return jsonify({'error': str(e)}), 500

    return jsonify({'ok': True, 'results': results}), 200


@lifecycle_bp.route('/stats', methods=['GET'])
def stats():
    """Send-count snapshot per campaign / step over the past N days.

    Auth: same cron-secret gate as `/tick` (this is an operator surface, not
    end-user). Read-only aggregation over `lifecycle_email_log`. Groups by
    campaign then step, plus a variant breakdown for any campaign that ran
    an A/B test.

    Query params:
      - days: lookback window (default 7, max 90)
    """
    expected = os.getenv('LIFECYCLE_CRON_SECRET', '')
    provided = request.headers.get('X-Cron-Secret') or request.args.get('secret', '')
    if not expected or not provided or provided != expected:
        return jsonify({'error': 'unauthorized'}), 401

    try:
        days = max(1, min(90, int(request.args.get('days', 7))))
    except Exception:
        days = 7

    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    cutoff = _dt.now(_tz.utc) - _td(days=days)

    db = get_db()
    if not db:
        return jsonify({'ok': False, 'error': 'db_unavailable'}), 500

    by_campaign: dict = {}
    variants: dict = {}
    total = 0
    try:
        q = db.collection('lifecycle_email_log').where('sent_at', '>=', cutoff).limit(10000)
        for snap in q.stream():
            row = snap.to_dict() or {}
            campaign = row.get('campaign', 'unknown')
            step = row.get('step', 'unknown')
            variant = row.get('variant')
            by_campaign.setdefault(campaign, {})
            by_campaign[campaign][step] = by_campaign[campaign].get(step, 0) + 1
            total += 1
            if variant:
                key = f"{campaign}:{step}:{variant}"
                variants[key] = variants.get(key, 0) + 1
    except Exception as exc:
        logger.exception("lifecycle stats aggregation failed")
        return jsonify({'ok': False, 'error': str(exc)}), 500

    return jsonify({
        'ok': True,
        'window_days': days,
        'total_sends': total,
        'by_campaign': by_campaign,
        'variants': variants,
    }), 200


@lifecycle_bp.route('/pricing-capture', methods=['POST'])
def pricing_capture():
    """Email capture from the /pricing exit-intent popup.

    Body: { email: string, utm_source?: string }
    Returns: { ok, lead_id, returning }
    """
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email or len(email) > 254:
        return jsonify({'error': 'invalid_email'}), 400

    utm_source = data.get('utm_source')
    result = capture_pricing_lead(email, utm_source=utm_source)
    if not result.get('ok'):
        return jsonify(result), 500

    return jsonify(result), 200


@lifecycle_bp.route('/pricing-view', methods=['POST'])
@require_firebase_auth
def pricing_view():
    """Signed-in user landed on /pricing. Captures them as a pricing_abandon
    lead so the existing Day 0 / Day 2 / Day 5 sequence fires. Replaces the
    removed PricingExitPopup capture point.

    Skip if user is already on Pro or Elite (no need to nudge them to upgrade).

    Anonymous /pricing visitors aren't captured by this endpoint. Rebuilding
    anonymous capture (popup or inline form) is a separate design decision.
    """
    uid = request.firebase_user.get('uid')
    if not uid:
        return jsonify({'error': 'unauthorized'}), 401

    db = get_db()
    if not db:
        return jsonify({'ok': False, 'error': 'db_unavailable'}), 500

    try:
        snap = db.collection('users').document(uid).get()
    except Exception as exc:
        logger.exception("pricing_view db read failed for uid=%s", uid)
        return jsonify({'ok': False, 'error': str(exc)}), 500

    if not snap.exists:
        return jsonify({'ok': False, 'error': 'user_not_found'}), 404
    user = snap.to_dict() or {}

    email = user.get('email')
    if not email:
        return jsonify({'ok': False, 'error': 'no_email'}), 400

    tier = user.get('subscriptionTier') or user.get('tier') or 'free'
    if tier in ('pro', 'elite'):
        return jsonify({'ok': True, 'skipped': 'already_paying'}), 200

    result = capture_pricing_lead(email, utm_source='pricing_view')
    if not result.get('ok'):
        return jsonify(result), 500
    return jsonify(result), 200


@lifecycle_bp.route('/job-board-view', methods=['POST'])
@require_firebase_auth
def job_board_view():
    """Signed-in user landed on /job-board. One-shot stamps
    `jobBoardVisitedAt` on the user doc. Used to exclude them from
    campaign #11 (Job Board discovery), which prompts users who haven't
    found the tab yet.

    Idempotent: repeated calls do not overwrite the first-visit timestamp.
    """
    uid = request.firebase_user.get('uid')
    if not uid:
        return jsonify({'error': 'unauthorized'}), 401
    try:
        from app.services.lifecycle_signals import stamp_job_board_visited
        stamp_job_board_visited(uid)
    except Exception as exc:
        logger.debug("job_board_view stamp failed for %s: %s", uid, exc)
    return jsonify({'ok': True}), 200


@lifecycle_bp.route('/unsubscribe', methods=['GET'])
def unsubscribe():
    """Token-authed unsubscribe. Called from List-Unsubscribe header + email
    footer links. Idempotent — confirms even if already unsubscribed."""
    email = (request.args.get('email') or '').strip().lower()
    token = request.args.get('token') or ''

    if not email or '@' not in email or not token:
        return _unsubscribe_page(success=False, message='Invalid unsubscribe link.'), 400

    if not verify_unsubscribe_token(email, token):
        return _unsubscribe_page(success=False, message='That link is invalid or has expired.'), 400

    if is_unsubscribed(email):
        return _unsubscribe_page(success=True, message='You\'re already unsubscribed. We won\'t email you again.'), 200

    record_unsubscribe(email)
    # Mirror the opt-out into users/{uid} for the campaign scanner + newsletter
    # sync. Look up by email since the unsub link doesn't carry a uid.
    try:
        from app.extensions import get_db
        from app.services.lifecycle_signals import set_newsletter_subscribed
        db = get_db()
        if db:
            for snap in db.collection('users').where('email', '==', email).limit(1).stream():
                set_newsletter_subscribed(snap.id, False)
                break
    except Exception as e:
        logger.debug("newsletter opt-out mirror failed for %s: %s", email, e)
    return _unsubscribe_page(success=True, message='You\'re unsubscribed. We won\'t email you again.'), 200


_UNSUB_HTML = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Offerloop — Unsubscribe</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0; padding:0; background:#FAFBFF; font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;">
  <div style="max-width:480px; margin:80px auto; padding:32px 28px; background:#fff; border:1px solid #E2E8F0; border-radius:14px; box-shadow:0 4px 12px rgba(15,37,69,0.06);">
    <div style="font-size:11px; font-weight:800; letter-spacing:0.18em; color:#6478B4; text-transform:uppercase; margin-bottom:14px;">Offerloop</div>
    <h1 style="font-family:'Libre Baskerville', Georgia, serif; font-size:28px; line-height:1.2; font-weight:400; color:#003262; margin:0 0 14px;">{{ headline }}</h1>
    <p style="font-size:14px; line-height:1.6; color:#475569;">{{ message }}</p>
    <p style="margin-top:24px;"><a href="https://offerloop.ai" style="color:#2563EB; text-decoration:none; font-weight:600;">← Back to offerloop.ai</a></p>
  </div>
</body>
</html>
"""


def _unsubscribe_page(success: bool, message: str):
    headline = 'You\'re unsubscribed' if success else 'Something went wrong'
    return render_template_string(_UNSUB_HTML, headline=headline, message=message)
