# OAuth Flow Fixes Applied

## Changes Made

### 1. Gmail Permissions Screen Now Shows During Sign-Up ✅

**Before**: Gmail OAuth only triggered after checking if Gmail was connected (which happened after sign-in completed)

**After**: For new users (sign-up), Gmail OAuth permissions screen appears **immediately** after Firebase sign-in completes

**Files Changed**:
- `connect-grow-hire/src/pages/SignIn.tsx` - Modified `handleGoogleAuth()` to immediately trigger Gmail OAuth for new users

### 2. Fixed Domain Restriction Bug ✅

**Before**: Account picker was restricted to @offerloop.ai emails initially, requiring users to go back and select again

**After**: Account picker shows all Google accounts from the start, with login_hint as a suggestion only

**Files Changed**:
- `backend/app/routes/gmail_oauth.py` - Always use `prompt=select_account consent` to show all accounts

## Important: Google Cloud Console Setting

The domain restriction might also be set in **Google Cloud Console**. Please check:

1. Go to: https://console.cloud.google.com
2. Select project: **offerloop-native**
3. Go to: **APIs & Services** → **OAuth consent screen**
4. Check for **"Authorized domains"** or **"Hosted domain"** settings
5. **Remove any domain restrictions** that limit account selection to @offerloop.ai

If you see a setting like "Restrict to domain" or "Hosted domain", make sure it's:
- Either **not set** (allows all Google accounts)
- Or set to allow multiple domains

## Testing

After deploying these changes:

1. **Test Sign-Up Flow**:
   - Visit: https://www.offerloop.ai/signin
   - Click "Create account" tab
   - Click "Continue with Google"
   - Sign in with any Google account
   - **Expected**: Gmail permissions screen should appear immediately after sign-in

2. **Test Account Picker**:
   - During Gmail OAuth, you should see **all** your Google accounts
   - Not just @offerloop.ai accounts
   - You can select any account

3. **Test Existing User**:
   - Sign in with existing account
   - If Gmail not connected, OAuth should trigger
   - If Gmail already connected, should go straight to app

## What Changed in Code

### SignIn.tsx
- New users now immediately see Gmail OAuth after Firebase sign-in
- Removed auto-background OAuth popup that was interfering
- OAuth now uses redirect (not popup) so users see the permissions screen clearly

### gmail_oauth.py
- Always uses `prompt=select_account consent` to show all accounts
- `login_hint` is now just a suggestion, not a restriction
- This fixes the bug where only @offerloop.ai emails appeared initially

