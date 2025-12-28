# Job Board Quality & Quantity Improvements - Implementation Plan

## Overview
This document tracks the implementation of 5 tasks to improve job board quantity and quality.

**Target Outcomes:**
- **Quantity:** ~200-240 jobs fetched (up from ~120)
- **Quality:** Fewer stale and low-quality jobs
- **Performance:** Faster fetch time (2-4 seconds, down from 5-10)

---

## Task 1: Increase Pagination Depth (3 → 5 pages) ✅
**Status:** ✅ COMPLETED
**Location:** `fetch_personalized_jobs()` line 2652
**Changes:**
- Change `range(3)` to `range(5)`
- Add early exit if `next_token` is None or no new jobs
- Update comment: "5 pages = 50 jobs max"
- Update `jobs_per_query` calculation to account for 50 jobs

**Expected Impact:**
- +67% more jobs per query (30 → 50 jobs)
- Total jobs: ~200 jobs (4 queries × 5 pages × 10 jobs)

---

## Task 2: Expand Query Diversity (4 → 6 queries) ✅
**Status:** ✅ COMPLETED
**Location:** `build_personalized_queries()` and `fetch_personalized_jobs()`

### Changes:
1. **Update max_queries** (line 2637): Change from 4 to 6
2. **Add Remote-Specific Query** (after Query 4):
   - Format: `"remote {job_type_str} ({major_jobs})"`
   - Priority: 3, Weight: 1.1
   - Only if user has major
   
3. **Add Skill-Pair Query** (after Query 2):
   - Take top 2 skills, combine without OR
   - Format: `"{job_type_str} {skill1} {skill2}"`
   - Priority: 2, Weight: 1.15
   - Only if user has 2+ skills

**Expected Impact:**
- +50% more queries (4 → 6)
- Better coverage of remote jobs
- More targeted skill-based matches

---

## Task 3: Implement Parallel Query Execution ✅
**Status:** ✅ COMPLETED
**Location:** `fetch_personalized_jobs()` lines 2642-2704

### Changes:
1. Import `ThreadPoolExecutor` and `as_completed`
2. Refactor query loop to use ThreadPoolExecutor
3. Create helper function `_fetch_jobs_for_query()` to wrap query logic
4. Execute all queries in parallel
5. Aggregate results after all complete
6. Maintain error handling per query

**Expected Impact:**
- 50-75% faster fetch time (parallel vs sequential)
- Same total jobs, but faster response

---

## Task 4: Stricter Recency Filter ✅
**Status:** ✅ COMPLETED
**Location:** `filter_jobs_by_quality()` or new function

### Changes:
1. Add config constant: `MAX_JOB_AGE_DAYS = int(os.getenv('MAX_JOB_AGE_DAYS', 30))`
2. Create helper function `_parse_job_age_days()` to parse "posted" field
3. Add recency check in `is_job_quality_acceptable()` or new filter
4. Filter out jobs > 30 days old
5. Add logging for filtered jobs

**Expected Impact:**
- Removes stale jobs (> 30 days)
- Better job freshness
- Slightly fewer total jobs (but higher quality)

---

## Task 5: Raise Quality Threshold (10 → 15) ✅
**Status:** ✅ COMPLETED
**Location:** `fetch_personalized_jobs()` line 2707

### Changes:
1. Add config constant: `MIN_QUALITY_SCORE = int(os.getenv('MIN_QUALITY_SCORE', 15))`
2. Update `filter_jobs_by_quality()` call to use new threshold
3. Update default parameter in function signature

**Expected Impact:**
- Higher quality jobs only
- Fewer low-quality jobs in results
- Slightly fewer total jobs (but better quality)

---

## Implementation Order

1. ✅ **Task 1** - Pagination (simplest, immediate impact)
2. ✅ **Task 2** - Query diversity (adds more queries)
3. ✅ **Task 3** - Parallel execution (performance boost)
4. ✅ **Task 4** - Recency filter (quality improvement)
5. ✅ **Task 5** - Quality threshold (quality improvement)

---

## Testing Checklist

- [ ] Verify pagination fetches 5 pages per query (check logs)
- [ ] Verify 6 queries are generated for a user with full profile
- [ ] Verify queries execute in parallel (check timing logs)
- [ ] Verify jobs older than 30 days are filtered out
- [ ] Verify jobs with quality score < 15 are filtered out
- [ ] Verify total jobs returned is higher than before
- [ ] Verify no regressions in existing functionality (caching, deduplication, scoring)

---

## Configuration Variables

Add to top of file or config:
```python
MAX_JOB_AGE_DAYS = int(os.getenv('MAX_JOB_AGE_DAYS', 30))
MIN_QUALITY_SCORE = int(os.getenv('MIN_QUALITY_SCORE', 15))
```

---

## Notes

- All changes maintain backward compatibility
- Error handling preserved for each query
- Caching strategy unchanged (still first page only)
- Deduplication logic unchanged

