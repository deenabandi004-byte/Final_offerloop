# Firm Search: SERP API + ChatGPT Replacement Plan

## Overview
Replace PDL Company Search API (which requires credits) with a SERP API + ChatGPT combination for firm search functionality.

## Current Architecture
- **Input**: Natural language query (e.g., "mid-sized investment banks in NYC focused on healthcare")
- **Step 1**: ChatGPT parses query → structured filters (industry, location, size, keywords)
- **Step 2**: PDL Company Search API → returns company data
- **Step 3**: Transform PDL data → Firm format
- **Output**: List of firms matching criteria

## New Architecture

### Flow
```
User Query (Natural Language)
    ↓
ChatGPT: Parse Query → Structured Filters
    ↓
Build Google Search Query from Filters
    ↓
SERP API: Search for Companies
    ↓
ChatGPT: Extract Company Data from SERP Results
    ↓
Transform to Firm Format
    ↓
Return Firms List
```

## Detailed Implementation Plan

### 1. Query Parsing (Already Exists)
- ✅ `parse_firm_search_prompt()` - Uses ChatGPT to extract:
  - Industry
  - Location
  - Size preference
  - Keywords

### 2. Google Search Query Builder (NEW)
**Function**: `build_google_search_query(parsed_filters)`

Builds search queries like:
- "investment banks New York City 51-500 employees healthcare"
- "venture capital firms San Francisco Bay Area"
- "consulting companies Boston mid-sized"

**Strategy**:
- Combine industry + location + size + keywords
- Use natural language that Google understands
- Add qualifiers like "companies", "firms", "list of"

### 3. SERP API Integration (NEW)
**Function**: `search_companies_with_serp(query, limit)`

**SERP API Endpoints to Use**:
- **Google Search** (`/search`): Get organic results
- **Google Maps** (`/maps`): Get local business results (if location-specific)
- **Google Shopping** (optional): Not needed for B2B

**Parameters**:
```python
{
    "q": "investment banks New York City",
    "num": 20,  # Number of results
    "engine": "google",  # or "google_maps" for local
    "location": "New York, New York, United States",
    "hl": "en",
    "gl": "us"
}
```

**Response Structure**:
- `organic_results`: List of search results with titles, links, snippets
- `local_results`: Business listings (if using Maps)
- `knowledge_graph`: Company info cards (if available)

### 4. ChatGPT Data Extraction (NEW)
**Function**: `extract_company_data_from_serp(serp_results, filters)`

**Approach**:
1. Collect all relevant URLs from SERP results
2. For each URL, get page content (or use snippets)
3. Use ChatGPT to extract structured company data:
   - Company name
   - Website
   - LinkedIn URL
   - Location (city, state, country)
   - Industry
   - Employee count / size
   - Founded year

**ChatGPT Prompt Structure**:
```
You are extracting company information from search results.

Search Query: {query}
Search Results: {serp_results}

Extract structured company data for each company found:
- name: Company name
- website: Official website URL
- linkedinUrl: LinkedIn company page URL (if found)
- location: {city, state, country}
- industry: Primary industry
- employeeCount: Estimated employee count (number or null)
- sizeBucket: "small" (1-50), "mid" (51-500), "large" (500+), or null
- founded: Year founded (number or null)

Return JSON array of companies.
```

**Alternative Approach** (More Efficient):
- Use ChatGPT to analyze SERP snippets directly
- Don't fetch full pages (faster, cheaper)
- Use snippets + knowledge graph data

### 5. Data Transformation (MODIFY)
**Function**: `transform_serp_company_to_firm(company_data)`

Transform ChatGPT-extracted data to match existing Firm format:
```python
{
    "id": str,  # Hash of website or name
    "name": str,
    "website": str or None,
    "linkedinUrl": str or None,
    "location": {
        "city": str or None,
        "state": str or None,
        "country": str or None,
        "display": str  # Formatted string
    },
    "industry": str or None,
    "employeeCount": int or None,
    "sizeBucket": "small" | "mid" | "large" | None,
    "sizeRange": str or None,
    "founded": int or None
}
```

### 6. Fallback Strategy
If SERP API doesn't return enough results:
1. **Broaden search query** (remove size filter, remove keywords)
2. **Try Google Maps API** (for location-specific searches)
3. **Use multiple search variations** (different keyword combinations)

## Implementation Files

### New Files
1. `backend/app/services/serp_client.py`
   - SERP API client
   - Search query builder
   - Result parsing

2. `backend/app/services/company_extraction.py`
   - ChatGPT prompt for data extraction
   - Company data extraction logic
   - Data validation

### Modified Files
1. `backend/app/services/company_search.py`
   - Replace `search_companies_with_pdl()` with `search_companies_with_serp()`
   - Keep `parse_firm_search_prompt()` (already uses ChatGPT)
   - Update `search_firms()` to use new flow
   - Keep `transform_*` functions but adapt for SERP data

2. `backend/app/config.py`
   - Already has `SERPAPI_KEY` ✅
   - Add SERP API base URL if needed

## API Costs & Limits

### SERP API
- **Pricing**: ~$50/month for 5,000 searches (varies by provider)
- **Rate Limits**: Typically 100-1000 requests/month on free tier
- **No per-result credits** (unlike PDL)

### ChatGPT API
- **Current**: Already used for query parsing
- **New Usage**: Data extraction from SERP results
- **Cost**: ~$0.01-0.03 per search (depending on result count)
- **Model**: `gpt-4o-mini` (cheap, fast) or `gpt-4o` (more accurate)

### Total Cost Per Search
- SERP API: ~$0.01 per search
- ChatGPT (parsing): ~$0.001 per search
- ChatGPT (extraction): ~$0.01-0.03 per search
- **Total**: ~$0.02-0.04 per search (vs PDL credits)

## Error Handling

### SERP API Errors
- **429 (Rate Limit)**: Retry with backoff
- **400 (Invalid Query)**: Simplify query and retry
- **500 (Server Error)**: Retry with exponential backoff

### ChatGPT Errors
- **Rate Limits**: Retry with backoff
- **Invalid JSON**: Retry with stricter prompt
- **Timeout**: Retry with smaller batch

### Fallback Strategy
If SERP + ChatGPT fails:
1. Try simpler search query
2. Use cached results if available
3. Return partial results if some companies extracted
4. Show user-friendly error message

## Data Quality Considerations

### Advantages of SERP + ChatGPT
- ✅ Real-time data from Google
- ✅ No credit system needed
- ✅ Can find newer/smaller companies
- ✅ More flexible search queries

### Challenges
- ⚠️ Less structured than PDL data
- ⚠️ May need multiple API calls per search
- ⚠️ ChatGPT extraction may be inconsistent
- ⚠️ Need to handle missing fields gracefully

### Mitigation
- Use structured prompts for ChatGPT
- Validate extracted data
- Cache successful extractions
- Provide fallback values for missing data

## Testing Strategy

### Unit Tests
1. `build_google_search_query()` - Test query generation
2. `extract_company_data_from_serp()` - Test ChatGPT extraction
3. `transform_serp_company_to_firm()` - Test data transformation

### Integration Tests
1. End-to-end search flow
2. Error handling scenarios
3. Rate limiting behavior
4. Fallback mechanisms

### Manual Testing
1. Test various query types
2. Verify data quality
3. Check response times
4. Monitor API costs

## Migration Plan

### Phase 1: Add SERP Integration (Parallel)
- Implement SERP client
- Add ChatGPT extraction
- Keep PDL as fallback
- Feature flag to switch between PDL and SERP

### Phase 2: Testing
- Test SERP results quality
- Compare with PDL results
- Optimize prompts
- Tune extraction logic

### Phase 3: Switch Over
- Make SERP default
- Keep PDL as backup
- Monitor for issues

### Phase 4: Remove PDL
- Remove PDL code
- Clean up dependencies
- Update documentation

## Code Structure Preview

```python
# backend/app/services/serp_client.py
def search_companies_with_serp(query: str, location: dict, limit: int = 20):
    """Search for companies using SERP API"""
    # Build search query
    # Call SERP API
    # Return raw results

# backend/app/services/company_extraction.py
def extract_company_data_from_serp(serp_results: dict, filters: dict):
    """Use ChatGPT to extract structured company data from SERP results"""
    # Prepare prompt
    # Call ChatGPT
    # Parse and validate results
    # Return structured data

# backend/app/services/company_search.py (modified)
def search_firms(prompt: str, limit: int = 20):
    """Main entry point - now uses SERP + ChatGPT"""
    # Parse query (existing)
    # Build Google search query (new)
    # Call SERP API (new)
    # Extract with ChatGPT (new)
    # Transform to Firm format (modified)
    # Return results
```

## Next Steps

1. ✅ Review and approve plan
2. Implement SERP client
3. Implement ChatGPT extraction
4. Update company_search.py
5. Test with sample queries
6. Deploy to staging
7. Monitor and optimize
8. Switch to production
