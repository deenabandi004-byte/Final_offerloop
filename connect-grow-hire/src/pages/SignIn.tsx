// src/pages/SignIn.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  getAdditionalUserInfo,
} from "firebase/auth";

type Tab = "signin" | "signup";

const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, isLoading } = useFirebaseAuth();

  // derive initial tab from URL (?mode=signup)
  const initialTab: Tab = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("mode") === "signup" ? "signup" : "signin";
  }, [location.search]);

const [activeTab, setActiveTab] = useState<Tab>(initialTab);
const [submitting, setSubmitting] = useState(false);

// Add this to watch for user state changes and redirect
useEffect(() => {
  if (user && !isLoading) {
    console.log('User authenticated, checking onboarding status...');
    console.log('needsOnboarding:', user.needsOnboarding);
    
    // Add a small delay to ensure Firebase state is fully settled
    const timer = setTimeout(() => {
      if (user.needsOnboarding) {
        console.log('Redirecting to onboarding...');
        navigate('/onboarding', { replace: true });
      } else {
        console.log('Redirecting to home...');
        navigate('/home', { replace: true });
      }
    }, 500); // Increased delay to 500ms
    
    return () => clearTimeout(timer);
  }
}, [user, isLoading, navigate]);

// keep tab in sync if the query param changes
useEffect(() => setActiveTab(initialTab), [initialTab]);

  const handleGoogleAuth = async () => {
    if (submitting || isLoading) return;
    setSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      if (activeTab === 'signup') {
        provider.setCustomParameters({ 
          prompt: 'select_account' 
        });
      }

      const result = await signInWithPopup(getAuth(), provider);

      // Helpful for analytics/branching in your backend if you want
      const info = getAdditionalUserInfo(result);
      const isNewUser = !!info?.isNewUser;

      toast({
        title: activeTab === "signup" || isNewUser ? "Welcome! 🎉" : "Signed in",
        description:
          activeTab === "signup" || isNewUser
            ? "Account created. Finishing setup…"
            : "Welcome back! Redirecting…",
      });

      // ⛔️ No navigate() here on purpose.
      // Your Route Guards will now take over routing based on auth state
      // (see App.tsx PublicRoute/ProtectedRoute).
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Sign-in failed",
        description: err?.message || "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back to landing */}
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>

        <div className="mt-10 bg-zinc-900/60 backdrop-blur rounded-2xl p-6 border border-zinc-800">
          {/* Tabs */}
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

          {/* Google button */}
          <div className="space-y-3">
            <button
              onClick={handleGoogleAuth}
              disabled={submitting || isLoading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 bg-white text-black font-medium hover:opacity-90 disabled:opacity-60"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 48 48"
              >
                <path
                  fill="#FFC107"
                  d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12S17.373 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.306 14.691l6.571 4.817C14.39 16.061 18.839 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.66 8.337 6.306 14.691z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.18 0 9.925-1.977 13.49-5.205l-6.228-5.27C29.058 35.917 26.671 36.8 24 36.8c-5.192 0-9.616-3.317-11.277-7.946l-6.52 5.026C9.513 39.556 16.21 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.18 4.186-3.999 5.531.001-.001 6.697 5.372 6.697 5.372C41.707 35.863 44 30.38 44 24c0-1.341-.138-2.651-.389-3.917z"
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
