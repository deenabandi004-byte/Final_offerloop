#!/usr/bin/env python3
"""
DEPRECATED as of 2026-04-28. Resume-based backfill is no longer the
migration strategy. Resume text in Firestore is stored as flattened
single-line strings, parser cannot extract structured fields. Replaced
by the 3-path onboarding gate (LinkedIn paste / Resume upload / Manual
form) which writes Phase 1 fields at onboarding time. Kept in repo for
reference but should not be run.

----------------------------------------------------------------------

Phase 1 backfill — promote users' resume content into structured fields.

Reads each `users/{uid}` doc, runs the existing `resume_parser_v2` over
`resumeText`, extracts the Phase 1 promoted fields, and writes them back
in a single batch. The user's `_backfillProvenance` map is set to
`'inferred_from_resume_backfill'` for each touched field so the
profile-confirm modal can highlight which values still need confirmation.

Idempotent: a user with `_backfillProvenance.confirmedAt` already set is
skipped. A user with `_backfillProvenance.backfilledAt` set is also
skipped unless `--force` is passed.

Resumable: writes a checkpoint doc at `system/phase1_backfill` after
each successful batch so a crash mid-run doesn't restart from zero
(addresses the §12 critical gap).

Throttled: batches at 100 docs/sec to stay under Firestore quotas.

Per-user error isolation: a single user's parse failure does NOT abort
the run; we log to the checkpoint's `failed` list and continue.

Filter: `--filter=paying` restricts the run to `subscriptionTier in
['pro','elite']` so smoke tests target the 41 paying subs without
burning rate-limit budget on free users. Default is `all`.

Usage:
    cd backend && python -m scripts.phase1_backfill                          # dry-run, all users
    cd backend && python -m scripts.phase1_backfill --apply                  # apply, all users
    cd backend && python -m scripts.phase1_backfill --filter=paying --limit 5  # smoke against paying
    cd backend && python -m scripts.phase1_backfill --apply --force          # re-do
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

# Make the backend package importable when running this script directly.
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_HERE)
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)
logger = logging.getLogger('phase1_backfill')

CHECKPOINT_PATH = ('system', 'phase1_backfill')
DOCS_PER_SECOND = 100
TARGET_INTERVAL = 1.0 / DOCS_PER_SECOND  # 0.01s between writes


def _load_app_extensions():
    """Initialize Firebase the same way wsgi.py does, but minimally."""
    from app.extensions import init_firebase
    from flask import Flask
    app = Flask(__name__)
    init_firebase(app)
    from app.extensions import get_db
    return get_db()


def _parse_resume(resume_text: str) -> Optional[Dict[str, Any]]:
    """Run the existing resume parser. Wraps exceptions per-user."""
    if not resume_text or not resume_text.strip():
        return None
    try:
        from app.services.resume_parser_v2 import parse_resume_v2
        return parse_resume_v2(resume_text)
    except Exception as exc:  # pragma: no cover — depends on parser internals
        logger.warning('resume parse failed: %s', exc)
        return None


def _detect_graduation_status(graduation_year: Optional[int]) -> Optional[str]:
    if graduation_year is None:
        return None
    today = datetime.now(timezone.utc)
    if graduation_year > today.year:
        return 'student'
    if graduation_year >= today.year - 2:
        return 'recent_grad'
    return 'experienced'


def _normalize_year(raw: Any) -> Optional[int]:
    """Extract a 4-digit year from messy parser output ('Expected May 2026')."""
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw if 2020 <= raw <= 2035 else None
    s = str(raw)
    import re
    matches = re.findall(r'(20\d{2})', s)
    if not matches:
        return None
    # Prefer the last year mentioned (graduation usually trails an "expected").
    try:
        year = int(matches[-1])
        return year if 2020 <= year <= 2035 else None
    except ValueError:
        return None


def _extract_promoted_fields(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """Project parser output → Phase 1 promoted fields.

    Conservative on purpose: when in doubt, leave the field None. The
    profile-confirm modal will surface gaps to the user, which is better
    than writing wrong data.
    """
    from app.models.users import normalize_company, normalize_school

    education_entries = parsed.get('education') or []
    primary_edu = education_entries[0] if education_entries else {}

    school = (primary_edu.get('university') or '').strip() or None
    major = (primary_edu.get('major') or primary_edu.get('degree') or '').strip() or None
    grad_year = _normalize_year(primary_edu.get('graduation'))
    gpa_raw = primary_edu.get('gpa')
    try:
        gpa = float(gpa_raw) if gpa_raw not in (None, '') else None
    except (TypeError, ValueError):
        gpa = None
    if gpa is not None and (gpa < 0.0 or gpa > 4.0):
        gpa = None

    experience_entries = parsed.get('experience') or []
    most_recent = experience_entries[0] if experience_entries else {}
    current_role = (most_recent.get('title') or '').strip() or None
    current_company = (most_recent.get('company') or '').strip() or None

    return {
        'school': school,
        'schoolNormalized': normalize_school(school),
        'major': major,
        'graduationYear': grad_year,
        'graduationStatus': _detect_graduation_status(grad_year),
        'gpa': gpa,
        'currentRole': current_role,
        'currentCompany': current_company,
        'currentCompanyNormalized': normalize_company(current_company),
    }


# ============================================================================
# Checkpoint helpers
# ============================================================================


def _read_checkpoint(db) -> Dict[str, Any]:
    doc = db.collection(CHECKPOINT_PATH[0]).document(CHECKPOINT_PATH[1]).get()
    if not doc.exists:
        return {
            'lastUidProcessed': None,
            'processedCount': 0,
            'skippedCount': 0,
            'failedUids': [],
        }
    return doc.to_dict() or {}


def _write_checkpoint(db, state: Dict[str, Any]) -> None:
    state['updatedAt'] = datetime.now(timezone.utc).isoformat()
    db.collection(CHECKPOINT_PATH[0]).document(CHECKPOINT_PATH[1]).set(state, merge=True)


# ============================================================================
# Per-user backfill
# ============================================================================


def _process_user(
    db,
    user_doc,
    apply: bool,
    force: bool,
) -> Tuple[str, Dict[str, Any]]:
    """Returns ('skipped'|'updated'|'failed', diagnostics)."""
    uid = user_doc.id
    data = user_doc.to_dict() or {}

    provenance = data.get('_backfillProvenance') or {}
    if not isinstance(provenance, dict):
        provenance = {}
    if provenance.get('confirmedAt'):
        return 'skipped', {'reason': 'profile_already_confirmed'}
    if provenance.get('backfilledAt') and not force:
        return 'skipped', {'reason': 'already_backfilled'}

    resume_text = data.get('resumeText') or ''
    if not resume_text.strip():
        return 'skipped', {'reason': 'no_resume_text'}

    parsed = _parse_resume(resume_text)
    if not parsed:
        return 'failed', {'reason': 'parse_failed'}

    promoted = _extract_promoted_fields(parsed)
    # Drop fields that already have a 'explicit' provenance — the user has
    # already confirmed them, so don't overwrite.
    field_provenance: Dict[str, str] = {}
    payload: Dict[str, Any] = {}
    for field, value in promoted.items():
        if value is None:
            continue
        if provenance.get(field) == 'explicit':
            continue
        # Don't overwrite a non-null user-set value with backfill data
        # unless the existing value is empty.
        existing = data.get(field)
        if existing not in (None, '', []) and provenance.get(field) == 'explicit':
            continue
        payload[field] = value
        field_provenance[field] = 'inferred_from_resume_backfill'

    if not payload:
        return 'skipped', {'reason': 'no_extractable_fields'}

    now = datetime.now(timezone.utc).isoformat()
    payload['schemaVersion'] = 1
    provenance.update(field_provenance)
    provenance['backfilledAt'] = now
    provenance['parserVersion'] = 'resume_parser_v2'
    payload['_backfillProvenance'] = provenance

    if not apply:
        return 'updated', {'preview': payload}

    db.collection('users').document(uid).set(payload, merge=True)
    return 'updated', {'fieldsWritten': list(field_provenance.keys())}


# ============================================================================
# Main runner
# ============================================================================


def _iter_users(
    db,
    start_after: Optional[str],
    filter_mode: str = 'all',
) -> Iterable[Any]:
    """Stream users in document-ID order so the checkpoint cursor works.

    `filter_mode='paying'` matches users where EITHER `subscriptionTier`
    OR the legacy `tier` field is in ['pro','elite']. Firestore can't
    OR across fields in a single query, so we run two queries, merge by
    doc-ID, sort, and apply the cursor in Python. Paying cohort is small
    (~41 users) so this is cheap.
    """
    if filter_mode == 'paying':
        seen: Dict[str, Any] = {}
        for field in ('subscriptionTier', 'tier'):
            try:
                for snap in db.collection('users').where(field, 'in', ['pro', 'elite']).stream():
                    seen.setdefault(snap.id, snap)
            except Exception as exc:
                logger.warning("paying-filter query on field=%s failed: %s", field, exc)
        ordered = sorted(seen.values(), key=lambda s: s.id)
        if start_after:
            ordered = [s for s in ordered if s.id > start_after]
        return iter(ordered)

    coll = db.collection('users').order_by('__name__')
    if start_after:
        # Firestore needs the cursor as a snapshot; the simplest form is
        # `start_after(uid)` against the document name field.
        coll = coll.start_after({'__name__': start_after})
    return coll.stream()


def run(
    apply: bool,
    force: bool,
    limit: Optional[int],
    filter_mode: str = 'all',
) -> None:
    db = _load_app_extensions()
    state = _read_checkpoint(db)
    processed = int(state.get('processedCount') or 0)
    skipped = int(state.get('skippedCount') or 0)
    failed: List[str] = list(state.get('failedUids') or [])
    last_uid = state.get('lastUidProcessed')

    logger.info(
        'starting backfill apply=%s force=%s limit=%s filter=%s resume_after=%s',
        apply, force, limit, filter_mode, last_uid,
    )

    iterator = _iter_users(db, last_uid, filter_mode=filter_mode)
    last_tick = time.monotonic()
    batch_count = 0

    for user_doc in iterator:
        if limit is not None and batch_count >= limit:
            logger.info('limit reached (%s); stopping', limit)
            break

        try:
            outcome, diag = _process_user(db, user_doc, apply=apply, force=force)
        except Exception as exc:
            outcome = 'failed'
            diag = {'reason': f'unhandled_exception: {exc}'}
            logger.exception('uid=%s unhandled exception during backfill', user_doc.id)

        uid = user_doc.id
        if outcome == 'updated':
            processed += 1
            verb = 'would_update' if not apply else 'updated'
            fields = diag.get('fieldsWritten') or list((diag.get('preview') or {}).keys())
            logger.info('uid=%s %s fields=%s', uid, verb, fields)
        elif outcome == 'skipped':
            skipped += 1
            # Surfacing the skip reason at INFO so dry-runs can tell at a
            # glance which users have no resumeText vs. already_backfilled
            # vs. profile_already_confirmed.
            logger.info('uid=%s skipped reason=%s', uid, diag.get('reason'))
        else:
            failed.append(uid)
            logger.warning('uid=%s failed reason=%s', uid, diag.get('reason'))

        state.update({
            'lastUidProcessed': uid,
            'processedCount': processed,
            'skippedCount': skipped,
            'failedUids': failed[-50:],  # cap to last 50 to stay small
        })

        # Checkpoint every 25 users.
        if (processed + skipped + len(failed)) % 25 == 0:
            _write_checkpoint(db, state)

        batch_count += 1

        # Throttle to 100 writes/sec.
        elapsed = time.monotonic() - last_tick
        if elapsed < TARGET_INTERVAL:
            time.sleep(TARGET_INTERVAL - elapsed)
        last_tick = time.monotonic()

    _write_checkpoint(db, state)
    logger.info(
        'backfill complete processed=%d skipped=%d failed=%d',
        processed, skipped, len(failed),
    )


def main():
    parser = argparse.ArgumentParser(description='Phase 1 personalization backfill.')
    parser.add_argument('--apply', action='store_true', help='Actually write to Firestore (default: dry-run).')
    parser.add_argument('--force', action='store_true', help='Re-process users that have already been backfilled.')
    parser.add_argument('--limit', type=int, default=None, help='Cap users processed (useful for staging).')
    parser.add_argument(
        '--filter', dest='filter_mode',
        choices=['all', 'paying'], default='all',
        help="'paying' restricts to subscriptionTier in ['pro','elite']; default 'all'.",
    )
    args = parser.parse_args()
    run(apply=args.apply, force=args.force, limit=args.limit, filter_mode=args.filter_mode)


if __name__ == '__main__':
    main()
