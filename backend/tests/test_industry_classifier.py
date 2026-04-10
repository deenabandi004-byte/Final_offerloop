"""Tests for the canonical industry classifier."""
import os
import pytest

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.utils.industry_classifier import (
    classify_industry,
    normalize_career_track,
    INDUSTRY_KEYWORDS,
)


# ---------------------------------------------------------------------------
# classify_industry
# ---------------------------------------------------------------------------

class TestClassifyIndustry:

    def test_goldman_sachs_analyst_is_ib(self):
        assert classify_industry("Goldman Sachs", "Analyst") == "investment_banking"

    def test_jpmorgan_vp_is_ib(self):
        assert classify_industry("JPMorgan", "VP") == "investment_banking"

    def test_mckinsey_consultant_is_consulting(self):
        assert classify_industry("McKinsey", "Consultant") == "consulting"

    def test_bcg_strategy_is_consulting(self):
        assert classify_industry("BCG", "Strategy Associate") == "consulting"

    def test_blackstone_pe_analyst(self):
        assert classify_industry("Blackstone", "Private Equity Analyst") == "private_equity"

    def test_a16z_vc(self):
        assert classify_industry("a16z", "Partner") == "venture_capital"

    def test_google_swe_is_tech(self):
        assert classify_industry("Google", "Software Engineer") == "tech"

    def test_meta_pm_is_tech(self):
        assert classify_industry("Meta", "Product Manager") == "tech"

    def test_generic_finance(self):
        assert classify_industry("Acme Corp", "Financial Analyst") == "finance"

    def test_hedge_fund_is_finance(self):
        assert classify_industry("Citadel", "Hedge Fund Analyst") == "finance"

    def test_unknown_company_is_other(self):
        assert classify_industry("Acme Corp", "Manager") == "other"

    def test_case_insensitive(self):
        assert classify_industry("GOLDMAN SACHS", "ANALYST") == "investment_banking"

    def test_empty_inputs_return_other(self):
        assert classify_industry("", "") == "other"

    def test_specific_firm_beats_generic_keyword(self):
        # "Goldman Sachs Analyst" should match investment_banking (firm name)
        # before finance (generic "analyst" keyword).
        assert classify_industry("Goldman Sachs", "Analyst") == "investment_banking"

    def test_all_industries_have_keywords(self):
        """Every industry bucket has at least one keyword."""
        for industry, keywords in INDUSTRY_KEYWORDS.items():
            assert len(keywords) > 0, f"{industry} has no keywords"


# ---------------------------------------------------------------------------
# normalize_career_track
# ---------------------------------------------------------------------------

class TestNormalizeCareerTrack:

    def test_investment_banking(self):
        assert normalize_career_track("Investment Banking") == "investment_banking"

    def test_management_consulting(self):
        assert normalize_career_track("Management Consulting") == "consulting"

    def test_private_equity(self):
        assert normalize_career_track("Private Equity") == "private_equity"

    def test_venture_capital(self):
        assert normalize_career_track("Venture Capital") == "venture_capital"

    def test_tech_software_engineering(self):
        assert normalize_career_track("Tech / Software Engineering") == "tech"

    def test_product_management(self):
        assert normalize_career_track("Product Management") == "tech"

    def test_finance_corporate(self):
        assert normalize_career_track("Finance / Corporate Finance") == "finance"

    def test_unknown_passthrough(self):
        # Unknown career tracks are lowered and returned as-is
        assert normalize_career_track("Operations") == "operations"

    def test_none_input(self):
        assert normalize_career_track(None) == ""

    def test_empty_string(self):
        assert normalize_career_track("") == ""

    def test_case_insensitive(self):
        assert normalize_career_track("INVESTMENT BANKING") == "investment_banking"

    def test_whitespace_stripped(self):
        assert normalize_career_track("  Consulting  ") == "consulting"
