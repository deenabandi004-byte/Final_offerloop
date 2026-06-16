"""
Per-IP, per-tool rate limits for the MCP server.

Two windows enforced together: per-day caps gate total spend, per-hour
caps deter scrapers. Counters live in Firestore at
mcp_rate_limits/{ip_hash}_{tool}_{window}, atomic-incremented via
transactions (same pattern as utils/firestore_limiter.FirestoreStorage).

This is intentionally separate from the Flask-Limiter rate_limits/
collection so the MCP server can be tuned independently and so a
Flask-Limiter reset doesn't wipe MCP counters.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

from firebase_admin import firestore

logger = logging.getLogger(__name__)


COLLECTION = "mcp_rate_limits"


# (tool, window) -> max requests allowed in that window
LIMITS = {
    ("find_contacts", "day"): 3,
    ("find_contacts", "hour"): 10,
    ("draft_outreach", "day"): 2,
    ("draft_outreach", "hour"): 5,
    ("get_company_intel", "hour"): 30,
}

_WINDOW_SECONDS = {
    "day": 86400,
    "hour": 3600,
}


@dataclass
class RateLimitResult:
    ok: bool
    hit_cap_type: Optional[str]  # "day" or "hour" or None
    retry_after_seconds: int
    remaining_day: Optional[int]
    remaining_hour: Optional[int]


class MCPRateLimit:
    def __init__(self, db):
        self.db = db

    def _doc_id(self, ip_hash: str, tool: str, window: str) -> str:
        return f"{ip_hash}_{tool}_{window}"

    def _peek(self, ip_hash: str, tool: str, window: str) -> tuple[int, float]:
        """Read current count and expires_at. Returns (count, expires_at).

        If the doc is missing or expired, returns (0, 0.0).
        """
        if self.db is None:
            return 0, 0.0
        try:
            doc = self.db.collection(COLLECTION).document(
                self._doc_id(ip_hash, tool, window)
            ).get()
        except Exception:
            return 0, 0.0
        if not doc.exists:
            return 0, 0.0
        data = doc.to_dict() or {}
        expires_at = data.get("expires_at", 0) or 0
        if expires_at <= time.time():
            return 0, 0.0
        return int(data.get("count", 0)), float(expires_at)

    def check_and_increment(self, ip_hash: str, tool: str) -> RateLimitResult:
        """Check both day + hour windows, increment if both pass, return result.

        Fail-open on Firestore errors (returns ok=True). We never want a
        Firestore blip to take the MCP server down.
        """
        now = time.time()

        # Read current state first to surface hit_cap_type without doing
        # any writes when we're already over either cap.
        day_cap = LIMITS.get((tool, "day"))
        hour_cap = LIMITS.get((tool, "hour"))

        day_count, day_expires = self._peek(ip_hash, tool, "day") if day_cap else (0, 0.0)
        hour_count, hour_expires = self._peek(ip_hash, tool, "hour") if hour_cap else (0, 0.0)

        if day_cap is not None and day_count >= day_cap:
            retry = max(int(day_expires - now), 1)
            return RateLimitResult(
                ok=False,
                hit_cap_type="day",
                retry_after_seconds=retry,
                remaining_day=0,
                remaining_hour=(None if hour_cap is None else max(hour_cap - hour_count, 0)),
            )

        if hour_cap is not None and hour_count >= hour_cap:
            retry = max(int(hour_expires - now), 1)
            return RateLimitResult(
                ok=False,
                hit_cap_type="hour",
                retry_after_seconds=retry,
                remaining_day=(None if day_cap is None else max(day_cap - day_count, 0)),
                remaining_hour=0,
            )

        # Within both caps, do the atomic increments.
        new_day = self._increment(ip_hash, tool, "day") if day_cap is not None else None
        new_hour = self._increment(ip_hash, tool, "hour") if hour_cap is not None else None

        return RateLimitResult(
            ok=True,
            hit_cap_type=None,
            retry_after_seconds=0,
            remaining_day=(None if day_cap is None or new_day is None else max(day_cap - new_day, 0)),
            remaining_hour=(None if hour_cap is None or new_hour is None else max(hour_cap - new_hour, 0)),
        )

    def _increment(self, ip_hash: str, tool: str, window: str) -> Optional[int]:
        if self.db is None:
            return None
        doc_ref = self.db.collection(COLLECTION).document(self._doc_id(ip_hash, tool, window))
        ttl = _WINDOW_SECONDS[window]
        now = time.time()
        new_expires_at = now + ttl

        @firestore.transactional
        def _txn(transaction):
            snap = doc_ref.get(transaction=transaction)
            if snap.exists:
                data = snap.to_dict() or {}
                if data.get("expires_at", 0) > now:
                    count = int(data.get("count", 0)) + 1
                    transaction.update(doc_ref, {"count": count})
                    return count
            count = 1
            transaction.set(doc_ref, {
                "count": count,
                "expires_at": new_expires_at,
                "tool": tool,
                "window": window,
                "ip_hash": ip_hash,
            })
            return count

        try:
            return _txn(self.db.transaction())
        except Exception as e:
            logger.warning("[MCP rate_limit] Firestore txn failed for %s/%s: %s",
                           tool, window, e)
            return None
