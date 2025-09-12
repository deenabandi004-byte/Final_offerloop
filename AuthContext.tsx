import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from './firebase-config';

interface User {
  email: string;
  name: string;
  picture?: string;
  accessToken: string;
}

interface AuthContextType {
  user: User | null;
  signIn: () => Promise<void>;
  signOut: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Google OAuth configuration - matches your Flask app
  const GOOGLE_CLIENT_ID = '464822670976-htb19rt0rp079f5h3m0jk86m5ecq4rfi.apps.googleusercontent.com';
  const SCOPES = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
  const REDIRECT_URI = 'http://localhost:8080/auth/callback'; // React app callback

  useEffect(() => {
    // Load Google Identity Services script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleAuth;
    document.head.appendChild(script);

    // Check for existing auth on page load
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const initializeGoogleAuth = () => {
    if (window.google) {
      console.log('✅ Google Identity Services initialized');
    }
  };

  const signIn = async (): Promise<void> => {
    try {
      setIsLoading(true);
      
      // Create OAuth URL for popup
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('include_granted_scopes', 'true');
      authUrl.searchParams.set('state', Math.random().toString(36).substring(2, 15));

      // Open popup window
      const popup = window.open(
        authUrl.toString(),
        'google-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Listen for popup messages
      const authPromise = new Promise<string>((resolve, reject) => {
        const messageListener = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          
          if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
            window.removeEventListener('message', messageListener);
            popup.close();
            resolve(event.data.code);
          } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
            window.removeEventListener('message', messageListener);
            popup.close();
            reject(new Error(event.data.error));
          }
        };

        window.addEventListener('message', messageListener);

        // Check if popup was closed manually
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
            reject(new Error('Authentication cancelled'));
          }
        }, 1000);
      });

      // Get authorization code from popup
      const authCode = await authPromise;

      // Exchange code for tokens via your Flask backend
      const response = await fetch('http://localhost:5001/auth/google/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: authCode }),
      });

      if (!response.ok) {
        throw new Error('Failed to authenticate with backend');
      }

      const userData = await response.json();
      
      // Store user data
      const user: User = {
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
        accessToken: userData.access_token,
      };

      setUser(user);
      localStorage.setItem('user', JSON.stringify(user));
      
      console.log('✅ Authentication successful:', user.email);
      
    } catch (error) {
      console.error('❌ Authentication failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('user');
    console.log('✅ User signed out');
  };

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
