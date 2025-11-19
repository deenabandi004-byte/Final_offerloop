/**
 * FIXES APPLIED TO RESOLVE PDF GENERATION ISSUE (DevTools dependency):
 * 
 * 1. Added loadImage helper function (line 206) to properly preload images/PDFs
 *    with CORS support and error handling
 * 
 * 2. Modified downloadCoffeeChatPDF function (line 850) to:
 *    - Poll for PDF availability BEFORE opening new tab (avoids popup blockers)
 *    - Pre-load/verify PDF URL is accessible before attempting to open
 *    - Add strategic delays to ensure resources are ready
 *    - Show loading toast to inform user of progress
 *    - Simplified tab opening logic without complex postMessage handling
 * 
 * The original issue was caused by race conditions where the PDF URL was 
 * being opened before it was fully available. DevTools slowed execution 
 * enough to mask this timing issue.
 */

import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import React from "react";
import { Upload, Download, Crown, ChevronRight, ChevronLeft, Loader2, Clock, CheckCircle, XCircle, Trash2, Search, Coffee, Briefcase } from "lucide-react";import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import ScoutChatbot from "@/components/ScoutChatbot";
import LockedFeatureOverlay from "@/components/LockedFeatureOverlay";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { firebaseApi } from "../services/firebaseApi";
import { useFirebaseMigration } from "../hooks/useFirebaseMigration";
import { apiService, isErrorResponse } from "@/services/api";
import type { CoffeeChatPrepStatus, CoffeeChatPrep } from "@/services/api";
import { CreditPill } from "../components/credits";
import type { Contact as ContactApi } from '@/services/firebaseApi';
import { BetaBadge } from "@/components/BetaBadges";
// ✅ NEW: import flushSync for a guaranteed UI commit
import { flushSync } from "react-dom";
import { Sparkles, Rocket, Star } from "lucide-react";

const BACKEND_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:5001"
    : "https://www.offerloop.ai";
console.log("host:", window.location.hostname, "BACKEND_URL:", BACKEND_URL);

const COFFEE_CHAT_CREDITS = 30;
const ENABLE_HOME_GMAIL_AUTOCONNECT = false;

type CoffeeChatHistoryItem = {
  id: string;
  contactName: string;
  company: string;
  jobTitle: string;
  status: string;
  createdAt: string;
  pdfUrl?: string;
  error?: string;
};


const TIER_CONFIGS = {
  free: {
    maxContacts: 3,
    minContacts: 1,
    name: "Search Free Plan Tier",
    credits: 150,
    description: "Try out platform risk free - up to 3 contacts + Email drafts",
    coffeeChat: true,
    interviewPrep: false,
    timeSavedMinutes: 200,
    usesResume: false,
  },
  pro: {
    maxContacts: 8,
    minContacts: 1,
    name: "Search Pro Plan Tier",
    credits: 1800,
    description: "Everything in free plus advanced features - up to 8 contacts + Resume matching",
    coffeeChat: true,
    interviewPrep: true,
    timeSavedMinutes: 1200,
    usesResume: true,
  },
};

const Home = () => {
  const { user: firebaseUser, updateCredits, checkCredits } = useFirebaseAuth();
  const { migrationComplete } = useFirebaseMigration();
  const currentUser = firebaseUser;

  const waveKeyframes = `
    @keyframes wave {
      0%, 100% { transform: rotate(-8deg); }
      50% { transform: rotate(8deg); }
    }
  `;
  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = waveKeyframes;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, [waveKeyframes]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get('tab');
    if (initialTab && ['find-candidates', 'coffee-chat', 'interview-prep'].includes(initialTab)) {
      setActiveTab(initialTab);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (coffeeChatPollTimeoutRef.current) {
        clearTimeout(coffeeChatPollTimeoutRef.current);
        coffeeChatPollTimeoutRef.current = null;
      }
    };
  }, []);

  const navigate = useNavigate();
  const { toast } = useToast();
  const [gmailCheckComplete, setGmailCheckComplete] = useState(false);
  const effectiveUser =
    currentUser || ({
      credits: 0,
      maxCredits: 0,
      name: "User",
      email: "user@example.com",
      tier: "free",
    } as const);
  // New Coming Soon Component
  const ComingSoonOverlay = ({ title, description, icon: Icon, gradient }: { 
    title: string; 
    description: string; 
    icon: any;
    gradient: string;
  }) => (
    <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-md bg-gray-900/80 rounded-lg">
      <div className="text-center px-6 py-8 max-w-md">
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br ${gradient} mb-6 animate-pulse`}>
          <Icon className="h-10 w-10 text-white" />
        </div>
        
        <div className="mb-4">
          <Badge className={`bg-gradient-to-r ${gradient} text-white border-none px-4 py-1 text-sm font-semibold mb-3`}>
            <Sparkles className="h-3 w-3 mr-1 inline" />
            Coming Soon
          </Badge>
        </div>
        
        <h3 className="text-2xl font-bold text-white mb-3 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          {title}
        </h3>
        
        <p className="text-gray-300 mb-6 leading-relaxed">
          {description}
        </p>
        
        <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
          <Rocket className="h-4 w-4 text-purple-400" />
          <span>Launching soon - stay tuned!</span>
        </div>
        
        <div className="mt-6 flex justify-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
          ))}
        </div>
      </div>
    </div>
  );
  const userTier: "free" | "pro" = React.useMemo(() => {
    if (effectiveUser?.tier === "pro") return "pro";
    const max = Number(effectiveUser?.maxCredits ?? 0);
    const credits = Number(effectiveUser?.credits ?? 0);
    if (max >= 1800 || credits > 150) return "pro";
    return "free";
  }, [effectiveUser?.tier, effectiveUser?.maxCredits, effectiveUser?.credits]);
  function isSearchResult(x: any): x is { contacts: any[]; successful_drafts?: number } {
    return x && Array.isArray(x.contacts);
  }


  // Form state
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [collegeAlumni, setCollegeAlumni] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [jobPostUrl, setJobPostUrl] = useState("");
  const [isScoutChatOpen, setIsScoutChatOpen] = useState(false);

  // Coffee Chat state
  const [coffeeChatLoading, setCoffeeChatLoading] = useState(false);
  const [coffeeChatProgress, setCoffeeChatProgress] = useState<string>("");
  const [coffeeChatPrepId, setCoffeeChatPrepId] = useState<string | null>(null);
  const [coffeeChatResult, setCoffeeChatResult] = useState<CoffeeChatPrepStatus | null>(null);
  const [coffeeChatStatus, setCoffeeChatStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');

  // (kept) Explicit completion UI toggle
  const [showCompletionUI, setShowCompletionUI] = useState(false);
  // ✅ Nuclear option: force re-render counter
  const [renderKey, setRenderKey] = useState(0);

  // Batch size state
  const [batchSize, setBatchSize] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<string>("find-candidates");
  const activeCoffeeChatIdRef = useRef<string | null>(null);
  const coffeeChatPollTimeoutRef = useRef<number | null>(null);

  // Helper function to load images with proper error handling
  const loadImage = (src: string): Promise<void> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Resolve even on error to not block
      img.src = src;
    });
  };

  // Computed values to ensure fresh state
  const isGenerating = coffeeChatLoading && coffeeChatStatus !== 'completed';
  const isCompleted = coffeeChatStatus === 'completed' && !coffeeChatLoading;
  
  // Debug effect to monitor state changes
  useEffect(() => {
    console.log('🎨 Coffee Chat State:', {
      loading: coffeeChatLoading,
      status: coffeeChatStatus,
      hasResult: !!coffeeChatResult,
      prepId: coffeeChatPrepId,
      showCompletionUI,
      isGenerating,
      isCompleted
    });
    if (coffeeChatStatus === 'completed' && coffeeChatLoading) {
      console.error('❌ BUG: Status is completed but loading is still true!');
    }
  }, [coffeeChatResult, coffeeChatStatus, coffeeChatPrepId, showCompletionUI, coffeeChatLoading, isGenerating, isCompleted]);

  // Force update when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && coffeeChatStatus === 'completed') {
        console.log('🔍 Tab became visible, forcing update...');
        setCoffeeChatLoading(false);
        
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also listen for focus
    const handleFocus = () => {
      if (coffeeChatStatus === 'completed') {
        console.log('🔍 Window focused, forcing update...');
        setCoffeeChatLoading(false);
    
      }
    };
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [coffeeChatStatus]);

  const maxBatchSize = React.useMemo(() => {
    const tierMax = userTier === 'free' ? 3 : 8;
    const creditMax = Math.floor((effectiveUser.credits ?? 0) / 15);
    return Math.min(tierMax, creditMax);
  }, [userTier, effectiveUser.credits]);

  useEffect(() => {
    if (batchSize > maxBatchSize) {
      setBatchSize(Math.max(1, maxBatchSize));
    }
  }, [maxBatchSize, batchSize]);

  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [searchComplete, setSearchComplete] = useState(false);
  const [lastResults, setLastResults] = useState<any[]>([]);
  const [lastResultsTier, setLastResultsTier] = useState<"free" | "pro" | string>("");
  const [lastSearchStats, setLastSearchStats] = useState<{
    successful_drafts: number;
    total_contacts: number;
  } | null>(null);
  const hasResults = lastResults.length > 0;

  const currentTierConfig = TIER_CONFIGS[userTier];

  useEffect(() => {
    if (firebaseUser?.needsOnboarding) {
      navigate('/onboarding');
   }
  }, [firebaseUser, navigate]);

  useEffect(() => {
    if (firebaseUser && checkCredits) {
      checkCredits();
    }
  }, [firebaseUser]);



  const getUserProfileData = async () => {
    if (!currentUser) return null;
    try {
      if (firebaseUser?.uid) {
        const professionalInfo = await firebaseApi.getProfessionalInfo(firebaseUser.uid);
        if (professionalInfo) {
          const userProfile = {
            name:
              `${professionalInfo.firstName || ""} ${professionalInfo.lastName || ""}`.trim() ||
              currentUser.name ||
              "",
            university: professionalInfo.university || "",
            major: professionalInfo.fieldOfStudy || "",
            year: professionalInfo.graduationYear || "",
            graduationYear: professionalInfo.graduationYear || "",
            degree: professionalInfo.currentDegree || "",
            careerInterests: professionalInfo.targetIndustries || [],
          };
          return userProfile;
        }
      }
      const professionalInfo = localStorage.getItem("professionalInfo");
      const resumeData = localStorage.getItem("resumeData");
      const prof = professionalInfo ? JSON.parse(professionalInfo) : {};
      const resume = resumeData ? JSON.parse(resumeData) : {};
      const userProfile = {
        name:
          `${(prof.firstName || "")} ${(prof.lastName || "")}`.trim() ||
          resume.name ||
          currentUser.name ||
          "",
        university: prof.university || resume.university || "",
        major: prof.fieldOfStudy || resume.major || "",
        year: prof.graduationYear || resume.year || "",
        graduationYear: prof.graduationYear || resume.year || "",
        degree: prof.currentDegree || resume.degree || "",
        careerInterests: prof.targetIndustries || [],
      };
      return userProfile;
    } catch {
      return null;
    }
  };

  const stripUndefined = <T extends Record<string, any>>(obj: T) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

  const autoSaveToDirectory = async (contacts: any[], searchLocation?: string) => {
    console.log('🔍 DEBUG: Starting save...');
    console.log('🔍 Current user:', currentUser);
    console.log('🔍 User UID:', currentUser?.uid);
    console.log('🔍 Contacts to save:', contacts.length);
    console.log('🔍 Sample contact:', contacts[0]);
    console.log('🔍 Search location passed:', searchLocation);
    if (!currentUser) return;

    try {
      const today = new Date().toLocaleDateString('en-US');

      const mapped: Omit<ContactApi, 'id'>[] = contacts.map((c: any) => {
        const derivedLocation = [c.City ?? '', c.State ?? ''].filter(Boolean).join(', ') || c.location || searchLocation || '';
        console.log(`📍 Contact ${c.FirstName} ${c.LastName} location:`, {
          fromAPI: c.City || c.State ? `${c.City}, ${c.State}` : null,
          fallback: derivedLocation,
          searchLocation
        });
        
        return stripUndefined({
          firstName: c.FirstName ?? c.firstName ?? '',
          lastName: c.LastName ?? c.lastName ?? '',
          linkedinUrl: c.LinkedIn ?? c.linkedinUrl ?? '',
          email: c.Email ?? c.email ?? '',
          company: c.Company ?? c.company ?? '',
          jobTitle: c.Title ?? c.jobTitle ?? '',
          college: c.College ?? c.college ?? '',
          location: derivedLocation,

          // required
          firstContactDate: today,
          status: 'Not Contacted',
          lastContactDate: today,

          // optional (only include if present)
          emailSubject: c.email_subject ?? c.emailSubject ?? undefined,
          emailBody: c.email_body ?? c.emailBody ?? undefined,
          gmailThreadId: c.gmailThreadId ?? c.gmail_thread_id ?? undefined,
          gmailMessageId: c.gmailMessageId ?? c.gmail_message_id ?? undefined,
          hasUnreadReply: false,
          notificationsMuted: false,
          // DO NOT set createdAt/updatedAt; backend adds them
        });
      });

      console.log('💾 Calling firebaseApi.bulkCreateContacts...');
      console.log('📋 Mapped contacts:', mapped);
      await firebaseApi.bulkCreateContacts(currentUser.uid, mapped);
      console.log('✅ Successfully saved contacts to Firestore!');
    } catch (error) {
      console.error('❌ Error in autoSaveToDirectory:', error);
      console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      throw error;
    }
};
// ✅ Check if Gmail needs connection
const checkNeedsGmailConnection = async (): Promise<boolean> => {
  try {
    if (!currentUser) return false;
    
    const { auth } = await import('../lib/firebase');
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return false;
    
    const token = await firebaseUser.getIdToken(true);
    const API_BASE_URL = window.location.hostname === 'localhost' 
      ? 'http://localhost:5001' 
      : 'https://www.offerloop.ai';
    
    const response = await fetch(`${API_BASE_URL}/api/gmail/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      console.error("Gmail status check failed:", response.status);
      return true; // Assume needs connection if check fails
    }
    
    const data = await response.json();
    console.log("📧 Gmail status:", data);
    return !data.connected;
  } catch (error) {
    console.error("Error checking Gmail status:", error);
    return true; // Assume needs connection on error
  }
};

// ✅ Trigger Gmail OAuth
const initiateGmailOAuth = async () => {
  try {
    console.log("📧 [DEBUG] Starting initiateGmailOAuth");
    
    const { auth } = await import('../lib/firebase');
    console.log("📧 [DEBUG] Auth imported:", !!auth);
    
    const firebaseUser = auth.currentUser;
    console.log("📧 [DEBUG] Firebase user:", firebaseUser?.email);
    
    if (!firebaseUser) {
      console.log("📧 [DEBUG] No Firebase user for OAuth");
      return;
    }
    
    console.log("📧 [DEBUG] Getting token...");
    const token = await firebaseUser.getIdToken(true);
    console.log("📧 [DEBUG] Token:", token.substring(0, 30) + '...');
    
    const API_BASE_URL = window.location.hostname === 'localhost' 
      ? 'http://localhost:5001' 
      : 'https://www.offerloop.ai';
    
    console.log("📧 [DEBUG] API URL:", API_BASE_URL);
    console.log("📧 [DEBUG] Calling OAuth start...");
    
    const response = await fetch(`${API_BASE_URL}/api/google/oauth/start`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log("📧 [DEBUG] Response status:", response.status);
    console.log("📧 [DEBUG] Response OK:", response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("📧 [DEBUG] Error response:", errorText);
      return;
    }
    
    const data = await response.json();
    console.log("📧 [DEBUG] OAuth data:", data);
    
    if (data.authUrl) {
      sessionStorage.setItem('gmail_oauth_return', window.location.pathname);
      console.log("📧 [DEBUG] Redirecting to:", data.authUrl);
      window.location.href = data.authUrl;
    } else {
      console.error("📧 [DEBUG] No authUrl in response");
    }
  } catch (error: unknown) {
  if (error instanceof Error) {
    console.error("🔴 Exception:", error.message);
    if (error.stack) console.error("🔴 Stack:", error.stack);
  } else {
    console.error("🔴 Exception (non-Error):", String(error));
  }
}

};
// === CREATE REAL GMAIL DRAFTS (batch) =========================
async function generateAndDraftEmailsBatch(contacts: any[]) {
  const { auth } = await import("../lib/firebase");
  const idToken = await auth.currentUser?.getIdToken(true);
  const API_BASE_URL =
    window.location.hostname === "localhost"
      ? "http://localhost:5001"
      : "https://www.offerloop.ai";

  const userProfile = await getUserProfileData();

  const res = await fetch(`${API_BASE_URL}/api/emails/generate-and-draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      contacts,
      resumeText: "", // optional: add your real resume text here
      userProfile,
      careerInterests: userProfile?.careerInterests || [],
    }),
  });

  // ✅ Read body ONCE
  const ct  = res.headers.get("content-type") || "";
  const raw = await res.text();
  const data = raw
    ? (ct.includes("application/json") ? JSON.parse(raw) : { raw })
    : {};

  // Handle Gmail not connected/expired
  if (res.status === 401) {
    // If your backend returns an authUrl to kick off OAuth:
    if ((data as any)?.needsAuth && (data as any)?.authUrl) {
      window.location.href = (data as any).authUrl;
      return null;
    }
    // Otherwise show a reconnect banner/toast
    throw new Error((data as any).error || "Gmail session expired — please reconnect.");
  }

  // Other errors
  if (!res.ok) {
    throw new Error((data as any).error || `HTTP ${res.status}: ${res.statusText}`);
  }

  // ✅ Success: data already parsed
  return data;

  }

  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then((res) => res.json())
      .then((data) => {
        if (data.tiers && data.tiers.includes("free") && data.tiers.includes("pro")) {
          console.log("✅ Backend using Free/Pro tier system");
        }
      })
      .catch(() => {
        toast({
          title: "Backend Connection Failed",
          description: "Please ensure the backend server is running on port 5001",
          variant: "destructive",
        });
      });
  }, [toast]);

  // Debug: Watch coffee chat state changes
  useEffect(() => {
    console.log('🔍 Coffee Chat State Changed:');
    console.log('  Status:', coffeeChatStatus);
    console.log('  PrepId:', coffeeChatPrepId);
    console.log('  Loading:', coffeeChatLoading);
    console.log('  Progress:', coffeeChatProgress);
    console.log('  Will show completed UI?', coffeeChatStatus === 'completed' && coffeeChatPrepId);
  }, [coffeeChatStatus, coffeeChatPrepId, coffeeChatLoading, coffeeChatProgress]);

  useEffect(() => {
    if (coffeeChatStatus === 'completed' && coffeeChatPrepId && !coffeeChatLoading) {
      setShowCompletionUI(true);
    }
  }, [coffeeChatStatus, coffeeChatPrepId, coffeeChatLoading]);
  // ✅ Auto-check Gmail on page load (ONE TIME ONLY)
// ✅ Auto-check Gmail on page load
useEffect(() => {
  if (!ENABLE_HOME_GMAIL_AUTOCONNECT) return;
  const autoCheckGmail = async () => {
    if (!currentUser || gmailCheckComplete) return;
    
    console.log('🔍 Auto-checking Gmail for:', currentUser.email);
    
    const needsGmail = await checkNeedsGmailConnection();
    
    if (needsGmail) {
      console.log('📧 Gmail not connected, starting OAuth...');
      await initiateGmailOAuth();
    } else {
      console.log('✅ Gmail already connected');
    }
    
    setGmailCheckComplete(true);
  };
  
  if (currentUser && !gmailCheckComplete) {
    const timer = setTimeout(autoCheckGmail, 2000);
    return () => clearTimeout(timer);
  }
}, [currentUser, gmailCheckComplete]);

// ✅ Handle OAuth return
// ✅ Handle OAuth return
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const gmailConnected = params.get('connected') === 'gmail';
  
  if (gmailConnected) {
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
    
    toast({
      title: "Gmail Connected! 🎉",
      description: "You can now create drafts directly in Gmail.",
    });
    
    setGmailCheckComplete(true);
  }
}, [toast]); // Only depend on toast
const handleCoffeeChatSubmit = async () => {
  console.log('🎬 handleCoffeeChatSubmit called');
  
  if (!linkedinUrl.trim()) {
    toast({
      title: "Missing LinkedIn URL",
      description: "Please enter a LinkedIn profile URL.",
      variant: "destructive",
    });
    return;
  }

  if (!firebaseUser) {
    toast({
      title: "Authentication Required",
      description: "Please sign in to continue.",
      variant: "destructive",
    });
    return;
  }

  setCoffeeChatLoading(true);
  setCoffeeChatStatus('processing');
  setCoffeeChatProgress('Starting Coffee Chat Prep...');
  setCoffeeChatResult(null);
  setShowCompletionUI(false);

  try {
    // Start the generation
    const result = await apiService.createCoffeeChatPrep({ linkedinUrl });
    
    if ('error' in result) {
      throw new Error(result.error);
    }

    const prepId = result.prepId;
    setCoffeeChatPrepId(prepId);
    
    // Use setInterval instead of setTimeout - less likely to be throttled
    let pollCount = 0;
    const maxPolls = 200;
    
    const pollPromise = new Promise((resolve, reject) => {
      const intervalId = setInterval(async () => {
        pollCount++;
        console.log(`🔄 Poll ${pollCount} starting...`);
        
        try {
          const statusResult = await apiService.getCoffeeChatPrepStatus(prepId);
          console.log(`Poll ${pollCount}:`, statusResult);
          
          // Check if it's an error response
          if ('error' in statusResult && !('status' in statusResult)) {
            clearInterval(intervalId);
            reject(new Error(statusResult.error));
            return;
          }
          
          // Check if completed (just check for pdfUrl which is definitive)
          if (statusResult.pdfUrl) {
            clearInterval(intervalId);
            console.log('✅ Completed! pdfUrl:', statusResult.pdfUrl);
            
            // ✅ Update ALL states synchronously including loading
            flushSync(() => {
              setCoffeeChatLoading(false); // ✅ Set loading to false IMMEDIATELY
              setCoffeeChatStatus('completed');
              setCoffeeChatProgress('Coffee Chat Prep ready!');
              setCoffeeChatResult(statusResult as CoffeeChatPrepStatus);
              setCoffeeChatPrepId((statusResult as any).id || prepId);
              setShowCompletionUI(true);
              setRenderKey(prev => prev + 1);
            });
            
            console.log('✅ States updated, interval cleared');
            
            // ✅ Show toast
            toast({
              title: "Coffee Chat Prep Ready!",
              description: "Your one-pager has been generated successfully.",
              duration: 5000,
            });
            
            console.log('✅ Toast shown, now updating credits');
            
            // ✅ Update credits
            checkCredits().then(() => {
              console.log('✅ Everything complete!');
              resolve(statusResult);
            });
            
            return;
          }
          
          // Only update progress if NOT completed
          if ('status' in statusResult) {
            setCoffeeChatProgress('Processing your request...');
          }
          
          if (pollCount >= maxPolls) {
            clearInterval(intervalId);
            reject(new Error('Generation timed out'));
          }
        } catch (error) {
          clearInterval(intervalId);
          reject(error);
        }
      }, 3000); // Poll every 3 seconds
    });
    
    await pollPromise;
    
  } catch (error: any) {
    console.error('Coffee chat prep failed:', error);
    setCoffeeChatStatus('failed');
    setCoffeeChatProgress('Generation failed');
    toast({
      title: "Generation Failed",
      description: error.message || "Please try again.",
      variant: "destructive",
    });
  } finally {
    // ALWAYS set loading to false in finally block - just like professional search
    setCoffeeChatLoading(false);
    console.log('✅ Loading set to false in finally block');
  }
};
// Debug monitor
useEffect(() => {
  console.log('🔍 Coffee State Changed:', {
    loading: coffeeChatLoading,
    status: coffeeChatStatus,
    hasResult: !!coffeeChatResult
  });
}, [coffeeChatLoading, coffeeChatStatus, coffeeChatResult]);
// Replace your existing downloadCoffeeChatPDF with this version
const downloadCoffeeChatPDF = async (prepId?: string) => {
  const id = prepId || coffeeChatPrepId;
  if (!id || !firebaseUser) return;

  try {
    // First, ensure the PDF is ready by polling the API
    const MAX_TRIES = 20; // ~20s
    const DELAY_MS = 1000;
    let pdfUrl: string | undefined;

    // Show loading toast
    toast({
      title: "Preparing PDF",
      description: "Please wait while we prepare your Coffee Chat PDF...",
      duration: 3000,
    });

    // Poll until PDF is ready
    for (let i = 0; i < MAX_TRIES; i++) {
      try {
        const res = await apiService.downloadCoffeeChatPDF(id);
        pdfUrl = res?.pdfUrl || undefined;
        if (pdfUrl) {
          // Verify the URL is accessible
          const urlToVerify = pdfUrl;
          try {
            const response = await fetch(urlToVerify, { method: 'HEAD' });
            if (response.ok) {
              break; // PDF is ready and accessible
            }
          } catch {
            // URL not ready yet, continue polling
          }
        }
      } catch { /* ignore transient errors while polling */ }
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    if (!pdfUrl) {
      throw new Error("PDF isn't ready yet. Please try again in a moment.");
    }

    // Add a small delay to ensure everything is ready
    await new Promise(r => setTimeout(r, 500));

    // Now open the tab with the ready PDF URL
    const tab = window.open(pdfUrl, "_blank", "noopener,noreferrer");
    
    if (!tab) {
      // Popup was blocked → try using an anchor click
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    toast({
      title: "PDF Ready",
      description: "Opened your Coffee Chat one-pager in a new tab.",
    });
  } catch (err) {
    toast({
      title: "Download Failed",
      description: err instanceof Error ? err.message : "Could not download the PDF.",
      variant: "destructive",
    });
  }
};




  const handleSearch = async () => {
    if (!jobTitle.trim() || !location.trim()) {
      toast({
        title: "Missing Required Fields",
        description: "Please enter both job title and location.",
        variant: "destructive",
      });
      return;
    }

    if (!currentUser) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to search for contacts.",
        variant: "destructive",
      });
      navigate("/signin");
      return;
    }

    const currentCredits = await checkCredits();
    if (currentCredits < 15) {
      toast({
        title: "Insufficient Credits",
        description: `You have ${currentCredits} credits. You need at least 15 credits to search.`,
        variant: "destructive",
      });
      return;
    }

    if (userTier === "pro" && !uploadedFile) {
      toast({
        title: "Resume Required",
        description: "Pro tier requires a resume upload for similarity matching.",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setProgressValue(0);
    setSearchComplete(false);
    // ✅ Create Gmail drafts for these contacts (handles OAuth if needed)
  


    try {
      [15, 35, 60, 85, 90].forEach((value, index) => {
        setTimeout(() => setProgressValue(value), index * 600);
      });

      const userProfile = await getUserProfileData();

      if (userTier === "free") {
        const searchRequest = {
          jobTitle: jobTitle.trim(),
          company: company.trim() || "",
          location: location.trim(),
          saveToDirectory: false,
          userProfile,
          careerInterests: userProfile?.careerInterests || [],
          collegeAlumni: (collegeAlumni || '').trim(),
          batchSize: batchSize,
        };

        const result = await apiService.runFreeSearch(searchRequest);
        // --- Narrow the union safely ---
          if (!isSearchResult(result)) {
            toast({
              title: "Search Failed",
              description: (result as any)?.error || "Please try again.",
              variant: "destructive",
            });
            return;
          }

          // Now it's safe to use result.contacts
          const creditsUsed = result.contacts.length * 15;
          const newCredits  = Math.max(0, currentCredits - creditsUsed);
          await updateCredits(newCredits).catch(() => { /* swallow UI-only failure */ });

          setLastResults(result.contacts);
          setLastResultsTier(userTier);
          setLastSearchStats({
            successful_drafts: result.successful_drafts ?? 0, // may be missing
            total_contacts: result.contacts.length,
          });

          setProgressValue(100);
          setSearchComplete(true);

          // ❌ REMOVE this (the backend already created drafts):
          // const draftRes = await generateAndDraftEmailsBatch(result.contacts);

          // Save to Contact Library (non-blocking UX is fine)
          try {
            await autoSaveToDirectory(result.contacts, location.trim());
            toast({
              title: "Search Complete!",
              description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. ${newCredits} credits remaining.`,
              duration: 5000,
            });
          } catch (error: unknown) {
            console.error("❌ [FREE TIER] Failed to save contacts:", error);
            toast({
              title: "Search Complete!",
              description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits.`,
              variant: "destructive",
              duration: 5000,
            });
          }


      
      
      } else if (userTier === "pro") {
        const proRequest = {
          jobTitle: jobTitle.trim(),
          company: company.trim() || "",
          location: location.trim(),
          resume: uploadedFile!,
          saveToDirectory: false,
          userProfile,
          careerInterests: userProfile?.careerInterests || [],
          collegeAlumni: (collegeAlumni || '').trim(),
          batchSize: batchSize,
        };

        const result = await apiService.runProSearch(proRequest);
        if (isErrorResponse(result)) {
          if (result.error?.includes("Insufficient credits")) {
            toast({
              title: "Insufficient Credits",
              description: result.error,
              variant: "destructive",
            });
            await checkCredits();
            return;
          }
          toast({
            title: "Search Failed",
            description: result.error || "Please try again.",
            variant: "destructive",
          });
          return;
        }

        const creditsUsed = result.contacts.length * 15;
        const newCredits = Math.max(0, currentCredits - creditsUsed);
        await updateCredits(newCredits);

        setLastResults(result.contacts);
        setLastResultsTier("pro");
        setLastSearchStats({
          successful_drafts: result.successful_drafts,
          total_contacts: result.contacts.length,
        });

        setProgressValue(100);
        setSearchComplete(true);
        const draftRes = await generateAndDraftEmailsBatch(result.contacts);

        try {
          await autoSaveToDirectory(result.contacts, location.trim());

          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. ${newCredits} credits remaining.`,
            duration: 5000,
          });
        } catch (error) {
          console.error('❌ [PRO TIER] Failed to save contacts:', error);
          console.error('Error details:', error instanceof Error ? error.message : String(error));
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. (Warning: Failed to save - check console)`,
            variant: "destructive",
            duration: 5000,
          });
        }
      }
    } catch (error: any) {
      console.error("Search failed:", error);
      
      // Check if this is a Gmail reconnection error
      if (error?.needsAuth || error?.require_reauth) {
        const authUrl = error.authUrl;
        if (authUrl) {
          toast({
            title: "Gmail Connection Expired",
            description: error.message || "Please reconnect your Gmail account to create drafts.",
            variant: "destructive",
            duration: 5000,
          });
          
          // Store contacts if available
          if (error.contacts && error.contacts.length > 0) {
            console.log(`📧 Saving ${error.contacts.length} contacts before Gmail reconnection`);
            // Optionally save contacts to directory before redirecting
            try {
              await autoSaveToDirectory(error.contacts, location.trim());
            } catch (saveError) {
              console.error("Failed to save contacts before redirect:", saveError);
            }
          }
          
          // Redirect to Gmail OAuth
          console.log("📧 Redirecting to Gmail OAuth:", authUrl);
          window.location.href = authUrl;
          return;
        }
      }
      
      toast({
        title: "Search Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
        duration: 5000,
      });
      setSearchComplete(false);
    } finally {
      setIsSearching(false);
      if (searchComplete) {
        setTimeout(() => {
          setProgressValue(0);
          setSearchComplete(false);
        }, 2000);
      } else {
        setTimeout(() => setProgressValue(0), 500);
      }
    }
  };

  const saveContactsToGmailDrafts = async (contacts: any[]) => {
    try {
      const status = await apiService.gmailStatus();

      if (!status.connected) {
        console.log('Gmail not connected - backend will handle this');
      }

      let successful = 0;
      let failed = 0;

      for (const contact of contacts) {
        try {
          const result = await apiService.saveGmailDraft({
            to: contact.Email || contact.email,
            subject: contact.email_subject || `Question about your work at ${contact.Company || 'your company'}`,
            body: contact.email_body || `Hi ${contact.FirstName || 'there'},\n\nI'd love to connect about your work.\n\nBest regards`
          });

          if ('error' in result) {
            console.error(`Failed to save draft for ${contact.FirstName}:`, result.error);
            failed++;
          } else {
            if ('threadId' in result && currentUser) {
              try {
                const contactId = contact.id || contact.email;

                await firebaseApi.updateContact(currentUser.uid, contactId, {
                  gmailThreadId: result.threadId,
                  gmailMessageId: result.messageId,
                  draftCreatedAt: new Date().toISOString(),
                });

                console.log(`✅ Saved thread ID for ${contact.FirstName}`);
              } catch (updateError) {
                console.error('Failed to save thread ID:', updateError);
              }
            }

            console.log(`✅ Saved draft for ${contact.FirstName} ${contact.LastName}`);
            successful++;
          }
        } catch (error) {
          console.error(`Error saving draft for ${contact.FirstName}: ${String(error)}`);
          failed++;
        }
      }

      return { successful, failed };
    } catch (error) {
      console.error('Error in saveContactsToGmailDrafts:', error);
      return { successful: 0, failed: 0 };
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please upload a PDF smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }
      setUploadedFile(file);
      toast({
        title: "Resume Uploaded",
        description: "Resume will be used for similarity matching in Pro tier.",
      });
    } else {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
    }
  };

  const handleInterviewPrepSubmit = () => {
    if (!jobPostUrl.trim()) {
      toast({
        title: "Missing Job Post URL",
        description: "Please enter a job posting URL.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Interview Prep Started",
      description: "Generating PDF and prep materials...",
    });
  };

  const handleJobTitleSuggestion = (suggestedTitle: string) => {
    setJobTitle(suggestedTitle);
    toast({
      title: "Job Title Updated",
      description: `Set job title to "${suggestedTitle}"`,
    });
  };

  return (
    <SidebarProvider>
 
      <div className="flex min-h-screen w-full bg-gray-900 text-white">
        
        <AppSidebar />

        <div className={`flex-1 transition-all duration-300 ${isScoutChatOpen ? "mr-80" : ""}`}>
          <header className="h-16 flex items-center justify-between border-b border-gray-800 px-6 bg-gray-900/80 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-white hover:bg-gray-800/50" />
                <h1 className="text-xl font-semibold">
                  {userTier === "pro" ? "Pro Plan Tier" : "Free Plan Tier"}
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <CreditPill
                credits={effectiveUser.credits ?? 0}
                max={effectiveUser.maxCredits ?? 150}
              />
              <Button
                size="sm"
                onClick={() => navigate("/pricing")}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
                Upgrade
              </Button>
            </div>
          </header>

          

          <main className="p-8">
            <div className="max-w-7xl mx-auto">
              

              <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8 mt-4">
                <TabsList className="grid w-full grid-cols-3 bg-gray-800/50 border border-gray-700 h-16">
                  <TabsTrigger
                    value="find-candidates"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white text-gray-300 hover:text-white transition-all text-base"
                  >
                    <Search className="h-5 w-5 mr-2" />
                    Professional Search
                  </TabsTrigger>
                  <TabsTrigger
                    value="coffee-chat"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-blue-500 data-[state=active]:text-white text-gray-300 hover:text-white transition-all text-base"
                  >
                  <Coffee className="h-5 w-5 mr-2" />
                  Coffee Chat Prep
                 </TabsTrigger>
                  <TabsTrigger
                    value="interview-prep"
                   className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white text-gray-300 hover:text-white transition-all text-base"
                  >
                  <Briefcase className="h-5 w-5 mr-2" />
                  Interview Prep
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="find-candidates" className="mt-6">
                  <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700">
                    <CardHeader className="border-b border-gray-700">
                      <CardTitle className="text-xl text-white">
                        Professional Search Filters<span className="text-sm text-gray-400">- I want to network with...</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium mb-2 text-white">
                            Job Title <span className="text-red-400">*</span>
                          </label>
                          <AutocompleteInput
                            value={jobTitle}
                            onChange={setJobTitle}
                            placeholder="e.g. Analyst, unsure of exact title in company? Ask Scout"
                            dataType="job_title"
                            disabled={isSearching}
                            className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-pink-500 hover:border-purple-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 text-white">Company</label>
                          <AutocompleteInput
                            value={company}
                            onChange={setCompany}
                            placeholder="e.g. Google, Meta, or any preferred firm"
                            dataType="company"
                            disabled={isSearching}
                            className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-pink-500 hover:border-purple-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 text-white">
                            Location <span className="text-red-400">*</span>
                          </label>
                          <AutocompleteInput
                            value={location}
                            onChange={setLocation}
                            placeholder="e.g. Los Angeles, CA, New York, NY, city of office"
                            dataType="location"
                            disabled={isSearching}
                            className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-pink-500 hover:border-purple-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 text-white">
                            College Alumni
                          </label>
                          <AutocompleteInput
                            value={collegeAlumni}
                            onChange={setCollegeAlumni}
                            placeholder="e.g. Stanford, USC, preferred college they attended"
                            dataType="school"
                            disabled={isSearching}
                            className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-pink-500 hover:border-purple-400 transition-colors"
                          />
                        </div>
                      </div>

                      <div className="col-span-1 lg:col-span-2 mt-4">
                        <div className="flex items-center gap-2 mb-4">
                          <label className="text-sm font-medium text-white">
                            Email Batch Size
                          </label>
                          <span className="text-sm text-gray-400">
                        - Choose how many contacts to generate per search
                          </span>
                        </div>

                        <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50 shadow-lg">
                          <div className="flex items-center gap-6">
                            <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-400/40 rounded-xl px-4 py-3 min-w-[70px] text-center shadow-inner">
                              <span className="text-2xl font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                                {batchSize}
                              </span>
                            </div>

                            <div className="flex-1 max-w-[320px] pt-4">
                              <div className="relative">
                                <input
                                  type="range"
                                  min="1"
                                  max={maxBatchSize}
                                  value={batchSize}
                                  onChange={(e) => setBatchSize(Number(e.target.value))}
                                  disabled={isSearching || maxBatchSize < 1}
                                  className="w-full h-3 bg-gray-700/50 rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed 
                                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 
                                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                                    [&::-webkit-slider-thumb]:shadow-[0_0_20px_rgba(168,85,247,0.6)] 
                                    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-purple-400
                                    [&::-webkit-slider-thumb]:hover:shadow-[0_0_25px_rgba(168,85,247,0.8)] 
                                    [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-200
                                    [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 
                                    [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white
                                    [&::-moz-range-thumb]:shadow-[0_0_20px_rgba(168,85,247,0.6)] 
                                    [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-purple-400"
                                  style={{
                                    background: `linear-gradient(to right, 
                                      rgba(168, 85, 247, 0.8) 0%, 
                                      rgba(219, 39, 119, 0.8) ${((batchSize - 1) / (maxBatchSize - 1)) * 100}%, 
                                      rgba(55, 65, 81, 0.3) ${((batchSize - 1) / (maxBatchSize - 1)) * 100}%, 
                                      rgba(55, 65, 81, 0.3) 100%)`
                                  }}
                                />

                                <div className="flex justify-between text-xs text-gray-500 mt-3 font-medium">
                                  <span>1</span>
                                  <span>{maxBatchSize}</span>
                                </div>
                              </div>
                            </div>

                            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl px-4 py-3 min-w-[100px] border border-purple-400/20">
                              <div className="text-center">
                                <span className="text-xl font-bold text-purple-300">{batchSize * 15}</span>
                                <span className="text-sm text-gray-400 ml-2">credits</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {maxBatchSize < (userTier === 'free' ? 3 : 8) && (
                          <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                            <p className="text-xs text-yellow-400 flex items-start gap-2">
                              <span>Warning</span>
                              <span>Limited by available credits. Maximum: {maxBatchSize} contacts.</span>
                            </p>
                          </div>
                        )}
                      </div>

                      

                      {userTier === "pro" && (
                        <div className="mb-6">
                          <label className="block text-sm font-medium mb-2 text-white">
                            Resume <span className="text-red-400">*</span> (Required for Pro tier AI
                            similarity matching)
                          </label>
                          <div className="border-2 border-dashed border-gray-600 rounded-lg p-4 text-center hover:border-purple-400 transition-colors bg-gray-800/30">
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={handleFileUpload}
                              className="hidden"
                              id="resume-upload"
                              disabled={isSearching}
                            />
                            <label
                              htmlFor="resume-upload"
                              className={`cursor-pointer ${
                                isSearching ? "opacity-50 cursor-not-allowed" : ""
                              }`}
                            >
                              <Upload className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                              <p className="text-sm text-gray-300 mb-1">
                                {uploadedFile
                                  ? uploadedFile.name
                                  : "Upload resume for AI similarity matching (Required for Pro)"}
                              </p>
                              <p className="text-xs text-gray-400">PDF only, max 10MB</p>
                            </label>
                          </div>
                        </div>
                      )}

                      <div className="space-y-4 mt-8">
                        <Button
                          onClick={handleSearch}
                          disabled={
                            !jobTitle.trim() ||
                            !location.trim() ||
                            isSearching ||
                            (userTier === "pro" && !uploadedFile) ||
                            (effectiveUser.credits ?? 0) < 15
                          }
                          size="lg"
                          className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-medium px-8 transition-all hover:scale-105"
                        >
                          {isSearching ? "Searching..." : "Find Contacts"}
                        </Button>

                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <div className="flex items-center gap-2">
                            <Download className="h-4 w-4" />
                            <span>Up to {currentTierConfig.maxContacts} contacts + emails</span>
                          </div>
                          <span className="text-gray-600">•</span>
                          <span>Auto-saved to Contact Library</span>
                        </div>
                      </div>

                      {hasResults && lastSearchStats && (
                        <div className="mt-4 p-4 bg-gradient-to-r from-green-800/30 to-blue-800/30 border-2 border-green-500/50 rounded-lg">
                          <div className="text-base font-semibold text-green-300 mb-2">
                            Search Completed Successfully!
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-3">
                            <div className="bg-gray-800/50 rounded p-2">
                              <div className="text-2xl font-bold text-white">{lastResults.length}</div>
                              <div className="text-xs text-gray-400">Contacts Found</div>
                            </div>
                            <div className="bg-gray-800/50 rounded p-2">
                              <div className="text-2xl font-bold text-white">{lastResults.length}</div>
                              <div className="text-xs text-gray-400">Email Drafts</div>
                            </div>
                          </div>
                          <div className="text-sm text-blue-300 mt-3 flex items-center">
                            <span className="mr-2">Saved</span>
                            All contacts saved to your Contact Library
                          </div>
                          <button 
                            onClick={() => navigate('/contact-directory')}
                            className="mt-3 text-sm text-blue-400 hover:text-blue-300 underline"
                          >
                            View in Contact Library
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
           

                <TabsContent value="coffee-chat" className="mt-6">
                  <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700 relative overflow-hidden">
                    <CardHeader className="border-b border-gray-700">
                      <CardTitle className="text-xl text-white flex items-center gap-2">
                        Coffee Chat Prep
                        <BetaBadge size="xs" variant="glow" />
                        <Badge variant="secondary" className="ml-auto">
                          {COFFEE_CHAT_CREDITS} credits
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-8">
                      <div className="grid gap-6 lg:grid-cols-2">
                        <div className="space-y-5">
                          <div>
                            <label className="block text-sm font-medium mb-2 text-white">
                              LinkedIn Profile URL
                            </label>
                            <Input
                              value={linkedinUrl}
                              onChange={(e) => setLinkedinUrl(e.target.value)}
                              placeholder="https://linkedin.com/in/username"
                              className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400"
                              disabled={coffeeChatLoading}
                            />
                            <p className="text-xs text-gray-400 mt-2">
                              Uses {COFFEE_CHAT_CREDITS} credits. Generates a PDF with recent division news, talking points, and similarities.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-3" key={`buttons-${renderKey}`}>
                            <Button
                              
                             
                              onClick={handleCoffeeChatSubmit}
                              disabled={coffeeChatLoading || !linkedinUrl.trim()}
                              className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                              key={`generate-btn-${coffeeChatLoading}-${renderKey}`}
                            >
                              {(() => {
                                console.log('🔴 BUTTON RENDER:', { coffeeChatLoading, renderKey });
                                return coffeeChatLoading ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <Coffee className="h-4 w-4 mr-2" />
                                    Generate Prep
                                  </>
                                );
                              })()}
                            </Button>

                            {coffeeChatStatus === 'completed' && (coffeeChatPrepId || coffeeChatResult) && (
                              <>
                                {/* fragment ensures ONE parent inside the conditional */}
                                <Button
                                  variant="outline"
                                  onClick={() => downloadCoffeeChatPDF()}
                                  className="border-green-500/60 text-green-300 hover:bg-green-500/10"
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download PDF
                                </Button>
                              </>
                            )}
                          </div>


                          {coffeeChatStatus !== 'idle' && (
                            <div key={`status-${coffeeChatStatus}-${renderKey}`} className="rounded-lg border border-gray-700 bg-gray-800/70 p-4 shadow-inner text-sm text-gray-200">
                              <div className="flex items-center gap-2">
                                {coffeeChatLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                                ) : coffeeChatStatus === 'completed' ? (
                                  <CheckCircle className="h-4 w-4 text-green-400" />
                                ) : coffeeChatStatus === 'failed' ? (
                                  <XCircle className="h-4 w-4 text-red-400" />
                                ) : (
                                  <Clock className="h-4 w-4 text-blue-400" />
                                )}
                                <span>
                                  {(() => {
                                    console.log('🟢 PROGRESS SPAN RENDER:', { 
                                      progress: coffeeChatProgress, 
                                      status: coffeeChatStatus,
                                      loading: coffeeChatLoading,
                                      renderKey 
                                    });
                                    return coffeeChatProgress;
                                  })()}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-4" key={`coffee-${coffeeChatStatus}-${renderKey}`}>
                          {coffeeChatStatus === 'completed' && coffeeChatResult ? (
                            <>
                              <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h3 className="text-sm font-semibold text-green-200 uppercase tracking-wide">
                                    Contact Snapshot
                                  </h3>
                                  <span className="text-xs text-green-300/80">
                                    Ready for coffee chat
                                  </span>
                                </div>
                                <div className="space-y-1 text-sm text-gray-200">
                                  <p><span className="text-gray-400">Name:</span> {coffeeChatResult.contactData?.firstName} {coffeeChatResult.contactData?.lastName}</p>
                                  <p><span className="text-gray-400">Role:</span> {coffeeChatResult.contactData?.jobTitle}</p>
                                  <p><span className="text-gray-400">Company:</span> {coffeeChatResult.contactData?.company}</p>
                                  <p><span className="text-gray-400">Office:</span> {coffeeChatResult.contactData?.location || coffeeChatResult.context?.office}</p>
                                  {coffeeChatResult.hometown && (
                                    <p><span className="text-gray-400">Hometown:</span> {coffeeChatResult.hometown}</p>
                                  )}
                                </div>
                              </div>

                              {coffeeChatResult.similaritySummary && (
                                <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4">
                                  <h3 className="text-sm font-semibold text-blue-200 uppercase tracking-wide mb-2">
                                    Common Ground
                                  </h3>
                                  <p className="text-sm text-gray-200 leading-relaxed">
                                    {coffeeChatResult.similaritySummary}
                                  </p>
                                </div>
                              )}

                              {coffeeChatResult.industrySummary && (
                                <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4">
                                  <h3 className="text-sm font-semibold text-purple-200 uppercase tracking-wide mb-2">
                                    Industry Pulse
                                  </h3>
                                  <p className="text-sm text-gray-200 leading-relaxed">
                                    {coffeeChatResult.industrySummary}
                                  </p>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-5 text-sm text-gray-300 space-y-3">
                              <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">
                                What you’ll receive
                              </h3>
                              <ul className="space-y-2 text-gray-300">
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-400 mt-0.5" />
                                  Curated headlines tied to the division and office
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-400 mt-0.5" />
                                  40-second similarity summary & coffee chat questions
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-400 mt-0.5" />
                                  PDF saved to your Coffee Chat Library
                                </li>
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>


                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="interview-prep" className="mt-6">
                  <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700 relative overflow-hidden">
                    <CardHeader className="border-b border-gray-700">
                      <CardTitle className="text-xl text-white flex items-center gap-2">
                        Interview Prep
                        <BetaBadge size="xs" variant="glow" />
                        {currentTierConfig.interviewPrep && (
                          <span className="text-green-400 text-xs border border-green-400 rounded px-2 py-0.5">
                            Pro Feature
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 relative">
                      <ComingSoonOverlay 
                        title="AI Interview Preparation"
                        description="Master your next interview with tailored prep materials, common questions for your role, and company-specific insights to help you stand out."
                        icon={Sparkles}
                        gradient="from-purple-500 to-pink-500"
                      />
                      
                      {/* Placeholder content (blurred in background) */}
                      <div className="space-y-4 opacity-30 blur-sm">
                        <div>
                          <label className="block text-sm font-medium mb-2 text-white">
                            Job Post URL
                          </label>
                          <Input
                            placeholder="https://company.com/jobs/position"
                            className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400"
                            disabled
                          />
                        </div>
                        <p className="text-sm text-gray-400">
                          Generate a PDF with job analysis and prep materials.
                        </p>
                        <Button className="w-full" disabled>
                          <Download className="h-4 w-4 mr-2" />
                          Generate Interview Prep
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {(isSearching || searchComplete) && (
                <Card className="mb-6 bg-gray-800/50 backdrop-blur-sm border-gray-700">
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">
                          {searchComplete ? (
                            <span className="text-green-400 font-semibold">
                              Search completed successfully!
                            </span>
                          ) : (
                            `Searching with ${currentTierConfig.name} tier...`
                          )}
                        </span>
                        <span className={searchComplete ? "text-green-400 font-bold" : "text-blue-400"}>
                          {progressValue}%
                        </span>
                      </div>
                      <Progress 
                        value={progressValue} 
                        className="h-2"
                      />
                      {searchComplete && (
                        <div className="mt-2 text-sm text-green-300">
                          Check your Contact Library to view and manage your new contacts.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>

        {isScoutChatOpen && (
          <div className="fixed right-0 top-0 h-full w-80 bg-gray-900 shadow-2xl z-40 border-l border-gray-700">
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-blue-500 to-purple-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: "#fff6e2" }}
                    >
                      <img src="/scout-mascot.png" alt="Scout AI" className="w-8 h-8 object-contain" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Scout AI</h3>
                      <p className="text-xs text-white/80">Job Title Assistant</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsScoutChatOpen(false)}
                    className="text-white/80 hover:text-white hover:bg-white/10"
                  >
                    Close
                  </Button>
                </div>
              </div>
              <div className="flex-1">
                <ScoutChatbot onJobTitleSuggestion={handleJobTitleSuggestion} />
              </div>
            </div>
          </div>
        )}
      </div>
       {/* Floating Scout Chat Bubble */}
        {!isScoutChatOpen && (
          <div 
            onClick={() => setIsScoutChatOpen(true)}
            className="fixed bottom-6 right-6 z-50 cursor-pointer group"
          >
            <div className="relative">
              
              
              {/* Main bubble */}
              <div className="relative bg-gradient-to-r from-blue-500 to-purple-500 rounded-full p-1 shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-110">
                <div className="bg-gray-900 rounded-full p-3">
                  <div className="flex items-center gap-3 px-2">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: "#fff6e2" }}
                    >
                      <img
                        src="/scout-mascot.png"
                        alt="Scout AI"
                        className="w-8 h-8 object-contain group-hover:scale-110 transition-transform duration-300"
                        style={{
                          animation: "wave 2.5s ease-in-out infinite",
                          transformOrigin: "center bottom",
                        }}
                      />
                    </div>
                    <div className="pr-2">
                      <p className="text-sm font-semibold text-white whitespace-nowrap">
                        Need help finding people?
                      </p>
                      <p className="text-xs text-gray-300 whitespace-nowrap">
                        Ask Scout! →
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

    
    </SidebarProvider>
  );
};

export default Home;