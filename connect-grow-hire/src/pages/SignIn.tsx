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
  signOut,
  getAdditionalUserInfo,
} from "firebase/auth";

type Tab = "signin" | "signup";

const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, isLoading } = useFirebaseAuth();

  const initialTab: Tab = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("mode") === "signup" ? "signup" : "signin";
  }, [location.search]);

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !isLoading) {
      const timer = setTimeout(() => {
        if (user.needsOnboarding) {
          navigate("/onboarding", { replace: true });
        } else {
          navigate("/home", { replace: true });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user, isLoading, navigate]);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  const handleGoogleAuth = async () => {
    if (submitting || isLoading) return;
    setSubmitting(true);
    try {
      const auth = getAuth();

      // Always sign out first so Google shows the account chooser
      if (auth.currentUser) {
        await signOut(auth);
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account", // or "consent select_account" if you want consent screen too
      });

      const result = await signInWithPopup(auth, provider);

      const info = getAdditionalUserInfo(result);
      const isNewUser = !!info?.isNewUser;

      toast({
        title: activeTab === "signup" || isNewUser ? "Welcome! 🎉" : "Signed in",
        description:
          activeTab === "signup" || isNewUser
            ? "Account created. Finishing setup…"
            : "Welcome back! Redirecting…",
      });
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
              {/* Google icon */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303..."/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.817C14.39..."/>
                <path fill="#4CAF50" d="M24 44c5.18 0 9.925-1.977 13.49..."/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303..."/>
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
