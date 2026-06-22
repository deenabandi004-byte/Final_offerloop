"""
Tier-based caps for MCP tool result counts.

`user_ctx` is None for anonymous callers, otherwise a dict with `uid`, `tier`,
and `scope` keys set by flask_mount after JWT verification.

The numbers below mirror Offerloop's website tier caps (config.py +
constants.ts). Anonymous and Free signed-in share the same cap — signing in
as Free identifies the user (so we can attribute usage and let them upgrade
in-place) but does not lift the result count.
"""
from __future__ import annotations

from typing import Optional


def _tier(user_ctx: Optional[dict]) -> str:
    if user_ctx is None:
        return "anonymous"
    return (user_ctx.get("tier") or "free").lower()


def find_contacts_cap(user_ctx: Optional[dict]) -> int:
    tier = _tier(user_ctx)
    if tier == "elite":
        return 15
    if tier == "pro":
        return 8
    return 5  # anonymous + free signed-in


def cap_message(user_ctx: Optional[dict], cap: int) -> str:
    """User-facing note attached to truncated responses."""
    tier = _tier(user_ctx)
    if tier == "anonymous":
        return (
            f"Free tier returns up to {cap} contacts. "
            "Connect your Offerloop account to lift the cap based on your plan."
        )
    if tier == "free":
        return (
            f"Free plan returns up to {cap} contacts. "
            "Upgrade to Pro for 8 per search or Elite for 15."
        )
    if tier == "pro":
        return f"Pro plan returns up to {cap} contacts. Upgrade to Elite for 15."
    return f"Elite plan returns up to {cap} contacts."
