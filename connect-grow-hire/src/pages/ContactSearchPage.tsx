import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { BackToHomeButton } from "@/components/BackToHomeButton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useScout } from "@/contexts/ScoutContext";
import {
  Search, Linkedin, Send, Loader2, Sparkles, ArrowRight,
  User, Check, CheckCircle,
  FileText, Upload, Mail, Inbox, AlertCircle, X, ExternalLink
} from "lucide-react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
// ScoutBubble removed - now using ScoutHeaderButton in PageHeaderActions
import { Button } from "@/components/ui/button";
import ContactDirectoryComponent from "@/components/ContactDirectory";
import { Progress } from "@/components/ui/progress";
import { apiService, isErrorResponse, type EmailTemplate, hasEmailTemplateValues } from "@/services/api";
import { firebaseApi } from "../services/firebaseApi";
import type { Contact as ContactApi } from '../services/firebaseApi';
import { toast } from "@/hooks/use-toast";
import { TIER_CONFIGS } from "@/lib/constants";
import { logActivity, generateContactSearchSummary } from "@/utils/activityLogger";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { db, storage, auth } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { trackFeatureActionCompleted, trackError } from "../lib/analytics";
import ContactImport from "@/components/ContactImport";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import { StickyCTA } from "@/components/StickyCTA";

// Session storage key for Scout auto-populate
const SCOUT_AUTO_POPULATE_KEY = 'scout_auto_populate';

// Example prompt chips for discoverability
const examplePromptChips = [
  { id: 1, label: 'Software engineers at FAANG in SF', prompt: 'Software engineers at FAANG in SF' },
  { id: 2, label: 'USC alumni in investment banking', prompt: 'USC alumni in investment banking' },
  { id: 3, label: 'Marketing managers at startups in LA', prompt: 'Marketing managers at startups in LA' },
  { id: 4, label: 'Consultants at McKinsey or Bain', prompt: 'Consultants at McKinsey or Bain' },
];

// Helper function for contact count guidance
const getContactCountHelper = (count: number): string => {
  if (count === 1) return "Perfect for testing a single, specific contact";
  if (count <= 3) return "Great for focused outreach";
  if (count <= 7) return "Good for exploring a company";
  if (count <= 10) return "Solid networking foundation";
  return "Maximum reach for broad exposure";
};

// Stripe-style Tabs Component with animated underline
interface StripeTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { id: string; label: string }[];
}

const StripeTabs: React.FC<StripeTabsProps> = ({ activeTab, onTabChange, tabs }) => {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Update indicator position when active tab changes
  useLayoutEffect(() => {
    const activeIndex = tabs.findIndex(tab => tab.id === activeTab);
    const activeTabRef = tabRefs.current[activeIndex];

    if (activeTabRef) {
      const { offsetLeft, offsetWidth } = activeTabRef;
      setIndicatorStyle({ left: offsetLeft, width: offsetWidth });
    }
  }, [activeTab, tabs]);

  return (
    <div className="relative">
      {/* Tab buttons */}
      <div className="flex items-center gap-8">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[index] = el; }}
            onClick={() => onTabChange(tab.id)}
            className={`
              relative pb-3 text-sm font-medium transition-colors duration-150
              focus:outline-none focus-visible:outline-none
              ${activeTab === tab.id
                ? 'text-[#3B82F6]'
                : 'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Full-width divider line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gray-200" />

      {/* Animated underline indicator - sits on top of divider */}
      <div
        className="absolute bottom-0 h-[2px] bg-[#3B82F6] transition-all duration-200 ease-out"
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
      />
    </div>
  );
};

const ContactSearchPage: React.FC = () => {
  const { user, checkCredits, updateCredits } = useFirebaseAuth();
  const { openPanelWithSearchHelp } = useScout();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free" as "free" | "pro" | "elite",
  };

  const userTier: "free" | "pro" | "elite" = useMemo(() => {
    // Use the actual tier from the user object, default to "free"
    const tier = effectiveUser?.tier;
    if (tier === "pro" || tier === "elite") return tier;
    return "free";
  }, [effectiveUser?.tier]);

  function isSearchResult(x: any): x is { contacts: any[]; successful_drafts?: number } {
    return x && Array.isArray(x.contacts);
  }

  // Ref for original button to track visibility
  const originalButtonRef = useRef<HTMLButtonElement>(null);

  // Form state (prompt-based search)
  const [searchPrompt, setSearchPrompt] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [savedResumeUrl, setSavedResumeUrl] = useState<string | null>(null);
  const [savedResumeFileName, setSavedResumeFileName] = useState<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [currentFitContext, setCurrentFitContext] = useState<any>(null); // Track fit context for UI display

  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [searchComplete, setSearchComplete] = useState(false);
  const [lastResults, setLastResults] = useState<any[]>([]);
  const [lastSearchStats, setLastSearchStats] = useState<{
    successful_drafts: number;
    total_contacts: number;
  } | null>(null);
  const hasResults = lastResults.length > 0;

  // Batch size state
  const [batchSize, setBatchSize] = useState<number>(1);

  // UI polish state
  const [selectedExampleId, setSelectedExampleId] = useState<number | null>(null);

  const maxBatchSize = useMemo(() => {
    // Get tier-specific max contacts: free=3, pro=8, elite=15
    const tierMax = userTier === 'free' ? 3 : userTier === 'pro' ? 8 : 15;
    const creditMax = Math.floor((effectiveUser.credits ?? 0) / 15);
    return Math.min(tierMax, creditMax);
  }, [userTier, effectiveUser.credits]);

  useEffect(() => {
    if (batchSize > maxBatchSize) {
      setBatchSize(Math.max(1, maxBatchSize));
    }
  }, [maxBatchSize, batchSize]);

  // Gmail state
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [gmailBannerDismissed, setGmailBannerDismissed] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("linkedin-email");

  // LinkedIn Import state
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [linkedInError, setLinkedInError] = useState<string | null>(null);
  const [linkedInSuccess, setLinkedInSuccess] = useState<string | null>(null);
  const [linkedInLastDraftUrl, setLinkedInLastDraftUrl] = useState<string | null>(null);

  // Email template state (saved default + session override)
  const [savedEmailTemplate, setSavedEmailTemplate] = useState<EmailTemplate | null>(null);
  const [sessionEmailTemplate, setSessionEmailTemplate] = useState<EmailTemplate | null>(null);
  const activeEmailTemplate = sessionEmailTemplate ?? savedEmailTemplate;

  // Fallback to 'free' config if tier not found (safety for new tiers)
  const currentTierConfig = TIER_CONFIGS[userTier] || TIER_CONFIGS.free;

  // Sync activeTab from URL ?tab= (for product tour)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'linkedin-email' || tabParam === 'contact-search' || tabParam === 'contact-library') {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Read URL parameters (e.g., from "View Contacts" in Firm Library)
  useEffect(() => {
    const companyParam = searchParams.get('company');
    const locationParam = searchParams.get('location');

    if (companyParam || locationParam) {
      const parts = [];
      if (companyParam) parts.push(`contacts at ${companyParam}`);
      if (locationParam) parts.push(`in ${locationParam}`);
      setSearchPrompt(parts.join(' ') || '');

      setSearchParams({}, { replace: true });
      toast({
        title: "Search pre-filled",
        description: `Finding contacts at ${companyParam || 'this company'}`,
      });
    }
  }, []); // Run once on mount

  // Load saved email template on mount (contact search tab)
  useEffect(() => {
    if (!user?.uid) return;
    apiService.getEmailTemplate().then((t) => {
      setSavedEmailTemplate({
        purpose: t.purpose ?? null,
        stylePreset: t.stylePreset ?? null,
        customInstructions: t.customInstructions ?? "",
      });
    }).catch(() => {});
  }, [user?.uid]);

  // When returning from Email Templates page with "Apply to this search", apply the template and clear state
  useEffect(() => {
    const state = (routerLocation.state as { appliedEmailTemplate?: EmailTemplate } | undefined)?.appliedEmailTemplate;
    if (state) {
      setSessionEmailTemplate(state);
      try {
        sessionStorage.removeItem("offerloop_applied_email_template");
      } catch {
        // ignore
      }
      navigate("/contact-search", { replace: true, state: {} });
      return;
    }
    // Fallback: template may have been stored in sessionStorage if navigation state was lost
    try {
      const raw = sessionStorage.getItem("offerloop_applied_email_template");
      if (raw) {
        const parsed = JSON.parse(raw) as EmailTemplate;
        if (parsed && (parsed.purpose != null || parsed.stylePreset != null || (parsed.customInstructions && parsed.customInstructions.trim()))) {
          setSessionEmailTemplate(parsed);
        }
        sessionStorage.removeItem("offerloop_applied_email_template");
      }
    } catch {
      // ignore
    }
  }, [routerLocation.state]);

  // Handle Scout auto-populate from failed search, chat "Take me there", or navigation state
  useEffect(() => {
    const applyPopulate = (populateData: { job_title?: string; company?: string; location?: string }) => {
      const { job_title, company: autoCompany, location: autoLocation } = populateData;
      const parts = [];
      if (job_title != null && job_title !== '') parts.push(job_title);
      if (autoCompany != null && autoCompany !== '') parts.push(`at ${autoCompany}`);
      if (autoLocation != null && autoLocation !== '') parts.push(`in ${autoLocation}`);
      if (parts.length) {
        setSearchPrompt(parts.join(' '));
        toast({
          title: "Search pre-filled",
          description: "Scout has filled in your search. Click Search to find contacts.",
        });
      }
    };

    const handleAutoPopulate = () => {
      try {
        // Prefer navigation state (set when clicking "Take me there" from Scout panel)
        const stateData = (routerLocation.state as { scoutAutoPopulate?: { search_type?: string; job_title?: string; company?: string; location?: string } } | undefined)?.scoutAutoPopulate;
        if (stateData?.search_type === 'contact') {
          applyPopulate(stateData);
          sessionStorage.removeItem(SCOUT_AUTO_POPULATE_KEY);
          navigate(routerLocation.pathname, { replace: true, state: {} });
          return;
        }

        const stored = sessionStorage.getItem(SCOUT_AUTO_POPULATE_KEY);
        if (stored) {
          const data = JSON.parse(stored);

          // Handle both formats: search help format (nested) and chat format (flat)
          let populateData: { job_title?: string; company?: string; location?: string };
          if (data.search_type === 'contact') {
            if (data.auto_populate) {
              populateData = data.auto_populate;
            } else {
              populateData = data;
            }
            applyPopulate(populateData);
            sessionStorage.removeItem(SCOUT_AUTO_POPULATE_KEY);
          }
        }
      } catch (e) {
        console.error('[Scout] Auto-populate error:', e);
      }
    };

    handleAutoPopulate();

    window.addEventListener('scout-auto-populate', handleAutoPopulate);
    return () => window.removeEventListener('scout-auto-populate', handleAutoPopulate);
  }, [routerLocation.state, routerLocation.pathname, navigate]);

  // Helper function to trigger Scout on 0 results
  const triggerScoutForNoResults = useCallback(() => {
    openPanelWithSearchHelp({
      searchType: 'contact',
      failedSearchParams: { prompt: searchPrompt.trim() },
      errorType: 'no_results',
    });
  }, [openPanelWithSearchHelp, searchPrompt]);

  // Helper functions
  const stripUndefined = <T extends Record<string, any>>(obj: T) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

  // Memoize getUserProfileData to avoid recreating on every render
  const getUserProfileData = useCallback(async () => {
    if (!user) return null;
    try {
      if (user?.uid) {
        const professionalInfo = await firebaseApi.getProfessionalInfo(user.uid);
        if (professionalInfo) {
          return {
            name: `${professionalInfo.firstName || ""} ${professionalInfo.lastName || ""}`.trim() || user.name || "",
            university: professionalInfo.university || "",
            major: professionalInfo.fieldOfStudy || "",
            year: professionalInfo.graduationYear || "",
            graduationYear: professionalInfo.graduationYear || "",
            degree: professionalInfo.currentDegree || "",
            careerInterests: professionalInfo.targetIndustries || [],
          };
        }
      }
      const professionalInfo = localStorage.getItem("professionalInfo");
      const resumeData = localStorage.getItem("resumeData");
      const prof = professionalInfo ? JSON.parse(professionalInfo) : {};
      const resume = resumeData ? JSON.parse(resumeData) : {};
      return {
        name: `${(prof.firstName || "")} ${(prof.lastName || "")}`.trim() || resume.name || user.name || "",
        university: prof.university || resume.university || "",
        major: prof.fieldOfStudy || resume.major || "",
        year: prof.graduationYear || resume.year || "",
        graduationYear: prof.graduationYear || resume.year || "",
        degree: prof.currentDegree || resume.degree || "",
        careerInterests: prof.targetIndustries || [],
      };
    } catch {
      return null;
    }
  }, [user]);

  const autoSaveToDirectory = async (contacts: any[], searchLocation?: string) => {
    if (!user) return;
    try {
      const today = new Date().toLocaleDateString('en-US');
      const mapped: Omit<ContactApi, 'id'>[] = contacts.map((c: any) => {
        const derivedLocation = [c.City ?? '', c.State ?? ''].filter(Boolean).join(', ') || c.location || searchLocation || '';
        const mappedContact = stripUndefined({
          firstName: c.FirstName ?? c.firstName ?? '',
          lastName: c.LastName ?? c.lastName ?? '',
          linkedinUrl: c.LinkedIn ?? c.linkedinUrl ?? '',
          email: c.Email ?? c.email ?? '',
          company: c.Company ?? c.company ?? '',
          jobTitle: c.Title ?? c.jobTitle ?? '',
          college: c.College ?? c.college ?? '',
          location: derivedLocation,
          firstContactDate: today,
          status: 'Not Contacted',
          lastContactDate: today,
          emailSubject: c.email_subject ?? c.emailSubject ?? undefined,
          emailBody: c.email_body ?? c.emailBody ?? undefined,
          gmailThreadId: c.gmailThreadId ?? c.gmail_thread_id ?? undefined,
          gmailMessageId: c.gmailMessageId ?? c.gmail_message_id ?? undefined,
          gmailDraftId: c.gmailDraftId ?? c.gmail_draft_id ?? undefined,
          gmailDraftUrl: c.gmailDraftUrl ?? c.gmail_draft_url ?? undefined,
          hasUnreadReply: false,
          notificationsMuted: false,
        });

        // DEBUG: Log first mapped contact to see email fields
        if (contacts.indexOf(c) === 0) {
          console.log('[DEBUG] autoSaveToDirectory - Original contact:', {
            emailSubject: c.emailSubject || c.email_subject || 'MISSING',
            emailBody: c.emailBody || c.email_body ? `${(c.emailBody || c.email_body).substring(0, 100)}...` : 'MISSING',
            allKeys: Object.keys(c).filter(k => k.toLowerCase().includes('email')),
          });
          console.log('[DEBUG] autoSaveToDirectory - Mapped contact:', {
            emailSubject: mappedContact.emailSubject || 'MISSING',
            emailBody: mappedContact.emailBody ? `${mappedContact.emailBody.substring(0, 100)}...` : 'MISSING',
          });
        }

        return mappedContact;
      });
      await firebaseApi.bulkCreateContacts(user.uid, mapped);
    } catch (error) {
      const isDev = import.meta.env.DEV;
      if (isDev) console.error('Error in autoSaveToDirectory:', error);
      throw error;
    }
  };

  const checkNeedsGmailConnection = async (): Promise<boolean> => {
    try {
      if (!user) return false;
      const { auth } = await import('../lib/firebase');
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return false;
      const token = await firebaseUser.getIdToken(true);
      const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5001' : 'https://www.offerloop.ai';
      const response = await fetch(`${API_BASE_URL}/api/google/gmail/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return true;
      const data = await response.json();
      return !data.connected;
    } catch (error) {
      const isDev = import.meta.env.DEV;
      if (isDev) console.error("Error checking Gmail status:", error);
      return true;
    }
  };

  const initiateGmailOAuth = async () => {
    try {
      const { auth } = await import('../lib/firebase');
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken(true);
      const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5001' : 'https://www.offerloop.ai';
      const response = await fetch(`${API_BASE_URL}/api/google/oauth/start`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.authUrl) {
        sessionStorage.setItem('gmail_oauth_return', window.location.pathname);
        window.location.href = data.authUrl;
      }
    } catch (error) {
      const isDev = import.meta.env.DEV;
      if (isDev) console.error("Error initiating Gmail OAuth:", error);
    }
  };

  const generateAndDraftEmailsBatch = async (contacts: any[]) => {
    const { auth } = await import("../lib/firebase");
    const idToken = await auth.currentUser?.getIdToken(true);
    const API_BASE_URL = window.location.hostname === "localhost" ? "http://localhost:5001" : "https://www.offerloop.ai";
    const userProfile = await getUserProfileData();

    // Get fit context from Scout job analysis (if available)
    let fitContext = null;
    try {
      const storedContext = localStorage.getItem('scout_fit_context');
      if (storedContext) {
        fitContext = JSON.parse(storedContext);
        console.log('[ContactSearch] Using fit context for email generation:', fitContext);
      }
    } catch (e) {
      console.warn('[ContactSearch] Failed to parse fit context:', e);
    }

    const res = await fetch(`${API_BASE_URL}/api/emails/generate-and-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        contacts,
        resumeText: "",
        userProfile,
        careerInterests: userProfile?.careerInterests || [],
        fitContext: fitContext,  // NEW: Pass fit context
      }),
    });
    const ct = res.headers.get("content-type") || "";
    const raw = await res.text();
    const data = raw ? (ct.includes("application/json") ? JSON.parse(raw) : { raw }) : {};
    if (res.status === 401) {
      if ((data as any)?.needsAuth && (data as any)?.authUrl) {
        window.location.href = (data as any).authUrl;
        return null;
      }
      throw new Error((data as any).error || "Gmail session expired — please reconnect.");
    }
    if (!res.ok) {
      throw new Error((data as any).error || `HTTP ${res.status}: ${res.statusText}`);
    }
    return data;
  };

  // Check Gmail status on mount
  useEffect(() => {
    const checkGmailStatus = async () => {
      if (!user) return;
      try {
        const connected = await checkNeedsGmailConnection();
        setGmailConnected(!connected);
      } catch {
        setGmailConnected(false);
      }
    };
    checkGmailStatus();
  }, [user]);

  // Check for fit context on mount (from Scout)
  useEffect(() => {
    try {
      const storedContext = localStorage.getItem('scout_fit_context');
      if (storedContext) {
        const fitContext = JSON.parse(storedContext);
        setCurrentFitContext(fitContext);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, []);

  // Scout job title suggestion handler (sets prompt from role/company/location)
  const handleJobTitleSuggestion = (title: string, company?: string, location?: string) => {
    const parts = [title];
    if (company) parts.push(`at ${company}`);
    if (location) parts.push(`in ${location}`);
    setSearchPrompt(parts.join(' '));
  };

  // Clear fit context when user manually edits search (handled on explicit Clear or after search)
  useEffect(() => {
    // Fit context will be cleared after email generation completes or on Clear
  }, [searchPrompt]);

  // Load saved resume from Firestore
  const loadSavedResume = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        const resumeUrl = data.resumeUrl || null;
        const resumeFileName = data.resumeFileName || null;
        setSavedResumeUrl(resumeUrl);
        setSavedResumeFileName(resumeFileName);
        // If we have a saved resume, we can optionally load it as uploadedFile for search
        // But we'll keep uploadedFile separate for the current search session
      }
    } catch (error) {
      console.error('Failed to load saved resume:', error);
    }
  }, [user?.uid]);

  // Load resume on mount
  useEffect(() => {
    loadSavedResume();
  }, [loadSavedResume]);

  // Save resume to account settings (Firestore)
  const saveResumeToAccountSettings = async (file: File) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsUploadingResume(true);
    try {
      // 1) Parse resume via backend
      const formData = new FormData();
      formData.append('resume', file);

      const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://www.offerloop.ai';

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const response = await fetch(`${API_URL}/api/parse-resume`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to parse resume');
      }

      // 2) Upload the PDF to Firebase Storage
      const ts = Date.now();
      const storagePath = `resumes/${user.uid}/${ts}-${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);

      // 3) Get download URL and write to Firestore
      const downloadUrl = await getDownloadURL(storageRef);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        resumeUrl: downloadUrl,
        resumeFileName: file.name,
        resumeUpdatedAt: new Date().toISOString(),
        resumeParsed: {
          name: result.data.name || '',
          university: result.data.university || '',
          major: result.data.major || '',
          year: result.data.year || '',
        },
      });

      // 4) Update local state
      setSavedResumeUrl(downloadUrl);
      setSavedResumeFileName(file.name);
      setUploadedFile(file);

      toast({
        title: "Resume saved",
        description: "Your resume has been uploaded and saved to your account.",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save resume';
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUploadingResume(false);
    }
  };

  // File upload handler (click)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isValidResumeFile(file)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, DOCX, or DOC file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      await saveResumeToAccountSettings(file);
    } catch (error) {
      // Error already handled in saveResumeToAccountSettings
    }

    // Reset input
    event.target.value = '';
  };


  // LinkedIn Import handler
  const handleLinkedInImport = async () => {
    if (!linkedInUrl.trim()) return;

    // Normalize LinkedIn URL (accepts URLs with or without protocol)
    let normalizedUrl = linkedInUrl.trim();

    // If it doesn't start with http, try to normalize it
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      // If it starts with linkedin.com or www.linkedin.com, add https://
      if (normalizedUrl.startsWith('linkedin.com') || normalizedUrl.startsWith('www.linkedin.com')) {
        normalizedUrl = `https://${normalizedUrl}`;
      } else if (normalizedUrl.startsWith('/in/')) {
        // If it's just a path like /in/username, add the full domain
        normalizedUrl = `https://linkedin.com${normalizedUrl}`;
      } else if (normalizedUrl.includes('linkedin') && normalizedUrl.includes('/in/')) {
        // Extract the /in/username part and rebuild
        const match = normalizedUrl.match(/\/in\/[^\/\s]+/);
        if (match) {
          normalizedUrl = `https://linkedin.com${match[0]}`;
        }
      } else {
        // Otherwise, assume it's just a username and add the full path
        normalizedUrl = `https://linkedin.com/in/${normalizedUrl}`;
      }
    }

    // Validate the normalized URL format
    const linkedInRegex = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/;
    if (!linkedInRegex.test(normalizedUrl)) {
      setLinkedInError('Please enter a valid LinkedIn profile URL (e.g., https://linkedin.com/in/username)');
      return;
    }

    if (!user?.uid) {
      setLinkedInError('Please sign in to import contacts');
      return;
    }

    setLinkedInLoading(true);
    setLinkedInError(null);
    setLinkedInSuccess(null);
    setLinkedInLastDraftUrl(null);

    try {
      // Get user resume text from Firestore
      let userResumeText = '';
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.resumeText) {
            userResumeText = data.resumeText;
          } else if (data.resumeParsed) {
            userResumeText = JSON.stringify(data.resumeParsed);
          }
        }
      } catch (error) {
        console.error('Failed to load resume:', error);
      }

      // Get Firebase auth token
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error('User not authenticated');
      }
      const idToken = await firebaseUser.getIdToken();

      // Get API base URL
      const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://www.offerloop.ai';

      const response = await fetch(`${API_BASE}/api/contacts/import-linkedin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          linkedin_url: normalizedUrl, // Use normalized URL
          user_id: user.uid,
          user_resume: userResumeText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to import contact');
      }

      if (data.status === 'ok') {
        // Use the message from backend, or construct one based on the response
        const successMessage = data.message || `Successfully imported ${data.contact.full_name}!`;
        setLinkedInSuccess(successMessage);
        setLinkedInUrl(''); // Clear the input field
        setLinkedInLastDraftUrl(data.gmail_draft_url || null);

        // Update credits if provided
        if (data.credits_remaining !== undefined && updateCredits) {
          await updateCredits(data.credits_remaining);
        }

        // Show appropriate toast based on what was accomplished
        const emailFound = data.email_found !== false; // Default to true if not specified
        const draftCreated = data.draft_created === true;

        let toastDescription = `${data.contact.full_name} added to your contacts`;
        if (draftCreated) {
          toastDescription += ' with a draft email.';
        } else if (!emailFound) {
          toastDescription += '. No email address was found - you can add one manually later.';
        } else {
          toastDescription += ', but the email draft could not be created.';
        }

        toast({
          title: "Contact Imported!",
          description: toastDescription,
          variant: emailFound && draftCreated ? "default" : "default",
        });
      } else {
        setLinkedInError(data.message || 'Failed to import contact');
      }
    } catch (error: any) {
      console.error('LinkedIn import error:', error);
      setLinkedInError(error.message || 'An error occurred while importing. Please try again.');
    } finally {
      setLinkedInLoading(false);
    }
  };

  // Search handler (prompt-based, single flow for all tiers)
  const handleSearch = async () => {
    if (!searchPrompt.trim()) {
      toast({
        title: "Enter a search",
        description: "Describe who you want to connect with (e.g. role, company, location).",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to search for contacts.",
        variant: "destructive",
      });
      navigate("/signin");
      return;
    }

    setIsSearching(true);
    setProgressValue(10);
    setSearchComplete(false);

    let progressInterval: NodeJS.Timeout | null = null;
    const startProgressSimulation = () => {
      let currentProgress = 10;
      progressInterval = setInterval(() => {
        if (currentProgress < 85) {
          currentProgress += Math.random() * 5 + 2;
          currentProgress = Math.min(currentProgress, 85);
          setProgressValue(Math.floor(currentProgress));
        }
      }, 500);
    };

    try {
      startProgressSimulation();

      const [userProfile, currentCredits] = await Promise.all([
        getUserProfileData(),
        checkCredits ? checkCredits() : Promise.resolve(effectiveUser.credits ?? 0)
      ]);
      setProgressValue(20);

      if (currentCredits < 15) {
        if (progressInterval) clearInterval(progressInterval);
        setIsSearching(false);
        setProgressValue(0);
        toast({
          title: "Insufficient Credits",
          description: `You have ${currentCredits} credits. You need at least 15 credits to search.`,
          variant: "destructive",
        });
        return;
      }

      setProgressValue(40);
      const result = await apiService.runPromptSearch({ prompt: searchPrompt.trim(), batchSize });

      if (!isSearchResult(result)) {
        if (progressInterval) clearInterval(progressInterval);
        setIsSearching(false);
        setProgressValue(0);
        const errMsg = (result as any)?.error || "Please try again.";
        if ((result as any)?.error?.toLowerCase().includes("insufficient")) {
          if (checkCredits) await checkCredits();
        }
        trackError('contact_search', 'search', 'api_error', errMsg);
        toast({
          title: "Search Failed",
          description: errMsg,
          variant: "destructive",
        });
        return;
      }

      if (progressInterval) clearInterval(progressInterval);
      setProgressValue(90);

      const creditsUsed = result.contacts.length * 15;
      const newCredits = Math.max(0, currentCredits - creditsUsed);
      if (updateCredits) {
        await updateCredits(newCredits).catch(() => {});
      }
      setProgressValue(100);
      setLastResults(result.contacts);

      setTimeout(() => {
        setLastSearchStats({
          successful_drafts: result.successful_drafts ?? 0,
          total_contacts: result.contacts.length,
        });
        setSearchComplete(true);
      }, 2000);

      if (result.contacts.length === 0) {
        triggerScoutForNoResults();
      }

      trackFeatureActionCompleted('contact_search', 'search', true, {
        results_count: result.contacts.length,
        credits_spent: creditsUsed,
      });

      if (user?.uid && result.contacts.length > 0) {
        try {
          const summary = generateContactSearchSummary({
            jobTitle: searchPrompt.trim().slice(0, 80),
            contactCount: result.contacts.length,
          });
          await logActivity(user.uid, 'contactSearch', summary, {
            prompt: searchPrompt.trim(),
            contactCount: result.contacts.length,
            tier: userTier,
          });
        } catch (error) {
          const isDev = import.meta.env.DEV;
          if (isDev) console.error('Failed to log contact search activity:', error);
        }
      }

      toast({
        title: "Search Complete!",
        description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. ${newCredits} credits remaining.`,
        duration: 5000,
      });
    } catch (error: any) {
      // Clear progress interval on error
      if (progressInterval) clearInterval(progressInterval);
      const isDev = import.meta.env.DEV;
      if (isDev) console.error("Search failed:", error);
      if (error?.needsAuth || error?.require_reauth) {
        const authUrl = error.authUrl;
        // Preserve contacts so user doesn't lose search results (drafts failed but contacts are returned)
        if (error.contacts?.length) {
          setLastResults(error.contacts);
        }
        if (authUrl) {
          toast({
            title: "Gmail Connection Expired",
            description: error.message || "Please reconnect your Gmail account to create drafts.",
            variant: "destructive",
            duration: 5000,
            action: (
              <Button size="sm" variant="outline" onClick={() => { window.location.href = authUrl; }}>
                Reconnect Gmail
              </Button>
            ),
          });
          window.location.href = authUrl;
          return;
        }
        toast({
          title: "Gmail Connection Expired",
          description: error.message || "Please reconnect your Gmail account to create drafts.",
          variant: "destructive",
          duration: 8000,
          action: (
            <Button size="sm" variant="outline" onClick={() => navigate("/account-settings")}>
              Reconnect Gmail
            </Button>
          ),
        });
        setSearchComplete(false);
        setProgressValue(0);
        return;
      }
      toast({
        title: "Search Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
        duration: 5000,
      });
      setSearchComplete(false);
      setProgressValue(0);
    } finally {
      // Ensure progress interval is cleared
      if (progressInterval) clearInterval(progressInterval);
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

  // CSV Export function for Contact Search Results (currently unused)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExportCsv = () => {
    if (!lastResults || lastResults.length === 0) {
      return;
    }

    // Define CSV headers based on Contact interface
    const headers = [
      'First Name',
      'Last Name',
      'Email',
      'Work Email',
      'Personal Email',
      'LinkedIn',
      'Job Title',
      'Company',
      'City',
      'State',
      'College',
      'Phone',
      'Email Subject',
      'Email Body'
    ] as const;

    const headerRow = headers.join(',');

    // Map contacts to CSV rows
    const rows = lastResults.map((contact: any) => {
      const escapeCsv = (val: string | undefined | null) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escapeCsv(contact.FirstName || contact.firstName),
        escapeCsv(contact.LastName || contact.lastName),
        escapeCsv(contact.Email || contact.email),
        escapeCsv(contact.WorkEmail || contact.workEmail),
        escapeCsv(contact.PersonalEmail || contact.personalEmail),
        escapeCsv(contact.LinkedIn || contact.linkedinUrl),
        escapeCsv(contact.Title || contact.jobTitle),
        escapeCsv(contact.Company || contact.company),
        escapeCsv(contact.City || contact.city),
        escapeCsv(contact.State || contact.state),
        escapeCsv(contact.College || contact.college),
        escapeCsv(contact.Phone || contact.phone),
        escapeCsv(contact.email_subject || contact.emailSubject),
        escapeCsv(contact.email_body || contact.emailBody)
      ].join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `contacts_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "CSV Exported!",
      description: `Exported ${lastResults.length} contacts to CSV.`,
    });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#FAFAFA] text-foreground font-sans">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader
            title=""
            onJobTitleSuggestion={handleJobTitleSuggestion}
          />

          <main style={{ background: '#F8FAFF', flex: 1, overflowY: 'auto', padding: '48px 24px', paddingBottom: '96px' }}>
            {/* Header Section - per-tab copy from FEATURE_DESCRIPTIONS */}
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
              <h1
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '42px',
                  fontWeight: 400,
                  letterSpacing: '-0.025em',
                  color: '#0F172A',
                  textAlign: 'center',
                  marginBottom: '10px',
                  lineHeight: 1.1,
                }}
              >
                {activeTab === 'linkedin-email' && 'Import from LinkedIn'}
                {activeTab === 'contact-search' && 'Find People'}
                {activeTab === 'import' && 'Find People'}
                {activeTab === 'contact-library' && 'Track Your Contacts'}
                {!['linkedin-email', 'contact-search', 'import', 'contact-library'].includes(activeTab) && 'Find your next connection'}
              </h1>
              <p
                style={{
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: '16px',
                  color: '#64748B',
                  textAlign: 'center',
                  marginBottom: '28px',
                  lineHeight: 1.5,
                }}
              >
                {activeTab === 'linkedin-email' && 'Paste a LinkedIn URL to instantly find their email, generate an email draft and save their details in a spreadsheet.'}
                {(activeTab === 'contact-search' || activeTab === 'import') && 'Describe who you want to connect with (e.g. role, company, location). We\'ll find their emails and draft outreach for you.'}
                {activeTab === 'contact-library' && 'Everyone you find lands here. Update their status, open email drafts, and export to CSV.'}
                {!['linkedin-email', 'contact-search', 'import', 'contact-library'].includes(activeTab) && 'Discover professionals who can open doors at your target companies.'}
              </p>
              {(activeTab === 'contact-search' || activeTab === 'linkedin-email') && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/contact-search/templates")}
                    className="h-8 px-3.5 bg-white text-[#475569] hover:text-[#2563EB] border border-[#E2E8F0] hover:border-[#2563EB]/25 hover:bg-[#F8FAFF] shadow-sm hover:shadow-[0_2px_8px_rgba(37,99,235,0.08)] transition-all duration-200 rounded-lg font-medium text-[12.5px] tracking-[-0.01em] gap-1.5"
                    data-tour="tour-templates-button"
                  >
                    <FileText className="h-3.5 w-3.5 text-[#2563EB]" />
                    {activeEmailTemplate && hasEmailTemplateValues(activeEmailTemplate)
                      ? (() => {
                          const p = activeEmailTemplate.purpose;
                          const s = activeEmailTemplate.stylePreset;
                          const purposeLabel = p ? (p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, " ")) : "";
                          const styleLabel = s ? (s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ")) : "";
                          return purposeLabel && styleLabel ? `${purposeLabel} · ${styleLabel}` : purposeLabel || styleLabel || "Template";
                        })()
                      : "Email Template"}
                  </Button>
                </div>
              )}
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '36px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  gap: '0',
                  background: '#F0F4FD',
                  borderRadius: '12px',
                  padding: '4px',
                  margin: '0 auto',
                }}
              >
                {[
                  { id: 'linkedin-email', label: 'LinkedIn', icon: Linkedin },
                  { id: 'contact-search', label: 'Search', icon: Search },
                  { id: 'import', label: 'Import', icon: Upload },
                  { id: 'contact-library', label: 'Tracker', icon: User },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      borderRadius: '9px',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      fontSize: '14px',
                      fontWeight: 500,
                      transition: 'all 0.15s ease',
                      background: activeTab === tab.id ? '#2563EB' : 'transparent',
                      color: activeTab === tab.id ? 'white' : '#64748B',
                      boxShadow: activeTab === tab.id ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsContent value="contact-search" className="mt-0 focus-visible:outline-none">

                  {/* Gmail not connected banner */}
                  {gmailConnected === false && !gmailBannerDismissed && (
                    <div
                      className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
                      role="alert"
                    >
                      <div className="flex items-center gap-2 text-amber-800">
                        <Mail className="h-4 w-4 shrink-0" />
                        <span>
                          Gmail not connected — drafts won&apos;t be created.{" "}
                          <Button
                            variant="link"
                            className="h-auto p-0 text-amber-800 underline underline-offset-2"
                            onClick={initiateGmailOAuth}
                          >
                            Connect Gmail
                          </Button>
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-amber-700 hover:bg-amber-100"
                        aria-label="Dismiss"
                        onClick={() => setGmailBannerDismissed(true)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {/* Search Card */}
                  <div 
                    data-tour="tour-search-form"
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid rgba(37, 99, 235, 0.08)',
                      borderRadius: '14px',
                      padding: '36px 40px',
                      maxWidth: '900px',
                      margin: '0 auto',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
                    }}
                    className="overflow-hidden"
                  >

                    {/* Progress Bar (if searching) */}
                    {isSearching && (
                      <div className="absolute top-0 left-0 right-0 z-10">
                        <Progress value={progressValue} className="h-1 rounded-none bg-blue-50" />
                      </div>
                    )}

                    <div className="p-8 md:p-10 lg:p-12">

                      {/* Top Controls: Resume & Quick Start */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-8 border-b border-gray-100">
                        {/* Resume Status */}
                        <div className="flex-1">
                          <input
                            type="file"
                            accept={ACCEPTED_RESUME_TYPES.accept}
                            onChange={handleFileUpload}
                            className="hidden"
                            id="resume-upload"
                            disabled={isSearching || isUploadingResume}
                          />

                          {savedResumeUrl && savedResumeFileName ? (
                            <div className="flex items-center gap-4 group">
                              <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center border border-green-100 group-hover:bg-green-100 transition-colors">
                                <CheckCircle className="w-5 h-5 text-green-600" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-gray-900">Resume Active</p>
                                  <span className="text-[10px] font-bold tracking-wider uppercase bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                    Optimizing
                                  </span>
                                </div>
                                <button
                                  onClick={() => document.getElementById('resume-upload')?.click()}
                                  disabled={isSearching || isUploadingResume}
                                  className="text-sm text-gray-500 hover:text-blue-600 transition-colors text-left"
                                >
                                  Using <span className="font-medium text-gray-700">{savedResumeFileName}</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => !isSearching && !isUploadingResume && document.getElementById('resume-upload')?.click()}
                              className="flex items-center gap-4 cursor-pointer group"
                            >
                              <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center border border-gray-200 group-hover:border-blue-300 group-hover:bg-blue-50 transition-colors">
                                <Upload className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">Upload Resume</p>
                                <p className="text-sm text-gray-500">For better matching</p>
                              </div>
                            </div>
                          )}
                        </div>

                      </div>

                      {/* Targeted Email Indicator */}
                      {currentFitContext && currentFitContext.job_title && (
                        <div className="mb-8 bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white border border-gray-200 rounded-lg">
                              <Sparkles className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="text-sm">
                              <span className="font-medium text-gray-900">Targeted Search:</span>
                              <span className="text-gray-600 ml-1">
                                Scanning for <strong className="font-semibold text-gray-900">{currentFitContext.job_title}</strong> at {currentFitContext.company || 'target companies'}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              localStorage.removeItem('scout_fit_context');
                              setCurrentFitContext(null);
                            }}
                            className="h-8 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                          >
                            Clear
                          </Button>
                        </div>
                      )}

                      {/* Prompt search input - main interaction point */}
                      <div className="space-y-3 mb-6">
                        <label className="text-sm font-semibold text-gray-700 ml-1">Who do you want to connect with?</label>
                        <div className="relative">
                          <textarea
                            value={searchPrompt}
                            onChange={(e) => setSearchPrompt(e.target.value)}
                            placeholder="Describe who you want to connect with... e.g. &quot;Product managers at Google in NYC&quot;"
                            disabled={isSearching}
                            rows={3}
                            className="w-full px-5 py-4 text-base bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 resize-none transition-all duration-150 shadow-sm shadow-gray-200/50 hover:border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none"
                          />
                          {searchPrompt.trim() && (
                            <CheckCircle className="absolute right-4 top-4 w-5 h-5 text-green-500" />
                          )}
                        </div>
                        {/* Example prompt chips */}
                        <div className="flex flex-wrap gap-2">
                          {examplePromptChips.map((chip) => (
                            <button
                              key={chip.id}
                              type="button"
                              onClick={() => {
                                setSearchPrompt(chip.prompt);
                                setSelectedExampleId(chip.id);
                                setTimeout(() => setSelectedExampleId(null), 200);
                              }}
                              disabled={isSearching}
                              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-150
                                ${selectedExampleId === chip.id
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-gray-50/80 text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-800 hover:border-gray-300'
                                }`}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Quantity Selector - Slider */}
                      <div className="bg-gray-50 border border-gray-200 rounded-xl px-6 py-5 mb-10">
                        {/* Header row */}
                        <div className="flex items-center justify-between gap-4 mb-5">
                          <div>
                            <h3 className="text-base font-semibold text-gray-900 mb-1">Number of Contacts</h3>
                            <p className="text-sm text-gray-500">How many people should we find?</p>
                          </div>
                          <span className="text-sm text-gray-500">
                            {batchSize} selected
                          </span>
                        </div>

                        <div className="slider-container">
                          <div className="slider-wrapper">
                            <span className="text-xs text-gray-400 min-w-[20px]">1</span>
                            <div className="slider-input-wrapper">
                              {/* Filled track background */}
                              <div
                                className="slider-filled-track"
                                style={{
                                  width: `${((batchSize - 1) / (maxBatchSize - 1)) * 100}%`
                                }}
                              />
                              <input
                                type="range"
                                min={1}
                                max={maxBatchSize}
                                value={batchSize}
                                onChange={(e) => {
                                  const newValue = Number(e.target.value);
                                  // Ensure value doesn't exceed maxBatchSize
                                  const clampedValue = Math.min(newValue, maxBatchSize);
                                  setBatchSize(clampedValue);
                                }}
                                disabled={isSearching}
                                className="slider-custom"
                                aria-label="Number of contacts to find"
                                aria-valuemin={1}
                                aria-valuemax={maxBatchSize}
                                aria-valuenow={batchSize}
                                aria-disabled={isSearching}
                              />
                            </div>
                            <span className="text-xs text-gray-400 min-w-[24px]">{maxBatchSize}</span>
                          </div>
                        </div>

                        {/* Dynamic helper message */}
                        <p className="mt-2 text-sm text-gray-500 text-center">
                          {getContactCountHelper(batchSize)}
                        </p>
                      </div>

                      {/* Action Button */}
                      <div className="flex flex-col items-center gap-4">
                        <Button
                          ref={originalButtonRef}
                          onClick={handleSearch}
                          disabled={isSearching}
                          className={`
                            h-14 px-12 rounded-full text-lg font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300
                            ${isSearching
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                              : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-[1.02]'
                            }
                          `}
                        >
                          {isSearching ? (
                            <div className="flex items-center gap-3">
                              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                              <span>Searching...</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>Discover Contacts</span>
                              <ArrowRight className="w-5 h-5" />
                            </div>
                          )}
                        </Button>

                        {/* Look in tracker - show after search completes with results */}
                        {hasResults && !isSearching && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('contact-library');
                              setSearchParams({ tab: 'contact-library' }, { replace: true });
                            }}
                            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
                          >
                            <User className="h-3.5 w-3.5" />
                            View in tracker
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                    </div>
                  </div>

                </TabsContent>

                {/* Other Tabs content would go here, preserved as placeholders or real components if needed */}
                <TabsContent value="import" className="mt-6">
                  <ContactImport
                    onSwitchTab={(tab) => {
                      setActiveTab(tab);
                      setSearchParams({ tab }, { replace: true });
                    }}
                  />
                </TabsContent>

                <TabsContent value="linkedin-email" className="mt-6">
                  <div 
                    data-tour="tour-linkedin-input"
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid rgba(37, 99, 235, 0.08)',
                      borderRadius: '14px',
                      padding: '48px 40px',
                      maxWidth: '900px',
                      margin: '0 auto',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
                      textAlign: 'center',
                    }}
                    className="overflow-hidden"
                  >
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <Linkedin className="w-8 h-8 text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Import from LinkedIn</h2>
                    <p className="text-gray-500 mb-8 max-w-md mx-auto">
                      Paste a LinkedIn URL to instantly find their email, generate an email draft and save their details in a spreadsheet.
                    </p>

                    <div className="max-w-xl mx-auto">
                      <div className="flex gap-3">
                        <div className="relative flex-1">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2">
                            <Linkedin className="w-5 h-5 text-gray-400" />
                          </div>
                          <input
                            type="text"
                            placeholder="https://linkedin.com/in/username"
                            value={linkedInUrl}
                            onChange={(e) => setLinkedInUrl(e.target.value)}
                            className="w-full h-12 pl-12 pr-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                          />
                        </div>
                        <Button
                          onClick={handleLinkedInImport}
                          disabled={linkedInLoading || !linkedInUrl.trim()}
                          className="h-12 px-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md hover:shadow-lg transition-all"
                        >
                          {linkedInLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Import'}
                        </Button>
                      </div>

                      {linkedInError && (
                        <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 justify-center">
                          <AlertCircle className="w-4 h-4" />
                          {linkedInError}
                        </div>
                      )}

                      {linkedInSuccess && (
                        <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                          <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg flex items-center gap-2 justify-center">
                            <CheckCircle className="w-4 h-4 flex-shrink-0" />
                            {linkedInSuccess}
                          </div>
                          {linkedInLastDraftUrl && (
                            <Button
                              onClick={() => window.open(linkedInLastDraftUrl!, '_blank')}
                              className="mt-3 w-full sm:w-auto h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Open Gmail Draft
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="contact-library" className="mt-6">
                  <div 
                    data-tour="tour-tracker-table"
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid rgba(37, 99, 235, 0.08)',
                      borderRadius: '14px',
                      padding: '36px 40px',
                      maxWidth: '900px',
                      margin: '0 auto',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
                      minHeight: '600px',
                    }}
                    className="overflow-hidden"
                  >
                    <ContactDirectoryComponent />
                  </div>
                </TabsContent>

              </Tabs>
            </div>
          </main>
        </MainContentWrapper>
        
        {/* Sticky CTA - Only show on contact-search tab */}
        {activeTab === 'contact-search' && (
          <StickyCTA
            originalButtonRef={originalButtonRef}
            onClick={handleSearch}
            isLoading={isSearching}
            disabled={isSearching || !searchPrompt.trim() || !user}
            buttonClassName="rounded-full"
          >
            <span>Discover Contacts</span>
          </StickyCTA>
        )}
      </div>
    </SidebarProvider>
  );

};

export default ContactSearchPage;

