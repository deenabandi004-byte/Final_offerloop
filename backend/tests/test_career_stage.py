"""Unit tests for career stage derivation and bidirectional seniority gating.

Pure-function tests: no Firestore, no HTTP.
"""
from datetime import datetime

import pytest

from app.services.career_stage import (
    ALLOWED_JOB_LEVELS,
    classify_job_level,
    derive_career_stage,
    estimate_years_of_experience,
    job_level_allowed,
)


CURRENT_YEAR = datetime.now().year


class TestYearsOfExperience:

    def test_no_dates_returns_none(self):
        assert estimate_years_of_experience([{"title": "Analyst"}]) is None
        assert estimate_years_of_experience([]) is None

    def test_single_dated_range(self):
        years = estimate_years_of_experience(
            [{"title": "Analyst", "dates": "January 2018 - January 2021"}]
        )
        assert years == pytest.approx(3.1, abs=0.2)

    def test_present_range_counts_to_now(self):
        start = CURRENT_YEAR - 10
        years = estimate_years_of_experience(
            [{"title": "Engineer", "dates": f"June {start} - Present"}]
        )
        assert years == pytest.approx(10, abs=1.0)

    def test_overlapping_ranges_merge(self):
        years = estimate_years_of_experience([
            {"title": "A", "dates": "January 2019 - January 2021"},
            {"title": "B", "dates": "June 2020 - June 2021"},
        ])
        # Merged span is Jan 2019 - Jun 2021, ~2.5y, not 3+2.
        assert years == pytest.approx(2.5, abs=0.3)

    def test_future_start_ignored(self):
        future = CURRENT_YEAR + 1
        assert estimate_years_of_experience(
            [{"title": "Intern", "dates": f"June {future} - August {future}"}]
        ) is None


class TestDeriveCareerStage:

    def test_sophomore_is_internship_phase(self):
        info = derive_career_stage(
            graduation_year=CURRENT_YEAR + 2, months_until_graduation=22
        )
        assert info["stage"] == "internship"
        assert info["is_student"] is True

    def test_graduating_senior_is_new_grad(self):
        info = derive_career_stage(
            graduation_year=CURRENT_YEAR, months_until_graduation=6
        )
        assert info["stage"] == "new_grad"

    def test_old_graduation_year_with_no_resume_is_not_new_grad(self):
        # The old model classified a 2005 grad as new_grad. Never again.
        info = derive_career_stage(
            graduation_year=CURRENT_YEAR - 20, months_until_graduation=0
        )
        assert info["stage"] in ("senior", "executive")
        assert info["is_student"] is False

    def test_resume_years_drive_stage(self):
        start = CURRENT_YEAR - 6
        info = derive_career_stage(
            graduation_year=CURRENT_YEAR - 6,
            months_until_graduation=0,
            experiences=[{"title": "Consultant", "dates": f"June {start} - Present"}],
        )
        assert info["stage"] == "mid_level"
        assert info["source"] == "resume"

    def test_exec_title_bumps_stage(self):
        start = CURRENT_YEAR - 5
        info = derive_career_stage(
            experiences=[
                {"title": "VP of Engineering", "dates": f"June {start} - Present"},
            ],
        )
        assert info["stage"] == "executive"

    def test_stated_years_override_wins(self):
        info = derive_career_stage(
            user_type="professional", years_experience_override=12
        )
        assert info["stage"] == "senior"
        assert info["source"] == "stated"

    def test_professional_with_no_data_defaults_early_career(self):
        info = derive_career_stage(user_type="professional")
        assert info["stage"] == "early_career"
        assert info["is_student"] is False

    def test_no_data_defaults_to_internship(self):
        info = derive_career_stage()
        assert info["stage"] == "internship"

    def test_mba_student_stays_student_unless_professional(self):
        # Enrolled with >12 months to go and 10y experience: userType decides.
        start = CURRENT_YEAR - 10
        exps = [{"title": "Manager", "dates": f"June {start} - Present"}]
        as_student = derive_career_stage(
            months_until_graduation=20, experiences=exps
        )
        as_professional = derive_career_stage(
            months_until_graduation=20, experiences=exps, user_type="professional"
        )
        assert as_student["stage"] != "internship"  # 10y exp blocks internship
        assert as_professional["stage"] in ("mid_level", "senior")


class TestClassifyJobLevel:

    @pytest.mark.parametrize("title,expected", [
        ("Software Engineer Intern", "intern"),
        ("Summer Analyst - Investment Banking", "intern"),
        ("Entry Level Financial Analyst", "entry"),
        ("New Grad Software Engineer", "entry"),
        ("Senior Software Engineer", "senior"),
        ("Staff Engineer", "senior"),
        ("Engineering Manager", "senior"),
        ("Vice President, Product", "executive"),
        ("Managing Director", "executive"),
        ("Chief Financial Officer", "executive"),
        ("Head of Growth", "executive"),
    ])
    def test_title_classification(self, title, expected):
        assert classify_job_level(title) == expected

    def test_silent_title_falls_back_to_description(self):
        assert classify_job_level(
            "Software Engineer", "We want someone with 5+ years experience"
        ) == "mid"

    def test_no_signal_is_unknown(self):
        assert classify_job_level("Software Engineer") == "unknown"


class TestBidirectionalGate:

    def test_student_never_sees_executive_roles(self):
        for stage in ("internship", "new_grad"):
            assert not job_level_allowed(stage, "executive")
            assert not job_level_allowed(stage, "senior")

    def test_executive_never_sees_internships(self):
        for stage in ("mid_level", "senior", "executive"):
            assert not job_level_allowed(stage, "intern")

    def test_unknown_job_level_always_allowed(self):
        for stage in ALLOWED_JOB_LEVELS:
            assert job_level_allowed(stage, "unknown")

    def test_unknown_stage_always_allowed(self):
        assert job_level_allowed("unknown", "executive")

    def test_matrix_is_contiguous(self):
        # Every stage allows a contiguous band of levels: no stage should
        # allow intern and senior while blocking mid.
        order = ["intern", "entry", "mid", "senior", "executive"]
        for stage, allowed in ALLOWED_JOB_LEVELS.items():
            indices = sorted(order.index(a) for a in allowed)
            assert indices == list(range(indices[0], indices[-1] + 1)), stage


class TestExplicitStudentWins:
    """A user who explicitly chose 'Current student' must never be reclassified
    professional by heuristics: emails and job stages stay student-shaped."""

    def test_explicit_student_with_old_grad_year_stays_student(self):
        start = CURRENT_YEAR - 5
        info = derive_career_stage(
            graduation_year=CURRENT_YEAR - 4,
            months_until_graduation=0,
            experiences=[{"title": "Analyst", "dates": f"June {start} - Present"}],
            user_type="student",
        )
        assert info["stage"] in ("internship", "new_grad")
        assert info["is_student"] is True

    def test_explicit_student_enrolled_with_experience_gets_internships(self):
        start = CURRENT_YEAR - 10
        info = derive_career_stage(
            months_until_graduation=20,
            experiences=[{"title": "Manager", "dates": f"June {start} - Present"}],
            user_type="student",
        )
        assert info["stage"] == "internship"
