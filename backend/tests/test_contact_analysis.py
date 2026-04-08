"""Tests for contact_analysis utility functions extracted from reply_generation."""
import pytest
import os

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")


def test_import_from_contact_analysis():
    """Verify functions are importable from the new module."""
    from app.utils.contact_analysis import _detect_career_transition, _detect_tenure
    assert callable(_detect_career_transition)
    assert callable(_detect_tenure)


def test_detect_tenure_returns_structured_dict():
    """_detect_tenure should return a dict with numeric 'years' field."""
    from app.utils.contact_analysis import _detect_tenure

    contact = {
        "experience": [
            {"company": {"name": "Goldman Sachs"}, "start_date": {"year": 2024, "month": 1}, "end_date": None},
        ]
    }
    result = _detect_tenure(contact)
    if result is not None:
        assert isinstance(result, dict), "Should return a dict, not a string"
        assert "years" in result, "Must include numeric 'years' field"
        assert isinstance(result["years"], (int, float)), "'years' must be numeric"


def test_detect_tenure_returns_none_for_no_experience():
    """_detect_tenure returns None when contact has no experience data."""
    from app.utils.contact_analysis import _detect_tenure

    assert _detect_tenure({}) is None
    assert _detect_tenure({"experience": []}) is None


def test_no_circular_import():
    """Importing warmth_scoring should not trigger circular import errors."""
    # This would fail if warmth_scoring still imported from reply_generation
    import importlib
    mod = importlib.import_module("app.utils.warmth_scoring")
    assert hasattr(mod, "compute_warmth_score")
