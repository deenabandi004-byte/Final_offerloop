# CLAUDE.md

Project briefing for developers and AI assistants working in this repository.

## What This Is

Offerloop is a SaaS platform for college students to find professional contacts, generate outreach emails, and prepare for networking conversations. Target market: students breaking into consulting, investment banking, and tech.

**Three independent codebases** share this repo but have no build-time dependencies:

| Project | Stack | Dev port | Entry point |
|---------|-------|----------|-------------|
| `backend/` | Flask 3.0 + Gunicorn | 5001 | `backend/wsgi.py` |
| `connect-grow-hire/` | React 18 + Vite + TypeScript | 8080 | `connect-grow-hire/src/App.tsx` |
| `chrome-extension/` | Vanilla JS, Manifest V3 | n/a | `chrome-extension/manifest.json` |

**Deployed as one service on Render.** Gunicorn serves the Flask API and the Vite-built SPA from the same process. No Docker, no `render.yaml` -- config lives in the Render dashboard.

## Quick Start

```bash
# Backend
cd backend && pip install -r requirements.txt
python3 wsgi.py                                  # http://localhost:5001

# Frontend (separate terminal)
cd connect-grow-hire && npm install
npm run dev                                      # http://localhost:8080

# Tests (backend only, no frontend tests exist)
cd backend && pytest tests/                      # all tests
cd backend && pytest tests/ -k "test_name"       # one test
cd backend && pytest tests/ -m unit              # by marker: unit, integration, slow

# Production
gunicorn backend.wsgi:app --bind 0.0.0.0:5001 --workers 4
```

## Architecture at a Glance

```
Browser ──► React SPA (Vite build in connect-grow-hire/dist/)
              │
              │ Authorization: Bearer <firebase-id-token>
              ▼
           Flask API (/api/*)  ──► Firestore (offerloop-native)
              │                ──► OpenAI / Anthropic (AI generation)
              │                ──► People Data Labs (contact search)
              │                ──► Hunter.io (email verification)
              │                ──► Gmail API (drafts, thread sync, webhooks)
              │                ──► Stripe (subscriptions)
              │                ──► SerpAPI (job search, firm discovery)
              │                ──► Prerender.io (bot/crawler SSR)
              ▼
           Static files (/, /assets/*, /sitemap.xml, /robots.txt, /llms.txt)
           SPA fallback (404 → index.html for non-/api/ routes)

Chrome Extension ──► same Flask API at https://final-offerloop.onrender.com
```

**Canonical domain**: `https://offerloop.ai` (non-www). Prerender.io middleware in `wsgi.py` intercepts 40+ bot user agents and proxies to Prerender for SSR.

## Database & Data Model

**Primary database**: Firestore (project `offerloop-native`). No SQL database for application data.

**User document** (`users/{uid}`):
- Profile: `email`, `name`, `professionalInfo`, `needsOnboarding`
- Billing: `subscriptionTier` (source of truth), `tier` (legacy fallback), `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`
- Credits: `credits`, `maxCredits`, `lastCreditReset`
- Usage counters: `alumniSearchesUsed`, `coffeeChatPrepsUsed`, `interviewPrepsUsed`

**Subcollections** under `users/{uid}/`:
- `contacts/` -- saved contacts with pipeline stages and Gmail tracking fields
- `integrations/gmail` -- OAuth tokens, watch expiration
- `calendar_events/` -- scheduled meetings
- `recruiters/` -- hiring manager tracker
- `scoutConversations/` -- Scout AI chat history
- `coffee-chat-preps/`, `interview-preps/` -- generated prep documents
- `resume_library/`, `resume_scores/`, `cover_letter_library/`
- `notifications/`, `activity/`, `searchHistory/`, `firmSearches/`, `exports/`, `goals/`

**Legacy**: `contacts.db` (SQLite) at repo root powers the contact directory feature (`backend/app/routes/contacts.py`, `ContactDirectory.tsx`). It's gitignored but must exist in production.

**Security rules** (`firestore.rules`): User-scoped access only. Clients cannot write `tier`, `subscriptionTier`, `stripeSubscriptionId`, `stripeCustomerId`, or `maxCredits`. Pro/Elite features gated by tier check in rules.

**Storage rules** (`storage.rules`): Resumes at `/resumes/{uid}/**`, max 10MB, PDF/images/DOC/DOCX only.

## Auth System

**Firebase Authentication** with Google OAuth:

1. Frontend: `signInWithPopup(GoogleAuthProvider)` via Firebase SDK
2. Firebase ID token stored in `FirebaseAuthContext`, sent as `Authorization: Bearer <token>` on every API call
3. Backend: `@require_firebase_auth` decorator (in `extensions.py`) verifies token with 3 retries + exponential backoff, sets `request.firebase_user`
4. `@require_tier(['pro', 'elite'])` fetches tier from Firestore (never trusts the client), sets `request.user_tier`

**Decorator order matters**: `@require_tier` must appear before `@require_firebase_auth` in source code (decorators execute inside-out).

```python
# Correct:
@require_tier(['pro', 'elite'])
@require_firebase_auth
def premium_endpoint():
    uid = request.firebase_user['uid']
    tier = request.user_tier
```

**Gmail OAuth** is a separate 3-legged flow (`backend/app/routes/gmail_oauth.py`). Credentials stored per-user in Firestore at `users/{uid}/integrations/gmail`. Legacy routes `/api/gmail/*` forward to `/api/google/*`.

**Chrome extension auth**: Google OAuth2 via Chrome identity API → token exchanged with backend at `/api/auth/google-extension` → Firebase token stored in `chrome.storage.local`.

**Route guards** (frontend):
- `ProtectedRoute`: requires auth + completed onboarding, else redirects to `/signin` or `/onboarding`
- `PublicRoute`: redirects authenticated users to `/find`
- Special: `?signedOut=true` param prevents redirect loop on sign-out

## Tier & Credit System

Three tiers in `backend/app/config.py` (frontend mirror in `connect-grow-hire/src/lib/constants.ts` -- keep in sync):

| | Free | Pro ($14.99/mo) | Elite ($34.99/mo) |
|---|---|---|---|
| Credits/month | 300 | 1500 | 3000 |
| Contacts/search | 3 | 8 | 15 |
| Resume tools | No | Yes | Yes |
| Firm search | No | Yes | Yes |
| Coffee chat preps | 3 lifetime | 10/mo | Unlimited |
| Interview preps | 2 lifetime | 5/mo | Unlimited |
| Bulk drafting, export, smart filters | No | Yes | Yes |

**Credit costs**: Coffee chat = 15, Interview prep = 25, Scout = 5.

Credits reset at calendar month boundary (not billing cycle). Atomic Firestore deduction prevents double-spend. Free tier has lifetime limits on some features; Pro/Elite reset monthly.

**Stripe Price IDs**: Pro = `price_1ScLXrERY2WrVHp1bYgdMAu4`, Elite = `price_1ScLcfERY2WrVHp1c5rcONJ3`. 30-day free trial.

## Backend Structure

**`backend/wsgi.py`** is the only entry point. `app/__init__.py` is a package marker only.

`wsgi.py` does four things:
1. Registers 32 Flask blueprints (all under `/api/`)
2. Sets up Prerender.io middleware (`@app.before_request`)
3. Serves static files from `connect-grow-hire/dist/` with SPA fallback
4. Starts Gmail watch renewal daemon thread (runs every 6 days)

### Blueprint registration (32 blueprints)

All registered in `create_app()`. Key prefixes:

| Blueprint | Prefix | Purpose |
|-----------|--------|---------|
| `health_bp` | `/` | `/ping`, `/health`, `/healthz` |
| `gmail_oauth_bp` | `/api/google` | Gmail OAuth start/callback |
| `emails_bp` | `/api/emails` | Email generation and drafts |
| `contacts_bp` | `/api/contacts` | Contact CRUD |
| `linkedin_import_bp` | `/api/contacts` | LinkedIn import (registered before contacts_bp) |
| `runs_bp` | varies | Contact search runs |
| `enrichment_bp` | `/api` | Data enrichment |
| `resume_bp` | `/api` | Resume upload/parse |
| `coffee_chat_bp` | `/api/coffee-chat-prep` | Coffee chat generation |
| `interview_prep_bp` | `/api/interview-prep` | Interview prep generation |
| `billing_bp` | `/api` | Stripe checkout, webhooks, tier info |
| `users_bp` | `/api/users` | User profile |
| `outbox_bp` | `/api/outbox` | Email pipeline tracking |
| `scout_bp` | `/api/scout` | AI job search assistant |
| `firm_search_bp` | `/api/firm-search` | Company search |
| `job_board_bp` | `/api/job-board` | Job listings |
| `resume_workshop_bp` | varies | Resume optimization |
| `cover_letter_workshop_bp` | `/api/cover-letter` | Cover letter generation |
| `auth_extension_bp` | `/api/auth` | Chrome extension auth |
| `email_template_bp` | `/api/email-template` | Saved email templates |
| `admin_bp` | `/api/admin` | Admin functions |
| `gmail_webhook_bp` | `/api/gmail` | Gmail push notifications |

**New blueprints must be registered in `wsgi.py`**. Debug with `LIST_ROUTES=1 python wsgi.py`.

### Code organization

- **Routes** (`app/routes/`): Thin Flask blueprints. Validate input, call services, return JSON.
- **Services** (`app/services/`): All business logic. Function-based modules, not classes. Key files:
  - `openai_client.py` -- OpenAI (primary) and Anthropic (fallback) client init
  - `pdl_client.py` -- People Data Labs contact search with ~50 metro area mappings
  - `hunter.py` -- Email finder/verifier via Hunter.io
  - `gmail_client.py` -- Gmail OAuth, credential management, watch renewal, email ops
  - `stripe_client.py` -- Subscription management
  - `coffee_chat.py` -- AI coffee chat research and PDF generation
  - `scout_service.py` -- Conversational AI search
  - `resume_parser.py` / `resume_parser_v2.py` -- Resume parsing
  - `resume_optimizer_v2.py` -- AI resume optimization
  - `ats_scorer.py` -- ATS compatibility scoring
  - `pdf_builder.py` -- PDF generation (ReportLab/WeasyPrint)
- **Models** (`app/models/`): `users.py`, `contact.py`, `coffee_chat_prep.py`, `enums.py`
- **Utils** (`app/utils/`):
  - `exceptions.py` -- `OfferloopException` base, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `InsufficientCreditsError`, `ExternalAPIError`, `RateLimitError`. All have `.to_response()`.
  - `validation.py` -- Pydantic schemas (`ContactSearchRequest`, `FirmSearchRequest`, etc.)
  - `retry.py` -- `retry_with_backoff()` for external API calls
  - `firestore_limiter.py` -- Firestore-backed rate limiter storage

### Patterns

```python
# Standard route pattern
@bp.route('/api/something', methods=['POST'])
@require_firebase_auth
def do_something():
    uid = request.firebase_user['uid']
    db = get_db()
    data = request.get_json()
    # validate with Pydantic, call service, return jsonify(result)
```

- `get_db()` from `extensions.py` returns the Firestore client
- Coffee chat prep runs in a background thread (`concurrent.futures`), returns job ID for polling
- Rate limiting: 2000/day, 500/hour per user (ID if authed, else IP). Static assets and coffee chat status polling exempted.
- CORS: `offerloop.ai`, `www.offerloop.ai`, plus `CORS_ORIGINS` env var. Localhost origins in dev.

### Testing

Backend only. pytest with `conftest.py` providing: `mock_firebase_user`, `mock_db`, `app`, `client`, `authenticated_request`. Set `FLASK_ENV=testing`. Markers: `unit`, `integration`, `slow`.

## Frontend Structure

### Key files

| File | What it does |
|------|-------------|
| `src/App.tsx` | All routes, context providers, lazy loading, Cmd+K shortcut for Scout |
| `src/contexts/FirebaseAuthContext.tsx` | Auth state, user profile, tier, credits, onboarding |
| `src/contexts/ScoutContext.tsx` | AI assistant sidebar state |
| `src/services/api.ts` | All backend API calls (~2000 lines) |
| `src/services/firebaseApi.ts` | Direct Firestore reads/writes (contacts, calendar, user) |
| `src/lib/constants.ts` | Tier configs, credit costs, feature limits |
| `src/lib/firebase.ts` | Firebase SDK init (hardcoded fallbacks for dev) |
| `src/lib/utils.ts` | `cn()` helper (clsx + tailwind-merge) |

### Routing

**Public pages**: `/`, `/signin`, `/blog`, `/blog/:slug`, `/about`, `/privacy`, `/terms-of-service`, `/compare/*`, plus SEO template routes (`/networking/:slug`, `/alumni/:slug`, `/cold-email/:slug`, etc.)

**Protected pages** (require auth + onboarding):
- `/find` -- Main search hub (tabs: People, Companies, Hiring Managers). This is where authenticated users land.
- `/tracker` -- Network pipeline (Kanban-style buckets: Needs Attention, Active, Done)
- `/coffee-chat-prep`, `/interview-prep` -- AI generation with stepped progress bars
- `/job-board` -- Job listings with resume matching
- `/contact-directory` -- Saved contacts
- `/write/resume`, `/write/cover-letter` -- Resume and cover letter builders
- `/application-lab` -- Application tracking
- `/account-settings` -- Profile, subscription, resume upload
- `/onboarding` -- Multi-step first-time setup (profile, academics, location, resume)

**Redirects**: `/dashboard` `/home` `/contact-search` all go to `/find`. `/outbox` goes to `/tracker`. `/scout` opens Scout panel then redirects to `/find`.

### Component patterns

- **UI primitives**: shadcn/ui in `src/components/ui/` (60+ files). Built on Radix, styled with Tailwind + CVA. Use `cn()` for class merging.
- **Layout**: `SidebarProvider` > `AppSidebar` + `MainContentWrapper` > `AppHeader` + content
- **Feature gates**: `FeatureGate` component checks tier. `UpgradeModal` shows upgrade path. `LockedFeatureOverlay` for paywall.
- **Demo placeholders**: `src/components/demo/` -- preview components for unauthenticated users
- **Loading**: `LoadingSkeleton` for content, `SteppedLoadingBar` for multi-step processes

### State management

- **React Query** for server state. Config: 5min stale, 10min cache, no refetch on window focus, 1 retry.
- **Context API** for auth (`FirebaseAuthContext`), Scout panel (`ScoutContext`), product tours (`TourContext`)
- **No Redux, no Zustand.**

### Key hooks

- `useSubscription()` -- tier, credits, usage counts. Refetches every 30s.
- `useFeatureGate(feature)` -- checks tier access, server-side verified
- `useNotifications()` -- real-time Firestore listener for outbox reply notifications
- `useScoutChat()` -- Scout AI assistant interaction

### Build configuration

**Vite chunk splitting** (`vite.config.ts`): `vendor-react`, `vendor-firebase`, `vendor-utils`, `vendor-animations`, `vendor-dates`, `vendor-stripe`.

**Any new React-dependent npm package must be added to the `vendor-react` chunk** in `vite.config.ts` or you'll get "Cannot access before initialization" errors at runtime.

TypeScript strict mode is on: `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`.

Path alias: `@` maps to `./src`.

## Chrome Extension

**Manifest V3**, version 1.0.9. Permissions: storage, activeTab, contextMenus, notifications, identity, downloads.

**Three layers**:
1. `background.js` -- Service worker. Handles OAuth2 token exchange, auto-refresh on 401, message passing. API base: `https://final-offerloop.onrender.com`.
2. `content.js` (~3800 lines) -- Injects buttons on LinkedIn profiles, scrapes profile/job data. Supports 8 job boards (Greenhouse, Lever, Workday, Indeed, Handshake, Glassdoor, ZipRecruiter, Wellfound) with fallback to JSON-LD and generic selectors.
3. `popup.js` + `popup.html` -- Two-tab UI (Contact mode / Job mode). Contact: find email + draft, coffee chat prep. Job: find recruiters, generate cover letter.

Content scripts detect LinkedIn SPA navigation via `pushState`/`replaceState` interception. MutationObservers disconnected on visibility change to prevent memory leaks.

## Environment Variables

**Backend** (root `.env`):
- `OPENAI_API_KEY`, `CLAUDE_API_KEY` -- AI providers
- `PEOPLE_DATA_LABS_API_KEY` -- Contact search
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `SERPAPI_KEY` -- Job/firm search
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` -- Gmail OAuth
- `GOOGLE_APPLICATION_CREDENTIALS` -- Path to Firebase service account JSON
- `JINA_API_KEY` -- Web content extraction
- `PRERENDER_TOKEN` -- SSR for bots (default hardcoded in wsgi.py)
- `GMAIL_WEBHOOK_SECRET` -- Pub/Sub webhook verification
- `PROMPT_SEARCH_ENABLED` -- Experimental natural language search (default: false)
- `CREATE_GMAIL_DRAFTS` -- Create actual Gmail drafts vs compose links (default: false)

**Frontend** (`connect-grow-hire/.env.production`):
- `VITE_API_BASE_URL=https://offerloop.ai/api`
- Firebase config has hardcoded fallbacks in `src/lib/firebase.ts`

## Deployment

**Platform**: Render. Single service, no Docker.

**Build** (`render-build.sh`):
1. `cd connect-grow-hire && npm ci && npm run build` (produces `dist/`)
2. `pip install -r backend/requirements.txt`

**Runtime**: `gunicorn backend.wsgi:app --bind 0.0.0.0:5001 --workers 4`

**Static serving** (in `wsgi.py`):
- Flask `static_folder` = `connect-grow-hire/dist`
- `/assets/*` -- 1-year immutable cache
- `/sitemap.xml`, `/robots.txt`, `/llms.txt` -- explicit routes with correct MIME types
- 404 -- serves `index.html` for non-`/api/` routes (SPA routing)
- `/api/*` 404s return proper error JSON

**Background processes**:
- Gmail watch renewal: daemon thread in `wsgi.py`, every 6 days. Iterates all users with Gmail integration, renews watches expiring within 24h. Will silently die on unhandled exception.
- Reddit scanner: GitHub Actions cron every 30 min (`backend/scripts/reddit_scanner.py` -> Telegram notification)
- Blog generation: GitHub Actions every Friday 9am UTC (`scripts/generate-blog-post.cjs` -> OpenAI -> markdown in `src/content/blog/` -> git commit)

## SEO & Crawler Setup

- `robots.txt`: Allows all major search engines and AI crawlers (GPTBot, ClaudeBot, PerplexityBot). Blocks `/api`, `/auth`, `/dashboard`, `/tracker`, `/settings`.
- `llms.txt`: Structured product description for AI crawlers with features, pricing, competitive differentiators.
- `sitemap.xml`: ~1492 URLs.
- Prerender.io middleware in `wsgi.py` intercepts 40+ bot user agents for SSR. Only GET requests to non-API, non-asset, non-file-extension routes.

## Common Pitfalls

1. **`wsgi.py` is the entry point, not `app/__init__.py`.** The latter is just a package marker. New blueprints, middleware, and background tasks go in `wsgi.py`.

2. **Vite chunk splitting is fragile.** Any new npm package that imports React must be added to the `vendor-react` manual chunk in `vite.config.ts`. Failure produces cryptic "Cannot access before initialization" errors at runtime, not build time.

3. **Tier constants exist in two places.** `backend/app/config.py` and `connect-grow-hire/src/lib/constants.ts`. If you change limits, pricing, or feature flags, update both.

4. **Gmail watch renewal is a daemon thread.** If it throws an unhandled exception, it dies silently. Check logs if Gmail push notifications stop working.

5. **`linkedin_import_bp` must be registered before `contacts_bp`** in `wsgi.py` to avoid route conflicts (both use `/api/contacts` prefix).

6. **`contacts.db`** (SQLite) is gitignored but required in production for the contact directory feature.

7. **`subscriptionTier` is the source-of-truth field** for user tier in Firestore. `tier` is a legacy fallback. The backend always reads from Firestore, never trusts client-sent tier data.

8. **OAuth redirect URI auto-detects** based on `FLASK_ENV`: prod = `https://offerloop.ai/api/google/oauth/callback`, dev = `http://localhost:5001/api/google/oauth/callback`.

9. **The frontend has no test framework.** All tests are backend pytest only.

10. **Blog posts are auto-generated.** The weekly GitHub Action commits directly to `main`. Posts are markdown with YAML frontmatter in `connect-grow-hire/src/content/blog/`.

## External Service Reference

| Service | Purpose | Config |
|---------|---------|--------|
| Firebase (offerloop-native) | Auth, Firestore, Cloud Storage | `backend/app/extensions.py`, `src/lib/firebase.ts` |
| OpenAI (GPT-4) | Email gen, resume optimization, scout, interview/coffee chat prep | `backend/app/services/openai_client.py` |
| Anthropic (Claude) | Fallback LLM | `backend/app/services/openai_client.py` |
| People Data Labs | Contact search, enrichment | `backend/app/services/pdl_client.py` |
| Hunter.io | Email discovery, verification | `backend/app/services/hunter.py` |
| Stripe | Subscriptions (Pro/Elite) | `backend/app/services/stripe_client.py`, `backend/app/routes/billing.py` |
| Gmail API | OAuth, drafts, thread sync, push via Pub/Sub | `backend/app/services/gmail_client.py`, `backend/app/routes/gmail_oauth.py` |
| SerpAPI | Google Search, Google Jobs, firm discovery | `backend/app/services/serp_client.py` |
| Prerender.io | SSR for bot crawlers | `backend/wsgi.py` middleware |
| PostHog | Frontend analytics | `connect-grow-hire/src/lib/posthog.ts` |
| Sentry | Backend error tracking (dev only) | `backend/app/utils/sentry_config.py` |
| Google Cloud Pub/Sub | Gmail webhook notifications | `backend/app/routes/gmail_webhook.py` |
| Jina Reader | Web content extraction | Referenced in `backend/app/config.py` |
