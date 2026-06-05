"""Tests for the Apify-first user-LinkedIn enrichment chain (D9).

Two layers covered:
  1. get_enrichment_tiers(prefer_scrape=True) composition under
     ENABLE_APIFY_USER_LINKEDIN on/off and the contact-search path
     (prefer_scrape=False) which must NOT be affected.
  2. The _try_apify wrapper around enrich_user_linkedin_profile_via_apify,
     covering happy path and every envelope.ok=False shape.

Route-level integration (fallback_used response field) is not exercised here;
the existing tier-loop in enrichment.py is unit-tested elsewhere and the
tagging is one if-statement deep.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.utils.linkedin_enrichment import (
    _try_apify,
    _try_brightdata,
    _try_firecrawl,
    _try_pdl,
    get_enrichment_tiers,
)


# ---------------------------------------------------------------------------
# Chain composition
# ---------------------------------------------------------------------------

def test_chain_off_returns_legacy_scrape_chain(monkeypatch):
    """Flag off: existing Firecrawl -> BrightData -> PDL chain (unchanged)."""
    monkeypatch.delenv("ENABLE_APIFY_USER_LINKEDIN", raising=False)
    monkeypatch.delenv("ENABLE_JINA_FALLBACK", raising=False)

    chain = get_enrichment_tiers(prefer_scrape=True)
    assert chain == [_try_firecrawl, _try_brightdata, _try_pdl]


def test_chain_on_replaces_scrape_chain_with_apify_first(monkeypatch):
    """Flag on: Apify -> PDL only; Firecrawl/BrightData dropped from user path."""
    monkeypatch.setenv("ENABLE_APIFY_USER_LINKEDIN", "1")
    monkeypatch.delenv("ENABLE_JINA_FALLBACK", raising=False)

    chain = get_enrichment_tiers(prefer_scrape=True)
    assert chain == [_try_apify, _try_pdl]
    # Critical: Firecrawl is policy-blocked from LinkedIn; must not appear.
    assert _try_firecrawl not in chain
    assert _try_brightdata not in chain


def test_contact_search_path_is_unaffected_by_flag(monkeypatch):
    """prefer_scrape=False is the contact-enrichment path. The Apify flag
    must NOT change it — contact searches keep PDL -> BrightData."""
    for value in (None, "1", "true"):
        if value is None:
            monkeypatch.delenv("ENABLE_APIFY_USER_LINKEDIN", raising=False)
        else:
            monkeypatch.setenv("ENABLE_APIFY_USER_LINKEDIN", value)

        chain = get_enrichment_tiers(prefer_scrape=False)
        assert chain == [_try_pdl, _try_brightdata]


def test_jina_flag_still_works_when_apify_flag_is_off(monkeypatch):
    """Legacy Jina fallback must keep working when Apify is not enabled."""
    monkeypatch.delenv("ENABLE_APIFY_USER_LINKEDIN", raising=False)
    monkeypatch.setenv("ENABLE_JINA_FALLBACK", "1")

    chain = get_enrichment_tiers(prefer_scrape=True)
    # Jina should be inserted between Firecrawl and BrightData.
    assert chain[0] is _try_firecrawl
    assert chain[1].__name__ == "_try_jina"
    assert _try_pdl in chain


def test_jina_flag_is_ignored_when_apify_flag_is_on(monkeypatch):
    """Apify-first path is Apify -> PDL period. No legacy Jina insertion."""
    monkeypatch.setenv("ENABLE_APIFY_USER_LINKEDIN", "1")
    monkeypatch.setenv("ENABLE_JINA_FALLBACK", "1")

    chain = get_enrichment_tiers(prefer_scrape=True)
    assert chain == [_try_apify, _try_pdl]


# ---------------------------------------------------------------------------
# _try_apify wrapper
# ---------------------------------------------------------------------------

def test_try_apify_passes_through_happy_envelope():
    """When the Apify client returns ok=True, the tier returns the raw data
    and a fixed source string of 'apify' that llm_enrich_profile routes on."""
    happy_envelope = {
        "ok": True,
        "source": "apify",
        "actor": "harvestapi~linkedin-profile",
        "data": {"name": "Test User", "education": [{"school": "USC"}]},
    }
    with patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        return_value=happy_envelope,
    ):
        raw, source = _try_apify("https://linkedin.com/in/test")

    assert source == "apify"
    assert raw == happy_envelope["data"]


@pytest.mark.parametrize(
    "envelope_error",
    [
        "bad_url",
        "no_api_key",
        "http_429",
        "http_500",
        "timeout",
        "no_data",
        "bad_shape",
    ],
)
def test_try_apify_returns_no_source_on_envelope_failure(envelope_error):
    """Every Apify envelope failure mode must fall through cleanly to PDL —
    the tier loop in enrichment.py treats source=='' as 'skip this tier'."""
    failure_envelope = {
        "ok": False,
        "source": f"apify_{envelope_error}",
        "actor": "harvestapi~linkedin-profile",
        "data": None,
        "error": envelope_error,
    }
    with patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        return_value=failure_envelope,
    ):
        raw, source = _try_apify("https://linkedin.com/in/test")

    assert raw is None
    assert source == ""


def test_try_apify_swallows_unexpected_exceptions():
    """Onboarding is on the critical signup path; this wrapper must never
    propagate an exception even if the underlying client misbehaves."""
    with patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        side_effect=RuntimeError("client exploded"),
    ):
        raw, source = _try_apify("https://linkedin.com/in/test")

    assert raw is None
    assert source == ""
