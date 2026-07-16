# Sector + index QA — final handoff for Sid

Verified against prod after the alias-merge + backfill (2026-07-15, 7,481/7,481
classified). Good news: **jobs merged correctly** at the source — `Monster
Energy`=133 / `monsterenergy`=0, `Horace Mann`=416 / `Horace Mann - Agent
Opportunities`=0, `Morgan & Morgan`=334 / `Morgan & Morgan P A`=0. Two things
didn't fully land, one new:

## 1. NEW — `companies` index has stale zombie docs (Piece 1)
The jobs moved to canonical names, but the OLD fragmented company docs still exist
in the index with their pre-merge counts:
```
companies/monsterenergy                  total=133  (real jobs now 0)
companies/monster-energy                 total=133  (the real one)
companies/horace-mann-agent-opportunities total=383 (real jobs now 0)
companies/morgan-morgan-p-a              total=334  (real jobs now 0)
```
The 2h rebuild looks **upsert-only** — it never zeroes/deletes a company that
dropped to 0 jobs, so every merge leaves a zombie. Fix: rebuild the index
delete-first (or prune docs whose recomputed total is 0). Affects the company
page, `/company-counts`, and Scout suggestions (dupes show).

## 2. Services-vs-product mislabels that PERSIST (the --force list you asked for)
Re-classification kept these on the canonical docs — they're mass-hire *services*
firms sitting atop tech sectors by volume:
- **Horace Mann** (416) `finance_investment_bank` → insurance agents → `other`
- **Morgan & Morgan** (334) `consulting_professional` → law firm → `other`
- **Genius Sports Statistician Network** (449) `gaming` → sports-data gig network → `other`
- **Betsson** (98) `gaming` → gambling, not video games → `other` (or media)
- **Bjak** (747) `ai_ml` → Malaysian insurance marketplace → `fintech`/`other` (it ranks #1 in ai_ml, so this one hurts)
- **TSMG** (559) `ai_ml` → verify (unknown; #3 in ai_ml by volume)

Clear sector corrections (product cos in the wrong bucket):
- **Harvey** (173) `consulting_professional` → legal **AI** → `ai_ml`
- **Omada Health** `ai_ml` (was "Omada ai") → `healthtech`
- **CHAOS Industries** (102) `cybersecurity` → defense hardware → `defense_aerospace`
- **Lyft** (107) `consumer_social` → rideshare → `consumer_marketplace`
- **Monster Energy** (133) `consumer_social` → beverage/CPG → `consumer_marketplace`/`other`

Prompt lever: the recurring failure is **"hires-at-scale services co" (insurance
agents, law firms, staffing/gig networks) → getting a plausible tech sector.** A
rule that routes those to `other` fixes most of #2.

## Not an error (taxonomy call)
`healthtech` is broad — Pulse/LifeStance/Centria/BAYADA are healthcare *services*
that mass-hire, not health *tech*. Fine if intended; flag for a services-vs-tech
split only if you want it.
