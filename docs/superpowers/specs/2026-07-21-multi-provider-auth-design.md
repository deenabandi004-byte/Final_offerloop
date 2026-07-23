# Multi-Provider Auth + Universal Draft Delivery

**Date:** 2026-07-21
**Branch:** `feat/multi-provider-auth` (off `upstream/main` @ `945a79c`, the live commit)
**Status:** Approved direction, spec for review

## Problem

Offerloop today requires a Google account to sign in and a connected Gmail to receive email drafts. Students with iCloud, Outlook, Yahoo, or school-only addresses cannot use the product. We want:

1. Anyone can sign in: email + password, Sign in with Google, Sign in with Apple.
2. Everyone gets their generated outreach emails, with the resume attached, regardless of provider.

## Approach (decided)

Tiered draft delivery. Sign-in is decoupled from mailbox access (it already is in the code: Gmail OAuth is a separate flow from Firebase sign-in).

| Provider | Delivery | Phase |
|---|---|---|
| Google | Native Gmail draft (existing, unchanged) | Live |
| Microsoft (outlook.com, hotmail, live, work 365) | Native draft via Microsoft Graph | Phase 2 |
| Everyone else (iCloud, Yahoo, custom) | Downloadable `.eml` file with resume attached + copy-to-clipboard | Phase 1 |
| IMAP app-password connect (true drafts for iCloud/Yahoo) | **Out of scope** — revisit only if users ask | — |

Rejected: unified email APIs (Unipile/Nylas, ~$5/connected account/month ≈ $1,500/mo at current scale) and mailto-only fallback (cannot carry the resume attachment).

---

## Phase 1: Auth expansion + universal fallback

### 1a. Frontend auth (`FirebaseAuthContext.tsx`, `SignIn.tsx`)

Current state: one `signIn()` method, Google popup only (`FirebaseAuthContext.tsx:280-338`). The Sign in / Create account tabs on `SignIn.tsx` are cosmetic; both call Google.

Changes:

- **`FirebaseAuthContext.tsx`**: split `signIn()` into provider methods sharing one post-auth pipeline (Firestore user doc create/load, `needsOnboarding`, `NextRoute` return — the logic at lines 296-329 today):
  - `signInWithGoogle()` — existing behavior.
  - `signInWithApple()` — `signInWithPopup` with `new OAuthProvider('apple.com')`, request `email` + `name` scopes.
  - `signUpWithEmail(name, email, password)` — `createUserWithEmailAndPassword` + `updateProfile(displayName)` + `sendEmailVerification`. Verification is non-blocking: show a banner, don't gate the product.
  - `signInWithEmail(email, password)` — `signInWithEmailAndPassword`.
  - `resetPassword(email)` — `sendPasswordResetEmail`.
- **`SignIn.tsx`**: make the tabs real. Create account tab: name, email, password fields + Google/Apple buttons. Sign in tab: email, password, forgot-password link + Google/Apple buttons. Follow existing form styling; lucide icons only, no emoji, no em dashes in copy.
- **Remove the forced Gmail OAuth redirect** after sign-in (`SignIn.tsx:255-267`). Replaced by an optional inbox-connect step (1c).
- **Account collision**: Firebase default "one account per email" stays on. Catch `auth/account-exists-with-different-credential` and `auth/email-already-in-use`; tell the user which method they originally used ("This email is registered with Google. Use Sign in with Google.").
- **Apple "Hide My Email"**: the relay address is a valid Firebase identity; nothing breaks at sign-in. Onboarding already collects profile info; the outreach/signature email is handled separately (1d).

### 1b. Universal draft fallback (backend)

Current state: `/api/emails/generate-and-draft` (`emails.py:161-168`) hard-fails with a 500 if the user has no Gmail service, except it can silently fall back to a **shared** `token.pickle` inbox (`gmail_client.py:1016-1019`), which writes user drafts into an Offerloop-owned mailbox. The `CREATE_GMAIL_DRAFTS` config flag (`config.py:104`) is dead code, referenced nowhere.

Changes:

- **Provider routing in `/generate-and-draft`**: if the user has a connected Gmail integration → existing path, unchanged. Otherwise → **no 500**. Generate the emails as normal and return per-draft: `subject`, `body`, `deliveryMode: "fallback"`, and an `emlToken` for download. No shared-inbox fallback for user-facing drafts: `get_gmail_service_for_user` calls from this route pass a flag (or new narrower helper) that skips the `token.pickle` Priority-2 path.
- **New `.eml` download endpoint** (in `emails_bp`): builds an RFC 5322 MIME message — To, Subject, HTML body, the user's resume PDF attached, and the `X-Unsent: 1` header so Outlook desktop and Apple Mail open it as an editable draft rather than a received message. Returns `Content-Disposition: attachment; filename="<FirstName>-<Company>.eml"`. Auth-gated to the requesting user.
- **Delete or wire `CREATE_GMAIL_DRAFTS`**: remove the dead flag; the routing above supersedes its intent.

### 1c. Onboarding: optional "Connect your inbox" step

- New onboarding step: "Connect Gmail" (existing OAuth flow), "Connect Outlook" (Phase 2, hidden until shipped), or "Skip for now, download your emails instead".
- **Encourage Google**: the step leads with Gmail as the recommended path ("Recommended: drafts appear directly in your Gmail, ready to send"). The sign-in page also marks Continue with Google as Recommended. Copy nudges, not gates: no one is blocked from other providers.
- Skipping sets nothing; the fallback path is simply what happens when no integration exists.
- Users can connect later from the Integrations tab (1g) or the draft-surface CTAs (a "Connect Gmail" entry point already exists, e.g. `ContactSearchPage.tsx:2173`; keep those).

### 1g. Integrations tab + post-onboarding connect prompts

- **Account Settings**: generalize the existing "Gmail Integration" section (`AccountSettings.tsx:111`, section id `gmail`) into an **Integrations** section: rows for Gmail (connect/disconnect, connected address) and Outlook (Phase 2; hidden until live). When nothing is connected, the section states the current mode: "Your emails are generated as downloadable drafts. Connect an inbox to have them written into your drafts folder."
- **Contextual connect prompt when drafting without an integration**: whenever a draft surface returns `deliveryMode: "fallback"`, show a dismissible inline nudge above the results. The suggested provider is picked from the user's email domain: `gmail.com`/`googlemail.com` → "Connect Gmail"; `outlook.com`/`hotmail.com`/`live.com`/`msn.com` → "Connect Outlook" (Phase 2; until then, generic copy); anything else → brief explainer of the download flow plus a "Connect Gmail if you have one" link. Dismissal persists for the session, not forever: it reappears on the next session's first fallback draft.
- **Onboarding skip follow-up**: users who skipped the inbox step see a one-time badge/dot on the Integrations settings entry until they either connect or visit the tab once.

### 1d. Backend hardening: login email is no longer guaranteed

`request.firebase_user.get("email")` may now be missing (some Apple configs) or an Apple private-relay address. It is used today as a Gmail account hint, OAuth `login_hint`, and signature/reply-to identity at: `emails.py:162,188-193,830,887`, `gmail_oauth.py:68-81`, `job_board.py:8653,8712,9569`, `coffee_chat_prep.py:329`, `runs.py:140`, `linkedin_import.py:664`, `contact_import.py:604`, `alumni_discovery_routes.py:163,272`, `billing.py` (multiple), `stripe_client.py:335`.

Changes:

- All these sites must tolerate `None` (they mostly pass it as a hint; verify no `.lower()`/format calls on `None`).
- Signature/outreach identity: prefer, in order, the user's `.edu`/outreach email from the Firestore user doc (`get_outreach_email`, existing), then the user-doc `email`, then the token email. Onboarding already collects profile info; ensure an email field lands in the user doc for password/Apple users (for password users it's the login email; for Apple relay users, onboarding asks for a preferred email for signatures).
- Stripe: pass the Firestore user-doc email for receipts, falling back to token email.

### 1e. Frontend draft surfaces

Surfaces that render draft results: `ContactSearchPage.tsx`, `RecruiterSpreadsheetPage.tsx`, `MyNetworkPage.tsx`, `components/jobs/FindHumansModal.tsx`, `components/tracker/ActionBar.tsx`, `components/NotificationBell.tsx`, `pages/NetworkTracker.tsx`.

- When a draft has `gmailUrl` → current behavior ("Open in Gmail").
- When `deliveryMode: "fallback"` → two actions: "Download email" (hits the `.eml` endpoint) and "Copy email" (subject + body to clipboard). Shared small component so all seven surfaces render identically.
- Empty-state copy explains the file opens in their mail app with resume attached.

### 1f. Firebase console + Apple prerequisites (manual, Nick)

- Firebase console → Authentication → enable **Email/Password** and **Apple** providers.
- Apple: requires an Apple Developer account ($99/yr): create a Services ID, a Sign in with Apple private key, register Firebase's handler domain/return URL, and paste the Services ID + key into the Firebase Apple provider config.
- If the Apple Developer account isn't ready at ship time, Phase 1 ships with email/password + Google, and the Apple button is added when the account exists (code path is identical).

---

## Phase 2: Outlook native drafts (Microsoft Graph)

- **Azure app registration** (manual): redirect URI `https://offerloop.ai/api/microsoft/oauth/callback` (+ localhost for dev), client secret. Env vars: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`.
- **Scopes**: `offline_access`, `User.Read`, `Mail.ReadWrite` (create drafts), `Mail.Send` (parity with the existing send-draft feature).
- **New `backend/app/routes/microsoft_oauth.py`** mirroring `gmail_oauth.py`: `/api/microsoft/oauth/start|callback`, `/api/microsoft/status`, disconnect. Register in `wsgi.py`.
- **New `backend/app/services/outlook_client.py`**: token refresh, `create_draft` (`POST /me/messages` with MIME or JSON body + resume attachment; response includes `webLink` to open the draft in Outlook web), `send_draft` (`POST /me/messages/{id}/send`).
- **Storage**: `users/{uid}/integrations/outlook` — `{ provider: "outlook", address, tokens, expiry }`. Existing Firestore rules already scope integrations to the user.
- **Routing**: `/generate-and-draft` checks integrations in order Gmail → Outlook → fallback. Frontend renders `outlookUrl` ("Open in Outlook") identically to `gmailUrl`.
- **Out of scope for Phase 2**: reply detection/tracker sync for Outlook (Gmail uses Pub/Sub push; Graph subscriptions are a separate project). Tracker features degrade gracefully for Outlook users: sent/draft status only, no reply detection.

---

## Testing (backend pytest; no frontend test framework exists)

- `.eml` builder: headers, `X-Unsent: 1`, resume attachment, filename, non-ASCII names.
- `/generate-and-draft` with no integration returns 200 + fallback fields (not 500), and never touches the shared `token.pickle` account.
- Provider routing: gmail-connected → gmail path; outlook-connected → outlook path (Phase 2, mocked Graph).
- `firebase_user` without `email` key: the hardened sites in 1d don't raise.
- Outlook client: token refresh + draft create against mocked Graph responses (Phase 2).

## Rollout

1. Phase 1 ships first: any email can sign up, drafts always delivered (Gmail native or `.eml`).
2. Phase 2 (Outlook) ships behind the same integration pattern; the "Connect Outlook" button appears when live.
3. IMAP app-password connect: only if users ask for true iCloud/Yahoo drafts.

## Risks

- **Apple setup friction**: needs the paid developer account + domain verification before the Apple button works. Mitigated: ship without it, add later.
- **`.eml` behavior varies**: new Outlook consumer client may open it read-only ("reply/forward" instead of edit). Mitigated: Outlook users are exactly who Phase 2 serves natively; copy button always works.
- **Relay emails in Stripe/receipts**: Apple relay addresses do forward mail, acceptable.
- **Regression risk on Gmail path**: routing change touches the hot path; the Gmail branch must remain byte-for-byte behaviorally identical (covered by existing email tests).
