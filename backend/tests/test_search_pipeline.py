"""
50 test cases for the find contact search pipeline.
Tests prompt parsing, query building, school matching, location handling, and dedup.
"""
import sys
import os
import json
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.prompt_pdl_search import (
    _build_query, _build_job_clause, _build_location_clause, _build_company_clause,
    PROMPT_SEARCH_STRATEGIES,
)
from app.services.pdl_client import (
    build_query_from_prompt, _contact_matches_prompt_criteria, contact_matches_school,
    _school_aliases, _school_name_matches,
)
from app.routes.runs import _contact_already_exists


def qs(query):
    """Serialize query to lowercase string for easy assertions."""
    return json.dumps(query, sort_keys=True, default=str).lower()


# ============================================================
# QUERY BUILDING — prompt_pdl_search._build_query
# ============================================================

class TestQueryBuilding:
    """Tests that PDL queries are constructed correctly from filters."""

    STRICT = PROMPT_SEARCH_STRATEGIES[0]  # strict
    LOOSE_TITLE = PROMPT_SEARCH_STRATEGIES[1]  # loose_job_title
    LOOSE_LOC = PROMPT_SEARCH_STRATEGIES[2]  # loose_location
    NO_COMPANY = PROMPT_SEARCH_STRATEGIES[3]  # no_company

    def _filters(self, roles=None, company=None, location=None, schools=None, industries=None, max_results=5):
        return {
            "roles": roles or [],
            "company": company or [],
            "location": location or [],
            "schools": schools or [],
            "industries": industries or [],
            "max_results": max_results,
        }

    # --- 1-5: Basic role queries ---

    def test_01_single_role(self):
        """Single role generates match_phrase."""
        q = _build_query(self._filters(roles=["Software Engineer"]), self.STRICT)
        s = qs(q)
        assert "software engineer" in s
        assert "match_phrase" in s

    def test_02_multiple_roles(self):
        """Multiple roles generate should clause with minimum_should_match."""
        q = _build_query(self._filters(roles=["SDE", "Software Engineer", "Software Dev"]), self.STRICT)
        s = qs(q)
        assert "sde" in s
        assert "software engineer" in s
        assert "minimum_should_match" in s

    def test_03_no_roles_no_company(self):
        """No roles and no company generates exists fallback."""
        q = _build_query(self._filters(), self.STRICT)
        s = qs(q)
        assert "exists" in s
        assert "job_title" in s

    def test_04_no_roles_with_company(self):
        """No roles but with company — no job_title exists fallback needed."""
        q = _build_query(self._filters(company=["Google"]), self.STRICT)
        s = qs(q)
        assert "google" in s
        # Should have company clause, emails exists, and job_company_is_current
        assert "job_company_is_current" in s

    def test_05_loose_title_tokenizes(self):
        """Loose title strategy tokenizes the primary title."""
        q = _build_query(self._filters(roles=["Investment Banking Analyst"]), self.LOOSE_TITLE)
        s = qs(q)
        # Should have individual tokens as match clauses
        assert "investment" in s or "banking" in s or "analyst" in s

    # --- 6-10: Location queries ---

    def test_06_no_location_no_us_filter(self):
        """No location specified — no US country filter added."""
        q = _build_query(self._filters(roles=["PM"]), self.STRICT)
        s = qs(q)
        assert "united states" not in s
        assert "location_country" not in s

    def test_07_us_location(self):
        """US city adds location clauses with US country filter."""
        q = _build_query(self._filters(roles=["PM"], location=["New York"]), self.STRICT)
        s = qs(q)
        assert "new york" in s
        assert "location_metro" in s or "location_locality" in s

    def test_08_international_london(self):
        """London — international, no US country filter."""
        q = _build_query(self._filters(roles=["SWE"], location=["London"]), self.STRICT)
        s = qs(q)
        assert "london" in s
        assert "united states" not in s

    def test_09_international_tokyo(self):
        """Tokyo — international, no US country filter."""
        q = _build_query(self._filters(roles=["PM"], location=["Tokyo"]), self.STRICT)
        s = qs(q)
        assert "tokyo" in s
        assert "united states" not in s

    def test_10_international_singapore(self):
        """Singapore — international, no US country filter."""
        q = _build_query(self._filters(roles=["Analyst"], location=["Singapore"]), self.STRICT)
        s = qs(q)
        assert "singapore" in s
        assert "united states" not in s

    # --- 11-15: Company queries ---

    def test_11_single_company(self):
        """Single company generates match_phrase and is_current filter."""
        q = _build_query(self._filters(company=["Goldman Sachs"]), self.STRICT)
        s = qs(q)
        assert "job_company_name" in s
        assert "job_company_is_current" in s

    def test_12_company_with_role(self):
        """Company + role both present in query."""
        q = _build_query(self._filters(roles=["Analyst"], company=["McKinsey"]), self.STRICT)
        s = qs(q)
        assert "job_company_name" in s
        assert "analyst" in s

    def test_13_no_company_strategy(self):
        """no_company strategy drops company clause."""
        q = _build_query(self._filters(roles=["SWE"], company=["Google"]), self.NO_COMPANY)
        s = qs(q)
        assert "google" not in s  # Company should be dropped
        assert "swe" in s  # Role should remain

    def test_14_company_is_current_only_with_company(self):
        """job_company_is_current only appears when company is specified."""
        q_with = _build_query(self._filters(company=["Meta"]), self.STRICT)
        q_without = _build_query(self._filters(roles=["SWE"]), self.STRICT)
        assert "job_company_is_current" in qs(q_with)
        assert "job_company_is_current" not in qs(q_without)

    def test_15_industry_filter(self):
        """Industry filter generates match clause."""
        q = _build_query(self._filters(roles=["Analyst"], industries=["financial services"]), self.STRICT)
        s = qs(q)
        assert "financial services" in s
        assert "industry" in s

    # --- 16-20: Email exists and required filters ---

    def test_16_emails_always_required(self):
        """Every query requires emails to exist."""
        q = _build_query(self._filters(roles=["PM"]), self.STRICT)
        s = qs(q)
        assert '"exists"' in s
        assert '"emails"' in s

    def test_17_emails_required_with_company(self):
        q = _build_query(self._filters(company=["Apple"]), self.STRICT)
        assert '"emails"' in qs(q)

    def test_18_emails_required_loose_strategy(self):
        q = _build_query(self._filters(roles=["PM"]), self.LOOSE_TITLE)
        assert '"emails"' in qs(q)

    def test_19_max_results_respected(self):
        """Query size matches max_results."""
        q = _build_query(self._filters(roles=["PM"], max_results=10), self.STRICT)
        assert q["size"] == 10

    def test_20_max_results_capped_at_50(self):
        """Max results capped at 50."""
        q = _build_query(self._filters(roles=["PM"], max_results=200), self.STRICT)
        assert q["size"] <= 50


# ============================================================
# BUILD_QUERY_FROM_PROMPT (the active path via pdl_client.py)
# ============================================================

class TestBuildQueryFromPrompt:
    """Tests the active query builder used by /api/prompt-search."""

    def _parsed(self, companies=None, titles=None, locations=None, schools=None, industries=None):
        return {
            "companies": [{"name": c, "matched_titles": []} for c in (companies or [])],
            "title_variations": titles or [],
            "locations": locations or [],
            "schools": schools or [],
            "industries": industries or [],
        }

    def test_21_no_location_no_us_default(self):
        """No location — no US country filter (fix #4)."""
        q = build_query_from_prompt(self._parsed(companies=["Google"], titles=["SWE"]), retry_level=0)
        s = qs(q)
        assert "united states" not in s

    def test_22_with_us_location(self):
        """US location included in query."""
        q = build_query_from_prompt(self._parsed(titles=["PM"], locations=["San Francisco"]), retry_level=0)
        s = qs(q)
        assert "san francisco" in s or "sf" in s

    def test_23_company_is_current(self):
        """Company search includes is_current filter."""
        q = build_query_from_prompt(self._parsed(companies=["Amazon"], titles=["SDE"]), retry_level=0)
        assert "job_company_is_current" in qs(q)

    def test_24_emails_required(self):
        """Emails exist required."""
        q = build_query_from_prompt(self._parsed(titles=["Engineer"]), retry_level=0)
        assert '"emails"' in qs(q)

    def test_25_retry_level_1_simplifies_title(self):
        """Retry level 1 simplifies titles."""
        q0 = build_query_from_prompt(self._parsed(titles=["SWE", "Software Engineer"]), retry_level=0)
        q1 = build_query_from_prompt(self._parsed(titles=["SWE", "Software Engineer"]), retry_level=1)
        # Level 1 should have fewer or different title clauses
        assert qs(q0) != qs(q1)

    def test_26_retry_level_3_drops_location(self):
        """Retry level 3 drops location."""
        q = build_query_from_prompt(self._parsed(titles=["PM"], locations=["NYC"]), retry_level=3)
        s = qs(q)
        assert "location_metro" not in s
        assert "location_locality" not in s


# ============================================================
# SCHOOL MATCHING
# ============================================================

class TestSchoolMatching:
    """Tests school alias generation and matching logic."""

    def test_27_nyu_aliases(self):
        """NYU generates correct aliases."""
        aliases = _school_aliases("New York University")
        alias_set = {a.lower() for a in aliases}
        assert "nyu" in alias_set
        assert "new york university" in alias_set

    def test_28_usc_aliases(self):
        """USC generates correct aliases."""
        aliases = _school_aliases("USC")
        alias_set = {a.lower() for a in aliases}
        assert "usc" in alias_set
        assert "university of southern california" in alias_set

    def test_29_stanford_aliases(self):
        """Stanford generates correct aliases."""
        aliases = _school_aliases("Stanford University")
        alias_set = {a.lower() for a in aliases}
        assert "stanford" in alias_set
        assert "stanford university" in alias_set

    def test_30_false_positive_new_york_city(self):
        """College='New York' should NOT match 'New York University'."""
        contact = {
            "FirstName": "Jane", "LastName": "S", "Company": "", "Title": "",
            "College": "New York", "EducationTop": "", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["New York University"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert not matches, "City name 'New York' should not match NYU"

    def test_31_true_positive_nyu(self):
        """College='New York University' matches 'New York University'."""
        contact = {
            "FirstName": "Jane", "LastName": "S", "Company": "", "Title": "",
            "College": "New York University", "EducationTop": "", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["New York University"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert matches

    def test_32_true_positive_nyu_acronym(self):
        """College='NYU' matches 'New York University'."""
        contact = {
            "FirstName": "Jane", "LastName": "S", "Company": "", "Title": "",
            "College": "NYU", "EducationTop": "", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["New York University"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert matches

    def test_33_usc_full_name_match(self):
        """College='University of Southern California' matches 'USC'."""
        contact = {
            "FirstName": "J", "LastName": "D", "Company": "", "Title": "",
            "College": "University of Southern California", "EducationTop": "", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["USC"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert matches

    def test_34_education_top_fallback(self):
        """School match via EducationTop when College is empty."""
        contact = {
            "FirstName": "J", "LastName": "D", "Company": "", "Title": "",
            "College": "", "EducationTop": "Stanford University - BS Computer Science (2018 - 2022)", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["Stanford"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert matches

    def test_35_no_education_fails_school_check(self):
        """No education info fails school check."""
        contact = {
            "FirstName": "J", "LastName": "D", "Company": "", "Title": "",
            "College": "", "EducationTop": "", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["MIT"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert not matches

    def test_36_false_positive_columbia_british_columbia(self):
        """'Columbia' alias should not match 'University of British Columbia' via geographic guard."""
        # This tests _school_name_matches specifically
        result = _school_name_matches("university of british columbia", ["columbia"])
        assert not result, "Columbia should not match University of British Columbia"

    def test_37_has_dates_start_only(self):
        """contact_matches_school with start_date only should count as having dates."""
        pdl_person = {
            "education": [{
                "school": {"name": "MIT"},
                "start_date": "2020",
                "end_date": None,
                "degrees": [],
            }]
        }
        aliases = _school_aliases("MIT")
        result = contact_matches_school(pdl_person, aliases, strictness="normal")
        assert result


# ============================================================
# CONTACT DEDUP
# ============================================================

class TestContactDedup:
    """Tests the _contact_already_exists helper."""

    def test_38_email_match(self):
        """Contact matched by email."""
        c = {"Email": "john@example.com", "LinkedIn": "", "FirstName": "", "LastName": "", "Company": ""}
        assert _contact_already_exists(c, {"john@example.com"}, set())

    def test_39_email_case_insensitive(self):
        """Email matching is case-insensitive."""
        c = {"Email": "John@Example.COM", "LinkedIn": "", "FirstName": "", "LastName": "", "Company": ""}
        assert _contact_already_exists(c, {"john@example.com"}, set())

    def test_40_linkedin_match(self):
        """Contact matched by LinkedIn URL."""
        c = {"Email": "", "LinkedIn": "https://linkedin.com/in/jdoe", "FirstName": "", "LastName": "", "Company": ""}
        assert _contact_already_exists(c, set(), set(), {"https://linkedin.com/in/jdoe"})

    def test_41_name_company_match(self):
        """Contact matched by first+last+company combo."""
        c = {"Email": "", "LinkedIn": "", "FirstName": "John", "LastName": "Doe", "Company": "Google"}
        assert _contact_already_exists(c, set(), {"john_doe_google"})

    def test_42_no_match(self):
        """Contact not matching any dedup criteria."""
        c = {"Email": "new@test.com", "LinkedIn": "", "FirstName": "New", "LastName": "Person", "Company": "NewCo"}
        assert not _contact_already_exists(c, {"old@test.com"}, {"other_person_oldco"})

    def test_43_workemail_fallback(self):
        """WorkEmail field used when Email is empty."""
        c = {"Email": "", "WorkEmail": "john@corp.com", "LinkedIn": "", "FirstName": "", "LastName": "", "Company": ""}
        assert _contact_already_exists(c, {"john@corp.com"}, set())

    def test_44_empty_fields_no_false_positive(self):
        """Empty name/company doesn't generate false positive."""
        c = {"Email": "", "LinkedIn": "", "FirstName": "", "LastName": "", "Company": ""}
        assert not _contact_already_exists(c, set(), {"__"})

    def test_45_linkedin_without_set(self):
        """LinkedIn not checked when set not provided (backward compat)."""
        c = {"Email": "", "LinkedIn": "https://linkedin.com/in/jdoe", "FirstName": "J", "LastName": "D", "Company": "X"}
        assert not _contact_already_exists(c, set(), set())  # no linkedins_set


# ============================================================
# POST-FILTER CRITERIA (_contact_matches_prompt_criteria)
# ============================================================

class TestPostFilterCriteria:
    """Tests post-fetch validation of contacts against prompt criteria."""

    def test_46_no_criteria_passes(self):
        """Contact with no criteria always passes."""
        contact = {"FirstName": "J", "LastName": "D", "Company": "X", "Title": "Eng", "College": "", "EducationTop": "", "is_current": True}
        matches, _ = _contact_matches_prompt_criteria(contact, {"companies": [], "schools": [], "title_variations": []}, None)
        assert matches

    def test_47_company_mismatch_fails(self):
        """Contact at wrong company fails post-filter."""
        contact = {"FirstName": "J", "LastName": "D", "Company": "Apple", "Title": "Eng", "College": "", "EducationTop": "", "IsCurrentlyAtTarget": True, "is_current": True}
        # target_company is "Google" but contact is at Apple
        matches, reason = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "Google"}], "schools": [], "title_variations": []},
            "Google"
        )
        assert not matches
        assert reason == "company_mismatch"

    def test_48_company_match_passes(self):
        """Contact at correct company passes."""
        contact = {"FirstName": "J", "LastName": "D", "Company": "Google", "Title": "Eng", "College": "", "EducationTop": "", "IsCurrentlyAtTarget": True, "is_current": True}
        matches, _ = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "Google"}], "schools": [], "title_variations": []},
            "Google"
        )
        assert matches

    def test_49_no_experience_no_crash(self):
        """Contact with no experience field doesn't crash."""
        contact = {"FirstName": "X", "LastName": "Y", "Company": "", "Title": "", "College": "", "EducationTop": "", "is_current": False}
        try:
            matches, _ = _contact_matches_prompt_criteria(contact, {"companies": [], "schools": [], "title_variations": []}, None)
            assert matches  # No criteria = pass
        except Exception as e:
            pytest.fail(f"Crashed on contact with no experience: {e}")

    def test_50_not_currently_at_target_fails(self):
        """Contact NOT currently at target company fails."""
        contact = {
            "FirstName": "J", "LastName": "D", "Company": "Google", "Title": "Eng",
            "College": "", "EducationTop": "", "IsCurrentlyAtTarget": False, "is_current": False,
        }
        matches, reason = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "Google"}], "schools": [], "title_variations": []},
            "Google"
        )
        assert not matches
        assert reason == "not_currently_at_target"
