import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { FirebaseAuthProvider, useFirebaseAuth } from "./contexts/FirebaseAuthContext";

// Pages
import Index from "./pages/Index";
import Home from "./pages/Home";
import SignIn from "./pages/SignIn";
import AuthCallback from "./pages/AuthCallback";
import AboutUs from "./pages/AboutUs";
import Contact from "./pages/Contact";
import ContactDirectory from "./pages/ContactDirectory";
import ContactUs from "./pages/ContactUs";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import TermsOfServiceSettings from "./pages/TermsOfServiceSettings";
import AccountSettings from "./pages/AccountSettings";
import Pricing from "./pages/Pricing";
import News from "./pages/News";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

// New Lovable Onboarding Flow
import { OnboardingFlow } from "./pages/OnboardingFlow";

const queryClient = new QueryClient();

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useFirebaseAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/signin" replace />;
  }
  
  return <>{children}</>;
};

// Onboarding Check Component
const OnboardingCheck: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useFirebaseAuth();
  
  // Check if user has completed onboarding
  const hasCompletedOnboarding = localStorage.getItem('onboardingCompleted') === 'true';
  
  if (user && !hasCompletedOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { user } = useFirebaseAuth();
  
  const handleOnboardingComplete = (data: any) => {
    console.log('Onboarding completed with data:', data);
    
    // Save onboarding data
    localStorage.setItem('onboardingData', JSON.stringify(data));
    localStorage.setItem('onboardingCompleted', 'true');
    
    // You can also save to Firebase here if needed
    // await firebaseApi.saveUserProfile(user.uid, data);
    
    // Navigation will be handled by the OnboardingFlow component
  };
  
  return (
    <Routes>
      {/* Public Landing Page */}
      <Route path="/" element={<Index />} />
      
      {/* Auth Routes */}
      <Route path="/signin" element={<SignIn />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      
      {/* Onboarding Flow */}
      <Route 
        path="/onboarding" 
        element={
          user ? (
            <OnboardingFlow onComplete={handleOnboardingComplete} />
          ) : (
            <Navigate to="/signin" state={{ from: '/onboarding' }} replace />
          )
        } 
      />
      
      {/* Signup redirects to signin with intent to onboard */}
      <Route 
      path="/signup" 
      element={<Navigate to="/signin?mode=signup" replace />} 
      />
      <Route 
        path="/onboarding/*" 
        element={<Navigate to="/onboarding" replace />} 
      />
      
      {/* Protected Routes - Require Auth & Onboarding */}
      <Route 
        path="/home" 
        element={
          <ProtectedRoute>
            <OnboardingCheck>
              <Home />
            </OnboardingCheck>
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <OnboardingCheck>
              <Dashboard />
            </OnboardingCheck>
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/contact-directory" 
        element={
          <ProtectedRoute>
            <OnboardingCheck>
              <ContactDirectory />
            </OnboardingCheck>
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/account-settings" 
        element={
          <ProtectedRoute>
            <OnboardingCheck>
              <AccountSettings />
            </OnboardingCheck>
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/pricing" 
        element={
          <ProtectedRoute>
            <OnboardingCheck>
              <Pricing />
            </OnboardingCheck>
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/news" 
        element={
          <ProtectedRoute>
            <OnboardingCheck>
              <News />
            </OnboardingCheck>
          </ProtectedRoute>
        } 
      />
      
      {/* Public Pages */}
      <Route path="/about" element={<AboutUs />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/contact-us" element={<ContactUs />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/terms-of-service" element={<TermsOfServiceSettings />} />
      
      {/* Catch-all route - must be last */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FirebaseAuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </FirebaseAuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;