"""Tests for on-demand job-description hydration.

Covers the fix for Simplify-sourced internships that ingest with an empty
description_raw and showed "No description provided" in the detail pane.
"""
import pytest

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


def test_hydrate_composes_from_structured_and_persists():
    """The request path composes from data we already have — no network call —
    and caches the result so later views are instant."""
    ref = _FakeRef()
    data = {"structured": {"responsibilities": ["Do the thing"]}}
    out = _hydrate_description(ref, data)
    assert "• Do the thing" in out
    assert ref.updated == {"description_raw": out}


def test_hydrate_never_scrapes_in_request_path(monkeypatch):
    """Guard: a missing-description view must not trigger a live Firecrawl
    scrape (that could hold a worker). Even with an apply_url present and no
    structured data, hydrate stays empty and makes no external call."""
    monkeypatch.setattr(
        "backend.app.services.firecrawl_client.extract_job_posting",
        lambda url: (_ for _ in ()).throw(AssertionError("must not scrape in request path")),
    )
    ref = _FakeRef()
    out = _hydrate_description(ref, {"apply_url": "https://example.com/job"})
    assert out == ""
    assert ref.updated is None  # nothing to persist, honest empty state preserved


def test_hydrate_returns_empty_without_data():
    ref = _FakeRef()
    out = _hydrate_description(ref, {})
    assert out == ""
    assert ref.updated is None
