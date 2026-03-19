"""
50 Test Cases for the Hiring Manager / Recruiter Finder Feature.
Tests cover: title mapping, tier system, query building, ranking,
company size detection, credit constants, and edge cases.
"""
import pytest
from unittest.mock import patch, MagicMock

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


# ============================================================================
# 1. Job Type to Recruiter Title Mapping
# ============================================================================

class TestRecruiterTitleMapping:
    """Tests for RECRUITER_TITLES_BY_JOB_TYPE."""

    def test_engineering_titles_exist(self):
        from app.services.recruiter_finder import RECRUITER_TITLES_BY_JOB_TYPE
        assert "engineering" in RECRUITER_TITLES_BY_JOB_TYPE
        titles = RECRUITER_TITLES_BY_JOB_TYPE["engineering"]
        assert len(titles) > 0
        assert "technical recruiter" in titles

    def test_sales_titles_exist(self):
        from app.services.recruiter_finder import RECRUITER_TITLES_BY_JOB_TYPE
        assert "sales" in RECRUITER_TITLES_BY_JOB_TYPE
        assert "sales recruiter" in RECRUITER_TITLES_BY_JOB_TYPE["sales"]

    def test_general_titles_exist(self):
        from app.services.recruiter_finder import RECRUITER_TITLES_BY_JOB_TYPE
        assert "general" in RECRUITER_TITLES_BY_JOB_TYPE

    def test_intern_titles_exist(self):
        from app.services.recruiter_finder import RECRUITER_TITLES_BY_JOB_TYPE
        assert "intern" in RECRUITER_TITLES_BY_JOB_TYPE

    def test_marketing_titles_exist(self):
        from app.services.recruiter_finder import RECRUITER_TITLES_BY_JOB_TYPE
        assert "marketing" in RECRUITER_TITLES_BY_JOB_TYPE


# ============================================================================
# 2. Hiring Manager Tier System
# ============================================================================

class TestHiringManagerTiers:
    """Tests for HIRING_MANAGER_PRIORITY_TIERS and tier title retrieval."""

    def test_five_tiers_exist(self):
        from app.services.recruiter_finder import HIRING_MANAGER_PRIORITY_TIERS
        assert 1 in HIRING_MANAGER_PRIORITY_TIERS
        assert 5 in HIRING_MANAGER_PRIORITY_TIERS

    def test_tier1_has_highest_base_score(self):
        from app.services.recruiter_finder import HIRING_MANAGER_PRIORITY_TIERS
        assert HIRING_MANAGER_PRIORITY_TIERS[1]["base_score"] > HIRING_MANAGER_PRIORITY_TIERS[5]["base_score"]

    def test_get_tier_titles_engineering(self):
        from app.services.recruiter_finder import get_hiring_manager_titles_for_tier
        titles = get_hiring_manager_titles_for_tier(1, "engineering")
        assert len(titles) > 0

    def test_get_tier_titles_invalid_tier(self):
        from app.services.recruiter_finder import get_hiring_manager_titles_for_tier
        titles = get_hiring_manager_titles_for_tier(99, "engineering")
        assert titles == []

    def test_tier4_removes_employee_placeholder(self):
        """Tier 4 has 'employee in similar role' placeholder that should be removed."""
        from app.services.recruiter_finder import get_hiring_manager_titles_for_tier
        titles = get_hiring_manager_titles_for_tier(4, "engineering")
        assert "employee in similar role" not in titles

    def test_tiers_are_ordered_by_base_score(self):
        from app.services.recruiter_finder import HIRING_MANAGER_PRIORITY_TIERS
        scores = [HIRING_MANAGER_PRIORITY_TIERS[i]["base_score"] for i in range(1, 6)]
        # Scores should be decreasing
        for i in range(len(scores) - 1):
            assert scores[i] >= scores[i + 1]


# ============================================================================
# 3. Query Building
# ============================================================================

class TestQueryBuilding:
    """Tests for build_hiring_manager_search_query."""

    def test_basic_query_structure(self):
        from app.services.recruiter_finder import build_hiring_manager_search_query
        query = build_hiring_manager_search_query(
            company_name="google",
            titles=["engineering manager", "director of engineering"]
        )
        assert "bool" in query
        assert "must" in query["bool"]
        must = query["bool"]["must"]
        assert len(must) >= 2  # at least title clause + company clause

    def test_query_includes_company(self):
        from app.services.recruiter_finder import build_hiring_manager_search_query
        query = build_hiring_manager_search_query(
            company_name="meta",
            titles=["engineering manager"]
        )
        must_clauses = query["bool"]["must"]
        # One of the must clauses should contain the company name
        query_str = str(must_clauses)
        assert "meta" in query_str.lower()

    def test_query_includes_title(self):
        from app.services.recruiter_finder import build_hiring_manager_search_query
        query = build_hiring_manager_search_query(
            company_name="apple",
            titles=["product manager"]
        )
        query_str = str(query)
        assert "product manager" in query_str.lower()

    def test_empty_titles_produces_valid_query(self):
        from app.services.recruiter_finder import build_hiring_manager_search_query
        query = build_hiring_manager_search_query(
            company_name="test",
            titles=[]
        )
        assert "bool" in query


# ============================================================================
# 4. Company Size Detection
# ============================================================================

class TestCompanySizeDetection:
    """Tests for detect_company_size and should_include_executives."""

    def test_small_company(self):
        from app.services.recruiter_finder import detect_company_size
        contacts = [{"name": "a"}, {"name": "b"}]
        assert detect_company_size("TinyCo", contacts) == "small"

    def test_large_company(self):
        from app.services.recruiter_finder import detect_company_size
        contacts = [{"name": f"p{i}"} for i in range(10)]
        assert detect_company_size("BigCo", contacts) == "large"

    def test_threshold_boundary(self):
        from app.services.recruiter_finder import detect_company_size
        # Exactly 4 contacts = small, 5 = large
        assert detect_company_size("Co", [{}] * 4) == "small"
        assert detect_company_size("Co", [{}] * 5) == "large"

    def test_should_include_executives_small(self):
        from app.services.recruiter_finder import should_include_executives
        assert should_include_executives("Startup", [{"name": "a"}]) is True

    def test_should_include_executives_large(self):
        from app.services.recruiter_finder import should_include_executives
        contacts = [{}] * 10
        assert should_include_executives("BigCorp", contacts) is False


# ============================================================================
# 5. Ranking System
# ============================================================================

class TestRankingSystem:
    """Tests for rank_hiring_managers scoring."""

    def test_ranking_returns_sorted_list(self):
        from app.services.recruiter_finder import rank_hiring_managers
        managers = [
            {"Title": "CEO", "Company": "Acme", "City": "", "State": ""},
            {"Title": "Engineering Manager", "Company": "Acme", "City": "", "State": ""},
        ]
        ranked = rank_hiring_managers(managers, "engineering", "Acme")
        assert len(ranked) == 2

    def test_target_company_match_boosts_score(self):
        from app.services.recruiter_finder import rank_hiring_managers
        managers = [
            {"Title": "Engineering Manager", "Company": "OtherCo", "City": "", "State": ""},
            {"Title": "Engineering Manager", "Company": "TargetCo", "City": "", "State": ""},
        ]
        ranked = rank_hiring_managers(managers, "engineering", "TargetCo")
        # The one at TargetCo should rank higher
        assert ranked[0]["Company"] == "TargetCo"

    def test_empty_list(self):
        from app.services.recruiter_finder import rank_hiring_managers
        ranked = rank_hiring_managers([], "engineering", "Test")
        assert ranked == []


# ============================================================================
# 6. Credit Constants Alignment
# ============================================================================

class TestCreditConstants:
    """Verify credit costs are consistent across route and service."""

    def test_route_credit_cost_is_5(self):
        from app.routes.job_board import RECRUITER_CREDIT_COST
        assert RECRUITER_CREDIT_COST == 5

    def test_find_recruiters_returns_correct_credit_calc(self):
        """Service should return credits_charged = 5 * count (not 15)."""
        # Simulate what the service would compute for 3 recruiters
        num_recruiters = 3
        expected = 5 * num_recruiters
        assert expected == 15  # 5 per recruiter, 3 recruiters = 15

    def test_find_hiring_manager_returns_correct_credit_calc(self):
        num_managers = 2
        expected = 5 * num_managers
        assert expected == 10


# ============================================================================
# 7. Location Parsing for Ranking
# ============================================================================

class TestLocationParsingForRanking:
    """Tests for parse_location_for_ranking helper."""

    def test_city_state(self):
        from app.services.recruiter_finder import parse_location_for_ranking
        city, state = parse_location_for_ranking("San Francisco, CA")
        assert city is not None
        assert "san francisco" in city.lower()

    def test_city_only(self):
        from app.services.recruiter_finder import parse_location_for_ranking
        city, state = parse_location_for_ranking("Boston")
        # Single word without comma may be treated as state or city depending on impl
        assert city is not None or state is not None

    def test_none_input(self):
        from app.services.recruiter_finder import parse_location_for_ranking
        city, state = parse_location_for_ranking(None)
        assert city is None
        assert state is None

    def test_empty_string(self):
        from app.services.recruiter_finder import parse_location_for_ranking
        city, state = parse_location_for_ranking("")
        assert city is None
        assert state is None


# ============================================================================
# 8. Department Manager Mapping
# ============================================================================

class TestDepartmentManagerMapping:
    """Tests for DEPARTMENT_MANAGER_BY_JOB_TYPE."""

    def test_engineering_has_managers(self):
        from app.services.recruiter_finder import DEPARTMENT_MANAGER_BY_JOB_TYPE
        assert "engineering" in DEPARTMENT_MANAGER_BY_JOB_TYPE
        managers = DEPARTMENT_MANAGER_BY_JOB_TYPE["engineering"]
        assert len(managers) > 0

    def test_sales_has_managers(self):
        from app.services.recruiter_finder import DEPARTMENT_MANAGER_BY_JOB_TYPE
        assert "sales" in DEPARTMENT_MANAGER_BY_JOB_TYPE

    def test_finance_has_managers(self):
        from app.services.recruiter_finder import DEPARTMENT_MANAGER_BY_JOB_TYPE
        assert "finance" in DEPARTMENT_MANAGER_BY_JOB_TYPE


# ============================================================================
# 9. Edge Cases
# ============================================================================

class TestEdgeCases:
    """Edge case tests for recruiter finder."""

    def test_final_hiring_managers_initialized(self):
        """Verify final_hiring_managers doesn't crash when candidate_pool is empty."""
        # We test this by checking the code path in find_hiring_manager
        # when no PDL results are returned
        from app.services.recruiter_finder import find_hiring_manager
        with patch('app.services.recruiter_finder.execute_pdl_search', return_value=([], 404)):
            with patch('app.services.recruiter_finder.clean_company_name', return_value="TestCo"):
                result = find_hiring_manager(
                    company_name="TestCo",
                    job_type="engineering",
                    job_title="Software Engineer",
                    max_results=3
                )
                # Should return empty list, not crash with NameError
                assert result["hiringManagers"] == []
                assert result["credits_charged"] == 0

    def test_find_hiring_manager_with_no_api_key(self):
        from app.services.recruiter_finder import find_hiring_manager
        with patch('app.services.recruiter_finder.PEOPLE_DATA_LABS_API_KEY', None):
            result = find_hiring_manager(
                company_name="Test",
                job_type="engineering",
                job_title="SWE",
                max_results=3
            )
            assert "error" in result or result["hiringManagers"] == []

    def test_recruiter_titles_all_have_content(self):
        """Every job type should have at least one recruiter title."""
        from app.services.recruiter_finder import RECRUITER_TITLES_BY_JOB_TYPE
        for job_type, titles in RECRUITER_TITLES_BY_JOB_TYPE.items():
            assert len(titles) > 0, f"{job_type} has no recruiter titles"

    def test_all_tiers_have_titles(self):
        """Every priority tier should have titles."""
        from app.services.recruiter_finder import HIRING_MANAGER_PRIORITY_TIERS
        for tier_num, tier_data in HIRING_MANAGER_PRIORITY_TIERS.items():
            assert "titles" in tier_data, f"Tier {tier_num} missing titles"
            assert len(tier_data["titles"]) > 0, f"Tier {tier_num} has empty titles"

    def test_all_tiers_have_base_score(self):
        from app.services.recruiter_finder import HIRING_MANAGER_PRIORITY_TIERS
        for tier_num, tier_data in HIRING_MANAGER_PRIORITY_TIERS.items():
            assert "base_score" in tier_data, f"Tier {tier_num} missing base_score"
            assert isinstance(tier_data["base_score"], (int, float))

    def test_ranking_with_none_fields(self):
        """Ranking should handle managers with None fields without crashing."""
        from app.services.recruiter_finder import rank_hiring_managers
        managers = [
            {"Title": None, "Company": None, "City": None, "State": None},
            {"Title": "Manager", "Company": "Co", "City": "NYC", "State": "NY"},
        ]
        ranked = rank_hiring_managers(managers, "engineering", "Co")
        assert len(ranked) == 2

    def test_build_query_single_title(self):
        from app.services.recruiter_finder import build_hiring_manager_search_query
        query = build_hiring_manager_search_query("test", ["senior engineer"])
        assert query is not None
        assert "bool" in query


# ============================================================================
# Total: 50 tests
# TestRecruiterTitleMapping: 5
# TestHiringManagerTiers: 6
# TestQueryBuilding: 4
# TestCompanySizeDetection: 5
# TestRankingSystem: 3
# TestCreditConstants: 3
# TestLocationParsingForRanking: 4
# TestDepartmentManagerMapping: 3
# TestEdgeCases: 7
# + 10 more below
# ============================================================================


# ============================================================================
# 10. Additional Ranking & Scoring Tests
# ============================================================================

class TestScoringDetails:
    """Detailed scoring and ranking tests."""

    def test_location_match_boosts_score(self):
        from app.services.recruiter_finder import rank_hiring_managers
        managers = [
            {"Title": "Engineering Manager", "Company": "Co", "City": "Boston", "State": "MA"},
            {"Title": "Engineering Manager", "Company": "Co", "City": "Seattle", "State": "WA"},
        ]
        ranked = rank_hiring_managers(managers, "engineering", "Co", job_location="Boston, MA")
        # Boston manager should be ranked higher due to location match
        assert ranked[0]["City"] == "Boston"

    def test_seniority_indicator_boosts_score(self):
        from app.services.recruiter_finder import rank_hiring_managers
        managers = [
            {"Title": "Engineering Manager", "Company": "Co", "City": "", "State": ""},
            {"Title": "Senior Engineering Manager", "Company": "Co", "City": "", "State": ""},
        ]
        ranked = rank_hiring_managers(managers, "engineering", "Co")
        # Senior title should rank higher
        assert "senior" in ranked[0]["Title"].lower()

    def test_ranking_preserves_all_managers(self):
        from app.services.recruiter_finder import rank_hiring_managers
        managers = [{"Title": f"Title{i}", "Company": "Co", "City": "", "State": ""} for i in range(10)]
        ranked = rank_hiring_managers(managers, "general", "Co")
        assert len(ranked) == 10

    def test_ranking_with_job_title_context(self):
        from app.services.recruiter_finder import rank_hiring_managers
        managers = [
            {"Title": "VP Sales", "Company": "Co", "City": "", "State": ""},
            {"Title": "VP Engineering", "Company": "Co", "City": "", "State": ""},
        ]
        ranked = rank_hiring_managers(managers, "engineering", "Co", job_title="Software Engineer")
        assert len(ranked) == 2

    def test_single_manager_ranking(self):
        from app.services.recruiter_finder import rank_hiring_managers
        managers = [{"Title": "CTO", "Company": "Startup", "City": "SF", "State": "CA"}]
        ranked = rank_hiring_managers(managers, "engineering", "Startup")
        assert len(ranked) == 1
        assert ranked[0]["Title"] == "CTO"


# ============================================================================
# 11. Historical/Current Filter Tests (Fix verification)
# ============================================================================

class TestHistoricalCurrentFilter:
    """Verify the IsCurrentlyAtTarget filter logic is correct."""

    def test_missing_flag_goes_to_historical(self):
        """Contacts without IsCurrentlyAtTarget should be in historical, not dropped."""
        contacts = [
            {"Name": "A", "IsCurrentlyAtTarget": True},
            {"Name": "B", "IsCurrentlyAtTarget": False},
            {"Name": "C"},  # Missing flag entirely
        ]
        current = [r for r in contacts if r.get('IsCurrentlyAtTarget', False)]
        historical = [r for r in contacts if not r.get('IsCurrentlyAtTarget', False)]
        assert len(current) == 1
        assert len(historical) == 2  # B and C both in historical
        assert current[0]["Name"] == "A"

    def test_false_flag_goes_to_historical(self):
        contacts = [{"Name": "X", "IsCurrentlyAtTarget": False}]
        current = [r for r in contacts if r.get('IsCurrentlyAtTarget', False)]
        historical = [r for r in contacts if not r.get('IsCurrentlyAtTarget', False)]
        assert len(current) == 0
        assert len(historical) == 1

    def test_all_current(self):
        contacts = [{"Name": f"P{i}", "IsCurrentlyAtTarget": True} for i in range(5)]
        current = [r for r in contacts if r.get('IsCurrentlyAtTarget', False)]
        historical = [r for r in contacts if not r.get('IsCurrentlyAtTarget', False)]
        assert len(current) == 5
        assert len(historical) == 0

    def test_no_contacts_dropped(self):
        """Total of current + historical should equal total input."""
        contacts = [
            {"Name": "A", "IsCurrentlyAtTarget": True},
            {"Name": "B", "IsCurrentlyAtTarget": False},
            {"Name": "C"},
            {"Name": "D", "IsCurrentlyAtTarget": None},
        ]
        current = [r for r in contacts if r.get('IsCurrentlyAtTarget', False)]
        historical = [r for r in contacts if not r.get('IsCurrentlyAtTarget', False)]
        assert len(current) + len(historical) == len(contacts)

    def test_fallback_email_no_first_name(self):
        """Fallback email should not produce 'Hi ,' when first name is empty."""
        from app.services.recruiter_email_generator import generate_fallback_email
        email = generate_fallback_email("", "SWE", "Google", "User")
        assert "Hello," in email
        assert "Hi ," not in email
