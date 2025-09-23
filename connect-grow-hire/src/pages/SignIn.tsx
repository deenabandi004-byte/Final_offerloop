// src/pages/SignIn.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from 'lucide-react';

const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, isLoading } = useFirebaseAuth();
  const { toast } = useToast();
  
  // Check if user came from signup button or URL param
  const searchParams = new URLSearchParams(location.search);
  const isSignUpMode = searchParams.get('mode') === 'signup' || location.state?.from === '/onboarding';
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>(
    isSignUpMode ? 'signup' : 'signin'
  );
  
  // Track if this is a new signup
  const [isNewSignup, setIsNewSignup] = useState(false);

  useEffect(() => {
    console.log('SignIn useEffect triggered');
    console.log('User state:', user);
    console.log('Is loading?', isLoading);
    console.log('Active tab:', activeTab);
    console.log('Is new signup?', isNewSignup);
    
    if (user && !isLoading) {
      console.log('User details:', {
        email: user.email,
        name: user.name,
        uid: user.uid,
        needsOnboarding: user.needsOnboarding
      });
      
      // If user just signed up (was on signup tab), always go to onboarding
      if (activeTab === 'signup' || isNewSignup || user.needsOnboarding) {
        console.log('Directing to onboarding (signup flow or new user)');
        navigate('/onboarding');
        toast({
          title: "Welcome to Offerloop!",
          description: "Let's get you set up",
        });
      } else {
        // Only for existing users signing in
        const hasCompletedOnboarding = localStorage.getItem('onboardingCompleted') === 'true';
        
        if (!hasCompletedOnboarding) {
          console.log('Existing user but onboarding not completed - redirecting to onboarding');
          navigate('/onboarding');
          toast({
            title: "Welcome back!",
            description: "Let's finish setting up your profile",
          });
        } else {
          console.log('Existing user with completed onboarding - redirecting to home');
          navigate('/home');
          toast({
            title: "Welcome back!",
            description: `Hello ${user.name}!`,
          });
        }
      }
    }
  }, [user, navigate, toast, isLoading, activeTab, isNewSignup]);

  const handleGoogleSignIn = async () => {
    try {
      console.log('Starting Google sign in...');
      console.log('Current tab:', activeTab);
      
      // If on signup tab, mark as new signup
      if (activeTab === 'signup') {
        setIsNewSignup(true);
      }
      
      await signIn();
      console.log('signIn() function completed');
    } catch (error) {
      console.error('Sign in failed:', error);
      toast({
        title: "Sign-in failed",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="mb-8 flex items-center text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </button>

        <div className="bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-700">
          {/* Tab Navigation */}
          <div className="flex">
            <button
              onClick={() => setActiveTab('signin')}
              className={`flex-1 py-4 text-center font-semibold transition-all ${
                activeTab === 'signin'
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setActiveTab('signup')}
              className={`flex-1 py-4 text-center font-semibold transition-all ${
                activeTab === 'signup'
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Content */}
          <div className="p-8">
            {activeTab === 'signin' ? (
              <>
                <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
                <p className="text-gray-400 mb-8">
                  Sign in to access your AI-powered recruiting tools
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white mb-2">Create Your Account</h2>
                <p className="text-gray-400 mb-8">
                  Join thousands using AI to streamline their recruiting
                </p>
              </>
            )}

            {/* Google Auth Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-3 px-6 py-4 text-white bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-xl font-semibold transition-all transform hover:scale-[1.02] shadow-lg disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path 
                  fill="#ffffff" 
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path 
                  fill="#ffffff" 
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path 
                  fill="#ffffff" 
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path 
                  fill="#ffffff" 
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>
                {isLoading ? 'Processing...' : `${activeTab === 'signin' ? 'Sign In' : 'Sign Up'} with Google`}
              </span>
            </button>

            {/* Features List */}
            <div className="mt-8 space-y-3">
              <div className="flex items-center text-sm text-gray-400">
                <svg className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Personalized AI-generated emails
              </div>
              <div className="flex items-center text-sm text-gray-400">
                <svg className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Access to 2B+ professional contacts
              </div>
              <div className="flex items-center text-sm text-gray-400">
                <svg className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Secure with Google authentication
              </div>
              <div className="flex items-center text-sm text-gray-400">
                <svg className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                AI-powered resume matching
              </div>
            </div>

            {/* Toggle message */}
            <p className="text-center text-sm text-gray-400 mt-6">
              {activeTab === 'signin' ? (
                <>
                  Don't have an account?{' '}
                  <button
                    onClick={() => setActiveTab('signup')}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => setActiveTab('signin')}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;