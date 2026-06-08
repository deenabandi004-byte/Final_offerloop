"""
cohort_assignment — sticky A/B cohort tests.

Two contracts that matter most:
  1. Sticky: same uid → same cohort across calls.
  2. Persisted: first call writes; second call short-circuits on the read.

Distribution properties are tested with synthesized uids — keep these
tests deterministic, no randomness, no real Firestore.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services import cohort_assignment
from app.services.cohort_assignment import (
    LOOPS_SETUP_V2_FLAG,
    _classify,
    _hash_bucket,
    _rollout_pct,
    get_or_assign,
)


# ── Helpers ──────────────────────────────────────────────────────────────


class FakeDoc:
    def __init__(self):
        self.exists = False
        self._data: dict = {}
        self._writes: list[dict] = []

    def get(self):
        return self  # snap and ref look the same here

    def to_dict(self):
        return dict(self._data)

    def set(self, payload):
        self._writes.append(payload)
        self._data = dict(payload)
        self.exists = True


def _fake_db_with_doc() -> tuple[MagicMock, FakeDoc]:
    doc = FakeDoc()
    cohorts = MagicMock()
    cohorts.document.return_value = doc
    user_doc_ref = MagicMock()
    user_doc_ref.collection.return_value = cohorts
    users = MagicMock()
    users.document.return_value = user_doc_ref
    db = MagicMock()
    db.collection.return_value = users
    return db, doc


# ── _rollout_pct ─────────────────────────────────────────────────────────


def test_rollout_pct_defaults_to_zero(monkeypatch):
    """Missing env var → 0% rollout. Don't accidentally treat everyone."""
    monkeypatch.delenv("LOOPS_SETUP_V2_ROLLOUT_PCT", raising=False)
    assert _rollout_pct("loops_setup_v2") == 0


def test_rollout_pct_reads_env_var(monkeypatch):
    monkeypatch.setenv("LOOPS_SETUP_V2_ROLLOUT_PCT", "37")
    assert _rollout_pct("loops_setup_v2") == 37


def test_rollout_pct_clamps_above_100(monkeypatch):
    """A fat-fingered '500' must not treat more than 100% (which would be
    impossible but harmless) — clamp to 100 so the math stays defined."""
    monkeypatch.setenv("LOOPS_SETUP_V2_ROLLOUT_PCT", "500")
    assert _rollout_pct("loops_setup_v2") == 100


def test_rollout_pct_floors_negative(monkeypatch):
    monkeypatch.setenv("LOOPS_SETUP_V2_ROLLOUT_PCT", "-25")
    assert _rollout_pct("loops_setup_v2") == 0


def test_rollout_pct_ignores_garbage(monkeypatch):
    """A non-numeric env value must not raise — fall back to 0% rollout."""
    monkeypatch.setenv("LOOPS_SETUP_V2_ROLLOUT_PCT", "fifty")
    assert _rollout_pct("loops_setup_v2") == 0


# ── _hash_bucket / _classify ─────────────────────────────────────────────


def test_hash_bucket_is_deterministic():
    """Same uid → same bucket across calls. This is the property that
    makes assignment sticky without a Firestore round-trip on every read."""
    assert _hash_bucket("user-abc") == _hash_bucket("user-abc")


def test_hash_bucket_is_in_range():
    for uid in ("a", "b", "c", "user-1234", "🦀"):
        b = _hash_bucket(uid)
        assert 0 <= b < 100


def test_classify_zero_pct_is_always_control():
    for uid in ("u1", "u2", "u3", "u4", "u5"):
        assert _classify(uid, 0) == "control"


def test_classify_hundred_pct_is_always_treatment():
    for uid in ("u1", "u2", "u3", "u4", "u5"):
        assert _classify(uid, 100) == "treatment"


def test_classify_distribution_at_50_pct_is_roughly_balanced():
    """Sanity check — at 50% rollout, ~half of a large synthetic sample
    should land in treatment. We allow generous slack (35-65) so the
    test doesn't go flaky on a particular hash distribution; the real
    contract is "neither cohort starves."""
    n = 1000
    treatment = sum(1 for i in range(n) if _classify(f"u-{i}", 50) == "treatment")
    assert 350 < treatment < 650


# ── get_or_assign — sticky, persists, reads back ────────────────────────


def test_get_or_assign_fresh_user_writes_assignment(monkeypatch):
    """First call: no Firestore doc exists → service classifies + writes
    to Firestore so the next call short-circuits."""
    monkeypatch.setenv("LOOPS_SETUP_V2_ROLLOUT_PCT", "100")
    db, doc = _fake_db_with_doc()
    monkeypatch.setattr(cohort_assignment, "get_db", lambda: db)

    cohort = get_or_assign("user-A", LOOPS_SETUP_V2_FLAG)

    assert cohort == "treatment"
    assert len(doc._writes) == 1
    assert doc._writes[0]["cohort"] == "treatment"
    assert doc._writes[0]["rolloutPctAtAssignment"] == 100
    assert "assignedAt" in doc._writes[0]


def test_get_or_assign_is_sticky_when_pct_drops(monkeypatch):
    """A user assigned 'treatment' when rollout was 100% must STAY in
    treatment after the rollout drops to 0% — that's the whole point of
    sticky cohorts."""
    monkeypatch.setenv("LOOPS_SETUP_V2_ROLLOUT_PCT", "100")
    db, doc = _fake_db_with_doc()
    monkeypatch.setattr(cohort_assignment, "get_db", lambda: db)

    first = get_or_assign("user-B")
    assert first == "treatment"

    # Drop the rollout. Existing assignment must still win.
    monkeypatch.setenv("LOOPS_SETUP_V2_ROLLOUT_PCT", "0")
    second = get_or_assign("user-B")

    assert second == "treatment"
    assert len(doc._writes) == 1  # No second write — read short-circuited.


def test_get_or_assign_reads_existing_assignment_without_reclassifying(
    monkeypatch,
):
    """An existing 'control' doc must NOT get reclassified to treatment
    even if the new rollout would have put this user there."""
    monkeypatch.setenv("LOOPS_SETUP_V2_ROLLOUT_PCT", "100")
    db, doc = _fake_db_with_doc()
    doc.exists = True
    doc._data = {"cohort": "control", "rolloutPctAtAssignment": 0}
    monkeypatch.setattr(cohort_assignment, "get_db", lambda: db)

    result = get_or_assign("user-C")

    assert result == "control"
    assert doc._writes == []


def test_get_or_assign_empty_uid_returns_control(monkeypatch):
    """Defensive: an unauthed call shouldn't crash and shouldn't treat
    a phantom user. Always control."""
    db, doc = _fake_db_with_doc()
    monkeypatch.setattr(cohort_assignment, "get_db", lambda: db)

    assert get_or_assign("") == "control"
    # No write happened either.
    assert doc._writes == []


def test_get_or_assign_recovers_on_firestore_read_failure(monkeypatch):
    """If the Firestore read raises (transient outage), classify fresh
    and try to write. The fresh classification means the user might
    land in treatment when on retry they would've shown 'control' from
    the previous write — but that's an edge case where the recovery
    write tightens things back to sticky."""
    monkeypatch.setenv("LOOPS_SETUP_V2_ROLLOUT_PCT", "100")
    db, doc = _fake_db_with_doc()

    bad_doc = MagicMock()
    bad_doc.get.side_effect = RuntimeError("firestore unavailable")
    bad_doc.set.side_effect = lambda d: doc._writes.append(d)

    cohorts = MagicMock()
    cohorts.document.return_value = bad_doc
    user_doc_ref = MagicMock()
    user_doc_ref.collection.return_value = cohorts
    users = MagicMock()
    users.document.return_value = user_doc_ref
    new_db = MagicMock()
    new_db.collection.return_value = users
    monkeypatch.setattr(cohort_assignment, "get_db", lambda: new_db)

    result = get_or_assign("user-D")
    assert result == "treatment"
    assert len(doc._writes) == 1
