# Job Board: Current Job Fetching & Improvement Opportunities

## Table of Contents
1. [Current Job Fetching Architecture](#current-job-fetching-architecture)
2. [Quality Filters](#quality-filters)
3. [Quantity Limits](#quantity-limits)
4. [Improvement Opportunities](#improvement-opportunities)
5. [Implementation Recommendations](#implementation-recommendations)

---

## Current Job Fetching Architecture

### 1. Data Source: SerpAPI Google Jobs

**Primary Integration:**
- **Service**: SerpAPI Google Jobs API
- **Endpoint**: `https://serpapi.com/search`
- **Engine**: `google_jobs`
- **Rate Limits**: Determined by SerpAPI subscription tier
- **Results per Request**: 10 jobs per page (Google Jobs limitation)

**Key Function**: `fetch_jobs_from_serpapi()`
- Location: `backend/app/routes/job_board.py:228-481`
- Supports pagination via `next_page_token`
- Implements Firestore caching (6-hour cache duration)
- Returns: `(jobs_list, next_page_token)`

### 2. Multi-Query Strategy

**Function**: `fetch_personalized_jobs()`
- Location: `backend/app/routes/job_board.py:2626-2721`
- **Current Approach**: Builds 3-4 personalized queries per user
- **Queries Generated**:
  1. **Major-focused** (Priority 1, Weight 1.2)
     - Uses `get_job_keywords_for_major()` to map major to job titles
     - Example: "internship (Software Engineer OR Developer OR Programmer)"
  
  2. **Skills-focused** (Priority 2, Weight 1.1)
     - Top 3-4 skills from user profile
     - Example: "internship (Python OR JavaScript OR React)"
  
  3. **Extracurricular-aligned** (Priority 3, Weight 1.15)
     - Extracts career signals from extracurriculars
     - Example: "internship (Leadership OR Management OR Project)"
  
  4. **Industry-focused** (Priority 4, Weight 1.0)
     - Based on target industries
     - Example: "internship (Technology OR Software)"
  
  5. **Top Companies Query** (Priority 2, Weight 1.25)
     - Targets prestigious companies based on major/industry
     - Example: "internship (Google OR Microsoft OR Amazon)"
  
  6. **Interest-based** (Priority 5, Weight 1.0)
     - Based on user interests
     - Example: "internship (Machine Learning)"

**Pagination Strategy:**
- Fetches up to 3 pages per query (30 jobs max per query)
- Uses `next_page_token` for pagination
- Only caches first page to avoid stale pagination tokens

**Current Limits:**
- **Max queries per request**: 4 queries
- **Max pages per query**: 3 pages
- **Jobs per page**: 10 jobs
- **Total jobs fetched**: ~120 jobs (4 queries × 3 pages × 10 jobs)
- **Final jobs returned**: Up to 150 jobs (after deduplication and filtering)

### 3. Caching Strategy

**Firestore Cache:**
- **Cache Key**: MD5 hash of `(query, location, job_type, page_token)`
- **Cache Duration**: 6 hours (`CACHE_DURATION_HOURS = 6`)
- **Cache Location**: Firestore collection `job_cache`
- **Cache Format**: `(jobs_list, next_page_token)` tuple
- **Cache Scope**: Only first page cached (to avoid pagination token issues)

**Cache Benefits:**
- Reduces SerpAPI API calls
- Faster response times for repeated queries
- Lower API costs

**Cache Limitations:**
- Only caches first page (subsequent pages always fetch fresh)
- 6-hour cache may show stale jobs for fast-moving markets
- No cache invalidation on job updates

### 4. Job Transformation Pipeline

**Raw SerpAPI → Standardized Format:**
1. **Extract salary** from `detected_extensions` or `extensions`
2. **Detect job type** (Internship, Full-Time, Part-Time, Contract)
3. **Detect remote status** from extensions
4. **Extract posted date** from `detected_extensions.posted_at`
5. **Extract requirements** from `job_highlights` (Qualifications/Requirements section)
6. **Get best apply link** (Priority: LinkedIn > Direct company link > Fallback)
7. **Build standardized job object** with all fields

---

## Quality Filters

### 1. Hard Filters (Always Applied)

**Function**: `is_job_quality_acceptable()`
- Location: `backend/app/routes/job_board.py:1620-1661`

**Filters Applied:**
1. **Generic Company Names**
   - Blocks: "company", "employer", "organization", "confidential", ""
   
2. **Low-Quality Company Patterns**
   - Blocks companies matching `LOW_QUALITY_COMPANY_PATTERNS`
   - Examples: "staffing", "recruiting", "temporary", "temp agency"
   - Exception: Allows if description is >300 chars (might be legit staffing for good company)
   
3. **Too Short Descriptions**
   - Blocks jobs with description < 50 characters
   
4. **Spam Keywords**
   - Blocks jobs containing `SPAM_KEYWORDS`:
     - "make money fast"
     - "work from home!!!"
     - "earn $", "$$"
     - "no experience needed"
     - "hiring immediately!!!"
     - "urgent!!!"
     - "apply now!!!"
     - "!!!"

### 2. Quality Score System

**Function**: `calculate_quality_score()`
- Location: `backend/app/routes/job_board.py:1521-1617`
- **Score Range**: 0-50 points

**Scoring Breakdown:**

1. **Description Quality (0-15 points)**
   - Length > 500 chars: +8 points
   - Length > 300 chars: +5 points
   - Length < 100 chars: -5 points (penalty)
   - Has structured sections (requirements, qualifications, responsibilities, benefits): +4 points
   - Has salary information: +3 points
   - Contains spam keywords: -10 points (penalty)

2. **Source Quality (0-10 points)**
   - High-quality sources: +10 points
     - LinkedIn, company website, Glassdoor, Indeed, Lever, Greenhouse, Workday, careers page
   - Generic recruiters/staffing: -5 points (penalty)
   - Neutral sources: +3 points

3. **Company Quality (0-15 points)**
   - Top tech companies: +15 points
   - Top finance companies: +15 points
   - Top consulting companies: +15 points
   - Fortune 500 companies: +12 points
   - Low-quality company patterns: -10 points (penalty)
   - Neutral companies: +5 points

4. **Recency (0-10 points)**
   - Posted < 1 hour / today: +10 points
   - Posted 1-3 days ago: +10 points
   - Posted 4-7 days ago: +8 points
   - Posted 8-14 days ago: +5 points
   - Posted > 14 days ago: +2 points
   - Posted > 1 month ago: -3 points (penalty)

**Quality Filter Threshold:**
- **Default minimum**: 10 points (`min_quality_score=10`)
- Applied in `filter_jobs_by_quality()`
- Jobs below threshold are filtered out

### 3. Combined Scoring

**Function**: `score_jobs_by_resume_match()`
- Location: `backend/app/routes/job_board.py:1690-1750`

**Final Score Calculation:**
- **Match Score**: 0-100 (how well job matches user profile)
- **Quality Score**: 0-50 (job posting quality)
- **Combined Score**: `(match_score × 0.7) + (quality_score × 0.6)`
- Jobs sorted by combined score (descending)

---

## Quantity Limits

### Current Limits

1. **API-Level Limits:**
   - **SerpAPI**: 10 jobs per request (Google Jobs limitation)
   - **Pagination**: Up to 3 pages per query
   - **Max queries**: 4 queries per user request
   - **Theoretical max**: 4 queries × 3 pages × 10 jobs = 120 jobs

2. **Application-Level Limits:**
   - **Initial fetch**: 150 jobs (`max_jobs=150` in `fetch_personalized_jobs()`)
   - **Pagination**: 20 jobs per page (`per_page=20`)
   - **Total pages**: ~7-8 pages (150 jobs ÷ 20 per page)

3. **Cache Limits:**
   - Only first page cached per query
   - Cache expires after 6 hours
   - No cache for paginated results

4. **Rate Limiting:**
   - Determined by SerpAPI subscription tier
   - No explicit rate limiting in code (relies on SerpAPI)

### Bottlenecks

1. **Google Jobs API Limitation**: Only 10 results per request
2. **Pagination Complexity**: Requires multiple API calls
3. **Cache Scope**: Only first page cached
4. **Query Diversity**: Limited to 4 queries per request

---

## Improvement Opportunities

### 1. Increase Quantity

#### A. Expand Query Diversity
**Current**: 4 queries per request
**Opportunity**: Increase to 6-8 queries
- Add more skill combinations
- Add more industry variations
- Add location-specific queries
- Add experience-level queries (entry, mid, senior)

**Implementation:**
- Modify `fetch_personalized_jobs()` to use more queries
- Increase `max_queries` from 4 to 6-8
- Add query generation for:
  - Skill combinations (2-skill pairs)
  - Industry + skill combinations
  - Company size filters (startup, mid-size, enterprise)
  - Remote vs. on-site queries

**Impact**: 
- **Quantity**: +50-100% more jobs (from ~120 to ~180-240 jobs)
- **Cost**: +50-100% more API calls
- **Time**: +50-100% longer fetch time

#### B. Increase Pagination Depth
**Current**: 3 pages per query (30 jobs)
**Opportunity**: Increase to 5-10 pages per query

**Implementation:**
- Modify pagination loop in `fetch_personalized_jobs()`
- Change `for page_num in range(3)` to `range(5)` or `range(10)`
- Add timeout/early exit if no new jobs found

**Impact**:
- **Quantity**: +67-233% more jobs per query (from 30 to 50-100 jobs)
- **Cost**: +67-233% more API calls
- **Time**: +67-233% longer fetch time

#### C. Parallel Query Execution
**Current**: Sequential query execution
**Opportunity**: Execute queries in parallel using `asyncio` or `concurrent.futures`

**Implementation:**
- Convert `fetch_jobs_from_serpapi()` to async or use ThreadPoolExecutor
- Execute multiple queries simultaneously
- Aggregate results after all queries complete

**Impact**:
- **Time**: 50-75% reduction in fetch time (4 queries in parallel vs. sequential)
- **Quantity**: Same as current (no change in total jobs)
- **Complexity**: Higher (requires async/threading)

#### D. Add Additional Data Sources
**Current**: Only SerpAPI Google Jobs
**Opportunity**: Integrate multiple job sources

**Potential Sources:**
1. **LinkedIn Jobs API** (if available)
2. **Indeed API** (if available)
3. **Glassdoor API** (if available)
4. **Direct company career pages** (web scraping)
5. **Job aggregators** (Adzuna, ZipRecruiter APIs)

**Implementation:**
- Create abstraction layer for job sources
- Implement source-specific fetchers
- Deduplicate jobs across sources
- Merge and rank results

**Impact**:
- **Quantity**: +200-500% more jobs (multiple sources)
- **Quality**: Potentially higher (more diverse sources)
- **Cost**: Higher (multiple API subscriptions)
- **Complexity**: Much higher (multiple integrations)

#### E. Implement Job Aggregation Service
**Current**: Direct SerpAPI calls per request
**Opportunity**: Background job aggregation service

**Implementation:**
- Background worker that fetches jobs periodically
- Store in Firestore/PostgreSQL
- Serve from database instead of real-time API calls
- Update jobs every 1-6 hours

**Impact**:
- **Quantity**: Can fetch more jobs (no per-request limits)
- **Speed**: Much faster (served from database)
- **Cost**: Lower (fewer API calls)
- **Freshness**: Slightly stale (depends on update frequency)

### 2. Improve Quality

#### A. Enhanced Quality Scoring
**Current**: Basic quality score (0-50)
**Opportunity**: More sophisticated quality signals

**Additional Signals:**
1. **Company Verification**
   - Check if company has verified LinkedIn page
   - Check if company has website
   - Check company size (employees)
   - Check company funding (for startups)

2. **Job Description Analysis**
   - NLP analysis for completeness
   - Check for required vs. preferred skills
   - Check for salary transparency
   - Check for benefits information

3. **Source Reputation**
   - Track source reliability over time
   - Penalize sources with high spam rates
   - Boost sources with high conversion rates

4. **User Feedback Loop**
   - Track which jobs users click/apply to
   - Boost jobs with high engagement
   - Penalize jobs with low engagement

**Implementation:**
- Add company enrichment API calls (Clearbit, Crunchbase)
- Add NLP analysis for job descriptions
- Implement user engagement tracking
- Update quality scoring algorithm

**Impact**:
- **Quality**: +20-30% improvement in job relevance
- **User Experience**: Better job matches
- **Cost**: Higher (additional API calls)
- **Complexity**: Higher (more data sources)

#### B. Stricter Spam Detection
**Current**: Basic keyword-based spam detection
**Opportunity**: ML-based spam detection

**Implementation:**
- Train ML model on spam vs. legitimate jobs
- Use features: description length, company name patterns, source patterns, posting frequency
- Integrate model into quality filter

**Impact**:
- **Quality**: +10-20% reduction in spam jobs
- **User Experience**: Fewer low-quality jobs
- **Complexity**: Higher (ML model training/maintenance)

#### C. Company Verification
**Current**: Basic company name matching
**Opportunity**: Verify companies against databases

**Implementation:**
- Integrate with company databases (Clearbit, Crunchbase, LinkedIn)
- Verify company existence and legitimacy
- Filter out fake/placeholder companies

**Impact**:
- **Quality**: +15-25% improvement (fewer fake companies)
- **User Experience**: More trustworthy job listings
- **Cost**: Higher (company verification APIs)

#### D. Recency Prioritization
**Current**: Recency is part of quality score
**Opportunity**: More aggressive recency filtering

**Implementation:**
- Filter out jobs older than 30 days (configurable)
- Boost jobs posted in last 7 days
- Add "Fresh Jobs" badge for jobs < 3 days old

**Impact**:
- **Quality**: +10-15% improvement (fresher jobs)
- **User Experience**: More relevant opportunities
- **Quantity**: -10-20% reduction (older jobs filtered)

### 3. Improve Matching

#### A. Enhanced Semantic Matching
**Current**: Basic skill synonym matching
**Opportunity**: Advanced semantic matching with embeddings

**Implementation:**
- Use sentence transformers (e.g., `all-MiniLM-L6-v2`) to generate embeddings
- Compare job descriptions with user profiles using cosine similarity
- Boost jobs with high semantic similarity

**Impact**:
- **Quality**: +15-25% improvement in match accuracy
- **User Experience**: Better job recommendations
- **Complexity**: Higher (embedding model integration)

#### B. Industry-Specific Matching
**Current**: Generic field affinity calculation
**Opportunity**: Industry-specific matching rules

**Implementation:**
- Create industry-specific matching rules
- Different scoring for tech vs. finance vs. consulting
- Industry-specific skill weights

**Impact**:
- **Quality**: +10-20% improvement in industry relevance
- **User Experience**: More relevant jobs per industry

#### C. Experience Level Matching
**Current**: Basic experience level detection
**Opportunity**: Sophisticated experience level matching

**Implementation:**
- Parse job requirements for experience level
- Match user's experience (internships, projects, coursework) to job requirements
- Score based on experience fit

**Impact**:
- **Quality**: +10-15% improvement in experience relevance
- **User Experience**: Better job-level matches

### 4. Performance Improvements

#### A. Better Caching Strategy
**Current**: 6-hour cache, first page only
**Opportunity**: Multi-tier caching

**Implementation:**
1. **Short-term cache** (1 hour): Full query results
2. **Medium-term cache** (6 hours): First page only (current)
3. **Long-term cache** (24 hours): Company/job metadata

**Impact**:
- **Speed**: +30-50% faster for cached queries
- **Cost**: -20-30% reduction in API calls
- **Freshness**: Slightly improved (shorter cache for full results)

#### B. Incremental Loading
**Current**: Fetch all jobs upfront
**Opportunity**: Load jobs incrementally as user scrolls

**Implementation:**
- Fetch first page immediately
- Fetch subsequent pages on-demand
- Use pagination tokens for efficient loading

**Impact**:
- **Speed**: +50-70% faster initial load
- **User Experience**: Faster time to first job
- **Cost**: Same (same total API calls)

#### C. Background Pre-fetching
**Current**: Fetch jobs on-demand
**Opportunity**: Pre-fetch jobs for popular queries

**Implementation:**
- Identify popular queries (by major, location, job type)
- Background worker pre-fetches and caches results
- Serve from cache when user requests

**Impact**:
- **Speed**: +60-80% faster for popular queries
- **Cost**: Slightly higher (pre-fetching)
- **Freshness**: Slightly stale (depends on pre-fetch frequency)

---

## Implementation Recommendations

### Phase 1: Quick Wins (1-2 weeks)
1. **Increase pagination depth** from 3 to 5 pages per query
   - **Impact**: +67% more jobs
   - **Effort**: Low (change one number)
   - **Cost**: +67% more API calls

2. **Expand query diversity** from 4 to 6 queries
   - **Impact**: +50% more jobs
   - **Effort**: Low (modify query generation)
   - **Cost**: +50% more API calls

3. **Improve caching** - cache full results for 1 hour
   - **Impact**: +30% faster responses
   - **Effort**: Low (modify cache duration)
   - **Cost**: Same

### Phase 2: Medium-Term (2-4 weeks)
1. **Parallel query execution**
   - **Impact**: 50-75% faster fetch time
   - **Effort**: Medium (async/threading)
   - **Cost**: Same

2. **Enhanced quality scoring**
   - **Impact**: +20% better job quality
   - **Effort**: Medium (add new scoring factors)
   - **Cost**: Slightly higher (company verification APIs)

3. **Stricter spam detection**
   - **Impact**: +15% reduction in spam
   - **Effort**: Medium (improve spam detection)
   - **Cost**: Same

### Phase 3: Long-Term (1-2 months)
1. **Job aggregation service** (background worker)
   - **Impact**: Much faster, more jobs
   - **Effort**: High (background service, database)
   - **Cost**: Lower (fewer API calls)

2. **Multiple data sources** (LinkedIn, Indeed, etc.)
   - **Impact**: +200-500% more jobs
   - **Effort**: High (multiple integrations)
   - **Cost**: Higher (multiple API subscriptions)

3. **ML-based matching** (semantic embeddings)
   - **Impact**: +20% better matches
   - **Effort**: High (ML model integration)
   - **Cost**: Higher (embedding API or compute)

### Priority Recommendations

**High Priority (Do First):**
1. Increase pagination depth (3 → 5 pages)
2. Expand query diversity (4 → 6 queries)
3. Improve caching strategy (1-hour full cache)

**Medium Priority (Do Next):**
1. Parallel query execution
2. Enhanced quality scoring
3. Stricter spam detection

**Low Priority (Future):**
1. Job aggregation service
2. Multiple data sources
3. ML-based matching

---

## Cost Considerations

### Current Costs
- **SerpAPI**: Based on subscription tier
- **Firestore**: Minimal (caching)
- **Compute**: Minimal (synchronous processing)

### Cost Impact of Improvements

**Quantity Increases:**
- +50% queries: +50% API calls
- +67% pagination: +67% API calls
- Combined: ~2.5x API calls

**Quality Improvements:**
- Company verification: +$0.01-0.05 per job (Clearbit/Crunchbase)
- ML matching: +$0.001-0.01 per job (embedding API)

**Performance Improvements:**
- Better caching: -20-30% API calls
- Background aggregation: -50-70% API calls

### Cost Optimization Strategies
1. **Aggressive caching** to reduce API calls
2. **Background aggregation** to batch API calls
3. **Selective quality checks** (only for top jobs)
4. **Rate limiting** to stay within API quotas

---

## Metrics to Track

### Quantity Metrics
- Total jobs fetched per request
- Jobs per query
- Cache hit rate
- API call count

### Quality Metrics
- Average quality score
- Spam job rate
- User engagement (clicks, applies)
- Job freshness (average days posted)

### Performance Metrics
- Average fetch time
- Cache hit rate
- API response time
- Time to first job

### User Experience Metrics
- Match score distribution
- Job relevance (user feedback)
- Application rate
- User satisfaction

---

## Conclusion

The current job board implementation uses SerpAPI Google Jobs with a multi-query strategy, quality filtering, and caching. To improve quantity and quality:

**For Quantity:**
- Increase pagination depth and query diversity (quick wins)
- Implement parallel execution (medium-term)
- Add multiple data sources (long-term)

**For Quality:**
- Enhance quality scoring with company verification
- Improve spam detection
- Implement user feedback loops

**For Performance:**
- Better caching strategy
- Background job aggregation
- Incremental loading

The recommended approach is to start with Phase 1 quick wins, then move to Phase 2 medium-term improvements, and finally implement Phase 3 long-term solutions based on user feedback and metrics.

