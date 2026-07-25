"""Onboarding resume builder: free Harvard one-pager for users without a resume."""
from flask import Blueprint, request, jsonify, Response
from firebase_admin import firestore

from app.services.resume_builder_service import (
    ResumeBuilderError,
    canonical_to_parsed_info,
    canonical_to_text,
    generate_canonical_resume,
)
from app.services.resume_renderer import (
    CanonicalResume,
    from_resume_parsed,
    render_html,
    render_one_page,
)
from app.services.resume_capabilities import build_resume_metadata
from app.routes.resume import save_resume_to_firebase
from ..extensions import require_firebase_auth, get_db

resume_builder_bp = Blueprint('resume_builder', __name__, url_prefix='/api/resume-builder')

GENERATION_CAP = 10
EDITOR_DAILY_CAP = 30
RESUME_FILENAME = "Offerloop_Resume.pdf"


def _check_and_count_attempt(uid: str):
    """Enforce the lifetime cap; count the attempt up front (success or not).

    Returns an error response tuple if capped, else None.
    """
    db = get_db()
    ref = db.collection('users').document(uid)
    doc = ref.get()
    used = (doc.to_dict() or {}).get('resumeBuilderGenerations', 0) if doc.exists else 0
    if used >= GENERATION_CAP:
        return jsonify({
            'error': 'generation_limit_reached',
            'message': 'You have used all free resume generations.',
        }), 429
    ref.update({'resumeBuilderGenerations': firestore.Increment(1)})
    return None


def _check_and_count_editor_attempt(uid: str):
    """Daily cap for the in-app resume editor (free, separate from the
    lifetime onboarding cap). Counts the attempt up front, success or not.

    Returns an error response tuple if capped, else None.
    """
    from datetime import datetime, timezone

    db = get_db()
    ref = db.collection('users').document(uid)
    doc = ref.get()
    data = (doc.to_dict() or {}) if doc.exists else {}
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    used = data.get('resumeEditorCount', 0) if data.get('resumeEditorDate') == today else 0
    if used >= EDITOR_DAILY_CAP:
        return jsonify({
            'error': 'editor_limit_reached',
            'message': 'You have hit the daily edit limit. It resets tomorrow.',
        }), 429
    ref.update({'resumeEditorDate': today, 'resumeEditorCount': used + 1})
    return None


def _upload_pdf(uid: str, pdf_bytes: bytes):
    """Upload the generated PDF to the same bucket/path uploaded resumes use."""
    try:
        from firebase_admin import storage
        bucket = storage.bucket()
        blob = bucket.blob(f'resumes/{uid}/{RESUME_FILENAME}')
        blob.upload_from_string(pdf_bytes, content_type='application/pdf')
        blob.make_public()
        return blob.public_url
    except Exception as e:
        print(f"[ResumeBuilder] Storage upload failed: {e}")
        return None


def _render_save_respond(uid: str, resume: CanonicalResume):
    result = render_one_page(resume)
    resume_url = _upload_pdf(uid, result.pdf_bytes)
    parsed = canonical_to_parsed_info(resume)
    metadata = build_resume_metadata(url=resume_url or '', filename=RESUME_FILENAME, extension='pdf')
    save_resume_to_firebase(uid, canonical_to_text(resume), resume_url, parsed, metadata)
    return jsonify({'success': True, 'resumeUrl': resume_url, 'parsed': parsed})


@resume_builder_bp.route('/generate', methods=['POST'])
@require_firebase_auth
def generate():
    uid = request.firebase_user['uid']
    data = request.get_json() or {}
    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return jsonify({'error': 'prompt is required'}), 400
    # The in-app resume editor is free with its own daily cap; only the
    # onboarding builder burns the lifetime generation cap.
    if data.get('context') == 'editor':
        capped = _check_and_count_editor_attempt(uid)
    else:
        capped = _check_and_count_attempt(uid)
    if capped:
        return capped
    try:
        resume = generate_canonical_resume(prompt, data.get('previous'))
    except ResumeBuilderError as e:
        return jsonify({'error': str(e)}), 502
    return jsonify({'success': True, 'resume': resume.model_dump(), 'html': render_html(resume)})


@resume_builder_bp.route('/current', methods=['GET'])
@require_firebase_auth
def current():
    """Return the user's stored resume in builder (canonical) form + HTML
    preview, so the in-app editor can start a refine loop from it. Returns
    resume: null when the user has no stored resume yet."""
    uid = request.firebase_user['uid']
    db = get_db()
    doc = db.collection('users').document(uid).get()
    parsed = (doc.to_dict() or {}).get('resumeParsed') if doc.exists else None
    if not isinstance(parsed, dict) or not parsed:
        return jsonify({'success': True, 'resume': None, 'html': None})
    try:
        resume = from_resume_parsed(parsed)
        return jsonify({'success': True, 'resume': resume.model_dump(), 'html': render_html(resume)})
    except Exception as e:
        print(f"[ResumeBuilder] current conversion failed: {e}")
        return jsonify({'success': True, 'resume': None, 'html': None})


@resume_builder_bp.route('/from-linkedin', methods=['POST'])
@require_firebase_auth
def from_linkedin():
    """Build + save a resume from the linkedinResumeParsed the enrichment
    route already stored. Frontend calls /api/enrich-linkedin-onboarding first."""
    uid = request.firebase_user['uid']
    capped = _check_and_count_attempt(uid)
    if capped:
        return capped
    db = get_db()
    doc = db.collection('users').document(uid).get()
    linkedin_parsed = (doc.to_dict() or {}).get('linkedinResumeParsed') if doc.exists else None
    if not linkedin_parsed or not linkedin_parsed.get('name'):
        return jsonify({'error': 'No LinkedIn profile data on file. Enrich first.'}), 400
    try:
        resume = from_resume_parsed(linkedin_parsed)
        return _render_save_respond(uid, resume)
    except Exception as e:
        print(f"[ResumeBuilder] from-linkedin failed: {e}")
        return jsonify({'error': 'Could not build a resume from your LinkedIn profile.'}), 502


@resume_builder_bp.route('/download', methods=['POST'])
@require_firebase_auth
def download():
    """Stream the current draft as a PDF download. Pure render: no storage
    write, no generation-cap charge, no onboarding side effects — users can
    download, keep refining, and still hit finalize."""
    data = request.get_json() or {}
    try:
        resume = CanonicalResume.model_validate(data.get('resume') or {})
    except Exception:
        return jsonify({'error': 'Invalid resume payload'}), 400
    try:
        result = render_one_page(resume)
    except Exception as e:
        print(f"[ResumeBuilder] download render failed: {e}")
        return jsonify({'error': 'Could not render your resume. Try again.'}), 502
    return Response(
        result.pdf_bytes,
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="{RESUME_FILENAME}"'},
    )


@resume_builder_bp.route('/finalize', methods=['POST'])
@require_firebase_auth
def finalize():
    uid = request.firebase_user['uid']
    data = request.get_json() or {}
    try:
        resume = CanonicalResume.model_validate(data.get('resume') or {})
    except Exception:
        return jsonify({'error': 'Invalid resume payload'}), 400
    try:
        return _render_save_respond(uid, resume)
    except Exception as e:
        print(f"[ResumeBuilder] finalize failed: {e}")
        return jsonify({'error': 'Could not save your resume. Try again.'}), 502
