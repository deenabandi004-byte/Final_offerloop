// src/pages/SignIn.tsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { getAuth } from "firebase/auth";
import { PageWrapper } from "@/components/PageWrapper";
import { GlassCard } from "@/components/GlassCard";
import { Logo } from "@/components/Logo";
 


type Tab = "signin" | "signup";

const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, isLoading, signIn } = useFirebaseAuth();

  const initialTab: Tab = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("mode") === "signup" ? "signup" : "signin";
  }, [location.search]);

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [submitting, setSubmitting] = useState(false);
  const autoCheckGmailRanRef = useRef(false); // Prevent multiple auto-checks

  // === NEW: Backend base URL + Connect Gmail helper ===
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";
  

  const forceNavigate = (dest: string) => {
    navigate(dest, { replace: true });
    setTimeout(() => {
      const at = window.location.pathname;
      if (at !== dest) {
        console.warn("[signin] router nav didn't apply, forcing hard redirect", { at, dest });
        window.location.replace(dest);
      }
    }, 600);
  };

  // ✅ FIXED: Don't depend on context user, use Firebase auth directly
  const checkNeedsGmailConnection = async (): Promise<boolean> => {
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        console.log("🔍 No Firebase user yet, can't check Gmail");
        return false;
      }
      
      const token = await firebaseUser.getIdToken();
      console.log("🔍 Checking Gmail status for:", firebaseUser.email);
      
      const response = await fetch(`${API_BASE_URL}/api/google/gmail/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      console.log("📧 Gmail status response:", data);
      return !data.connected;
    } catch (error) {
      console.error("Error checking Gmail status:", error);
      // On error, assume Gmail needs connecting to be safe
      return true;
    }
  };

  const initiateGmailOAuth = async (autoClose = false) => {
    console.log("🚀 initiateGmailOAuth CALLED", { autoClose });
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      console.log("🔐 Firebase user check:", { 
        hasUser: !!firebaseUser, 
        email: firebaseUser?.email,
        uid: firebaseUser?.uid 
      });
      
      if (!firebaseUser) {
        console.error("❌ No Firebase user when trying to start Gmail OAuth");
        return;
      }
      
      console.log("🔐 Getting ID token...");
      const token = await firebaseUser.getIdToken();
      console.log("🔐 Token obtained:", { 
        hasToken: !!token, 
        tokenLength: token?.length,
        tokenPrefix: token?.substring(0, 20) + "..." 
      });
      console.log("🔐 Starting Gmail OAuth for:", firebaseUser.email);
      console.log("🔐 Calling OAuth start endpoint...");
      
      // Add cache-busting to ensure we always get a fresh OAuth URL with new state
      const oauthUrl = `${API_BASE_URL}/api/google/oauth/start?t=${Date.now()}`;
      console.log("🔐 Full OAuth start URL:", oauthUrl);
      console.log("🔐 Token present:", !!token, "Token length:", token?.length);
      console.log("🔐 About to make fetch request...");
      
      let response;
      try {
        response = await fetch(oauthUrl, {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json'
          },
          credentials: 'include',  // Important for CORS with credentials
          mode: 'cors'  // Explicitly set CORS mode
        });
        console.log("🔐 Fetch completed! Status:", response.status);
      } catch (fetchError) {
        console.error("❌ Fetch error (network/CORS issue):", fetchError);
        console.error("❌ Error details:", {
          name: fetchError.name,
          message: fetchError.message,
          stack: fetchError.stack
        });
        throw new Error(`Network error: ${fetchError.message}. This might be a CORS issue.`);
      }
      
      console.log("🔐 Response status:", response.status, response.statusText);
      console.log("🔐 Response headers:", Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ OAuth start failed. Response body:", errorText);
        throw new Error(`OAuth start failed: ${response.status} ${response.statusText}. Body: ${errorText}`);
      }
      
      const data = await response.json();
      console.log("🔐 OAuth start response received, authUrl present:", !!data.authUrl);
      console.log("🔐 State token from response:", data.state);
      
      if (!data.authUrl) {
        console.error("❌ No authUrl in OAuth start response:", data);
        throw new Error("OAuth start failed: No authUrl in response");
      }
      
      if (data.authUrl) {
        // Save where to go after OAuth completes
        const destination = user?.needsOnboarding ? '/onboarding' : '/home';
        localStorage.setItem('post_gmail_destination', destination);
        
        if (autoClose) {
          // Open in popup for automatic background OAuth
          // Use a unique window name to prevent reusing cached popups
          const popupName = `gmail-oauth-${Date.now()}`;
          console.log("📧 Opening Gmail OAuth in popup (auto-close)...", popupName);
          const popup = window.open(
            data.authUrl,
            popupName,
            'width=600,height=700,scrollbars=yes,resizable=yes'
          );
          
          if (!popup) {
            console.error("❌ Popup blocked - cannot open OAuth");
            return;
          }
          
          // Monitor popup for completion
          const checkClosed = setInterval(() => {
            if (popup?.closed) {
              clearInterval(checkClosed);
              // Check if OAuth succeeded
              setTimeout(async () => {
                const needsGmail = await checkNeedsGmailConnection();
                if (!needsGmail) {
                  console.log('✅ Gmail OAuth completed successfully');
                  toast({
                    title: "Gmail Connected! 🎉",
                    description: "Drafts will now appear in your Gmail account.",
                  });
                }
              }, 1000);
            }
          }, 500);
        } else {
          console.log("📧 Redirecting to Gmail OAuth IMMEDIATELY...");
          console.log("📧 OAuth URL:", data.authUrl);
          console.log("📧 Will return to:", destination);
          // Use replace instead of href to avoid back button issues
          // This should show the Gmail OAuth consent screen immediately
          window.location.replace(data.authUrl);
        }
      } else {
        console.error("❌ No authUrl in response:", data);
      }
    } catch (error) {
      console.error("Error starting Gmail OAuth:", error);
      if (!autoClose) {
        // Fallback: navigate to app anyway (only if not auto-close mode)
        const dest = user?.needsOnboarding ? "/onboarding" : "/home";
        forceNavigate(dest);
      }
    }
  };

  // ✅ useEffects come AFTER function definitions
  useEffect(() => setActiveTab(initialTab), [initialTab]);


  // ✅ AUTO-CHECK Gmail when signed-in user loads page
  // NOTE: This only runs if user navigates to /signin manually
  // If OAuth is triggered from handleGoogleAuth, it redirects immediately (no auto-check needed)
  useEffect(() => {
    // Only run if we're actually on the /signin route
    if (location.pathname !== '/signin') {
      return;
    }

    // Prevent multiple runs
    if (autoCheckGmailRanRef.current) {
      return;
    }

    const autoCheckGmail = async () => {
      if (isLoading || !user) return;
      
      // Mark as run immediately to prevent duplicate calls
      autoCheckGmailRanRef.current = true;
      
      // If user just completed OAuth flow, don't auto-trigger again
      // (handleGoogleAuth already handles OAuth for new/existing users)
      const params = new URLSearchParams(location.search);
      const justCompletedOAuth = params.get("connected") === "gmail" || params.get("gmail_error");
      if (justCompletedOAuth) {
        console.log("📧 OAuth just completed, skipping auto-check");
        return;
      }
    
      const gmailError = params.get("gmail_error");
      if (gmailError === "wrong_account") {
        console.warn("📧 Gmail OAuth returned wrong_account error");
        toast({
          variant: "destructive",
          title: "Wrong Gmail account",
          description: `Please connect the Gmail account that matches your login: ${user.email}`,
        });
        // Don't immediately redirect them again; just let them hit the button / auto flow
        // and pick the right account.
        // We still fall through so the auto-check can decide what to do.
      } else if (gmailError === "not_test_user") {
        console.warn("📧 Gmail OAuth - user not in test users list");
        toast({
          variant: "destructive",
          title: "Gmail Access Restricted",
          description: `Your email (${user.email}) needs to be added to the test users list. Please contact support or add it in Google Cloud Console > OAuth consent screen > Test users.`,
          duration: 10000,
        });
        return; // Don't proceed with auto-check if there's an error
      }

      const justConnectedGmail = params.get("connected") === "gmail";

      // ✅ Case 2: Gmail successfully connected
      if (justConnectedGmail) {
        console.log("📧 Returned from Gmail OAuth!");
        const dest = localStorage.getItem('post_gmail_destination') || '/home';
        localStorage.removeItem('post_gmail_destination');
        
        toast({
          title: "Gmail Connected! 🎉",
          description: "You can now create drafts directly in Gmail.",
        });
        
        forceNavigate(dest);
        return;
      }
      
      // Case 3: normal sign-in path → check whether Gmail is connected
      // Only auto-check if user just signed in (not if they manually navigated to /signin)
      // Check if we're coming from a fresh sign-in by checking if there's no OAuth return params
      const isReturningFromOAuth = params.has("connected") || params.has("gmail_error");
      if (isReturningFromOAuth) {
        // We already handled OAuth return cases above, so skip auto-check
        return;
      }
      
      // Don't auto-trigger OAuth here - let the user flow handle it
      // The handleGoogleAuth function now handles showing OAuth immediately for new users
      console.log('✅ User signed in, navigating to app');
      const dest = user.needsOnboarding ? "/onboarding" : "/home";
      console.log('🏠 Navigating to:', dest);
      forceNavigate(dest);
    };

    if (!isLoading && user) {
      const timer = setTimeout(autoCheckGmail, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, isLoading, location.search, location.pathname, toast]);

  // Reset the ref when user signs out or component unmounts
  useEffect(() => {
    if (!user) {
      autoCheckGmailRanRef.current = false;
    }
  }, [user]);
  
  const handleGoogleAuth = async () => {
    console.log("🚀 handleGoogleAuth CALLED", { submitting, isLoading });
    if (submitting || isLoading) {
      console.log("⚠️ Already submitting or loading, returning early");
      return;
    }
    setSubmitting(true);
    try {
      console.log("🔐 Initiating Google Sign-In...");
      const next = await signIn({ prompt: "consent" });
      
      console.log("✅ Firebase sign-in completed, next step:", next);
      
      // ✅ IMMEDIATELY check Gmail connection (no delay) and trigger OAuth if needed
      // This prevents navigation to home before OAuth
      const isNewUser = next === "onboarding";
      console.log("🔍 User type check:", { isNewUser, next });
      
      // For both new and existing users, check Gmail connection immediately
      console.log("🔍 Checking Gmail connection status...");
      const needsGmail = await checkNeedsGmailConnection();
      console.log("🔍 Gmail connection check result:", needsGmail);
      
      if (needsGmail) {
        console.log("📧 Gmail not connected, starting OAuth flow IMMEDIATELY...");
        console.log("📧 About to call initiateGmailOAuth(false)...");
        // Immediately trigger Gmail OAuth - show permissions screen right away
        // This redirects, so we don't navigate to home first
        // CRITICAL: This should redirect to Gmail OAuth consent screen immediately
        await initiateGmailOAuth(false); // false = redirect so user sees permissions screen
        // This line should never execute because initiateGmailOAuth redirects
        console.log("📧 initiateGmailOAuth completed (should have redirected)");
        return; // OAuth redirects, stop here - don't navigate anywhere
      }
      
      // Gmail already connected - navigate based on next route
      console.log("✅ Gmail already connected, navigating to app");
      const dest = (next as "onboarding" | "home") === "onboarding" ? "/onboarding" : "/home";
      console.log("[signin] signIn returned:", next, "→", dest, "(Gmail already connected)");
      forceNavigate(dest);
    } catch (err: any) {
      console.error("[signin] failed:", err);
      setSubmitting(false);
      toast({
        variant: "destructive",
        title: "Sign-in failed",
        description: err?.message || "Please try again.",
      });
    }
  };

  return (
    <PageWrapper>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 text-sm text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 hover:text-blue-400 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>

        <GlassCard className="mt-10 p-8 rounded-2xl">
          <div className="mb-8 text-center">
            <Logo size="lg" className="justify-center mb-4" />
            <h1 className="text-display-lg text-white dark:text-white text-slate-900 dark:text-white mb-2">
              {activeTab === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400">
              {activeTab === "signup" 
                ? "Get started with Offerloop in seconds" 
                : "Sign in to continue to your account"}
            </p>
          </div>
          <div className="flex gap-4 mb-6">
            <button
              className={`px-4 py-2 rounded-xl border transition-all ${
                activeTab === "signin"
                  ? "bg-white/10 border-blue-400/50 text-white"
                  : "border-white/10 text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 hover:border-blue-400/30"
              }`}
              onClick={() => setActiveTab("signin")}
              disabled={submitting}
            >
              Sign in
            </button>
            <button
              className={`px-4 py-2 rounded-xl border transition-all ${
                activeTab === "signup"
                  ? "bg-white/10 border-blue-400/50 text-white"
                  : "border-white/10 text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 hover:border-blue-400/30"
              }`}
              onClick={() => setActiveTab("signup")}
              disabled={submitting}
            >
              Create account
            </button>
          </div>

          <div className="space-y-3">
            {/* App Sign-In (Firebase Auth) */}
            <button
              onClick={handleGoogleAuth}
              disabled={submitting || isLoading}
              className="btn-primary-glass w-full inline-flex items-center justify-center gap-2 px-4 py-3 font-medium disabled:opacity-60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                <path
                  fill="#FFC107"
                  d="M43.611 20.083H42V20H24v8h11.303C33.96 32.99 29.453 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.06 0 5.84 1.154 7.949 3.042l5.657-5.657C34.869 6.057 29.706 4 24 4 12.954 4 4 12.954 4 24s8.954 20 20 20c10.493 0 19.128-8.08 19.128-20 0-1.341-.138-2.651-.4-3.917z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.306 14.691l6.571 4.817C14.39 16.564 18.879 14 24 14c3.06 0 5.84 1.154 7.949 3.042l5.657-5.657C34.869 6.057 29.706 4 24 4c-7.668 0-14.266 4.343-17.694 10.691z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.453 0 10.01-1.787 13.49-4.852l-6.23-5.253C29.207 35.385 26.78 36 24 36c-5.438 0-10.028-3.668-11.66-8.67l-6.5 5.01C8.257 38.926 15.44 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.611 20.083H42V20H24v8h11.303c-1.098 3.24-3.48 5.773-6.043 7.091l6.23 5.253C37.147 38.47 40 32.943 40 26c0-2.055-.222-3.92-.611-5.917z"
                />
              </svg>
              {activeTab === "signup" ? "Continue with Google" : "Sign in with Google"}
            </button>

            {/* NEW: Connect Gmail (server-side OAuth for drafts) */}
             

            <div className="text-xs text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400 space-y-2">
              <p>
                {activeTab === "signup"
                  ? "Step 1: Sign in to Offerloop. Step 2: Connect Gmail to allow draft creation."
                  : "Sign in, then connect Gmail to allow draft creation in your account."}
              </p>
              <p className="text-gray-500 dark:text-gray-500 text-slate-500 dark:text-gray-500">
                ✓ We'll never send emails without your permission<br />
                ✓ We only create drafts in your Gmail<br />
                ✓ You review and send all emails yourself
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    </PageWrapper>
  );
};

export default SignIn;