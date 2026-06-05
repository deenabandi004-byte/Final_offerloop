"""
Fleet-level rollups for the Loops fleet view (LoopsCommandBar).

The fleet view's command bar shows three things in one card:
  1. "Found this week" — total contacts surfaced across every Loop, ISO week.
  2. "Drafts waiting on you" — sum of pendingDrafts across every Loop.
  3. Weekly-goal ring — foundThisWeek over the sum of per-Loop weeklyTargets.

Plus a live activity ticker at the bottom rotating through the most recent
finds across all Loops.

These rollups only read existing Firestore collections (loops, agent_actions);
no new data model.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from app.extensions import get_db
from app.services.loop_budget import _start_of_iso_week_utc
from app.services.loop_service import _action_to_items

logger = logging.getLogger(__name__)


# ── Weekly summary ─────────────────────────────────────────────────────────


def _count_results_in_action(action: dict) -> int:
    """How many surface-able rows did this completed action produce? Mirrors
    the buckets the feed expands (`_action_to_items`) so the summary number
    matches what the user actually sees on screen.
    """
    result = action.get("result") or {}
    if not isinstance(result, dict):
        return 0
    action_type = action.get("action")
    if action_type in ("find", "find_hiring_managers"):
        return len(result.get("contacts") or [])
    if action_type == "find_jobs":
        return len(result.get("jobs") or [])
    if action_type == "discover_companies":
        return len(result.get("companies") or [])
    return 0


def get_fleet_weekly_summary(uid: str) -> dict:
    """Aggregate fleet-wide metrics for the LoopsCommandBar.

    Reads agent_actions once (status=completed, createdAt>=week_start) and
    buckets find counts by day. Reads loop docs for the goal denominator and
    `pendingDrafts` rollup.
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    week_start_dt = _start_of_iso_week_utc(now)
    week_start_iso = week_start_dt.isoformat()

    # ── weeklyGoal + active loop count from loops ──
    weekly_goal = 0
    active_loops = 0
    try:
        loops_ref = db.collection("users").document(uid).collection("loops")
        for doc in loops_ref.stream():
            data = doc.to_dict() or {}
            # Only count non-archived Loops toward the fleet goal so deleted
            # Loops don't keep inflating the denominator.
            if data.get("status") != "archived":
                weekly_goal += int(data.get("weeklyTarget", 0) or 0)
                active_loops += 1
    except Exception:
        logger.exception("fleet_weekly_summary: failed to read loops for uid=%s", uid)

    # ── draftsWaiting from contacts ──
    # The Loop doc's `pendingDrafts` counter is never written today (it's only
    # initialized to 0 in _loop_defaults). The authoritative signal is the
    # contact's pipelineStage — the same one get_agent_stats and the outbox
    # use. Count every contact still at "draft_created" regardless of source
    # so a user's manual drafts also surface in the fleet command bar.
    drafts_waiting = 0
    try:
        contacts_ref = (
            db.collection("users").document(uid).collection("contacts")
        )
        for doc in contacts_ref.stream():
            data = doc.to_dict() or {}
            if data.get("pipelineStage") == "draft_created":
                drafts_waiting += 1
    except Exception:
        logger.exception("fleet_weekly_summary: failed to read contacts for uid=%s", uid)

    # ── foundThisWeek + sparkline from agent_actions ──
    found_this_week = 0
    # 7 daily buckets — index 0 is 6 days ago, index 6 is today, so the line
    # reads left-to-right as the week progresses (matches the design).
    spark = [0] * 7
    try:
        # Single-field range query so Firestore doesn't ask for a composite
        # index on (status, createdAt). We filter status==completed client-side
        # below — the cardinality difference is small over a 7-day window and
        # this keeps the endpoint working out-of-the-box on any account.
        actions_ref = (
            db.collection("users").document(uid)
              .collection("agent_actions")
              .where("createdAt", ">=", week_start_iso)
        )
        for doc in actions_ref.stream():
            data = doc.to_dict() or {}
            if data.get("status") != "completed":
                continue
            count = _count_results_in_action(data)
            if count <= 0:
                continue
            found_this_week += count
            created = data.get("completedAt") or data.get("createdAt") or ""
            if not isinstance(created, str):
                continue
            try:
                created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            except (TypeError, ValueError):
                continue
            days_ago = (now.date() - created_dt.date()).days
            # Clamp to the current week window (0..6 inclusive). Anything
            # outside is ignored — defensive against clock skew.
            idx = 6 - days_ago
            if 0 <= idx < 7:
                spark[idx] += count
    except Exception:
        logger.exception("fleet_weekly_summary: failed to read agent_actions for uid=%s", uid)

    weekly_progress_pct = 0
    if weekly_goal > 0:
        weekly_progress_pct = min(100, round((found_this_week / weekly_goal) * 100))

    return {
        "foundThisWeek": found_this_week,
        "weeklySparkline": spark,
        "draftsWaiting": drafts_waiting,
        "weeklyGoal": weekly_goal,
        "weeklyProgressPct": weekly_progress_pct,
        "activeLoopsCount": active_loops,
        "weekStartedAt": week_start_iso,
    }


# ── Fleet activity feed (ticker source) ────────────────────────────────────


def _relative_when(iso: str, now: datetime) -> str:
    """Compact relative time string ("2m", "11m", "1h", "3h", "2d") for the
    activity ticker. Empty if the timestamp can't be parsed."""
    if not iso:
        return ""
    try:
        ts = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return ""
    delta = now - ts
    secs = int(delta.total_seconds())
    if secs < 60:
        return "just now"
    if secs < 3600:
        return f"{secs // 60}m"
    if secs < 86400:
        return f"{secs // 3600}h"
    return f"{secs // 86400}d"


def get_fleet_feed(uid: str, limit: int = 20) -> list[dict]:
    """Newest finds across every Loop, flattened into ticker-shaped rows.

    Each row matches the CommandBar's ticker contract:
        { kind, who, role, when, loopId, createdAt }

    Where `kind` is 'found' | 'draft' | 'job' | 'company'.
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    # Cap the lookback window so we don't drag through stale actions on busy
    # accounts. 7 days is more than enough — the ticker is meant to feel live.
    horizon = (now - timedelta(days=7)).isoformat()

    # Single-property order_by so Firestore uses the automatic index — no
    # composite index required. We over-fetch and filter status + horizon
    # client-side; iteration is DESC so we can break early on stale rows.
    actions_ref = (
        db.collection("users").document(uid)
          .collection("agent_actions")
          .order_by("createdAt", direction="DESCENDING")
          .limit(120)  # over-fetch — each action expands to N rows, some get
                      # filtered out as not-completed or pre-horizon
    )

    items: list[dict] = []
    try:
        for doc in actions_ref.stream():
            data = doc.to_dict() or {}
            created_at_field = data.get("createdAt") or ""
            # DESC order — once we cross the horizon, every remaining row is
            # older. Bail out instead of paging through ancient actions.
            if isinstance(created_at_field, str) and created_at_field < horizon:
                break
            if data.get("status") != "completed":
                continue
            loop_id = data.get("loopId") or ""
            # _action_to_items returns the same shape used by the per-Loop feed.
            # For the ticker we project each row into a smaller "kind/who/role"
            # form so the client renders consistently.
            sub_items = _action_to_items(doc.id, data, referenced_group_keys=None)
            for sub in sub_items:
                kind = {
                    "contact": "found",
                    "hm": "found",
                    "draft": "draft",
                    "job": "job",
                    "company": "company",
                }.get(sub.get("type", ""), "found")
                created_at = sub.get("createdAt") or data.get("completedAt") or ""
                items.append({
                    "kind": kind,
                    "who": sub.get("title", ""),
                    "role": sub.get("subtitle", ""),
                    "when": _relative_when(created_at, now),
                    "loopId": loop_id,
                    "createdAt": created_at,
                })
                if len(items) >= limit * 3:
                    break
            if len(items) >= limit * 3:
                break
    except Exception:
        logger.exception("fleet_feed: failed to read agent_actions for uid=%s", uid)

    # Re-sort newest-first (the expansion can reorder) and cap.
    items.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return items[:limit]


# ── Suggested quickstart Loops ─────────────────────────────────────────────


# Static template set for v1. Each template carries a pre-seeded brief the
# /agent/setup page will read via location.state when the user one-taps it
# from the NewLoopTile. We keep this curated rather than LLM-generated so
# the latency is zero and the suggestions stay on-brand.
_QUICKSTART_TEMPLATES = [
    {
        "id": "ai-analysts-banks",
        "title": "AI analysts at Goldman, JPMorgan & Morgan Stanley",
        "tag": "Finance",
        "brief": (
            "Find AI/quant analyst openings at Goldman Sachs, JPMorgan, and "
            "Morgan Stanley. Surface hiring managers on their AI/ML and "
            "quant strategies teams. Draft warm outreach mentioning my "
            "background in machine learning."
        ),
        "loopMode": "both",
    },
    {
        "id": "pm-interns-stripe-ramp-notion",
        "title": "PM internships at Stripe, Ramp & Notion",
        "tag": "Product",
        "brief": (
            "Find PM internship openings at Stripe, Ramp, and Notion. "
            "Identify recruiters and PM leadership at each company. Draft "
            "outreach highlighting my product-thinking and any shipped projects."
        ),
        "loopMode": "both",
    },
    {
        "id": "usc-alumni-mbb",
        "title": "USC alumni at McKinsey, Bain & BCG",
        "tag": "Consulting",
        "brief": (
            "Find USC alumni currently working at McKinsey, Bain, and BCG. "
            "Focus on associates and consultants in offices on the West Coast. "
            "Draft warm coffee-chat outreach referencing the USC connection."
        ),
        "loopMode": "people",
    },
    {
        "id": "swe-new-grad-tech",
        "title": "New-grad SWE at Linear, Vercel & Modal",
        "tag": "Tech",
        "brief": (
            "Find new-grad and entry-level software engineering roles at "
            "Linear, Vercel, and Modal. Surface engineering managers and "
            "founding engineers. Draft outreach highlighting relevant projects."
        ),
        "loopMode": "both",
    },
]


def get_suggested_loops(uid: str, limit: int = 4) -> list[dict]:
    """Return curated quickstart Loop templates.

    v1: static set. v2 will personalize by reading the user's profile
    (school, target industries) and reordering. The shape stays stable
    across versions so the frontend doesn't change.
    """
    # Lightweight personalization stub: read the user's school and bubble
    # alumni templates if there's a match. Failures fall back to the static
    # order, which is intentionally tech-forward.
    try:
        db = get_db()
        doc = db.collection("users").document(uid).get()
        if doc.exists:
            profile = (doc.to_dict() or {}).get("professionalInfo") or {}
            school = (profile.get("school") or "").lower()
            if school and "usc" in school:
                # Move the USC template to the front.
                templates = sorted(
                    _QUICKSTART_TEMPLATES,
                    key=lambda t: 0 if "usc" in t["id"] else 1,
                )
                return templates[:limit]
    except Exception:
        logger.debug("suggested_loops: personalization read failed for uid=%s", uid)

    return _QUICKSTART_TEMPLATES[:limit]
