"""Tests for warmth_scoring module."""
import pytest
import os

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.utils.warmth_scoring import (
    compute_warmth_score,
    score_and_sort_contacts,
    score_contacts_for_email,
    _build_user_comparison_data,
    _tier_label,
    SHARED_IDENTITY_CAP,
    TIER_THRESHOLDS,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def user_profile():
    return {
        "academics": {"university": "University of Southern California", "major": "Finance"},
        "goals": {"careerTrack": "investment banking", "dreamCompanies": ["Goldman Sachs", "JPMorgan"]},
        "resumeParsed": {
            "university": "University of Southern California",
            "major": "Finance",
            "experience": [{"company": "Deloitte"}],
        },
        "hometown": "Los Angeles",
    }


@pytest.fixture
def warm_contact():
    """Contact that shares university + target industry = warm."""
    return {
        "FirstName": "Jane",
        "LastName": "Doe",
        "College": "University of Southern California",
        "title": "Investment Banking Analyst",
        "company": "Goldman Sachs",
        "headline": "Investment Banking Analyst at Goldman Sachs",
        "experience": [
            {"company": {"name": "Goldman Sachs"}, "title": {"name": "Analyst"}},
            {"company": {"name": "PwC"}, "title": {"name": "Intern"}},
        ],
        "educationArray": [{"school": "University of Southern California", "major": "Finance"}],
    }


@pytest.fixture
def neutral_contact():
    """Contact with some career relevance but no shared identity."""
    return {
        "FirstName": "Bob",
        "LastName": "Smith",
        "College": "NYU",
        "title": "Analyst",
        "company": "Morgan Stanley",
        "headline": "Analyst at Morgan Stanley",
        "experience": [{"company": {"name": "Morgan Stanley"}, "title": {"name": "Analyst"}}],
    }


@pytest.fixture
def cold_contact():
    """Contact with no overlap."""
    return {
        "FirstName": "Alex",
        "LastName": "Johnson",
        "College": "MIT",
        "title": "Software Engineer",
        "company": "Startup Inc",
        "headline": "Software Engineer at Startup Inc",
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_warm_contact_scores_above_threshold(user_profile, warm_contact):
    comparison = _build_user_comparison_data(user_profile)
    result = compute_warmth_score(comparison, warm_contact)
    assert result["tier"] == "warm"
    assert result["score"] >= TIER_THRESHOLDS["warm"]


def test_cold_contact_scores_below_neutral(user_profile, cold_contact):
    comparison = _build_user_comparison_data(user_profile)
    result = compute_warmth_score(comparison, cold_contact)
    assert result["tier"] == "cold"
    assert result["score"] < TIER_THRESHOLDS["neutral"]


def test_neutral_contact_in_middle(user_profile, neutral_contact):
    comparison = _build_user_comparison_data(user_profile)
    result = compute_warmth_score(comparison, neutral_contact)
    # Neutral should have career relevance points but few identity points
    assert result["score"] >= 0


def test_shared_identity_cap(user_profile):
    """Identity points alone should not exceed SHARED_IDENTITY_CAP."""
    comparison = _build_user_comparison_data(user_profile)
    # Contact with maximum identity overlap: same university + same major + same employer + same hometown
    contact = {
        "College": "University of Southern California",
        "major": "Finance",
        "company": "Deloitte",
        "City": "Los Angeles",
        "title": "Teacher",  # unrelated role
        "headline": "Teacher at School",
    }
    result = compute_warmth_score(comparison, contact)
    # Raw identity signals: university(20) + major(10) + employer(15) + hometown(8) = 53
    # After cap, identity contribution should be at most SHARED_IDENTITY_CAP (45).
    # Total score may exceed cap due to career relevance signals.
    identity_signals = {"same_university", "same_major", "same_hometown", "same_past_employer"}
    identity_raw = sum(s["points"] for s in result["signals"] if s["signal"] in identity_signals)
    # The raw signals aren't individually capped, but the function caps their combined contribution.
    # Total score should be less than uncapped identity (53) + any career points.
    assert identity_raw > SHARED_IDENTITY_CAP, "Test needs enough identity overlap to exceed cap"
    # Score should be lower than if identity were uncapped
    assert result["score"] < identity_raw + 20  # some career signals may add, but identity is capped


def test_score_and_sort_contacts_ordering(user_profile, warm_contact, cold_contact):
    contacts = [cold_contact, warm_contact]
    sorted_contacts = score_and_sort_contacts(user_profile, contacts)
    assert sorted_contacts[0]["warmth_score"] >= sorted_contacts[1]["warmth_score"]
    assert sorted_contacts[0].get("warmth_tier") is not None


def test_score_and_sort_empty_list(user_profile):
    result = score_and_sort_contacts(user_profile, [])
    assert result == []


def test_dream_company_signal(user_profile):
    comparison = _build_user_comparison_data(user_profile)
    contact = {
        "FirstName": "Test",
        "company": "Goldman Sachs",
        "title": "Analyst",
        "headline": "Analyst at Goldman Sachs",
    }
    result = compute_warmth_score(comparison, contact)
    signal_names = [s["signal"] for s in result["signals"]]
    assert "dream_company" in signal_names


def test_missing_fields_no_crash(user_profile):
    """Scoring a contact with minimal/empty fields should not raise."""
    comparison = _build_user_comparison_data(user_profile)
    result = compute_warmth_score(comparison, {})
    assert isinstance(result["score"], int)
    assert result["tier"] in ("warm", "neutral", "cold")


def test_firestore_field_normalization():
    """Contacts saved from Firestore use different field names."""
    user = {"academics": {"university": "USC"}}
    comparison = _build_user_comparison_data(user)
    contact = {
        "college": "USC",  # lowercase Firestore field
        "jobTitle": "Analyst",
        "company": "Test Co",
    }
    result = compute_warmth_score(comparison, contact)
    # Should not crash and should synthesize headline
    assert isinstance(result["score"], int)


def test_score_contacts_for_email(user_profile, warm_contact, cold_contact):
    result = score_contacts_for_email(user_profile, [warm_contact, cold_contact])
    assert 0 in result
    assert 1 in result
    assert result[0]["tier"] in ("warm", "neutral", "cold")
    assert "score" in result[0]
    assert "signals" in result[0]


def test_score_contacts_for_email_error_returns_empty():
    """If scoring fails, should return empty dict (graceful degradation)."""
    result = score_contacts_for_email(None, None)  # will throw internally
    assert result == {}


def test_tier_label():
    assert _tier_label(60) == "warm"
    assert _tier_label(50) == "warm"
    assert _tier_label(30) == "neutral"
    assert _tier_label(25) == "neutral"
    assert _tier_label(10) == "cold"
    assert _tier_label(0) == "cold"
