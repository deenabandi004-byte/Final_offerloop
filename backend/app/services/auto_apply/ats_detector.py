"""
Route a job to the right ATS form-filler. Inputs come straight from the
FantasticJobs ingestion path (backend/pipeline/fetcher.py:636-638), which tags
each job with ats_platform / ats_source_type / ats_source_domain.

Phase 1 supports guest-application ATSes only: Greenhouse, Lever, Ashby.
Workday (per-company accounts), LinkedIn Easy Apply (auth wall), and
custom career pages are explicitly out of scope.
"""
from __future__ import annotations

from typing import Optional

from app.config import SUPPORTED_AUTO_APPLY_ATS


_DOMAIN_TO_PLATFORM = {
    "boards.greenhouse.io": "greenhouse",
    "job-boards.greenhouse.io": "greenhouse",
    "jobs.lever.co": "lever",
    "jobs.ashbyhq.com": "ashby",
}


def detect_platform(job: dict) -> Optional[str]:
    """Return the normalized ats_platform if the job is eligible, else None.

    Three signals, in priority order:
      1. `ats_platform` — explicit FJ tag. If set to anything, it's authoritative.
      2. `ats_source_domain` — also FJ. Same authority rule.
      3. `job_id` prefix — pipeline naming convention `{source}_{slug}_{ext_id}`.
         Only consulted when FJ tagging is absent (legacy / pre-tagging docs).

    The priority rule matters: an FJ-tagged `ats_platform="workday"` must NOT
    be overridden by a `greenhouse_*` job_id prefix, even though the prefix
    happens to match a supported ATS. FJ is the source of truth when it spoke."""
    raw_platform = (job.get("ats_platform") or "").lower().strip()
    if raw_platform:
        return raw_platform if raw_platform in SUPPORTED_AUTO_APPLY_ATS else None

    raw_domain = (job.get("ats_source_domain") or "").lower().strip()
    if raw_domain:
        mapped = _DOMAIN_TO_PLATFORM.get(raw_domain)
        return mapped if mapped in SUPPORTED_AUTO_APPLY_ATS else None

    job_id = str(job.get("job_id") or job.get("id") or "").lower().strip()
    if "_" in job_id:
        prefix = job_id.split("_", 1)[0]
        if prefix in SUPPORTED_AUTO_APPLY_ATS:
            return prefix

    return None


def is_eligible(job: dict) -> bool:
    """Auto-apply gate: must resolve to a supported ATS AND not be expired."""
    if job.get("expired") is True:
        return False
    return detect_platform(job) is not None
