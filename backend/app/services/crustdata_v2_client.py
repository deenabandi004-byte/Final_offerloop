"""Crustdata NEW-API contact enrich (the enterprise path, dormant).

Their engineer confirmed the screener endpoints this repo's older client
uses are being sunset; the current contact product is
POST /person/contact/enrich with Bearer auth and x-api-version 2025-11-01,
1 credit per matched person (business emails), unmatched free, statuses
deliverable/catch_all/invalid/unknown.

Benchmarked 2026-08-24 on 85 matched pairs: 29-37% deliverable-labeled and
a structural stale-employer flaw, which is why this path is OFF by default
(env CRUSTDATA_V2_ENABLED=1 plus CRUSTDATA_V2_API_KEY to arm). It exists
so the $12k/yr enterprise option stays one flag away and honestly
comparable if their coverage or pricing changes.
"""
import logging
import os
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

BASE = os.getenv("CRUSTDATA_V2_BASE", "https://api.crustdata.com").rstrip("/")
API_VERSION = os.getenv("CRUSTDATA_V2_API_VERSION", "2025-11-01")


def _key() -> str:
    return (os.getenv("CRUSTDATA_V2_API_KEY") or "").strip()


def enabled() -> bool:
    return os.getenv("CRUSTDATA_V2_ENABLED", "").strip() == "1" and bool(_key())


def deliverable_business_email(linkedin_url: str) -> Optional[Dict[str, Any]]:
    """One contact enrich; returns {email, status} only for a
    deliverable-labeled business address at 1 credit. Never raises."""
    if not enabled() or not linkedin_url:
        return None
    try:
        r = requests.post(
            f"{BASE}/person/contact/enrich",
            headers={"authorization": f"Bearer {_key()}",
                     "x-api-version": API_VERSION,
                     "content-type": "application/json"},
            json={"professional_network_profile_urls": [linkedin_url],
                  "fields": ["contact.business_emails"]},
            timeout=30,
        )
        logger.info("crustdata-v2 enrich %s -> %s %s", linkedin_url, r.status_code, r.text[:150])
        if r.status_code != 200:
            return None
        for row in r.json() or []:
            for m in row.get("matches") or []:
                for e in ((m.get("person_data") or {}).get("contact") or {}).get("business_emails") or []:
                    if isinstance(e, dict) and e.get("email") and (e.get("status") or "").lower() == "deliverable":
                        return {"email": e["email"].strip().lower(), "status": "deliverable"}
        return None
    except Exception:
        logger.exception("crustdata-v2 enrich failed")
        return None
