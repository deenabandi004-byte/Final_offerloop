import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { FirebaseAuthProvider } from "./contexts/FirebaseAuthContext";
import Index from "./pages/Index";
import Home from "./pages/Home";
import SignIn from "./pages/SignIn";
import AuthCallback from "./pages/AuthCallback";
import OnboardingResumeUpload from "./pages/OnboardingResumeUpload";
import Onboarding from "./pages/Onboarding";
import OnboardingAcademics from "./pages/OnboardingAcademics";
import OnboardingOpportunityPreferences from "./pages/OnboardingOpportunityPreferences";
import OnboardingLocationPreferences from "./pages/OnboardingLocationPreferences";
import OnboardingSignUp from "./pages/OnboardingSignUp";
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

const queryClient = new QueryClient();

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FirebaseAuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/home" element={<Home />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/onboarding/resume-upload" element={<OnboardingResumeUpload />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/onboarding/academics" element={<OnboardingAcademics />} />
            <Route path="/onboarding/opportunity-preferences" element={<OnboardingOpportunityPreferences />} />
            <Route path="/onboarding/location-preferences" element={<OnboardingLocationPreferences />} />
            <Route path="/onboarding/signup" element={<OnboardingSignUp />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/contact-directory" element={<ContactDirectory />} />
            <Route path="/contact-us" element={<ContactUs />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/terms-of-service" element={<TermsOfServiceSettings />} />
            <Route path="/account-settings" element={<AccountSettings />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/news" element={<News />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </FirebaseAuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;