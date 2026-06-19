# Offerloop SEO: the 8-widget / 10K-page expansion

Companion to `SEO_STRATEGY.md` (thesis + quality bars), `SEO_ROLLOUT_PLAN.md`
(phasing + gates), and `SEO_KEYWORD_UNIVERSE.md` (the original 400-page,
4-cluster universe). This doc extends that universe from 4 clusters to 10,
maps every cluster to one of the 8 public lead-magnet widgets, and lays out
the path from ~1,000 pages (Wave 1) to a 10,000-page hard cap.

Written May 2026. House rules unchanged: no em dashes, builder voice, never
fabricate a stat, one widget per page, product-led test on every page.

---

## What changed since the 400-page universe

The original universe (`SEO_KEYWORD_UNIVERSE.md`) was built when Offerloop had
**3 public widgets** (resume review, cover letter, interview prep) plus an ATS
hybrid. Offerloop now ships **8 public lead-magnet widgets**, all live and
health-checked at `/api/tools/*`:

| # | Widget | Public route | Standalone page |
|---|---|---|---|
| 1 | Resume Review | `/api/tools/resume-review` | `/tools/resume-review` |
| 2 | Cover Letter | `/api/tools/cover-letter` | `/tools/cover-letter` |
| 3 | Interview Prep | `/api/tools/interview-prep` | `/tools/interview-prep` |
| 4 | Meeting Prep | `/api/tools/meeting-prep` | `/tools/meeting-prep` |
| 5 | Find Companies | `/api/tools/find-companies` | `/tools/find-companies` |
| 6 | Find Hiring Manager | `/api/tools/find-hiring-manager` | `/tools/find-hiring-manager` |
| 7 | Find Jobs | `/api/tools/find-jobs` | `/tools/find-jobs` |
| 8 | Find People | `/api/tools/find-people` | `/tools/find-people` |

The job is to give each widget its own programmatic cluster, ship ~100 pages
per widget in Wave 1 (~1,000 total), and then scale the school dimension to
reach the 10K cap.

---

## The ranking evidence we are building on

From the GSC audit in `SEO_STRATEGY.md` (90-day window, ~772 indexed pages):

- **Proven winner:** the `/meeting/*` firm pages ran **2.5 to 8% CTR.** That is
  the one template the audit confirmed converts. The meeting-prep widget cluster
  is therefore the **Wave 1 flagship**, not an afterthought.
- **Proven loser:** `/compare/*` bled **45K impressions at 0.4% CTR** with
  near-zero conversion: high volume, no product fit. The lesson is not "never
  build comparison pages." It is **"never build a thin comparison table."** The
  Apollo-style pages below are product-led (they embed a working widget), not
  static feature grids.
- **Near-dead:** most `/alumni/*` and `/networking/*` (the old school-anchored
  pages). They are being pruned (Rollout Plan Phase 1a) and **replaced** by the
  find-people cluster, which embeds a live tool instead of a static list.

Implication for ordering: lead with the school-anchored find-people cluster and
the meeting-prep cluster (both have proven or proven-adjacent CTR), and gate the
comparison cluster behind the product-led rule.

---

## The 10 clusters (8 widgets + 1 hybrid + 1 comparison)

Every cluster maps to exactly one widget and one product action. Slug patterns
extend the existing `/seo-preview/{cluster}/{slug}` convention; production slugs
drop the `/seo-preview` prefix once the format is approved (per Rollout Plan
Phase 1c).

| # | Cluster | Widget | URL pattern | Dimension | Wave-1 count |
|---|---|---|---|---|---|
| 1 | Resume Review | resume-review | `/resume-review/{firm}-{role}` | firm × role | 100 (built) |
| 2 | Cover Letter | cover-letter | `/cover-letter/{firm}-{role}` | firm × role | 100 (built) |
| 3 | Interview Prep | interview-prep | `/interview-prep/{firm}-{role}` | firm × role | 100 (built) |
| 4 | ATS Screening | resume-review (hybrid) | `/ats/{firm}` + `/ats/keywords-{role}` | firm + role | 100 (built) |
| 5 | **Meeting Prep** | meeting-prep | `/meeting-prep/{firm}-{role}` | firm × role | 100 (flagship) |
| 6 | **Find People (alumni)** | find-people | `/find-people/{school}-at-{firm}` | school × firm | 100 |
| 7 | Find Hiring Manager | find-hiring-manager | `/find-hiring-manager/{firm}-{role}` | firm × role | 100 |
| 8 | Find Companies | find-companies | `/find-companies/{anchor}` | major/industry × role + "like {firm}" | 100 |
| 9 | Find Jobs | find-jobs | `/find-jobs/{firm}-{role}` | firm × role | 100 |
| 10 | Comparison (Apollo, etc.) | find-people / find-companies | `/vs/{competitor}` + `/{competitor}-alternative` | competitor | ~20 |

**Wave 1 total: 4 clusters already built (400) + 6 new clusters (~600) = ~1,000+
pages.** That is the "a little over 1,000, ~100 per magnet" target.

---

## Per-cluster detail (the 6 new clusters)

### Cluster 5: Meeting Prep (FLAGSHIP, proven format)

- **Widget:** `meeting-prep` (`/api/tools/meeting-prep`)
- **Primary keyword:** `questions to ask a [firm] [role]`, `[firm] coffee chat questions`
- **Secondary:** `[firm] informational interview questions`, `how to prep for a coffee chat with a [firm] analyst`
- **Slug:** `/meeting-prep/{firm}-{role}` (e.g. `mckinsey-ba`, `goldman-sachs-ib-analyst`)
- **Why it leads:** the only template the GSC audit proved at 2.5-8% CTR. The
  old `/meeting/*` and `/coffee-chat/*` pages (499 each) get 301-redirected into
  this cluster (Rollout Plan Phase 1a.4), preserving any link equity.
- **Proprietary data per cell:** median coffee-chats-to-offer for the firm, the
  groups/teams that take the most chats, the firm's alumni density per top
  school, the typical chat length and channel (Zoom vs in-person).

### Cluster 6: Find People / alumni (HIGHEST DEFENSIBILITY, school dimension)

- **Widget:** `find-people` (`/api/tools/find-people`)
- **Primary keyword:** `[school] alumni at [firm]` (e.g. "USC alumni at Goldman Sachs")
- **Secondary:** `[school] grads at [firm]`, `how to find [school] alumni at [firm]`, `[firm] [school] network`
- **Slug:** `/find-people/{school}-at-{firm}` (e.g. `usc-at-goldman-sachs`)
- **Why it matters:** this is the cluster that replaces the pruned `/alumni/*`
  and `/networking/*` pages, and it is the **engine of the 10K scale** because
  the school dimension multiplies. Every cell carries a genuinely unique PDL
  alumni count, so it is the strongest doorway-page defense we have.
- **Proprietary data per cell:** PDL alumni count for that exact school x firm
  cell (different number on every page), top divisions those alumni sit in,
  year-over-year placement trend, median response rate from outbox data.
- **Wave 1 picks:** 5 schools (USC, Berkeley, NYU, Michigan, UCLA) × 20 firms = 100.

### Cluster 7: Find Hiring Manager / recruiter

- **Widget:** `find-hiring-manager` (`/api/tools/find-hiring-manager`)
- **Primary keyword:** `[firm] [role] recruiter`, `who is the hiring manager for [firm] [role]`
- **Secondary:** `[firm] [role] recruiter email`, `how to find the recruiter at [firm]`, `[firm] campus recruiter`
- **Slug:** `/find-hiring-manager/{firm}-{role}`
- **Proprietary data per cell:** the firm's verified email format (from Hunter),
  the recruiting-team structure for that role, the typical title of the person
  who screens that role, response-rate signal from outbox.

### Cluster 8: Find Companies (discovery, not firm-anchored)

- **Widget:** `find-companies` (`/api/tools/find-companies`)
- **This cluster is structurally different:** the widget takes a resume or a
  prompt and returns 5 matched companies, so the intent is *discovery*, not a
  named firm. The programmatic anchor is the **major/role/industry**, not a
  single firm.
- **Primary keyword:** `companies that hire [major] majors`, `best companies for [role]`, `[industry] firms hiring [role] 2026`, `companies like [firm]`
- **Slug:** `/find-companies/{anchor}` where anchor is one of:
  - `companies-for-{major}` (e.g. `companies-for-economics-majors`)
  - `best-firms-for-{role}` (e.g. `best-firms-for-software-engineers`)
  - `companies-like-{firm}` (e.g. `companies-like-goldman-sachs`) - rides
    branded firm volume and routes it to the matcher
- **Proprietary data per cell:** the actual set of firms the matcher returns for
  that major/role (a real product output), hiring-volume signal per firm,
  entry-level role titles each hires.
- **Note:** `companies-like-{firm}` is the highest-volume sub-pattern because it
  rides existing firm brand searches; build those first within this cluster.

### Cluster 9: Find Jobs

- **Widget:** `find-jobs` (`/api/tools/find-jobs`)
- **Primary keyword:** `[role] internships at [firm] 2026`, `[firm] [role] jobs`
- **Secondary:** `[firm] [role] summer analyst 2027`, `entry level [role] at [firm]`, `[firm] new grad [role]`
- **Slug:** `/find-jobs/{firm}-{role}`
- **Year-fresh:** these carry a year token and must be refreshed every August
  and January (per the playbook's year-fresh rule). A stale "2026" page in
  Feb 2027 is a credibility drag.
- **Proprietary data per cell:** live open-req count for that firm x role (from
  the find-jobs backend), typical application window, the firm's posting cadence.

### Cluster 10: Comparison / Apollo (product-led, NOT thin tables)

- **Widget:** `find-people` or `find-companies` embedded (the comparison must
  *do something*, not just compare features).
- **Why Apollo:** Apollo, ZoomInfo, Seamless, LinkedIn Sales Navigator, and
  Handshake are the contact-data tools a student might reach for. The Offerloop
  angle: those are built for sales/enterprise, priced for teams, and not tuned
  for student recruiting. Offerloop's find-people / find-companies widgets do
  the student-recruiting job for free.
- **Primary keyword:** `apollo alternative for students`, `offerloop vs apollo`, `[competitor] alternative for college recruiting`
- **Slug:** `/vs/{competitor}` and `/{competitor}-alternative`
- **Targets (build defensively, before competitors do):** apollo, zoominfo,
  seamless-ai, linkedin-sales-navigator, handshake, rocketreach, lusha,
  contactout, signalhire, wiza, plus the student-recruiting-native ones
  (reachout, offergoblin). ~15-20 pages.
- **The hard rule from the GSC loser:** every comparison page embeds a working
  widget above the fold and carries a unique-data block (a real side-by-side of
  what each tool returns for the same query). A page that is only a feature
  table is the `/compare/*` 0.4%-CTR failure repeated. Cap this cluster; it is a
  defensive moat, not a volume play.

---

## ATS screening tied to interview prep (explicit ask)

Cluster 4 (ATS) already exists. Two additions wire it to the interview-prep
funnel so a student moves from "pass the resume screen" to "pass the interview":

1. **Two pillar explainer pages** (informational head of the funnel, then pivot
   to the widget):
   - `/ats/what-is-an-ats` (live) - how applicant tracking systems parse a
     resume, why 75% of resumes never reach a human, what the bots actually read.
   - `/ats/how-screening-works` (new) - the full screening pipeline: ATS keyword
     match, recruiter skim, then the interview loop. This page is the bridge: it
     ends by linking the reader into both the resume-review widget (fix the
     resume) and the interview-prep widget (prep the next stage).
2. **A cross-link module on every `/ats/{firm}` page**: "You passed [firm]'s
   Workday screen. Next: prep for the [firm] [role] interview" linking to the
   matching `/interview-prep/{firm}-{role}` cell. This turns the ATS cluster into
   a feeder for the proven interview-prep cluster and raises internal-link
   density (a ranking signal) between two clusters that share the firm dimension.

Net new ATS-tied pages in Wave 1: ~2 pillar pages + cross-link modules on the
existing 50 ATS-by-firm pages. No new cluster, just deeper wiring.

---

## The path to 10,000 (the dimension math)

Wave 1 is ~1,000 pages. The remaining 9,000 come from scaling three dimensions
that the data already supports. The rollout plan's stated realistic defensible
universe is **5,000-8,000, with 10,000 as the hard cap** - the power law
(~1% of pages drive ~50% of traffic) means the goal is a wide surface with a
ruthless kill gate, not a uniform click rate.

### Lever 1: expand the firm universe (25 -> ~60)

Add Tier-2 firms with real student search volume:
- **Banking (+15):** Jefferies, RBC, Wells Fargo, Guggenheim, PJT Partners,
  Perella Weinberg, Rothschild, Greenhill, Qatalyst, Baird, William Blair,
  Raymond James, Truist, Mizuho, Nomura.
- **Consulting (+10):** Oliver Wyman, Kearney, L.E.K., Strategy&, Accenture
  Strategy, ZS Associates, Roland Berger, Analysis Group, Cornerstone, PwC Strategy&.
- **Tech (+10):** Netflix, Uber, Airbnb, Databricks, Snowflake, Palantir,
  Coinbase, Salesforce, Figma, Ramp.

60 firms across the 6 firm-role clusters (resume, cover-letter, interview-prep,
meeting-prep, find-hiring-manager, find-jobs) at ~4 valid roles each:
**~240 firm-role pairs per cluster x 6 clusters = ~1,440 pages.**

### Lever 2: scale the school dimension (the real engine)

The find-people cluster is school x firm. Expanding to **40 target schools x 60
firms = 2,400 cells**, every one with a unique PDL alumni count. This single
cluster is the largest defensible block in the universe because the proprietary
data is genuinely different on every page.

Optionally revive a school x firm x industry recruiting cluster (the old proven
`/recruiting/{school}/{industry}` format) as a second school-anchored block:
40 schools x ~8 industry-firm groupings = ~320 hub pages feeding the find-people
spokes.

### Lever 3: deepen find-companies and ATS

- find-companies discovery anchors (majors x roles x "companies-like-{firm}"):
  ~30 majors + ~12 roles + 60 "companies-like" pages = ~500.
- ATS by firm x role specificity (`ats keywords for {role} at {firm}`): ~300.

### The rollup

| Block | Pages |
|---|---|
| 6 firm-role clusters x ~240 (60 firms) | ~1,440 |
| Find People (40 schools x 60 firms) | ~2,400 |
| Recruiting hubs (school x industry) | ~320 |
| Resume / cover-letter / interview-prep / meeting-prep extra role depth | ~1,500 |
| Find Companies (majors, roles, companies-like) | ~500 |
| ATS (firm, role, firm x role) | ~600 |
| Comparison / vs | ~20 |
| Guides, hubs, timelines, free-tool magnets | ~300 |
| **Defensible total** | **~7,000** |
| **Headroom to hard cap (new dimensions: class-year, vertical, geography, each needs its own pilot)** | **to 10,000** |

This matches the rollout plan: 7K defensible now, 10K hard cap, new expansion
dimensions each gated behind their own pilot.

---

## Wave schedule (extends Rollout Plan Phase 2)

The existing rollout plan's Phase 2a pilot (200 pages, 14-day gate) and Phase 2b
(scale to ~1,800) still hold. This expansion slots the 6 new clusters into that
machinery:

| Wave | Scope | Page count | Gate to advance |
|---|---|---|---|
| **Wave 0 (done)** | 4 built clusters, 17 seeded rows | ~17 live | format approval |
| **Wave 1 (this plan)** | All 10 clusters, ~100/cluster | ~1,000 | indexing >=60%, CTR >=0.7% @ 14 days; meeting + find-people prioritized |
| **Wave 2** | Tier-2 firm expansion (25 -> 60) across the 6 firm-role clusters | +1,440 | per-cluster 2a gate passes |
| **Wave 3** | Find-people school scale (5 -> 40 schools) | +2,300 | find-people cluster clears CTR gate |
| **Wave 4** | Depth: roles, ATS, find-companies anchors | +2,000 | aggregate domain impressions not dropping |
| **Wave 5** | Headroom (new dimensions, each piloted) | to 10K cap | Phase 3 scale gate (60-day data) |

Publish cadence stays **50-200 pages/week** (the SEO Heist defense). No
mass-dump. Each wave gets its own sitemap timestamp delta.

---

## Per-cluster kill / scale gates (from the strategy skill)

Applied per cluster, judged on the aggregate quality signal, not raw traffic
(the power law means most pages are quiet):

- **Kill the cluster** if at 90 days: >60% of its pages are dead weight (<5
  impressions, no clicks), OR average position >50 for primary keywords, OR
  crawled-not-indexed >25% at 30 days, OR domain-wide impressions drop >20%
  after the wave goes live.
- **Kill a single cell** if it hits 50+ impressions with <0.5% CTR over 14 days
  indexed (noindex + replace with a better angle).
- **Scale a cluster aggressively** when at 60 days it shows >=2% CTR and >=1%
  page-to-attributed-signup.
- **Meeting-prep starts with a scale presumption** given the proven 2.5-8% CTR;
  comparison starts capped given the proven 0.4% CTR failure of thin compare
  pages.

---

## Measurement (citations, not just clicks)

Per the strategy skill, track in this priority order:

1. **LLM citation share** for a 20-query priority set spanning the 8 widgets
   (e.g. "how do I find USC alumni at Goldman", "McKinsey case interview
   questions 2026", "companies that hire economics majors", "apollo alternative
   for students"). Weekly manual audit across ChatGPT, Claude, Perplexity,
   Google AI Mode now; add Otterly/Profound once 1,500+ pages are live.
2. **Branded search volume** ("offerloop") in GSC + Google Trends - the truest
   lagging indicator of organic momentum.
3. **GSC impressions** by cluster (with the AI Overviews segment filter).
4. **Trial starts attributed to organic** (PostHog UTM + landing-page filter,
   per Rollout Plan Phase 1b).
5. **Paid conversion from organic trials.**

CTR stays deprioritized as a pure signal (AI Overviews depress it), except as a
per-cell kill trigger.

---

## Brand-mention plan (the 3x AEO lever)

Brand mentions correlate ~3x more strongly with AI Overview inclusion than
backlinks. For each widget cluster there is a natural distribution surface:

- **Find people / meeting prep / cold email:** Wall Street Oasis, r/FinancialCareers,
  Mergers & Inquisitions guest posts, college papers (Daily Trojan, Daily Bruin,
  Michigan Daily, Daily Pennsylvanian).
- **Resume / cover letter / ATS:** r/csMajors, r/consulting, Career Cheat Code,
  Practical Recruiting newsletter.
- **Find companies / find jobs / Apollo comparison:** Hacker News (Show HN),
  IndieHackers, Lenny's Newsletter, the Startup Ideas Podcast (Isenberg).

Goal: 20 net-new plain-text brand mentions per quarter, >=5/month, spread across
types. Linked is great; unlinked still moves AEO.

---

## Build order (what to do first)

1. **Wire the 6 new clusters into the data layer** (`connect-grow-hire/src/seo/data/`)
   mirroring the existing 4: a `meeting-prep.ts`, `find-people.ts`,
   `find-hiring-manager.ts`, `find-companies.ts`, `find-jobs.ts`, and extend the
   comparison data. Each row carries the per-cell proprietary data named above.
2. **Build 6 new templates** in `connect-grow-hire/src/pages/seo-preview/templates/`
   mirroring the 4 existing, each embedding the matching widget with `source`
   set to the slug.
3. **Add the dynamic routes** in `App.tsx` (`/seo-preview/meeting-prep/:slug`, etc.).
4. **Seed Wave 1**: ~100 rows per cluster, prioritizing meeting-prep (proven) and
   find-people (defensible, replaces pruned pages). Pull real PDL counts and
   outbox response rates into `statStrip` so no two sibling rows share numbers.
5. **Add the ATS -> interview-prep cross-link module** and the
   `/ats/how-screening-works` pillar.
6. **Flip `noindex` off per cluster only after format approval**, register in the
   sitemap generator, stagger at 50-200/week, submit deltas to GSC.

The skills (`offerloop-seo-keywords`, `offerloop-seo-article`,
`offerloop-seo-strategy`) own the how; this doc owns the what and the order.
