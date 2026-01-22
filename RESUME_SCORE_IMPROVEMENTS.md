# Resume Score Feature Improvements

## Summary

Implemented three major improvements to the Score Resume feature:
1. **Caching** - Saves credits by returning cached scores within 24 hours
2. **Better Error Handling** - Specific error codes with user-friendly messages
3. **Full Score Breakdown** - Expandable UI showing categories and suggestions

---

## 1. Caching Implementation ✅

### Backend Changes (`backend/app/routes/resume_workshop.py`)

**Added:**
- MD5 hash generation for resume text
- Firestore cache check in `users/{uid}/resume_scores` collection
- 24-hour TTL validation
- Cache storage after successful scoring

**Flow:**
1. Generate MD5 hash of resume text
2. Query `users/{uid}/resume_scores` for matching hash
3. Check if `created_at` is within 24 hours
4. If found → Return cached result (no credit charge, `cached: true`)
5. If not found → Score resume, deduct credits, store in cache

**Cache Structure:**
```python
{
  "score": 75,
  "score_label": "Good",
  "categories": [...],
  "summary": "...",
  "resume_hash": "md5_hash_string",
  "created_at": firestore.SERVER_TIMESTAMP
}
```

**Benefits:**
- Users can rescore without paying credits if resume unchanged
- Faster response for cached results
- Reduces API costs

---

## 2. Better Error States ✅

### Backend Error Codes

Added specific error codes to all error responses:

- `INSUFFICIENT_CREDITS` - User has < 5 credits
- `RESUME_TOO_SHORT` - Resume < 100 characters
- `RESUME_NOT_FOUND` - No resume in Firestore
- `AI_TIMEOUT` - OpenAI call exceeded timeout
- `AI_ERROR` - OpenAI returned error
- `DATABASE_ERROR` - Database unavailable
- `USER_NOT_FOUND` - User document not found
- `NOT_AUTHENTICATED` - Missing authentication

### Frontend Error Handling (`resumeWorkshop.ts` & `ResumeWorkshopPage.tsx`)

**Updated `ScoreResponse` interface:**
```typescript
export interface ScoreResponse {
  // ... existing fields
  cached?: boolean;  // NEW
  error_code?: string;  // Enhanced
}
```

**Error handling in `handleScore()`:**
```typescript
switch (result.error_code) {
  case 'INSUFFICIENT_CREDITS':
    // Prompt to upgrade or buy credits
  case 'RESUME_TOO_SHORT':
    toast.error("Your resume needs more content before scoring");
  case 'RESUME_NOT_FOUND':
    toast.error("Please upload your resume first");
  case 'AI_TIMEOUT':
    toast.error("Scoring timed out. Your credits were refunded.");
  case 'AI_ERROR':
    toast.error("Something went wrong. Credits refunded. Please try again.");
}
```

**Benefits:**
- Clear, actionable error messages
- Users know exactly what went wrong
- Better UX for troubleshooting

---

## 3. Full Score Breakdown UI ✅

### Frontend Changes (`ResumeWorkshopPage.tsx`)

**New State:**
```typescript
const [scoreData, setScoreData] = useState<{
  score: number;
  score_label: string;
  categories: any[];
  summary: string;
  cached?: boolean;
} | null>(null);
const [showScoreDetails, setShowScoreDetails] = useState(false);
```

**UI Features:**
1. **Cached Indicator** - Shows "Cached" badge when result is from cache
2. **Expandable Details** - "View Score Details" button with chevron
3. **Overall Summary Card** - Shows score, label, and summary
4. **Category Cards** - Each category shows:
   - Category name
   - Individual score (color-coded)
   - Explanation
   - Actionable suggestions (bullet list)

**Color Coding:**
- Green (80+): Excellent
- Amber (60-79): Good
- Red (<60): Needs Work

**Layout:**
- Consistent with existing Resume Workshop UI
- Uses same card styles and spacing
- Smooth expand/collapse animation

---

## Files Modified

### Backend
- `backend/app/routes/resume_workshop.py`
  - Added `hashlib` import
  - Added `timezone` import
  - Updated `/score` endpoint with caching
  - Added specific error codes
  - Added cache storage logic

### Frontend
- `connect-grow-hire/src/services/resumeWorkshop.ts`
  - Updated `ScoreResponse` interface (added `cached` field)

- `connect-grow-hire/src/pages/ResumeWorkshopPage.tsx`
  - Added `scoreData` and `showScoreDetails` state
  - Enhanced `handleScore()` with error code handling
  - Added expandable score details UI
  - Added cached indicator badge

---

## Firestore Structure

**New Collection:** `users/{uid}/resume_scores`

**Document Structure:**
```json
{
  "score": 75,
  "score_label": "Good",
  "categories": [
    {
      "name": "Impact & Results",
      "score": 70,
      "explanation": "...",
      "suggestions": ["...", "..."]
    },
    // ... more categories
  ],
  "summary": "Overall summary...",
  "resume_hash": "abc123...",
  "created_at": "2024-01-01T12:00:00Z"
}
```

**Indexing:** No special indexes needed (queries are simple)

---

## Testing Checklist

- [ ] Score resume → Check cache is created
- [ ] Rescore same resume → Should return cached (no credit charge)
- [ ] Rescore after 24h → Should charge credits and create new cache
- [ ] Test all error codes → Verify correct messages
- [ ] Test score details UI → Expand/collapse works
- [ ] Test cached indicator → Shows when cached
- [ ] Test with insufficient credits → Shows upgrade prompt
- [ ] Test with no resume → Shows upload prompt

---

## Benefits Summary

1. **Cost Savings** - Users don't pay for rescoring unchanged resumes
2. **Better UX** - Clear error messages and detailed score breakdown
3. **Transparency** - Users see exactly why they got their score
4. **Actionable** - Category-specific suggestions help users improve

---

## Future Enhancements (Optional)

1. **Cache Management** - Add UI to clear cache or view cache status
2. **Score History** - Show score trends over time
3. **Export Score Report** - Download PDF of score breakdown
4. **Compare Scores** - Compare current vs previous scores

