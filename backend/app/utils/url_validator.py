"""
URL validation for SSRF prevention.

All outbound fetches of user-supplied URLs MUST pass through validate_fetch_url()
before calling requests.get(). This blocks private/internal IPs, non-HTTPS schemes,
and non-allowlisted domains.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


# Domains we allow fetching from. Extend as needed.
ALLOWED_DOMAINS = {
    # Google Drive / Firebase Storage (resume URLs)
    "drive.google.com",
    "docs.google.com",
    "storage.googleapis.com",
    "firebasestorage.googleapis.com",
    # Job boards (job_url_fetcher)
    "www.linkedin.com",
    "linkedin.com",
    "boards.greenhouse.io",
    "jobs.greenhouse.io",
    "jobs.lever.co",
    "www.indeed.com",
    "indeed.com",
    "www.glassdoor.com",
    "glassdoor.com",
    "www.ziprecruiter.com",
    "ziprecruiter.com",
    "app.joinhandshake.com",
    "joinhandshake.com",
    "wellfound.com",
    "www.wellfound.com",
    "angel.co",
    "myworkday.com",
    "myworkdayjobs.com",
    "careers.google.com",
    "jobs.apple.com",
    "www.amazon.jobs",
    "www.metacareers.com",
    "careers.microsoft.com",
    "builtin.com",
    "www.builtin.com",
    "simplyhired.com",
    "www.simplyhired.com",
    "monster.com",
    "www.monster.com",
}


class UnsafeURLError(Exception):
    """Raised when a URL fails SSRF validation."""
    pass


def validate_fetch_url(url: str, *, extra_domains: set[str] | None = None) -> str:
    """
    Validate a URL is safe to fetch. Returns the cleaned URL.

    Checks:
    1. Scheme must be https (or http for localhost in dev)
    2. Hostname must resolve to a public IP (blocks 127.0.0.1, 10.x, 169.254.x, etc.)
    3. Hostname must be in the allowlist OR end with an allowed parent domain

    Raises UnsafeURLError if the URL fails any check.
    """
    if not url or not isinstance(url, str):
        raise UnsafeURLError("Empty or invalid URL")

    parsed = urlparse(url.strip())

    # 1. Scheme check
    if parsed.scheme not in ("https", "http"):
        raise UnsafeURLError(f"Blocked scheme: {parsed.scheme}")

    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1"):
        raise UnsafeURLError("HTTP only allowed for localhost")

    hostname = (parsed.hostname or "").lower().strip(".")
    if not hostname:
        raise UnsafeURLError("No hostname in URL")

    # 2. DNS resolution + private IP check
    try:
        resolved = socket.getaddrinfo(hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise UnsafeURLError(f"DNS resolution failed for {hostname}")

    for _, _, _, _, sockaddr in resolved:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise UnsafeURLError(f"Blocked private/internal IP for {hostname}")

    # 3. Domain allowlist check
    allowed = ALLOWED_DOMAINS.copy()
    if extra_domains:
        allowed.update(extra_domains)

    domain_ok = False
    for allowed_domain in allowed:
        if hostname == allowed_domain or hostname.endswith("." + allowed_domain):
            domain_ok = True
            break

    if not domain_ok:
        raise UnsafeURLError(
            f"Domain '{hostname}' not in allowlist. "
            "If this is a legitimate job board, add it to ALLOWED_DOMAINS in url_validator.py."
        )

    return url.strip()
