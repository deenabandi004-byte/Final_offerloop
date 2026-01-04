// src/App.tsx
import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { FirebaseAuthProvider, useFirebaseAuth } from "./contexts/FirebaseAuthContext";
import { ScoutProvider } from "./contexts/ScoutContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DynamicGradientBackground } from "./components/background/DynamicGradientBackground";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { ScoutSidePanel } from "./components/ScoutSidePanel";
import { LoadingContainer } from "./components/ui/LoadingBar";

// Keep critical pages non-lazy for faster initial load
import Index from "./pages/Index";
import SignIn from "./pages/SignIn";
import AuthCallback from "./pages/AuthCallback";
import UscBeta from "@/pages/UscBeta";

// Lazy load heavy pages for code splitting
const Home = React.lazy(() => import("./pages/Home"));
const AboutUs = React.lazy(() => import("./pages/AboutUs"));
const Contact = React.lazy(() => import("./pages/Contact"));
const CoffeeChatLibrary = React.lazy(() => import("./pages/CoffeeChatLibrary"));
const ContactDirectory = React.lazy(() => import("./pages/ContactDirectory"));
const ContactUs = React.lazy(() => import("./pages/ContactUs"));
const PrivacyPolicy = React.lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = React.lazy(() => import("./pages/TermsOfService"));
const TermsOfServiceSettings = React.lazy(() => import("./pages/TermsOfServiceSettings"));
const AccountSettings = React.lazy(() => import("./pages/AccountSettings"));
const Pricing = React.lazy(() => import("./pages/Pricing"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));
const JobBoardPage = React.lazy(() => import("./pages/JobBoardPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const PaymentSuccess = React.lazy(() => import("./pages/PaymentSuccess"));
// Feature Pages - These are the largest, most important to lazy load
const CoffeeChatPrepPage = React.lazy(() => import("./pages/CoffeeChatPrepPage"));
const ContactSearchPage = React.lazy(() => import("./pages/ContactSearchPage"));
const InterviewPrepPage = React.lazy(() => import("./pages/InterviewPrepPage"));
const FirmSearchPage = React.lazy(() => import("./pages/FirmSearchPage"));
const ScoutPage = React.lazy(() => import("./pages/ScoutPage"));
const ApplicationLabPage = React.lazy(() => import("./pages/ApplicationLabPage"));
// New Lovable Onboarding Flow
const OnboardingFlow = React.lazy(() => import("./pages/OnboardingFlow").then(m => ({ default: m.OnboardingFlow })));

// Optimized QueryClient with caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <LoadingSkeleton />
  </div>
);

// Environment-based logging helper
const isDev = import.meta.env.DEV;
const devLog = (...args: any[]) => {
  if (isDev) console.log(...args);
};

/* ---------------- Route Guards ---------------- */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useFirebaseAuth();
  const loc = useLocation();

  // Check if coming from sign-out - don't redirect if so
  const params = new URLSearchParams(loc.search);
  const isSignedOut = params.get('signedOut') === 'true';

  devLog("🔒 [PROTECTED ROUTE] Route check:", {
    path: loc.pathname,
    search: loc.search,
    isLoading,
    hasUser: !!user,
    userEmail: user?.email || "none",
    needsOnboarding: user?.needsOnboarding || false,
    isSignedOut
  });

  if (isLoading) {
    devLog("🔒 [PROTECTED ROUTE] Still loading auth state, showing loading bar");
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <LoadingContainer 
          label="Loading Offerloop..." 
          sublabel="Please wait" 
        />
      </div>
    );
  }

  // If signed out flag is present, redirect to landing page instead of signin
  if (isSignedOut) {
    devLog("🔒 [PROTECTED ROUTE] signedOut=true detected, redirecting to landing page");
    return <Navigate to="/?signedOut=true" replace />;
  }

  if (!user) {
    const returnTo = encodeURIComponent(loc.pathname + loc.search + loc.hash);
    devLog("🔒 [PROTECTED ROUTE] No user, redirecting to signin with returnTo:", returnTo);
    return <Navigate to={`/signin?mode=signin&returnTo=${returnTo}`} replace />;
  }

  if (user.needsOnboarding) {
    if (loc.pathname === "/onboarding") {
      devLog("🔒 [PROTECTED ROUTE] User needs onboarding and is on onboarding page, allowing access");
      return <>{children}</>;
    }
    const returnTo = encodeURIComponent(loc.pathname + loc.search + loc.hash);
    devLog("🔒 [PROTECTED ROUTE] User needs onboarding, redirecting to /onboarding");
    return <Navigate to={`/onboarding?returnTo=${returnTo}`} replace />;
  }

  devLog("🔒 [PROTECTED ROUTE] User authenticated, allowing access");
  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useFirebaseAuth();
  const location = useLocation();
  
  // Check if coming from sign-out - skip redirect if so
  const params = new URLSearchParams(location.search);
  const isSignedOut = params.get('signedOut') === 'true';
  
  devLog("🛣️ [PUBLIC ROUTE] Route check:", {
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
    devLog("🛣️ [PUBLIC ROUTE] Still loading auth state, showing spinner");
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If explicitly signed out, always show the landing page regardless of user state
  // This prevents the race condition where user state hasn't fully cleared yet
  if (isSignedOut) {
    devLog("🛣️ [PUBLIC ROUTE] signedOut=true detected, showing landing page (ignoring user state)");
    return <>{children}</>;
  }

  // Only redirect authenticated users if they're not coming from sign-out
  if (user) {
    const redirectPath = user.needsOnboarding ? "/onboarding" : "/home";
    devLog("🛣️ [PUBLIC ROUTE] User authenticated, redirecting to:", redirectPath);
    return user.needsOnboarding ? (
      <Navigate to="/onboarding" replace />
    ) : (
      <Navigate to="/home" replace />
    );
  }
  
  devLog("🛣️ [PUBLIC ROUTE] No user, showing public content");
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
            <Suspense fallback={<PageLoader />}>
              <OnboardingFlow onComplete={() => { /* handled in component */ }} />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route path="/onboarding/*" element={<Navigate to="/onboarding" replace />} />

      {/* Protected App Pages - Wrapped in Suspense for lazy loading */}
      <Route path="/home" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Home /></Suspense></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><DashboardPage /></Suspense></ProtectedRoute>} />
      <Route path="/contact-directory" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ContactDirectory /></Suspense></ProtectedRoute>} />
      <Route path="/coffee-chat-library" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CoffeeChatLibrary /></Suspense></ProtectedRoute>} />
      <Route path="/account-settings" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><AccountSettings /></Suspense></ProtectedRoute>} />
      <Route path="/pricing" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Pricing /></Suspense></ProtectedRoute>} />
      <Route path="/payment-success" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><PaymentSuccess /></Suspense></ProtectedRoute>} />
      
      {/* Feature Pages - Largest pages, most important to lazy load */}
      <Route path="/coffee-chat-prep" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CoffeeChatPrepPage /></Suspense></ProtectedRoute>} />
      <Route path="/contact-search" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ContactSearchPage /></Suspense></ProtectedRoute>} />
      <Route path="/interview-prep" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InterviewPrepPage /></Suspense></ProtectedRoute>} />
      <Route path="/firm-search" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><FirmSearchPage /></Suspense></ProtectedRoute>} />
      <Route path="/job-board" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><JobBoardPage /></Suspense></ProtectedRoute>} />
      <Route path="/scout" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ScoutPage /></Suspense></ProtectedRoute>} />
      <Route path="/application-lab" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ApplicationLabPage /></Suspense></ProtectedRoute>} />

      {/* Public informational pages */}
      <Route path="/about" element={<Suspense fallback={<PageLoader />}><AboutUs /></Suspense>} />
      <Route path="/contact" element={<Suspense fallback={<PageLoader />}><Contact /></Suspense>} />
      <Route path="/contact-us" element={<Suspense fallback={<PageLoader />}><ContactUs /></Suspense>} />

      {/* Legal pages + canonical redirects */}
      <Route path="/privacy" element={<Suspense fallback={<PageLoader />}><PrivacyPolicy /></Suspense>} />
      <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
      <Route path="/terms-of-service" element={<Suspense fallback={<PageLoader />}><TermsOfService /></Suspense>} />
      <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />

      {/* Settings-specific Terms (kept public like in your file) */}
      <Route path="/terms-of-service-settings" element={<PublicRoute><Suspense fallback={<PageLoader />}><TermsOfServiceSettings /></Suspense></PublicRoute>} />

      {/* 404 */}
      <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
    </Routes>
  );
};

/* ---------------- Conditional Background Wrapper ---------------- */
const ConditionalBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isLandingPage = location.pathname === '/';
  
  return (
    <div className="relative min-h-screen">
      {isLandingPage && <DynamicGradientBackground />}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

/* ---------------- App Root ---------------- */
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FirebaseAuthProvider>
          <ErrorBoundary>
            <BrowserRouter
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <ConditionalBackground>
                <Toaster />
                <Sonner />
                <ScoutProvider>
                  <AppRoutes />
                  <ScoutSidePanel />
                </ScoutProvider>
              </ConditionalBackground>
            </BrowserRouter>
          </ErrorBoundary>
        </FirebaseAuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
