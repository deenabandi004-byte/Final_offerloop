"""Contract-stability tests for person_ranker.

These lock the shape of the API Rylan's swipe-deck depends on. If any
of these break, the client contract broke — investigate before merging.

Layered so we don't over-couple to Firestore mocking:
  * Pure-function tests (id, response allowlist, diversify) run without
    any db mock — direct calls into person_ranker helpers.
  * Flow-level tests monkeypatch the loaders/scorer so we exercise
    orchestration without a real Firestore fixture.
"""
from unittest.mock import MagicMock

import pytest

from app.services import person_ranker as pr


# ─────────────────────────────────────────────────────────────────────
# Pure-function tests
# ─────────────────────────────────────────────────────────────────────


def test_candidate_id_prefers_linkedin_slug():
    c = {
        "LinkedIn": "https://www.linkedin.com/in/alice-smith/",
        "pdlId": "pdl_1",
    }
    assert pr._candidate_id(c) == "alice-smith"


def test_candidate_id_falls_back_to_pdl_id():
    c = {"LinkedIn": "", "pdlId": "pdl_123"}
    assert pr._candidate_id(c) == "pdl_123"


def test_candidate_id_returns_none_when_both_missing():
    c = {"LinkedIn": "", "pdlId": ""}
    assert pr._candidate_id(c) is None


def test_candidate_id_returns_none_when_linkedin_unparseable_and_no_pdl():
    c = {"LinkedIn": "not-a-linkedin-url", "pdlId": ""}
    assert pr._candidate_id(c) is None


def test_to_response_dict_allowlist_excludes_arbitrary_keys():
    """Response `person` must contain ONLY the allowlisted keys, even if
    upstream firm_employees ever grows sensitive fields."""
    scored = {
        "id": "alice-smith",
        "candidate": {
            "FirstName": "Alice", "LastName": "Smith",
            "LinkedIn": "https://linkedin.com/in/alice-smith",
            "Company": "Google", "Title": "SWE", "College": "USC",
            "City": "Mountain View", "State": "CA", "pdlId": "pdl_1",
            # These must NOT flow through even if they somehow appear
            # on the candidate dict:
            "sex": "F",
            "birth_date": "1990-01-01",
            "birth_year": 1990,
            "phone_numbers": ["555-1234"],
            "raw_pdl_person": {"any": "junk"},
        },
        "score": 63, "tier": "warm", "reasons": [], "briefing": "test",
    }
    out = pr._to_response_dict(scored)
    person = out["person"]
    expected_keys = {
        "id", "firstName", "lastName", "linkedinUrl", "pdlId",
        "company", "title", "college", "city", "state",
    }
    assert set(person.keys()) == expected_keys
    for forbidden in ("sex", "birth_date", "birth_year", "phone_numbers",
                      "raw_pdl_person"):
        assert forbidden not in person


def test_diversify_caps_same_company():
    """20 identical-score Google engineers + 20 non-Google → top-10 has
    ≤ 4 Google. Exercises LAMBDA_COMPANY quadratic penalty."""
    scored = []
    for i in range(20):
        scored.append({
            "score": 100 - i,
            "candidate": {"Company": "Google", "Title": "Software Engineer"},
            "tier": "warm", "reasons": [], "briefing": "",
            "id": f"g{i}",
        })
    for i in range(20):
        scored.append({
            "score": 100 - i,
            "candidate": {"Company": f"Firm{i}", "Title": "Analyst"},
            "tier": "neutral", "reasons": [], "briefing": "",
            "id": f"f{i}",
        })
    picked = pr._diversify_people(scored, k=10)
    google_count = sum(
        1 for p in picked if p["candidate"]["Company"] == "Google"
    )
    assert google_count <= 4, f"Diversify allowed {google_count} Google picks in top 10"


def test_diversify_returns_empty_for_empty_input():
    assert pr._diversify_people([], k=10) == []


def test_diversify_returns_all_when_k_exceeds_input():
    scored = [
        {"score": 50, "candidate": {"Company": "X", "Title": "PM"},
         "tier": "neutral", "reasons": [], "briefing": "", "id": "a"},
        {"score": 40, "candidate": {"Company": "Y", "Title": "SWE"},
         "tier": "neutral", "reasons": [], "briefing": "", "id": "b"},
    ]
    assert len(pr._diversify_people(scored, k=100)) == 2


# ─────────────────────────────────────────────────────────────────────
# Flow-level tests (monkeypatched loaders + scorer)
# ─────────────────────────────────────────────────────────────────────


def _empty_ctx(uid: str = "uid1") -> dict:
    """Sparse profile — no dreamCompanies AND no school."""
    return {
        "uid": uid, "profile": {}, "resume_parsed": {},
        "comparison": {}, "normalized_user": MagicMock(),
        "dream_company_slugs": [], "school_slugs": [],
    }


def _usc_google_ctx(uid: str = "uid1") -> dict:
    return {
        "uid": uid, "profile": {}, "resume_parsed": {},
        "comparison": {"university": "usc"},
        "normalized_user": MagicMock(),
        "dream_company_slugs": ["google"], "school_slugs": ["usc"],
    }


def test_returns_empty_on_sparse_profile(monkeypatch):
    """Empty deck (not 500) when profile lacks pool-signal fields."""
    monkeypatch.setattr(pr, "_load_user_context", lambda uid, db: _empty_ctx())
    result = pr.rank_people_for_user("uid1", db=object(), limit=10)
    assert result == []


def test_returns_empty_when_pool_has_no_hits(monkeypatch):
    """Signals present but firm_employees returns nothing → empty deck."""
    monkeypatch.setattr(pr, "_load_user_context", lambda uid, db: _usc_google_ctx())
    monkeypatch.setattr(pr, "_already_known_keys", lambda uid, db: set())
    monkeypatch.setattr(pr, "_fetch_candidates",
                        lambda user_ctx, db, cap, exclude_keys: [])
    result = pr.rank_people_for_user("uid1", db=object(), limit=10)
    assert result == []


def test_excludes_already_known_contacts(monkeypatch):
    """Exclude keys flow through to _fetch_candidates."""
    known_before = {("alice", "smith", "google")}
    monkeypatch.setattr(pr, "_load_user_context", lambda uid, db: _usc_google_ctx())
    monkeypatch.setattr(pr, "_already_known_keys", lambda uid, db: known_before)

    captured = {}

    def fake_fetch(user_ctx, db, cap, exclude_keys):
        captured["set"] = exclude_keys
        return []

    monkeypatch.setattr(pr, "_fetch_candidates", fake_fetch)
    pr.rank_people_for_user("uid1", db=object(), limit=10)
    assert captured["set"] == known_before


def test_drops_candidates_without_stable_id(monkeypatch):
    """A candidate with no LinkedIn AND no pdlId gets dropped, not
    returned with id=None (which would break Rylan's render key)."""
    monkeypatch.setattr(pr, "_load_user_context", lambda uid, db: _usc_google_ctx())
    monkeypatch.setattr(pr, "_already_known_keys", lambda uid, db: set())

    ided = {
        "FirstName": "Alice", "LastName": "Smith",
        "LinkedIn": "https://linkedin.com/in/alice-smith",
        "pdlId": "", "Company": "Google", "Title": "SWE",
        "College": "USC", "City": "MV", "State": "CA",
    }
    id_less = {
        "FirstName": "Ghost", "LastName": "Person",
        "LinkedIn": "", "pdlId": "",
        "Company": "Google", "Title": "SWE",
        "College": "USC", "City": "MV", "State": "CA",
    }
    monkeypatch.setattr(pr, "_fetch_candidates",
                        lambda user_ctx, db, cap, exclude_keys: [ided, id_less])
    # Stub scorer so we don't hit the real warmth pipeline in this
    # test's tight loop — the id-drop is what we're asserting.
    monkeypatch.setattr(pr, "_score_one", lambda ctx, c: {
        "score": 50, "tier": "warm", "reasons": [], "briefing": "",
    })
    result = pr.rank_people_for_user("uid1", db=object(), limit=10)
    ids = [r["person"]["id"] for r in result]
    assert ids == ["alice-smith"]
    # No returned person should have id=None or empty
    assert all(r["person"]["id"] for r in result)


def test_response_contract_shape(monkeypatch):
    """One-shot smoke: every candidate returned has the full contract
    shape Rylan reads."""
    monkeypatch.setattr(pr, "_load_user_context", lambda uid, db: _usc_google_ctx())
    monkeypatch.setattr(pr, "_already_known_keys", lambda uid, db: set())
    monkeypatch.setattr(pr, "_fetch_candidates",
                        lambda user_ctx, db, cap, exclude_keys: [{
                            "FirstName": "Alice", "LastName": "Smith",
                            "LinkedIn": "https://linkedin.com/in/alice-smith",
                            "Company": "Google", "Title": "SWE",
                            "College": "USC", "City": "MV", "State": "CA",
                            "pdlId": "pdl_1",
                        }])
    monkeypatch.setattr(pr, "_score_one", lambda ctx, c: {
        "score": 63, "tier": "warm",
        "reasons": [{"type": "alumni", "hook": "USC alum like you"}],
        "briefing": "Went to USC like you.",
    })
    result = pr.rank_people_for_user("uid1", db=object(), limit=10)
    assert len(result) == 1
    item = result[0]
    assert set(item.keys()) == {"person", "score", "tier", "reasons", "briefing"}
    assert set(item["person"].keys()) == {
        "id", "firstName", "lastName", "linkedinUrl", "pdlId",
        "company", "title", "college", "city", "state",
    }
    assert item["person"]["id"] == "alice-smith"
    assert isinstance(item["score"], int)
    assert item["tier"] in ("warm", "neutral", "cold")
    assert isinstance(item["reasons"], list)
    assert isinstance(item["briefing"], str)


def test_alumni_ranks_above_stranger_via_real_scorer(monkeypatch):
    """End-to-end through the real warmth/personalization scoring —
    USC alum outranks a Michigan alum, all else equal.

    This exercises the actual imports (warmth_scoring.compute_warmth_score,
    personalization.build_contact_profile / _detect_all_signals). If the
    upstream helpers change shape, this test flags it.
    """
    monkeypatch.setattr(pr, "_load_user_context",
                        lambda uid, db: pr._load_user_context.__wrapped__(uid, db)
                        if hasattr(pr._load_user_context, "__wrapped__")
                        else {
                            "uid": uid, "profile": {
                                "academics": {"school": "University of Southern California"},
                                "goals": {"dreamCompanies": [{"name": "Google"}]},
                            },
                            "resume_parsed": {},
                            "comparison": pr._build_user_comparison_data({
                                "academics": {"school": "University of Southern California"},
                                "goals": {"dreamCompanies": [{"name": "Google"}]},
                            }),
                            "normalized_user": pr.build_user_profile(
                                resume_parsed={},
                                user_profile={
                                    "academics": {"school": "University of Southern California"},
                                    "goals": {"dreamCompanies": [{"name": "Google"}]},
                                },
                                personal_note="",
                                dream_companies=["Google"],
                            ),
                            "dream_company_slugs": ["google"],
                            "school_slugs": ["usc"],
                        })
    monkeypatch.setattr(pr, "_already_known_keys", lambda uid, db: set())

    alice_usc = {
        "FirstName": "Alice", "LastName": "Smith",
        "LinkedIn": "https://linkedin.com/in/alice-smith",
        "Company": "Google", "Title": "Software Engineer",
        "College": "University of Southern California",
        "EducationTop": "University of Southern California - BS Computer Science (2018 - 2022)",
        "City": "Mountain View", "State": "CA", "pdlId": "pdl_alice",
    }
    bob_michigan = {
        "FirstName": "Bob", "LastName": "Jones",
        "LinkedIn": "https://linkedin.com/in/bob-jones",
        "Company": "Google", "Title": "Software Engineer",
        "College": "University of Michigan",
        "EducationTop": "University of Michigan - BS Computer Science (2018 - 2022)",
        "City": "Mountain View", "State": "CA", "pdlId": "pdl_bob",
    }
    monkeypatch.setattr(pr, "_fetch_candidates",
                        lambda user_ctx, db, cap, exclude_keys: [alice_usc, bob_michigan])
    result = pr.rank_people_for_user("uid1", db=object(), limit=10)
    assert len(result) == 2
    # Alice (USC alum matching user's USC) should score higher than Bob
    assert result[0]["person"]["id"] == "alice-smith", (
        f"Expected Alice (USC alum) first, got: "
        f"{[r['person']['id'] for r in result]} with scores "
        f"{[r['score'] for r in result]}"
    )
