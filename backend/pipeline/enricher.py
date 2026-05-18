"""Job posting enrichment via Firecrawl.

Phase 1 of the job-board audit. Reads jobs flagged
`enrichment_status='pending'` from Firestore, calls Firecrawl to extract
structured fields (requirements, experience_level, salary_range, etc.),
and writes them back to the job doc under the `structured` map.

Designed to run as a cron decoupled from the main fetch pipeline so it can
work through backlog between full-fetch cycles. Cross-user cache by
apply_url lives in `enrichment_cache` (managed inside firecrawl_client),
so duplicate-URL postings across sources only pay Firecrawl once per
TTL window.

Cost guardrails:
- MAX_FIRECRAWL_PER_RUN hard caps each cron tick at 500 scrapes
- Firecrawl is no-op if FIRECRAWL_API_KEY is unset (preserves the rest
  of the pipeline)
- failed jobs are marked enrichment_status='failed' so we don't retry
  them on every tick (manual reset clears them)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

MAX_FIRECRAWL_PER_RUN = 500

ENRICHMENT_PENDING = "pending"
ENRICHMENT_COMPLETED = "completed"
ENRICHMENT_FAILED = "failed"
ENRICHMENT_SKIPPED = "skipped"  # no apply_url to scrape

# Rough Firecrawl per-scrape cost for budget tracking
FIRECRAWL_COST_PER_SCRAPE = 0.003


def _extract_structured(url: str) -> dict | None:
    """Call Firecrawl on a single URL. Returns dict or None on failure."""
    if not url:
        return None
    try:
        from backend.app.services.firecrawl_client import extract_job_posting
        result = extract_job_posting(url)
        if isinstance(result, dict) and result:
            return result
    except Exception as e:
        logger.warning("extract_job_posting raised for %s: %s", url, e)
    return None


def _build_structured_field(extracted: dict) -> dict:
    """Project Firecrawl's JobPostingExtract dict into our `structured` schema."""
    return {
        "requirements": extracted.get("requirements") or [],
        "nice_to_have": extracted.get("nice_to_have") or [],
        "responsibilities": extracted.get("responsibilities") or [],
        "employment_type": extracted.get("employment_type"),
        "experience_level": extracted.get("experience_level"),
        "salary_range_text": extracted.get("salary_range"),
        "team": extracted.get("team_or_department"),
        "hiring_manager": extracted.get("hiring_manager"),
        "application_deadline": extracted.get("application_deadline"),
        "enriched_at": datetime.now(timezone.utc),
        "enrichment_source": "firecrawl",
    }


def _collect_pending(db, limit: int) -> list:
    """Return [(doc_ref, data), ...] for jobs where enrichment_status == pending.

    Note: no order_by — Firestore would require a composite index for
    (enrichment_status, fetched_at), and the cron runs every 30 min so
    FIFO ordering isn't load-bearing. Whatever Firestore returns first is fine.
    """
    from google.cloud.firestore_v1.base_query import FieldFilter
    query = (
        db.collection("jobs")
        .where(filter=FieldFilter("enrichment_status", "==", ENRICHMENT_PENDING))
        .limit(limit)
    )
    return [(d.reference, d.to_dict() or {}) for d in query.stream()]


def _collect_backfill(db, limit: int) -> list:
    """Return [(doc_ref, data), ...] for legacy jobs lacking enrichment_status.

    Streams the whole `jobs` collection. Acceptable for one-shot backfill
    (not for the regular cron). Jobs that already have `structured` from
    some other path get auto-promoted to enrichment_status=completed and
    don't count against `limit`.
    """
    out = []
    seen = 0
    for doc in db.collection("jobs").stream():
        data = doc.to_dict() or {}
        if data.get("enrichment_status"):
            continue
        if data.get("structured"):
            # Pre-existing structured payload — just mark it complete, skip Firecrawl
            try:
                doc.reference.update({"enrichment_status": ENRICHMENT_COMPLETED})
            except Exception:
                pass
            continue
        out.append((doc.reference, data))
        seen += 1
        if seen >= limit:
            break
    return out


def enrich_jobs(limit: int = 200, backfill: bool = False) -> dict:
    """Enrich up to `limit` pending jobs (capped at MAX_FIRECRAWL_PER_RUN).

    Returns {processed, enriched, failed, skipped, cost_estimate_usd, mode}.
    """
    from backend.app.extensions import get_db
    from backend.app.config import FIRECRAWL_API_KEY

    if not FIRECRAWL_API_KEY:
        logger.warning("FIRECRAWL_API_KEY not set; enricher is a no-op")
        return {
            "processed": 0, "enriched": 0, "failed": 0, "skipped": 0,
            "cost_estimate_usd": 0.0, "mode": "noop_no_api_key",
        }

    db = get_db()
    if not db:
        raise RuntimeError("Firestore not initialized")

    capped = min(max(1, limit), MAX_FIRECRAWL_PER_RUN)
    mode = "backfill" if backfill else "cron"

    if backfill:
        logger.info("Backfill mode: scanning jobs collection for legacy entries")
        candidates = _collect_backfill(db, capped)
    else:
        candidates = _collect_pending(db, capped)

    if not candidates:
        logger.info("No %s jobs to enrich", "legacy" if backfill else "pending")
        return {
            "processed": 0, "enriched": 0, "failed": 0, "skipped": 0,
            "cost_estimate_usd": 0.0, "mode": mode,
        }

    logger.info("Enriching %d jobs (mode=%s)", len(candidates), mode)

    enriched = 0
    failed = 0
    skipped = 0

    for ref, data in candidates:
        url = data.get("apply_url") or data.get("url")
        if not url:
            try:
                ref.update({"enrichment_status": ENRICHMENT_SKIPPED})
            except Exception:
                pass
            skipped += 1
            continue

        extracted = _extract_structured(url)
        if extracted:
            structured = _build_structured_field(extracted)
            try:
                ref.update({
                    "structured": structured,
                    "enrichment_status": ENRICHMENT_COMPLETED,
                })
                enriched += 1
            except Exception as e:
                logger.warning("Failed to write structured for %s: %s", url, e)
                failed += 1
        else:
            try:
                ref.update({
                    "enrichment_status": ENRICHMENT_FAILED,
                    "enrichment_failed_at": datetime.now(timezone.utc),
                })
            except Exception:
                pass
            failed += 1

    result = {
        "processed": len(candidates),
        "enriched": enriched,
        "failed": failed,
        "skipped": skipped,
        "cost_estimate_usd": round(enriched * FIRECRAWL_COST_PER_SCRAPE, 4),
        "mode": mode,
    }
    logger.info("Enrichment complete: %s", result)
    return result
