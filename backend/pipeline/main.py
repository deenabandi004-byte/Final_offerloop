#!/usr/bin/env python3
"""
Offerloop Job Pipeline — entry point.

Usage:
    python pipeline/main.py                          # Full pipeline: fetch → normalize → write
    python pipeline/main.py --skip-fantastic          # Full pipeline, skip Fantastic.jobs
    python pipeline/main.py --fantastic-only          # Fantastic.jobs only
    python pipeline/main.py --cleanup                 # Delete expired jobs only
    python pipeline/main.py --fix-salaries            # Recalculate WEEK salaries
    python pipeline/main.py --enrich-only             # Firecrawl JD enrichment for pending jobs
    python pipeline/main.py --enrich-only --limit=300 # Custom batch size (caps at 500)
    python pipeline/main.py --backfill-enrich         # One-shot backfill for legacy jobs lacking enrichment_status
"""
from dotenv import load_dotenv
load_dotenv()

import sys
import os
import logging
import uuid
from collections import Counter
from datetime import datetime, timezone

# Ensure both project root (for `from backend.app.*`) and the backend/
# directory (for `from app.*` — Flask-style relative imports used by
# services like firecrawl_client) are on sys.path. The enricher transitively
# imports modules that rely on the latter.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))           # …/backend/pipeline
_BACKEND_DIR = os.path.dirname(_THIS_DIR)                         # …/backend
_PROJECT_ROOT = os.path.dirname(_BACKEND_DIR)                     # repo root
sys.path.insert(0, _PROJECT_ROOT)
sys.path.insert(0, _BACKEND_DIR)

from flask import Flask
from backend.app.extensions import init_firebase

logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

PIPELINE_RUNS_COLLECTION = "pipeline_runs"


def _bootstrap_app():
    """Create a minimal Flask app and initialize Firebase (matching existing admin script pattern)."""
    app = Flask(__name__)
    init_firebase(app)
    return app


def _source_breakdown(raw: list[dict]) -> dict:
    counts = Counter((item.get("source") or "unknown") for item in raw)
    return dict(counts)


def _write_run_log(mode: str, started_at: datetime, result: dict | None, error: str | None = None):
    """Write a pipeline_runs/{run_id} doc summarizing this run. Never raises."""
    try:
        from backend.app.extensions import get_db
        db = get_db()
        if not db:
            logger.warning("Skipping pipeline_runs log: Firestore not initialized")
            return
        ended_at = datetime.now(timezone.utc)
        run_id = ended_at.strftime("%Y%m%dT%H%M%SZ") + "_" + uuid.uuid4().hex[:6]
        doc = {
            "run_id": run_id,
            "mode": mode,
            "started_at": started_at,
            "ended_at": ended_at,
            "duration_seconds": (ended_at - started_at).total_seconds(),
            "written": (result or {}).get("written", 0),
            "skipped_duplicates": (result or {}).get("skipped_duplicates", 0),
            "total": (result or {}).get("total", 0),
            "source_breakdown": (result or {}).get("source_breakdown") or {},
            "deleted": (result or {}).get("deleted", 0),
            "error": error,
            "ok": error is None,
        }
        db.collection(PIPELINE_RUNS_COLLECTION).document(run_id).set(doc)
        logger.info("pipeline_runs/%s written (ok=%s)", run_id, error is None)
    except Exception as e:
        logger.warning("Failed to write pipeline_runs log: %s", e)


def run_pipeline(skip_fantastic: bool = False):
    from backend.pipeline.fetcher import fetch_jobs
    from backend.pipeline.normalizer import normalize_all
    from backend.pipeline.writer import write_jobs

    sources = "Greenhouse, Lever, Ashby, Simplify" + ("" if skip_fantastic else ", Fantastic.jobs")
    logger.info("Fetching jobs from %s...", sources)
    raw = fetch_jobs(skip_fantastic=skip_fantastic)
    breakdown = _source_breakdown(raw)

    logger.info("Normalizing %d raw results...", len(raw))
    normalized = normalize_all(raw)

    logger.info("Writing %d normalized jobs to Firestore...", len(normalized))
    result = write_jobs(normalized)
    result["source_breakdown"] = breakdown

    print()
    print("Pipeline complete.")
    print(f"  New jobs written:     {result['written']}")
    print(f"  Duplicates skipped:   {result['skipped_duplicates']}")
    print(f"  Total processed:      {result['total']}")
    print(f"  Source breakdown:     {breakdown}")
    return result


def run_fantastic_only():
    from backend.pipeline.fetcher import fetch_fantasticjobs
    from backend.pipeline.normalizer import normalize_all
    from backend.pipeline.writer import write_jobs

    logger.info("Fetching jobs from Fantastic.jobs only...")
    raw = fetch_fantasticjobs()
    breakdown = _source_breakdown(raw)

    logger.info("Normalizing %d raw results...", len(raw))
    normalized = normalize_all(raw)

    logger.info("Writing %d normalized jobs to Firestore...", len(normalized))
    result = write_jobs(normalized)
    result["source_breakdown"] = breakdown

    print()
    print("Fantastic.jobs pipeline complete.")
    print(f"  New jobs written:     {result['written']}")
    print(f"  Duplicates skipped:   {result['skipped_duplicates']}")
    print(f"  Total processed:      {result['total']}")
    print(f"  Source breakdown:     {breakdown}")
    return result


def run_fix_salaries():
    from backend.app.extensions import get_db
    from backend.pipeline.normalizer import _format_salary_display, _salary_normalized_annual

    db = get_db()
    if not db:
        raise RuntimeError("Firestore DB not initialized")

    logger.info("Scanning jobs for WEEK salary fixes...")
    docs_to_fix = []
    for doc in db.collection("jobs").stream():
        data = doc.to_dict()
        if data.get("salary_extracted") and data.get("salary_period") == "WEEK":
            docs_to_fix.append((doc.reference, data))

    if not docs_to_fix:
        print("No WEEK-period extracted salaries found. Nothing to fix.")
        return 0

    batch = db.batch()
    for ref, data in docs_to_fix:
        sal_min = data.get("salary_min")
        sal_max = data.get("salary_max")
        batch.update(ref, {
            "salary_normalized_annual": _salary_normalized_annual(sal_min, sal_max, "WEEK"),
            "salary_display": _format_salary_display(sal_min, sal_max, "WEEK", True),
        })
    batch.commit()

    print()
    print(f"Fixed {len(docs_to_fix)} jobs with WEEK salary period.")
    return len(docs_to_fix)


def run_cleanup():
    from backend.pipeline.writer import delete_expired_jobs

    logger.info("Running expired job cleanup...")
    deleted = delete_expired_jobs()

    print()
    print("Cleanup complete.")
    print(f"  Expired jobs deleted: {deleted}")
    return {"deleted": deleted}


def run_enrich(limit: int = 200, backfill: bool = False):
    """Firecrawl-backed JD enrichment: fill in `structured` on pending jobs."""
    from backend.pipeline.enricher import enrich_jobs

    logger.info("Running enricher (limit=%d, backfill=%s)...", limit, backfill)
    result = enrich_jobs(limit=limit, backfill=backfill)

    print()
    print("Enrichment complete.")
    print(f"  Processed:           {result.get('processed', 0)}")
    print(f"  Enriched (structured saved): {result.get('enriched', 0)}")
    print(f"  Failed:              {result.get('failed', 0)}")
    print(f"  Skipped (no URL):    {result.get('skipped', 0)}")
    print(f"  Estimated cost:      ${result.get('cost_estimate_usd', 0.0):.4f}")
    return result


def _parse_limit(default: int = 200) -> int:
    for arg in sys.argv:
        if arg.startswith("--limit="):
            try:
                return max(1, int(arg.split("=", 1)[1]))
            except ValueError:
                pass
    return default


if __name__ == "__main__":
    app = _bootstrap_app()

    with app.app_context():
        if "--cleanup" in sys.argv:
            mode, runner = "cleanup", run_cleanup
        elif "--fix-salaries" in sys.argv:
            mode, runner = "fix-salaries", run_fix_salaries
        elif "--enrich-only" in sys.argv:
            limit = _parse_limit(200)
            mode, runner = "enrich-only", (lambda: run_enrich(limit=limit, backfill=False))
        elif "--backfill-enrich" in sys.argv:
            limit = _parse_limit(500)
            mode, runner = "backfill-enrich", (lambda: run_enrich(limit=limit, backfill=True))
        elif "--fantastic-only" in sys.argv:
            mode, runner = "fantastic-only", run_fantastic_only
        elif "--skip-fantastic" in sys.argv:
            mode, runner = "skip-fantastic", (lambda: run_pipeline(skip_fantastic=True))
        else:
            mode, runner = "full", run_pipeline

        started = datetime.now(timezone.utc)
        try:
            result = runner()
            if not isinstance(result, dict):
                result = {"total": int(result) if isinstance(result, (int, float)) else 0}
            _write_run_log(mode, started, result, error=None)
        except Exception as e:
            logger.exception("Pipeline run failed: %s", e)
            _write_run_log(mode, started, None, error=f"{type(e).__name__}: {e}")
            sys.exit(1)
