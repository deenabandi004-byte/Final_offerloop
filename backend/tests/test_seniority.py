"""Tests for the seniority classifier."""
import os
import pytest

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.utils.seniority import classify_seniority


class TestClassifySeniority:

    # VP-level
    def test_vice_president(self):
        assert classify_seniority("Vice President") == "vp"

    def test_svp(self):
        assert classify_seniority("SVP of Sales") == "vp"

    def test_managing_director(self):
        assert classify_seniority("Managing Director") == "vp"

    def test_cto(self):
        assert classify_seniority("CTO") == "vp"

    def test_ceo(self):
        assert classify_seniority("CEO & Co-Founder") == "vp"

    def test_partner(self):
        assert classify_seniority("Partner, Advisory") == "vp"

    def test_founder(self):
        assert classify_seniority("Co-Founder") == "vp"

    def test_president(self):
        assert classify_seniority("President of Operations") == "vp"

    # Director-level
    def test_director(self):
        assert classify_seniority("Director of Engineering") == "director"

    def test_head_of(self):
        assert classify_seniority("Head of Product") == "director"

    def test_principal(self):
        assert classify_seniority("Principal Engineer") == "director"

    def test_senior_manager(self):
        assert classify_seniority("Senior Manager, Strategy") == "director"

    # Manager-level
    def test_manager(self):
        assert classify_seniority("Product Manager") == "manager"

    def test_team_lead(self):
        assert classify_seniority("Team Lead") == "manager"

    def test_senior_engineer(self):
        assert classify_seniority("Senior Software Engineer") == "manager"

    def test_staff_engineer(self):
        assert classify_seniority("Staff Engineer") == "manager"

    # Analyst-level (default)
    def test_analyst(self):
        assert classify_seniority("Analyst") == "analyst"

    def test_associate(self):
        assert classify_seniority("Associate") == "analyst"

    def test_intern(self):
        assert classify_seniority("Summer Intern") == "analyst"

    def test_software_engineer(self):
        assert classify_seniority("Software Engineer") == "analyst"

    def test_coordinator(self):
        assert classify_seniority("Marketing Coordinator") == "analyst"

    # Edge cases
    def test_none_returns_analyst(self):
        assert classify_seniority(None) == "analyst"

    def test_empty_string_returns_analyst(self):
        assert classify_seniority("") == "analyst"

    def test_case_insensitive(self):
        assert classify_seniority("VICE PRESIDENT") == "vp"

    def test_vp_abbreviation_in_title(self):
        assert classify_seniority("VP of Engineering") == "vp"
