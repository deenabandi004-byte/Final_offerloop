"""
Attempt search-side pre-filter for Greenhouse/Lever/Ashby jobs on Coresignal.

Approach (revised after wildcard failure):
  - Try nested match_phrase on job_sources.url with "greenhouse.io" etc.
    (proper ES text query, works on tokenized fields).
  - Rate-limit: 1.5s sleep between requests to avoid 503s.
  - Small verify pull to confirm the filter is actually restrictive.

Budget-conscious: each phase is metered and can be re-run independently.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any, Dict, List
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

API_KEY = os.environ.get("CORESIGNAL_API_KEY", "").strip()
BASE = "https://api.coresignal.com/cdapi/v2/job_multi_source"
SEARCH = f"{BASE}/search/es_dsl"
COLLECT = f"{BASE}/collect"

SLEEP = 1.5


def _headers() -> Dict[str, str]:
    return {"apikey": API_KEY, "Content-Type": "application/json", "accept": "application/json"}


def _search(query: Dict[str, Any], label: str = "") -> List[int]:
    time.sleep(SLEEP)
    for attempt in range(3):
        r = requests.post(SEARCH, headers=_headers(), json=query, timeout=30)
        if r.status_code == 200:
            ids = r.json()
            return [i for i in ids if isinstance(i, int)] if isinstance(ids, list) else []
        if r.status_code in (429, 503):
            print(f"[{label}] {r.status_code} retry {attempt+1}", file=sys.stderr)
            time.sleep(3 + attempt * 2)
            continue
        print(f"[{label}] status={r.status_code} body={r.text[:200]}", file=sys.stderr)
        return []
    print(f"[{label}] exhausted retries", file=sys.stderr)
    return []


def _collect(job_id: int) -> Dict[str, Any] | None:
    time.sleep(0.4)
    r = requests.get(f"{COLLECT}/{job_id}", headers=_headers(), timeout=25)
    if r.status_code != 200:
        return None
    return r.json()


def _base_must() -> List[Dict[str, Any]]:
    return [
        {"match": {"country": "United States"}},
        {"term": {"job_id_expired": 0}},
    ]


def _ats_filter(term: str) -> Dict[str, Any]:
    """Nested match_phrase on the URL text. Tokenized text should include the domain."""
    return {
        "nested": {
            "path": "job_sources",
            "query": {"match_phrase": {"job_sources.url": term}},
        }
    }


def phase_A_test_filter() -> None:
    """Confirm the filter is actually restrictive by comparing pool sizes."""
    print("=" * 60)
    print("PHASE A: does search-side ATS filter actually work?")
    print("=" * 60)

    baseline = _search({"query": {"bool": {"must": _base_must()}}}, "baseline")
    print(f"baseline (US + active): {len(baseline)} ids (search cap ~1000)")

    for host in ["greenhouse.io", "boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com"]:
        q = {"query": {"bool": {"must": _base_must() + [_ats_filter(host)]}}}
        ids = _search(q, host)
        pct = 100 * len(ids) / max(len(baseline), 1)
        note = " [CAPPED - filter may not be restrictive]" if len(ids) >= 1000 else ""
        print(f"  match_phrase '{host}': {len(ids):4d} ids ({pct:.1f}% of baseline){note}")

    # Also try just the tokenized domain word
    print("\n  bare-token variants (less specific):")
    for term in ["greenhouse", "lever", "ashbyhq"]:
        q = {"query": {"bool": {"must": _base_must() + [_ats_filter(term)]}}}
        ids = _search(q, term)
        pct = 100 * len(ids) / max(len(baseline), 1)
        note = " [CAPPED]" if len(ids) >= 1000 else ""
        print(f"  match_phrase '{term}': {len(ids):4d} ids ({pct:.1f}% of baseline){note}")


def phase_B_verify_filter(count: int = 10) -> None:
    """Pull real jobs from the greenhouse-filtered search; inspect their URLs."""
    print("\n" + "=" * 60)
    print(f"PHASE B: verify filter by inspecting {count} jobs (~{count*2} credits)")
    print("=" * 60)

    q = {
        "query": {
            "bool": {
                "must": _base_must() + [_ats_filter("greenhouse.io")],
            }
        }
    }
    ids = _search(q, "greenhouse-verify")
    if not ids:
        print("no ids returned; abort")
        return
    print(f"pulling first {min(count, len(ids))} of {len(ids)} greenhouse-filtered ids")

    hits = 0
    for jid in ids[:count]:
        rec = _collect(jid)
        if not rec:
            print(f"  {jid}: collect failed")
            continue
        urls = [(s.get("url") or "") for s in (rec.get("job_sources") or []) if isinstance(s, dict)]
        gh_urls = [u for u in urls if "greenhouse" in u.lower() or "grnh.se" in u.lower()]
        title = rec.get("title", "")[:50]
        company = rec.get("company_name", "")[:30]
        if gh_urls:
            hits += 1
            print(f"  ✓ {jid} [{company}] {title}: {len(gh_urls)}/{len(urls)} URLs on Greenhouse")
            print(f"      eg: {gh_urls[0][:100]}")
        else:
            print(f"  ✗ {jid} [{company}] {title}: 0/{len(urls)} URLs on Greenhouse")
            for u in urls[:3]:
                print(f"      other: {u[:100]}")
    print(f"\nverification: {hits}/{count} filtered results actually had a Greenhouse URL")


def phase_C_verticals() -> None:
    """Now that we know if filtering works, size the eligible pool per vertical."""
    print("\n" + "=" * 60)
    print("PHASE C: eligible pool size per Offerloop vertical")
    print("=" * 60)

    verticals = [
        ("SWE", {"match_phrase": {"title": "software engineer"}}),
        ("PM", {"match_phrase": {"title": "product manager"}}),
        ("Data", {"match_phrase": {"title": "data scientist"}}),
        ("Consulting", {"match_phrase": {"title": "consultant"}}),
        ("IB", {"match_phrase": {"title": "investment banking"}}),
        ("Finance", {"match_phrase": {"title": "financial analyst"}}),
        ("Marketing", {"match_phrase": {"title": "marketing manager"}}),
    ]

    ats_or = {
        "bool": {
            "should": [
                _ats_filter("greenhouse.io"),
                _ats_filter("lever.co"),
                _ats_filter("ashbyhq.com"),
            ],
            "minimum_should_match": 1,
        }
    }

    for label, v in verticals:
        total = _search({"query": {"bool": {"must": _base_must() + [v]}}}, f"total-{label}")
        eligible = _search({"query": {"bool": {"must": _base_must() + [v, ats_or]}}}, f"elig-{label}")
        pct = 100 * len(eligible) / max(len(total), 1) if total else 0
        t_note = " [CAPPED]" if len(total) >= 1000 else ""
        e_note = " [CAPPED]" if len(eligible) >= 1000 else ""
        print(f"  {label:12s}  total {len(total):4d}{t_note:11s}  eligible {len(eligible):4d}{e_note:11s}  {pct:5.1f}%")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--phase", choices=["A", "B", "C", "all"], default="all")
    p.add_argument("--verify-count", type=int, default=10)
    args = p.parse_args()

    if not API_KEY:
        print("ERROR: CORESIGNAL_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    if args.phase in ("A", "all"):
        phase_A_test_filter()
    if args.phase in ("B", "all"):
        phase_B_verify_filter(count=args.verify_count)
    if args.phase in ("C", "all"):
        phase_C_verticals()


if __name__ == "__main__":
    main()
