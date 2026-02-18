# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Offerloop is a full-stack professional networking and recruiting platform. Users search for contacts, generate personalized outreach emails, prepare for coffee chats/interviews, and manage subscriptions. The app integrates with Gmail, Stripe, Firebase, OpenAI, and People Data Labs.

## Architecture

**Two independent projects** (not a monorepo — no workspace manager):
- `backend/` — Python Flask REST API (port 5001)
- `connect-grow-hire/` — React SPA with Vite (port 8080)
- `chrome-extension/` — Chrome extension (Manifest V3, built separately)

**Database**: Firestore (NoSQL). Firebase Authentication for user auth. A legacy SQLite database (`contacts.db`) exists for the contact directory feature.

**Backend pattern**: Flask blueprints for routes → service layer for business logic → Firestore for persistence. All blueprints are registered in `backend/wsgi.py` (the canonical entry point, ~26 blueprints). The `backend/app/__init__.py` app factory registers only a subset (health, outbox, SPA catch-all).

**Frontend pattern**: React 18 + TypeScript + Vite (SWC). Uses TanStack Query for server state, React Router 6 for routing, shadcn/ui (Radix primitives) for components, Tailwind CSS for styling. Path alias `@` → `./src`. Pages are lazy-loaded with Suspense.

**Auth flow**: Firebase ID tokens sent as `Bearer` in `Authorization` header. Backend verifies via `@require_firebase_auth` decorator (defined in `backend/app/extensions.py`). Tier-based access uses `@require_tier(['pro'])` decorator (must come before `@require_firebase_auth` in decorator order).

**Key service files**:
- `connect-grow-hire/src/services/api.ts` — all backend API calls (~52KB)
- `connect-grow-hire/src/services/firebaseApi.ts` — direct Firestore operations
- `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx` — auth state
- `backend/app/extensions.py` — Firebase init, CORS, rate limiting, auth/tier decorators
- `backend/app/config.py` — environment variable configuration

## Build & Run Commands

### Backend
```bash
cd backend && pip install -r requirements.txt    # install dependencies
cd backend && python3 wsgi.py                    # dev server on :5001 (or from root: python3 app.py)
```

### Frontend
```bash
cd connect-grow-hire && npm install              # install dependencies
cd connect-grow-hire && npm run dev              # dev server on :8080
cd connect-grow-hire && npm run build            # production build → dist/
cd connect-grow-hire && npm run lint             # eslint
```

### Tests
```bash
cd backend && pytest tests/                      # run all backend tests
cd backend && pytest tests/ -k "test_name"       # run single test by name
cd backend && pytest tests/ -m unit              # run by marker (unit, integration, slow)
```

No frontend test framework is configured.

### Production
```bash
gunicorn backend.wsgi:app --bind 0.0.0.0:5001 --workers 4
```
The Flask app serves the built frontend SPA from `connect-grow-hire/dist/` and falls back to `index.html` for non-API 404s (SPA routing).

## Key Conventions

- Backend routes live in `backend/app/routes/` as Flask Blueprints; business logic lives in `backend/app/services/`. New blueprints must be imported and registered in `backend/wsgi.py`.
- Frontend UI components use shadcn/ui from `connect-grow-hire/src/components/ui/`. Feature components and pages are separate directories.
- Vite config has aggressive manual chunk splitting to prevent "Cannot access before initialization" errors. Any new React-dependent npm package should be added to the `vendor-react` chunk in `connect-grow-hire/vite.config.ts`.
- Rate limiting: 500/day, 200/hour per user (in-memory storage, not Redis). Static assets are exempted.
- Tier system: Free (150 credits, 3 contacts/search) vs Pro (1800 credits, 8 contacts/search). Credits reset monthly.
- TypeScript is configured with `strictNullChecks: false` and `noImplicitAny: false`.
- Environment variables: root `.env` for backend keys; `connect-grow-hire/.env` for frontend (`VITE_` prefixed variables).
- The `cursor-rules.md` file at project root contains context for the Timeline feature implementation (OpenAI-powered recruiting timeline with drag-and-drop phases, persisted to Firebase).
