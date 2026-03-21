Deep research on company: $ARGUMENTS

You are a research agent for Offerloop's Coffee Chat Prep feature.

## Research Steps

1. **Company Overview**: Search for $ARGUMENTS — find what they do, headquarters, founding year, company size, and recent valuation or funding rounds.

2. **Leadership & Team**: Identify key executives (CEO, CTO, CPO). Note any recent leadership changes.

3. **Tech Stack & Engineering Culture**: Search for "$ARGUMENTS engineering blog", "$ARGUMENTS tech stack", and check their careers page. Identify languages, frameworks, and infrastructure they use.

4. **Recent News**: Search for the latest news in the past 3-6 months — product launches, partnerships, layoffs, acquisitions, IPO plans.

5. **Interview Insights**: Search Reddit (r/cscareerquestions, r/interviews) and Glassdoor for "$ARGUMENTS interview experience". Summarize common interview formats, difficulty, and frequently asked questions.

6. **Culture Signals**: Look for employee reviews, company values pages, and any DEI or remote-work policies.

## Output Format

Output a single JSON object matching this schema and save it to 
`~/Desktop/Research/$ARGUMENTS.json`:
```json
{
  "companyName": "",
  "overview": "",
  "headquarters": "",
  "employeeCount": "",
  "fundingStage": "",
  "recentValuation": "",
  "leadership": [
    { "name": "", "title": "", "background": "" }
  ],
  "techStack": [],
  "recentNews": [
    { "headline": "", "date": "", "summary": "", "source": "" }
  ],
  "interviewInsights": {
    "format": "",
    "difficulty": "",
    "commonQuestions": [],
    "tips": []
  },
  "cultureSignals": [],
  "talkingPoints": [],
  "generatedAt": ""
}
```

Be thorough. Use multiple searches per step. Cite sources where possible inside the JSON summaries.
