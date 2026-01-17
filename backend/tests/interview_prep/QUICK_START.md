# Quick Start Guide - Interview Prep Test Harness

## Quick Setup

1. **Install PyYAML** (if not already installed):
   ```bash
   pip install pyyaml
   ```

2. **Get your auth token** (from Firebase authentication)

3. **Run a single test**:
   ```bash
   cd backend
   python tests/interview_prep/test_harness.py --test-case "Google SWE Intern" --interactive --auth-token <your-token>
   ```

## Test Case Structure

Test cases are in `test_cases.yaml`:
- 13 test cases covering FAANG, consulting, startups, finance, and edge cases
- Each specifies company, role, type, and expected category

## Evaluation Rubric

5 criteria (weighted):
1. Relevance (25%)
2. Actionability (20%)
3. Coverage (20%)
4. Personalization (20%)
5. Sample Questions (15%)

Score each 1-5, overall = weighted average.

## Output

- Results saved to `results/test_results_latest.json`
- Summary report printed to console
- Includes latency metrics, validation results, scores

## Key Features

✅ Automated validation of response structure
✅ Latency tracking (initial + completion)
✅ Role-appropriate content validation
✅ Interactive evaluation mode
✅ Summary reports with statistics

