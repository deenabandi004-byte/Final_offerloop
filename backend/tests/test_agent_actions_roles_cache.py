"""
Agent actions — cost-aware caching tests.

The roles cycle calls Perplexity + Firecrawl repeatedly. Per the plan we
short-circuit calls when an existing Loop-scoped row is fresh:
  - companies: 7-day TTL  (slow-moving discovery list)
  - jobs:      3-day TTL  (postings rotate fast)
  - HMs:      30-day TTL  (founder identity stable over weeks)

These tests use a fake Firestore client to feed _has_fresh_cached_rows and
assert that the three executors return zero-cost results when a fresh row
exists, and proceed to live discovery (which we mock to a no-op) when no
cache exists.

No external APIs are called — every Perplexity / recruiter_finder import
is stubbed via monkeypatch.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.services import agent_actions
from app.services.agent_actions import (
    _CACHE_TTL_COMPANIES,
    _CACHE_TTL_HMS,
    _CACHE_TTL_JOBS,
    _has_fresh_cached_rows,
    _is_cache_fresh,
)


# ── _is_cache_fresh ──────────────────────────────────────────────────────


def test_is_cache_fresh_within_ttl():
    """A row created 1 hour ago is fresh against any TTL >= 1 hour."""
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    assert _is_cache_fresh(one_hour_ago, timedelta(days=1)) is True


def test_is_cache_fresh_outside_ttl():
    """A row older than the TTL is stale."""
    ten_days_ago = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    assert _is_cache_fresh(ten_days_ago, timedelta(days=7)) is False


def test_is_cache_fresh_missing_value():
    """Missing or empty createdAt is treated as stale (cache miss)."""
    assert _is_cache_fresh(None, timedelta(days=1)) is False
    assert _is_cache_fresh("", timedelta(days=1)) is False


def test_is_cache_fresh_handles_z_suffix():
    """ISO strings ending in Z (Firestore's default format) parse cleanly."""
    fresh = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
    assert _is_cache_fresh(fresh, timedelta(days=1)) is True


def test_is_cache_fresh_naive_datetime_assumed_utc():
    """A datetime without tzinfo is interpreted as UTC, not crashed on."""
    naive = (datetime.utcnow() - timedelta(hours=1)).replace(tzinfo=None)
    assert _is_cache_fresh(naive, timedelta(days=1)) is True


# ── _has_fresh_cached_rows ────────────────────────────────────────────────


def _fake_db_with_rows(rows: list[dict]) -> MagicMock:
    """Fake db.collection().document().collection().where()... pipeline that
    streams the given rows. Captures filter chain so tests can introspect
    which fields were queried."""

    def make_stream(_records):
        for r in _records:
            doc = MagicMock()
            doc.to_dict.return_value = r
            yield doc

    where_obj = MagicMock()
    where_obj.where.return_value = where_obj  # chained .where() returns self
    where_obj.stream.return_value = make_stream(rows)

    coll = MagicMock()
    coll.where.return_value = where_obj

    user_doc = MagicMock()
    user_doc.collection.return_value = coll

    users = MagicMock()
    users.document.return_value = user_doc

    db = MagicMock()
    db.collection.return_value = users
    return db


def test_has_fresh_cached_rows_hits_when_fresh_row_exists():
    fresh_iso = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    db = _fake_db_with_rows([{"loopId": "L1", "createdAt": fresh_iso}])
    assert _has_fresh_cached_rows(db, "u1", "agent_companies", "L1", _CACHE_TTL_COMPANIES) is True


def test_has_fresh_cached_rows_misses_when_all_rows_stale():
    stale_iso = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    db = _fake_db_with_rows([{"loopId": "L1", "createdAt": stale_iso}])
    assert _has_fresh_cached_rows(db, "u1", "agent_companies", "L1", _CACHE_TTL_COMPANIES) is False


def test_has_fresh_cached_rows_misses_when_no_rows():
    db = _fake_db_with_rows([])
    assert _has_fresh_cached_rows(db, "u1", "agent_companies", "L1", _CACHE_TTL_COMPANIES) is False


def test_has_fresh_cached_rows_no_loop_id_returns_false():
    """Legacy callers without loopId must not trigger an unscoped scan —
    that would short-circuit unrelated Loops. Return False so the live
    path runs normally."""
    db = _fake_db_with_rows([
        {"loopId": "OTHER", "createdAt": datetime.now(timezone.utc).isoformat()},
    ])
    assert _has_fresh_cached_rows(db, "u1", "agent_companies", "", _CACHE_TTL_COMPANIES) is False


def test_has_fresh_cached_rows_firestore_error_returns_false():
    """When Firestore raises (e.g. missing composite index), we must not
    raise into the executor — log and return False so the live API path
    runs."""
    db = MagicMock()
    db.collection.side_effect = RuntimeError("missing index")
    assert _has_fresh_cached_rows(db, "u1", "agent_jobs", "L1", _CACHE_TTL_JOBS) is False


# ── TTL constants reflect plan ────────────────────────────────────────────


def test_ttl_constants_match_plan():
    """The plan specifies 7/3/30 day TTLs. If anyone tunes these later,
    they should update the plan and this test together."""
    assert _CACHE_TTL_COMPANIES == timedelta(days=7)
    assert _CACHE_TTL_JOBS == timedelta(days=3)
    assert _CACHE_TTL_HMS == timedelta(days=30)


# ── Cache hit short-circuits external API calls ───────────────────────────
#
# We don't run the full executor — too much downstream stubbing. Instead we
# verify the gate: when the cache helper returns True, the executor's
# Perplexity import path must NOT be reached. We stub the helper to True
# and intercept the Perplexity import; if the cache-hit path is correct,
# the import is never resolved.


def test_discover_companies_cache_hit_skips_perplexity(monkeypatch):
    monkeypatch.setattr(agent_actions, "_has_fresh_cached_rows", lambda *a, **kw: True)
    monkeypatch.setattr(agent_actions, "get_db", lambda: MagicMock())

    def _explode(*a, **kw):
        raise AssertionError("Perplexity must NOT be called on cache hit")

    # Sabotage the Perplexity client so we'd notice immediately if the
    # short-circuit failed.
    import sys
    fake_module = MagicMock()
    fake_module.discover_companies_live = _explode
    fake_module.enrich_company_profile_live = _explode
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake_module)

    result = agent_actions.execute_discover_companies(
        uid="u1",
        action={"sourceCompany": "Stripe", "cycleId": "c1"},
        config={"loopId": "L1", "targetCompanies": ["Stripe"]},
        user_data={"professionalInfo": {}},
    )

    assert result == {
        "companiesDiscovered": 0, "companies": [], "creditsSpent": 0, "cacheHit": True,
    }


def test_find_jobs_cache_hit_skips_perplexity(monkeypatch):
    monkeypatch.setattr(agent_actions, "_has_fresh_cached_rows", lambda *a, **kw: True)
    monkeypatch.setattr(agent_actions, "get_db", lambda: MagicMock())

    def _explode(*a, **kw):
        raise AssertionError("Perplexity must NOT be called on cache hit")

    import sys
    fake_module = MagicMock()
    fake_module.search_jobs_live = _explode
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake_module)

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={"company": "Stripe", "role": "Designer", "count": 5, "cycleId": "c1"},
        config={"loopId": "L1"},
        user_data={"professionalInfo": {}},
    )

    assert result == {
        "jobsFound": 0, "jobs": [], "creditsSpent": 0, "cacheHit": True,
    }


def test_find_hiring_managers_passes_roles_template_in_roles_mode(monkeypatch):
    """When loopMode='roles', execute_find_hiring_managers must prepend the
    roles-mode founder-outreach instructions to template_instructions before
    calling find_hiring_manager. This is what makes the LLM produce a
    posting-specific draft instead of a generic networking email."""
    monkeypatch.setattr(agent_actions, "_has_fresh_cached_rows", lambda *a, **kw: False)
    monkeypatch.setattr(agent_actions, "get_db", lambda: MagicMock())
    # Stub template resolver — keep the user template empty so we can assert
    # purely on what the roles block contributed.
    monkeypatch.setattr(agent_actions, "_resolve_agent_template", lambda *a, **kw: "")

    captured = {}

    def fake_find_hiring_manager(**kwargs):
        captured["template_instructions"] = kwargs.get("template_instructions")
        return {"hiringManagers": [], "emails": []}

    import sys
    fake_module = MagicMock()
    fake_module.find_hiring_manager = fake_find_hiring_manager
    monkeypatch.setitem(sys.modules, "app.services.recruiter_finder", fake_module)

    # Also stub verify_hiring_managers so we don't reach Perplexity.
    fake_perplexity = MagicMock()
    fake_perplexity.verify_hiring_managers = lambda *a, **kw: []
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake_perplexity)

    agent_actions.execute_find_hiring_managers(
        uid="u1",
        action={
            "company": "Acme",
            "jobTitle": "Founding Engineer",
            "cycleId": "c1",
        },
        config={"loopId": "L1", "loopMode": "roles"},
        user_data={"professionalInfo": {}},
    )

    template = captured.get("template_instructions") or ""
    assert "Founding Engineer" in template
    assert "Acme" in template
    assert "Beat 2" in template
    assert "Posting reference" in template


def test_find_hiring_managers_no_roles_block_in_people_mode(monkeypatch):
    """People-mode cycles must NOT get the roles template injected — they
    keep today's networking voice unchanged."""
    monkeypatch.setattr(agent_actions, "_has_fresh_cached_rows", lambda *a, **kw: False)
    monkeypatch.setattr(agent_actions, "get_db", lambda: MagicMock())
    monkeypatch.setattr(agent_actions, "_resolve_agent_template", lambda *a, **kw: "")

    captured = {}

    def fake_find_hiring_manager(**kwargs):
        captured["template_instructions"] = kwargs.get("template_instructions")
        return {"hiringManagers": [], "emails": []}

    import sys
    fake_module = MagicMock()
    fake_module.find_hiring_manager = fake_find_hiring_manager
    monkeypatch.setitem(sys.modules, "app.services.recruiter_finder", fake_module)
    fake_perplexity = MagicMock()
    fake_perplexity.verify_hiring_managers = lambda *a, **kw: []
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake_perplexity)

    agent_actions.execute_find_hiring_managers(
        uid="u1",
        action={"company": "Acme", "jobTitle": "Engineer", "cycleId": "c1"},
        config={"loopId": "L1", "loopMode": "people"},
        user_data={"professionalInfo": {}},
    )

    template = captured.get("template_instructions") or ""
    assert "Beat 2" not in template
    assert "Posting reference" not in template


def test_find_hiring_managers_cache_hit_skips_recruiter_finder(monkeypatch):
    monkeypatch.setattr(agent_actions, "_has_fresh_cached_rows", lambda *a, **kw: True)
    monkeypatch.setattr(agent_actions, "get_db", lambda: MagicMock())

    def _explode(*a, **kw):
        raise AssertionError("recruiter_finder must NOT be called on cache hit")

    import sys
    fake_module = MagicMock()
    fake_module.find_hiring_manager = _explode
    monkeypatch.setitem(sys.modules, "app.services.recruiter_finder", fake_module)

    result = agent_actions.execute_find_hiring_managers(
        uid="u1",
        action={"company": "Stripe", "jobTitle": "Designer", "cycleId": "c1"},
        config={"loopId": "L1"},
        user_data={"professionalInfo": {}},
    )

    assert result == {
        "hmsFound": 0, "contacts": [], "creditsSpent": 0, "cacheHit": True,
    }
