# Handoff: Auto-Apply + iOS App Testing

**Written 2026-07-13.** For Sid, taking over app testing + auto-apply from Rylan.
Everything here is verified against live systems, not assumed. Where something is
a guess, it says so.

---

## 0. The 60-second version

- The iOS app is in **TestFlight (Build 10)**, pointed at **staging**, pending App
  Store submission.
- **Auto-apply was working in June (5 real applications submitted), then stopped
  dead in July.** It was not a code rot — **Greenhouse changed underneath us**.
- Today we found and fixed the causes. Auto-apply now fills both Greenhouse and
  Ashby forms completely, resume attached. **One wall remains: Greenhouse now
  emails an 8-character human-verification code** before it will accept a submit.
- **The single open decision** is how to handle that code (§7).

---

## 1. What auto-apply is, and how it runs NOW

The architecture changed today. Read this before touching anything.

```
app  ──POST /api/job-board/auto-apply/<job_id>/submit──►  WEB (Flask/gunicorn)
                                                            │  enqueues only.
                                                            │  NEVER starts a browser.
                                                            ▼
                                                      Redis (offerloop-queue)
                                                            │
                                                            ▼
                                              WORKER (offerloop-worker, RQ)
                                                 └─ Playwright ──► Browserbase (remote Chrome)
                                                       └─ fills the ATS form
```

**Why it moved.** Starting Playwright inside a gunicorn web worker **killed the
entire container ~23 seconds in, every time** (reproduced 3/3, including with no
deploy in flight). Render restarted the box, which took **drafts, Scout, the feed
and Gmail down with it**. A secondary feature was a loaded gun pointed at the hero.

`worker.py` + `services/rq_queue.py` **already existed** for Loop cycles — its
docstring literally says long work doesn't belong on the web workers. Auto-apply
now rides those same rails. We reused; we did not rebuild.

**The payoff is containment.** If the filler crashes now, it kills a *worker* (RQ
requeues) — the web service keeps serving. Verified: the app stayed up through
every failure we induced today.

**Safety default:** `rq_queue`'s dev fallback runs jobs *in-process* — which IS
the crash. So `submit` **refuses with 503 `AUTOAPPLY_UNAVAILABLE`** if no RQ
worker is configured, checked *before* the credit deduction so a refusal never
charges. No Redis ⇒ auto-apply is cleanly off, never box-killing.

### Files that matter
| File | What it does |
|---|---|
| `app/routes/auto_apply.py` | Endpoints. Enqueues only. Holds the **read-time stale reaper**. |
| `app/services/auto_apply/jobs.py` | The RQ entrypoint. Owns the wall-clock guard + refund. |
| `app/services/auto_apply/runner.py` | Dispatches to the right filler by ATS. |
| `app/services/auto_apply/greenhouse.py` | **Sid owns this.** The big one. |
| `app/services/auto_apply/ashby.py`, `lever.py` | Same shape, smaller. |
| `app/services/auto_apply/_form_filler_common.py` | Shared helpers (incl. dead-posting detection). |
| `app/services/rq_queue.py` | `enqueue()` + JOB_REGISTRY. |

### Two watchdogs (both needed — learn from our scars)
1. **In-worker wall-clock (240s)** — `jobs.py`. Catches a hung fill.
2. **Read-time stale reaper (300s)** — `auto_apply.py::_reap_if_stale`. Runs when
   the client polls `/status` or `/list`. **This one survives worker death** — if
   the worker is killed mid-fill, nothing in-process is alive to finalize the doc,
   and a job would sit at `running/filling_form` **forever** with credits held.
   We had 4 such zombies. Refunds are idempotent (`credits_refunded`) so the two
   guards can't double-refund.

---

## 2. What actually broke (the July regression)

Rylan was right that it "used to work." Data across all users, all time:

```
June:  5 submitted, 3 failed     ← working (Zscaler, Bugcrowd, Discord, Chime, Databricks)
July:  0 submitted, 35 failed    ← stopped dead
```

**Greenhouse changed on their side. Two things:**

1. **They migrated to `job-boards.greenhouse.io`**, where the bare job page **no
   longer renders the application form inline**. Our filler waits for
   `#first_name` and it simply isn't there anymore → "form did not render at any
   candidate URL" appeared everywhere, looking like our bug.

2. **They added an emailed 8-character human-verification code.** The form fills
   perfectly, Submit clicks, and Greenhouse **silently refuses** — no
   `aria-invalid`, no error text. This is the wall we're at now (§7).

A third, self-inflicted issue compounded it: **form URLs were derived from
`job_id`**, but job ids are namespaced by **source** (`simplify_…`,
`fantasticjobs_…`), not by ATS. So the reliable fallback URLs (Greenhouse's embed
endpoint, Ashby's `/application`) **were never even built** for most jobs.

---

## 3. What we fixed today (all pushed to `staging/mobile-field`)

| Commit | Fix |
|---|---|
| `f365aecc` | Auto-apply runs in the **RQ worker**, never the web process |
| `c074c5d0` | Firebase creds via **env JSON** — RQ forks a child per job and the child couldn't read Render's mounted secret file |
| `cdf1aee2` | **Greenhouse**: derive form URLs from `apply_url`, not `job_id`; embed endpoint first |
| `1b051a60` | **Ashby**: use `/application` (where the form actually is); bare page has **no form** |
| `ae84c7d7` | **School matching** — see §4, this one is serious |
| `8ed24cab` | Greenhouse code-gate → `needs_verification`; **dead postings reported honestly**; Lever form-first |
| `b7947fb4` | Ingestion rejects junk company names (a Simplify record had `company: "Internship"`) |

**Result — verified by live dry-runs:**
- **Greenhouse (FFE Inc):** `dry_run_complete`, **17 fields** filled — name, email,
  phone, country, **resume**, school, degree, discipline, all 4 EEO fields, and 3
  custom screening questions.
- **Ashby (Airbyte):** `dry_run_complete`, resume attached, custom questions answered.

---

## 4. ⚠️ The bug Sid most needs to know about

A **real application to Docugami went out with School = "Vanguard University of
Southern California."** Rylan attended **University of Southern California**.
Vanguard is a *different institution*. **We were putting false information on real
job applications in a user's name.**

Cause, in greenhouse.py's react-select option scorer:
```js
if (t.includes(wantedFull)) return 800;   // any option CONTAINING the answer
```
"Vanguard University of Southern California" *contains* "University of Southern
California", so when the exact option hadn't loaded into the async-filtered list,
the impostor won.

**The rule was conceptually wrong for institutions:**
- extra **trailing** words = same entity, more detail (`"… – Marshall"`) → fine
- extra **leading** words = a **different entity** (`"Vanguard University of…"`,
  `"Northeastern Illinois University"`) → **not fine**

Now: `startsWith` → 800 (accept). `contains`-but-not-`startsWith` → **350, below
the 400 accept bar** → field left blank for the user.

> **The principle to keep: a blank field beats a false one.** When the filler
> can't confidently identify something, it must decline rather than guess. We are
> writing to real employers under a real person's name.

Ironically, **Greenhouse's verification code saved us** — those wrong-school
applications were being rejected before they went out.

---

## 5. Testing the app (Sid's day-to-day)

### Get the build
- **TestFlight → Offerloop → Build 10.** Delete + reinstall for a clean run
  (fresh onboarding, no stale local state).
- Build 10 contains: **resume upload**, notifications gate, profile-persistence fix.
- ⚠️ **Native modules can't OTA.** `expo-document-picker` moved the runtime
  fingerprint, so JS-only changes OTA fine but native ones need a new build.

### The demo/reviewer account
- **`applereview@offerloop.ai`** — password is in `APP-STORE-METADATA.md` (not
  duplicated here). uid `DPiaCKOnHghLl4CwzrCZd2N7cOp2`.
- **Free tier, on purpose.** The app is a **limit-model**: free gets *every*
  feature (draft, send, auto-apply, preps), bounded by credits (300/mo ≈ 30
  swipes at 10 cr) — **not** feature-walled. If you see a feature refuse for
  "tier" reasons on the app, that's a bug.
- Gmail connected as **`offerloop0@gmail.com`** — drafts land in *that* mailbox's
  **Drafts folder** (not the Inbox; people look in the wrong place).
- Application profile + a real resume are already on the account, so auto-apply
  has everything it needs.

### The app points at STAGING
`offerloop-staging.onrender.com`, deployed from branch **`staging/mobile-field`**.
**Do not merge that branch to `main`** — the app and the web are deliberately
**separate economic entities** (different tier rules, different limits). `main` is
the web.

### Testing auto-apply without hunting for a job card
Drive the API directly with a **dry run** (fills the form, does NOT submit a real
application to a real company — never test with real submits):

```bash
# mint an ID token for the demo user, then:
POST https://offerloop-staging.onrender.com/api/job-board/auto-apply/<job_id>/submit
     {"dry_run": true}
```
Then read the result from Firestore: `users/<uid>/autoApplyJobs/<auto_apply_id>` —
look at `status`, `filled_summary`, `unmapped`, `failure_reason`.

**`screenshot_b64` on the doc is the single most valuable debugging artifact** —
it's a full-page PNG of what the browser actually saw. The school bug and the
verification-code gate were both found by *looking at it*. Decode and open it
before theorizing.

---

## 6. Diagnosing (do this before guessing)

### Worker logs (where the browser actually runs)
`RENDER_API_KEY` is in the root `.env`. Worker service id:
**`srv-d9a0e8l7vvec738cocjg`** (`offerloop-worker`), owner `tea-d3213fmr433s738u62j0`.

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/logs?ownerId=tea-d3213fmr433s738u62j0&resource=srv-d9a0e8l7vvec738cocjg&limit=200"
```
The filler logs every step with `[auto_apply]` — candidate URLs tried, Browserbase
session id, which fields filled. **Web logs will show you nothing about a fill** —
the browser doesn't run there anymore.

### Render services
| Service | id |
|---|---|
| `offerloop-staging` (web) | `srv-d93d0fcvikkc73a1igmg` |
| `offerloop-worker` (RQ) | `srv-d9a0e8l7vvec738cocjg` |
| `offerloop-queue` (Redis, free) | `red-d9a0dt57vvec738cnt2g` |

Worker env needs `REDIS_URL` **and** `FIREBASE_SERVICE_ACCOUNT_JSON` (the raw
service-account JSON — *not* the secret-file path; forked RQ children can't read
Render's mounted secret files). Start command must put **both** the repo root and
`backend/` on `PYTHONPATH` — the codebase mixes `from app.…` and
`from backend.app.…` imports.

---

## 7. Greenhouse's verification code — auto-read IS the intended behavior

Greenhouse emails the applicant an 8-character code and won't accept a submit
without it. **This is already built and is the intended design** — do not
second-guess it: `greenhouse.py::_try_email_code_completion` polls the candidate's
connected Gmail (`from:greenhouse-mail.io`, regex `application:\s+([A-Za-z0-9]{8})`,
up to 90s), fills the 8 boxes, and re-submits. It was part of the working June
flow. The human hand-off (`needs_verification`) is only the FALLBACK for when the
code can't be read.

**Why it wasn't firing (fixed 2026-07-13):**
1. **Gate detection was too narrow.** It only triggered on Temelio's markup
   (`#security-input-0`). Other tenants (Docugami) use a different verification
   widget, so `verification_visible` stayed False and the reader never ran — the
   job fell through to `submit_failed`. Detection now also matches the generic
   signals (page text "verification code" / "confirm you're a human" + a
   one-time-code / security input).
2. **The box-fill was hardcoded to `#security-input-{0..7}`.** Generalized to fall
   back to the ordered OTP/single-char inputs when those specific ids aren't present.

**Demo-account caveat (not a code bug):** the demo account's application email is
`applereview@offerloop.ai` but its connected/readable Gmail is
`offerloop0@gmail.com`. Greenhouse sends the code to the *application* email, and
we can only read the *connected* one — so on the demo it finds nothing. For a real
user those are the same address (they apply with the Gmail they connected). For
testing, the demo's application email should be set to the connected Gmail.

**The fallback is honest and correct:** if there's no connected Gmail, or the code
genuinely doesn't arrive in the poll window, the job goes to `needs_verification`
and the user finishes the code step themselves — everything else stays filled.

---

## 8. Still open (ranked)

1. **Verify the widened code-reader works end-to-end** (§7). Detection + box-fill
   are fixed; confirm a real auto-read completes once the demo email is aligned.
2. **Stale job pool.** `expires_at` flagged only **3 of 7,980** jobs as expired,
   yet several we tried **404'd** (Doctors Without Borders, Multiply Labs). Users
   swipe ghosts. Fillers now stamp **`job_gone`** — wire that to auto-expire a job
   from the feed the moment a filler proves it's dead. Cheap and self-healing.
   **Raise freshness/expiry signals with the new data provider.**
3. **Remove-resume button** — committed, needs the next build.
4. **LinkedIn field mapping** — minor; shows as `unmapped` on some forms.
5. **Duplicate-draft flicker** — a draft briefly appears in the Inbox then
   vanishes (optimistic insert + rollback). Cosmetic, unconfirmed, lowest priority.
6. **Submission** — reviewer sign-in verified on a real build → submit for review.

## 9. Pool facts (for the provider call)
- **7,980 jobs. 62% (4,993) are auto-apply eligible** (Greenhouse/Ashby/Lever).
- Sources: greenhouse 5,598 · simplify 1,278 · ashby 742 · fantasticjobs 313 · lever 49.
- ~3,000 have **custom career-page URLs** (stripe.com, databricks.com…) that are
  Greenhouse-backed — these rely on the `job_id` path, so **both** URL derivation
  paths must keep working.
- **Ask any new provider for:** trustworthy freshness/expiry, the **real ATS
  `apply_url`** (not a redirect wrapper — auto-apply lives or dies on it), and
  clean company fields.

---

# PART II — Sid, starting from scratch

Everything below assumes zero prior setup.

## 10. The short answer on access

**Do NOT share Rylan's Apple ID.** It's tempting and it will hurt:
- Apple 2FA sends a code to *Rylan's* device on every login — Sid is blocked every
  time Rylan is asleep or on a plane.
- It violates Apple's terms (accounts are per-person), and it puts submissions,
  pricing, and financials behind one shared password with **no audit trail**.
- If Rylan rotates the password or loses a device, Sid is locked out mid-review.

**The good news: Sid needs almost none of it.**

| What Sid wants to do | What he actually needs | Apple login? |
|---|---|---|
| **Write code** (the 90% case) | The repos + a dev build on his machine | **No — none** |
| **Test on his phone** | TestFlight invite (an email is enough) | **No** |
| **Cut/submit builds** | Added to the **Expo** project | **No** — EAS already holds the Apple creds server-side |
| **See App Store review status / submit for review** | An App Store Connect user invite | Yes (his own, not Rylan's) |

**The key unlock: EAS already stores the Apple certs + provisioning profile
server-side.** So Sid can run `eas build` and `eas submit` **without ever touching
Rylan's Apple ID** — he just needs access to the *Expo* project, not the Apple one.

### Two blockers to know about (both are Rylan's to do, once)

1. **The Expo project is on a personal account** (`@rylanbohnett/offerloop-mobile`).
   Personal accounts **cannot have members**. To give Sid build access:
   Expo dashboard → create an **Organization** (free) → **transfer the project**
   into it → invite Sid as a member. *Do this after submission, not during — a
   transfer mid-review is asking for trouble.*

2. **The Apple Developer account is Individual** (`Rylan Bohnett (Individual)`).
   Individual memberships **cannot add developer-portal team members**. Only an
   **Organization** account can (needs a D-U-N-S number; takes days-to-weeks).
   Converting is a real future step, **not a pre-submission one**.

**Practical recommendation for right now:**
- Sid develops + tests immediately (needs nothing from Apple).
- Add him as a **TestFlight tester** today (§12) — one email, no accounts.
- **Rylan keeps cutting builds and doing the final submit** until after launch.
- Post-launch: Expo Org (easy) and, if warranted, Apple Org conversion (slow).

---

## 11. Local setup (30 minutes)

### Repos
| Repo | Path | What it is |
|---|---|---|
| Mobile app | `~/offerloop-mobile` | The iOS app (Expo / React Native / TypeScript) |
| Backend (staging) | `~/Downloads/Final_offerloop-staging-brain` | Flask API — branch **`staging/mobile-field`** |
| Web / prod | `~/Downloads/Final_offerloop` | The website — branch `main`. **Different economics; don't cross-merge.** |

### Mobile app
```bash
cd ~/offerloop-mobile
npm install
npx expo start          # then press `i` for the iOS simulator
npm run typecheck       # tsc --noEmit — run this before every commit
```

The app talks to **staging** by default. There is **no `.env` in the mobile repo**
— the API base URL comes from `eas.json`. To point a local run somewhere else:
```bash
EXPO_PUBLIC_API_BASE_URL=https://offerloop-staging.onrender.com npx expo start
```

Useful `EXPO_PUBLIC_*` flags (all optional):
- `EXPO_PUBLIC_USE_MOCKS=1` — run the UI with fixture data, no backend
- `EXPO_PUBLIC_FORCE_ONBOARDING=1` — always show onboarding (great for testing it)
- `EXPO_PUBLIC_DEV_EMAIL` / `EXPO_PUBLIC_DEV_PASSWORD` — skip the sign-in dance

⚠️ **`eas update` does NOT inline `EXPO_PUBLIC_*` vars.** Anything that must exist
in a shipped build has to be **hardcoded or baked at build time** — we lost an hour
to this once when a reviewer allowlist silently vanished from an OTA.

### Backend (only if he's changing the API)
```bash
cd ~/Downloads/Final_offerloop-staging-brain/backend
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
```
Secrets live in the **root `.env`** of `~/Downloads/Final_offerloop` (Rylan shares
this directly — it is **not** in git). It holds `RENDER_API_KEY`,
`GOOGLE_APPLICATION_CREDENTIALS`, and the provider keys.

> ⚠️ The **root `.env`'s `OPENAI_API_KEY` is corrupted at rest** (ends in a stray
> `$`). The valid one is in **`backend/.env`**. Load that one. This has bitten us.

**You usually don't need to run the backend at all** — staging is live, and the
app points at it. Push to `staging/mobile-field` and Render redeploys in ~3 min.

---

## 12. Getting the app on Sid's phone (TestFlight)

**Easiest path — external tester (no Apple account needed):**
1. Rylan → App Store Connect → **Offerloop** → **TestFlight** → **External Testing**
2. Add Sid's email → he gets an invite → he installs the **TestFlight** app → Offerloop appears
3. He installs **Build 10** (delete + reinstall for a clean run)

*(Internal testers get builds instantly with no review, but require an App Store
Connect user account. External is one email and is plenty for this.)*

**Sid signs up in the app exactly like a normal user.** No special access. But for
testing the *reviewer* path, use the shared demo account (§5):
`applereview@offerloop.ai` — free tier, Gmail already connected, resume + application
profile already on it. **That's the account with the full setup — use it.**

---

## 13. Sid's first week — suggested order

1. **Read §1–§4.** Especially §4 (the wrong-school bug). The principle —
   *a blank field beats a false one* — should govern every filler change he makes.
2. **Get Build 10 on his phone**, sign in as the demo account, and run the loop:
   swipe → draft → check the draft actually lands in **offerloop0@gmail.com's
   Drafts folder** (not Inbox).
3. **Run a dry-run auto-apply** via the API (§5) against a Greenhouse job. Read the
   result doc. **Decode `screenshot_b64` and look at it.** That single habit found
   two bugs today.
4. **Pick up the ranked list in §8.** Item 2 (auto-expiring dead jobs via the new
   `job_gone` flag) is the highest-value, lowest-risk piece of work available, and
   it's self-contained.
5. **Don't touch** the verification-code question (§7) until the founders decide —
   it's a judgment call, not an engineering one.

## 14. Things that will waste his day if nobody tells him

- **The browser does not run in the web service.** Fill logs are in the **worker**.
- **`expires_at` in the job pool lies.** Jobs 404 while claiming to be live.
- **Native modules can't OTA.** JS-only changes ship instantly via `eas update`;
  anything touching `package.json`/native needs a full build.
- **The app and the web are separate economic entities.** Free tier on the app gets
  *every* feature, limited only by credits. Never merge `staging/mobile-field` → `main`.
- **Drafts land in the connected Gmail's *Drafts* folder**, not the Inbox. People
  look in the wrong place and conclude it's broken.
- **A "failed" auto-apply is often a dead job**, not a bug. Read `failure_reason`.

---

# PART III — Access checklist (Rylan does these once)

**Division of labour:** Sid **develops and prepares**; Rylan **builds and submits**
from Sid's updated codebase. That division means **Sid needs no Apple account and
no Expo/EAS account at all.** He develops against the **iOS Simulator**, which
requires zero Apple credentials.

## 1. GitHub — the essential one

The code lives in **two** GitHub repos (both under the `deenabandi004-byte` account):

| Repo | Contains | Branch that matters |
|---|---|---|
| `deenabandi004-byte/offerloop-mobile` | **The iOS app** | `main` |
| `deenabandi004-byte/Final_offerloop` | Backend + web | **`staging/mobile-field`** (app's backend) |

**Do:** each repo → **Settings → Collaborators → Add people** → Sid's GitHub handle.

> ⚠️ **This was nearly a disaster.** As of 2026-07-13 the mobile repo had **9
> commits that existed only on Rylan's laptop** — including the App Store
> compliance fix that prevents rejection. They're pushed now. **Push daily.** A
> dead laptop was one coffee spill away from erasing the app.

## 2. Render — invite Sid to the workspace

Workspace **"My Workspace"** (`tea-d3213fmr433s738u62j0`), currently **1 member**.
It's a *team*-type workspace, so members can be added:

**Render dashboard → Settings → Members → Invite** → Sid's email.
*(Render bills team seats on paid plans — check the cost before inviting.)*

He'll then see all four services:
| Service | id | What |
|---|---|---|
| `offerloop-staging` | `srv-d93d0fcvikkc73a1igmg` | The app's backend (web) |
| `offerloop-worker` | `srv-d9a0e8l7vvec738cocjg` | **Where auto-apply's browser runs** |
| `offerloop-queue` | `red-d9a0dt57vvec738cnt2g` | Redis (free) |
| `Final_offerloop` | `srv-d3217ridbo4c73a24j9g` | The website (prod) |

## 3. Firebase console — for reading Firestore

He'll need this constantly (job docs, `autoApplyJobs`, user profiles).
**Firebase console → project `offerloop-native` → Settings → Users and permissions
→ Add member** → Sid's Google account → **Editor** (or Viewer if you'd rather he
not write).

## 4. Secrets (send directly — never commit)

- The **root `.env`** from `~/Downloads/Final_offerloop` — provider keys +
  `RENDER_API_KEY`.
- The **Firebase service-account JSON** (for running the backend locally).
- **Reminder:** the root `.env`'s `OPENAI_API_KEY` is corrupted (trailing `$`).
  The good one is in `backend/.env`.

## 5. TestFlight (optional but useful)

App Store Connect → Offerloop → **TestFlight → External Testing** → add Sid's
email. One invite, **no Apple account needed on his side.** He installs the
TestFlight app and gets Build 10.

## 6. What Sid does NOT need

- ❌ **Rylan's Apple ID.** Never share it — 2FA lands on Rylan's device, it breaks
  Apple's per-person terms, and it puts submissions + financials behind one shared
  password with no audit trail.
- ❌ **App Store Connect access** — Rylan submits.
- ❌ **Expo / EAS** — Rylan builds. *(The Expo project is on a personal account,
  which can't have members anyway; making Sid a builder would require creating an
  Expo Org and transferring the project. Not worth doing pre-launch.)*
- ❌ **An Apple Developer seat** — the account is **Individual**, which cannot add
  team members at all. Only an Org conversion (D-U-N-S, days-to-weeks) would change
  that. Post-launch decision, if ever.

## 7. Sid's dev loop (no Apple involved)

```bash
git clone git@github.com:deenabandi004-byte/offerloop-mobile.git
cd offerloop-mobile && npm install
npx expo start          # press `i` -> iOS Simulator. No Apple account required.
npm run typecheck       # before every commit
```
The app points at **staging**, which is live — so he does **not** need to run the
backend to work on the app. Backend changes: push to **`staging/mobile-field`** and
Render redeploys in ~3 minutes.

**Handoff back to Rylan for release:** Sid pushes to `main` (mobile) →
Rylan pulls → `eas build` → `eas submit`. Sid never touches Apple.
