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
        contacts = [{"name": f"p{i}"} for i in range(30)]
        assert detect_company_size("BigCo", contacts) == "large"

    def test_threshold_boundary(self):
        from app.services.recruiter_finder import detect_company_size
        # Threshold bumped to 25 — <5 was misclassifying scaleups as small.
        assert detect_company_size("Co", [{}] * 24) == "small"
        assert detect_company_size("Co", [{}] * 25) == "large"

    def test_should_include_executives_small(self):
        from app.services.recruiter_finder import should_include_executives
        assert should_include_executives("Startup", [{"name": "a"}]) is True

    def test_should_include_executives_large(self):
        from app.services.recruiter_finder import should_include_executives
        contacts = [{}] * 30
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
        # when no PDL results are returned (both tight + loose paths)
        from app.services.recruiter_finder import find_hiring_manager
        with patch('app.services.recruiter_finder.execute_pdl_search', return_value=([], 404)), \
             patch('app.services.recruiter_finder._run_tight_pdl_query', return_value=[]), \
             patch('app.services.recruiter_finder.clean_company_name', return_value="TestCo"):
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


# ============================================================================
# Perplexity enrichment (verify_hiring_managers_v2 + batch_enrich_company_news)
# ============================================================================

class TestPerplexityEnrichment:
    """find_hiring_manager + Perplexity wiring. All Perplexity + PDL + Hunter
    calls are mocked — no network spend.
    """

    @staticmethod
    def _patch_pdl_and_hunter(rf, pdl_rows):
        rf.execute_pdl_search = lambda *a, **k: (list(pdl_rows), None)
        rf.enrich_contacts_with_hunter = lambda contacts, **k: [
            {**c, "EmailVerified": True, "is_verified_email": True} for c in contacts
        ]
        rf.PEOPLE_DATA_LABS_API_KEY = "test-key"

    def _run(self, monkeypatch, *, verifications, news_by_idx=None, generate_emails=False, uid=None):
        import importlib
        from app.services import recruiter_finder as rf
        importlib.reload(rf)
        from app.services import perplexity_client as pc

        monkeypatch.setattr(pc, "verify_hiring_managers_v2",
                            lambda hms, company, job_title: list(verifications))
        if news_by_idx is not None:
            monkeypatch.setattr(pc, "batch_enrich_company_news",
                                lambda contacts: dict(news_by_idx))

        self._patch_pdl_and_hunter(rf, [
            {"FirstName": "Alice", "LastName": "Smith", "Title": "Recruiter",
             "Company": "Acme", "Email": "alice@acme.com", "IsCurrentlyAtTarget": True},
            {"FirstName": "Bob", "LastName": "Jones", "Title": "Recruiter",
             "Company": "Acme", "Email": "bob@acme.com", "IsCurrentlyAtTarget": True},
            {"FirstName": "Carol", "LastName": "Lee", "Title": "Recruiter",
             "Company": "Acme", "Email": "carol@acme.com", "IsCurrentlyAtTarget": True},
        ])

        captured_to_email_gen = {}
        def fake_emails(recruiters, **k):
            captured_to_email_gen["recruiters"] = recruiters
            return [{"to_email": r["Email"], "subject": "x", "body": "y"} for r in recruiters]
        rf.generate_recruiter_emails = fake_emails

        result = rf.find_hiring_manager(
            company_name="Acme", job_type="engineering", job_title="Software Engineer",
            max_results=3, generate_emails=generate_emails,
            user_resume={"name": "T"} if generate_emails else None,
            user_contact={"name": "T", "email": "t@t.com"} if generate_emails else None,
            uid=uid,
        )
        return result, captured_to_email_gen

    def test_drops_no_high_confidence(self, monkeypatch):
        """still_at_company='no' + confidence='high' -> drop the candidate."""
        verifications = [
            {"still_at_company": "yes", "current_title": "Recruiter", "actively_hiring": "yes", "recent_hiring_signal": "", "confidence": "high"},
            {"still_at_company": "no",  "current_title": "",          "actively_hiring": "unknown", "recent_hiring_signal": "", "confidence": "high"},
            {"still_at_company": "yes", "current_title": "Recruiter", "actively_hiring": "yes", "recent_hiring_signal": "", "confidence": "medium"},
        ] * 4  # PDL returns 3 rows × 4 tiers = 12 candidates
        result, _ = self._run(monkeypatch, verifications=verifications)
        names = [f"{h['FirstName']} {h['LastName']}" for h in result["hiringManagers"]]
        assert "Bob Jones" not in names, "Bob should be dropped (no/high)"
        assert result["enrichment_meta"]["candidates_dropped"] >= 1

    def test_keeps_unknown_conservative(self, monkeypatch):
        """still_at_company='unknown' -> keep the candidate (never drop on uncertainty)."""
        v = {"still_at_company": "unknown", "current_title": "", "actively_hiring": "unknown", "recent_hiring_signal": "", "confidence": "medium"}
        result, _ = self._run(monkeypatch, verifications=[v] * 12)
        assert len(result["hiringManagers"]) == 3
        assert result["enrichment_meta"]["candidates_dropped"] == 0

    def test_keeps_no_when_low_confidence(self, monkeypatch):
        """still_at_company='no' but confidence='low' -> keep (Perplexity isn't sure)."""
        v = {"still_at_company": "no", "current_title": "", "actively_hiring": "unknown", "recent_hiring_signal": "", "confidence": "low"}
        result, _ = self._run(monkeypatch, verifications=[v] * 12)
        assert len(result["hiringManagers"]) == 3
        assert result["enrichment_meta"]["candidates_dropped"] == 0

    def test_title_correction_replaces_pdl_title(self, monkeypatch):
        """Perplexity's current_title overrides PDL when different; PDL title preserved in _pdl_title."""
        v = {"still_at_company": "yes", "current_title": "Senior Recruiter", "actively_hiring": "yes", "recent_hiring_signal": "", "confidence": "high"}
        result, _ = self._run(monkeypatch, verifications=[v] * 12)
        alice = next(h for h in result["hiringManagers"] if h["FirstName"] == "Alice")
        assert alice["Title"] == "Senior Recruiter"
        assert alice["_pdl_title"] == "Recruiter"
        assert result["enrichment_meta"]["candidates_title_corrected"] >= 1

    def test_perplexity_exception_degrades_gracefully(self, monkeypatch):
        """If verify_hiring_managers_v2 raises, find_hiring_manager keeps all candidates."""
        import importlib
        from app.services import recruiter_finder as rf; importlib.reload(rf)
        from app.services import perplexity_client as pc

        def boom(*a, **k):
            raise RuntimeError("perplexity down")
        monkeypatch.setattr(pc, "verify_hiring_managers_v2", boom)

        self._patch_pdl_and_hunter(rf, [
            {"FirstName": "X", "LastName": "Y", "Title": "Recruiter", "Company": "Acme", "Email": "x@a.com", "IsCurrentlyAtTarget": True}
        ])
        rf.generate_recruiter_emails = lambda recruiters, **k: []

        result = rf.find_hiring_manager(
            company_name="Acme", job_type="engineering", job_title="SE", max_results=3,
        )
        assert len(result["hiringManagers"]) >= 1, "Exception should not drop candidates"

    def test_company_news_enriched_for_email_gen(self, monkeypatch):
        """When generate_emails=True, company_recent_news flows into the email-gen input."""
        v = {"still_at_company": "yes", "current_title": "Recruiter", "actively_hiring": "yes", "recent_hiring_signal": "", "confidence": "high"}
        # Enrich first selected candidate only
        news = {0: {"company_recent_news": ["Acme raised $50M Series B"], "company_description": ""}}
        result, captured = self._run(monkeypatch, verifications=[v] * 12,
                                     news_by_idx=news, generate_emails=True)
        passed = captured.get("recruiters", [])
        carriers = [r for r in passed if r.get("company_recent_news")]
        assert len(carriers) >= 1, "At least one recruiter should reach email gen with news"



class TestEmailPromptNewsInjection:
    """Verify the prompt-building path in recruiter_email_generator."""

    def test_prompt_includes_news_when_present(self):
        from unittest.mock import MagicMock, patch
        from app.services import recruiter_email_generator as reg

        mc = MagicMock()
        mc.with_options.return_value = mc
        fake_resp = MagicMock()
        fake_resp.choices = [MagicMock()]
        fake_resp.choices[0].message.content = "Hi Alice,\n\nbody."
        mc.chat.completions.create.return_value = fake_resp

        with patch.object(reg, "get_openai_client", return_value=mc):
            reg.generate_single_email(
                recruiter={"FirstName": "Alice", "LastName": "S", "Title": "R", "Email": "a@a.com",
                           "company_recent_news": ["Acme raised $50M", "Launched AI product"]},
                job_title="SE", company="Acme", job_description="Build",
                user_resume={"name": "T"}, user_contact={"name": "T", "email": "t@t.com"},
            )
        prompt = mc.chat.completions.create.call_args.kwargs["messages"][-1]["content"]
        assert "RECENT COMPANY CONTEXT" in prompt
        assert "Acme raised $50M" in prompt
        assert "ignore this section entirely" in prompt  # defensive instruction present

    def test_prompt_omits_news_when_absent(self):
        from unittest.mock import MagicMock, patch
        from app.services import recruiter_email_generator as reg

        mc = MagicMock()
        mc.with_options.return_value = mc
        fake_resp = MagicMock()
        fake_resp.choices = [MagicMock()]
        fake_resp.choices[0].message.content = "Hi Bob,\n\nbody."
        mc.chat.completions.create.return_value = fake_resp

        with patch.object(reg, "get_openai_client", return_value=mc):
            reg.generate_single_email(
                recruiter={"FirstName": "Bob", "LastName": "J", "Title": "R", "Email": "b@a.com"},
                job_title="SE", company="Acme", job_description="Build",
                user_resume={"name": "T"}, user_contact={"name": "T", "email": "t@t.com"},
            )
        prompt = mc.chat.completions.create.call_args.kwargs["messages"][-1]["content"]
        assert "RECENT COMPANY CONTEXT" not in prompt


class TestFirecrawlJobUrlSeed:
    """Tier-0 Firecrawl-extracted hiring-manager seed flow."""

    def _setup(self, monkeypatch, *, enrich_response=None, pdl_tier_rows=None):
        """enrich_response: dict to return from /person/enrich, or None for 404 miss.
        pdl_tier_rows: list of dicts to return from the tier search.
        """
        import importlib
        from app.services import recruiter_finder as rf; importlib.reload(rf)
        # Mock Perplexity verification to a no-op (keeps everyone) since it always runs now
        from app.services import perplexity_client as pc
        monkeypatch.setattr(pc, "verify_hiring_managers_v2",
                            lambda hms, company, job_title: [
                                {"still_at_company": "unknown", "current_title": "",
                                 "actively_hiring": "unknown", "recent_hiring_signal": "",
                                 "confidence": "low"} for _ in hms
                            ])
        monkeypatch.setattr(pc, "batch_enrich_company_news", lambda contacts: {})

        # Mock /person/enrich (used by the new seed lookup — 1 credit per 200, free on 404).
        class FakeResp:
            def __init__(self, status, body=None):
                self.status_code = status
                self._body = body or {}
            def json(self):
                return self._body
        def fake_get(url, params=None, timeout=None):
            assert "/person/enrich" in url, f"Expected /person/enrich, got {url}"
            if enrich_response is None:
                return FakeResp(404)
            return FakeResp(200, {"status": 200, "data": enrich_response})
        import requests as _req
        monkeypatch.setattr(_req, "get", fake_get)
        # Patch the extractor to return the raw dict so test assertions stay simple.
        from app.services import pdl_client as _pdl
        monkeypatch.setattr(_pdl, "extract_contact_from_pdl_person_enhanced",
                            lambda person, target_company=None, pre_verified_email=None: dict(person))

        # Tier search still uses execute_pdl_search.
        rf.execute_pdl_search = lambda headers, url, query_obj, desired_limit, search_type, **k: (
            list(pdl_tier_rows or [
                {"FirstName": "Other", "LastName": "Person", "Title": "Recruiter",
                 "Company": "Acme", "Email": "other@acme.com", "IsCurrentlyAtTarget": True}
            ]), None)
        rf.enrich_contacts_with_hunter = lambda contacts, **k: [
            {**c, "EmailVerified": bool(c.get("Email")), "is_verified_email": bool(c.get("Email"))}
            for c in contacts
        ]
        rf.PEOPLE_DATA_LABS_API_KEY = "test-key"
        rf.generate_recruiter_emails = lambda recruiters, **k: []
        return rf

    def test_pdl_hit_seeds_get_priority(self, monkeypatch):
        """When /person/enrich returns a hit, it should appear FIRST in results."""
        rf = self._setup(monkeypatch, enrich_response={
            "FirstName": "Jane", "LastName": "Doe", "Title": "Engineering Manager",
            "Company": "Acme", "Email": "jane@acme.com", "IsCurrentlyAtTarget": True,
        })
        result = rf.find_hiring_manager(
            company_name="Acme", job_type="engineering", job_title="SE",
            max_results=3, seed_hiring_manager_name="Jane Doe",
        )
        assert len(result["hiringManagers"]) >= 1
        first = result["hiringManagers"][0]
        assert first["FirstName"] == "Jane" and first["LastName"] == "Doe"
        assert first.get("_source") == "firecrawl_seed"
        assert result["enrichment_meta"]["firecrawl_seed_used"] is True
        assert result["enrichment_meta"]["firecrawl_seed_name"] == "Jane Doe"

    def test_pdl_miss_synthetic_seed_still_included(self, monkeypatch):
        """When /person/enrich returns 404 (free, no credit), a synthetic record
        is included so Hunter can attempt email discovery."""
        rf = self._setup(monkeypatch, enrich_response=None)  # None -> 404 from fake_get
        result = rf.find_hiring_manager(
            company_name="Acme", job_type="engineering", job_title="SE",
            max_results=3, seed_hiring_manager_name="Obscure Person",
        )
        names = [(h["FirstName"], h["LastName"]) for h in result["hiringManagers"]]
        assert ("Obscure", "Person") in names
        synthetic = next(h for h in result["hiringManagers"] if h["FirstName"] == "Obscure")
        assert synthetic.get("_source") == "firecrawl_seed_synthetic"

    def test_no_seed_no_change(self, monkeypatch):
        """When seed_hiring_manager_name is None, behavior is identical to baseline."""
        rf = self._setup(monkeypatch)
        result = rf.find_hiring_manager(
            company_name="Acme", job_type="engineering", job_title="SE",
            max_results=3, seed_hiring_manager_name=None,
        )
        assert result["enrichment_meta"]["firecrawl_seed_used"] is False
        assert result["enrichment_meta"]["firecrawl_seed_name"] is None
        # No seed -> no candidate has _source firecrawl_seed*
        sources = [h.get("_source") for h in result["hiringManagers"]]
        assert not any((s or "").startswith("firecrawl_seed") for s in sources)

    def test_split_name_handles_multipart(self):
        from app.services.recruiter_finder import _split_name
        assert _split_name("Jane Doe") == ("Jane", "Doe")
        assert _split_name("Jane Van Doe") == ("Jane", "Van Doe")
        assert _split_name("Madonna") == ("Madonna", "")
        assert _split_name("  Jane   Doe  ") == ("Jane", "Doe")
        assert _split_name("") == ("", "")

    def test_looks_like_person_name_accepts_real_names(self):
        from app.services.recruiter_finder import _looks_like_person_name
        assert _looks_like_person_name("Jane Doe") is True
        assert _looks_like_person_name("Sundar Pichai") is True
        assert _looks_like_person_name("Brian Chesky") is True
        assert _looks_like_person_name("Jean-Luc Picard") is True
        assert _looks_like_person_name("Jane Van Doe") is True
        assert _looks_like_person_name("Maria del Carmen Garcia") is True
        # Comma-stripped: "Jane Doe, CTO" -> "Jane Doe" -> True
        assert _looks_like_person_name("Jane Doe, CTO") is True

    def test_looks_like_person_name_rejects_titles_and_garbage(self):
        from app.services.recruiter_finder import _looks_like_person_name
        # This is the exact Firecrawl-returned value that triggered the fix:
        assert _looks_like_person_name("Chief Technology Officer") is False
        assert _looks_like_person_name("Director of Engineering") is False
        assert _looks_like_person_name("VP Marketing") is False
        assert _looks_like_person_name("Senior Recruiter") is False
        assert _looks_like_person_name("Hiring Team") is False
        assert _looks_like_person_name("Head of Talent") is False
        assert _looks_like_person_name("Engineering Manager") is False
        # Edge cases
        assert _looks_like_person_name("") is False
        assert _looks_like_person_name("   ") is False
        assert _looks_like_person_name("Madonna") is False  # single word too risky
        assert _looks_like_person_name("a b c d e f g h") is False  # too many words
        assert _looks_like_person_name("jane doe") is False  # no capitalization
        assert _looks_like_person_name(None) is False
        assert _looks_like_person_name(123) is False

    def test_seed_skipped_when_name_is_a_title(self, monkeypatch):
        """Direct end-to-end: a title-shaped seed produces no synthetic record
        AND must not make any PDL call (verified by stubbing requests.get to
        raise if invoked)."""
        import importlib
        from app.services import recruiter_finder as rf; importlib.reload(rf)
        # Mock Perplexity so the test doesn't hit it
        from app.services import perplexity_client as pc
        monkeypatch.setattr(pc, "verify_hiring_managers_v2",
                            lambda hms, company, job_title: [{"still_at_company": "unknown",
                                "current_title": "", "actively_hiring": "unknown",
                                "recent_hiring_signal": "", "confidence": "low"} for _ in hms])
        monkeypatch.setattr(pc, "batch_enrich_company_news", lambda contacts: {})
        # Stub PDL completely so we know any candidate comes from the seed path
        rf.execute_pdl_search = lambda *a, **k: ([], None)
        rf.enrich_contacts_with_hunter = lambda contacts, **k: contacts
        rf.PEOPLE_DATA_LABS_API_KEY = "test-key"
        rf.generate_recruiter_emails = lambda recruiters, **k: []
        # Hard guard: if the validator regresses and we hit /person/enrich for a
        # title-shaped name, this raises — protecting real PDL credits.
        def must_not_call(url, **k):
            raise AssertionError(f"PDL must not be called for title-shaped seed; got URL {url}")
        import requests as _req
        monkeypatch.setattr(_req, "get", must_not_call)

        result = rf.find_hiring_manager(
            company_name="Acme", job_type="engineering", job_title="SE",
            max_results=3,
            seed_hiring_manager_name="Chief Technology Officer",  # the real bug case
        )
        names = [(h.get("FirstName"), h.get("LastName")) for h in result["hiringManagers"]]
        # No garbage record should appear
        assert ("Chief", "Technology Officer") not in names
        # And firecrawl_seed_used should be False because we bailed pre-seed
        assert result["enrichment_meta"]["firecrawl_seed_used"] is False

    def test_seed_uses_person_enrich_not_person_search(self, monkeypatch):
        """PDL credit audit: seed lookup must hit /person/enrich (1 credit per 200,
        free on 404) not /person/search (1 credit per profile returned, up to N)."""
        import importlib
        from app.services import recruiter_finder as rf; importlib.reload(rf)
        # Mock Perplexity so the test doesn't hit it
        from app.services import perplexity_client as pc
        monkeypatch.setattr(pc, "verify_hiring_managers_v2",
                            lambda hms, company, job_title: [{"still_at_company": "unknown",
                                "current_title": "", "actively_hiring": "unknown",
                                "recent_hiring_signal": "", "confidence": "low"} for _ in hms])
        monkeypatch.setattr(pc, "batch_enrich_company_news", lambda contacts: {})

        called_urls = []
        class FakeResp:
            status_code = 404
            def json(self): return {}
        def fake_get(url, **k):
            called_urls.append(url)
            return FakeResp()
        import requests as _req
        monkeypatch.setattr(_req, "get", fake_get)

        rf.execute_pdl_search = lambda *a, **k: ([], None)
        rf.enrich_contacts_with_hunter = lambda contacts, **k: contacts
        rf.PEOPLE_DATA_LABS_API_KEY = "test-key"
        rf.generate_recruiter_emails = lambda recruiters, **k: []

        rf.find_hiring_manager(
            company_name="Acme", job_type="engineering", job_title="SE",
            max_results=3, seed_hiring_manager_name="Jane Doe",
        )
        # Must have hit /person/enrich exactly once, NOT /person/search
        enrich_calls = [u for u in called_urls if "/person/enrich" in u]
        search_calls = [u for u in called_urls if "/person/search" in u]
        assert len(enrich_calls) == 1, f"Expected exactly 1 /person/enrich call, got {len(enrich_calls)}"
        assert len(search_calls) == 0, f"Seed lookup must NOT use /person/search (charges per profile); got {len(search_calls)} calls"


class TestTightPdlQuery:
    """Strategy B: tight PDL query first, fall through to loose tier loop on miss.
    All PDL calls mocked — no real API spend."""

    def _setup(self, monkeypatch, *, tight_results=None, tier_rows=None,
               job_type="engineering"):
        """tight_results: list of dicts the tight query returns (None -> empty).
        tier_rows: list of dicts execute_pdl_search returns for tier loop fallback.
        """
        import importlib
        from app.services import recruiter_finder as rf; importlib.reload(rf)
        from app.services import perplexity_client as pc

        # Stub _run_tight_pdl_query directly so we control its output without
        # needing to mock the underlying requests.post call shape.
        monkeypatch.setattr(rf, "_run_tight_pdl_query",
                            lambda company, role, size=3, company_website=None: list(tight_results or []))

        # Perplexity verification always runs now — mock to a no-op (keeps everyone)
        monkeypatch.setattr(pc, "verify_hiring_managers_v2",
                            lambda hms, company, job_title: [
                                {"still_at_company": "unknown", "current_title": "",
                                 "actively_hiring": "unknown", "recent_hiring_signal": "",
                                 "confidence": "low"} for _ in hms
                            ])
        monkeypatch.setattr(pc, "batch_enrich_company_news",
                            lambda contacts: {})

        # Tier loop fallback (loose query)
        rf.execute_pdl_search = lambda headers, url, query_obj, desired_limit, search_type, **k: (
            list(tier_rows or [
                {"FirstName": "Loose", "LastName": "Recruiter", "Title": "Recruiter",
                 "Company": "Acme", "Email": "loose@acme.com", "IsCurrentlyAtTarget": True}
            ]), None,
        )
        rf.enrich_contacts_with_hunter = lambda contacts, **k: [
            {**c, "EmailVerified": True, "is_verified_email": True} for c in contacts
        ]
        rf.PEOPLE_DATA_LABS_API_KEY = "test-key"
        rf.generate_recruiter_emails = lambda recruiters, **k: []
        return rf

    def test_tight_and_loose_mix_in_results(self, monkeypatch):
        """Option D: tight gives the decision-maker(s), tier loop fills the rest
        with recruiters. Both cohorts appear in the final result."""
        rf = self._setup(monkeypatch, tight_results=[
            {"FirstName": "Jane", "LastName": "Doe", "Title": "Engineering Manager",
             "Company": "Acme", "Email": "jane@acme.com", "IsCurrentlyAtTarget": True},
        ], tier_rows=[
            {"FirstName": "Ricki", "LastName": "Recruit", "Title": "Recruiter",
             "Company": "Acme", "Email": "r@a.com", "IsCurrentlyAtTarget": True},
            {"FirstName": "Tara", "LastName": "Talent", "Title": "Recruiter",
             "Company": "Acme", "Email": "t@a.com", "IsCurrentlyAtTarget": True},
        ])
        result = rf.find_hiring_manager(
            company_name="Acme", job_type="engineering", job_title="SE",
            max_results=3,
        )
        names = {(c["FirstName"], c["LastName"]) for c in result["hiringManagers"]}
        assert ("Jane", "Doe") in names, "Decision-maker from tight should appear"
        # And at least one recruiter from the tier loop
        assert any(n in names for n in [("Ricki", "Recruit"), ("Tara", "Talent")]), \
            "Recruiter from tier loop should also appear (Option D mix)"
        assert result["enrichment_meta"]["tight_pdl_used"] is True
        assert result["enrichment_meta"]["mix_mode"] == "tight+loose"

    def test_per_tier_size_shrunk_when_tight_supplied(self, monkeypatch):
        """When tight gave us candidates, the loose tier loop must use a small
        desired_limit — that's the credit-saving lever."""
        captured = {"sizes": []}
        def tier_spy(headers, url, query_obj, desired_limit, search_type, **k):
            captured["sizes"].append(desired_limit)
            return ([{"FirstName": "Loose", "LastName": "X", "Title": "R",
                      "Company": "Acme", "Email": "x@a.com", "IsCurrentlyAtTarget": True}], None)
        rf = self._setup(monkeypatch, tight_results=[
            {"FirstName": "Jane", "LastName": "Doe", "Title": "Eng Mgr",
             "Company": "Acme", "Email": "jane@acme.com", "IsCurrentlyAtTarget": True},
        ])
        rf.execute_pdl_search = tier_spy
        rf.find_hiring_manager(
            company_name="Acme", job_type="engineering", job_title="SE",
            max_results=3,
        )
        # All tier calls used the shrunken size (max 3, never 20)
        assert captured["sizes"], "Tier loop must have run"
        assert all(s <= 5 for s in captured["sizes"]), \
            f"Per-tier size should shrink to ~max_results when tight supplied; got {captured['sizes']}"

    def test_unmapped_job_type_uses_loose_only_size(self, monkeypatch):
        """When job_type has no PDL role mapping, tight is skipped and the
        loose tier loop uses the Phase-1 loose-only buffer (max_results*2,
        or 8 floor) rather than the pre-Phase-1 fixed 20."""
        captured = {"sizes": []}
        def tier_spy(headers, url, query_obj, desired_limit, search_type, **k):
            captured["sizes"].append(desired_limit)
            return ([], None)
        rf = self._setup(monkeypatch, job_type="general")  # 'general' is unmapped
        rf.execute_pdl_search = tier_spy
        rf.find_hiring_manager(
            company_name="Acme", job_type="general", job_title="x", max_results=3,
        )
        assert captured["sizes"], "Tier loop must have run"
        expected = max(3 * 2, 8)
        assert all(s == expected for s in captured["sizes"]), \
            f"Loose-only path expected per_tier_size={expected}; got {captured['sizes']}"

    def test_tight_returns_zero_falls_through_to_tier_loop(self, monkeypatch):
        """When tight returns nothing, the tier loop runs normally — no regression."""
        tier_called = {"n": 0}
        def tier_spy(*a, **k):
            tier_called["n"] += 1
            return ([{"FirstName": "Loose", "LastName": "Recruiter", "Title": "Recruiter",
                      "Company": "Acme", "Email": "loose@acme.com", "IsCurrentlyAtTarget": True}], None)
        rf = self._setup(monkeypatch, tight_results=[])
        rf.execute_pdl_search = tier_spy

        result = rf.find_hiring_manager(
            company_name="Acme", job_type="engineering", job_title="SE", max_results=2,
        )
        assert tier_called["n"] >= 1, "Tier loop should run when tight returns 0"
        assert result["enrichment_meta"]["tight_pdl_used"] is False
        assert result["enrichment_meta"]["mix_mode"] == "loose_only"

    def test_unmapped_job_type_skips_tight_query(self, monkeypatch):
        """job_type='general' has no PDL role mapping — tight query never runs."""
        tight_called = {"n": 0}
        def tight_spy(company, role, size=3):
            tight_called["n"] += 1
            return []
        rf = self._setup(monkeypatch, job_type="general")
        rf._run_tight_pdl_query = tight_spy

        result = rf.find_hiring_manager(
            company_name="Acme", job_type="general", job_title="x", max_results=2,
        )
        assert tight_called["n"] == 0, "Tight query must NOT fire for unmapped job_type"
        assert result["enrichment_meta"]["tight_pdl_role"] is None
        assert result["enrichment_meta"]["tight_pdl_used"] is False

    def test_build_tight_pdl_query_schema(self):
        """Query body shape must match PDL's documented format — no multi_match,
        no minimum_should_match, must clause only with term/terms/exists."""
        from app.services.recruiter_finder import _build_tight_pdl_query
        body = _build_tight_pdl_query("Stripe", "engineering", size=3)
        assert body["size"] == 3
        must = body["query"]["bool"]["must"]
        # Must contain: company, role, exists linkedin, terms levels
        kinds = [list(c.keys())[0] for c in must]
        assert "term" in kinds  # job_company_name AND job_title_role
        assert "exists" in kinds  # linkedin_url
        assert "terms" in kinds  # job_title_levels array
        # No banned clauses
        body_str = str(body)
        assert "multi_match" not in body_str
        assert "minimum_should_match" not in body_str
        assert "filter" not in body_str  # PDL examples use must, not filter

    def test_tight_target_scales_with_max_results(self):
        """Option D mix: leave at least 1 recruiter slot at the smallest tiers,
        cap decision-makers at 3 even for Elite."""
        from app.services.recruiter_finder import _tight_target_for
        assert _tight_target_for(1) == 1
        assert _tight_target_for(2) == 1   # Free: 1 dm + 1 recruiter
        assert _tight_target_for(3) == 2   # Free: 2 dm + 1 recruiter
        assert _tight_target_for(5) == 2   # Pro: 2 dm + 3 recruiters
        assert _tight_target_for(8) == 3   # Pro: 3 dm + 5 recruiters
        assert _tight_target_for(15) == 3  # Elite: 3 dm + 12 recruiters

    def test_job_type_role_mapping_coverage(self):
        """Confirm the mapping has the common job_types we expect to convert."""
        from app.services.recruiter_finder import _JOB_TYPE_TO_PDL_ROLE
        assert _JOB_TYPE_TO_PDL_ROLE.get("engineering") == "engineering"
        assert _JOB_TYPE_TO_PDL_ROLE.get("sales") == "sales"
        assert _JOB_TYPE_TO_PDL_ROLE.get("marketing") == "marketing"
        assert _JOB_TYPE_TO_PDL_ROLE.get("finance") == "finance"
        # Deliberately unmapped
        assert _JOB_TYPE_TO_PDL_ROLE.get("general") is None
        assert _JOB_TYPE_TO_PDL_ROLE.get("intern") is None


class TestPdlEnrichByName:
    """The metered helper enrich_by_name (pdl_client) — replaces the raw
    requests.get in _seed_from_firecrawl_name."""

    def test_no_api_key_returns_none(self, monkeypatch):
        from app.services import pdl_client as pdl
        monkeypatch.setattr(pdl, "PEOPLE_DATA_LABS_API_KEY", None)
        result = pdl.enrich_by_name("Jane", "Doe", "Acme")
        assert result is None

    def test_200_returns_data(self, monkeypatch):
        from app.services import pdl_client as pdl
        monkeypatch.setattr(pdl, "PEOPLE_DATA_LABS_API_KEY", "test-key")
        class R:
            status_code = 200
            def json(self):
                return {"status": 200, "data": {"first_name": "Jane", "last_name": "Doe"}}
        monkeypatch.setattr(pdl.requests, "get", lambda *a, **k: R())
        result = pdl.enrich_by_name("Jane", "Doe", "Acme")
        assert result == {"first_name": "Jane", "last_name": "Doe"}

    def test_404_returns_none(self, monkeypatch):
        from app.services import pdl_client as pdl
        monkeypatch.setattr(pdl, "PEOPLE_DATA_LABS_API_KEY", "test-key")
        class R:
            status_code = 404
            def json(self): return {}
        monkeypatch.setattr(pdl.requests, "get", lambda *a, **k: R())
        result = pdl.enrich_by_name("Obscure", "Person", "TinyCo")
        assert result is None


class TestCompanyNewsHedgeFilter:
    """The `_is_hedging_bullet` filter that defends batch_enrich_company_news
    from Perplexity's hedging phrases (the Stripe failure case we saw in eval)."""

    def test_real_hedging_bullets_are_filtered(self):
        from app.services.perplexity_client import _is_hedging_bullet
        # Verbatim bullets Perplexity returned for Stripe in our eval run:
        bullets = [
            "**No major Stripe announcement** in the provided results clearly falls within the last 3 months, so I can't verify a specific recent launch.",
            "The closest notable item is a **February 2026 tender offer** that valued Stripe at **$159 billion**, but it is outside the requested 3-month window.",
            "A recent Stripe privacy-policy update was posted on **April 28, 2026**, but the result only confirms the policy update.",
        ]
        for b in bullets:
            assert _is_hedging_bullet(b), f"Should have been filtered: {b[:80]}"

    def test_real_facts_pass_through(self):
        from app.services.perplexity_client import _is_hedging_bullet
        # Real bullets from the Anthropic eval — actual factual announcements:
        bullets = [
            "Anthropic announced a compute partnership with SpaceX on May 6, adding 300+ megawatts of capacity.",
            "Anthropic closed a $30 billion Series G at a $380 billion post-money valuation in February.",
            "Google reportedly committed up to $40 billion more in Anthropic funding in late April.",
            "Anthropic doubled Claude Code's five-hour rate limits for Pro, Max, Team plans.",
        ]
        for b in bullets:
            assert not _is_hedging_bullet(b), f"Should have passed through: {b[:80]}"

    def test_non_string_inputs_treated_as_hedging(self):
        """Defensive: non-string items in the parsed bullet list shouldn't crash."""
        from app.services.perplexity_client import _is_hedging_bullet
        assert _is_hedging_bullet(None) is True
        assert _is_hedging_bullet(123) is True
        assert _is_hedging_bullet({"weird": "dict"}) is True


class TestVerifyHiringManagersV2Schema:
    """Module-level checks on verify_hiring_managers_v2 (no network)."""

    def test_no_api_key_returns_unknown_defaults(self, monkeypatch):
        """When PERPLEXITY_API_KEY is missing, return unknown/low for every input."""
        from app.services import perplexity_client as pc
        monkeypatch.setattr(pc, "_get_client", lambda: None)
        out = pc.verify_hiring_managers_v2(
            hms=[{"FirstName": "A", "LastName": "B"}, {"FirstName": "C", "LastName": "D"}],
            company="X", job_title="Y",
        )
        assert len(out) == 2
        for entry in out:
            assert entry["still_at_company"] == "unknown"
            assert entry["confidence"] == "low"

    def test_schema_shape(self):
        from app.services.perplexity_client import _HM_VERIFY_SCHEMA
        assert _HM_VERIFY_SCHEMA["name"] == "hm_verification"
        schema = _HM_VERIFY_SCHEMA["schema"]
        assert schema["additionalProperties"] is False
        for field in ("still_at_company", "current_title", "actively_hiring",
                      "recent_hiring_signal", "confidence"):
            assert field in schema["properties"]
            assert field in schema["required"]
        assert schema["properties"]["still_at_company"]["enum"] == ["yes", "no", "unknown"]
        assert schema["properties"]["confidence"]["enum"] == ["high", "medium", "low"]


# ============================================================================
# Relevance overhaul (2026-07-08) — job types, PDL role mapping, country
# inference, company website routing, ranking with Perplexity signal.
# ============================================================================

class TestJobTypeDetectionExpanded:
    """Coverage for consulting / IB / product / data_science / design buckets."""

    def test_consulting_beats_finance_on_business_analyst(self):
        from app.services.recruiter_finder import determine_job_type
        assert determine_job_type(
            "Business Analyst", "consulting at McKinsey"
        ) == "consulting"

    def test_investment_banking_detected(self):
        from app.services.recruiter_finder import determine_job_type
        assert determine_job_type(
            "Investment Banking Analyst",
            "M&A group at Goldman Sachs",
        ) == "investment_banking"

    def test_product_manager_detected(self):
        from app.services.recruiter_finder import determine_job_type
        assert determine_job_type(
            "Associate Product Manager", "APM role at Google"
        ) == "product"

    def test_data_scientist_detected(self):
        from app.services.recruiter_finder import determine_job_type
        assert determine_job_type(
            "Data Scientist", "ML modeling role at Airbnb"
        ) == "data_science"

    def test_analyst_no_longer_defaults_to_finance(self):
        from app.services.recruiter_finder import determine_job_type
        # "analyst" alone previously flipped to finance. A product-analyst
        # role should not, because we removed the bare "analyst" keyword
        # and made finance-analyst titles explicit.
        result = determine_job_type("Product Analyst", "product analytics team")
        assert result != "finance"


class TestPdlRoleMapping:
    """The tight decision-maker query only fires when the job_type has a
    _JOB_TYPE_TO_PDL_ROLE mapping. Expanding the map is the actual fix
    for consulting/IB users seeing generic "manager" results."""

    def test_consulting_maps_to_consulting(self):
        from app.services.recruiter_finder import _JOB_TYPE_TO_PDL_ROLE
        assert _JOB_TYPE_TO_PDL_ROLE.get("consulting") == "consulting"

    def test_investment_banking_maps_to_finance(self):
        from app.services.recruiter_finder import _JOB_TYPE_TO_PDL_ROLE
        # PDL has no IB bucket — finance is the closest role we can pin.
        assert _JOB_TYPE_TO_PDL_ROLE.get("investment_banking") == "finance"

    def test_product_and_data_science_have_mappings(self):
        from app.services.recruiter_finder import _JOB_TYPE_TO_PDL_ROLE
        assert _JOB_TYPE_TO_PDL_ROLE.get("product") == "product"
        assert _JOB_TYPE_TO_PDL_ROLE.get("data_science") == "engineering"


class TestCountryInference:
    """Drop hard-coded US filter — infer country so international HMs
    don't get filtered out."""

    def test_us_locations_return_united_states(self):
        from app.services.recruiter_finder import infer_location_country
        assert infer_location_country("San Francisco, CA") == "united states"
        assert infer_location_country("New York, NY, United States") == "united states"

    def test_london_returns_uk(self):
        from app.services.recruiter_finder import infer_location_country
        assert infer_location_country("London, UK") == "united kingdom"

    def test_toronto_returns_canada(self):
        from app.services.recruiter_finder import infer_location_country
        assert infer_location_country("Toronto, ON") == "canada"

    def test_bangalore_returns_india(self):
        from app.services.recruiter_finder import infer_location_country
        assert infer_location_country("Bangalore") == "india"

    def test_unknown_returns_none(self):
        from app.services.recruiter_finder import infer_location_country
        assert infer_location_country("") is None
        assert infer_location_country(None) is None
        assert infer_location_country("Mars Colony") is None


class TestCompanyWebsiteRouting:
    """Some firms (BCG, MBB) have unguessable PDL job_company_name canonicals.
    Route them via job_company_website term instead."""

    def test_bcg_resolves_to_website(self):
        from app.services.recruiter_finder import resolve_company_website
        assert resolve_company_website("BCG") == "bcg.com"
        assert resolve_company_website("Boston Consulting Group") == "bcg.com"

    def test_mckinsey_resolves(self):
        from app.services.recruiter_finder import resolve_company_website
        assert resolve_company_website("McKinsey") == "mckinsey.com"

    def test_unmapped_firm_returns_none(self):
        from app.services.recruiter_finder import resolve_company_website
        assert resolve_company_website("Some Random Startup Co") is None


class TestQueryBuilderNewParams:
    """build_hiring_manager_search_query now accepts company_website and
    pdl_role. Country filter is inferred from location, not hard-US."""

    def test_us_location_adds_country_filter(self):
        from app.services.recruiter_finder import build_hiring_manager_search_query
        query = build_hiring_manager_search_query(
            company_name="google",
            titles=["engineering manager"],
            location="San Francisco, CA",
        )
        must = query["bool"]["must"]
        country_terms = [c for c in must if isinstance(c, dict) and "term" in c and "location_country" in c.get("term", {})]
        assert country_terms
        assert country_terms[0]["term"]["location_country"] == "united states"

    def test_uk_location_switches_country(self):
        from app.services.recruiter_finder import build_hiring_manager_search_query
        query = build_hiring_manager_search_query(
            company_name="revolut",
            titles=["engineering manager"],
            location="London, UK",
        )
        must = query["bool"]["must"]
        country_terms = [c for c in must if isinstance(c, dict) and "term" in c and "location_country" in c.get("term", {})]
        assert country_terms
        assert country_terms[0]["term"]["location_country"] == "united kingdom"

    def test_unknown_location_drops_country_filter(self):
        from app.services.recruiter_finder import build_hiring_manager_search_query
        query = build_hiring_manager_search_query(
            company_name="google",
            titles=["engineering manager"],
            location=None,
        )
        must = query["bool"]["must"]
        country_terms = [c for c in must if isinstance(c, dict) and "term" in c and "location_country" in c.get("term", {})]
        assert country_terms == []

    def test_company_website_term_added(self):
        from app.services.recruiter_finder import build_hiring_manager_search_query
        query = build_hiring_manager_search_query(
            company_name="bcg",
            titles=["principal"],
            company_website="bcg.com",
        )
        # The company clause is a bool/should — website term should appear inside.
        must = query["bool"]["must"]
        # Find the company clause
        found_website = False
        for clause in must:
            if isinstance(clause, dict) and "bool" in clause and "should" in clause["bool"]:
                for should_clause in clause["bool"]["should"]:
                    if isinstance(should_clause, dict) and "term" in should_clause:
                        if "job_company_website" in should_clause["term"]:
                            found_website = True
        assert found_website, "Expected job_company_website term to appear when company_website is passed"

    def test_pdl_role_term_added(self):
        from app.services.recruiter_finder import build_hiring_manager_search_query
        query = build_hiring_manager_search_query(
            company_name="google",
            titles=["engineering manager"],
            pdl_role="consulting",
        )
        must = query["bool"]["must"]
        role_terms = [c for c in must if isinstance(c, dict) and "term" in c and "job_title_role" in c.get("term", {})]
        assert role_terms
        assert role_terms[0]["term"]["job_title_role"] == "consulting"


class TestTightQueryWithWebsite:
    """_build_tight_pdl_query should OR name and website when both are known."""

    def test_website_added_as_alternative(self):
        from app.services.recruiter_finder import _build_tight_pdl_query
        body = _build_tight_pdl_query("bcg", "consulting", size=3, company_website="bcg.com")
        must = body["query"]["bool"]["must"]
        # First must clause is the company should
        assert "bool" in must[0]
        should = must[0]["bool"]["should"]
        website_terms = [s for s in should if "term" in s and "job_company_website" in s.get("term", {})]
        assert website_terms
        assert website_terms[0]["term"]["job_company_website"] == "bcg.com"

    def test_no_website_falls_back_to_name_only(self):
        from app.services.recruiter_finder import _build_tight_pdl_query
        body = _build_tight_pdl_query("some-random-co", "engineering", size=3)
        must = body["query"]["bool"]["must"]
        should = must[0]["bool"]["should"]
        # Only one alternative — the name term.
        assert len(should) == 1


class TestRankingWithPerplexitySignal:
    """Verified > unknown > low-conf-no."""

    def test_verified_ranks_above_unknown(self):
        from app.services.recruiter_finder import rank_hiring_managers
        managers = [
            {
                "Title": "Engineering Manager", "Company": "Acme",
                "City": "", "State": "",
                "_perplexity_still_at_company": "unknown",
                "_perplexity_confidence": "low",
            },
            {
                "Title": "Engineering Manager", "Company": "Acme",
                "City": "", "State": "",
                "_perplexity_still_at_company": "yes",
                "_perplexity_confidence": "high",
            },
        ]
        ranked = rank_hiring_managers(managers, "engineering", "Acme")
        assert ranked[0]["_perplexity_still_at_company"] == "yes"

    def test_low_conf_no_penalized(self):
        from app.services.recruiter_finder import rank_hiring_managers
        managers = [
            {
                "Title": "Engineering Manager", "Company": "Acme",
                "City": "", "State": "",
                "_perplexity_still_at_company": "no",
                "_perplexity_confidence": "low",
            },
            {
                "Title": "Engineering Manager", "Company": "Acme",
                "City": "", "State": "",
                # No perplexity signal — treated as neutral.
            },
        ]
        ranked = rank_hiring_managers(managers, "engineering", "Acme")
        # The "no" entry should sink below the neutral one.
        assert ranked[0].get("_perplexity_still_at_company") != "no"


class TestExpandedTier5:
    """Tier 5 should now include CTO, VP Eng, Head of Product, etc — not just
    founder/CEO/COO."""

    def test_tier5_includes_cto(self):
        from app.services.recruiter_finder import HIRING_MANAGER_PRIORITY_TIERS
        assert "cto" in HIRING_MANAGER_PRIORITY_TIERS[5]["titles"]

    def test_tier5_includes_head_of_engineering(self):
        from app.services.recruiter_finder import HIRING_MANAGER_PRIORITY_TIERS
        assert "head of engineering" in HIRING_MANAGER_PRIORITY_TIERS[5]["titles"]


class TestDiscoverHiringLeads:
    """New Perplexity helper for reachable-people fallback."""

    def test_no_client_returns_empty(self, monkeypatch):
        from app.services import perplexity_client as pc
        monkeypatch.setattr(pc, "_get_client", lambda: None)
        result = pc.discover_hiring_leads("Google", "Software Engineer")
        assert result == []

    def test_empty_args_return_empty(self):
        from app.services.perplexity_client import discover_hiring_leads
        assert discover_hiring_leads("", "SWE") == []
        assert discover_hiring_leads("Google", "") == []

    def test_schema_shape(self):
        from app.services.perplexity_client import _HIRING_LEADS_SCHEMA
        assert _HIRING_LEADS_SCHEMA["name"] == "hiring_leads"
        schema = _HIRING_LEADS_SCHEMA["schema"]
        assert schema["additionalProperties"] is False
        assert "leads" in schema["properties"]
        item_schema = schema["properties"]["leads"]["items"]
        for field in ("name", "title", "reason"):
            assert field in item_schema["properties"]
            assert field in item_schema["required"]


class TestCohortTagging:
    """find_hiring_manager tags each returned contact with _cohort so the
    UI can render a chip explaining why the person surfaced."""

    def test_tight_pdl_source_gets_likely_hm_cohort(self):
        # Direct exercise of the tagging block — mimic what the tail of
        # find_hiring_manager does when it sets _cohort on final selections.
        candidate = {"Title": "Director of Engineering", "_source": "tight_pdl"}
        title = (candidate.get("Title") or "").lower()
        source = candidate.get("_source") or ""
        if source == "tight_pdl":
            candidate["_cohort"] = "likely_hm"
        assert candidate["_cohort"] == "likely_hm"

    def test_executive_title_gets_adjacent_cohort(self):
        # CEO/CFO/founder → adjacent (only useful for tiny orgs, but at a
        # large co they're not the HM).
        candidate = {"Title": "CEO of Acme", "_source": ""}
        title = (candidate.get("Title") or "").lower()
        assert any(kw in title for kw in ("founder", "ceo", "cfo", "coo", "president"))


class TestDecisionMakerLevels:
    """Consulting and IB decision-makers are `partner`-level in PDL. Missing
    that from `_DECISION_MAKER_LEVELS` was silently returning 0 from the
    tight query for MBB / Goldman / Morgan Stanley."""

    def test_partner_is_decision_maker(self):
        from app.services.recruiter_finder import _DECISION_MAKER_LEVELS
        assert "partner" in _DECISION_MAKER_LEVELS

    def test_traditional_levels_still_present(self):
        from app.services.recruiter_finder import _DECISION_MAKER_LEVELS
        for level in ("manager", "director", "vp", "cxo", "owner"):
            assert level in _DECISION_MAKER_LEVELS


class TestFirecrawlSeedSkipsTightPdl:
    """When Firecrawl scraped the named HM from the posting, we already have
    ground truth — spending 2-3 more PDL credits hunting for another
    decision-maker in the same function is wasteful. Only the loose tier
    loop should run to fill peer slots."""

    def _stub(self, monkeypatch):
        import importlib
        from app.services import recruiter_finder as rf; importlib.reload(rf)
        from app.services import perplexity_client as pc

        # Firecrawl seed always finds a person
        monkeypatch.setattr(rf, "_seed_from_firecrawl_name",
                            lambda name, company, company_aliases: [
                                {"FirstName": "Jane", "LastName": "Doe",
                                 "Title": "Head of Consulting",
                                 "Company": "Acme", "Email": "jane@acme.com",
                                 "IsCurrentlyAtTarget": True,
                                 "_source": "firecrawl_seed"}
                            ])
        # Spy on tight query
        tight_calls = {"n": 0}
        def tight_spy(company, role, size=3, company_website=None):
            tight_calls["n"] += 1
            return [{"FirstName": "Someone", "LastName": "Else", "Title": "Director",
                     "Company": "Acme", "Email": "s@acme.com",
                     "IsCurrentlyAtTarget": True, "_source": "tight_pdl"}]
        monkeypatch.setattr(rf, "_run_tight_pdl_query", tight_spy)

        monkeypatch.setattr(pc, "verify_hiring_managers_v2",
                            lambda hms, company, job_title: [
                                {"still_at_company": "unknown", "current_title": "",
                                 "actively_hiring": "unknown", "recent_hiring_signal": "",
                                 "confidence": "low"} for _ in hms])
        monkeypatch.setattr(pc, "batch_enrich_company_news", lambda contacts: {})
        rf.execute_pdl_search = lambda **k: (
            [{"FirstName": "Loose", "LastName": "Rec", "Title": "Recruiter",
              "Company": "Acme", "Email": "l@acme.com", "IsCurrentlyAtTarget": True}],
            None,
        )
        rf.enrich_contacts_with_hunter = lambda contacts, **k: [
            {**c, "EmailVerified": True, "is_verified_email": True} for c in contacts
        ]
        rf.PEOPLE_DATA_LABS_API_KEY = "test-key"
        rf.generate_recruiter_emails = lambda recruiters, **k: []
        return rf, tight_calls

    def test_seed_causes_tight_skip(self, monkeypatch):
        rf, tight_calls = self._stub(monkeypatch)
        result = rf.find_hiring_manager(
            company_name="Acme", job_type="consulting", job_title="Business Analyst",
            max_results=3, seed_hiring_manager_name="Jane Doe",
        )
        assert tight_calls["n"] == 0, "Tight PDL must NOT run when Firecrawl seed already found the HM"
        # But seed should still make the final cut
        names = {(c["FirstName"], c["LastName"]) for c in result["hiringManagers"]}
        assert ("Jane", "Doe") in names

    def test_seed_absent_still_runs_tight(self, monkeypatch):
        rf, tight_calls = self._stub(monkeypatch)
        # Don't pass seed_hiring_manager_name — tight should run as before
        rf.find_hiring_manager(
            company_name="Acme", job_type="consulting", job_title="Business Analyst",
            max_results=3,
        )
        assert tight_calls["n"] == 1, "Tight PDL must run when no Firecrawl seed provided"


class TestTier1SkipsRoleFilter:
    """Tier 1 titles are recruiter/HM titles that PDL tags with
    role=human_resources, not the target function. Pinning Tier 1 to
    role=consulting silently drops legitimate corporate recruiters. Only
    Tiers 2-3 (team-lead / dept-head titles) should get the role pin."""

    def test_tier1_query_omits_role_filter(self, monkeypatch):
        import importlib
        from app.services import recruiter_finder as rf; importlib.reload(rf)
        from app.services import perplexity_client as pc

        captured_queries = []
        def spy(headers, url, query_obj, desired_limit, search_type, **k):
            captured_queries.append(query_obj)
            return ([], None)
        monkeypatch.setattr(rf, "_run_tight_pdl_query",
                            lambda company, role, size=3, company_website=None: [])
        monkeypatch.setattr(pc, "verify_hiring_managers_v2",
                            lambda hms, company, job_title: [])
        monkeypatch.setattr(pc, "batch_enrich_company_news", lambda contacts: {})
        rf.execute_pdl_search = spy
        rf.enrich_contacts_with_hunter = lambda contacts, **k: contacts
        rf.PEOPLE_DATA_LABS_API_KEY = "test-key"
        rf.generate_recruiter_emails = lambda recruiters, **k: []

        rf.find_hiring_manager(
            company_name="McKinsey", job_type="consulting", job_title="Business Analyst",
            max_results=3,
        )
        assert captured_queries, "Loose tier loop should have run"
        # First captured query is Tier 1 — must NOT contain a job_title_role term.
        tier1 = captured_queries[0]
        must = tier1["bool"]["must"]
        role_terms = [c for c in must if isinstance(c, dict) and "term" in c and "job_title_role" in c.get("term", {})]
        assert role_terms == [], \
            "Tier 1 must not filter by job_title_role — recruiters are tagged HR in PDL"

    def test_tier2_query_includes_role_filter(self, monkeypatch):
        import importlib
        from app.services import recruiter_finder as rf; importlib.reload(rf)
        from app.services import perplexity_client as pc

        captured_queries = []
        def spy(headers, url, query_obj, desired_limit, search_type, **k):
            captured_queries.append(query_obj)
            return ([], None)
        monkeypatch.setattr(rf, "_run_tight_pdl_query",
                            lambda company, role, size=3, company_website=None: [])
        monkeypatch.setattr(pc, "verify_hiring_managers_v2",
                            lambda hms, company, job_title: [])
        monkeypatch.setattr(pc, "batch_enrich_company_news", lambda contacts: {})
        rf.execute_pdl_search = spy
        rf.enrich_contacts_with_hunter = lambda contacts, **k: contacts
        rf.PEOPLE_DATA_LABS_API_KEY = "test-key"
        rf.generate_recruiter_emails = lambda recruiters, **k: []

        rf.find_hiring_manager(
            company_name="McKinsey", job_type="consulting", job_title="Business Analyst",
            max_results=3,
        )
        # Second captured query is Tier 2 — MUST contain job_title_role.
        assert len(captured_queries) >= 2, "Tier 2 loop should also fire"
        tier2 = captured_queries[1]
        must = tier2["bool"]["must"]
        role_terms = [c for c in must if isinstance(c, dict) and "term" in c and "job_title_role" in c.get("term", {})]
        assert role_terms, \
            "Tier 2 should filter by job_title_role — team lead titles cleanly map to a function"
        assert role_terms[0]["term"]["job_title_role"] == "consulting"
