"""
SERP API Client - Google Search integration for company discovery
Replaces PDL Company Search with SERP API + ChatGPT extraction
"""
import requests
import json
import os
import time
import uuid
import logging
from typing import Optional, List, Dict, Any
from app.config import SERPAPI_KEY

logger = logging.getLogger(__name__)

SERPAPI_BASE_URL = "https://serpapi.com/search"

# Configuration for iterative fetching
OVERFETCH_MULTIPLIER = float(os.getenv('FIRM_SEARCH_OVERFETCH_MULTIPLIER', '2.5'))  # Initial multiplier
RETRY_MULTIPLIER = float(os.getenv('FIRM_SEARCH_RETRY_MULTIPLIER', '3.0'))  # Multiplier for retries
MAX_ITERATIONS = int(os.getenv('FIRM_SEARCH_MAX_ITERATIONS', '2'))  # Maximum retry attempts (reduced from 3 for speed)
MAX_TOTAL_FIRMS_MULTIPLIER = float(os.getenv('FIRM_SEARCH_MAX_TOTAL_MULTIPLIER', '5.0'))  # limit × this = absolute cap
MIN_BATCH_BUFFER = 5  # Always generate at least needed + this many firms per iteration

# Filtering success rate tracking for adaptive multipliers (in-memory)
_filter_stats = {}  # {(industry, location_key): {"success_rate": float, "iterations": int}}

# Search metrics tracking
_search_metrics = {
    "total_searches": 0,
    "single_iteration": 0,
    "double_iteration": 0,
    "total_rejections": 0
}


def get_search_metrics() -> Dict[str, Any]:
    """
    Get aggregate search metrics.
    
    Returns:
        Dictionary with search statistics including double iteration rate
    """
    total = _search_metrics["total_searches"]
    return {
        **_search_metrics,
        "double_iteration_rate": round(
            _search_metrics["double_iteration"] / max(1, total),
            2
        ) if total > 0 else 0
    }


def _normalize_location_for_stats(location: Dict[str, Optional[str]]) -> str:
    """Create a normalized location key for statistics tracking."""
    parts = []
    if location.get("locality"):
        parts.append(location["locality"].lower())
    if location.get("region"):
        parts.append(location["region"].lower())
    if location.get("country"):
        parts.append(location["country"].lower())
    return "|".join(parts) if parts else "unknown"


def _calculate_adaptive_multiplier(industry: str, location: Dict[str, Optional[str]], iteration: int) -> float:
    """
    Calculate adaptive multiplier based on historical filtering success rates.
    If we know that only 30% of firms pass location filtering, we need ~3.3x multiplier.
    """
    location_key = _normalize_location_for_stats(location)
    stats_key = (industry.lower(), location_key)
    
    if stats_key in _filter_stats and iteration > 0:
        success_rate = _filter_stats[stats_key]["success_rate"]
        # Cap success rate between 0.1 (10%) and 1.0 (100%)
        success_rate = max(0.1, min(1.0, success_rate))
        # Calculate multiplier: if 30% pass, need 1/0.3 = 3.3x
        calculated_mult = 1.0 / success_rate
        # Cap between 2.0x and 6.0x for safety
        adaptive_mult = max(2.0, min(6.0, calculated_mult))
        logger.debug("Using adaptive multiplier", extra={
            "multiplier": round(adaptive_mult, 2),
            "success_rate": round(success_rate * 100, 1),
            "industry": industry,
            "location_key": location_key
        })
        return adaptive_mult
    
    # Use defaults for first iteration or unknown patterns
    return OVERFETCH_MULTIPLIER if iteration == 0 else RETRY_MULTIPLIER


def _update_filter_stats(industry: str, location: Dict[str, Optional[str]], added: int, total_tried: int):
    """Update filtering statistics for adaptive multiplier calculation."""
    if total_tried == 0:
        return
    
    location_key = _normalize_location_for_stats(location)
    stats_key = (industry.lower(), location_key)
    
    success_rate = added / total_tried
    
    if stats_key in _filter_stats:
        # Exponential moving average for stability
        old_rate = _filter_stats[stats_key]["success_rate"]
        # Weight new rate 30%, old rate 70%
        _filter_stats[stats_key]["success_rate"] = 0.3 * success_rate + 0.7 * old_rate
        _filter_stats[stats_key]["iterations"] += 1
    else:
        _filter_stats[stats_key] = {
            "success_rate": success_rate,
            "iterations": 1
        }
    
    logger.debug("Updated filter stats", extra={
        "industry": industry,
        "location_key": location_key,
        "success_rate": round(_filter_stats[stats_key]['success_rate'] * 100, 1),
        "iterations": _filter_stats[stats_key]['iterations']
    })


def _extract_domain(url: Optional[str]) -> str:
    """Extract domain from URL for deduplication."""
    if not url:
        return ""
    # Remove protocol
    domain = url.replace("https://", "").replace("http://", "").replace("www.", "")
    # Get just the domain part (before first /)
    domain = domain.split("/")[0]
    return domain.lower().strip()


def build_google_search_query(
    industry: str,
    location: Dict[str, Optional[str]],
    size: str = "none",
    keywords: List[str] = None,
    strictness: int = 3
) -> str:
    """
    Build a Google search query from structured filters.
    Mimics the PDL query building logic but for Google search.
    
    STRICTNESS LEVELS:
    - 3 (strict): All filters applied (industry + location + size + keywords)
    - 2 (medium): Industry + location + size only
    - 1 (loose): Industry + location only
    - 0 (minimal): Location only
    """
    if keywords is None:
        keywords = []
    
    query_parts = []
    
    # LEVEL 0+: Location (always include)
    if strictness >= 1:
        if location.get("locality"):
            query_parts.append(location["locality"])
        if location.get("region"):
            query_parts.append(location["region"])
        if location.get("metro"):
            query_parts.append(location["metro"])
    
    # Always include country if available
    if location.get("country"):
        country = location["country"]
        # Normalize country name
        if country.lower() in ["united states", "usa", "us"]:
            country = "United States"
        query_parts.append(country)
    
    # LEVEL 1+: Industry
    if strictness >= 1 and industry:
        # Convert industry to search-friendly terms
        industry_terms = {
            "investment banking": "investment banks",
            "real estate private equity": "real estate private equity firms",
            "venture capital": "venture capital firms",
            "private equity": "private equity firms",
            "consulting": "consulting companies",
            "software engineering": "software companies",
            "product management": "product management companies",
            "hedge fund": "hedge funds",
            "asset management": "asset management firms",
            "accounting": "accounting firms"
        }
        industry_query = industry_terms.get(industry.lower(), f"{industry} companies")
        query_parts.append(industry_query)
    
    # LEVEL 2+: Size
    if strictness >= 2 and size != "none":
        size_terms = {
            "small": "small companies",
            "mid": "mid-sized companies",
            "large": "large companies"
        }
        if size in size_terms:
            query_parts.append(size_terms[size])
    
    # LEVEL 3: Keywords
    if strictness >= 3 and keywords:
        query_parts.extend(keywords[:2])  # Limit to first 2 keywords
    
    # Build final query
    if query_parts:
        query = " ".join(query_parts)
    else:
        # Fallback: at least search by location
        if location.get("country"):
            query = f"companies in {location['country']}"
        else:
            query = "companies"
    
    return query


def search_companies_with_serp(
    industry: str,
    location: Dict[str, Optional[str]],
    size: str = "none",
    keywords: List[str] = None,
    limit: int = 20,
    original_query: str = ""
) -> Dict[str, Any]:
    """
    Search for companies using ChatGPT to generate firm names, then SERP to get details.
    Uses iterative fetching to ensure we return the requested number of firms.
    
    ITERATIVE APPROACH:
    1. Generate more firms than requested (overfetch)
    2. Fetch details and filter by location
    3. If not enough firms, generate more and retry (up to MAX_ITERATIONS)
    4. Return exactly the requested number (or as many as available)
    
    Returns:
        {
            "success": bool,
            "firms": list[Firm],
            "total": int,
            "error": str or None,
            "queryLevel": int (always 3 for this approach)
        }
    """
    # Validate API key is configured
    if not SERPAPI_KEY:
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "error": "Search service configuration error. Please contact support.",
            "queryLevel": None
        }
    
    if keywords is None:
        keywords = []
    
    try:
        from app.services.company_extraction import generate_firm_names_with_chatgpt
        from app.services.firm_details_extraction import get_firm_details_batch
        from app.services.company_search import transform_serp_company_to_firm, firm_location_matches
        
        # Generate search ID for end-to-end tracing
        search_id = str(uuid.uuid4())[:8]  # Short ID for readability
        start_time = time.time()
        
        # Track firms collected across iterations
        firms_collected = []
        seen_domains = set()
        firm_names_tried = set()  # Track firm names we've already tried
        max_total_firms = int(limit * MAX_TOTAL_FIRMS_MULTIPLIER)  # Absolute cap
        iterations_completed = 0
        
        # Calculate initial multiplier for logging
        initial_multiplier = _calculate_adaptive_multiplier(industry, location, 0)
        
        logger.info("company_search_started", extra={
            "search_id": search_id,
            "industry": industry,
            "location": str(location),
            "size": size,
            "keywords": keywords,
            "limit": limit,
            "max_total_firms": max_total_firms,
            "initial_multiplier": round(initial_multiplier, 2),
            "original_query": original_query[:100] if original_query else None  # Truncate for logging
        })
        
        # Iterative fetching loop
        for iteration in range(MAX_ITERATIONS):
            iterations_completed = iteration + 1
            needed = limit - len(firms_collected)
            if needed <= 0:
                logger.info("company_search_early_stop", extra={
                    "search_id": search_id,
                    "reason": "enough_firms",
                    "firms_collected": len(firms_collected),
                    "limit": limit,
                    "iteration": iteration + 1
                })
                break
            
            # Calculate batch size for this iteration
            # Use adaptive multiplier based on historical success rates
            multiplier = _calculate_adaptive_multiplier(industry, location, iteration)
            batch_size = max(needed + MIN_BATCH_BUFFER, int(needed * multiplier))
            
            # Check absolute cap
            remaining_quota = max_total_firms - len(firm_names_tried)
            if remaining_quota <= 0:
                logger.warning("company_search_early_stop", extra={
                    "search_id": search_id,
                    "reason": "absolute_cap",
                    "max_total_firms": max_total_firms,
                    "firms_tried": len(firm_names_tried),
                    "iteration": iteration + 1
                })
                break
            
            batch_size = min(batch_size, remaining_quota)
            
            logger.info("company_search_iteration_start", extra={
                "search_id": search_id,
                "iteration": iteration + 1,
                "max_iterations": MAX_ITERATIONS,
                "firms_needed": needed,
                "batch_size": batch_size,
                "multiplier": round(multiplier, 2),
                "firms_collected_so_far": len(firms_collected),
                "firms_tried_so_far": len(firm_names_tried)
            })
            
            # Generate firm names (avoid duplicates)
            firm_names = generate_firm_names_with_chatgpt(
                filters={
                    "industry": industry,
                    "location": location,
                    "size": size,
                    "keywords": keywords
                },
                limit=batch_size,
                original_query=original_query
            )
            
            if not firm_names:
                logger.warning("company_search_no_firm_names", extra={
                    "search_id": search_id,
                    "iteration": iteration + 1
                })
                break
            
            # Note if ChatGPT returned fewer than requested (common behavior)
            if len(firm_names) < batch_size:
                logger.debug("company_search_fewer_firm_names", extra={
                    "search_id": search_id,
                    "iteration": iteration + 1,
                    "requested": batch_size,
                    "received": len(firm_names)
                })
            
            # Filter out firm names we've already tried
            new_firm_names = [n for n in firm_names if n.lower().strip() not in firm_names_tried]
            firm_names_tried.update(n.lower().strip() for n in new_firm_names)
            
            if not new_firm_names:
                logger.warning("company_search_all_duplicates", extra={
                    "search_id": search_id,
                    "iteration": iteration + 1
                })
                break
            
            if len(new_firm_names) < len(firm_names):
                logger.debug("company_search_duplicates_filtered", extra={
                    "search_id": search_id,
                    "iteration": iteration + 1,
                    "duplicates_filtered": len(firm_names) - len(new_firm_names)
                })
            
            logger.debug("company_search_firm_names_generated", extra={
                "search_id": search_id,
                "iteration": iteration + 1,
                "new_firm_names": len(new_firm_names),
                "total_tried": len(firm_names_tried)
            })
            
            # Get details for firms using SERP API (parallel processing)
            logger.debug("company_search_fetching_details", extra={
                "search_id": search_id,
                "iteration": iteration + 1,
                "firms_to_fetch": len(new_firm_names)
            })
            
            # Progress tracking
            progress_data = {"completed": 0, "total": len(new_firm_names)}
            
            def progress_callback(current, total):
                progress_data["completed"] = current
                if current % max(1, total // 5) == 0 or current == total:
                    logger.debug("company_search_progress", extra={
                        "search_id": search_id,
                        "iteration": iteration + 1,
                        "completed": current,
                        "total": total,
                        "percent": int(current/total*100)
                    })
            
            firms_data = get_firm_details_batch(
                new_firm_names,
                location,
                max_workers=15,  # OPTIMIZED: Increased for faster processing (batch extraction reduces rate limit issues)
                progress_callback=progress_callback,
                max_results=None,  # Don't limit here - we'll filter and limit later
                search_id=search_id  # Pass search_id for logging correlation
            )
            
            if not firms_data:
                logger.warning("company_search_no_firm_details", extra={
                    "search_id": search_id,
                    "iteration": iteration + 1
                })
                continue
            
            # Transform to Firm format and filter by location
            filtered_count = 0
            added_count = 0
            
            for company_data in firms_data:
                # Check for duplicate domains
                website = company_data.get("website") or company_data.get("linkedinUrl", "")
                domain = _extract_domain(website)
                
                if domain and domain in seen_domains:
                    continue
                
                firm = transform_serp_company_to_firm(company_data)
                if firm:
                    # Filter by location
                    firm_location = firm.get("location", {})
                    if firm_location_matches(firm_location, location, search_id=search_id):
                        firms_collected.append(firm)
                        added_count += 1
                        if domain:
                            seen_domains.add(domain)
                    else:
                        filtered_count += 1
                        _search_metrics["total_rejections"] += 1
                        # Log individual firm rejection
                        from app.services.company_search import _get_rejection_reason
                        rejection_reason = _get_rejection_reason(firm_location, location)
                        logger.debug("company_search_firm_rejected", extra={
                            "search_id": search_id,
                            "firm_name": firm.get("name"),
                            "firm_location": firm_location.get("display", str(firm_location)),
                            "requested_location": str(location),
                            "rejection_reason": rejection_reason
                        })
            
            total_tried_in_iteration = added_count + filtered_count
            filter_rate = round(filtered_count / total_tried_in_iteration, 2) if total_tried_in_iteration > 0 else 0
            
            logger.info("company_search_iteration_complete", extra={
                "search_id": search_id,
                "iteration": iteration + 1,
                "firms_added": added_count,
                "firms_filtered": filtered_count,
                "filter_rate": filter_rate,
                "total_collected": len(firms_collected),
                "still_needed": max(0, limit - len(firms_collected))
            })
            
            # Update filtering statistics for adaptive multipliers
            total_tried_in_iteration = added_count + filtered_count
            if total_tried_in_iteration > 0:
                _update_filter_stats(industry, location, added_count, total_tried_in_iteration)
            
            # OPTIMIZATION: Early stopping - if no firms matched after first iteration, stop
            # (First iteration failure might be normal, but subsequent failures suggest tight filtering)
            if added_count == 0 and iteration > 0:
                logger.warning("company_search_early_stop", extra={
                    "search_id": search_id,
                    "reason": "no_firms_matched",
                    "iteration": iteration + 1
                })
                break
            
            # Check if we have enough
            if len(firms_collected) >= limit:
                logger.info("company_search_early_stop", extra={
                    "search_id": search_id,
                    "reason": "enough_firms",
                    "firms_collected": len(firms_collected),
                    "limit": limit,
                    "iteration": iteration + 1
                })
                break
        
        # Sort firms by employee count in DESCENDING order (largest first)
        # When size is not specified, we want the biggest firms
        firms_collected.sort(key=lambda f: f.get('employeeCount') if f.get('employeeCount') is not None else 0, reverse=True)
        
        # Return exactly the requested number
        firms = firms_collected[:limit]
        
        # Calculate duration
        duration_seconds = round(time.time() - start_time, 2)
        
        # Update metrics
        _search_metrics["total_searches"] += 1
        if iterations_completed == 1:
            _search_metrics["single_iteration"] += 1
        else:
            _search_metrics["double_iteration"] += 1
        
        # Return results
        if len(firms) > 0:
            logger.info("company_search_completed", extra={
                "search_id": search_id,
                "iterations_used": iterations_completed,
                "firms_requested": limit,
                "firms_found": len(firms),
                "success": len(firms) >= limit,
                "partial": 0 < len(firms) < limit,
                "duration_seconds": duration_seconds
            })
            
            # If we got fewer firms than requested, include a note
            error_msg = None
            if len(firms) < limit:
                error_msg = f"Found {len(firms)} firms matching your criteria (requested {limit}). Try broadening your search."
            
            return {
                "success": True,
                "firms": firms,
                "total": len(firms),
                "error": error_msg,  # Informational, not a failure
                "queryLevel": 3,
                "partial": len(firms) < limit  # Indicate if partial results
            }
        else:
            # No firms found at all
            logger.warning("company_search_completed", extra={
                "search_id": search_id,
                "iterations_used": iterations_completed,
                "firms_requested": limit,
                "firms_found": 0,
                "success": False,
                "partial": False,
                "duration_seconds": duration_seconds
            })
            return {
                "success": False,
                "firms": [],
                "total": 0,
                "error": "Could not find firms matching your criteria. Try broadening your search.",
                "queryLevel": 3
            }
        
    except Exception as e:
        duration_seconds = round(time.time() - start_time, 2) if 'start_time' in locals() else 0
        logger.error("company_search_error", extra={
            "search_id": search_id if 'search_id' in locals() else None,
            "error": str(e),
            "duration_seconds": duration_seconds
        }, exc_info=True)
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "error": f"Search failed: {str(e)}",
            "queryLevel": None
        }
