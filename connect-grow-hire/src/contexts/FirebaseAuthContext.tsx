import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  User as FirebaseUser,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { GoogleAuthProvider } from 'firebase/auth';

const getMonthKey = () => new Date().toISOString().slice(0, 7);

const initialCreditsByTier = (tier: 'free' | 'pro') =>
  tier === 'free' ? 120 : 840;

const monthlyEmailLimitByTier = (tier: 'free' | 'pro') =>
  tier === 'free' ? 8 : 56;

interface User {
  uid: string;
  email: string;
  name: string;
  picture?: string;
  accessToken?: string;
  tier: 'free' | 'pro';
  credits: number;
  maxCredits: number;
  subscriptionId?: string;
  emailsUsedThisMonth?: number;
  emailsMonthKey?: string;
  needsOnboarding?: boolean;
}

type SignInOptions = {
  /** Optional Google prompt override ('select_account' | 'consent') */
  prompt?: 'select_account' | 'consent';
};

interface AuthContextType {
  user: User | null;
  signIn: (opts?: SignInOptions) => Promise<void>;
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
  if (context === undefined) {
    throw new Error('useFirebaseAuth must be used within a FirebaseAuthProvider');
  }
  return context;
};

interface FirebaseAuthProviderProps {
  children: React.ReactNode;
}

export const FirebaseAuthProvider: React.FC<FirebaseAuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await loadUserData(firebaseUser);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadUserData = async (firebaseUser: FirebaseUser) => {
    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const loaded: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || '',
          picture: firebaseUser.photoURL || undefined,
          tier: userData.tier || 'free',
          credits: userData.credits || initialCreditsByTier(userData.tier || 'free'),
          maxCredits: userData.maxCredits || initialCreditsByTier(userData.tier || 'free'),
          emailsMonthKey: userData.emailsMonthKey || getMonthKey(),
          emailsUsedThisMonth: userData.emailsUsedThisMonth || 0,
          needsOnboarding: false,
        };
        setUser(loaded);
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log('Existing user loaded');
        }
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.log('New user detected, needs onboarding');
        }
        const newUser: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || '',
          picture: firebaseUser.photoURL || undefined,
          tier: 'free',
          credits: 120,  // Default credits for new free tier users
          maxCredits: 120,
          emailsMonthKey: getMonthKey(),
          emailsUsedThisMonth: 0,
          needsOnboarding: true,  // This MUST be true for new users
        };
        
        // CREATE the Firestore document for new users immediately
        await setDoc(doc(db, 'users', firebaseUser.uid), {
          ...newUser,
          createdAt: new Date().toISOString()
        });
        
        setUser(newUser);
        console.log('New user document created in Firestore');
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      setUser(null);
    }
  };

  /** Sign in; allow optional chooser/consent prompt override */
  const signIn = async (opts?: SignInOptions): Promise<void> => {
    try {
      setIsLoading(true);
      const provider = new GoogleAuthProvider();
      if (opts?.prompt) {
        provider.setCustomParameters({ prompt: opts.prompt });
      }
      await signInWithPopup(auth, provider);
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('Authentication successful');
      }
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('User signed out');
      }
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const updateUser = async (updates: Partial<User>) => {
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, updates);
        setUser({ ...user, ...updates });
      } catch (error) {
        console.error('Error updating user:', error);
        throw error;
      }
    }
  };

  const updateCredits = async (newCredits: number) => {
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { credits: newCredits });
        setUser({ ...user, credits: newCredits });
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log(`Credits updated to ${newCredits}`);
        }
      } catch (error) {
        console.error('Error updating credits:', error);
        throw error;
      }
    }
  };

  const checkCredits = async (): Promise<number> => {
    if (!user) return 0;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const data = userDoc.data();
        const credits = data.credits || 0;

        if (credits !== user.credits) {
          setUser({ ...user, credits });
        }
        return credits;
      }
      return 0;
    } catch (error) {
      console.error('Error checking credits:', error);
      return user.credits || 0;
    }
  };

  const completeOnboarding = async (onboardingData: any) => {
  if (user) {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      
      // Clean the onboarding data to remove undefined values
      const cleanData = (obj: any): any => {
        const cleaned: any = {};
        Object.keys(obj).forEach(key => {
          if (obj[key] !== undefined) {
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
              cleaned[key] = cleanData(obj[key]);
            } else {
              cleaned[key] = obj[key];
            }
          }
        });
        return cleaned;
      };
      
      const cleanedOnboardingData = cleanData(onboardingData);
      
      const userData = {
        ...cleanedOnboardingData,
        uid: user.uid,
        email: user.email,
        name: user.name,
        picture: user.picture,
        tier: 'free',
        credits: initialCreditsByTier('free'),
        maxCredits: initialCreditsByTier('free'),
        emailsMonthKey: getMonthKey(),
        emailsUsedThisMonth: 0,
        createdAt: new Date().toISOString(),
        needsOnboarding: false,
      };

      await setDoc(userDocRef, userData);
      setUser({
        ...user,
        ...userData,
        needsOnboarding: false,
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log('Onboarding completed and user saved to database');
      }
    } catch (error) {
      console.error('Error completing onboarding:', error);
      throw error;
    }
  }
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
        isLoading,
      }}
    >
      {children}
    </FirebaseAuthContext.Provider>
  );
};