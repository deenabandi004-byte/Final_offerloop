// src/App.tsx
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { FirebaseAuthProvider, useFirebaseAuth } from "./contexts/FirebaseAuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DynamicGradientBackground } from "./components/background/DynamicGradientBackground";
import UscBeta from "@/pages/UscBeta";

// Pages
import Index from "./pages/Index";
import Home from "./pages/Home";
import SignIn from "./pages/SignIn";
import AuthCallback from "./pages/AuthCallback";
import AboutUs from "./pages/AboutUs";
import Contact from "./pages/Contact";
import CoffeeChatLibrary from "./pages/CoffeeChatLibrary";
import ContactDirectory from "./pages/ContactDirectory";
import ContactUs from "./pages/ContactUs";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import TermsOfServiceSettings from "./pages/TermsOfServiceSettings";
import AccountSettings from "./pages/AccountSettings";
import Pricing from "./pages/Pricing";
import Dashboard from "./pages/Dashboard";
import DashboardPage from "./pages/DashboardPage";
import NotFound from "./pages/NotFound";
import PaymentSuccess from "./pages/PaymentSuccess";
// Feature Pages
import CoffeeChatPrepPage from "./pages/CoffeeChatPrepPage";
import ContactSearchPage from "./pages/ContactSearchPage";
import InterviewPrepPage from "./pages/InterviewPrepPage";
import FirmSearchPage from "./pages/FirmSearchPage";
// New Lovable Onboarding Flow
import { OnboardingFlow } from "./pages/OnboardingFlow";

const queryClient = new QueryClient();

/* ---------------- Route Guards ---------------- */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useFirebaseAuth();
  const loc = useLocation();

  // Check if coming from sign-out - don't redirect if so
  const params = new URLSearchParams(loc.search);
  const isSignedOut = params.get('signedOut') === 'true';

  console.log("🔒 [PROTECTED ROUTE] Route check:", {
    path: loc.pathname,
    search: loc.search,
    isLoading,
    hasUser: !!user,
    userEmail: user?.email || "none",
    needsOnboarding: user?.needsOnboarding || false,
    isSignedOut
  });

  if (isLoading) {
    console.log("🔒 [PROTECTED ROUTE] Still loading auth state, showing spinner");
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If signed out flag is present, redirect to landing page instead of signin
  if (isSignedOut) {
    console.log("🔒 [PROTECTED ROUTE] signedOut=true detected, redirecting to landing page");
    return <Navigate to="/?signedOut=true" replace />;
  }

  if (!user) {
    const returnTo = encodeURIComponent(loc.pathname + loc.search + loc.hash);
    console.log("🔒 [PROTECTED ROUTE] No user, redirecting to signin with returnTo:", returnTo);
    return <Navigate to={`/signin?mode=signin&returnTo=${returnTo}`} replace />;
  }

  if (user.needsOnboarding) {
    if (loc.pathname === "/onboarding") {
      console.log("🔒 [PROTECTED ROUTE] User needs onboarding and is on onboarding page, allowing access");
      return <>{children}</>;
    }
    const returnTo = encodeURIComponent(loc.pathname + loc.search + loc.hash);
    console.log("🔒 [PROTECTED ROUTE] User needs onboarding, redirecting to /onboarding");
    return <Navigate to={`/onboarding?returnTo=${returnTo}`} replace />;
  }

  console.log("🔒 [PROTECTED ROUTE] User authenticated, allowing access");
  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useFirebaseAuth();
  const location = useLocation();
  
  // Check if coming from sign-out - skip redirect if so
  const params = new URLSearchParams(location.search);
  const isSignedOut = params.get('signedOut') === 'true';
  
  console.log("🛣️ [PUBLIC ROUTE] Route check:", {
    path: location.pathname,
    search: location.search,
    isSignedOut,
    isLoading,
    hasUser: !!user,
    userEmail: user?.email || "none",
    needsOnboarding: user?.needsOnboarding || false
  });
  
  // Show loading spinner instead of null to avoid blank page
  if (isLoading) {
    console.log("🛣️ [PUBLIC ROUTE] Still loading auth state, showing spinner");
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If explicitly signed out, always show the landing page regardless of user state
  // This prevents the race condition where user state hasn't fully cleared yet
  if (isSignedOut) {
    console.log("🛣️ [PUBLIC ROUTE] signedOut=true detected, showing landing page (ignoring user state)");
    return <>{children}</>;
  }

  // Only redirect authenticated users if they're not coming from sign-out
  if (user) {
    const redirectPath = user.needsOnboarding ? "/onboarding" : "/home";
    console.log("🛣️ [PUBLIC ROUTE] User authenticated, redirecting to:", redirectPath);
    return user.needsOnboarding ? (
      <Navigate to="/onboarding" replace />
    ) : (
      <Navigate to="/home" replace />
    );
  }
  
  console.log("🛣️ [PUBLIC ROUTE] No user, showing public content");
  return <>{children}</>;
};

/* ---------------- Routes ---------------- */
const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Landing */}
      <Route path="/" element={<PublicRoute><Index /></PublicRoute>} />
      <Route path="/usc-beta" element={<UscBeta />} />

      {/* Auth */}
      <Route path="/signin" element={<PublicRoute><SignIn /></PublicRoute>} />
      <Route path="/signup" element={<Navigate to="/signin?mode=signup" replace />} />
      <Route path="/auth/callback" element={<PublicRoute><AuthCallback /></PublicRoute>} />

      {/* Onboarding */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingFlow onComplete={() => { /* handled in component */ }} />
          </ProtectedRoute>
        }
      />
      <Route path="/onboarding/*" element={<Navigate to="/onboarding" replace />} />

      {/* Protected App Pages */}
      <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/contact-directory" element={<ProtectedRoute><ContactDirectory /></ProtectedRoute>} />
      <Route path="/coffee-chat-library" element={<ProtectedRoute><CoffeeChatLibrary /></ProtectedRoute>} />
      <Route path="/account-settings" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
      <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
      <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
      
      {/* Feature Pages */}
      <Route path="/coffee-chat-prep" element={<ProtectedRoute><CoffeeChatPrepPage /></ProtectedRoute>} />
      <Route path="/contact-search" element={<ProtectedRoute><ContactSearchPage /></ProtectedRoute>} />
      <Route path="/interview-prep" element={<ProtectedRoute><InterviewPrepPage /></ProtectedRoute>} />
      <Route path="/firm-search" element={<ProtectedRoute><FirmSearchPage /></ProtectedRoute>} />
      


      {/* Public informational pages */}
      <Route path="/about" element={<AboutUs />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/contact-us" element={<ContactUs />} />

      {/* Legal pages + canonical redirects */}
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />

      {/* Settings-specific Terms (kept public like in your file) */}
      <Route path="/terms-of-service-settings" element={<PublicRoute><TermsOfServiceSettings /></PublicRoute>} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

/* ---------------- App Root ---------------- */
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <FirebaseAuthProvider>
            <div className="relative min-h-screen">
              <DynamicGradientBackground />
              <div className="relative z-10">
                <Toaster />
                <Sonner />
                <ErrorBoundary>
                  <BrowserRouter>
                    <AppRoutes />
                  </BrowserRouter>
                </ErrorBoundary>
              </div>
            </div>
          </FirebaseAuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
