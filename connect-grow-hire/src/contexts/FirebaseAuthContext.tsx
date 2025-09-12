import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  User as FirebaseUser,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  getIdToken
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

interface AuthContextType {
  user: User | null;
  signIn: () => Promise<void>;
  signOut: () => void;
  updateUser: (updates: Partial<User>) => Promise<void>;
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
      // Check if user exists in Firestore
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        // User exists - load their data
        const userData = userDoc.data();
        const user: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || '',
          picture: firebaseUser.photoURL || undefined,
          tier: userData.tier || 'free',
          credits: userData.credits || initialCreditsByTier(userData.tier || 'free'),
          maxCredits: userData.maxCredits || initialCreditsByTier(userData.tier || 'free'),
          emailsMonthKey: userData.emailsMonthKey || getMonthKey(),
          emailsUsedThisMonth: userData.emailsUsedThisMonth || 0,
          needsOnboarding: false, // Existing user doesn't need onboarding
        };
        setUser(user);
        console.log('Existing user loaded:', user);
      } else {
        // New user - needs onboarding
        console.log('New user detected, needs onboarding');
        const newUser: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || '',
          picture: firebaseUser.photoURL || undefined,
          tier: 'free',
          credits: 0,
          maxCredits: 0,
          emailsMonthKey: getMonthKey(),
          emailsUsedThisMonth: 0,
          needsOnboarding: true, // New user needs onboarding
        };
        setUser(newUser);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      setUser(null);
    }
  };

  const signIn = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const provider = new GoogleAuthProvider();
      // Remove Gmail scopes - no longer needed
      // provider.addScope('https://www.googleapis.com/auth/gmail.compose');
      // provider.addScope('https://www.googleapis.com/auth/gmail.modify');
      
      const result = await signInWithPopup(auth, provider);
      console.log('Authentication successful:', result.user.email);
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
      console.log('User signed out');
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const updateUser = async (updates: Partial<User>) => {
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, updates);
        
        const updatedUser = { ...user, ...updates };
        setUser(updatedUser);
      } catch (error) {
        console.error('Error updating user:', error);
        throw error;
      }
    }
  };

  const completeOnboarding = async (onboardingData: any) => {
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userData = {
          ...onboardingData,
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
        
        // Update local user state
        setUser({
          ...user,
          ...userData,
        });
        
        console.log('Onboarding completed and user saved to database');
      } catch (error) {
        console.error('Error completing onboarding:', error);
        throw error;
      }
    }
  };

  return (
    <FirebaseAuthContext.Provider value={{ 
      user, 
      signIn, 
      signOut, 
      updateUser, 
      completeOnboarding, 
      isLoading 
    }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
};