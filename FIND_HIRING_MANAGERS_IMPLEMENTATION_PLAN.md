# Find Hiring Managers - Implementation Plan

## Overview
Implement the "Find Hiring Managers" feature that allows users to find and contact hiring managers at companies for specific job postings. This feature will be similar to the existing recruiter finder but will search for managers, directors, and team leads instead of recruiters.

## Current State
- ✅ Frontend UI exists in `RecruiterSpreadsheetPage.tsx` but is not connected
- ❌ Backend `find_hiring_manager()` function is a stub (not implemented)
- ✅ Job URL parsing infrastructure exists
- ✅ Email generation and Gmail draft creation exists
- ✅ Hiring Manager Tracker (RecruiterSpreadsheet) exists and can store contacts

## Architecture

### Data Flow
```
User Input (Job URL or Manual Details)
    ↓
Frontend: Parse job URL (if provided)
    ↓
Frontend: Call /find-hiring-manager API
    ↓
Backend: Extract job details (company, title, description, location)
    ↓
Backend: Determine job type (engineering, sales, etc.)
    ↓
Backend: Search PDL for hiring managers with relevant titles
    ↓
Backend: Rank and filter results
    ↓
Backend: Generate personalized emails
    ↓
Backend: Create Gmail drafts (if requested)
    ↓
Backend: Return results
    ↓
Frontend: Save hiring managers to Tracker
    ↓
Frontend: Display results in Hiring Manager Tracker tab
```

## Priority Ranking System

The hiring manager search uses a **priority-based tiered system** with 18 priority levels organized into 5 tiers:

### Tier 1: Direct Hiring Pipeline (Priority 1-4) - **Highest Priority**
**Most likely to respond and take action**
1. Hiring Manager
2. Recruiter
3. Talent Acquisition Specialist
4. Recruiting Coordinator

### Tier 2: Team Decision Makers (Priority 5-8) - **High Priority**
**Have influence on hiring decisions for their teams**
5. Team Lead
6. Engineering Manager (or relevant department manager)
7. Department Head
8. HR Manager

### Tier 3: Organizational Influence (Priority 9-12) - **Medium Priority**
**Can push your application forward but may be harder to reach**
9. HR Business Partner
10. Staffing Manager
11. Director
12. VP

### Tier 4: Referral Sources (Priority 13-15) - **Lower Priority**
**Can provide referrals or insider info**
13. People Operations
14. Employee in Similar Role
15. Executive Assistant

### Tier 5: Executives (Priority 16-18) - **Only for Small Companies**
**Only effective at small startups (<50 employees); at larger companies these would rank much lower**
16. Founder
17. CEO
18. COO

### Search Strategy
1. **Start with Tier 1**: Search for Priority 1-4 titles first
2. **Progressive Fallback**: If insufficient results, search Tier 2, then Tier 3, etc.
3. **Company Size Consideration**: Only include Tier 5 (executives) if company appears small (<50 employees)
4. **Ranking**: Within each tier, prioritize by:
   - Currently at target company
   - Location match
   - Title relevance to job type
   - Seniority indicators

## Implementation Steps

### Phase 1: Backend Core Logic

#### 1.1 Define Priority-Based Hiring Manager Title Mappings
**File:** `backend/app/services/recruiter_finder.py`

Create `HIRING_MANAGER_PRIORITY_TIERS` with tiered search strategy:

**Tier 1 (Priority 1-4): Direct Hiring Pipeline - Highest Priority**
- Hiring Manager
- Recruiter
- Talent Acquisition Specialist
- Recruiting Coordinator

**Tier 2 (Priority 5-8): Team Decision Makers - High Priority**
- Team Lead
- Engineering Manager (or relevant department manager)
- Department Head
- HR Manager

**Tier 3 (Priority 9-12): Organizational Influence - Medium Priority**
- HR Business Partner
- Staffing Manager
- Director
- VP

**Tier 4 (Priority 13-15): Referral Sources - Lower Priority**
- People Operations
- Employee in Similar Role
- Executive Assistant

**Tier 5 (Priority 16-18): Executives - Only for Small Companies (<50 employees)**
- Founder
- CEO
- COO

**Search Strategy:**
1. Search Tier 1 first (most likely to respond)
2. If insufficient results, search Tier 2
3. Continue down tiers until we have enough results
4. For Tier 5 (executives), only include if company size is small (need company size detection or heuristic)

#### 1.2 Implement `find_hiring_manager()` Function
**File:** `backend/app/services/recruiter_finder.py`

Function signature:
```python
def find_hiring_manager(
    company_name: str,
    job_type: Optional[str] = None,
    job_title: str = "",
    job_description: str = "",
    location: Optional[str] = None,
    max_results: int = 3,
    generate_emails: bool = False,
    user_resume: Dict = None,
    user_contact: Dict = None
) -> Dict:
```

Key features:
- Use `determine_job_type()` to detect job type
- **Tiered Search Strategy:**
  1. Search Tier 1 titles first (Priority 1-4)
  2. If results < max_results, search Tier 2 (Priority 5-8)
  3. Continue down tiers until we have enough results
  4. For Tier 5 (executives), only search if company appears small
- Build PDL search query for each tier (similar to `build_recruiter_search_query`)
- Execute PDL search using `execute_pdl_search()` for each tier
- Combine results and rank using priority-based scoring
- Optionally generate emails using `generate_recruiter_emails()` (can reuse or create hiring manager specific version)
- Return structured response with hiring managers, emails, credits charged, search_tier used

#### 1.3 Create Priority-Based Ranking Function for Hiring Managers
**File:** `backend/app/services/recruiter_finder.py`

Create `rank_hiring_managers()` function with priority-based scoring:

**Base Priority Scores (by tier):**
- Tier 1 (Priority 1-4): +100 points base
- Tier 2 (Priority 5-8): +70 points base
- Tier 3 (Priority 9-12): +40 points base
- Tier 4 (Priority 13-15): +20 points base
- Tier 5 (Priority 16-18): +10 points base (only if small company)

**Additional Scoring:**
- +50 points: Currently at target company
- +30 points: Exact title match for job type (Engineering Manager for engineering jobs)
- +20 points: Location match (same city)
- +10 points: State match
- +10 points: Seniority indicators (Senior, Lead, Head)
- -50 points: Tier 5 (executives) at large companies (penalty to deprioritize)

**Company Size Detection:**
- Use heuristic: If we find <5 people total at company, likely small company
- Or: Check if executives are in results → if yes and company seems large, deprioritize them

### Phase 2: Backend API Endpoint

#### 2.1 Create `/find-hiring-manager` Endpoint
**File:** `backend/app/routes/job_board.py`

Endpoint: `POST /api/job-board/find-hiring-manager`

Request body:
```json
{
  "company": "Google",
  "jobTitle": "Software Engineer",
  "jobDescription": "...",
  "jobType": "engineering",  // Optional
  "location": "San Francisco, CA",  // Optional
  "jobUrl": "https://...",  // Optional
  "maxResults": 3,  // Default: 3
  "generateEmails": true,  // Default: true
  "createDrafts": true  // Default: true
}
```

Response:
```json
{
  "hiringManagers": [...],
  "emails": [...],
  "jobTypeDetected": "engineering",
  "companyCleaned": "Google LLC",
  "totalFound": 5,
  "creditsCharged": 45,
  "creditsRemaining": 155,
  "draftsCreated": 3
}
```

Implementation details:
- Reuse job URL parsing logic from `find_recruiter_endpoint()`
- Reuse OpenAI extraction logic
- Validate company name
- Check user credits (15 credits per hiring manager)
- Call `find_hiring_manager()`
- Create Gmail drafts if requested (reuse logic from recruiter endpoint)
- Return results

### Phase 3: Frontend Integration

#### 3.1 Add API Method
**File:** `connect-grow-hire/src/services/api.ts`

Add `findHiringManagers()` method:
```typescript
async findHiringManagers(params: {
  company?: string;
  jobTitle?: string;
  jobDescription?: string;
  jobType?: string;
  location?: string;
  jobUrl?: string;
  maxResults?: number;
  generateEmails?: boolean;
  createDrafts?: boolean;
}): Promise<FindHiringManagerResponse>
```

#### 3.2 Implement `handleFindHiringManagers`
**File:** `connect-grow-hire/src/pages/RecruiterSpreadsheetPage.tsx`

Replace the TODO stub with:
1. Parse job URL if provided (using `apiService.parseJobUrl()`)
2. Extract job details from parsed URL or form fields
3. Call `apiService.findHiringManagers()` with:
   - Company, job title, description, location
   - Job URL (if provided)
   - User's resume URL
   - maxResults (from estimatedManagers state)
4. Handle loading states and errors
5. Save hiring managers to tracker using `firebaseApi.bulkCreateRecruiters()`
6. Show success message
7. Switch to "Hiring Manager Tracker" tab
8. Refresh tracker to show new entries

#### 3.3 Save to Tracker
**File:** `connect-grow-hire/src/pages/RecruiterSpreadsheetPage.tsx`

Reuse `saveRecruitersToSpreadsheet` pattern from `JobBoardPage.tsx`:
- Convert API response format to Firebase recruiter format
- Check for duplicates (by email or LinkedIn)
- Use `firebaseApi.bulkCreateRecruiters()` to save
- Associate with job if job URL was provided

### Phase 4: Email Generation

#### 4.1 Hiring Manager Email Templates
**File:** `backend/app/services/recruiter_email_generator.py`

Options:
1. **Reuse existing templates**: Use `generate_recruiter_emails()` as-is (templates are generic enough)
2. **Create hiring manager specific templates**: More direct, less "recruiter-focused" language

Recommendation: Start with option 1, can enhance later with option 2.

Key differences for hiring managers:
- More direct approach (they're the decision makers)
- Focus on technical fit and team contribution
- Less emphasis on "getting past the recruiter"

### Phase 5: Testing & Edge Cases

#### 5.1 Test Scenarios
1. **Job URL provided**: Parse and extract details
2. **Manual details only**: Use form fields
3. **No hiring managers found**: Show appropriate message, suggest recruiters
4. **Insufficient credits**: Show error with credit requirements
5. **Email generation fails**: Continue with contact info only
6. **Gmail draft creation fails**: Log error but return results
7. **Duplicate hiring managers**: Skip duplicates when saving

#### 5.2 Edge Cases
- **Small companies**: Use Tier 5 (executives) - detect via low employee count or heuristic
- **Large companies**: Exclude Tier 5 (executives) - they're too busy and won't respond
- **Remote jobs**: Location matching may be less relevant
- **Generic job types**: Use general hiring manager titles across all tiers
- **Missing company name**: Reject request with helpful error
- **Insufficient Tier 1 results**: Automatically fallback to Tier 2, then Tier 3, etc.
- **Company size detection**: Use heuristic (total people found at company) or external API if available

## File Changes Summary

### Backend Files
1. `backend/app/services/recruiter_finder.py`
   - Add `HIRING_MANAGER_PRIORITY_TIERS` constant (5 tiers, 18 priority levels)
   - Implement `find_hiring_manager()` function with tiered search
   - Implement `rank_hiring_managers()` function with priority-based scoring
   - Add helper `get_hiring_manager_titles_for_tier(tier: int, job_type: str)`
   - Add helper `detect_company_size()` or use heuristic
   - Add helper `should_include_executives()` based on company size

2. `backend/app/routes/job_board.py`
   - Add `@job_board_bp.route("/find-hiring-manager", methods=["POST"])` endpoint
   - Reuse job parsing and validation logic
   - Reuse Gmail draft creation logic

### Frontend Files
1. `connect-grow-hire/src/services/api.ts`
   - Add `findHiringManagers()` method
   - Add TypeScript types for request/response

2. `connect-grow-hire/src/pages/RecruiterSpreadsheetPage.tsx`
   - Implement `handleFindHiringManagers()` function
   - Add job URL parsing logic
   - Add save to tracker logic
   - Add error handling and loading states

## Credit Costs
- **15 credits per hiring manager** (same as recruiters)
- Charged when results are returned
- User must have at least 15 credits to use feature

## Success Criteria
1. ✅ User can paste job URL or enter manual details
2. ✅ System searches in priority order (Tier 1 → Tier 2 → Tier 3 → etc.)
3. ✅ Tier 5 (executives) only included for small companies
4. ✅ Results are ranked by priority tier + relevance (location, title match, current employment)
5. ✅ Higher priority contacts (Tier 1-2) appear first in results
6. ✅ Personalized emails are generated
7. ✅ Gmail drafts are created (if Gmail connected)
8. ✅ Hiring managers are saved to Hiring Manager Tracker
9. ✅ Results appear in tracker immediately
10. ✅ Credits are properly deducted
11. ✅ Error handling for all failure cases

## Future Enhancements (Out of Scope)
- Hiring manager specific email templates
- LinkedIn profile enrichment
- Company size detection (small companies → executives)
- Multi-location support
- Department-specific hiring manager search

