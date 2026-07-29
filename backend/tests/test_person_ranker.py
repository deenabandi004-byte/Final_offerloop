"""Contract-stability tests for person_ranker.

These lock the shape of the API Rylan's swipe-deck depends on. If any
of these break, the client contract broke — investigate before merging.

Layered so we don't over-couple to Firestore mocking:
  * Pure-function tests (id, response allowlist, diversify) run without
    any db mock — direct calls into person_ranker helpers.
  * Flow-level tests monkeypatch the loaders/scorer so we exercise
    orchestration without a real Firestore fixture.
"""
from datetime import datetime, timezone
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


def test_ranker_excludes_swiped_left_and_skip(monkeypatch):
    """peoplePreferences with signal in (left, skip) drops candidates from
    subsequent decks. swipe-right is excluded elsewhere via
    _already_known_keys (right → saved to contacts → known)."""
    monkeypatch.setattr(pr, "_load_user_context", lambda uid, db: _usc_google_ctx())
    monkeypatch.setattr(pr, "_already_known_keys", lambda uid, db: set())
    # Charlie was left-swiped previously; Dana was skipped; Alice is fresh.
    monkeypatch.setattr(pr, "_swiped_person_ids",
                        lambda uid, db: {"charlie-lee", "dana-park"})

    alice = {
        "FirstName": "Alice", "LastName": "Smith",
        "LinkedIn": "https://linkedin.com/in/alice-smith",
        "Company": "Google", "Title": "SWE", "College": "USC",
        "City": "MV", "State": "CA", "pdlId": "pdl_a",
    }
    charlie = {
        "FirstName": "Charlie", "LastName": "Lee",
        "LinkedIn": "https://linkedin.com/in/charlie-lee",
        "Company": "Google", "Title": "SWE", "College": "USC",
        "City": "MV", "State": "CA", "pdlId": "pdl_c",
    }
    dana = {
        "FirstName": "Dana", "LastName": "Park",
        "LinkedIn": "https://linkedin.com/in/dana-park",
        "Company": "Google", "Title": "SWE", "College": "USC",
        "City": "MV", "State": "CA", "pdlId": "pdl_d",
    }
    monkeypatch.setattr(pr, "_fetch_candidates",
                        lambda user_ctx, db, cap, exclude_keys: [alice, charlie, dana])
    monkeypatch.setattr(pr, "_score_one", lambda ctx, c: {
        "score": 50, "tier": "warm", "reasons": [], "briefing": "",
    })
    result = pr.rank_people_for_user("uid1", db=object(), limit=10)
    ids = [r["person"]["id"] for r in result]
    assert ids == ["alice-smith"]
    assert "charlie-lee" not in ids
    assert "dana-park" not in ids


# ─────────────────────────────────────────────────────────────────────
# HTTP-endpoint tests (feedback + reveal-email + deck_id echo)
# ─────────────────────────────────────────────────────────────────────
#
# Use the same firebase-auth bypass pattern the rest of the codebase
# uses (see tests/test_alumni_discovery.py:_bypass_firebase_auth).
# Firestore is faked via helper builders below; deduct/refund and
# Hunter are patched at their canonical import sites.
# ─────────────────────────────────────────────────────────────────────

from unittest.mock import patch, MagicMock as _MagicMock  # noqa: E402

FAKE_USER = {"uid": "test-uid", "email": "tester@example.com"}


@pytest.fixture(scope="module")
def _app():
    from backend.wsgi import create_app
    app = create_app()
    app.config["TESTING"] = True
    return app


@pytest.fixture
def http_client(_app):
    return _app.test_client()


@pytest.fixture(autouse=False)
def bypass_firebase_auth():
    """Only applied to route-level tests. Existing 14 pure/monkeypatched
    tests don't touch Flask and don't need this."""
    with patch("firebase_admin._apps", {"[DEFAULT]": _MagicMock()}), \
         patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
        yield


def _mk_snap(data, *, exists=True, doc_id="doc"):
    """MagicMock Firestore snapshot."""
    snap = _MagicMock()
    snap.exists = exists
    snap.id = doc_id
    snap.to_dict.return_value = data
    return snap


def _mk_fake_db(*,
                firm_snap=None,
                cache_snap=None,
                writes_log=None):
    """Fake Firestore db supporting the paths the two endpoints touch:
      users/{uid}/revealedEmails/{cid}     — reveal cache
      users/{uid}/peoplePreferences/{cid}  — feedback state
      firm_employees/{cid}                 — reveal firm_employees lookup

    writes_log (optional list) receives (collection_name, payload) tuples
    for every .set() so tests can assert exactly what was written.
    """
    db = _MagicMock()

    # users/{uid}/revealedEmails
    reveal_cache_col = _MagicMock()
    reveal_cache_doc = _MagicMock()
    reveal_cache_doc.get.return_value = cache_snap if cache_snap is not None else _mk_snap({}, exists=False)
    if writes_log is not None:
        def _log_cache_set(payload):
            writes_log.append(("revealedEmails", payload))
            return _MagicMock()
        reveal_cache_doc.set.side_effect = _log_cache_set
    reveal_cache_col.document.return_value = reveal_cache_doc

    # users/{uid}/peoplePreferences
    prefs_col = _MagicMock()
    prefs_doc = _MagicMock()
    if writes_log is not None:
        def _log_prefs_set(payload):
            writes_log.append(("peoplePreferences", payload))
            return _MagicMock()
        prefs_doc.set.side_effect = _log_prefs_set
    prefs_col.document.return_value = prefs_doc

    def user_subcollection(name):
        return {
            "revealedEmails":     reveal_cache_col,
            "peoplePreferences":  prefs_col,
        }.get(name, _MagicMock())

    user_doc_ref = _MagicMock()
    user_doc_ref.collection.side_effect = user_subcollection

    users_col = _MagicMock()
    users_col.document.return_value = user_doc_ref

    # firm_employees/{cid}
    firm_col = _MagicMock()
    firm_col.document.return_value.get.return_value = firm_snap if firm_snap is not None else _mk_snap({}, exists=False)

    def root_collection(name):
        return {
            "users":           users_col,
            "firm_employees":  firm_col,
        }.get(name, _MagicMock())

    db.collection.side_effect = root_collection
    return db


# ── Feedback endpoint ─────────────────────────────────────────────────


class TestFeedback:

    def _post(self, http_client, body):
        return http_client.post(
            "/api/ranker/feedback",
            json=body,
            headers={"Authorization": "Bearer fake"},
        )

    def test_missing_candidate_id_400(self, http_client, bypass_firebase_auth):
        with patch("backend.app.routes.ranker.get_db", return_value=_mk_fake_db()):
            r = self._post(http_client, {"signal": "right", "deck_id": "d1", "rank": 0})
        assert r.status_code == 400
        assert "candidate_id" in r.get_json()["error"]

    def test_bad_signal_400(self, http_client, bypass_firebase_auth):
        with patch("backend.app.routes.ranker.get_db", return_value=_mk_fake_db()):
            r = self._post(http_client, {"candidate_id": "a", "signal": "up",
                                         "deck_id": "d1", "rank": 0})
        assert r.status_code == 400
        assert "signal" in r.get_json()["error"]

    def test_missing_deck_id_400(self, http_client, bypass_firebase_auth):
        with patch("backend.app.routes.ranker.get_db", return_value=_mk_fake_db()):
            r = self._post(http_client, {"candidate_id": "a", "signal": "right", "rank": 0})
        assert r.status_code == 400
        assert "deck_id" in r.get_json()["error"]

    def test_missing_rank_400(self, http_client, bypass_firebase_auth):
        with patch("backend.app.routes.ranker.get_db", return_value=_mk_fake_db()):
            r = self._post(http_client, {"candidate_id": "a", "signal": "right",
                                         "deck_id": "d1"})
        assert r.status_code == 400
        assert "rank" in r.get_json()["error"]

    def test_negative_rank_400(self, http_client, bypass_firebase_auth):
        with patch("backend.app.routes.ranker.get_db", return_value=_mk_fake_db()):
            r = self._post(http_client, {"candidate_id": "a", "signal": "right",
                                         "deck_id": "d1", "rank": -1})
        assert r.status_code == 400
        assert "rank" in r.get_json()["error"]

    def test_writes_both_prefs_and_event(self, http_client, bypass_firebase_auth):
        writes = []
        db = _mk_fake_db(writes_log=writes)
        logged = []

        def _fake_log(**kwargs):
            logged.append(kwargs)

        with patch("backend.app.routes.ranker.get_db", return_value=db), \
             patch("backend.app.routes.ranker.log_recommendation_event", side_effect=_fake_log):
            r = self._post(http_client, {
                "candidate_id": "alice-smith",
                "signal":       "right",
                "deck_id":      "deck123",
                "rank":         3,
                "score":        63,
                "tier":         "warm",
                "reasons":      [{"type": "alumni"}],
                "briefing":     "Went to USC like you.",
            })
        assert r.status_code == 200
        assert r.get_json() == {"ok": True}

        # peoplePreferences write happened
        prefs_writes = [w for w in writes if w[0] == "peoplePreferences"]
        assert len(prefs_writes) == 1
        payload = prefs_writes[0][1]
        assert payload["candidate_id"] == "alice-smith"
        assert payload["signal"] == "right"
        assert payload["last_deck_id"] == "deck123"
        assert payload["last_rank"] == 3

        # recommendation_event logged
        assert len(logged) == 1
        ev = logged[0]
        assert ev["event_type"] == "person_swipe_right"
        assert ev["contact_id"] == "alice-smith"
        assert ev["rank"] == 3
        assert ev["score"] == 63.0
        assert ev["features_snapshot"]["tier"] == "warm"
        assert ev["features_snapshot"]["warmth_signals"] == [{"type": "alumni"}]
        assert ev["features_snapshot"]["deck_id"] == "deck123"
        assert ev["extra"] == {"signal": "right"}

    def test_deterministic_doc_id_shape(self, http_client, bypass_firebase_auth):
        """doc_id = person_swipe_{deck_id}_{candidate_id} — at-least-once safe."""
        logged = []
        with patch("backend.app.routes.ranker.get_db", return_value=_mk_fake_db()), \
             patch("backend.app.routes.ranker.log_recommendation_event",
                   side_effect=lambda **kw: logged.append(kw)):
            self._post(http_client, {
                "candidate_id": "alice-smith", "signal": "left",
                "deck_id": "deck_xyz", "rank": 5,
            })
        assert logged[0]["doc_id"] == "person_swipe_deck_xyz_alice-smith"
        assert logged[0]["event_type"] == "person_swipe_left"


# ── Reveal endpoint ───────────────────────────────────────────────────


class TestRevealEmail:

    _FIRM_SNAP = None  # set in _setup

    @staticmethod
    def _firm_snap():
        return _mk_snap({
            "first_name":      "Alice",
            "last_name":       "Smith",
            "company_display": "Google",
        }, exists=True, doc_id="alice-smith")

    @staticmethod
    def _hunter_result(*, email="alice@google.com", verified=False,
                       source="hunter_finder", score=95):
        return {
            "email":          email,
            "email_verified": verified,
            "email_source":   source,
            "score":          score,
        }

    def _post(self, http_client, cid="alice-smith", body=None):
        return http_client.post(
            f"/api/ranker/candidates/{cid}/reveal-email",
            json=body or {},
            headers={"Authorization": "Bearer fake"},
        )

    def test_cache_hit_no_deduct_no_hunter(self, http_client, bypass_firebase_auth):
        """Fresh cache returns cached email, does NOT hit Hunter, does NOT
        deduct. Idempotent-per-uid, protects against client retry double-charge."""
        # Build a cache snap with revealed_at = now (within TTL)
        now_iso = datetime.now(timezone.utc).isoformat()
        cache_snap = _mk_snap({
            "candidate_id": "alice-smith",
            "email":        "alice@google.com",
            "verified":     True,
            "source":       "hunter_finder",
            "confidence":   95,
            "revealed_at":  now_iso,
        }, exists=True)

        deduct_calls = []
        hunter_calls = []
        with patch("backend.app.routes.ranker.get_db",
                   return_value=_mk_fake_db(cache_snap=cache_snap)), \
             patch("app.services.auth.deduct_credits_atomic",
                   side_effect=lambda *a, **k: deduct_calls.append(a) or (True, 100)), \
             patch("app.services.hunter.get_verified_email",
                   side_effect=lambda *a, **k: hunter_calls.append(a) or self._hunter_result()):
            r = self._post(http_client)

        assert r.status_code == 200
        j = r.get_json()
        assert j["email"] == "alice@google.com"
        assert j["cached"] is True
        assert j["charged"] is False
        assert deduct_calls == []
        assert hunter_calls == []

    def test_unknown_candidate_404_no_deduct(self, http_client, bypass_firebase_auth):
        """firm_employees miss → 404, no deduction."""
        deduct_calls = []
        db = _mk_fake_db(firm_snap=_mk_snap({}, exists=False))
        with patch("backend.app.routes.ranker.get_db", return_value=db), \
             patch("app.services.auth.deduct_credits_atomic",
                   side_effect=lambda *a, **k: deduct_calls.append(a) or (True, 100)):
            r = self._post(http_client, cid="nobody")
        assert r.status_code == 404
        assert deduct_calls == []

    def test_insufficient_credits_402_no_hunter(self, http_client, bypass_firebase_auth):
        """Deduct fails → 402, Hunter never called."""
        hunter_calls = []
        db = _mk_fake_db(firm_snap=self._firm_snap())
        with patch("backend.app.routes.ranker.get_db", return_value=db), \
             patch("app.services.auth.deduct_credits_atomic",
                   return_value=(False, 3)), \
             patch("app.services.hunter.get_verified_email",
                   side_effect=lambda *a, **k: hunter_calls.append(a) or self._hunter_result()):
            r = self._post(http_client)
        assert r.status_code == 402
        j = r.get_json()
        assert j["error"] == "insufficient_credits"
        assert j["required"] == 8
        assert j["have"] == 3
        assert hunter_calls == []

    def test_cache_miss_charges_and_caches(self, http_client, bypass_firebase_auth):
        """Happy path: cache miss → deduct → Hunter verified → cache write +
        event fire → return charged=True."""
        writes = []
        db = _mk_fake_db(firm_snap=self._firm_snap(), writes_log=writes)
        deduct_calls = []
        refund_calls = []
        events = []

        with patch("backend.app.routes.ranker.get_db", return_value=db), \
             patch("app.services.auth.deduct_credits_atomic",
                   side_effect=lambda *a, **k: deduct_calls.append(a) or (True, 42)), \
             patch("app.services.auth.refund_credits_atomic",
                   side_effect=lambda *a, **k: refund_calls.append(a) or (True, 50)), \
             patch("app.services.hunter.get_verified_email",
                   return_value=self._hunter_result(verified=True, score=95)), \
             patch("backend.app.routes.ranker.log_recommendation_event",
                   side_effect=lambda **kw: events.append(kw)):
            r = self._post(http_client, body={"deck_id": "deck_abc"})

        assert r.status_code == 200
        j = r.get_json()
        assert j["email"] == "alice@google.com"
        assert j["verified"] is True
        assert j["charged"] is True
        assert j["cached"] is False
        # Deducted, NOT refunded
        assert len(deduct_calls) == 1
        assert refund_calls == []
        # revealedEmails cache write
        cache_writes = [w for w in writes if w[0] == "revealedEmails"]
        assert len(cache_writes) == 1
        assert cache_writes[0][1]["email"] == "alice@google.com"
        # email_revealed event
        assert len(events) == 1
        ev = events[0]
        assert ev["event_type"] == "email_revealed"
        assert ev["contact_id"] == "alice-smith"
        assert ev["doc_id"] == "email_revealed_test-uid_alice-smith"
        assert ev["features_snapshot"]["deck_id"] == "deck_abc"
        assert ev["extra"] == {"cost_credits": 8}

    def test_verified_true_charges_regardless_of_confidence(self, http_client, bypass_firebase_auth):
        """email_verified=True is Hunter's SMTP deliverability check —
        always charge, even with confidence=0."""
        db = _mk_fake_db(firm_snap=self._firm_snap())
        refund_calls = []
        with patch("backend.app.routes.ranker.get_db", return_value=db), \
             patch("app.services.auth.deduct_credits_atomic",
                   return_value=(True, 42)), \
             patch("app.services.auth.refund_credits_atomic",
                   side_effect=lambda *a, **k: refund_calls.append(a) or (True, 50)), \
             patch("app.services.hunter.get_verified_email",
                   return_value=self._hunter_result(verified=True, score=0)), \
             patch("backend.app.routes.ranker.log_recommendation_event"):
            r = self._post(http_client)
        assert r.status_code == 200
        assert r.get_json()["charged"] is True
        assert refund_calls == []

    def test_below_confidence_threshold_refunds(self, http_client, bypass_firebase_auth):
        """confidence < 90 AND verified=False → refund, charged=False."""
        db = _mk_fake_db(firm_snap=self._firm_snap())
        refund_calls = []
        events = []
        with patch("backend.app.routes.ranker.get_db", return_value=db), \
             patch("app.services.auth.deduct_credits_atomic",
                   return_value=(True, 42)), \
             patch("app.services.auth.refund_credits_atomic",
                   side_effect=lambda *a, **k: refund_calls.append(a) or (True, 50)), \
             patch("app.services.hunter.get_verified_email",
                   return_value=self._hunter_result(verified=False, score=85)), \
             patch("backend.app.routes.ranker.log_recommendation_event",
                   side_effect=lambda **kw: events.append(kw)):
            r = self._post(http_client)
        assert r.status_code == 200
        j = r.get_json()
        assert j["charged"] is False
        assert j["reason"] == "below_confidence_threshold"
        assert j["email"] == "alice@google.com"
        assert j["confidence"] == 85
        # Refund fired
        assert len(refund_calls) == 1
        # No email_revealed event on refund path
        assert events == []

    def test_no_email_found_refunds(self, http_client, bypass_firebase_auth):
        """Hunter returned no email → refund, reason=no_email_found."""
        db = _mk_fake_db(firm_snap=self._firm_snap())
        refund_calls = []
        with patch("backend.app.routes.ranker.get_db", return_value=db), \
             patch("app.services.auth.deduct_credits_atomic",
                   return_value=(True, 42)), \
             patch("app.services.auth.refund_credits_atomic",
                   side_effect=lambda *a, **k: refund_calls.append(a) or (True, 50)), \
             patch("app.services.hunter.get_verified_email",
                   return_value=self._hunter_result(email="", verified=False, source="", score=0)), \
             patch("backend.app.routes.ranker.log_recommendation_event"):
            r = self._post(http_client)
        j = r.get_json()
        assert j["charged"] is False
        assert j["reason"] == "no_email_found"
        assert len(refund_calls) == 1

    def test_hunter_exception_refunds_provider_error(self, http_client, bypass_firebase_auth):
        """Hunter API exception → refund (safely), provider_error response."""
        db = _mk_fake_db(firm_snap=self._firm_snap())
        refund_calls = []
        with patch("backend.app.routes.ranker.get_db", return_value=db), \
             patch("app.services.auth.deduct_credits_atomic",
                   return_value=(True, 42)), \
             patch("app.services.auth.refund_credits_atomic",
                   side_effect=lambda *a, **k: refund_calls.append(a) or (True, 50)), \
             patch("app.services.hunter.get_verified_email",
                   side_effect=RuntimeError("hunter down")), \
             patch("backend.app.routes.ranker.log_recommendation_event"):
            r = self._post(http_client)
        j = r.get_json()
        assert r.status_code == 200
        assert j["charged"] is False
        assert j["reason"] == "provider_error"
        assert len(refund_calls) == 1


# ── deck_id echo on GET /candidates ──────────────────────────────────


def test_candidates_response_includes_deck_id(http_client, bypass_firebase_auth):
    """New top-level `deck_id` field. Purely additive — the strict-equality
    allowlist tests target person.keys() (nested), so this doesn't churn them."""
    with patch("backend.app.routes.ranker.get_db", return_value=_MagicMock()), \
         patch("backend.app.routes.ranker.rank_people_for_user", return_value=[]):
        r = http_client.get(
            "/api/ranker/candidates?limit=10",
            headers={"Authorization": "Bearer fake"},
        )
    assert r.status_code == 200
    j = r.get_json()
    assert "deck_id" in j
    assert isinstance(j["deck_id"], str) and len(j["deck_id"]) >= 8
