"""
Pull ATS slugs from SimplifyJobs' curated listing repos and write net-new
entries to backend/pipeline/data/ats_companies/extras.txt.

Two upstream sources (both community-maintained, MIT):
  - SimplifyJobs/Summer2026-Internships  — internship postings
  - SimplifyJobs/New-Grad-Positions        — new-grad + entry-level postings

Both ship `listings.json` in /.github/scripts/. Each entry has an `url` field
pointing at the apply page. When that URL lands on boards.greenhouse.io /
jobs.lever.co / jobs.ashbyhq.com, we extract the tenant slug and add it to
extras.txt. slug_loader unions extras into the cold tier at load time.

Deduped against:
  - Vendored jobhive CSVs (backend/pipeline/data/ats_companies/*.csv)
  - hot_slugs.txt
  - Existing extras.txt entries

Idempotent + safe to re-run. Prints a summary of net-new adds per ATS.

Run:  python -m backend.scripts.pull_simplify_slugs
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

import requests

DATA_DIR = Path(__file__).parent.parent / "pipeline" / "data" / "ats_companies"
EXTRAS = DATA_DIR / "extras.txt"
HOT = DATA_DIR / "hot_slugs.txt"

SOURCES = [
    ("simplify-summer", "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json"),
    ("simplify-newgrad", "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json"),
]

# Regex per ATS to peel the slug out of a canonical apply URL. First capture
# group is the slug. Non-matching URLs (LinkedIn, workday, custom domains)
# are silently skipped — Offerloop's auto-apply only speaks the three ATSes.
_URL_PATTERNS = {
    "greenhouse": [
        re.compile(r"boards(?:-api)?\.greenhouse\.io/([^/?#]+)", re.I),
        re.compile(r"job-boards\.greenhouse\.io/([^/?#]+)", re.I),
    ],
    "lever": [re.compile(r"jobs\.lever\.co/([^/?#]+)", re.I)],
    "ashby": [re.compile(r"jobs\.ashbyhq\.com/([^/?#]+)", re.I),
              re.compile(r"jobs\.ashbyhq\.com/api/non-user-graphql\?operationName=ApiJobPosting.*org=([^&#]+)", re.I)],
}


def _extract_slug(url: str) -> tuple[str, str] | None:
    """Return (ats, slug) if URL matches a supported ATS pattern; else None."""
    if not url:
        return None
    for ats, patterns in _URL_PATTERNS.items():
        for p in patterns:
            m = p.search(url)
            if m:
                slug = m.group(1).strip().lower()
                if slug and slug not in ("api", "v1", "boards"):  # avoid path-fragment false positives
                    return (ats, slug)
    return None


def _load_jobhive_slugs() -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for ats in ("greenhouse", "lever", "ashby"):
        with (DATA_DIR / f"{ats}.csv").open() as f:
            out[ats] = {(row.get("slug") or "").strip() for row in csv.DictReader(f) if row.get("slug")}
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
        ats, slug = ats.strip().lower(), slug.strip()
        if ats in out and slug:
            out[ats].add(slug)
    return out


def _fetch_listings(url: str) -> list[dict]:
    print(f"fetching {url}", file=sys.stderr)
    r = requests.get(url, timeout=90)
    r.raise_for_status()
    data = json.loads(r.text)
    if not isinstance(data, list):
        raise RuntimeError(f"expected list, got {type(data).__name__}")
    return data


def main() -> None:
    jobhive = _load_jobhive_slugs()
    hot = _parse_ats_slug_file(HOT)
    existing_extras = _parse_ats_slug_file(EXTRAS)

    # Anything already known via jobhive OR curated in hot OR previously in
    # extras is a dupe → skip.
    known: dict[str, set[str]] = {
        a: jobhive[a] | hot[a] | existing_extras[a]
        for a in ("greenhouse", "lever", "ashby")
    }

    new_finds: dict[str, dict[str, str]] = {"greenhouse": {}, "lever": {}, "ashby": {}}
    seen_urls = 0
    matched_urls = 0

    for label, url in SOURCES:
        try:
            listings = _fetch_listings(url)
        except Exception as e:
            print(f"WARN: {label} fetch failed: {e}", file=sys.stderr)
            continue
        for item in listings:
            if not isinstance(item, dict):
                continue
            seen_urls += 1
            u = item.get("url") or ""
            hit = _extract_slug(u)
            if not hit:
                continue
            matched_urls += 1
            ats, slug = hit
            if slug in known[ats]:
                continue
            if slug in new_finds[ats]:
                continue
            company_name = item.get("company_name") or ""
            new_finds[ats][slug] = company_name

    total_new = sum(len(v) for v in new_finds.values())
    print()
    print("=" * 60)
    print("SIMPLIFYJOBS PULL SUMMARY")
    print("=" * 60)
    print(f"  URLs scanned:         {seen_urls:,}")
    print(f"  URLs matched to ATS:  {matched_urls:,}")
    for ats in ("greenhouse", "lever", "ashby"):
        print(f"  {ats:11s} net-new: {len(new_finds[ats]):>4d}  (known: {len(known[ats])})")
    print(f"  total net-new:        {total_new}")

    if not total_new:
        print("nothing new. exiting.")
        return

    # Append to extras.txt preserving prior content
    header_needed = not EXTRAS.exists() or EXTRAS.stat().st_size == 0
    with EXTRAS.open("a") as f:
        if header_needed:
            f.write("# Ancillary slug source — Phase 2 volume push.\n")
            f.write("# Format: {ats}:{slug} per line. Merged into cold tier by slug_loader.\n")
            f.write("# Regenerate: python -m backend.scripts.pull_simplify_slugs\n")
        f.write(f"\n# --- SimplifyJobs pull ({total_new} new slugs) ---\n")
        for ats in ("greenhouse", "lever", "ashby"):
            for slug in sorted(new_finds[ats]):
                name = new_finds[ats][slug]
                comment = f"  # {name}" if name else ""
                f.write(f"{ats}:{slug}{comment}\n")

    print(f"wrote {total_new} slugs to {EXTRAS}")


if __name__ == "__main__":
    main()
