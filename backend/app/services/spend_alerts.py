"""
Provider-spend alerting — the cost safeguard.

Totals actual $ spend across every metered provider for two windows:
  - today        (since 00:00 UTC)
  - month-to-date (since the 1st, 00:00 UTC)  ← matches our calendar-month billing

Spend comes from two Firestore collections that already log real, computed cost:
  - `provider_calls`  — PDL / Hunter / Coresignal / Apify + (new) OpenAI / Claude
  - `scout_metrics`   — Scout's own per-turn OpenAI cost

When today's or the month's spend crosses a configured budget threshold
(50% / 80% / 100%), fire a Telegram alert to the founder chat. Each threshold
fires at most once per period (deduped via the `system/spend_alert_state` doc)
so a cron hitting this every few hours never spams.

This module NEVER raises — a monitoring failure must not take anything down.

ENV
  SPEND_DAILY_ALERT_USD     daily budget (alert at 50/80/100%). 0/unset = off.
  SPEND_MONTHLY_ALERT_USD   month-to-date budget. 0/unset = off.
  TELEGRAM_BOT_TOKEN        reused from the reddit scanner.
  TELEGRAM_CHAT_ID          reused from the reddit scanner.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("spend_alerts")

# Threshold fractions of the budget at which we alert, ascending.
THRESHOLDS: List[float] = [0.5, 0.8, 1.0]
_STATE_DOC = ("system", "spend_alert_state")


# ---------------------------------------------------------------------------
# Cost aggregation
# ---------------------------------------------------------------------------


def _db():
    try:
        from app.extensions import get_db
        return get_db()
    except Exception:  # noqa: BLE001
        return None


def _sum_cost(db, collection: str, ts_field: str, since: datetime) -> Dict[str, Any]:
    """Sum est_cost_usd/cost_usd over `collection` since `since`, grouped by provider."""
    total = 0.0
    by_provider: Dict[str, float] = {}
    try:
        docs = db.collection(collection).where(ts_field, ">=", since).stream()
        for doc in docs:
            d = doc.to_dict() or {}
            cost = float(d.get("est_cost_usd") or d.get("cost_usd") or 0.0)
            total += cost
            prov = d.get("provider") or ("scout" if collection == "scout_metrics" else "unknown")
            by_provider[prov] = by_provider.get(prov, 0.0) + cost
    except Exception as e:  # noqa: BLE001
        logger.warning("spend sum failed for %s: %s", collection, e)
    return {"total": total, "by_provider": by_provider}


def _window_spend(db, since: datetime) -> Dict[str, Any]:
    """Combined spend across provider_calls + scout_metrics since `since`."""
    pc = _sum_cost(db, "provider_calls", "timestamp", since)
    sc = _sum_cost(db, "scout_metrics", "created_at", since)
    by_provider = dict(pc["by_provider"])
    for prov, cost in sc["by_provider"].items():
        by_provider[prov] = by_provider.get(prov, 0.0) + cost
    return {
        "total": round(pc["total"] + sc["total"], 4),
        "by_provider": {k: round(v, 4) for k, v in sorted(by_provider.items(), key=lambda x: -x[1])},
    }


def compute_spend() -> Dict[str, Any]:
    """Today + month-to-date spend. Returns zeros if Firestore is unavailable."""
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    db = _db()
    if db is None:
        return {"error": "firestore_unavailable", "today": {"total": 0.0}, "mtd": {"total": 0.0}}
    return {
        "as_of": now.isoformat(),
        "today": _window_spend(db, day_start),
        "mtd": _window_spend(db, month_start),
    }


# ---------------------------------------------------------------------------
# Threshold + dedup logic
# ---------------------------------------------------------------------------


def _crossed(spend: float, budget: float) -> Optional[float]:
    """Highest threshold fraction crossed, or None. budget<=0 disables."""
    if budget <= 0 or spend <= 0:
        return None
    frac = spend / budget
    hit = [t for t in THRESHOLDS if frac >= t]
    return max(hit) if hit else None


def _read_state(db) -> Dict[str, Any]:
    try:
        snap = db.collection(_STATE_DOC[0]).document(_STATE_DOC[1]).get()
        return snap.to_dict() or {} if snap.exists else {}
    except Exception as e:  # noqa: BLE001
        logger.warning("spend_alert_state read failed: %s", e)
        return {}


def _write_state(db, state: Dict[str, Any]) -> None:
    try:
        db.collection(_STATE_DOC[0]).document(_STATE_DOC[1]).set(state, merge=True)
    except Exception as e:  # noqa: BLE001
        logger.warning("spend_alert_state write failed: %s", e)


# ---------------------------------------------------------------------------
# Telegram (same channel/secrets as the reddit scanner)
# ---------------------------------------------------------------------------


def send_telegram(message: str) -> bool:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        logger.warning("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — alert:\n%s", message)
        return False
    try:
        import requests
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
            timeout=15,
        )
        return resp.ok
    except Exception as e:  # noqa: BLE001
        logger.warning("telegram send failed: %s", e)
        return False


def _format_alert(window: str, period_key: str, frac: float, spend: float,
                  budget: float, by_provider: Dict[str, float]) -> str:
    pct = int(round(frac * 100))
    siren = "🔴" if frac >= 1.0 else ("🟠" if frac >= 0.8 else "🟡")
    lines = [
        f"{siren} <b>Offerloop spend alert — {window} at {pct}% of budget</b>",
        f"${spend:,.2f} / ${budget:,.2f}  ({period_key})",
        "",
        "By provider:",
    ]
    for prov, cost in list(by_provider.items())[:8]:
        if cost > 0:
            lines.append(f"  • {prov}: ${cost:,.2f}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entry point (called by the admin endpoint / cron)
# ---------------------------------------------------------------------------


def check_and_alert(force: bool = False) -> Dict[str, Any]:
    """
    Compute spend, fire Telegram for any newly-crossed threshold, dedup via
    Firestore state. `force=True` re-sends the current highest threshold even
    if already alerted this period (for manual testing). Returns a summary.
    """
    daily_budget = float(os.getenv("SPEND_DAILY_ALERT_USD") or 0)
    monthly_budget = float(os.getenv("SPEND_MONTHLY_ALERT_USD") or 0)
    spend = compute_spend()
    if spend.get("error"):
        return {"ok": False, **spend}

    db = _db()
    state = _read_state(db) if db is not None else {}
    now = datetime.now(timezone.utc)
    fired: List[Dict[str, Any]] = []

    checks = [
        ("daily", now.strftime("%Y-%m-%d"), spend["today"]["total"], daily_budget,
         spend["today"]["by_provider"], "Today"),
        ("monthly", now.strftime("%Y-%m"), spend["mtd"]["total"], monthly_budget,
         spend["mtd"]["by_provider"], "Month-to-date"),
    ]

    for kind, period_key, total, budget, by_prov, label in checks:
        frac = _crossed(total, budget)
        if frac is None:
            continue
        # Dedup: only alert if this is a higher threshold than last alerted
        # for THIS period (reset automatically when period_key changes).
        st = state.get(kind) or {}
        already = st.get("level", 0.0) if st.get("period") == period_key else 0.0
        if frac > already or force:
            sent = send_telegram(_format_alert(label, period_key, frac, total, budget, by_prov))
            fired.append({"kind": kind, "level": frac, "spend": total, "budget": budget, "sent": sent})
            state[kind] = {"period": period_key, "level": frac, "alerted_at": now.isoformat()}

    if fired and db is not None:
        _write_state(db, state)

    return {
        "ok": True,
        "as_of": spend.get("as_of"),
        "today": spend["today"]["total"],
        "mtd": spend["mtd"]["total"],
        "daily_budget": daily_budget,
        "monthly_budget": monthly_budget,
        "alerts_fired": fired,
    }
