# Sector classifier — QA flags for Sid

From spot-checking the top companies BY VOLUME in each sector (those are the ones
that rank #1–3 and actually surface in Scout's pool-derived suggestions). Two
buckets: wrong sector, and canonicalization leftovers. Low priority — the app
keeps curated names primary, so these only show in niche vibes — but worth a
classifier-prompt tweak / spot-fix since they lead their sectors by volume.

## A. High-volume misclassifications (company · jobs · current → suggested)
- **Horace Mann - Agent Opportunities** · 383 · `finance_investment_bank` → insurance sales recruiting, not IB (also strip the "- Agent Opportunities" suffix)
- **Morgan & Morgan P A** · 334 · `consulting_professional` → personal-injury **law firm**, not consulting
- **INFUSE** · 183 · `edtech` → B2B lead-gen/demand-gen agency, not edtech
- **Genius Sports Statistician Network** · 449 · `gaming` → sports-data/betting (+ a gig "network"), not a game studio
- **Betsson** · 98 · `gaming` → gambling/betting, not video games
- **michelscorporation** · 489 · `climate_energy` → Michels Corp, a construction/utility contractor
- **Air Apps** · 429 · `devtools_infra` → consumer app publisher, not dev tools
- **Omada ai** · 259 · `ai_ml` → almost certainly Omada Health → `healthtech`
- **Harvey** · 173 · `consulting_professional` → Harvey **AI** (legal AI) → `ai_ml`
- **CHAOS Industries** · 102 · `cybersecurity` → defense hardware → `defense_aerospace`
- **monsterenergy** · 133 · `consumer_social` → Monster Energy (beverage/CPG), not social
- **Lyft** · 107 · `consumer_social` → rideshare → `consumer_marketplace`

Pattern: high-volume **mass-hirers** (insurance agents, law firms, staffing arms,
gig networks) get pulled into a plausible-sounding tech sector. If the prompt can
distinguish "hires-at-scale services co" from "product/tech co," most of these fix.

## B. Canonicalization leftovers (name → should be)
- **Paytm Payments** (476) + **Paytm** (127) — two docs, same firm → merge to **Paytm**
- **jdsportsfr** (595) → **JD Sports** (stray "fr" locale suffix)
- **n2publishingglassdoor** (188) → **N2 Publishing** (stray "glassdoor" source suffix)
- **monsterenergy** (133) → **Monster Energy** (missing space)
- **michelscorporation** (489) → **Michels Corporation** (missing space)

The "…glassdoor" / "…fr" source-suffix and no-space concatenations look like a
scrape-artifact class the normalizer could strip. (Scout's endpoint already drops
`glassdoor`/`staffing`/`talent platform`/`recruiting` names from suggestions, but
fixing them at the source helps the company page + counts too.)

## Not flagged (judgment calls, taxonomy not error)
`healthtech` reads broad — Pulse/LifeStance/Centria/BAYADA are healthcare *services*
that mass-hire, not health *tech*. Fine if that's the intended bucket; flagging in
case you want a services-vs-tech split later.
