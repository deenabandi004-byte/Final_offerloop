"""
Weekly jobhive sync — pull latest ATS company lists, diff against vendored,
overwrite locally. Called by .github/workflows/ats-companies-sync.yml which
then opens a PR if `git status` shows any changes.

Human reviews the PR. Merging resurrects previously-dead slugs (they re-enter
the crawl on the next run) and adds new companies that jobhive has picked
up since our last sync.

Safe to run locally + idempotent. Prints a summary that maps 1:1 to the
PR description the workflow constructs.

Run:  python -m backend.scripts.sync_jobhive_csvs
      python -m backend.scripts.sync_jobhive_csvs --dry-run
"""
from __future__ import annotations

import argparse
import csv
import io
import sys
from pathlib import Path
from typing import Iterable

import requests

JOBHIVE_BASE = "https://raw.githubusercontent.com/kalil0321/ats-scrapers/main/ats-companies"
DATA_DIR = Path(__file__).parent.parent / "pipeline" / "data" / "ats_companies"
ATSES = ("greenhouse", "lever", "ashby")


def _fetch_upstream(ats: str) -> str:
    """Download the latest CSV text for one ATS. Fail loudly (workflow retries)."""
    url = f"{JOBHIVE_BASE}/{ats}.csv"
    print(f"fetching {url}", file=sys.stderr)
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return r.text


def _slug_set(csv_text: str) -> set[str]:
    reader = csv.DictReader(io.StringIO(csv_text))
    return {(row.get("slug") or "").strip() for row in reader if row.get("slug")}


def _diff_ats(ats: str, dry_run: bool) -> dict:
    """Fetch upstream, diff vs vendored, write if not dry-run. Returns summary."""
    local_path = DATA_DIR / f"{ats}.csv"
    upstream_text = _fetch_upstream(ats)
    upstream_slugs = _slug_set(upstream_text)

    if not local_path.exists():
        local_slugs: set[str] = set()
    else:
        local_slugs = _slug_set(local_path.read_text())

    added = upstream_slugs - local_slugs
    removed = local_slugs - upstream_slugs

    if not (added or removed):
        return {"ats": ats, "added": 0, "removed": 0, "total": len(upstream_slugs), "unchanged": True}

    if not dry_run:
        local_path.write_text(upstream_text)

    return {
        "ats": ats,
        "added": len(added),
        "removed": len(removed),
        "total": len(upstream_slugs),
        "added_sample": sorted(added)[:5],
        "removed_sample": sorted(removed)[:5],
        "unchanged": False,
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true",
                   help="fetch + diff but don't write CSVs")
    args = p.parse_args()

    summaries = [_diff_ats(ats, dry_run=args.dry_run) for ats in ATSES]

    print()
    print("=" * 60)
    print(f"JOBHIVE SYNC SUMMARY {'(DRY RUN)' if args.dry_run else ''}")
    print("=" * 60)
    any_changed = False
    for s in summaries:
        if s["unchanged"]:
            print(f"  {s['ats']:11s}: unchanged ({s['total']} slugs)")
        else:
            any_changed = True
            print(f"  {s['ats']:11s}: +{s['added']} -{s['removed']} (now {s['total']} slugs)")
            if s.get("added_sample"):
                print(f"    +sample: {', '.join(s['added_sample'])}")
            if s.get("removed_sample"):
                print(f"    -sample: {', '.join(s['removed_sample'])}")

    # Exit code convention for the workflow: 0=nothing to do (skip PR),
    # 42=diff detected (workflow opens PR).
    sys.exit(42 if any_changed and not args.dry_run else 0)


if __name__ == "__main__":
    main()
