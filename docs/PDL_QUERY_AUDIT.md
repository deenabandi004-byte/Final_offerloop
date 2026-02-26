# PDL Query Construction – Audit & Fixes

## 1. Audit: Where PDL Queries Are Built

### Entry points
- **Prompt-first search (contact search from natural language)**  
  - **Route:** `backend/app/routes/runs.py` → `parse_search_prompt_structured(prompt)` then `search_contacts_from_prompt(parsed, max_contacts)`.  
  - **Query builder:** `backend/app/services/pdl_client.py` → `build_query_from_prompt(parsed_prompt, retry_level)`.  
  - **Execution:** `execute_pdl_search(url=PDL person/search, body={"query": query_obj, "size": N})`.

- **Alternative prompt search (different flow)**  
  - **Route:** `backend/app/routes/prompt_search.py` → `run_prompt_search(filters)`.  
  - **Query builder:** `backend/app/services/prompt_pdl_search.py` → `_build_query(filters, strategy)`.  
  - Uses its own strategies and `_call_pdl_with_pagination`.

### Flow: user input → PDL request

1. User types a prompt, e.g. **"consultant / manager / partner at McKinsey, United States"**.
2. **parse_search_prompt_structured** (OpenAI) returns:
   - `companies`: `[{ "name": "McKinsey", "matched_titles": ["Consultant", "Associate Consultant", ...] }]`
   - `title_variations`: `["consultant", "associate consultant", "manager", "senior manager", "partner"]`
   - `locations`: `["United States"]` (or similar)
3. **build_query_from_prompt** turns that into an Elasticsearch bool query:
   - **Title block:** `bool.should` of `match_phrase` + `match` for each title (OR).
   - **Location block:** `term`: `location_country: "united states"` (+ metro/locality if present).
   - **Company block:** per company, `bool.should` of `match_phrase` and `match` on `job_company_name`.
4. **execute_pdl_search** sends `POST {PDL_BASE_URL}/person/search` with body:
   ```json
   { "query": { "bool": { "must": [ title_block, location_block, company_block ] } }, "size": N }
   ```

### Example payload for "consultant at McKinsey, United States"

```json
{
  "query": {
    "bool": {
      "must": [
        {
          "bool": {
            "should": [
              {"match_phrase": {"job_title": "consultant"}},
              {"match": {"job_title": "consultant"}},
              {"match_phrase": {"job_title": "associate consultant"}},
              {"match": {"job_title": "associate consultant"}},
              ...
            ]
          }
        },
        {
          "bool": {
            "must": [
              {"term": {"location_country": "united states"}}
            ]
          }
        },
        {
          "bool": {
            "should": [
              {"match_phrase": {"job_company_name": "mckinsey"}},
              {"match": {"job_company_name": "mckinsey"}}
            ]
          }
        }
      ]
    }
  },
  "size": 3
}
```

---

## 2. Issues Identified

| Issue | Detail |
|-------|--------|
| **Company match too strict** | Only `match_phrase` and `match` on `job_company_name`. If PDL stores "McKinsey & Company" and the field is keyword or analyzed in a way that doesn’t tokenize well, "mckinsey" may not match. Need a contains-like (e.g. wildcard) fallback. |
| **location_country value** | We send `"united states"` (lowercase). PDL’s canonical list may use `"United States"` or `"US"`. A single `term` can miss the other variants. |
| **Multi-title** | Already correct: multiple titles are in a single `bool.should` (OR). No change needed. |
| **job_title vs experience** | We use `job_title` (current job). PDL person schema uses this for current role; no change. |
| **Overly restrictive** | No extra requirement for email/LinkedIn in the query; post-validation and ordering only. OK. |
| **Retry/relaxation** | Existing retry (simplify title → drop title → drop location) is preserved; only initial query construction is improved. |

---

## 3. Fixes Applied

### 3.1 Company: add wildcard (contains-style) for `job_company_name`

- Keep existing `match_phrase` and `match`.
- Add a **wildcard** clause so that e.g. "mckinsey" matches "McKinsey & Company":
  - `{"wildcard": {"job_company_name": {"value": "*mckinsey*", "case_insensitive": true}}}`
- So for each company we have: (match_phrase OR match OR wildcard).

### 3.2 Location: support multiple country variants

- For the country filter, use a **single `bool.should`** over multiple `term` values:
  - `"united states"`, `"United States"`, `"us"`
- So whichever PDL uses, we still match.

### 3.3 Logging

- **execute_pdl_search** already logs the full request body (pretty-printed).
- Add one line that logs the **exact JSON payload** (single line) right before the POST so it’s easy to copy for debugging.

---

## 4. Before / After Query (conceptual)

**Before (company):**
```json
{
  "bool": {
    "should": [
      {"match_phrase": {"job_company_name": "mckinsey"}},
      {"match": {"job_company_name": "mckinsey"}}
    ]
  }
}
```

**After (company):**
```json
{
  "bool": {
    "should": [
      {"match_phrase": {"job_company_name": "mckinsey"}},
      {"match": {"job_company_name": "mckinsey"}},
      {"wildcard": {"job_company_name": {"value": "*mckinsey*", "case_insensitive": true}}}
    ]
  }
}
```

**Before (location country):**
```json
{"term": {"location_country": "united states"}}
```

**After (location country):**
```json
{
  "bool": {
    "should": [
      {"term": {"location_country": "united states"}},
      {"term": {"location_country": "United States"}},
      {"term": {"location_country": "us"}}
    ],
    "minimum_should_match": 1
  }
}
```

---

## 5. Files Touched

- `backend/app/services/pdl_client.py`
  - `build_query_from_prompt`: company block (add wildcard), location block (country variants).
  - `execute_pdl_search`: one extra log line for the exact request payload.

No changes to retry/fallback logic; backward compatible with existing search flows.
