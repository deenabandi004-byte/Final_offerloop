"""FullEnrich email-waterfall client (the reveal-time email layer).

Chosen 2026-08-24 after the three-provider bake-off: 77% hit rate on
matched pairs where Coresignal and Crustdata's cached contacts failed,
labels Hunter-agreed with zero invalids, ~$0.055 per FOUND work email
(misses are free). Recommended to us by Coresignal's own rep.

Contract (docs.fullenrich.com): POST /api/v2/contact/enrich/bulk starts an
async waterfall; GET /api/v2/contact/enrich/bulk/{id} polls it. Statuses:
DELIVERABLE (~2% bounce), HIGH_PROBABILITY (~9%), CATCH_ALL, INVALID.

Selling rules, benchmark-calibrated:
  DELIVERABLE       -> sellable as-is
  HIGH_PROBABILITY  -> sellable only if our SMTP gate confirms valid
  anything else     -> a miss
One identity miss was observed in benchmarks (an address at the wrong
company), so the caller keeps its own gates regardless.
"""
import json
import logging
import os
import time
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

BASE = os.getenv("FULLENRICH_BASE", "https://app.fullenrich.com/api/v2").rstrip("/")

#: Spend ceiling in FullEnrich credits (1 per found work email). Starter is
#: 500/month; leave headroom by default.
BUDGET = float(os.getenv("FULLENRICH_BUDGET", "450"))
#: How long a synchronous reveal will wait on the waterfall before giving
#: up. Abandoned enrichments may still complete (and bill) server-side;
#: at 1 credit per find that is an accepted cost, logged when it happens.
POLL_SECONDS = int(os.getenv("FULLENRICH_POLL_SECONDS", "30"))

_BUDGET_DOC = ("meta", "fullenrichBudget")


def _key() -> str:
    return (os.getenv("FULLENRICH_API_KEY") or "").strip()


def _headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {_key()}", "Content-Type": "application/json"}


def _spent(db) -> float:
    try:
        snap = db.collection(_BUDGET_DOC[0]).document(_BUDGET_DOC[1]).get()
        return float((snap.to_dict() or {}).get("spent_estimate", 0.0)) if snap.exists else 0.0
    except Exception:
        logger.exception("fullenrich: budget read failed; treating as exhausted")
        return BUDGET


def _add_spend(db, credits: float) -> None:
    try:
        from google.cloud import firestore as _fs
        db.collection(_BUDGET_DOC[0]).document(_BUDGET_DOC[1]).set(
            {"spent_estimate": _fs.Increment(credits), "find_count": _fs.Increment(1)},
            merge=True,
        )
    except Exception:
        logger.exception("fullenrich: budget write failed (%.1f untracked)", credits)


def enabled(db) -> bool:
    return bool(_key()) and _spent(db) < BUDGET


def find_work_email(
    *, first_name: str, last_name: str, company: str,
    linkedin_url: str = "", db=None,
) -> Optional[Dict[str, Any]]:
    """One reveal-time waterfall lookup. Returns {email, status} for a
    sellable-tier address, else None. Never raises."""
    if not enabled(db):
        return None
    if not ((first_name and last_name) or linkedin_url):
        return None
    contact: Dict[str, Any] = {
        "first_name": first_name or "",
        "last_name": last_name or "",
        "company_name": company or "",
        "enrich_fields": ["contact.work_emails"],
    }
    if linkedin_url:
        contact["linkedin_url"] = linkedin_url
    try:
        r = requests.post(
            f"{BASE}/contact/enrich/bulk",
            headers=_headers(),
            json={"name": "offerloop-reveal", "data": [contact]},
            timeout=20,
        )
        logger.info("fullenrich start -> %s %s", r.status_code, r.text[:200])
        if r.status_code not in (200, 201):
            return None
        eid = r.json().get("enrichment_id") or r.json().get("id")
        if not eid:
            return None

        deadline = time.time() + POLL_SECONDS
        data = None
        while time.time() < deadline:
            time.sleep(4)
            g = requests.get(f"{BASE}/contact/enrich/bulk/{eid}", headers=_headers(), timeout=15)
            if g.status_code != 200:
                continue
            body = g.json()
            if body.get("status") == "FINISHED":
                data = body
                break
        if data is None:
            logger.warning("fullenrich: poll window elapsed for %s (may still bill on find)", eid)
            return None

        rows = data.get("data") or []
        credits = float((data.get("cost") or {}).get("credits") or 0)
        if credits and db is not None:
            _add_spend(db, credits)
        if not rows:
            return None
        best = ((rows[0].get("contact_info") or {}).get("most_probable_work_email") or {})
        email = (best.get("email") or "").strip().lower()
        status = (best.get("status") or "").upper()
        logger.info("fullenrich result %s %s (%.0f credits)", email or "(none)", status, credits)
        if not email or status not in ("DELIVERABLE", "HIGH_PROBABILITY"):
            return None
        return {"email": email, "status": status}
    except Exception:
        logger.exception("fullenrich: find_work_email failed")
        return None

def start_bulk(people, db=None) -> str:
    """Fire ONE waterfall for a whole deck's email-less people.

    `people` is [(pid, first, last, company, linkedin_url)]. One call per
    deck instead of one per swipe (their start endpoint 429s bursts), and
    by swipe time the result is usually FINISHED, so reveals become
    instant lookups. Returns the enrichment id, or "" on any failure.
    """
    if not _key() or not people:
        return ""
    data = []
    for pid, first, last, company, linkedin in people[:100]:
        row = {"first_name": first or "", "last_name": last or "",
               "company_name": company or "",
               "enrich_fields": ["contact.work_emails"],
               "custom": {"pid": str(pid)}}
        if linkedin:
            row["linkedin_url"] = linkedin
        data.append(row)
    try:
        r = requests.post(f"{BASE}/contact/enrich/bulk", headers=_headers(),
                          json={"name": "offerloop-deck-prefetch", "data": data},
                          timeout=20)
        if r.status_code == 429:
            time.sleep(3)
            r = requests.post(f"{BASE}/contact/enrich/bulk", headers=_headers(),
                              json={"name": "offerloop-deck-prefetch", "data": data},
                              timeout=20)
        logger.info("fullenrich prefetch start (%d people) -> %s %s",
                    len(data), r.status_code, r.text[:120])
        if r.status_code not in (200, 201):
            return ""
        return r.json().get("enrichment_id") or r.json().get("id") or ""
    except Exception:
        logger.exception("fullenrich: start_bulk failed")
        return ""


def fetch_bulk(enrichment_id: str, wait_seconds: int = 12, db=None) -> Dict[str, Dict[str, Any]]:
    """Result of a prefetch job as {pid: {email, status}}, sellable tiers
    only. Waits briefly if the job is still running. {} on any failure."""
    if not _key() or not enrichment_id:
        return {}
    deadline = time.time() + max(0, wait_seconds)
    body = None
    try:
        while True:
            g = requests.get(f"{BASE}/contact/enrich/bulk/{enrichment_id}",
                             headers=_headers(), timeout=15)
            if g.status_code == 200 and g.json().get("status") == "FINISHED":
                body = g.json()
                break
            if time.time() >= deadline:
                logger.info("fullenrich prefetch %s not ready in %ss", enrichment_id, wait_seconds)
                return {}
            time.sleep(3)
        credits = float((body.get("cost") or {}).get("credits") or 0)
        if credits and db is not None and not _spent_marked(db, enrichment_id):
            _add_spend(db, credits)
        out: Dict[str, Dict[str, Any]] = {}
        for row in body.get("data") or []:
            pid = str(((row.get("custom") or {}).get("pid")) or "")
            best = ((row.get("contact_info") or {}).get("most_probable_work_email") or {})
            email = (best.get("email") or "").strip().lower()
            status = (best.get("status") or "").upper()
            if pid and email and status in ("DELIVERABLE", "HIGH_PROBABILITY"):
                out[pid] = {"email": email, "status": status}
        return out
    except Exception:
        logger.exception("fullenrich: fetch_bulk failed")
        return {}


def _spent_marked(db, enrichment_id: str) -> bool:
    """Bill a prefetch job's credits into the guard exactly once."""
    try:
        ref = db.collection("meta").document("fullenrichBudget")
        doc = ref.get().to_dict() or {}
        seen = doc.get("billed_jobs") or []
        if enrichment_id in seen:
            return True
        ref.set({"billed_jobs": (seen + [enrichment_id])[-200:]}, merge=True)
        return False
    except Exception:
        return False

