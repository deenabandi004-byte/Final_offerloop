# Interview Prep Test Harness

This directory contains a comprehensive test harness for the Interview Prep feature in Offerloop.

## Overview

The test harness validates the quality of interview prep responses by:
1. Running test cases across different company types, roles, and experience levels
2. Collecting response data and metrics (latency, error handling)
3. Allowing manual evaluation of responses using a structured rubric
4. Generating summary reports with statistics

## Files

- **`test_cases.yaml`**: Test cases covering different scenarios (FAANG, startups, consulting, finance, edge cases)
- **`evaluation_rubric.md`**: Detailed evaluation criteria and scoring rubric
- **`test_harness.py`**: Main test harness script
- **`results/`**: Directory containing test results (JSON format)

## Setup

1. **Install dependencies:**
   ```bash
   pip install pyyaml requests
   ```
   
   Or add to `requirements.txt`:
   ```
   pyyaml>=6.0
   requests>=2.32.0  # Already in requirements.txt
   ```

2. **Set up authentication:**
   - The test harness needs an authentication token to call the API
   - Set `AUTH_TOKEN` environment variable or pass `--auth-token` flag
   - Or authenticate via Firebase and extract the token from your session

3. **Configure API URL (optional):**
   - Default: `http://localhost:5001`
   - Set `API_BASE_URL` environment variable or use `--api-url` flag
   - For production: `--api-url https://www.offerloop.ai`

## Usage

### Run a specific test case:
```bash
python backend/tests/interview_prep/test_harness.py --test-case "Google SWE Intern" --interactive
```

### Run all test cases:
```bash
python backend/tests/interview_prep/test_harness.py --all
```

### Run with interactive evaluation:
```bash
python backend/tests/interview_prep/test_harness.py --all --interactive
```

### Run with custom API URL and auth token:
```bash
python backend/tests/interview_prep/test_harness.py --all \
  --api-url http://localhost:5001 \
  --auth-token <your-token> \
  --interactive
```

### Interactive mode (select test case):
```bash
python backend/tests/interview_prep/test_harness.py
```

## Test Cases

Test cases are defined in `test_cases.yaml` and cover:

- **FAANG Companies**: Google, Meta, Amazon (SWE, PM, Data Science)
- **Consulting Firms**: McKinsey, BCG, Bain
- **Startups**: Stripe, Airbnb
- **Finance**: Goldman Sachs, JPMorgan
- **Edge Cases**: Unknown companies, unusual roles, senior roles

Each test case specifies:
- Company name and job title
- Company type and role type
- Expected role category
- Description of what should be tested

## Evaluation

The evaluation rubric (`evaluation_rubric.md`) defines 5 criteria:

1. **Relevance to Company/Role** (25%): Company-specific content, role-appropriate interview formats
2. **Actionability of Advice** (20%): Specific steps, timelines, resources, week-by-week plans
3. **Coverage of Key Interview Topics** (20%): Behavioral, technical, case studies, system design
4. **Personalization Based on Role Type** (20%): SWE gets coding, Consulting gets cases (NO LeetCode), etc.
5. **Quality of Sample Questions** (15%): Realistic, well-contextualized questions with answer hints

Each criterion is scored 1-5 (5 is excellent).

**Overall Score = Σ (Criterion Score × Weight)**

## Automated Checks

The test harness automatically checks:

- **Response Latency**:
  - Initial response: < 60s (alert if > 2min)
  - Completion: < 5min (alert if > 10min)
  
- **Error Handling**:
  - Tests with missing company info
  - Tests with unusual roles
  - Validates graceful error messages

- **Response Structure**:
  - Validates that response contains expected sections
  - Checks for missing data

## Results

Test results are saved to:
- `results/test_results_<timestamp>.json` - Timestamped results
- `results/test_results_latest.json` - Latest results (overwritten)

Results include:
- Test case metadata
- Response data and insights
- Latency metrics
- Error messages (if any)
- Evaluation scores (if interactive mode used)
- Notes

## Example Output

```
============================================================
Running test: Google SWE Intern
Company: Google
Role: Software Engineering Intern
Type: FAANG / Software Engineering
============================================================
✅ Prep created: abc123
⏱️  Initial latency: 1.23s
⏳ Waiting for completion (max 600s)...
  Status: processing - Processing...
  Status: scraping_reddit - Searching Reddit...
  Status: processing_content - Processing insights...
  Status: generating_pdf - Generating your prep guide...
✅ Prep completed in 45.67s

============================================================
Evaluation: Google SWE Intern
============================================================
📊 Rate each criterion (1-5, where 5 is excellent):
  Relevance (1-5): 5
  Actionability (1-5): 4
  Coverage (1-5): 5
  Personalization (1-5): 5
  Sample Questions (1-5): 4

📈 Overall Score: 4.60/5.0
```

## Summary Report

After running tests, the harness generates a summary report with:
- Status breakdown (completed, failed, error)
- Latency statistics (average, min, max)
- Overall score statistics
- Error list
- Detailed results table

## Notes

- **Authentication**: The API requires Firebase authentication. You'll need a valid auth token.
- **Token Usage**: Token usage tracking is not currently implemented but can be added by inspecting OpenAI API responses.
- **Cost Estimation**: Cost per request can be estimated based on token usage (if tracked) and OpenAI pricing.
- **Polling**: The harness polls every 5 seconds for completion status. Adjust `POLL_INTERVAL` in `test_harness.py` if needed.

## Extending the Test Suite

1. **Add new test cases**: Edit `test_cases.yaml`
2. **Modify evaluation criteria**: Edit `evaluation_rubric.md` and update `CRITERIA_WEIGHTS` in `test_harness.py`
3. **Add automated checks**: Extend the `run_test_case` method in `test_harness.py`

