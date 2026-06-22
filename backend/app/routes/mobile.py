"""
Mobile app thin API shims (/api/mobile/*).

The Expo app reuses the existing web endpoints directly wherever their shapes
fit; this blueprint adds only the few things that genuinely don't exist as a
single mobile-shaped call. Everything is behind @require_firebase_auth and
reuses existing services, not new business logic.
"""
import calendar
import re
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

    if item.get('kind') == 'auto_apply_attention':
        company = item.get('company') or 'A job'
        count = int(item.get('count') or 0)
        qword = 'question' if count == 1 else 'questions'
        aid = item.get('autoApplyId') or ''
        return {
            'id': f'aa:{aid}',
            'kind': 'auto_apply_attention',
            'text': f'{company} needs your input — {count} {qword} to finish applying',
            'timeLabel': _relative_label(ts),
            'read': read,
            'autoApplyId': aid,
        }

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


def _grad_year(u: dict, prof: dict, academics: dict) -> str:
    """Grad year, preferring explicit profile fields, then auto-extracted from
    the parsed resume's education.graduation (e.g. 'May 2024' -> '2024')."""
    explicit = academics.get('gradYear') or prof.get('gradYear') or u.get('gradYear')
    if explicit:
        return str(explicit)
    edu = (u.get('resumeParsed') or {}).get('education') or {}
    grad = str(edu.get('graduation') or '')
    m = re.search(r'(19|20)\d{2}', grad)
    return m.group(0) if m else ''


def _linkedin_highlights(u: dict) -> list:
    """Compose the Profile 'what we gathered from your LinkedIn' bullets from the
    structured linkedinResumeParsed (written by the LinkedIn enrichment flow,
    routes/enrichment.py). Real data only — empty list when not enriched, so the
    section hides rather than showing fabricated bullets."""
    lp = u.get('linkedinResumeParsed') or {}
    if not isinstance(lp, dict):
        return []
    out: list = []
    objective = str(lp.get('objective') or '').strip()
    if objective:
        out.append(objective)
    skills = lp.get('skills') or {}
    flat: list = []
    if isinstance(skills, dict):
        for k in ('technical', 'tools', 'soft_skills', 'languages'):
            flat.extend(s.strip() for s in (skills.get(k) or []) if isinstance(s, str) and s.strip())
    elif isinstance(skills, list):
        flat.extend(s.strip() for s in skills if isinstance(s, str) and s.strip())
    if flat:
        out.append('Skills: ' + ', '.join(flat[:8]))
    for e in (lp.get('extracurriculars') or [])[:3]:
        if isinstance(e, dict):
            label = (e.get('organization') or e.get('activity') or '').strip()
            role = (e.get('role') or '').strip()
            if role and label:
                out.append(f'{role} — {label}')
            elif label:
                out.append(label)
        elif isinstance(e, str) and e.strip():
            out.append(e.strip())
    return out[:6]


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

    resume_parsed = u.get('resumeParsed') or {}
    resume_url = u.get('resumeUrl') or prof.get('resumeUrl')
    resume_name = (
        u.get('resumeFileName')
        or prof.get('resumeFileName')
        or ('Resume.pdf' if resume_url else None)
        # A parsed resume counts as on-file even if the original file URL/name
        # wasn't stored (older uploads), so the profile reflects what we have.
        or ('Resume' if resume_parsed else None)
    )
    resume_experiences = _map_resume_experiences(resume_parsed)

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
        # Phone for pre-filling the auto-apply Application Profile. Same source
        # order job_board.py uses: resume-parsed contact, then the user doc.
        'phone': (
            (resume_parsed.get('contact') or {}).get('phone')
            or u.get('phone')
            or prof.get('phone')
            or ''
        ),
        'targetRoles': target_roles,
        # Job location preferences — the feed already reads this as a soft geo
        # ranking signal (jobs.py _signals / job_board ranking). Surfaced so the
        # app's Location preferences editor can show + update it.
        'preferredLocations': (
            u.get('preferredLocations')
            or u.get('targetLocations')
            or ((u.get('location') or {}).get('preferredLocation')
                if isinstance(u.get('location'), dict) else None)
            or []
        ),
        'industries': get_structured_target_industries(u),
        'gradYear': _grad_year(u, prof, academics),
        'about': u.get('personalNote') or u.get('about') or resume_parsed.get('objective') or '',
        'resumeExperiences': resume_experiences,
        'linkedinHighlights': _linkedin_highlights(u),
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


@mobile_bp.post('/preferences')
@require_firebase_auth
def save_preferences():
    """Save the user's job location preferences. The feed already reads
    preferredLocations as a soft geo ranking signal (jobs.py _signals +
    job_board ranking), so setting it here improves feed relevance without
    touching the ranking engine. Soft, not a hard filter — off-location jobs
    still surface for swipe volume."""
    db = get_db()
    uid = request.firebase_user['uid']
    data = request.get_json(silent=True) or {}
    locs = data.get('preferredLocations')
    if not isinstance(locs, list):
        return jsonify({'error': 'preferredLocations must be a list'}), 400
    clean = []
    for x in locs:
        s = str(x).strip()
        if s and s not in clean:
            clean.append(s)
    clean = clean[:20]
    db.collection('users').document(uid).set({'preferredLocations': clean}, merge=True)
    return jsonify({'ok': True, 'preferredLocations': clean}), 200


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


def _company_slug(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', (name or '').strip().lower()).strip('-')


def _employee_label(value) -> str:
    """Normalize Firecrawl employee_count into a short size chip label."""
    if value in (None, '', 0):
        return ''
    s = str(value).strip()
    # Already a range or has 'employee'/'+' — use verbatim.
    if any(t in s.lower() for t in ('employee', '-', '–', '+', 'k')):
        return s if 'employee' in s.lower() else f'{s} employees'
    if s.replace(',', '').isdigit():
        return f'{s} employees'
    return s


def _first_industry(industries) -> str:
    if isinstance(industries, list):
        for i in industries:
            if isinstance(i, str) and i.strip():
                return i.strip()
        return ''
    return str(industries).strip() if industries else ''


def _map_company_profile(name: str, firecrawl: dict) -> dict:
    """Map a Firecrawl extract_company_profile dict onto the mobile CompanyInfo
    shape ({about, industry, size, hq, news}). News is omitted for v1."""
    fc = firecrawl or {}
    return {
        'name': name,
        'about': (fc.get('description') or '').strip(),
        'industry': _first_industry(fc.get('industries')),
        'size': _employee_label(fc.get('employee_count')),
        'hq': (fc.get('headquarters') or '').strip(),
        'news': [],  # v1: skip the second live news call
    }


# Cached company profiles are global (not per-user) and refreshed every 30 days —
# firm intel changes slowly and the live Perplexity+Firecrawl call is slow/costly.
_COMPANY_CACHE_TTL_DAYS = 30


@mobile_bp.get('/company/<path:name>')
@require_firebase_auth
def company(name: str):
    """Lightweight single-company overview for the app's company page. Reuses the
    firm-intel pipeline (Perplexity website discovery → Firecrawl profile), cached
    in Firestore companyProfiles/{slug}. Returns honest-empty fields when nothing
    is found rather than fabricating."""
    name = (name or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400

    db = get_db()
    slug = _company_slug(name)
    cache_ref = db.collection('companyProfiles').document(slug) if slug else None

    if cache_ref is not None:
        snap = cache_ref.get()
        if snap.exists:
            data = snap.to_dict() or {}
            fetched = data.get('fetchedAt')
            try:
                fetched_dt = datetime.fromisoformat(fetched) if isinstance(fetched, str) else None
            except ValueError:
                fetched_dt = None
            fresh = (
                fetched_dt is not None
                and (datetime.now(timezone.utc) - fetched_dt).days < _COMPANY_CACHE_TTL_DAYS
            )
            if fresh and data.get('profile'):
                return jsonify(data['profile']), 200

    try:
        from app.services.firm_details_extraction import _fetch_serp_results_only
        raw = _fetch_serp_results_only(name)
    except Exception:
        raw = None

    firecrawl = (raw or {}).get('_firecrawl_data') or {}
    profile = _map_company_profile(name, firecrawl)

    # Only cache when we actually got something, so a transient miss doesn't pin
    # an empty profile for 30 days.
    if cache_ref is not None and (profile['about'] or profile['industry'] or profile['hq']):
        try:
            cache_ref.set({
                'name': name,
                'profile': profile,
                'fetchedAt': datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass

    return jsonify(profile), 200


@mobile_bp.route('/meeting-prep/preview', methods=['POST'])
@require_firebase_auth
def meeting_prep_preview():
    """Free, read-only LinkedIn lookup so the app can confirm WHO a meeting prep
    is about before spending 15 credits on the full research job. Reuses the same
    `enrich_linkedin_profile` the prep itself runs (coffee_chat_prep.py:105) — no
    credit charge, no research, no PDF. Returns just enough for a confirm card."""
    data = request.get_json() or {}
    url = (data.get('linkedinUrl') or '').strip().rstrip('/')
    url = url.split('?')[0].split('#')[0]
    if 'linkedin.com/in/' not in url.lower():
        return jsonify({'ok': False, 'error': 'Enter a LinkedIn profile URL (linkedin.com/in/…)'}), 400

    try:
        from app.services.pdl_client import enrich_linkedin_profile
        c = enrich_linkedin_profile(url) or {}
    except Exception:
        c = {}

    if not c or not (c.get('fullName') or c.get('firstName')):
        # Not an error — the URL may just be too new/sparse for PDL. The app
        # falls back to letting the user prep anyway with a typed name.
        return jsonify({'ok': True, 'found': False}), 200

    edu = c.get('educationArray') or []
    school = ''
    if edu and isinstance(edu[0], dict):
        school = edu[0].get('school') or edu[0].get('name') or ''

    name = c.get('fullName') or f"{c.get('firstName', '')} {c.get('lastName', '')}".strip()
    return jsonify({
        'ok': True,
        'found': True,
        'name': name,
        'title': c.get('jobTitle') or '',
        'company': c.get('company') or '',
        'location': c.get('location') or '',
        'school': school,
    }), 200
