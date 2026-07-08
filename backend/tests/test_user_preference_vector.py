"""Unit tests for user_preference_vector.py.

Focus:
  - compose_preference_text emits all present signals
  - Missing signals are silently dropped (fail-soft, partial vectors OK)
  - Hash-based caching short-circuits duplicate calls
  - LLM/embed failure returns None cleanly
"""
from unittest.mock import MagicMock, patch


EMBEDDING_DIM = 1536


def _sample_profile_full():
    return {
        "onboardingExtract": {
            "status": "ok",
            "top_skills": ["Python", "PyTorch", "React"],
            "target_industries": ["software engineering", "ML research"],
            "seniority": "intern",
        },
        "onboardingTasteTest": {
            "liked_job_ids": ["job_a", "job_b", "job_c"],
        },
        "resumeParsed": {
            "education": {
                "major": "Computer Science",
                "school": "UC Berkeley",
            },
            "experience": [
                {"title": "SWE Intern", "company": "Stripe"},
            ],
        },
        "goals": {
            "careerTrack": "Software Engineering",
            "careerInterests": ["ML", "Systems"],
        },
    }


class TestComposePreferenceText:
    def test_emits_seniority_expansion_for_intern(self):
        from backend.app.services import user_preference_vector as mod

        text = mod.compose_preference_text({
            "onboardingExtract": {"seniority": "intern"}
        })
        assert "student" in text.lower() or "intern" in text.lower()

    def test_emits_seniority_expansion_for_new_grad(self):
        from backend.app.services import user_preference_vector as mod

        text = mod.compose_preference_text({
            "onboardingExtract": {"seniority": "new_grad"}
        })
        assert "new grad" in text.lower() or "graduating" in text.lower()

    def test_drops_unknown_seniority(self):
        from backend.app.services import user_preference_vector as mod

        text = mod.compose_preference_text({
            "onboardingExtract": {"seniority": "senior"}
        })
        # Should not have any seniority expansion since "senior" is unknown
        assert "student" not in text.lower()
        assert "new grad" not in text.lower()

    def test_top_skills_appear_in_output(self):
        from backend.app.services import user_preference_vector as mod

        text = mod.compose_preference_text({
            "onboardingExtract": {
                "top_skills": ["Python", "PyTorch", "React"],
            }
        })
        assert "Python" in text
        assert "PyTorch" in text
        assert "React" in text

    def test_target_industries_appear_in_output(self):
        from backend.app.services import user_preference_vector as mod

        text = mod.compose_preference_text({
            "onboardingExtract": {
                "target_industries": ["software engineering", "consulting"],
            }
        })
        assert "software engineering" in text
        assert "consulting" in text

    def test_empty_profile_returns_empty_text(self):
        from backend.app.services import user_preference_vector as mod

        assert mod.compose_preference_text({}) == ""

    def test_partial_profile_still_produces_text(self):
        """Missing onboardingExtract shouldn't wipe resume signal."""
        from backend.app.services import user_preference_vector as mod

        text = mod.compose_preference_text({
            "resumeParsed": {
                "education": {"major": "Economics", "school": "NYU"},
            },
        })
        assert "Economics" in text or "Major" in text
        assert "NYU" in text

    def test_liked_job_ids_lookup_survives_db_failure(self):
        from backend.app.services import user_preference_vector as mod

        mock_db = MagicMock()
        mock_db.get_all.side_effect = RuntimeError("firestore down")

        text = mod.compose_preference_text({
            "onboardingTasteTest": {"liked_job_ids": ["job_a", "job_b"]},
            "onboardingExtract": {"top_skills": ["Python"]},
        }, db=mock_db)
        # Should still contain the top_skills line, just no "Roles I like:"
        assert "Python" in text
        assert "Roles I like" not in text

    def test_liked_job_ids_expansion_produces_role_summary(self):
        from backend.app.services import user_preference_vector as mod

        mock_db = MagicMock()
        docs = []
        for title, company, jid in [
            ("SWE Intern", "Stripe", "job_a"),
            ("ML Intern", "Anthropic", "job_b"),
        ]:
            d = MagicMock()
            d.exists = True
            d.to_dict.return_value = {"title": title, "company": company}
            d.id = jid
            docs.append(d)
        mock_db.get_all.return_value = docs

        text = mod.compose_preference_text({
            "onboardingTasteTest": {"liked_job_ids": ["job_a", "job_b"]},
        }, db=mock_db)
        assert "Roles I like" in text
        assert "SWE Intern @ Stripe" in text
        assert "ML Intern @ Anthropic" in text

    def test_goals_career_track_appears(self):
        from backend.app.services import user_preference_vector as mod

        text = mod.compose_preference_text({
            "goals": {
                "careerTrack": "Investment Banking",
                "careerInterests": ["M&A", "Trading"],
            }
        })
        assert "Investment Banking" in text
        assert "M&A" in text

    def test_full_profile_hits_all_sections(self):
        from backend.app.services import user_preference_vector as mod

        mock_db = MagicMock()
        mock_db.get_all.return_value = []  # skip taste-test lookup
        profile = _sample_profile_full()

        text = mod.compose_preference_text(profile, db=mock_db)
        # Seniority
        assert "student" in text.lower()
        # Industries
        assert "software engineering" in text
        # Skills
        assert "Python" in text
        # Career track
        assert "Software Engineering" in text
        # Major
        assert "Computer Science" in text
        # Recent experience
        assert "SWE Intern" in text


class TestGetPreferenceVector:
    def test_returns_none_when_no_text_to_embed(self):
        from backend.app.services import user_preference_vector as mod

        result = mod.get_preference_vector("uid_1", {}, db=MagicMock())
        assert result is None

    def test_returns_cached_when_hash_matches(self):
        from backend.app.services import user_preference_vector as mod
        from backend.app.utils.embedding_ranker import EMBEDDING_DIM

        # Build a profile where compose_preference_text is deterministic
        profile = {
            "onboardingExtract": {"top_skills": ["Python"]},
        }
        expected_text = mod.compose_preference_text(profile)
        expected_hash = mod._hash(expected_text)

        cached_vec = [0.5] * EMBEDDING_DIM
        profile["preferenceVector"] = cached_vec
        profile["preferenceVectorHash"] = expected_hash

        # No embed should happen — we don't patch _embed_batch, so if it
        # ran, it'd error trying to reach OpenAI in the test env.
        result = mod.get_preference_vector("uid_1", profile, db=MagicMock())
        assert result == cached_vec

    def test_computes_and_caches_when_no_cache(self):
        from backend.app.services import user_preference_vector as mod
        from backend.app.utils.embedding_ranker import EMBEDDING_DIM

        profile = {"onboardingExtract": {"top_skills": ["Python"]}}
        fake_emb = [0.1] * EMBEDDING_DIM

        mock_db = MagicMock()

        with patch(
            "backend.app.utils.embedding_ranker._embed_batch",
            return_value=[fake_emb],
        ):
            result = mod.get_preference_vector("uid_1", profile, db=mock_db)

        assert result == fake_emb
        # Verify it tried to persist
        mock_db.collection.return_value.document.return_value.update.assert_called_once()

    def test_returns_none_when_embed_fails(self):
        from backend.app.services import user_preference_vector as mod

        profile = {"onboardingExtract": {"top_skills": ["Python"]}}

        with patch(
            "backend.app.utils.embedding_ranker._embed_batch",
            return_value=[None],
        ):
            result = mod.get_preference_vector("uid_1", profile, db=MagicMock())
        assert result is None

    def test_survives_persist_failure_and_still_returns_vector(self):
        """If Firestore write fails, we still return the freshly-computed vec."""
        from backend.app.services import user_preference_vector as mod
        from backend.app.utils.embedding_ranker import EMBEDDING_DIM

        profile = {"onboardingExtract": {"top_skills": ["Python"]}}
        fake_emb = [0.2] * EMBEDDING_DIM

        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value.update.side_effect = \
            RuntimeError("firestore down")

        with patch(
            "backend.app.utils.embedding_ranker._embed_batch",
            return_value=[fake_emb],
        ):
            result = mod.get_preference_vector("uid_1", profile, db=mock_db)

        assert result == fake_emb


class TestSeniorityExpansion:
    def test_all_valid_values_produce_text(self):
        from backend.app.services.user_preference_vector import _seniority_expansion

        for s in ["intern", "new_grad", "junior"]:
            assert _seniority_expansion(s) != ""

    def test_none_returns_empty(self):
        from backend.app.services.user_preference_vector import _seniority_expansion

        assert _seniority_expansion(None) == ""

    def test_unknown_returns_empty(self):
        from backend.app.services.user_preference_vector import _seniority_expansion

        assert _seniority_expansion("senior") == ""
        assert _seniority_expansion("") == ""
