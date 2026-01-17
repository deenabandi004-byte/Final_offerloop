# Interview Prep Evaluation Rubric

This document outlines the evaluation criteria for testing the quality of Interview Prep responses.

## Evaluation Criteria

Each response should be evaluated on the following criteria (1-5 scale, where 5 is excellent):

### 1. Relevance to Company/Role (Weight: 25%)
**Score: 1-5**

- **5**: Content is highly specific to the company and role. Includes company-specific questions, culture insights, and role-appropriate interview formats.
- **4**: Content is mostly relevant with some company-specific details.
- **3**: Content is generally relevant but lacks company-specific customization.
- **2**: Content is somewhat generic, minimal company-specific information.
- **1**: Content is generic and not tailored to the specific company/role.

**Key Indicators:**
- Company-specific questions included
- Company culture insights present
- Interview process matches known company patterns
- Role-specific technical areas covered

### 2. Actionability of Advice (Weight: 20%)
**Score: 1-5**

- **5**: Provides specific, actionable steps with clear preparation timelines, resources, and week-by-week plans.
- **4**: Provides mostly actionable advice with some specific recommendations.
- **3**: Provides general advice that could be actionable with minimal interpretation.
- **2**: Provides vague advice that requires significant interpretation.
- **1**: Provides generic, non-actionable advice.

**Key Indicators:**
- Clear preparation timeline (e.g., "4-6 weeks", "100-150 LeetCode problems")
- Specific resources listed (websites, books, courses)
- Week-by-week preparation plan
- Concrete action items

### 3. Coverage of Key Interview Topics (Weight: 20%)
**Score: 1-5**

- **5**: Comprehensively covers all relevant interview types (behavioral, technical, case studies, system design, etc.) appropriate for the role.
- **4**: Covers most relevant interview topics with good depth.
- **3**: Covers main interview topics but missing some important areas.
- **2**: Covers only basic interview topics.
- **1**: Missing key interview topics for the role.

**Key Indicators:**
- Behavioral questions covered
- Technical questions appropriate for role (coding for SWE, cases for consulting, etc.)
- System design / case frameworks included where relevant
- Company-specific questions included

### 4. Personalization Based on Role Type (Weight: 20%)
**Score: 1-5**

- **5**: Content is perfectly tailored to the role type. SWE roles get coding problems, Consulting roles get case interviews (NO LeetCode), Finance roles get DCF/valuation questions.
- **4**: Content is mostly appropriate for role type with minor mismatches.
- **3**: Content is generally appropriate but includes some irrelevant content for the role.
- **2**: Significant mismatches - includes content inappropriate for the role (e.g., LeetCode for consulting roles).
- **1**: Content is not tailored to role type at all.

**Key Indicators:**
- **SWE roles**: Should include LeetCode, coding problems, algorithms, system design. Should NOT include case interviews.
- **Consulting roles**: Should include case interviews, frameworks, market sizing. Should NOT include LeetCode or coding problems.
- **Finance roles**: Should include DCF, valuation, accounting questions. Should NOT include LeetCode.
- **PM roles**: Should include product sense, estimation, prioritization. Limited coding.
- **Data Science roles**: Should include SQL, statistics, ML, A/B testing. Should NOT include LeetCode algorithms.

### 5. Quality of Sample Questions (Weight: 15%)
**Score: 1-5**

- **5**: Questions are specific, realistic, well-contextualized with "why asked" and answer hints. Mix of behavioral, technical, and company-specific questions.
- **4**: Questions are good quality with some context provided.
- **3**: Questions are reasonable but lack context or specificity.
- **2**: Questions are generic or poorly formulated.
- **1**: Questions are irrelevant or poorly structured.

**Key Indicators:**
- Questions are realistic and role-appropriate
- "Why asked" context provided for behavioral questions
- Answer hints or frameworks provided
- Mix of question types (behavioral, technical, company-specific)
- Actual questions from Reddit included where available

## Automated Checks

### Response Latency
- **Target**: < 60 seconds for initial response (prep ID)
- **Target**: < 5 minutes for completed prep
- **Alert**: > 2 minutes for initial, > 10 minutes for completion

### Token Usage / Cost
- Track tokens used per request (if available from API)
- Estimate cost per request
- Alert on unusually high token usage

### Error Handling
- Test with missing company info
- Test with unusual roles
- Test with invalid URLs
- Test with edge cases (empty strings, special characters)
- Verify graceful error messages

## Overall Score Calculation

**Overall Score = Σ (Criterion Score × Weight)**

- Maximum: 5.0
- Minimum: 1.0

**Score Interpretation:**
- **4.5-5.0**: Excellent - Production ready
- **4.0-4.4**: Very Good - Minor improvements needed
- **3.5-3.9**: Good - Some improvements needed
- **3.0-3.4**: Fair - Significant improvements needed
- **< 3.0**: Poor - Major improvements required

## Notes

- Role-specific content is CRITICAL. The biggest quality issue is when consulting roles get LeetCode questions or SWE roles get case interviews.
- Company-specific content adds significant value - generic content is less useful.
- Actionability matters - candidates need concrete next steps, not just general advice.
- Real interview experiences from Reddit add authenticity and value.

