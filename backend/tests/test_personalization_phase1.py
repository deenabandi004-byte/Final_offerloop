"""
Phase 1 personalization data layer — unit tests.

Covers the parts of §7 (P1 row) that don't require live Firestore or a
real Gmail account:
  - Pydantic UserDocument validation tolerates legacy fields and parses
    Phase 1 promoted fields by alias.
  - normalize_school / normalize_company alias hits + slug fallback.
  - email_generator dataclasses can be constructed and the stub raises
    NotImplementedError so accidental Phase 1-3 callers fail loudly.
  - phase1_backfill helpers extract structured fields conservatively
    (year-only graduation, no GPA outside [0,4], no overwrite of
    explicit fields).
"""
from __future__ import annotations

import pytest


def test_user_document_accepts_legacy_fields():
    from app.models.users import UserDocument

    raw = {
        'uid': 'abc',
        'email': 'student@usc.edu',
        'tier': 'pro',
        'subscriptionTier': 'pro',
        'credits': 1500,
        'maxCredits': 1500,
        'createdAt': '2026-01-01T00:00:00Z',
        # Phase 1 fields by alias
        'schemaVersion': 1,
        'school': 'University of Southern California',
        'schoolNormalized': 'usc',
        'major': 'Business Administration',
        'graduationYear': 2026,
        'graduationStatus': 'student',
        'targetIndustries': ['investment_banking'],
        # Legacy field that Pydantic must IGNORE without raising
        'professionalInfo': {'something': 'old'},
        'dreamCompanies': ['Goldman Sachs'],  # Not declared on the model
    }
    doc = UserDocument(**raw)
    assert doc.school == 'University of Southern California'
    assert doc.school_normalized == 'usc'
    assert doc.graduation_year == 2026
    assert doc.target_industries == ['investment_banking']


def test_user_document_rejects_out_of_range_year():
    from app.models.users import UserDocument
    with pytest.raises(Exception):
        UserDocument(
            uid='x', email='a@b.com', tier='free', credits=0,
            createdAt='2026-01-01T00:00:00Z',
            schemaVersion=1,
            graduationYear=1899,
        )


def test_user_document_rejects_invalid_gpa():
    from app.models.users import UserDocument
    with pytest.raises(Exception):
        UserDocument(
            uid='x', email='a@b.com', tier='free', credits=0,
            createdAt='2026-01-01T00:00:00Z',
            schemaVersion=1,
            gpa=5.0,
        )


def test_normalize_school_aliases():
    from app.models.users import normalize_school
    assert normalize_school('University of Southern California') == 'usc'
    assert normalize_school('USC') == 'usc'
    assert normalize_school('UCLA') == 'ucla'
    assert normalize_school('University of Pennsylvania') == 'upenn'
    assert normalize_school('Wharton') == 'upenn'
    assert normalize_school(None) is None
    # Fallback slugifier for unknown schools.
    assert normalize_school('Some Random College') == 'some-random-college'


def test_normalize_company_aliases():
    from app.models.users import normalize_company
    assert normalize_company('Goldman Sachs') == 'goldman-sachs'
    assert normalize_company('GS') == 'goldman-sachs'
    assert normalize_company('Goldman') == 'goldman-sachs'
    assert normalize_company('Meta') == 'meta'
    assert normalize_company('Facebook') == 'meta'
    assert normalize_company(None) is None
    assert normalize_company('Acme Industries') == 'acme-industries'


def test_create_user_data_writes_phase1_fields():
    from app.models.users import create_user_data
    data = create_user_data(uid='u1', email='u1@example.com', tier='free')
    assert data['schemaVersion'] == 1
    # Phase 1 fields default to nullable/empty so reads from typed code
    # never KeyError.
    for f in ('school', 'major', 'graduationYear', 'currentRole', 'tonePreference'):
        assert f in data and data[f] is None
    for f in ('targetIndustries', 'targetCompanies', 'targetRoleTypes', 'interestTags', 'openToLocations'):
        assert f in data and data[f] == []


def test_email_generator_stub_raises():
    """The Phase 1 stub must fail loudly — no accidental Phase 1-3 callers."""
    from app.services.email_generator import (
        StructuredProfile, Contact, generate_email,
    )
    profile = StructuredProfile(
        uid='u', name='User', email='u@x.com', phone=None, linkedin=None,
        school='USC', school_short='USC', major='CS',
        graduation_year=2026, graduation_status='student',
        current_role=None, current_company=None,
        target_industries=[], target_companies=[], target_role_types=[],
        interest_tags=[], tone_preference=None, length_preference=None,
    )
    contact = Contact(
        contact_id='c1', first_name='Jane', last_name='Doe',
        company='Goldman Sachs', company_normalized='goldman-sachs',
        title='Analyst', school='USC', school_match=True,
        hometown_match=False, company_overlap=None,
        email='jane@gs.com', linkedin=None,
    )
    with pytest.raises(NotImplementedError):
        generate_email(profile, None, None, contact, None)


def test_alumni_cache_key_format():
    from app.services.alumni_service import make_cache_key
    assert make_cache_key('usc', 'goldman-sachs') == 'usc__goldman-sachs'
    assert make_cache_key('usc', 'goldman-sachs', 'nyc') == 'usc__goldman-sachs__nyc'
    with pytest.raises(ValueError):
        make_cache_key('', 'company')


def test_alumni_cache_staleness_window():
    from datetime import datetime, timedelta, timezone
    from app.services.alumni_service import _is_stale

    # Fresh write → not stale.
    fresh = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert _is_stale(fresh) is False
    # 8 days old → stale.
    stale = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
    assert _is_stale(stale) is True
    # No timestamp → stale.
    assert _is_stale(None) is True


def test_phase1_backfill_year_normalization():
    from scripts.phase1_backfill import _normalize_year
    assert _normalize_year('Expected May 2026') == 2026
    assert _normalize_year('2024') == 2024
    assert _normalize_year(2026) == 2026
    assert _normalize_year('Class of 2027') == 2027
    assert _normalize_year(None) is None
    # Out of valid range → None
    assert _normalize_year(1985) is None
    # Multiple years — prefer the last (graduation usually trails).
    assert _normalize_year('Started 2022, Expected 2026') == 2026


def test_phase1_backfill_extract_promoted_fields():
    from scripts.phase1_backfill import _extract_promoted_fields
    parsed = {
        'education': [{
            'university': 'University of Southern California',
            'major': 'Business Administration',
            'graduation': 'Expected May 2026',
            'gpa': '3.85',
        }],
        'experience': [{
            'title': 'Investment Banking Summer Analyst',
            'company': 'Goldman Sachs',
            'dates': 'Summer 2025',
        }],
    }
    fields = _extract_promoted_fields(parsed)
    assert fields['school'] == 'University of Southern California'
    assert fields['schoolNormalized'] == 'usc'
    assert fields['major'] == 'Business Administration'
    assert fields['graduationYear'] == 2026
    assert fields['graduationStatus'] in ('student', 'recent_grad')
    assert fields['gpa'] == 3.85
    assert fields['currentRole'] == 'Investment Banking Summer Analyst'
    assert fields['currentCompany'] == 'Goldman Sachs'
    assert fields['currentCompanyNormalized'] == 'goldman-sachs'


def test_phase1_backfill_drops_invalid_gpa():
    from scripts.phase1_backfill import _extract_promoted_fields
    parsed = {
        'education': [{
            'university': 'USC',
            'gpa': '7.5',  # Out of range
        }],
        'experience': [],
    }
    fields = _extract_promoted_fields(parsed)
    assert fields['gpa'] is None
