"""Phase 0 test: does the HarvestAPI employees actor return the fields we need?

Runs the `harvestapi/linkedin-company-employees` actor in Full mode ($8/1k)
against a small target firm — Centerview Partners (~500 employees) —
saves raw JSON, then reports:

  - Actual profile count
  - Which of our required fields are present:
      * name / firstName / lastName
      * linkedinUrl
      * currentTitle / headline
      * currentCompany
      * schools[] (education, name of institution)  <-- critical for
        "alumni from my school at this firm" queries
      * joinedCompanyYear or currentPositionStartDate (tenure filter)
      * office / location (US-only filter)
  - Coverage % per field (some profiles are private)
  - Approximate USD cost (from Apify run metadata if surfaced)

Cost: ~$4 for a 500-profile Full-mode scrape. Set --max-employees lower to
smoke-test cheaper first (100 profiles = $0.80).

Usage:
    cd ~/work/Offerloop
    APIFY_API_KEY=<key> python backend/scripts/test_apify_employee_scrape.py
    APIFY_API_KEY=<key> python backend/scripts/test_apify_employee_scrape.py \\
        --company-url https://www.linkedin.com/company/centerview-partners \\
        --max-employees 100 \\
        --mode full

Requires: APIFY_API_KEY in env (same key already used by the app).
Output:   backend/scripts/apify_test_output/<slug>_<mode>_<ts>.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

import requests


ACTOR_ID = "harvestapi~linkedin-company-employees"
RUN_SYNC_URL = f"https://api.apify.com/v2/acts/{ACTOR_ID}/run-sync-get-dataset-items"

# Confirmed field names from HarvestAPI profile-scraper schema:
#   id, publicIdentifier, location{parsed.city/state/country/countryCode},
#   education[]{schoolName, degree, fieldOfStudy, startDate, endDate, period},
#   experience[]{position, companyName, employmentType, startDate, endDate, duration},
#   currentPosition[]{companyName}
REQUIRED_FIELDS = [
    "id", "publicIdentifier",       # stable dedup key
    "name", "firstName", "lastName",
    "linkedinUrl",
    "headline",
    "location",                     # nested object
    "currentPosition",              # array with companyName
]
FULL_MODE_FIELDS = [
    "education",                    # for "alumni from X" queries
    "experience",                   # for tenure filter (derive joined_year)
    "about",
    "skills",
]

OUT_DIR = Path(__file__).resolve().parent / "apify_test_output"


def _coverage(items: list[dict], field: str) -> tuple[int, float]:
    hits = 0
    for it in items:
        v = it.get(field)
        if v not in (None, "", [], {}):
            hits += 1
    return hits, (100.0 * hits / max(1, len(items)))


def _first_present_field(item: dict, candidates: list[str]) -> str | None:
    for k in candidates:
        v = item.get(k)
        if v not in (None, "", [], {}):
            return k
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--company-url",
        default="https://www.linkedin.com/company/centerview-partners",
        help="LinkedIn company URL to scrape (default: Centerview Partners)",
    )
    parser.add_argument(
        "--max-employees",
        type=int,
        default=100,
        help="Cap on employees returned. Default 100 = ~$0.80 in Full mode. "
             "500 = ~$4. LinkedIn hard-caps at 2500/query.",
    )
    parser.add_argument(
        "--mode",
        choices=["short", "full", "full_email"],
        default="full",
        help="short=$4/1k, full=$8/1k, full_email=$12/1k. Default: full",
    )
    # HarvestAPI expects the human-readable enum strings, not slugs.
    MODE_ENUM = {
        "short":      "Short ($4 per 1k)",
        "full":       "Full ($8 per 1k)",
        "full_email": "Full + email search ($12 per 1k)",
    }
    parser.add_argument(
        "--timeout",
        type=int,
        default=600,
        help="Sync timeout in seconds (default 10 min)",
    )
    args = parser.parse_args()

    api_key = os.environ.get("APIFY_API_KEY")
    if not api_key:
        print("ERROR: APIFY_API_KEY not set. `export APIFY_API_KEY=...`")
        sys.exit(1)

    OUT_DIR.mkdir(exist_ok=True, parents=True)
    slug = args.company_url.rstrip("/").split("/")[-1] or "unknown"
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_path = OUT_DIR / f"{slug}_{args.mode}_{ts}.json"

    # HarvestAPI employees actor input shape (from docs):
    #   companies: [url]           -- one or more company URLs
    #   maxItems: n                -- hard cap
    #   profileScraperMode: "short"|"full"|"full_email"
    payload = {
        "companies": [args.company_url],
        "maxItems": args.max_employees,
        "profileScraperMode": MODE_ENUM[args.mode],
    }

    print(f"→ Actor:        {ACTOR_ID}")
    print(f"→ Company:      {args.company_url}")
    print(f"→ maxItems:     {args.max_employees}")
    print(f"→ Mode:         {args.mode}")
    est_cost = args.max_employees * {"short": 4, "full": 8, "full_email": 12}[args.mode] / 1000
    print(f"→ Est. max USD: ${est_cost:.2f} (if actor returns the full requested count)")
    print()

    t0 = time.time()
    print(f"[{time.strftime('%H:%M:%S')}] Starting sync run...")
    resp = requests.post(
        RUN_SYNC_URL,
        params={"token": api_key},
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=args.timeout,
    )
    dur = time.time() - t0
    print(f"[{time.strftime('%H:%M:%S')}] HTTP {resp.status_code} in {dur:.1f}s")

    if resp.status_code not in (200, 201):
        print(f"ERROR: {resp.text[:800]}")
        sys.exit(2)

    items = resp.json()
    if not isinstance(items, list):
        print(f"Unexpected response shape: {type(items).__name__}")
        sys.exit(3)

    with open(out_path, "w") as f:
        json.dump(items, f, indent=2, default=str)
    print(f"→ Saved raw output: {out_path}")
    print()

    if not items:
        print("Actor returned 0 items. Possible reasons:")
        print("  - Company URL invalid or inaccessible")
        print("  - Rate limit / IP block")
        print("  - Actor input schema drifted (check `companies` vs `startUrls`)")
        return

    print(f"=== Results: {len(items)} profiles ===\n")

    # Show shape of first item (top-level keys only)
    sample = items[0]
    print("First profile top-level keys:")
    for k in sorted(sample.keys()):
        v = sample[k]
        preview = str(v)[:60].replace("\n", " ")
        print(f"  {k:<30} {preview}")
    print()

    # Coverage report
    print("=== Field coverage (all profiles) ===\n")
    print(f"{'Field':<30}{'Present':>10}{'%':>8}")
    print("-" * 48)
    for f in REQUIRED_FIELDS + FULL_MODE_FIELDS:
        hits, pct = _coverage(items, f)
        marker = ""
        if f in ("education", "schools") and pct < 50:
            marker = "  ⚠ LOW — alumni queries will miss"
        if f in ("linkedinUrl", "publicIdentifier") and pct < 90:
            marker = "  ⚠ LOW — dedup key unstable"
        print(f"{f:<30}{hits:>10}{pct:>7.0f}%{marker}")

    # Pick best canonical field for each of our schema slots
    print("\n=== Recommended field mapping to firm_employees schema ===\n")
    id_field = _first_present_field(sample, ["publicIdentifier", "id", "profileId", "linkedinId"])
    url_field = _first_present_field(sample, ["linkedinUrl", "profileUrl", "url"])
    name_field = _first_present_field(sample, ["name", "fullName"])
    title_field = _first_present_field(sample, ["headline", "currentTitle", "position", "jobTitle"])
    loc_field = _first_present_field(sample, ["location", "geoLocation", "locationName"])
    edu_field = _first_present_field(sample, ["education", "schools", "educations"])
    exp_field = _first_present_field(sample, ["experience", "positions", "experiences"])
    print(f"  linkedin_id      ← {id_field}")
    print(f"  profile_url      ← {url_field}")
    print(f"  name             ← {name_field}")
    print(f"  title            ← {title_field}")
    print(f"  location         ← {loc_field}")
    print(f"  schools[]        ← {edu_field}  (need to flatten to school names)")
    print(f"  experience[]     ← {exp_field}  (need to derive joined_year)")

    # School distribution — sanity check that education data is actually usable
    if edu_field:
        school_counter: Counter[str] = Counter()
        for it in items:
            edu = it.get(edu_field) or []
            if not isinstance(edu, list):
                continue
            for e in edu:
                if not isinstance(e, dict):
                    continue
                # HarvestAPI schema: schoolName. Fallbacks for other actors.
                name = (
                    e.get("schoolName")
                    or e.get("school")
                    or e.get("institutionName")
                    or e.get("name")
                    or ""
                ).strip()
                if name:
                    school_counter[name] += 1
        print(f"\n=== Top 15 schools across all {len(items)} employees ===\n")
        for school, n in school_counter.most_common(15):
            print(f"  {n:>4}  {school}")
        print(f"\nTotal distinct schools seen: {len(school_counter)}")
        if len(school_counter) == 0:
            print("⚠ NO schools extracted — check the education field structure in the raw JSON")

    print(f"\n→ Full raw output saved to: {out_path}")
    print("Next: inspect the JSON to confirm the exact nested shape before writing the normalizer.")


if __name__ == "__main__":
    main()
