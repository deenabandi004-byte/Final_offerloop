"""
Apify client — LinkedIn profile posts via HarvestAPI's actor.

Primary live source for LinkedIn recent_posts on contacts in the email
generation pipeline. PDL `summary` field fills linkedin_summary as a
free fallback (handled in personalization.build_contact_profile).

Firecrawl dropped LinkedIn support; Bright Data was previously in the
chain but was 17-33x more expensive and the account was broken — both
removed from the email pipeline.
"""
from __future__ import annotations

import logging
import os
import re

import requests

from app.services.metering import meter_call

logger = logging.getLogger(__name__)

APIFY_API_KEY = os.getenv("APIFY_API_KEY")
APIFY_ACTOR_ID = "harvestapi~linkedin-profile-posts"
APIFY_RUN_SYNC_URL = (
    f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}/run-sync-get-dataset-items"
)
APIFY_TIMEOUT_S = 180
APIFY_MAX_POSTS_PER_PROFILE = 5

# User-profile scraping actor for the Scout strategist rebuild. Configurable so
# the operator can swap actors without a code change if HarvestAPI's profile
# actor naming shifts. Default stays in the same Apify org as the posts actor
# we already use, which makes auth / quotas / billing one surface.
APIFY_USER_PROFILE_ACTOR_ID = os.getenv(
    "APIFY_USER_PROFILE_ACTOR_ID", "harvestapi~linkedin-profile-scraper"
)
APIFY_USER_PROFILE_URL = (
    f"https://api.apify.com/v2/acts/{APIFY_USER_PROFILE_ACTOR_ID}"
    "/run-sync-get-dataset-items"
)
# Full mode on harvestapi/linkedin-profile-scraper runs 10-30s typical, up to
# 60s under load (per Apify docs). 90s gives headroom without parking the
# coffee-chat thread forever on a single bad profile.
APIFY_USER_PROFILE_TIMEOUT_S = 90


def _canonicalize_linkedin_url(url: str) -> str:
    """Force https://www.linkedin.com/in/<slug>.

    Robust to common PDL/legacy variations:
    - missing protocol (linkedin.com/in/slug)
    - missing www
    - mobile (m.linkedin.com)
    - trailing slash, query params, fragments
    - trailing locale path (/en, /fr)
    """
    if not url:
        return ""
    url = url.strip().rstrip("/")
    url = url.split("?")[0].split("#")[0]
    url = re.sub(r"/[a-z]{2}$", "", url, flags=re.IGNORECASE)
    m = re.search(r"linkedin\.com/in/([\w-]+)", url, re.IGNORECASE)
    if m:
        return f"https://www.linkedin.com/in/{m.group(1).lower()}"
    return ""


def _extract_post_text(item) -> str:
    if not isinstance(item, dict):
        return ""
    for key in ("text", "content", "postText", "post_text", "description", "title"):
        val = item.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def _extract_post_source_url(item) -> str:
    """HarvestAPI nests author info under `item.author`:
        author.linkedinUrl       -> https://www.linkedin.com/in/<slug>?...
        author.publicIdentifier  -> <slug>
    Falls back to top-level fields then `query.url`.
    """
    if not isinstance(item, dict):
        return ""
    author = item.get("author")
    if isinstance(author, dict):
        url = author.get("linkedinUrl")
        if isinstance(url, str) and url.strip():
            canon = _canonicalize_linkedin_url(url)
            if canon:
                return canon
        slug = author.get("publicIdentifier")
        if isinstance(slug, str) and slug.strip():
            return f"https://www.linkedin.com/in/{slug.strip().lower()}"
    for key in ("inputUrl", "input_url", "profileUrl", "profile_url", "sourceUrl", "source_url"):
        val = item.get(key)
        if isinstance(val, str) and val.strip():
            return _canonicalize_linkedin_url(val)
    query = item.get("query")
    if isinstance(query, dict):
        url = query.get("url") or query.get("profileUrl")
        if isinstance(url, str) and url.strip():
            return _canonicalize_linkedin_url(url)
    return ""


@meter_call("apify", "linkedin_posts")
def batch_enrich_linkedin_posts_via_apify(contacts: list[dict]) -> dict[int, dict]:
    """Scrape recent LinkedIn posts for a batch of contacts via Apify.

    Returns dict keyed by contact index:
        {linkedin_recent_posts: list[str]}
    Contacts without a LinkedIn URL or with no posts get no entry.
    """
    if not APIFY_API_KEY:
        logger.warning("[Apify] APIFY_API_KEY not set; skipping batch")
        return {}

    url_to_indices: dict[str, list[int]] = {}
    for idx, c in enumerate(contacts):
        raw = (
            c.get("LinkedIn")
            or c.get("linkedin_url")
            or c.get("linkedinUrl")
            or ""
        ).strip()
        canon = _canonicalize_linkedin_url(raw)
        if not canon:
            if raw:
                name = f"{c.get('FirstName', '')} {c.get('LastName', '')}".strip() or "?"
                logger.warning(f"[Apify] Could not canonicalize LinkedIn URL for {name}: {raw!r}")
            continue
        url_to_indices.setdefault(canon, []).append(idx)

    if not url_to_indices:
        return {}

    try:
        from app.services.enrichment_cache import get_cached, set_cached
    except Exception:
        get_cached = None
        set_cached = None

    results: dict[int, dict] = {}
    urls_to_fetch: list[str] = []
    for canon in url_to_indices:
        cached = None
        if get_cached:
            try:
                cached = get_cached("contact_enrichment", ["linkedin_apify_posts", canon])
            except Exception:
                cached = None
        if cached:
            for idx in url_to_indices[canon]:
                results[idx] = cached
        else:
            urls_to_fetch.append(canon)

    if not urls_to_fetch:
        return results

    try:
        logger.info(f"[Apify] Scraping {len(urls_to_fetch)} LinkedIn profiles")
        for u in urls_to_fetch:
            logger.info(f"[Apify]   -> {u}")
        response = requests.post(
            APIFY_RUN_SYNC_URL,
            params={"token": APIFY_API_KEY},
            headers={"Content-Type": "application/json"},
            json={
                "targetUrls": urls_to_fetch,
                "maxPosts": APIFY_MAX_POSTS_PER_PROFILE,
                "maxReactions": 0,
                "maxComments": 0,
            },
            timeout=APIFY_TIMEOUT_S,
        )
        # Apify's run-sync endpoint returns 201 (Created) on success
        if response.status_code not in (200, 201):
            logger.error(f"[Apify] HTTP {response.status_code}: {response.text[:400]}")
            return results

        items = response.json()
        if not isinstance(items, list):
            logger.warning(f"[Apify] Unexpected response shape: {str(items)[:200]}")
            return results

        posts_per_url: dict[str, list[str]] = {}
        for item in items:
            text = _extract_post_text(item)
            if not text or len(text) < 20:
                continue
            src = _extract_post_source_url(item)
            if not src or src not in url_to_indices:
                continue
            bucket = posts_per_url.setdefault(src, [])
            if text not in bucket:
                bucket.append(text)

        for canon, posts in posts_per_url.items():
            payload = {"linkedin_recent_posts": posts[:APIFY_MAX_POSTS_PER_PROFILE]}
            if set_cached:
                try:
                    set_cached("contact_enrichment", ["linkedin_apify_posts", canon], payload)
                except Exception:
                    pass
            for idx in url_to_indices[canon]:
                results[idx] = payload

        return results
    except requests.Timeout:
        logger.error("[Apify] Batch request timed out")
        return results
    except requests.RequestException as e:
        logger.error(f"[Apify] Request error: {e}")
        return results
    except Exception as e:
        logger.error(f"[Apify] Unexpected error: {e}", exc_info=True)
        return results


# ---------------------------------------------------------------------------
# User-profile scraping (Scout strategist rebuild)
#
# Two single-user calls used by:
#   - enrichment.py onboarding flow (Apify-first, PDL fallback on failure)
#   - lazy-on-login backfill for users with linkedinEnrichmentSource != "apify"
#   - Scout panel auto-briefing context fetch (recent posts)
#
# Why "single-user" instead of reusing batch_enrich_linkedin_posts_via_apify:
# the batch call is shaped around contact-search where ~8 URLs are scraped at
# once and cached per-canon. Onboarding scrapes one URL with a tighter
# timeout, and writes a different cache key. Keeping the two paths separate
# means an outage in one (e.g., the profile actor) cannot blast-radius the
# other (contact posts in active email pipelines).
# ---------------------------------------------------------------------------


def _envelope(source: str, **extras) -> dict:
    """Common shape for both user-profile and user-posts return values.

    ok=False means "Apify did not return usable data" so callers can fall back
    to PDL or skip enrichment. We never raise from these functions — onboarding
    must keep moving even when Apify is down.
    """
    env = {"ok": False, "source": source, "actor": None, "data": None}
    env.update(extras)
    return env


@meter_call("apify", "user_linkedin_profile")
def enrich_user_linkedin_profile_via_apify(linkedin_url: str) -> dict:
    """Scrape one user's own LinkedIn profile.

    Used at onboarding and during lazy-on-login backfill. Returns:
      {
        "ok": bool,
        "source": "apify" | "apify_no_data",
        "actor": str | None,
        "data": dict | None,        # raw Apify item (the first dataset row)
        "error": str (only on ok=False),
      }

    The raw item is passed back as-is so utils/linkedin_enrichment.py can
    apply its existing llm_enrich_profile() normalizer (which handles a range
    of upstream shapes) without this module having to know the actor's exact
    payload contract. If a future actor swap changes field names, the
    normalizer is the single place to update.

    Never raises. Onboarding is on the critical-path of the signup funnel.
    """
    if not APIFY_API_KEY:
        logger.warning("[Apify] APIFY_API_KEY not set; cannot scrape user profile")
        return _envelope("apify_no_key", error="no_api_key")

    canon = _canonicalize_linkedin_url(linkedin_url or "")
    if not canon:
        return _envelope("apify_bad_url", error="bad_url")

    try:
        logger.info(
            f"[Apify] User-profile scrape via {APIFY_USER_PROFILE_ACTOR_ID}: {canon}"
        )
        response = requests.post(
            APIFY_USER_PROFILE_URL,
            params={"token": APIFY_API_KEY},
            headers={"Content-Type": "application/json"},
            # Most LinkedIn profile actors accept one of these input shapes.
            # Sending both is harmless: actors ignore unknown keys.
            json={
                "profileUrls": [canon],
                "startUrls": [{"url": canon}],
            },
            timeout=APIFY_USER_PROFILE_TIMEOUT_S,
        )
        if response.status_code not in (200, 201):
            logger.error(
                f"[Apify] User-profile HTTP {response.status_code}: {response.text[:400]}"
            )
            return _envelope(
                "apify_http_error",
                error=f"http_{response.status_code}",
                actor=APIFY_USER_PROFILE_ACTOR_ID,
            )

        items = response.json()
        if not isinstance(items, list):
            logger.warning(
                f"[Apify] User-profile unexpected shape: {str(items)[:200]}"
            )
            return _envelope(
                "apify_bad_shape",
                error="bad_shape",
                actor=APIFY_USER_PROFILE_ACTOR_ID,
            )

        # Drop empties; some actors return [] on private/deleted profiles.
        items = [it for it in items if isinstance(it, dict) and it]
        if not items:
            logger.info(f"[Apify] User-profile returned no data for {canon}")
            return _envelope(
                "apify_no_data",
                error="no_data",
                actor=APIFY_USER_PROFILE_ACTOR_ID,
            )

        return {
            "ok": True,
            "source": "apify",
            "actor": APIFY_USER_PROFILE_ACTOR_ID,
            "data": items[0],
        }
    except requests.Timeout:
        logger.error("[Apify] User-profile request timed out")
        return _envelope("apify_timeout", error="timeout", actor=APIFY_USER_PROFILE_ACTOR_ID)
    except requests.RequestException as e:
        logger.error(f"[Apify] User-profile request error: {e}")
        return _envelope("apify_request_error", error=str(e), actor=APIFY_USER_PROFILE_ACTOR_ID)
    except Exception as e:
        logger.error(f"[Apify] User-profile unexpected error: {e}", exc_info=True)
        return _envelope("apify_unexpected", error=str(e), actor=APIFY_USER_PROFILE_ACTOR_ID)


@meter_call("apify", "user_linkedin_posts")
def enrich_user_linkedin_posts_via_apify(
    linkedin_url: str,
    max_posts: int = APIFY_MAX_POSTS_PER_PROFILE,
) -> list[str]:
    """Scrape one user's recent LinkedIn posts.

    Used by the Scout strategist to ground briefings in current activity
    ("I noticed your recent post about X — leverage in outreach to..."). Cache
    TTL is 24h (handled in the caller via enrichment_cache) so the cost stays
    bounded at ~$0.01/user-day even when briefings fire frequently.

    Returns a list of post strings (possibly empty). Never raises.
    """
    if not APIFY_API_KEY:
        logger.warning("[Apify] APIFY_API_KEY not set; cannot scrape user posts")
        return []

    canon = _canonicalize_linkedin_url(linkedin_url or "")
    if not canon:
        return []

    try:
        # Reuse the existing posts actor — same one the contact pipeline uses.
        response = requests.post(
            APIFY_RUN_SYNC_URL,
            params={"token": APIFY_API_KEY},
            headers={"Content-Type": "application/json"},
            json={
                "targetUrls": [canon],
                "maxPosts": max(1, min(int(max_posts), APIFY_MAX_POSTS_PER_PROFILE)),
                "maxReactions": 0,
                "maxComments": 0,
            },
            timeout=APIFY_TIMEOUT_S,
        )
        if response.status_code not in (200, 201):
            logger.error(
                f"[Apify] User-posts HTTP {response.status_code}: {response.text[:400]}"
            )
            return []

        items = response.json()
        if not isinstance(items, list):
            return []

        posts: list[str] = []
        for item in items:
            text = _extract_post_text(item)
            if not text or len(text) < 20:
                continue
            # The strategist only wants this user's posts, so filter by source
            # URL when the actor populates it (some actors don't on single-URL
            # runs since the query is unambiguous).
            src = _extract_post_source_url(item)
            if src and src != canon:
                continue
            if text not in posts:
                posts.append(text)
            if len(posts) >= max_posts:
                break
        return posts
    except requests.Timeout:
        logger.error("[Apify] User-posts request timed out")
        return []
    except requests.RequestException as e:
        logger.error(f"[Apify] User-posts request error: {e}")
        return []
    except Exception as e:
        logger.error(f"[Apify] User-posts unexpected error: {e}", exc_info=True)
        return []
