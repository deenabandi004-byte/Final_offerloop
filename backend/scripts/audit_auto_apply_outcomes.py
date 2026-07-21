"""Audit auto-apply outcomes over the last N days.

Reads `autoApplyJobs` from Firestore, buckets by terminal status, and surfaces
the top failure reasons + top pending-question labels so we can tell which
exit door dominates. Run against prod, read-only, no API cost.

Usage:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json python backend/scripts/audit_auto_apply_outcomes.py
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json python backend/scripts/audit_auto_apply_outcomes.py --days 7
"""
from __future__ import annotations

import argparse
import os
from collections import Counter
from datetime import datetime, timedelta, timezone

import firebase_admin
from firebase_admin import credentials, firestore


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()


TERMINAL_STATUSES = {
    "submitted",
    "needs_attention",
    "needs_verification",
    "submit_failed",
    "failed",
    "dry_run_complete",
}


def _parse_created_at(val):
    """created_at is written as `datetime.utcnow().isoformat()` — a naive
    UTC ISO string like '2026-07-20T18:00:00.123456'. Also handle Firestore
    Timestamp objects and datetimes in case the format changes."""
    if val is None:
        return None
    if hasattr(val, "timestamp"):
        try:
            return datetime.fromtimestamp(val.timestamp(), tz=timezone.utc)
        except Exception:
            return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _iter_recent_jobs(db, since: datetime):
    # Collection-group + where("created_at", ">=") would need a composite index.
    # For a one-shot audit it's simpler to stream everything and filter here.
    for snap in db.collection_group("autoApplyJobs").stream():
        data = snap.to_dict() or {}
        created_dt = _parse_created_at(data.get("created_at"))
        if created_dt is None or created_dt < since:
            continue
        data["_id"] = snap.id
        yield data


def _short(reason: str, limit: int = 100) -> str:
    if not reason:
        return "(no reason)"
    reason = reason.replace("\n", " ").strip()
    return reason[:limit] + ("…" if len(reason) > limit else "")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--top", type=int, default=15)
    args = parser.parse_args()

    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    db = get_db()

    total = 0
    by_status = Counter()
    fail_reasons = Counter()
    pending_labels = Counter()
    by_platform = Counter()
    by_status_platform = Counter()

    for job in _iter_recent_jobs(db, since):
        total += 1
        status = job.get("status") or "unknown"
        by_status[status] += 1
        platform = (job.get("platform") or job.get("ats") or "unknown").lower()
        by_platform[platform] += 1
        by_status_platform[(platform, status)] += 1

        if status in {"submit_failed", "failed"}:
            fail_reasons[_short(job.get("failure_reason") or "")] += 1
        if status == "needs_attention":
            for q in (job.get("pending_questions") or []):
                label = (q.get("label") or q.get("question") or "").strip()
                if label:
                    pending_labels[_short(label, 80)] += 1

    print(f"\n=== Auto-apply outcomes — last {args.days} days ===")
    print(f"Total jobs: {total}\n")

    if not total:
        print("No jobs found. Check the collection name / created_at field.")
        return

    print("Status distribution:")
    for status, count in by_status.most_common():
        pct = 100 * count / total
        marker = " ✓" if status == "submitted" else (" ⚠" if status in TERMINAL_STATUSES else "")
        print(f"  {status:24s} {count:5d}  {pct:5.1f}%{marker}")

    print("\nPlatform distribution:")
    for platform, count in by_platform.most_common():
        pct = 100 * count / total
        print(f"  {platform:24s} {count:5d}  {pct:5.1f}%")

    print("\nSubmitted-rate by platform:")
    for platform, _ in by_platform.most_common():
        p_total = sum(c for (pl, _s), c in by_status_platform.items() if pl == platform)
        p_submitted = by_status_platform.get((platform, "submitted"), 0)
        rate = 100 * p_submitted / p_total if p_total else 0
        print(f"  {platform:24s} {p_submitted:4d}/{p_total:4d}  {rate:5.1f}%")

    if fail_reasons:
        print(f"\nTop {args.top} failure reasons (submit_failed + failed):")
        for reason, count in fail_reasons.most_common(args.top):
            print(f"  {count:4d}  {reason}")

    if pending_labels:
        print(f"\nTop {args.top} pending-question labels (needs_attention):")
        for label, count in pending_labels.most_common(args.top):
            print(f"  {count:4d}  {label}")

    print()


if __name__ == "__main__":
    main()
