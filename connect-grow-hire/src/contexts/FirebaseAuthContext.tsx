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
  /** Returns the final destination: "onboarding" or "home" */
  signIn: (opts?: SignInOptions) => Promise<NextRoute>;
  signOut: () => void;
  updateUser: (updates: Partial<User>) => Promise<void>;
  updateCredits: (newCredits: number) => Promise<void>;
  checkCredits: () => Promise<number>;
  completeOnboarding: (onboardingData: any) => Promise<void>;
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
          emailsMonthKey: d.emailsMonthKey || getMonthKey(),
          emailsUsedThisMonth: d.emailsUsedThisMonth ?? 0,
          needsOnboarding: d.needsOnboarding ?? false,
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

  /** Decide the final route (onboarding/home) by checking Firestore immediately */
  const signIn = async (opts?: SignInOptions): Promise<NextRoute> => {
    try {
      setIsLoading(true);
      const provider = new GoogleAuthProvider();
      if (opts?.prompt) provider.setCustomParameters({ prompt: opts.prompt });

      const result = await signInWithPopup(auth, provider);
      const info = getAdditionalUserInfo(result);

      // Check Firestore for this user right away
      const uid = result.user.uid;
      const ref = doc(db, "users", uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        // Seed a minimal record if something raced ahead of onIdTokenChanged
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
        });
        return "onboarding";
      }

      const data = snap.data() as Partial<User>;
      const needs = data.needsOnboarding ?? !!info?.isNewUser;
      return needs ? "onboarding" : "home";
    } catch (error) {
      console.error("Authentication failed:", error);
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
      value={{ user, signIn, signOut, updateUser, updateCredits, checkCredits, completeOnboarding, isLoading }}
    >
      {children}
    </FirebaseAuthContext.Provider>
  );
};
