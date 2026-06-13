"""
Client IP extraction and hashing for the MCP server.

Render sits behind a reverse proxy that sets X-Forwarded-For. The first
hop in that header is the actual client. Falls back to Flask's
request.remote_addr in dev / direct hits.

Hashing salts the IP with FLASK_SECRET so document IDs in
mcp_rate_limits / mcp_events can't be enumerated back to raw IPs.
"""
from __future__ import annotations

import hashlib
from typing import Optional

from app import config


def extract_client_ip(req) -> str:
    """Return the client's IP from a Flask request object.

    Prefers the first hop in X-Forwarded-For (set by Render's proxy),
    falls back to request.remote_addr. Returns "0.0.0.0" if nothing
    is available so callers always get a string.
    """
    xff = req.headers.get("X-Forwarded-For", "") or ""
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return req.remote_addr or "0.0.0.0"


def hash_ip(ip: str, *, secret: Optional[str] = None) -> str:
    """Hash an IP with FLASK_SECRET as salt, return 16-hex-char prefix.

    16 chars is enough for collision-resistance at our scale and keeps
    Firestore document IDs short. Constant secret + per-IP raw input
    means the same IP always hashes the same way (so rate limits
    accumulate), but external parties can't reverse the hash without
    FLASK_SECRET.
    """
    salt = (secret if secret is not None else config.FLASK_SECRET) or "dev"
    payload = f"{ip}:{salt}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:16]
