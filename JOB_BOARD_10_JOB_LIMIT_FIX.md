# Job Board 10 Job Limit Investigation & Fix

## Problem
The Job Board was only displaying 10 jobs despite backend code attempting to fetch up to 200 jobs on the first page.

## Root Cause Analysis

### 1. SerpAPI Limitation (Expected)
- **Location**: `backend/app/routes/job_board.py:291`
- **Issue**: SerpAPI Google Jobs API only returns 10 results per request
- **Status**: This is correct and expected behavior
- **Code**: `"num": min(num_results, 10)`

### 2. Cache Preventing Pagination (FIXED)
- **Location**: `backend/app/routes/job_board.py:252-264`
- **Issue**: When cache hit occurred with legacy format (just a list, no `next_page_token`), the function returned only 10 jobs with `None` as the next token, causing the pagination loop to stop after the first page
- **Fix**: Updated cache logic to bypass cache for legacy format entries with ≤10 jobs, forcing fresh fetch to get proper pagination tokens

### 3. Pagination Loop Logic (FIXED)
- **Location**: `backend/app/routes/job_board.py:1275-1304`
- **Issue**: The loop could break prematurely if:
  - Cache returned legacy format without next_token
  - SerpAPI didn't return a next_page_token
  - Loop only checked `if not next_token` without considering we might need more jobs
- **Fix**: 
  - Improved loop logic to only use cache for the first page (`page_num == 0`)
  - Bypass cache for subsequent pages to ensure fresh data
  - Added better logging to track pagination progress
  - Continue fetching until we reach 200 jobs or truly exhaust available results

## Changes Made

### File: `backend/app/routes/job_board.py`

1. **Updated cache retrieval logic** (lines ~252-270):
   - Only cache first page requests to avoid stale pagination data
   - Detect legacy cache format (list without next_token)
   - Bypass cache if legacy format has ≤10 jobs (likely incomplete)
   - Always fetch fresh for subsequent pages

2. **Improved pagination loop** (lines ~1275-1330):
   - Added `consecutive_empty_results` counter to handle edge cases
   - Only use cache for first page request (`page_num == 0`)
   - Added detailed logging for each page fetch
   - Better handling of empty results
   - Continue fetching until 200 jobs reached or no more pages available

## How It Works Now

1. **First Request (Page 1)**:
   - Frontend requests `page: 1, perPage: 200`
   - Backend attempts to fetch up to 20 pages (200 jobs)
   - First page may use cache if available (with proper next_token)
   - Subsequent pages always fetch fresh from SerpAPI
   - Accumulates jobs until 200 reached or no more pages available

2. **Subsequent Requests**:
   - Each page fetches fresh data (no cache for pagination)
   - Returns up to `per_page` jobs per request

## Expected Behavior

- **First page**: Should now return up to 200 jobs (20 pages × 10 jobs/page)
- **Frontend pagination**: Uses frontend pagination with `JOBS_PER_PAGE = 12` to display results
- **Cache behavior**: First page may be cached, but pagination tokens ensure we can fetch more

## Testing Recommendations

1. Test with cache cleared (use `refresh: true` parameter)
2. Verify backend logs show multiple page fetches: `[JobBoard] Page X: Got Y jobs...`
3. Check that response contains more than 10 jobs
4. Verify frontend displays jobs correctly with pagination

## Notes

- SerpAPI charges per request, so fetching 20 pages = 20 API calls
- Consider implementing rate limiting or request throttling if needed
- Cache duration is 6 hours (`CACHE_DURATION_HOURS = 6`)

