"""
YC directory scraper: fetch all YC companies from the public API, probe each
against Greenhouse/Lever/Ashby public endpoints, append matched slugs to
extras.txt.

YC's public API at https://api.ycombinator.com/v0.1/companies is paginated
and returns each company's slug + website. We derive multiple slug candidates
per company (yc.slug, name-normalized variants) and HEAD-request each ATS's
public endpoint. Any 200 response = confirmed slug → add.

Idempotent: dedupes against jobhive CSVs + hot_slugs.txt + existing extras.txt.

Run:  python -m backend.scripts.pull_yc_slugs
"""
from __future__ import annotations

import csv
import json
import re
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Iterable

DATA_DIR = Path(__file__).parent.parent / "pipeline" / "data" / "ats_companies"
EXTRAS = DATA_DIR / "extras.txt"
HOT = DATA_DIR / "hot_slugs.txt"

YC_API = "https://api.ycombinator.com/v0.1/companies?count=500"

# HEAD-check endpoints. 200 = tenant exists; 404 = no such slug.
ATS_PROBE = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
    "lever":      "https://api.lever.co/v0/postings/{slug}?mode=json",
    "ashby":      "https://api.ashbyhq.com/posting-api/job-board/{slug}",
}

REQUEST_TIMEOUT = 10
CONCURRENCY = 24  # per-ATS pool cap; matches fetcher.py
USER_AGENT = "OfferloopJobBot/1.0 (+https://offerloop.ai; contact@offerloop.ai)"

# Slug tokens too generic to trust — skip probing to avoid false positives.
_BAD_SLUG = re.compile(r"^(api|www|test|admin|home)$", re.I)


def _fetch_all_yc_companies() -> list[dict]:
    """Walk YC's paginated API. Returns full list."""
    companies: list[dict] = []
    url = YC_API
    page = 0
    while url and page < 50:  # hard cap ~25K companies
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read())
        except Exception as e:
            print(f"YC fetch failed on page {page}: {e}", file=sys.stderr)
            break
        page += 1
        batch = data.get("companies") or []
        companies.extend(batch)
        next_page = data.get("nextPage")
        if not next_page:
            break
        url = next_page
        print(f"  YC page {page}: +{len(batch)} (total {len(companies)})", file=sys.stderr)
    return companies


def _candidates(company: dict) -> list[str]:
    """Generate plausible slug candidates for one company."""
    out: list[str] = []
    yc_slug = (company.get("slug") or "").strip().lower()
    name = (company.get("name") or "").strip().lower()
    seen: set[str] = set()

    def _add(s: str) -> None:
        s = s.strip().lower()
        if not s or _BAD_SLUG.match(s) or s in seen:
            return
        seen.add(s)
        out.append(s)

    if yc_slug:
        _add(yc_slug)
    if name:
        _add(re.sub(r"[^a-z0-9]", "", name))       # "Foo Bar" → "foobar"
        _add(re.sub(r"[^a-z0-9]+", "-", name).strip("-"))  # "Foo Bar" → "foo-bar"
    return out


def _probe_one(ats: str, slug: str) -> bool:
    """HEAD the ATS's public endpoint. True = tenant exists."""
    url = ATS_PROBE[ats].format(slug=slug)
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as r:
            return 200 <= r.status < 300
    except urllib.error.HTTPError as e:
        # Some ATSes 405 HEAD but 200 GET; try GET as fallback for 405 only.
        if e.code == 405:
            try:
                req_get = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req_get, timeout=REQUEST_TIMEOUT) as r:
                    return 200 <= r.status < 300
            except Exception:
                return False
        return False
    except Exception:
        return False


def _load_jobhive_slugs() -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for ats in ("greenhouse", "lever", "ashby"):
        with (DATA_DIR / f"{ats}.csv").open() as f:
            out[ats] = {(row.get("slug") or "").strip().lower() for row in csv.DictReader(f) if row.get("slug")}
    return out


def _parse_ats_slug_file(path: Path) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {"greenhouse": set(), "lever": set(), "ashby": set()}
    if not path.exists():
        return out
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.split("  #", 1)[0].strip()
        if ":" not in line:
            continue
        ats, slug = line.split(":", 1)
        ats, slug = ats.strip().lower(), slug.strip().lower()
        if ats in out and slug:
            out[ats].add(slug)
    return out


def main() -> None:
    print("fetching YC companies...", file=sys.stderr)
    companies = _fetch_all_yc_companies()
    print(f"YC total: {len(companies)}", file=sys.stderr)

    jobhive = _load_jobhive_slugs()
    hot = _parse_ats_slug_file(HOT)
    existing_extras = _parse_ats_slug_file(EXTRAS)
    known: dict[str, set[str]] = {
        a: jobhive[a] | hot[a] | existing_extras[a] for a in ("greenhouse", "lever", "ashby")
    }

    # Build all (ats, slug, company) probe tuples, deduping candidates against known.
    probes: list[tuple[str, str, dict]] = []
    for c in companies:
        cands = _candidates(c)
        for slug in cands:
            for ats in ("greenhouse", "lever", "ashby"):
                if slug not in known[ats]:
                    probes.append((ats, slug, c))

    # Dedup probe tuples themselves (multiple companies may generate same slug)
    seen_probes: set[tuple[str, str]] = set()
    dedup_probes: list[tuple[str, str, dict]] = []
    for p in probes:
        k = (p[0], p[1])
        if k in seen_probes:
            continue
        seen_probes.add(k)
        dedup_probes.append(p)

    print(f"probing {len(dedup_probes)} (ats, slug) candidates with {CONCURRENCY}-way concurrency", file=sys.stderr)

    hits: dict[str, dict[str, str]] = {"greenhouse": {}, "lever": {}, "ashby": {}}
    checked = 0
    start = time.time()
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        future_map = {pool.submit(_probe_one, ats, slug): (ats, slug, company)
                      for ats, slug, company in dedup_probes}
        for fut in as_completed(future_map):
            ats, slug, company = future_map[fut]
            checked += 1
            if checked % 500 == 0:
                elapsed = time.time() - start
                rate = checked / max(elapsed, 0.1)
                print(f"  progress: {checked}/{len(dedup_probes)} probed ({rate:.0f}/s), hits so far: {sum(len(v) for v in hits.values())}", file=sys.stderr)
            try:
                ok = fut.result()
            except Exception:
                ok = False
            if ok:
                hits[ats][slug] = company.get("name") or ""

    total = sum(len(v) for v in hits.values())
    print()
    print("=" * 60)
    print("YC DIRECTORY PROBE SUMMARY")
    print("=" * 60)
    print(f"  YC companies scanned:   {len(companies):,}")
    print(f"  (ats, slug) probed:     {len(dedup_probes):,}")
    for ats in ("greenhouse", "lever", "ashby"):
        print(f"  {ats:11s} net-new:  {len(hits[ats]):>4d}  (known before: {len(known[ats])})")
    print(f"  total net-new:          {total}")

    if not total:
        print("nothing new. exiting.")
        return

    with EXTRAS.open("a") as f:
        f.write(f"\n# --- YC directory pull ({total} new slugs) ---\n")
        for ats in ("greenhouse", "lever", "ashby"):
            for slug in sorted(hits[ats]):
                name = hits[ats][slug]
                comment = f"  # {name}" if name else ""
                f.write(f"{ats}:{slug}{comment}\n")

    print(f"wrote {total} slugs to {EXTRAS}")


if __name__ == "__main__":
    main()
