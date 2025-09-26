// src/App.tsx
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
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

// ---------- Route Guards ----------
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useFirebaseAuth();
  const loc = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    const returnTo = encodeURIComponent(loc.pathname + loc.search + loc.hash);
    return <Navigate to={`/signin?mode=signin&returnTo=${returnTo}`} replace />;
  }

  if (user.needsOnboarding) {
  // Don't redirect if already on onboarding page
    if (loc.pathname === '/onboarding') {
      return <>{children}</>;
    }
    const returnTo = encodeURIComponent(loc.pathname + loc.search + loc.hash);
    return <Navigate to={`/onboarding?returnTo=${returnTo}`} replace />;
  } 

  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useFirebaseAuth();
  if (isLoading) return null;

  // If user is signed in, redirect appropriately
  if (user) {
    if (user.needsOnboarding) {
      return <Navigate to="/onboarding" replace />;
    } else {
      return <Navigate to="/home" replace />;
    }
  }

  return <>{children}</>;
};

// ---------- App Routes ----------
const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Landing Page */}
      <Route path="/" element={<PublicRoute><Index /></PublicRoute>} />

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
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/contact-directory" element={<ProtectedRoute><ContactDirectory /></ProtectedRoute>} />
      <Route path="/account-settings" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
      <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />

      {/* Public informational pages */}
      <Route path="/about" element={<PublicRoute><AboutUs /></PublicRoute>} />
      <Route path="/contact" element={<PublicRoute><Contact /></PublicRoute>} />
      <Route path="/contact-us" element={<PublicRoute><ContactUs /></PublicRoute>} />

      {/* Legal pages (short + long paths both supported) */}
      <Route path="/privacy" element={<PublicRoute><PrivacyPolicy /></PublicRoute>} />
      <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />

      <Route path="/terms" element={<PublicRoute><TermsOfService /></PublicRoute>} />
      <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />

      {/* Settings version of Terms */}
      <Route path="/terms-of-service-settings" element={<PublicRoute><TermsOfServiceSettings /></PublicRoute>} />

      {/* Catch-all */}
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
