# Firm Search Overfetch Plan

## Problem Statement

Currently, the firm search generates exactly the number of firms requested by the user, then filters them by location. This results in fewer firms being returned than requested.

**Example from logs:**
- User requests: 10 firms
- System generates: 10 firm names
- System retrieves: 10 firm details
- After location filtering: 4 firms (6 filtered out)
- User receives: 4 firms (should be 10)

**Edge Case Concern:**
Even with overfetching (e.g., generate 25 firms), we might still not have enough after filtering:
- Generate 25 firms → Filter → Only 8 pass (need 10)
- This requires an iterative approach to keep fetching until we have enough

## Root Cause Analysis

The current flow in `serp_client.py` → `search_companies_with_serp()`:

1. **Step 1**: `generate_firm_names_with_chatgpt(limit=10)` - generates exactly 10 names
2. **Step 2**: `get_firm_details_batch(firm_names, max_results=10)` - retrieves details for 10 firms
3. **Step 3**: Location filtering removes firms that don't match (e.g., Cambridge, MA vs Boston, MA)
4. **Step 4**: Returns only 4 firms instead of 10

## Solution: Overfetch Strategy

We need to generate and retrieve MORE firms than requested, then filter, then return exactly the requested number.

### Key Changes Required

#### 1. Calculate Overfetch Multiplier
- **Location filtering rate**: Based on logs, ~60% of firms are being filtered out (6 out of 10)
- **Safety buffer**: We should generate 2.5x to 3x the requested amount to account for:
  - Location mismatches
  - Failed API calls
  - Duplicate firms
  - Invalid data

**Formula**: `firms_to_generate = requested_limit * OVERFETCH_MULTIPLIER`

**Recommended multiplier**: 2.5x (configurable)

#### 2. Modify `search_companies_with_serp()` in `serp_client.py`

**Current logic:**
```python
firm_names = generate_firm_names_with_chatgpt(..., limit=limit)
firms_data = get_firm_details_batch(firm_names, ..., max_results=limit)
# Filter by location
firms = [f for f in firms_data if firm_location_matches(...)]
firms = firms[:limit]  # Already limited, but too few remain
```

**New logic (with iterative fetching):**
```python
OVERFETCH_MULTIPLIER = 2.5  # Initial multiplier
MAX_ITERATIONS = 3  # Maximum retry attempts
MAX_TOTAL_FIRMS = limit * 5  # Absolute cap on total firms to generate

firms_collected = []
seen_domains = set()
firm_names_tried = set()

for iteration in range(MAX_ITERATIONS):
    needed = limit - len(firms_collected)
    if needed <= 0:
        break
    
    # Calculate batch size (more aggressive on retries)
    multiplier = OVERFETCH_MULTIPLIER if iteration == 0 else 3.0
    batch_size = max(needed + 5, int(needed * multiplier))  # At least needed + 5
    
    # Check absolute cap
    if len(firm_names_tried) + batch_size > MAX_TOTAL_FIRMS:
        batch_size = MAX_TOTAL_FIRMS - len(firm_names_tried)
        if batch_size <= 0:
            break
    
    # Generate firm names (avoid duplicates)
    firm_names = generate_firm_names_with_chatgpt(..., limit=batch_size)
    new_firm_names = [n for n in firm_names if n.lower() not in firm_names_tried]
    firm_names_tried.update(n.lower() for n in new_firm_names)
    
    if not new_firm_names:
        break
    
    # Fetch details
    firms_data = get_firm_details_batch(new_firm_names, ..., max_results=None)
    
    # Filter by location and deduplicate
    for company_data in firms_data:
        domain = extract_domain(company_data.get('website') or company_data.get('linkedinUrl'))
        if domain and domain in seen_domains:
            continue
        
        firm = transform_serp_company_to_firm(company_data)
        if firm and firm_location_matches(firm.get('location', {}), location):
            firms_collected.append(firm)
            if domain:
                seen_domains.add(domain)
    
    if len(firms_collected) >= limit:
        break

# Return exactly what was requested
firms = firms_collected[:limit]
```

#### 3. Modify `generate_firm_names_with_chatgpt()` in `company_extraction.py`

**Current behavior**: Strictly limits to `limit` parameter
**New behavior**: Should accept higher limits (already does, but ensure it works correctly)

**No changes needed** - function already supports higher limits.

#### 4. Modify `get_firm_details_batch()` in `firm_details_extraction.py`

**Current behavior**: 
- If `max_results` is provided, it limits the input firm names AND the output
- This prevents us from fetching enough firms

**New behavior**:
- Remove the `max_results` limit from the input firm names processing
- Only apply `max_results` to the final output if we have enough firms
- OR: Don't pass `max_results` at all, let the caller handle limiting

**Change needed**: In `serp_client.py`, don't pass `max_results=limit` to `get_firm_details_batch()`

#### 5. Iterative Fetching (REQUIRED - Handle Insufficient Results)

**Problem**: Even with 2.5x overfetch, we might still not have enough firms after filtering.
- Example: Generate 25 → Filter → Only 8 pass (need 10)

**Solution**: Iterative fetching loop that continues until we have enough firms.

**Algorithm**:
```python
firms_collected = []
firm_names_seen = set()  # Track what we've already tried
max_iterations = 3  # Prevent infinite loops
max_total_firms = limit * 5  # Absolute cap (e.g., 50 for limit=10)

for iteration in range(max_iterations):
    # Calculate how many more we need
    needed = limit - len(firms_collected)
    if needed <= 0:
        break  # We have enough!
    
    # Calculate batch size for this iteration
    # Start with 2.5x, but increase multiplier if previous iteration filtered heavily
    multiplier = 2.5 if iteration == 0 else 3.0  # More aggressive on retries
    batch_size = int(needed * multiplier)
    
    # Generate new firm names (avoid duplicates)
    new_firm_names = generate_firm_names_with_chatgpt(..., limit=batch_size)
    # Filter out names we've already tried
    new_firm_names = [n for n in new_firm_names if n.lower() not in firm_names_seen]
    firm_names_seen.update(n.lower() for n in new_firm_names)
    
    if not new_firm_names:
        break  # Can't generate more unique names
    
    # Fetch details
    new_firms_data = get_firm_details_batch(new_firm_names, ...)
    
    # Filter by location
    new_firms = [f for f in new_firms_data if firm_location_matches(...)]
    
    # Add to collection (avoid duplicates by domain)
    for firm in new_firms:
        domain = extract_domain(firm.get('website') or firm.get('linkedinUrl'))
        if domain and domain not in seen_domains:
            firms_collected.append(firm)
            seen_domains.add(domain)
    
    # Check if we have enough or hit absolute cap
    if len(firms_collected) >= limit:
        break
    if len(firm_names_seen) >= max_total_firms:
        break  # Hit absolute cap

# Return exactly what was requested (or as many as we found)
return firms_collected[:limit]
```

**Key safeguards**:
- Maximum iterations: 3 attempts (prevents infinite loops)
- Maximum total firms: `limit × 5` (prevents excessive API costs)
- Duplicate tracking: By firm name and domain
- Progressive multiplier: Start at 2.5x, increase to 3.0x on retries

## Implementation Steps

### Step 1: Add Configuration Constant
- Add `OVERFETCH_MULTIPLIER = 2.5` constant in `serp_client.py`
- Make it configurable via environment variable (optional)

### Step 2: Modify `search_companies_with_serp()` - Implement Iterative Fetching
- Implement iterative loop with max 3 iterations
- Track seen firm names and domains to avoid duplicates
- Calculate batch size per iteration (2.5x first, 3.0x on retries)
- Continue until we have `limit` firms OR hit max iterations/cap
- Remove `max_results=limit` from `get_firm_details_batch()` call
- After all iterations, apply `firms[:limit]` to return exactly requested amount

### Step 3: Update Logging
- Log the overfetch multiplier being used
- Log how many firms were generated vs requested
- Log how many passed filtering vs how many were needed

### Step 4: Handle Edge Cases
- **Iteration limits**: Maximum 3 iterations to prevent infinite loops
- **Absolute cap**: Maximum `limit × 5` total firms to generate (prevents excessive API costs)
- **Duplicate prevention**: Track firm names and domains across iterations
- **Progressive multiplier**: Start at 2.5x, increase to 3.0x on retries (more aggressive)
- **Minimum batch**: Always generate at least `needed + 5` firms per iteration
- **Partial results**: If we can't find enough firms after all iterations, return what we have (with appropriate message)
- **Empty results**: If no firms found after all attempts, return empty with helpful error message

### Step 5: Credit Calculation
- **Current**: Credits are charged based on actual firms returned (good!)
- **No change needed**: The credit system already handles this correctly in `firm_search.py`

## Expected Behavior After Fix

**Example flow (successful first iteration):**
- User requests: 10 firms
- Iteration 1: Generate 25 firm names (10 × 2.5) → Retrieve 25 → Filter → 12 pass
- System returns: 10 firms (exactly as requested)
- Credits charged: 50 credits (10 firms × 5 credits)

**Example flow (needs retry - your concern):**
- User requests: 10 firms
- Iteration 1: Generate 25 firm names → Retrieve 25 → Filter → 8 pass (need 2 more)
- Iteration 2: Generate 6 firm names (2 × 3.0) → Retrieve 6 → Filter → 3 pass
- Total collected: 11 firms
- System returns: 10 firms (exactly as requested)
- Credits charged: 50 credits (10 firms × 5 credits)

**Example flow (can't find enough):**
- User requests: 10 firms
- Iteration 1: Generate 25 → Filter → 5 pass
- Iteration 2: Generate 15 → Filter → 2 pass (total: 7)
- Iteration 3: Generate 9 → Filter → 1 pass (total: 8)
- System returns: 8 firms (best effort, with message explaining partial results)
- Credits charged: 40 credits (8 firms × 5 credits)

## Testing Considerations

1. **Test with strict location filters** (e.g., "Boston" - should handle Cambridge, MA filtering)
2. **Test with loose location filters** (e.g., "United States" - fewer filters, should still work)
3. **Test with high batch sizes** (e.g., 40 firms for Pro tier)
4. **Test credit calculation** (ensure it's still based on returned firms, not generated firms)
5. **Test API cost** (ensure we're not making excessive API calls)

## Performance Impact

- **API calls**: 
  - Best case: ~2.5x (if first iteration succeeds)
  - Worst case: Up to ~5x (if all 3 iterations needed, but capped at limit × 5)
- **Response time**: 
  - May increase if multiple iterations needed
  - Each iteration adds ~5-10 seconds (parallel processing helps)
- **Cost**: 
  - More API costs, but user experience improves significantly
  - Capped at reasonable limits to prevent runaway costs
- **Mitigation**: 
  - Caching already in place helps reduce redundant calls
  - Duplicate tracking prevents re-fetching same firms
  - Absolute caps prevent excessive API usage

## Rollout Strategy

1. **Phase 1**: Implement iterative fetching with overfetch strategy
   - Start with 2.5x initial multiplier, 3.0x retry multiplier
   - Max 3 iterations, absolute cap of limit × 5
2. **Phase 2**: Monitor performance and adjust multipliers if needed
   - Track: How often do we need retries? What's the average filtering rate?
   - Adjust multipliers based on real-world data
3. **Phase 3**: Fine-tune based on metrics
   - Optimize for common cases (e.g., if 2.5x works 90% of the time, keep it)
   - Adjust retry strategy if needed

## Configuration

```python
# In serp_client.py
OVERFETCH_MULTIPLIER = float(os.getenv('FIRM_SEARCH_OVERFETCH_MULTIPLIER', '2.5'))  # Initial multiplier
RETRY_MULTIPLIER = float(os.getenv('FIRM_SEARCH_RETRY_MULTIPLIER', '3.0'))  # Multiplier for retries
MAX_ITERATIONS = int(os.getenv('FIRM_SEARCH_MAX_ITERATIONS', '3'))  # Maximum retry attempts
MAX_TOTAL_FIRMS_MULTIPLIER = float(os.getenv('FIRM_SEARCH_MAX_TOTAL_MULTIPLIER', '5.0'))  # limit × this = absolute cap
MIN_BATCH_BUFFER = 5  # Always generate at least needed + this many firms per iteration
```

## Success Metrics

- ✅ Users receive exactly the number of firms they requested (or as many as available)
- ✅ Filtering rate is handled gracefully with iterative fetching
- ✅ Credit costs remain fair (based on returned firms, not generated firms)
- ✅ API costs are reasonable (capped at limit × 5, typically 2.5x-3x)
- ✅ Handles edge cases where filtering removes most firms (e.g., 25 → 8)
- ✅ Prevents infinite loops with max iteration limits
- ✅ Avoids excessive API costs with absolute caps

## Handling the "25 → 8" Scenario

**The Problem**: User requests 10 firms, we generate 25, but after filtering only 8 pass.

**The Solution**: Iterative fetching loop:
1. **Iteration 1**: Generate 25 → Filter → 8 pass (need 2 more)
2. **Iteration 2**: Generate 6 more (2 × 3.0 multiplier) → Filter → Hopefully get 2+ more
3. **Result**: Total 10+ firms → Return exactly 10

**Safeguards**:
- Maximum 3 iterations (prevents infinite loops)
- Absolute cap: Won't generate more than `limit × 5` total firms (50 for limit=10)
- Duplicate tracking: Won't re-fetch same firms
- Progressive multiplier: More aggressive on retries (3.0x vs 2.5x)

**If still insufficient after all iterations**:
- Return what we found (e.g., 8 firms)
- Include message: "Found 8 firms matching your criteria (requested 10). Try broadening your search."
- Charge credits only for returned firms (8 × 5 = 40 credits)
