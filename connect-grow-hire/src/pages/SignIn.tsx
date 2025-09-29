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
  const { user, isLoading, signIn } = useFirebaseAuth(); // signIn => "onboarding" | "home"

  const initialTab: Tab = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("mode") === "signup" ? "signup" : "signin";
  }, [location.search]);

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated, never stay on /signin
  useEffect(() => {
    if (user && !isLoading) {
      navigate(user.needsOnboarding ? "/onboarding" : "/home", { replace: true });
    }
  }, [user, isLoading, navigate]);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  const handleGoogleAuth = async () => {
    if (submitting || isLoading) return;
    setSubmitting(true);
    try {
      const next = await signIn({ prompt: "select_account" }); // "onboarding" | "home"
      toast({
        title: next === "onboarding" || activeTab === "signup" ? "Welcome! 🎉" : "Signed in",
        description: next === "onboarding" ? "Account created. Finishing setup…" : "Welcome back! Redirecting…",
      });
      navigate(next === "onboarding" ? "/onboarding" : "/home", { replace: true });
    } catch (err: any) {
      console.error(err);
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
            <button
              onClick={handleGoogleAuth}
              disabled={submitting || isLoading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 bg-white text-black font-medium hover:opacity-90 disabled:opacity-60"
            >
              {/* Google "G" icon */}
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

            <p className="text-xs text-zinc-400">
              {activeTab === "signup"
                ? "By continuing, you agree to create an account and accept our Terms & Privacy Policy."
                : "We’ll never post or email anyone without your permission."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
