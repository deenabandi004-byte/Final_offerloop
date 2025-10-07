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

const getMonthKey = () => new Date().toISOString().slice(0, 7);
const initialCreditsByTier = (tier: "free" | "pro") => (tier === "free" ? 120 : 840);

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
  gmailAccessToken?: string;
  gmailRefreshToken?: string;
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
        await setPersistence(auth, browserLocalPersistence);
      } catch {}
      finally {
        unsub = onIdTokenChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            await loadUserData(firebaseUser);
          } else {
            setUser(null);
          }
          setIsLoading(false);
        });
      }
    })();
    return () => { if (unsub) unsub(); };
  }, []);

  const loadUserData = async (firebaseUser: FirebaseUser) => {
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const d = snap.data() as Partial<User>;
        setUser({
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
          gmailAccessToken: d.gmailAccessToken,
          gmailRefreshToken: d.gmailRefreshToken,
        });
      } else {
        const newUser: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: firebaseUser.displayName || "",
          picture: firebaseUser.photoURL || undefined,
          tier: "free",
          credits: 120,
          maxCredits: 120,
          emailsMonthKey: getMonthKey(),
          emailsUsedThisMonth: 0,
          needsOnboarding: true,
        };
        await setDoc(userDocRef, { ...newUser, createdAt: new Date().toISOString() });
        setUser(newUser);
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
      
      // ✅ ADD ONLY THE THREE GMAIL SCOPES YOU'RE USING
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
      provider.addScope('https://www.googleapis.com/auth/gmail.compose');
      provider.addScope('https://www.googleapis.com/auth/gmail.send');
      
      // Set custom parameters for OAuth
      const customParams: any = {
        access_type: 'offline', // Request refresh token
        prompt: opts?.prompt || 'consent', // Force consent screen to show
      };
      
      provider.setCustomParameters(customParams);

      console.log('🔐 Starting sign-in with Gmail scopes...');
      const result = await signInWithPopup(auth, provider);
      const info = getAdditionalUserInfo(result);
      
      // ✅ GET OAUTH CREDENTIALS
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      
      console.log('✅ OAuth Access Token:', accessToken ? 'Received ✓' : '❌ Not received');
      console.log('📧 User email:', result.user.email);

      const uid = result.user.uid;
      const ref = doc(db, "users", uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        // New user - create document
        console.log('🆕 Creating new user document with Gmail token');
        await setDoc(ref, {
          uid,
          email: result.user.email || "",
          name: result.user.displayName || "",
          picture: result.user.photoURL || undefined,
          tier: "free",
          credits: 120,
          maxCredits: 120,
          emailsMonthKey: getMonthKey(),
          emailsUsedThisMonth: 0,
          needsOnboarding: true,
          createdAt: new Date().toISOString(),
          gmailAccessToken: accessToken, // Store access token
          lastSignIn: new Date().toISOString(),
        });
        return "onboarding";
      }

      // Existing user - update with new access token
      console.log('🔄 Updating existing user with new Gmail token');
      if (accessToken) {
        await updateDoc(ref, {
          gmailAccessToken: accessToken,
          lastSignIn: new Date().toISOString(),
        });
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
      await firebaseSignOut(auth);
      setUser(null);
    } catch (error) {
      console.error("Sign out failed:", error);
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
      gmailAccessToken: user.gmailAccessToken, // Preserve Gmail token
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