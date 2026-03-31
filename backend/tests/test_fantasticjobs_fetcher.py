"""
Tests for the Fantastic.jobs (RapidAPI active-jobs-db) fetcher.
"""
import os
import pytest
from unittest.mock import patch, MagicMock


# =============================================================================
# Fetcher unit tests
# =============================================================================

class TestFantasticjobsGating:
    """fetch_fantasticjobs() must be gated behind RAPIDAPI_KEY."""

    def test_skips_when_no_api_key(self):
        from pipeline.fetcher import fetch_fantasticjobs
        with patch.dict(os.environ, {}, clear=True):
            # Remove RAPIDAPI_KEY if present
            os.environ.pop("RAPIDAPI_KEY", None)
            result = fetch_fantasticjobs()
        assert result == []

    def test_returns_jobs_when_key_present(self):
        """With a key set, the function attempts API calls (mocked)."""
        from pipeline.fetcher import fetch_fantasticjobs
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = []

        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test-key"}):
            with patch("pipeline.fetcher.requests.get", return_value=mock_resp):
                result = fetch_fantasticjobs()
        assert isinstance(result, list)


class TestFantasticjobsCallConfig:
    """Category calls must be configured correctly."""

    def test_has_10_calls(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        assert len(FANTASTICJOBS_CALLS) == 10

    def test_call_labels_unique(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        labels = [label for label, _ in FANTASTICJOBS_CALLS]
        assert len(labels) == len(set(labels))

    def test_big_tech_companies_call(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        calls = {label: params for label, params in FANTASTICJOBS_CALLS}
        orgs = calls["big_tech_companies"]["organization_filter"]
        assert "Google" in orgs
        assert "Meta" in orgs
        assert "Apple" in orgs
        assert "Amazon" in orgs
        assert "Microsoft" in orgs

    def test_finance_companies_call(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        calls = {label: params for label, params in FANTASTICJOBS_CALLS}
        orgs = calls["finance_companies"]["organization_filter"]
        assert "Goldman Sachs" in orgs
        assert "JPMorgan Chase & Co." in orgs
        assert "Morgan Stanley" in orgs

    def test_consulting_companies_call(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        calls = {label: params for label, params in FANTASTICJOBS_CALLS}
        orgs = calls["consulting_companies"]["organization_filter"]
        assert "McKinsey" in orgs
        assert "Boston Consulting Group" in orgs
        assert "Deloitte" in orgs

    def test_internships_call(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        calls = {label: params for label, params in FANTASTICJOBS_CALLS}
        params = calls["internships_us"]
        assert params["ai_employment_type_filter"] == "INTERN"
        assert "location_filter" in params

    def test_uses_24h_endpoint(self):
        from pipeline.fetcher import FANTASTICJOBS_BASE_URL
        assert "active-ats-24h" in FANTASTICJOBS_BASE_URL


class TestFantasticjobsNormalization:
    """Job data normalization from Fantastic.jobs format."""

    def test_normalize_fj_job_basic(self):
        from pipeline.fetcher import _normalize_fj_job
        raw = {
            "id": "abc123",
            "title": "Software Engineer",
            "organization": "Goldman Sachs",
            "organization_logo": "https://example.com/logo.png",
            "url": "https://example.com/apply",
            "description": "Build things" * 100,
            "date_posted": "2025-01-15",
            "remote_derived": False,
            "locations_derived": [{"city": "New York", "state": "NY"}],
        }
        result = _normalize_fj_job(raw)
        assert result["job_id"] == "fantasticjobs_abc123"
        assert result["source"] == "fantasticjobs"
        assert result["title"] == "Software Engineer"
        assert result["company"] == "Goldman Sachs"
        assert result["employer_logo"] == "https://example.com/logo.png"
        assert result["location"] == "New York, NY"
        assert result["remote"] is False
        assert result["apply_url"] == "https://example.com/apply"
        assert result["posted_at"] == "2025-01-15"
        assert result["salary_min"] is None
        assert result["salary_max"] is None
        assert result["salary_period"] is None

    def test_normalize_fj_job_remote(self):
        from pipeline.fetcher import _normalize_fj_job
        raw = {
            "id": "remote1",
            "title": "Remote Dev",
            "organization": "Acme",
            "url": "",
            "remote_derived": True,
        }
        result = _normalize_fj_job(raw)
        assert result["remote"] is True

    def test_normalize_fj_job_fallback_location(self):
        from pipeline.fetcher import _normalize_fj_job
        raw = {
            "id": "no-loc",
            "title": "Analyst",
            "organization": "Acme",
            "url": "",
            "locations_derived": [],
            "locations_raw": [{"address": "123 Main St, Chicago, IL"}],
        }
        result = _normalize_fj_job(raw)
        assert result["location"] == "123 Main St, Chicago, IL"

    def test_normalize_fj_job_no_location(self):
        from pipeline.fetcher import _normalize_fj_job
        raw = {"id": "x", "title": "Analyst", "organization": "Acme", "url": ""}
        result = _normalize_fj_job(raw)
        assert result["location"] == "United States"

    def test_description_truncated_to_8000(self):
        from pipeline.fetcher import _normalize_fj_job
        raw = {
            "id": "long",
            "title": "Dev",
            "organization": "Acme",
            "url": "",
            "description": "x" * 10000,
        }
        result = _normalize_fj_job(raw)
        assert len(result["description_raw"]) == 8000


class TestFantasticjobsHeaders:
    """API headers must be correct."""

    def test_headers_structure(self):
        from pipeline.fetcher import _fantasticjobs_headers
        with patch.dict(os.environ, {"RAPIDAPI_KEY": "my-key-123"}):
            headers = _fantasticjobs_headers()
        assert headers["x-rapidapi-key"] == "my-key-123"
        assert headers["x-rapidapi-host"] == "active-jobs-db.p.rapidapi.com"


class TestFantasticjobsDedup:
    """Deduplication of overlapping category results."""

    def test_dedup_removes_duplicates(self):
        from pipeline.fetcher import fetch_fantasticjobs
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        # Return same job from multiple category calls
        mock_resp.json.return_value = [
            {"id": "dup1", "title": "Intern", "organization": "Goldman Sachs", "url": ""},
        ]

        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test"}):
            with patch("pipeline.fetcher.requests.get", return_value=mock_resp):
                result = fetch_fantasticjobs()

        # Should have only 1 copy despite being returned by multiple calls
        ids = [j["job_id"] for j in result]
        assert ids.count("fantasticjobs_dup1") == 1


class TestFantasticjobsErrorHandling:
    """API errors should be handled gracefully."""

    def test_fetch_page_handles_http_error(self):
        from pipeline.fetcher import _fj_fetch_page
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.raise_for_status.side_effect = Exception("500 Server Error")

        with patch("pipeline.fetcher.requests.get", return_value=mock_resp):
            result = _fj_fetch_page({"limit": "100"}, "test")
        assert result == []

    def test_skips_jobs_without_id(self):
        """Jobs missing 'id' field should be skipped."""
        from pipeline.fetcher import _fj_fetch_page
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = [
            {"id": "valid1", "title": "Engineer", "organization": "Acme", "url": ""},
            {"title": "No ID Job", "organization": "Acme", "url": ""},  # missing id
            {"id": "valid2", "title": "Analyst", "organization": "Acme", "url": ""},
        ]

        with patch("pipeline.fetcher.requests.get", return_value=mock_resp):
            result = _fj_fetch_page({"limit": "100"}, "test")
        assert len(result) == 2


class TestFetchJobsIntegration:
    """fetch_jobs() must include Fantastic.jobs."""

    def test_fetch_jobs_calls_fantasticjobs(self):
        """fetch_jobs() should call fetch_fantasticjobs."""
        import inspect
        from pipeline.fetcher import fetch_jobs
        source = inspect.getsource(fetch_jobs)
        assert "fetch_fantasticjobs" in source

    def test_fetch_jobs_has_4_workers(self):
        """ThreadPoolExecutor should have 4 workers (Greenhouse, Lever, Ashby, Fantastic.jobs)."""
        import inspect
        from pipeline.fetcher import fetch_jobs
        source = inspect.getsource(fetch_jobs)
        assert "max_workers=4" in source


class TestNormalizerRecognizesSource:
    """Normalizer must route fantasticjobs to _normalize_board_job."""

    def test_fantasticjobs_in_board_sources(self):
        import inspect
        from pipeline.normalizer import normalize_job
        source = inspect.getsource(normalize_job)
        assert '"fantasticjobs"' in source

    def test_fantasticjobs_normalizes_correctly(self):
        from pipeline.normalizer import normalize_job
        raw = {
            "source": "fantasticjobs",
            "job_id": "fantasticjobs_abc",
            "title": "Analyst",
            "company": "Goldman Sachs",
            "location": "New York, NY",
            "remote": False,
            "description_raw": "Analyze things",
            "apply_url": "https://example.com",
            "posted_at": "2025-06-01T00:00:00+00:00",
            "salary_min": None,
            "salary_max": None,
            "salary_period": None,
        }
        result = normalize_job(raw)
        assert result is not None
        assert result["job_id"] == "fantasticjobs_abc"
        assert result["source"] == "fantasticjobs"
        assert result["company"] == "Goldman Sachs"
