// src/pages/SignIn.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
 


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

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  useEffect(() => {
    if (!isLoading && user) {
      const dest = user.needsOnboarding ? "/onboarding" : "/home";
      console.log("[signin] auto redirect ->", dest, { needsOnboarding: user.needsOnboarding });
      forceNavigate(dest);
    }
  }, [user, isLoading]);

  const handleGoogleAuth = async () => {
    if (submitting || isLoading) return;
    setSubmitting(true);
    try {
      console.log("🔐 Initiating Google Sign-In (app auth only)...");
      const next = await signIn({ prompt: "consent" });
      const dest = next === "onboarding" ? "/onboarding" : "/home";
      console.log("[signin] signIn returned:", next, "→", dest);
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
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>

        <div className="mt-10 bg-zinc-900/60 backdrop-blur rounded-2xl p-6 border border-zinc-800">
          <div className="flex gap-4 mb-6">
            <button
              className={`px-4 py-2 rounded-xl border ${
                activeTab === "signin"
                  ? "bg-white text-black border-white"
                  : "border-zinc-700 text-zinc-300 hover:text-white"
              }`}
              onClick={() => setActiveTab("signin")}
              disabled={submitting}
            >
              Sign in
            </button>
            <button
              className={`px-4 py-2 rounded-xl border ${
                activeTab === "signup"
                  ? "bg-white text-black border-white"
                  : "border-zinc-700 text-zinc-300 hover:text-white"
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
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 bg-white text-black font-medium hover:opacity-90 disabled:opacity-60"
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
             

            <div className="text-xs text-zinc-400 space-y-2">
              <p>
                {activeTab === "signup"
                  ? "Step 1: Sign in to RecruitEdge. Step 2: Connect Gmail to allow draft creation."
                  : "Sign in, then click Connect Gmail to allow draft creation in your account."}
              </p>
              <p className="text-zinc-500">
                ✓ We'll never send emails without your permission<br />
                ✓ We only create drafts in your Gmail<br />
                ✓ You review and send all emails yourself
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
