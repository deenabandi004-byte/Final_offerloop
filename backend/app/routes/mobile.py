"""
Mobile app thin API shims (/api/mobile/*).

The Expo app reuses the existing web endpoints directly wherever their shapes
fit; this blueprint adds only the few things that genuinely don't exist as a
single mobile-shaped call. Everything is behind @require_firebase_auth and
reuses existing services, not new business logic.
"""
import calendar
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from app.config import TIER_CONFIGS
from app.extensions import get_db, require_firebase_auth
from app.models.users import (
    create_user_data,
    get_structured_school,
    get_structured_target_industries,
)

mobile_bp = Blueprint('mobile', __name__, url_prefix='/api/mobile')

PLAN_LABEL = {'free': 'Free', 'pro': 'Pro', 'elite': 'Elite'}


def _ensure_user_doc(db, uid: str, email: str, name: str = '') -> dict:
    """Email-link users sign in purely via Firebase, so their Firestore doc may
    not exist yet on the first authenticated call. Provision it with free-tier
    defaults (mirrors the google-extension path) so /me always has real data."""
    ref = db.collection('users').document(uid)
    snap = ref.get()
    if snap.exists:
        return snap.to_dict() or {}
    tier = 'free'
    cfg = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
    data = create_user_data(
        uid=uid,
        email=email,
        tier=tier,
        name=name,
        credits=cfg.get('credits'),
        max_credits=cfg.get('credits'),
    )
    ref.set(data)
    return data


def _gmail_status(db, uid: str, fallback_email: str):
    """Connected iff the integrations/gmail doc exists with an access token."""
    try:
        snap = db.collection('users').document(uid).collection('integrations').document('gmail').get()
        if snap.exists:
            d = snap.to_dict() or {}
            if d.get('token'):
                return True, (d.get('gmailAddress') or fallback_email or '')
    except Exception:
        pass
    return False, ''


def _reset_label() -> str:
    """Credits reset at the calendar month boundary; label the next one."""
    now = datetime.now()
    next_month = now.month % 12 + 1
    return f"Resets {calendar.month_abbr[next_month]} 1"


def _relative_label(iso: str) -> str:
    """Short relative time ('Just now', '2h', '3d') for notification rows."""
    if not iso:
        return ''
    try:
        dt = datetime.fromisoformat(str(iso).replace('Z', '+00:00'))
    except Exception:
        return ''
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    secs = (datetime.now(timezone.utc) - dt).total_seconds()
    if secs < 60:
        return 'Just now'
    mins = int(secs // 60)
    if mins < 60:
        return f'{mins}m'
    hours = mins // 60
    if hours < 24:
        return f'{hours}h'
    days = hours // 24
    if days < 7:
        return f'{days}d'
    weeks = days // 7
    if weeks < 5:
        return f'{weeks}w'
    try:
        return dt.strftime('%b %-d')
    except Exception:
        return dt.strftime('%b %d')


def _map_notification_item(item: dict) -> dict:
    """Map a stored notifications/outbox item onto the mobile NotificationItem
    shape ({id, kind, text, timeLabel, read, outreachId?}). Reply items deep-
    link to the conversation; loop-run items are informational."""
    is_loop = item.get('kind') == 'loop_run'
    snippet = (item.get('snippet') or '').strip()
    ts = item.get('timestamp') or ''
    read = bool(item.get('read'))

    if is_loop:
        name = item.get('loopName') or item.get('contactName') or 'Your Loop'
        text = f'{name}: {snippet}' if snippet else f'{name} ran'
        return {
            'id': item.get('cycleId') or f"{item.get('loopId', 'loop')}:{ts}",
            'kind': 'loop',
            'text': text,
            'timeLabel': _relative_label(ts),
            'read': read,
        }

    name = item.get('contactName') or item.get('company') or 'Someone'
    text = f'{name} replied: {snippet}' if snippet else f'{name} replied'
    contact_id = item.get('contactId') or ''
    return {
        'id': item.get('messageId') or (f'{contact_id}:{ts}' if contact_id else ts),
        'kind': 'reply',
        'text': text,
        'timeLabel': _relative_label(ts),
        'read': read,
        'outreachId': contact_id,
    }


def _map_resume_experiences(parsed: dict) -> list:
    """Map resumeParsed.experience[] (written by the web resume parser, see
    routes/resume.py) onto the mobile ResumeExperience shape. Real data only —
    entries with no role AND no org are skipped so the Profile parse view never
    shows empty/placeholder cards."""
    out = []
    for i, exp in enumerate((parsed or {}).get('experience') or []):
        if not isinstance(exp, dict):
            continue
        role = (exp.get('title') or '').strip()
        org = (exp.get('company') or '').strip()
        if not role and not org:
            continue
        bullets = [b.strip() for b in (exp.get('bullets') or []) if isinstance(b, str) and b.strip()]
        out.append({
            'id': f'exp-{i}',
            'role': role or 'Role',
            'org': org,
            'dates': (exp.get('dates') or '').strip(),
            'location': (exp.get('location') or '').strip() or None,
            'bullets': bullets,
        })
    return out


@mobile_bp.get('/me')
@require_firebase_auth
def me():
    """One call for everything Profile + the guardrails need. Maps the user doc
    onto the shape the mobile profile object expects."""
    db = get_db()
    fb = request.firebase_user
    uid = fb['uid']
    email = fb.get('email', '') or ''
    name = fb.get('name') or ''

    u = _ensure_user_doc(db, uid, email, name)

    tier = str(u.get('subscriptionTier') or u.get('tier') or 'free').lower()
    prof = u.get('professionalInfo') or {}
    academics = u.get('academics') or {}
    gmail_connected, gmail_address = _gmail_status(db, uid, email)

    target_roles = u.get('targetRoles')
    if not isinstance(target_roles, list) or not target_roles:
        ct = (
            u.get('careerTrack')
            or (u.get('goals') or {}).get('careerTrack')
            or prof.get('careerTrack')
        )
        target_roles = [ct] if ct else []

    resume_url = u.get('resumeUrl') or prof.get('resumeUrl')
    resume_name = (
        u.get('resumeFileName')
        or prof.get('resumeFileName')
        or ('Resume.pdf' if resume_url else None)
    )
    resume_experiences = _map_resume_experiences(u.get('resumeParsed') or {})

    return jsonify({
        'name': u.get('name') or name or (email.split('@')[0] if email else 'You'),
        'email': email,
        'photoUrl': u.get('picture') or u.get('photoURL') or fb.get('picture') or '',
        'school': get_structured_school(u),
        'plan': PLAN_LABEL.get(tier, 'Free'),
        'tier': tier,
        'credits': int(u.get('credits') or 0),
        'maxCredits': int(u.get('maxCredits') or 0),
        'resetLabel': _reset_label(),
        'creditsPerSwipe': 10,
        'gmailConnected': gmail_connected,
        'gmailAddress': gmail_address,
        'resume': ({'name': resume_name, 'url': resume_url} if resume_name else None),
        'linkedinUrl': u.get('linkedinUrl') or prof.get('linkedinUrl') or '',
        'targetRoles': target_roles,
        'industries': get_structured_target_industries(u),
        'gradYear': str(academics.get('gradYear') or prof.get('gradYear') or u.get('gradYear') or ''),
        'about': u.get('personalNote') or u.get('about') or '',
        'resumeExperiences': resume_experiences,
        # No clean real source yet (linkedinEnrichmentData is raw Bright Data);
        # return empty so the Profile LinkedIn section hides rather than show
        # fabricated highlights. TODO: map from linkedinEnrichmentData.
        'linkedinHighlights': [],
    }), 200


@mobile_bp.post('/device')
@require_firebase_auth
def register_device():
    """Store an Expo push token for the signed-in user's device so the backend
    can push reply / draft-ready alerts. Idempotent (keyed by token hash)."""
    uid = request.firebase_user['uid']
    data = request.get_json(silent=True) or {}
    token = (data.get('token') or '').strip()
    platform = (data.get('platform') or '').strip()
    if not token:
        return jsonify({'error': 'Missing token'}), 400

    from app.services.push_service import is_expo_token, register_device as store_token
    if not is_expo_token(token):
        return jsonify({'error': 'Invalid push token'}), 400
    if not store_token(uid, token, platform):
        return jsonify({'error': 'Could not register device'}), 500
    return jsonify({'registered': True}), 200


@mobile_bp.get('/notifications')
@require_firebase_auth
def notifications():
    """The header-bell feed. Reads users/{uid}/notifications/outbox (the same
    doc the reply webhook + loop cycles append to) and maps it to the mobile
    NotificationItem shape, so a push that just landed shows up in the list."""
    db = get_db()
    uid = request.firebase_user['uid']
    try:
        snap = db.collection('users').document(uid).collection('notifications').document('outbox').get()
        data = (snap.to_dict() or {}) if snap.exists else {}
    except Exception:
        data = {}
    raw_items = list(data.get('items') or [])
    items = [_map_notification_item(it) for it in raw_items]
    unread = sum(1 for it in items if not it['read'])
    return jsonify({'items': items, 'unreadCount': unread}), 200


@mobile_bp.post('/notifications/read')
@require_firebase_auth
def mark_notifications_read():
    """Mark every bell item read and zero the unread counters (mirrors the
    web bell). Best-effort; returns ok even if the doc doesn't exist yet."""
    db = get_db()
    uid = request.firebase_user['uid']
    ref = db.collection('users').document(uid).collection('notifications').document('outbox')
    try:
        snap = ref.get()
        if snap.exists:
            data = snap.to_dict() or {}
            items = [{**it, 'read': True} for it in (data.get('items') or [])]
            ref.set(
                {'items': items, 'unreadReplyCount': 0, 'unreadLoopRunCount': 0},
                merge=True,
            )
    except Exception as exc:
        return jsonify({'error': str(exc) or 'Could not mark read'}), 500
    return jsonify({'ok': True}), 200


@mobile_bp.post('/outreach/<contact_id>/send')
@require_firebase_auth
def send_outreach(contact_id):
    """Send a cold-open draft in-app so the user never leaves for Gmail. Sends
    the existing Gmail draft by id when present (no duplicate); otherwise sends
    the stored subject/body fresh. Then advances the contact to sent."""
    db = get_db()
    uid = request.firebase_user['uid']
    ref = db.collection('users').document(uid).collection('contacts').document(contact_id)
    snap = ref.get()
    if not snap.exists:
        return jsonify({'error': 'Contact not found'}), 404
    c = snap.to_dict() or {}

    to = c.get('draftToEmail') or c.get('email')
    subject = c.get('emailSubject') or ''
    body = c.get('emailBody') or ''
    draft_id = c.get('gmailDraftId')
    if not draft_id and not (to and body):
        return jsonify({'error': 'No draft to send'}), 400

    try:
        from app.services.gmail_client import send_draft_for_user, send_email_for_user
        if draft_id:
            result = send_draft_for_user(uid, draft_id)
        else:
            result = send_email_for_user(uid, to, subject, (body or '').replace('\n', '<br>'))
    except ValueError:
        return jsonify({'error': 'Connect Gmail to send'}), 400
    except Exception as exc:
        return jsonify({'error': str(exc) or 'Gmail send failed'}), 500

    now = datetime.now().isoformat()
    ref.update({
        'pipelineStage': 'waiting_on_reply',
        'inOutbox': True,
        'emailSentAt': now,
        'lastActivityAt': now,
        'lastMessageFrom': 'me',
        'gmailThreadId': result.get('threadId') or c.get('gmailThreadId'),
        'gmailMessageId': result.get('id') or c.get('gmailMessageId'),
    })
    return jsonify({'sent': True, 'threadId': result.get('threadId', '')}), 200
