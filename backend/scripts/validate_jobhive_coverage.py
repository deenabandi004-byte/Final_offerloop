"""
Validate jobhive's Greenhouse/Lever/Ashby coverage against companies Offerloop
users actually care about.

Aggregates company names from four Firestore signals (strongest first):
  1. users/{uid}/savedJobs.company        — user saved this exact posting
  2. users/{uid}/autoApplyJobs.company    — user tried to auto-apply
  3. users/{uid}/manual_firms/{doc}.name  — user tracked this firm
  4. users/{uid}/contacts.company         — user has a contact there

Then cross-references each distinct company against jobhive's three CSVs
(pulled fresh from GitHub) and reports hit rate per signal.

Run:  python backend/scripts/validate_jobhive_coverage.py
      python backend/scripts/validate_jobhive_coverage.py --show-misses 40
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import re
import sys
from collections import Counter, defaultdict
from typing import Dict, List, Set, Tuple

import firebase_admin
import requests
from firebase_admin import credentials, firestore


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()

JOBHIVE_BASE = "https://raw.githubusercontent.com/kalil0321/ats-scrapers/main/ats-companies"
JOBHIVE_FILES = {
    "greenhouse": f"{JOBHIVE_BASE}/greenhouse.csv",
    "lever":      f"{JOBHIVE_BASE}/lever.csv",
    "ashby":      f"{JOBHIVE_BASE}/ashby.csv",
}

# Strip these as suffix tokens (case-insensitive, after normalization).
_SUFFIX_TOKENS = {
    "inc", "incorporated", "llc", "llp", "ltd", "limited", "corp", "corporation",
    "co", "company", "gmbh", "sa", "plc", "ag", "holdings", "group", "labs",
    "technologies", "tech", "systems", "solutions", "the",
}


def normalize(name: str) -> str:
    """Aggressive normalization: lowercase, drop punctuation, strip corporate suffixes."""
    if not name:
        return ""
    s = name.lower().strip()
    # replace &-and, drop punctuation
    s = s.replace("&", "and")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    tokens = [t for t in s.split() if t]
    # trim trailing suffix tokens (may be multiple: "Acme Inc Ltd")
    while tokens and tokens[-1] in _SUFFIX_TOKENS:
        tokens.pop()
    # also trim leading "the"
    if tokens and tokens[0] == "the":
        tokens = tokens[1:]
    return " ".join(tokens)


def load_jobhive() -> Tuple[Dict[str, Set[str]], Dict[str, int]]:
    """Fetch jobhive CSVs. Returns (per-ATS normalized-name sets, raw row counts)."""
    ats_sets: Dict[str, Set[str]] = {}
    ats_counts: Dict[str, int] = {}
    for ats, url in JOBHIVE_FILES.items():
        print(f"fetching {ats} csv...", file=sys.stderr)
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        reader = csv.DictReader(io.StringIO(r.text))
        names: Set[str] = set()
        raw = 0
        for row in reader:
            raw += 1
            name = row.get("name") or row.get("company") or ""
            n = normalize(name)
            if n:
                names.add(n)
        ats_sets[ats] = names
        ats_counts[ats] = raw
        print(f"  {ats}: {raw} rows -> {len(names)} distinct normalized names", file=sys.stderr)
    # union: single "any ATS" set for the primary hit-rate question
    ats_sets["any"] = set().union(*ats_sets.values())
    return ats_sets, ats_counts


def collect_user_signals() -> Dict[str, Counter]:
    """Walk Firestore, collect distinct normalized company names per signal."""
    db = get_db()
    signals: Dict[str, Counter] = {
        "savedJobs":     Counter(),
        "autoApplyJobs": Counter(),
        "manual_firms":  Counter(),
        "contacts":      Counter(),
    }

    # Collection group queries — one pass across all users each.
    for signal, field, cg in [
        ("savedJobs",     "company", "savedJobs"),
        ("autoApplyJobs", "company", "autoApplyJobs"),
        ("manual_firms",  "name",    "manual_firms"),
        ("contacts",      "company", "contacts"),
    ]:
        print(f"scanning collection group '{cg}'...", file=sys.stderr)
        count = 0
        try:
            for doc in db.collection_group(cg).stream():
                count += 1
                data = doc.to_dict() or {}
                # try multiple field-name spellings
                raw = (data.get(field) or data.get(field.capitalize())
                       or data.get("Company") or data.get("companyName") or "")
                n = normalize(raw if isinstance(raw, str) else str(raw))
                if n:
                    signals[signal][n] += 1
        except Exception as e:
            print(f"  WARN: {signal} scan failed: {e}", file=sys.stderr)
        print(f"  {signal}: scanned {count} docs -> {len(signals[signal])} distinct companies",
              file=sys.stderr)
    return signals


def report(signals: Dict[str, Counter], ats_sets: Dict[str, Set[str]],
           ats_counts: Dict[str, int], show_misses: int) -> None:
    """Print hit-rate table per signal, plus top missed companies."""
    print()
    print("=" * 72)
    print("JOBHIVE CSV RAW COUNTS")
    print("=" * 72)
    for ats, n in ats_counts.items():
        print(f"  {ats:12s}  {n:6d} rows  ({len(ats_sets[ats]):6d} distinct normalized)")
    print(f"  {'union':12s}          -    ({len(ats_sets['any']):6d} distinct normalized)")

    print()
    print("=" * 72)
    print("COVERAGE PER USER SIGNAL")
    print("=" * 72)
    print(f"{'signal':16s} {'distinct':>10s} {'any-ATS':>8s} {'GH':>8s} {'Lever':>8s} {'Ashby':>8s}")
    for sig_name, counter in signals.items():
        distinct = len(counter)
        if distinct == 0:
            print(f"{sig_name:16s} {distinct:10d}  (empty)")
            continue
        row = f"{sig_name:16s} {distinct:10d}"
        for ats in ["any", "greenhouse", "lever", "ashby"]:
            hit = sum(1 for name in counter if name in ats_sets[ats])
            pct = 100 * hit / distinct
            row += f" {pct:6.1f}%"
        print(row)

    # Weighted coverage — accounts for multi-user companies mattering more
    print()
    print("=" * 72)
    print("WEIGHTED COVERAGE (weighted by occurrence count per signal)")
    print("=" * 72)
    print(f"{'signal':16s} {'total occ':>12s} {'any-ATS':>10s}")
    for sig_name, counter in signals.items():
        total = sum(counter.values())
        if total == 0:
            print(f"{sig_name:16s} {total:12d}  (empty)")
            continue
        hit_occ = sum(cnt for name, cnt in counter.items() if name in ats_sets["any"])
        pct = 100 * hit_occ / total
        print(f"{sig_name:16s} {total:12d} {pct:9.1f}%")

    if show_misses > 0:
        print()
        print("=" * 72)
        print(f"TOP {show_misses} MISSED COMPANIES (by user-occurrence, across all signals)")
        print("=" * 72)
        combined: Counter = Counter()
        for c in signals.values():
            combined.update(c)
        misses = [(name, cnt) for name, cnt in combined.most_common()
                  if name not in ats_sets["any"]]
        for name, cnt in misses[:show_misses]:
            print(f"  {cnt:5d}x  {name}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--show-misses", type=int, default=30,
                   help="show N most-referenced companies NOT in jobhive (default 30)")
    args = p.parse_args()

    ats_sets, ats_counts = load_jobhive()
    signals = collect_user_signals()
    report(signals, ats_sets, ats_counts, args.show_misses)


if __name__ == "__main__":
    main()
