"""
Bright Data LinkedIn Profile scraper client.
Uses Bright Data's dataset scraping API to fetch LinkedIn profile data.
"""
import os
import requests
import logging

logger = logging.getLogger(__name__)

BRIGHTDATA_API_KEY = os.getenv('BRIGHTDATA_API_KEY')
BRIGHTDATA_DATASET_ID = 'gd_l1viktl72bvl7bjuj0'
BRIGHTDATA_SCRAPE_URL = 'https://api.brightdata.com/datasets/v3/scrape'


def fetch_linkedin_profile_brightdata(linkedin_url: str) -> dict | None:
    """
    Calls Bright Data sync scrape endpoint for a LinkedIn profile.
    Returns the raw profile dict or None on failure.
    """
    if not BRIGHTDATA_API_KEY:
        logger.warning("[BrightData] BRIGHTDATA_API_KEY not set")
        return None

    linkedin_url = linkedin_url.strip().rstrip('/')
    if not linkedin_url:
        return None

    try:
        logger.info(f"[BrightData] Fetching profile: {linkedin_url}")

        response = requests.post(
            BRIGHTDATA_SCRAPE_URL,
            params={
                'dataset_id': BRIGHTDATA_DATASET_ID,
                'format': 'json',
            },
            headers={
                'Authorization': f'Bearer {BRIGHTDATA_API_KEY}',
                'Content-Type': 'application/json',
            },
            json=[{"url": linkedin_url}],
            timeout=60,
        )

        if response.status_code != 200:
            logger.error(f"[BrightData] HTTP {response.status_code}: {response.text[:300]}")
            return None

        data = response.json()

        if isinstance(data, list) and len(data) > 0:
            profile = data[0]
            logger.info(f"[BrightData] Successfully fetched profile for: {profile.get('name', 'unknown')}")
            return profile

        logger.warning(f"[BrightData] Empty or unexpected response: {str(data)[:200]}")
        return None

    except requests.Timeout:
        logger.error(f"[BrightData] Request timed out for: {linkedin_url}")
        return None
    except requests.RequestException as e:
        logger.error(f"[BrightData] Request error: {e}")
        return None
    except Exception as e:
        logger.error(f"[BrightData] Unexpected error: {e}")
        return None
