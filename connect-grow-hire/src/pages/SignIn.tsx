// src/pages/SignIn.tsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { useToast } from "@/hooks/use-toast";

const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const { user, signIn, isLoading } = useFirebaseAuth();
  const { toast } = useToast();

  // Handle routing based on user status and onboarding needs
  useEffect(() => {
    console.log('🔍 SignIn useEffect triggered');
    console.log('📊 User state:', user);
    console.log('🔐 User exists?', !!user);
    console.log('⏳ Is loading?', isLoading);
    
    if (user) {
      console.log('👤 User details:', {
        email: user.email,
        name: user.name,
        uid: user.uid,
        needsOnboarding: user.needsOnboarding
      });
      
      if (user.needsOnboarding) {
        console.log('🆕 New user detected - redirecting to onboarding');
        navigate('/onboarding/resume-upload');
        toast({
          title: "Welcome to Offerloop!",
          description: "Let's get you set up",
        });
      } else {
        console.log('✅ Existing user - redirecting to home');
        navigate('/home');
        toast({
          title: "Welcome back!",
          description: `Hello ${user.name}!`,
        });
      }
      
      console.log('🚀 Navigation and toast triggered');
    }
  }, [user, navigate, toast, isLoading]);

  const handleGoogleSignIn = async () => {
    try {
      console.log('🔥 Starting Google sign in...');
      await signIn();
      console.log('✅ signIn() function completed');
    } catch (error) {
      console.error('❌ Sign in failed:', error);
      toast({
        title: "Sign-in failed",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  console.log('🔄 SignIn component rendering, user:', user);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Offerloop.ai</h1>
          <p className="text-gray-600">Sign in to access AI-powered recruiting tools</p>
        </div>

        {/* Features List - Updated for the new approach */}
        <div className="mb-8 space-y-3">
          <div className="flex items-center text-sm text-gray-600">
            <svg className="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Personalized email content generation
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <svg className="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Copy-paste ready recruiting emails
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <svg className="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Resume analysis for better matches
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <svg className="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Secure data with Google authentication
          </div>
        </div>

        {/* Google Sign In Button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full flex items-center justify-center space-x-3 px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path 
              fill="#4285F4" 
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path 
              fill="#34A853" 
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path 
              fill="#FBBC05" 
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path 
              fill="#EA4335" 
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>{isLoading ? 'Signing in...' : 'Continue with Google'}</span>
        </button>

        {/* Privacy Note - Updated */}
        <p className="text-xs text-gray-500 text-center mt-6">
          We generate emails in-app with one-click compose links.
        </p>


        {/* Back to Home */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-blue-600 hover:text-blue-700 underline"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignIn;