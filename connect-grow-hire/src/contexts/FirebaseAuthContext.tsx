// src/contexts/FirebaseAuthContext.tsx

"use client";


import React, { createContext, useContext, useState, useEffect } from "react";
import {
  User as FirebaseUser,
  signInWithPopup,
  signOut as firebaseSignOut,
  onIdTokenChanged,
  setPersistence,
  browserLocalPersistence,
  getAdditionalUserInfo,
  GoogleAuthProvider,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import posthog from "../lib/posthog";

const getMonthKey = () => new Date().toISOString().slice(0, 7);
const initialCreditsByTier = (tier: "free" | "pro" | "elite") => {
  if (tier === "free") return 300;
  if (tier === "pro") return 1500;
  if (tier === "elite") return 3000;
  return 300; // default to free
};

interface User {
  uid: string;
  email: string;
  name: string;
  picture?: string;
  accessToken?: string;
  tier: "free" | "pro";
  credits: number;
  maxCredits: number;
  subscriptionId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  emailsUsedThisMonth?: number;
  emailsMonthKey?: string;
  needsOnboarding?: boolean;

}

type SignInOptions = {
  prompt?: "select_account" | "consent";
};

type NextRoute = "onboarding" | "home";

interface AuthContextType {
  user: User | null;
  signIn: (opts?: SignInOptions) => Promise<NextRoute>;
  signOut: () => void;
  updateUser: (updates: Partial<User>) => Promise<void>;
  updateCredits: (newCredits: number) => Promise<void>;
  checkCredits: () => Promise<number>;
  completeOnboarding: (onboardingData: any) => Promise<void>;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const FirebaseAuthContext = createContext<AuthContextType | undefined>(undefined);

export const useFirebaseAuth = () => {
  const context = useContext(FirebaseAuthContext);
  if (!context) throw new Error("useFirebaseAuth must be used within a FirebaseAuthProvider");
  return context;
};

export const FirebaseAuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsub: undefined | (() => void);
    (async () => {
      try {
        console.log("🔐 [AUTH CONTEXT] Setting up auth state listener...");
        await setPersistence(auth, browserLocalPersistence);
      } catch {}
      finally {
        unsub = onIdTokenChanged(auth, async (firebaseUser) => {
          console.log("🔐 [AUTH CONTEXT] Auth state changed:", {
            hasUser: !!firebaseUser,
            userEmail: firebaseUser?.email || "none",
            userId: firebaseUser?.uid || "none"
          });
          if (firebaseUser) {
            console.log("🔐 [AUTH CONTEXT] Loading user data for:", firebaseUser.email);
            await loadUserData(firebaseUser);
            console.log("🔐 [AUTH CONTEXT] User data loaded");
          } else {
            console.log("🔐 [AUTH CONTEXT] No Firebase user, setting user state to null");
            setUser(null);
          }
          setIsLoading(false);
          console.log("🔐 [AUTH CONTEXT] Auth state update complete, isLoading set to false");
        });
      }
    })();
    return () => { 
      console.log("🔐 [AUTH CONTEXT] Cleaning up auth state listener");
      if (unsub) unsub(); 
    };
  }, []);

  const identifyUser = (user: User, userDocData?: any) => {
    try {
      const properties: Record<string, any> = {
        // Note: Email is NOT included to avoid sending PII to analytics
        // PostHog identifies users by UID, which is sufficient for tracking
        plan: user.tier || "free",
      };

      // Include signup_source if available in user document
      if (userDocData?.signup_source) {
        properties.signup_source = userDocData.signup_source;
      }

      posthog.identify(user.uid, properties);
      // Removed console.log to avoid exposing user data in browser console
    } catch (error) {
      // Only log errors, not user data
      console.error("❌ [PostHog] Failed to identify user:", error);
    }
  };

  const loadUserData = async (firebaseUser: FirebaseUser) => {
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const d = snap.data() as Partial<User>;
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: firebaseUser.displayName || "",
          picture: firebaseUser.photoURL || undefined,
          tier: d.tier || "free",
          credits: d.credits ?? initialCreditsByTier(d.tier || "free"),
          maxCredits: d.maxCredits ?? initialCreditsByTier(d.tier || "free"),
          stripeCustomerId: d.stripeCustomerId,
          stripeSubscriptionId: d.stripeSubscriptionId,
          subscriptionStatus: d.subscriptionStatus,
          subscriptionStartDate: d.subscriptionStartDate,
          subscriptionEndDate: d.subscriptionEndDate,
          emailsMonthKey: d.emailsMonthKey || getMonthKey(),
          emailsUsedThisMonth: d.emailsUsedThisMonth ?? 0,
          needsOnboarding: d.needsOnboarding ?? false,
          
        };
        setUser(userData);
        // Identify user after data is loaded
        identifyUser(userData, d);
      } else {
        const newUser: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: firebaseUser.displayName || "",
          picture: firebaseUser.photoURL || undefined,
          tier: "free",
          credits: 300,
          maxCredits: 300,
          emailsMonthKey: getMonthKey(),
          emailsUsedThisMonth: 0,
          needsOnboarding: true,
        };
        await setDoc(userDocRef, { ...newUser, createdAt: new Date().toISOString() });
        setUser(newUser);
        // Identify new user after data is set
        identifyUser(newUser);
      }
    } catch (err) {
      console.error("Error loading user data:", err);
      setUser(null);
    }
  };

const signIn = async (opts?: SignInOptions): Promise<NextRoute> => {
  try {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();

    // ✅ No Gmail scopes here anymore. We only sign the user into your app.
    if (opts?.prompt) {
      provider.setCustomParameters({ prompt: opts.prompt });
    }

    console.log('🔐 Starting basic Google sign-in (no Gmail scopes)');
    const result = await signInWithPopup(auth, provider);
    const info = getAdditionalUserInfo(result);

    // Ensure user doc exists (without storing Gmail tokens)
    const uid = result.user.uid;
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        email: result.user.email || "",
        name: result.user.displayName || "",
        picture: result.user.photoURL || undefined,
        tier: "free",
        credits: 300,
        maxCredits: 300,
        emailsMonthKey: getMonthKey(),
        emailsUsedThisMonth: 0,
        needsOnboarding: true,
        createdAt: new Date().toISOString(),
        lastSignIn: new Date().toISOString(),
      });
      return "onboarding";
    } else {
      await updateDoc(ref, { lastSignIn: new Date().toISOString() });
    }

    const data = snap.data() as Partial<User>;
    const needs = data.needsOnboarding ?? !!info?.isNewUser;
    console.log('✅ Sign-in complete. Needs onboarding:', needs);
    return needs ? "onboarding" : "home";
  } catch (error: any) {
    console.error("❌ Authentication failed:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    throw error;
  } finally {
    setIsLoading(false);
  }
};


  const signOut = async () => {
    try {
      console.log("🔐 [AUTH CONTEXT] signOut() called");
      console.log("🔐 [AUTH CONTEXT] Current user before signOut:", user?.email || "none");
      await firebaseSignOut(auth);
      // Reset PostHog user session
      try {
        posthog.reset();
        // Removed console.log to avoid logging user actions
      } catch (error) {
        // Only log errors, not user actions
        console.error("❌ [PostHog] Failed to reset session:", error);
      }
      console.log("🔐 [AUTH CONTEXT] Firebase signOut() completed, setting user state to null");
      setUser(null);
      console.log("🔐 [AUTH CONTEXT] User state set to null");
    } catch (error) {
      console.error("❌ [AUTH CONTEXT] Sign out failed:", error);
      console.error("❌ [AUTH CONTEXT] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        code: (error as any)?.code
      });
    }
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    await updateDoc(ref, updates);
    setUser({ ...user, ...updates });
  };

  const updateCredits = async (newCredits: number) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    await updateDoc(ref, { credits: newCredits });
    setUser({ ...user, credits: newCredits });
  };

  const checkCredits = async (): Promise<number> => {
    if (!user) return 0;
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() as Partial<User>) : {};
    const credits = data.credits ?? 0;
    if (credits !== user.credits) setUser({ ...user, credits });
    return credits;
  };

  const refreshUser = async () => {
    if (!auth.currentUser) {
      console.warn("No authenticated user to refresh");
      return;
    }
    
    try {
      await loadUserData(auth.currentUser);
      console.log("User data refreshed successfully");
    } catch (error) {
      console.error("Error refreshing user data:", error);
    }
  };

  const completeOnboarding = async (onboardingData: any) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);

    const clean = (obj: any): any => {
      const out: any = {};
      Object.keys(obj || {}).forEach((k) => {
        const v = obj[k];
        if (v !== undefined) out[k] = typeof v === "object" && v !== null && !Array.isArray(v) ? clean(v) : v;
      });
      return out;
    };

    const cleaned = clean(onboardingData);
    const payload = {
      ...cleaned,
      uid: user.uid,
      email: user.email,
      name: user.name,
      picture: user.picture,
      tier: "free",
      credits: initialCreditsByTier("free"),
      maxCredits: initialCreditsByTier("free"),
      emailsMonthKey: getMonthKey(),
      emailsUsedThisMonth: 0,
      createdAt: new Date().toISOString(),
      needsOnboarding: false,
       
    };

    await setDoc(ref, payload);
    setUser({ ...user, ...payload, needsOnboarding: false });
  };

  return (
    <FirebaseAuthContext.Provider
      value={{ 
        user, 
        signIn, 
        signOut, 
        updateUser, 
        updateCredits, 
        checkCredits, 
        completeOnboarding, 
        refreshUser,
        isLoading 
      }}
    >
      {children}
    </FirebaseAuthContext.Provider>
  );
};