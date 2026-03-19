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


class TestFantasticjobsCompanyConfig:
    """Target companies must be configured correctly."""

    def test_finance_companies_present(self):
        from pipeline.fetcher import FANTASTICJOBS_COMPANIES
        finance = FANTASTICJOBS_COMPANIES["finance"]
        assert "JPMorgan Chase & Co." in finance
        assert "Goldman Sachs" in finance
        assert "Morgan Stanley" in finance
        assert "Bank of America" in finance
        assert "Citigroup" in finance
        assert "Wells Fargo" in finance

    def test_consulting_companies_present(self):
        from pipeline.fetcher import FANTASTICJOBS_COMPANIES
        consulting = FANTASTICJOBS_COMPANIES["consulting"]
        assert "Deloitte" in consulting
        assert "McKinsey & Company" in consulting
        assert "Boston Consulting Group" in consulting
        assert "Bain & Company" in consulting
        assert "Accenture" in consulting
        assert "PwC" in consulting
        assert "EY" in consulting
        assert "Oliver Wyman" in consulting

    def test_pe_finance_companies_present(self):
        from pipeline.fetcher import FANTASTICJOBS_COMPANIES
        pe = FANTASTICJOBS_COMPANIES["pe_finance"]
        assert "Blackstone" in pe
        assert "KKR" in pe
        assert "Citadel" in pe
        assert "Bridgewater Associates" in pe
        assert "Two Sigma" in pe

    def test_total_company_count(self):
        from pipeline.fetcher import FANTASTICJOBS_COMPANIES
        total = sum(len(v) for v in FANTASTICJOBS_COMPANIES.values())
        assert total == 19


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


class TestFantasticjobsAPIParams:
    """Request parameters must match spec."""

    def test_company_call_params(self):
        """Company fetch uses correct params."""
        from pipeline.fetcher import _fetch_fantasticjobs_company
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = []

        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test"}):
            with patch("pipeline.fetcher.requests.get", return_value=mock_resp) as mock_get:
                _fetch_fantasticjobs_company("Goldman Sachs")

        call_kwargs = mock_get.call_args
        params = call_kwargs.kwargs.get("params") or call_kwargs[1].get("params")
        assert params["limit"] == "100"
        assert params["offset"] == "0"
        assert params["advanced_organization_filter"] == "Goldman Sachs:*"
        assert params["description_type"] == "text"
        assert params["location_filter"] == "United States"

    def test_internship_call_params(self):
        """Internship fetch uses ai_employment_type_filter=INTERN."""
        from pipeline.fetcher import _fetch_fantasticjobs_internships
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = []

        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test"}):
            with patch("pipeline.fetcher.requests.get", return_value=mock_resp) as mock_get:
                _fetch_fantasticjobs_internships()

        call_kwargs = mock_get.call_args
        params = call_kwargs.kwargs.get("params") or call_kwargs[1].get("params")
        assert params["ai_employment_type_filter"] == "INTERN"
        assert params["limit"] == "100"
        assert params["location_filter"] == "United States"


class TestFantasticjobsDedup:
    """Deduplication of overlapping company + internship results."""

    def test_dedup_removes_duplicates(self):
        from pipeline.fetcher import fetch_fantasticjobs
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        # Return same job from both company and internship calls
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

    def test_company_fetch_handles_http_error(self):
        from pipeline.fetcher import _fetch_fantasticjobs_company
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = Exception("429 Too Many Requests")

        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test"}):
            with patch("pipeline.fetcher.requests.get", return_value=mock_resp):
                result = _fetch_fantasticjobs_company("Goldman Sachs")
        assert result == []

    def test_internship_fetch_handles_error(self):
        from pipeline.fetcher import _fetch_fantasticjobs_internships
        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test"}):
            with patch("pipeline.fetcher.requests.get", side_effect=Exception("timeout")):
                result = _fetch_fantasticjobs_internships()
        assert result == []

    def test_skips_jobs_without_id(self):
        """Jobs missing 'id' field should be skipped."""
        from pipeline.fetcher import _fetch_fantasticjobs_company
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = [
            {"id": "valid1", "title": "Engineer", "organization": "Acme", "url": ""},
            {"title": "No ID Job", "organization": "Acme", "url": ""},  # missing id
            {"id": "valid2", "title": "Analyst", "organization": "Acme", "url": ""},
        ]

        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test"}):
            with patch("pipeline.fetcher.requests.get", return_value=mock_resp):
                result = _fetch_fantasticjobs_company("Acme")
        assert len(result) == 2


class TestFetchJobsIntegration:
    """fetch_jobs() must include Fantastic.jobs."""

    def test_fetch_jobs_calls_fantasticjobs(self):
        """fetch_jobs() should call fetch_fantasticjobs."""
        import inspect
        from pipeline.fetcher import fetch_jobs
        source = inspect.getsource(fetch_jobs)
        assert "fetch_fantasticjobs" in source

    def test_fetch_jobs_has_5_workers(self):
        """ThreadPoolExecutor should have 5 workers (was 4)."""
        import inspect
        from pipeline.fetcher import fetch_jobs
        source = inspect.getsource(fetch_jobs)
        assert "max_workers=5" in source


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
