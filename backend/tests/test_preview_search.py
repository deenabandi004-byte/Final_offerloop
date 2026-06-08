"""
preview_search — V2 Loops wizard "Who you'd reach" tests.

PDL is mocked entirely; no real network or credit spend during tests.
The session_cache plumbing matters because the wizard re-fires the
preview every time the brief settles after a chip edit — without it the
30-day Firestore cache still works, but a brand-new user editing chips
in their first 30 days would burn one PDL call per edit.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services import preview_search
from app.services.preview_search import (
    PREVIEW_LIMIT,
    cache_key,
    preview_targets,
)


# ── cache_key — sort-insensitive, case-insensitive, stable ───────────────


def test_cache_key_is_stable_across_chip_order():
    """The wizard's chip order shifts as the parser fires — but the
    underlying search is order-independent. The cache key must not
    flip on cosmetic reordering."""
    a = cache_key({"companies": ["Stripe", "Plaid"], "roles": ["PM"]})
    b = cache_key({"companies": ["Plaid", "Stripe"], "roles": ["PM"]})
    assert a == b


def test_cache_key_is_case_insensitive():
    a = cache_key({"companies": ["Stripe"], "roles": ["pm"]})
    b = cache_key({"companies": ["stripe"], "roles": ["PM"]})
    assert a == b


def test_cache_key_changes_when_targets_change():
    base = cache_key({"companies": ["Stripe"]})
    plus = cache_key({"companies": ["Stripe", "Plaid"]})
    assert base != plus


def test_cache_key_ignores_email_purpose_and_constraints():
    """The preview search doesn't read these fields — different values
    must hash to the same key so we don't burn cache slots on a brief
    that's structurally identical."""
    a = cache_key({"companies": ["Stripe"], "emailPurpose": "internship"})
    b = cache_key({"companies": ["Stripe"], "emailPurpose": "fulltime"})
    assert a == b


# ── No-signal short-circuit ──────────────────────────────────────────────


def test_preview_targets_no_signal_returns_empty_without_calling_pdl(monkeypatch):
    """Empty brief, no companies/roles/industries → empty list, no PDL
    call. The wizard renders the "Add a company or role" empty state."""
    pdl_spy = MagicMock()
    monkeypatch.setattr(preview_search, "search_contacts_from_prompt", pdl_spy)

    result = preview_targets(parsed_brief=None)

    assert result == []
    pdl_spy.assert_not_called()


def test_preview_targets_locations_alone_is_not_enough_signal(monkeypatch):
    """A brief with only locations (no companies / roles / industries)
    isn't actually searchable in any useful way. Don't burn the call."""
    pdl_spy = MagicMock()
    monkeypatch.setattr(preview_search, "search_contacts_from_prompt", pdl_spy)

    result = preview_targets(parsed_brief={"locations": ["NYC"], "companies": []})

    assert result == []
    pdl_spy.assert_not_called()


# ── Happy path: shape + cap + school flag ───────────────────────────────


def _pdl_returning(contacts: list[dict]):
    def fake_search(parsed_prompt, max_contacts, exclude_keys, user_profile):
        return (contacts, 0, [], None)
    return fake_search


def test_preview_targets_returns_normalized_lean_shape(monkeypatch):
    """The wizard only needs name + title + company + school + linkedin
    + sameSchool. The full PDL row is hundreds of fields — make sure
    the route doesn't accidentally ship them all to the client."""
    monkeypatch.setattr(
        preview_search,
        "search_contacts_from_prompt",
        _pdl_returning([
            {
                "full_name": "Sarah Chen",
                "title": "Product Manager",
                "job_company_name": "Stripe",
                "linkedin_url": "https://linkedin.com/in/sarahchen",
                "education_school": "University of Southern California",
                "this_is_a_pdl_field_we_dont_need": "trash",
            },
        ]),
    )

    result = preview_targets(
        parsed_brief={"companies": ["Stripe"], "roles": ["PM"]},
        user_profile={"university": "University of Southern California"},
    )

    assert len(result) == 1
    contact = result[0]
    assert set(contact.keys()) == {
        "name", "title", "company", "school", "linkedinUrl", "sameSchool",
    }
    assert contact["name"] == "Sarah Chen"
    assert contact["company"] == "Stripe"
    assert contact["sameSchool"] is True


def test_preview_targets_caps_at_preview_limit_even_when_caller_asks_for_more(
    monkeypatch,
):
    """Defense: a caller passing max_results=50 must not turn a preview
    into a 50-credit PDL spend."""
    captured: dict = {}

    def fake_search(parsed_prompt, max_contacts, exclude_keys, user_profile):
        captured["max_contacts"] = max_contacts
        return ([], 0, [], None)

    monkeypatch.setattr(preview_search, "search_contacts_from_prompt", fake_search)

    preview_targets(
        parsed_brief={"companies": ["Stripe"]},
        max_results=999,
    )

    assert captured["max_contacts"] == PREVIEW_LIMIT


def test_preview_targets_returns_empty_on_pdl_exception(monkeypatch):
    """A PDL outage MUST NOT crash the wizard. Caller sees [] and renders
    the "Preview unavailable" fallback."""
    def boom(*a, **k):
        raise RuntimeError("PDL 503")
    monkeypatch.setattr(preview_search, "search_contacts_from_prompt", boom)

    result = preview_targets(parsed_brief={"companies": ["Stripe"]})
    assert result == []


def test_preview_targets_skips_rows_with_no_identity_signal(monkeypatch):
    """PDL occasionally returns rows where every visible field is empty.
    Drop them — the chip "—  · — at " isn't useful preview content."""
    monkeypatch.setattr(
        preview_search,
        "search_contacts_from_prompt",
        _pdl_returning([
            {},
            {"full_name": "Alex"},
            {"job_company_name": ""},
        ]),
    )

    result = preview_targets(parsed_brief={"companies": ["Stripe"]})
    assert len(result) == 1
    assert result[0]["name"] == "Alex"


# ── Session cache ───────────────────────────────────────────────────────


def test_preview_targets_uses_session_cache_to_skip_pdl_on_hit(monkeypatch):
    """Second call with the same brief MUST NOT hit PDL when a
    session_cache is supplied — this is what saves us when the wizard
    re-fires after an idempotent chip toggle."""
    pdl_calls = {"n": 0}

    def fake_search(parsed_prompt, max_contacts, exclude_keys, user_profile):
        pdl_calls["n"] += 1
        return ([{"full_name": "Sarah", "title": "PM", "job_company_name": "Stripe"}], 0, [], None)

    monkeypatch.setattr(preview_search, "search_contacts_from_prompt", fake_search)

    cache: dict = {}
    brief = {"companies": ["Stripe"], "roles": ["PM"]}
    a = preview_targets(parsed_brief=brief, session_cache=cache)
    b = preview_targets(parsed_brief=brief, session_cache=cache)

    assert pdl_calls["n"] == 1
    assert a == b


def test_preview_targets_session_cache_misses_when_brief_changes(monkeypatch):
    """Editing the brief MUST re-fire PDL — that's the whole point of
    the live preview. Tests the cache key actually responds to changes."""
    pdl_calls = {"n": 0}

    def fake_search(parsed_prompt, max_contacts, exclude_keys, user_profile):
        pdl_calls["n"] += 1
        return ([], 0, [], None)

    monkeypatch.setattr(preview_search, "search_contacts_from_prompt", fake_search)

    cache: dict = {}
    preview_targets(parsed_brief={"companies": ["Stripe"]}, session_cache=cache)
    preview_targets(
        parsed_brief={"companies": ["Stripe", "Plaid"]}, session_cache=cache,
    )

    assert pdl_calls["n"] == 2
