"""Tests for on-demand job-description hydration.

Covers the fix for Simplify-sourced internships that ingest with an empty
description_raw and showed "No description provided" in the detail pane.
"""
import pytest

from backend.app.routes import jobs as jobs_module
from backend.app.routes.jobs import _compose_from_structured, _hydrate_description
from backend.app.services.extraction_schemas import JobPostingExtract


def test_schema_exposes_description_field():
    """The Firecrawl extract schema must carry prose so the enricher's existing
    scrape can recover it in the same call (no extra API cost)."""
    job = JobPostingExtract()
    assert hasattr(job, "description")
    assert job.description == ""
    assert JobPostingExtract(description="Build payments").description == "Build payments"


def test_compose_from_structured_builds_readable_paragraphs():
    structured = {
        "responsibilities": ["Ship features", "Pair with eng"],
        "requirements": ["Python", "  "],  # blank entries dropped
        "nice_to_have": [],
    }
    out = _compose_from_structured(structured)
    # Headers + bullets are blank-line separated so the pane's \n{2,} splitter
    # renders them as distinct lines.
    assert "What you'll do" in out
    assert "• Ship features" in out
    assert "What we're looking for" in out
    assert "• Python" in out
    assert "Nice to have" not in out  # empty section omitted
    assert "\n\n" in out


@pytest.mark.parametrize("bad", [None, "", [], 42, {"responsibilities": []}])
def test_compose_from_structured_handles_empty_or_bad_input(bad):
    assert _compose_from_structured(bad) == ""


class _FakeRef:
    def __init__(self):
        self.updated = None

    def update(self, payload):
        self.updated = payload


def test_hydrate_prefers_structured_and_skips_scrape(monkeypatch):
    """When structured data exists, compose from it instantly — no scrape."""
    monkeypatch.setattr(
        "backend.app.services.firecrawl_client.extract_job_posting",
        lambda url: (_ for _ in ()).throw(AssertionError("should not scrape when structured exists")),
    )
    ref = _FakeRef()
    data = {"structured": {"responsibilities": ["Do the thing"]}, "apply_url": "https://x.com/j"}
    out = _hydrate_description(ref, data)
    assert "• Do the thing" in out
    assert ref.updated == {"description_raw": out}


def test_hydrate_scrapes_bare_job_with_apply_link_and_persists(monkeypatch):
    """A job with an apply link but no stored data scrapes the posting on demand
    and caches the prose so every later view is instant."""
    monkeypatch.setattr(
        "backend.app.services.firecrawl_client.extract_job_posting",
        lambda url: {"description": "Real posting prose."},
    )
    ref = _FakeRef()
    out = _hydrate_description(ref, {"apply_url": "https://example.com/job"})
    assert out == "Real posting prose."
    assert ref.updated == {"description_raw": "Real posting prose."}


def test_hydrate_scrape_respects_concurrency_cap(monkeypatch):
    """When the scrape concurrency cap is exhausted, skip the scrape and fall
    back to the empty state rather than tying up another worker."""
    monkeypatch.setattr(
        "backend.app.services.firecrawl_client.extract_job_posting",
        lambda url: (_ for _ in ()).throw(AssertionError("cap exhausted — must not scrape")),
    )
    # Drain the semaphore so no permits remain.
    permits = []
    while jobs_module._HYDRATE_SCRAPE_SEM.acquire(blocking=False):
        permits.append(True)
    try:
        ref = _FakeRef()
        out = _hydrate_description(ref, {"apply_url": "https://example.com/job"})
        assert out == ""
        assert ref.updated is None
    finally:
        for _ in permits:
            jobs_module._HYDRATE_SCRAPE_SEM.release()


def test_hydrate_returns_empty_without_data():
    ref = _FakeRef()
    out = _hydrate_description(ref, {})
    assert out == ""
    assert ref.updated is None
