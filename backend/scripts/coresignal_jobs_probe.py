"""
Measure what % of Coresignal Multi-Source Jobs would be auto-apply eligible
under Offerloop's Greenhouse/Lever/Ashby gate.

Two-phase probe designed to fit inside a small trial budget:
  Phase 1 (3 credits) : one job, dump top-level keys to identify field names
  Phase 2 (~122 credits): sample N active-US jobs, bucket apply URLs

Run:  python backend/scripts/coresignal_jobs_probe.py [--sample 60]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

API_KEY = os.environ.get("CORESIGNAL_API_KEY", "").strip()
BASE = "https://api.coresignal.com/cdapi/v2/job_multi_source"
SEARCH = f"{BASE}/search/es_dsl"
COLLECT = f"{BASE}/collect"

SUPPORTED_SUFFIXES = (".greenhouse.io", ".lever.co", ".ashbyhq.com")


def _headers() -> Dict[str, str]:
    return {"apikey": API_KEY, "Content-Type": "application/json", "accept": "application/json"}


def _search(query: Dict[str, Any]) -> List[int]:
    r = requests.post(SEARCH, headers=_headers(), json=query, timeout=30)
    if r.status_code != 200:
        print(f"[search] status={r.status_code} body={r.text[:300]}", file=sys.stderr)
        r.raise_for_status()
    ids = r.json()
    if not isinstance(ids, list):
        raise RuntimeError(f"unexpected search shape: {type(ids)}")
    return [i for i in ids if isinstance(i, int)]


def _collect(job_id: int) -> Optional[Dict[str, Any]]:
    r = requests.get(f"{COLLECT}/{job_id}", headers=_headers(), timeout=25)
    if r.status_code == 404:
        return None
    if r.status_code != 200:
        print(f"[collect {job_id}] status={r.status_code} body={r.text[:200]}", file=sys.stderr)
        return None
    return r.json()


def _classify_url(url: str) -> str:
    """Bucket a URL by ATS host. Returns 'greenhouse'|'lever'|'ashby'|'workday'|'linkedin'|'indeed'|'other:<host>'|''."""
    if not url:
        return ""
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return ""
    if not host:
        return ""
    for suffix, name in (
        (".greenhouse.io", "greenhouse"),
        (".lever.co", "lever"),
        (".ashbyhq.com", "ashby"),
        (".myworkdayjobs.com", "workday"),
        (".workday.com", "workday"),
        ("linkedin.com", "linkedin"),
        ("indeed.com", "indeed"),
        ("ziprecruiter.com", "ziprecruiter"),
        ("glassdoor.com", "glassdoor"),
        ("icims.com", "icims"),
        ("smartrecruiters.com", "smartrecruiters"),
        ("successfactors.com", "successfactors"),
        ("taleo.net", "taleo"),
        ("bamboohr.com", "bamboohr"),
    ):
        if host == suffix.lstrip(".") or host.endswith(suffix):
            return name
    return f"other:{host}"


def phase1_dump_schema() -> Dict[str, Any]:
    """One job. Print top-level keys so we can identify apply-URL + active-status fields."""
    print("=" * 60)
    print("PHASE 1: schema probe (1 search + 2 collect = 3 credits)")
    print("=" * 60)
    ids = _search({"query": {"match_all": {}}})
    if not ids:
        raise RuntimeError("phase 1 search returned zero ids")
    print(f"search returned {len(ids)} ids (capped by Coresignal internal limit)")
    sample_id = ids[0]
    rec = _collect(sample_id)
    if not rec:
        raise RuntimeError(f"phase 1 collect failed for {sample_id}")
    print(f"\nfull record (id={sample_id}):")
    print(json.dumps(rec, indent=2, default=str)[:3000])
    print("\ntop-level keys:")
    for k in sorted(rec.keys()):
        v = rec[k]
        preview = repr(v)[:80] if not isinstance(v, (list, dict)) else f"<{type(v).__name__} len={len(v)}>"
        print(f"  {k}: {preview}")
    return rec


def _collect_job_urls(rec: Dict[str, Any]) -> List[str]:
    """Every apply-relevant URL on a Coresignal multi-source job record."""
    urls: List[str] = []
    ext = (rec.get("external_url") or "").strip()
    if ext:
        urls.append(ext)
    for src in rec.get("job_sources") or []:
        if isinstance(src, dict):
            u = (src.get("url") or "").strip()
            if u:
                urls.append(u)
    return urls


def phase2_measure(sample_size: int) -> None:
    """Sample active US jobs, classify EVERY source URL, then compute per-job eligibility."""
    print("\n" + "=" * 60)
    print(f"PHASE 2: measure apply-url distribution (sample={sample_size})")
    print(f"  credits: 1 search + {sample_size * 2} collect = {1 + sample_size * 2}")
    print("=" * 60)

    # Active US postings, filtered to Offerloop's actual audience (tech roles).
    # match_phrase on title so "software engineer" matches "Software Engineer II" etc
    # but NOT "software engineering manager".
    query = {
        "query": {
            "bool": {
                "must": [
                    {"match": {"country": "United States"}},
                    {"term": {"job_id_expired": 0}},
                    {"match_phrase": {"title": "software engineer"}},
                ]
            }
        }
    }

    ids = _search(query)
    print(f"search returned {len(ids)} ids; sampling first {sample_size}")
    if len(ids) < sample_size:
        print(f"WARN: only {len(ids)} ids available, adjusting sample")
        sample_size = len(ids)

    target_ids = ids[:sample_size]
    records: List[Dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(_collect, jid): jid for jid in target_ids}
        for fut in as_completed(futures):
            rec = fut.result()
            if rec:
                records.append(rec)

    print(f"collected {len(records)}/{sample_size} records")

    url_bucket: Counter[str] = Counter()
    job_bucket_hits: Counter[str] = Counter()
    jobs_with_no_urls = 0
    eligible_jobs = 0
    sample_urls: Dict[str, str] = {}
    per_job_source_count: List[int] = []

    for rec in records:
        urls = _collect_job_urls(rec)
        per_job_source_count.append(len(urls))
        if not urls:
            jobs_with_no_urls += 1
            continue
        buckets_this_job = set()
        for u in urls:
            b = _classify_url(u) or "unknown"
            url_bucket[b] += 1
            sample_urls.setdefault(b, u)
            buckets_this_job.add(b)
        for b in buckets_this_job:
            job_bucket_hits[b] += 1
        if buckets_this_job & {"greenhouse", "lever", "ashby"}:
            eligible_jobs += 1

    total = len(records)
    avg_sources = sum(per_job_source_count) / max(total, 1)
    total_urls = sum(url_bucket.values())

    print(f"\n--- RESULTS ---")
    print(f"total jobs collected:     {total}")
    print(f"jobs with 0 URLs:         {jobs_with_no_urls}")
    print(f"avg URLs per job:         {avg_sources:.1f}")
    print(f"total URLs classified:    {total_urls}")
    print(f"")
    print(f"AUTO-APPLY ELIGIBLE JOBS: {eligible_jobs}/{total} = {100*eligible_jobs/max(total,1):.1f}%")
    print(f"  (job counts if ANY of its source URLs is Greenhouse/Lever/Ashby)")

    print(f"\nper-JOB hostname reach (how many jobs have at least one URL on each host):")
    for bucket, count in job_bucket_hits.most_common():
        pct = 100 * count / max(total, 1)
        marker = "  <-- ELIGIBLE" if bucket in ("greenhouse", "lever", "ashby") else ""
        print(f"  {count:4d} jobs ({pct:5.1f}%)  {bucket}{marker}")

    print(f"\nper-URL distribution (all {total_urls} source URLs across all jobs):")
    for bucket, count in url_bucket.most_common(20):
        pct = 100 * count / max(total_urls, 1)
        example = sample_urls.get(bucket, "")
        marker = "  <-- ELIGIBLE" if bucket in ("greenhouse", "lever", "ashby") else ""
        print(f"  {count:4d} ({pct:5.1f}%)  {bucket}{marker}")
        if example and bucket in ("greenhouse", "lever", "ashby"):
            print(f"       eg: {example[:100]}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", type=int, default=60, help="phase-2 sample size (credits = 2*sample+1)")
    parser.add_argument("--url-field", default="", help="override url field name after phase-1 discovery")
    parser.add_argument("--active-field", default="", help="override active field name (blank = no filter)")
    parser.add_argument("--skip-phase1", action="store_true")
    args = parser.parse_args()

    if not API_KEY:
        print("ERROR: CORESIGNAL_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    if not args.skip_phase1:
        phase1_dump_schema()

    phase2_measure(args.sample)


if __name__ == "__main__":
    main()
