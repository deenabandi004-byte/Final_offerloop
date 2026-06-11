# SEO Expansion Session — May 16-18, 2026

## Context

Expanding Offerloop's programmatic SEO from ~1,490 pages to 10,000+ pages across 6 new route types. This session built the foundation: templates, data, routing, sitemap generation.

## What Was Built

### 6 New Page Templates

All in `connect-grow-hire/src/pages/templates/`, matching existing visual system (DM Sans body, Lora serif headings, 800px max-width sections, FAQPage JSON-LD, SEOHead + generateMeta).

| Template | Route | Purpose | Seed pages |
|---|---|---|---|
| TargetSchoolsPage.tsx | /target-schools/:slug | Company target school lists, GPA reqs, non-target advice | 20 companies |
| FindEmailPage.tsx | /find-email/:slug | Ethical email finding guides by person type | 20 person types |
| RecruiterPage.tsx | /recruit/:slug | Campus recruiting guides for recruiters | 20 universities |
| SalaryPage.tsx | /salary/:slug | Compensation guides by company and level | 20 companies |
| RecruitingTimelinePage.tsx | /recruiting-timeline/:slug | Industry recruiting calendars with visual timeline | 10 industries |
| AgentPage.tsx | /automate/:slug | AI agent outreach automation pages | 10 outreach types |

### 6 Page Wrapper Components

In `connect-grow-hire/src/pages/`, following the CompanyComparisonPage pattern:
- TargetSchoolsPageWrapper.tsx
- FindEmailPageWrapper.tsx
- RecruiterPageWrapper.tsx
- SalaryPageWrapper.tsx
- RecruitingTimelinePageWrapper.tsx
- AgentPageWrapper.tsx

Each reads `:slug` from URL params, looks up the data entry, renders the template (or redirects to / if slug not found).

### 6 Seed Data Files

In `connect-grow-hire/src/data/`:

| File | Entries | Key data |
|---|---|---|
| target-schools-data.ts | 20 | Goldman, McKinsey, BCG, JPMorgan, etc. with real target school lists |
| find-email-data.ts | 20 | IB Analyst, Consultant, PE Associate, etc. with email format patterns |
| recruiter-data.ts | 20 | USC, Harvard, Stanford, MIT, Wharton, etc. with real clubs and firms |
| salary-data.ts | 20 | Same 20 companies with realistic comp ranges by level |
| recruiting-timeline-data.ts | 10 | IB, Consulting, PE, Tech, etc. with full recruiting cycle milestones |
| automate-data.ts | 10 | Cold email, coffee chat, alumni networking, etc. with agent steps |

### generateMeta.ts Updates

Added 6 new route type cases in the switch statement:
- `target-schools` — "[Company] Target Schools: Complete Recruiting List (YYYY)"
- `find-email` — "How to Find a [Person Type]'s Email Address Ethically (YYYY)"
- `recruiter` — "Recruiting at [University]: How to Source Top Students (YYYY)"
- `salary` — "[Company] Salary Guide: Compensation by Level (YYYY)"
- `recruiting-timeline` — "[Industry] Recruiting Timeline YYYY-YYYY: Key Dates & Deadlines"
- `automate` — "Automate [Outreach Type] with AI — Set Goals, Get Results"

### App.tsx Route Registration

6 lazy imports + 6 `<Route>` entries added for all new route types.

### Sitemap Generator

`scripts/generate-sitemap.cjs` — reads all data files (existing + new), generates `connect-grow-hire/public/sitemap.xml` with deduplication. Current output: 1,604 URLs.

## Thin Content Audit (Task 1 Findings)

Before expanding, audited existing routes for thin content risk:

| Route | URLs | Risk | Why |
|---|---|---|---|
| /coffee-chat/ | 499 | HIGH | Same 5-FAQ template for ~100 companies, minimal differentiation |
| /networking/ | 499 | HIGH | Same problem, ~1,000 pages from ~100 companies |
| /alumni/ | 192 | MEDIUM | Better differentiation (school-specific fields) but sparse for small schools |
| /compare/ | 146 | LOW | Best performer, custom content for top 10 pairs |
| /networking-for/ | 79 | MEDIUM | Only ~10 roles, limited data per page |
| /cold-email/ | 59 | LOW | Industry-specific, more unique content |

The 140 "crawled not indexed" pages in GSC are most likely from the coffee-chat and networking buckets where Google sees near-duplicate thin content across companies.

## File Count

- 19 new files created
- 3 existing files modified (App.tsx, generateMeta.ts, sitemap.xml)
- Zero TypeScript errors in new code (pre-existing errors in unrelated files only)

## Status

All code is written and verified but **not yet committed**. Sitting on `rylan-commits` branch, ready for review and commit.

## What's Next

1. **Commit and push** this batch
2. **Scale seed data** — current 100 seed entries will produce 100 new pages. To reach 10,000+ need to expand data files (more companies, more universities, cross-products of existing data)
3. **BlogPost.tsx re-migration** — was reverted to pre-SEOHead state by other work. Needs re-migration to SEOHead + generateMeta
4. **Thin content remediation** — add noindex to the weakest coffee-chat and networking pages, or enrich them with custom content
5. **GSC monitoring** — resubmit sitemap after deploy, track indexation of new route types over 2-4 weeks
6. **Internal linking** — cross-link between new and existing route types (e.g., salary pages link to compare pages, target-schools pages link to networking guides)
