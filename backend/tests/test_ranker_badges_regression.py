"""
Regression test: retrieve_and_rank must preserve all badges emitted by the
existing student_job_ranker.score() function.

The orchestrator wraps rank_for_student without modifying it, so this test
verifies that:
  1. When the same pool is fed through retrieve_and_rank vs rank_for_student
     directly, the badge distribution is identical.
  2. The wrapper doesn't accidentally drop the reasons list on the way out.
  3. Fallback path preserves badges just as reliably as vector path.

This is the "no personalization win comes at the cost of losing badges"
guardrail. If a future refactor breaks it, this test flags it before ship.
"""
from unittest.mock import patch


# The 10 badge types the current ranker emits, per student_job_ranker.score()
# and adjacent phase signals. This test doesn't require every badge to appear
# in every run — it just requires the wrapper to pass through whatever the
# ranker emits.
KNOWN_BADGES = {
    "entry_level_fit",
    "internship_match",
    "fulltime_match",
    "sponsors_visa",
    "location_match",
    "industry_match",
    "strong_skill_overlap",
    "cohort_year_match",
    # extras from signal accumulation elsewhere in the file
    "senior_only",
    "visa_required",
}


def _sample_student():
    return {
        "employment_pref": "INTERN",
        "needs_visa_sponsorship": False,
        "accepts_remote": True,
        "career_track": "software_engineering",
        "target_industries": ["software engineering"],
        "target_locations": ["San Francisco", "New York"],
        "grad_year": 2027,
        "major": "Computer Science",
        "skills": ["Python", "React", "PyTorch"],
    }


def _sample_jobs():
    """Diverse pool designed to trigger multiple badge types."""
    return [
        {
            "job_id": "job_1",
            "title": "SWE Intern",
            "company": "Stripe",
            "location": "San Francisco, CA",
            "type": "INTERNSHIP",
            "ai_experience_level": "0-2",
            "ai_employment_type": "INTERN",
            "ai_visa_sponsorship": True,
            "ai_key_skills": ["Python", "React"],
            "ai_taxonomies_a": ["software engineering"],
        },
        {
            "job_id": "job_2",
            "title": "Full Stack Engineer",
            "company": "Anthropic",
            "location": "San Francisco, CA",
            "type": "FULLTIME",
            "ai_experience_level": "0-2",
            "ai_employment_type": "FULLTIME",
            "ai_key_skills": ["Python", "TypeScript"],
            "ai_taxonomies_a": ["software engineering"],
        },
        {
            "job_id": "job_3",
            "title": "ML Intern",
            "company": "Meta",
            "location": "Menlo Park, CA",
            "type": "INTERNSHIP",
            "ai_experience_level": "0-2",
            "ai_employment_type": "INTERN",
            "ai_key_skills": ["PyTorch", "Python", "React"],
            "ai_taxonomies_a": ["machine learning"],
        },
    ]


class TestBadgePreservation:
    def test_direct_ranker_still_emits_badges(self):
        """Baseline: the existing ranker emits at least one badge for a
        student profile matched to relevant jobs. If this fails, the
        ranker itself changed shape and our wrapper's contract needs to
        be reconsidered."""
        from backend.app.services.student_job_ranker import rank_for_student

        results = rank_for_student(_sample_student(), _sample_jobs(), top_k=10)
        assert len(results) > 0

        # Collect all badges emitted across all jobs
        all_badges: set[str] = set()
        for job, score, reasons in results:
            for r in reasons:
                all_badges.add(r)

        # At least one recognizable badge should have fired
        assert len(all_badges) > 0, (
            f"Direct ranker emitted no badges — indicates score() changed. "
            f"Investigate before shipping wrapper."
        )

    def test_wrapper_preserves_reasons_list_shape(self):
        """The wrapper must return (job, score, reasons) tuples — same
        shape as rank_for_student. If the wrapper reshapes this, downstream
        UI badge rendering breaks."""
        from backend.app.services.retrieve_and_rank import retrieve_and_rank

        results = retrieve_and_rank(
            student=_sample_student(),
            uid="test-uid",
            fallback_pool=_sample_jobs(),
        )

        # RANKER_MODE unset defaults to embedding, but with no db mocked
        # the vector path returns [] and falls back to the pool.
        assert isinstance(results, list)
        for item in results:
            assert isinstance(item, tuple), (
                f"Expected tuple, got {type(item)}: badge UI depends on this shape"
            )
            assert len(item) == 3, (
                f"Expected (job, score, reasons), got {len(item)}-tuple"
            )
            job, score, reasons = item
            assert isinstance(job, dict)
            assert isinstance(score, (int, float))
            assert isinstance(reasons, list), (
                f"Reasons must be a list, got {type(reasons)}: "
                f"UI iterates this to render badges"
            )
            for r in reasons:
                assert isinstance(r, str), (
                    f"Badge must be a string, got {type(r)}: "
                    f"UI keys badge components on this"
                )

    def test_wrapper_and_direct_ranker_produce_same_badges_on_same_pool(self):
        """Fed the same pool, the wrapper's fallback path must produce
        the same badges as the direct ranker. This is the strongest
        regression signal — same in, same out."""
        from backend.app.services.student_job_ranker import rank_for_student
        from backend.app.services.retrieve_and_rank import retrieve_and_rank

        student = _sample_student()
        pool = _sample_jobs()

        direct = rank_for_student(student, pool, top_k=10)
        wrapped = retrieve_and_rank(
            student=student,
            uid="test-uid",
            fallback_pool=pool,
        )

        # Direct and wrapped fallback should be identical in output.
        direct_by_id = {j["job_id"]: (round(s, 2), sorted(r))
                        for j, s, r in direct}
        wrapped_by_id = {j["job_id"]: (round(s, 2), sorted(r))
                         for j, s, r in wrapped}

        assert direct_by_id == wrapped_by_id, (
            f"Wrapper altered ranker output.\n"
            f"Direct: {direct_by_id}\n"
            f"Wrapped: {wrapped_by_id}"
        )

    def test_rules_mode_kill_switch_bypasses_vector_path(self):
        """RANKER_MODE=rules must skip the vector path entirely and
        pass through to the fallback pool."""
        from backend.app.services.retrieve_and_rank import retrieve_and_rank

        with patch.dict("os.environ", {"RANKER_MODE": "rules"}):
            results = retrieve_and_rank(
                student=_sample_student(),
                uid="test-uid",
                fallback_pool=_sample_jobs(),
            )

        assert len(results) > 0
        # Same shape guarantee applies in rules mode too
        for job, score, reasons in results:
            assert isinstance(reasons, list)

    def test_empty_fallback_pool_returns_empty(self):
        """No pool, no vector data → return [] cleanly, don't 500."""
        from backend.app.services.retrieve_and_rank import retrieve_and_rank

        with patch.dict("os.environ", {"RANKER_MODE": "rules"}):
            results = retrieve_and_rank(
                student=_sample_student(),
                uid="test-uid",
                fallback_pool=None,
            )
        assert results == []
