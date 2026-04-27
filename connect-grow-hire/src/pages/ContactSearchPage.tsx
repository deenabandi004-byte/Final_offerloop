import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useScout } from "@/contexts/ScoutContext";
import {
  Search, Linkedin, Send, Loader2, Sparkles, ArrowRight,
  User, Check, CheckCircle,
  FileText, Upload, Mail, Inbox, AlertCircle, X, ExternalLink, ChevronRight
} from "lucide-react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiService, BACKEND_URL, isErrorResponse, type EmailTemplate, getEmailTemplateLabel } from "@/services/api";
import { firebaseApi } from "../services/firebaseApi";
import type { Contact as ContactApi } from '../services/firebaseApi';
import { toast } from "@/hooks/use-toast";
import { TIER_CONFIGS } from "@/lib/constants";
import { logActivity, generateContactSearchSummary } from "@/utils/activityLogger";
import { EliteGateModal } from "@/components/EliteGateModal";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { db, storage, auth } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { trackFeatureActionCompleted, trackError } from "../lib/analytics";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import { StickyCTA } from "@/components/StickyCTA";
import ContactImport from "@/components/ContactImport";
import SuggestionChips from "@/components/find/SuggestionChips";
import { TemplateButton } from "@/components/TemplateButton";

import { DEV_MOCK_USER } from "@/lib/devPreview";
import { getUniversityShortName } from "@/lib/universityUtils";

// Session storage key for Scout auto-populate
const SCOUT_AUTO_POPULATE_KEY = 'scout_auto_populate';

function getPeopleFallbackPlaceholders(schoolShort: string | null): string[] {
  const base = [
    'Alumni at Goldman Sachs',
    'Engineers at Sequoia-backed startups',
    'Hiring managers at Disney',
  ];
  if (schoolShort) {
    return [
      `${schoolShort} data scientists at Google`,
      `Product managers who went to ${schoolShort}`,
      ...base,
    ];
  }
  return [
    'Data scientists at Google',
    'Product managers in tech',
    ...base,
  ];
}

// LinkedIn URL detection helper
function isLinkedInUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?/.test(trimmed)) return true;
  if (/^(www\.)?linkedin\.com\/in\/[\w-]+\/?/.test(trimmed)) return true;
  if (/^\/in\/[\w-]+\/?$/.test(trimmed)) return true;
  return false;
}

// Normalize a LinkedIn URL to a fully-qualified https URL
function normalizeLinkedInUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.startsWith('linkedin.com') || url.startsWith('www.linkedin.com')) {
      url = `https://${url}`;
    } else if (url.startsWith('/in/')) {
      url = `https://linkedin.com${url}`;
    } else if (url.includes('linkedin') && url.includes('/in/')) {
      const match = url.match(/\/in\/[^\/\s]+/);
      if (match) url = `https://linkedin.com${match[0]}`;
    } else {
      url = `https://linkedin.com/in/${url}`;
    }
  }
  return url;
}


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
                : 'text-[#6B7280] hover:text-[#0F172A]'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Full-width divider line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#E2E8F0]" />

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

const ContactSearchPage: React.FC<{ embedded?: boolean; hideSubTabs?: boolean; parentEmailTemplate?: EmailTemplate | null; isDevPreview?: boolean }> = ({ embedded = false, hideSubTabs = false, parentEmailTemplate, isDevPreview = false }) => {
  const { user: authUser, checkCredits, updateCredits } = useFirebaseAuth();
  const user = isDevPreview ? DEV_MOCK_USER as any : authUser;
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
  const searchSuccessRef = useRef<HTMLDivElement>(null);

  // Form state (prompt-based search)
  const pendingAutoSearch = useRef(false);
  const [searchPrompt, setSearchPrompt] = useState("");
  const [showTemplateTooltip, setShowTemplateTooltip] = useState(false);
  const templateTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCsvTooltip, setShowCsvTooltip] = useState(false);
  const csvTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [alreadySavedResults, setAlreadySavedResults] = useState<any[]>([]);
  // Backend-provided message for unusual result shapes (e.g. "All N matching contact(s)
  // are already in your tracker..."). Prefer this over hardcoded frontend copy.
  const [resultMessage, setResultMessage] = useState<string>("");
  const [companyContext, setCompanyContext] = useState<string>("");
  const [lastSearchStats, setLastSearchStats] = useState<{
    successful_drafts: number;
    total_contacts: number;
  } | null>(null);
  const hasResults = lastResults.length > 0 || alreadySavedResults.length > 0;

  // Auto-scroll to success state after search completes
  useEffect(() => {
    if (hasResults && !isSearching && searchSuccessRef.current) {
      searchSuccessRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [hasResults, isSearching]);

  // Batch size state
  const [batchSize, setBatchSize] = useState<number>(1);

  // UI polish state
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(false);

  // Rotating placeholder text with crossfade
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const [profileHints, setProfileHints] = useState<string[]>([]);
  const [inputFocused, setInputFocused] = useState(false);
  const [userSchoolShort, setUserSchoolShort] = useState<string | null>(null);
  const peopleFallbackPlaceholders = useMemo(() => getPeopleFallbackPlaceholders(userSchoolShort), [userSchoolShort]);

  useEffect(() => {
    if (!user?.uid) return;
    if (isDevPreview) {
      const school = getUniversityShortName((user as any)?.university);
      setUserSchoolShort(school);
      const hints: string[] = [];
      if (school) {
        hints.push(`${school} alumni in Data Science`);
        hints.push('Who\'s hiring for AI/ML?');
        hints.push(`${school} grads at McKinsey`);
      } else {
        hints.push('Alumni in Data Science');
        hints.push('Who\'s hiring for AI/ML?');
      }
      hints.push('Analysts in Los Angeles');
      hints.push('Try a company name, role, or school');
      setProfileHints(hints);
      return;
    }
    firebaseApi.getUserOnboardingData(user.uid).then((data) => {
      const uni = data.university || '';
      const shortUni = uni.replace(/^(University of |The )/, '').split(' - ')[0].split(',')[0].trim();
      setUserSchoolShort(getUniversityShortName(uni));
      const industries = data.targetIndustries || [];
      const locs = data.preferredLocations || [];
      const hints: string[] = [];
      if (shortUni && industries[0]) hints.push(`${shortUni} alumni in ${industries[0]}`);
      if (industries[0]) hints.push(`Who's hiring for ${industries[0]}?`);
      if (shortUni) hints.push(`${shortUni} grads at McKinsey`);
      if (locs[0]) hints.push(`Analysts in ${locs[0]}`);
      hints.push("Paste a LinkedIn URL to import a contact");
      hints.push("Who do you want to meet today?");
      if (shortUni) hints.push(`${shortUni} alumni at Goldman Sachs`);
      hints.push("Try a company name, role, or school");
      if (hints.length > 0) setProfileHints(hints);
    }).catch(() => {});
  }, [user?.uid, isDevPreview]);

  useEffect(() => {
    if (inputFocused || searchPrompt) return;
    const totalHints = profileHints.length > 0 ? profileHints.length : peopleFallbackPlaceholders.length;
    if (totalHints <= 1) return;
    const timer = setInterval(() => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIdx((i) => (i + 1) % (profileHints.length || peopleFallbackPlaceholders.length));
        setPlaceholderVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(timer);
  }, [profileHints.length, inputFocused, searchPrompt]);

  const placeholderText = profileHints.length > 0
    ? profileHints[placeholderIdx]
    : peopleFallbackPlaceholders[placeholderIdx % peopleFallbackPlaceholders.length];
  const showAnimatedPlaceholder = !searchPrompt && !inputFocused;

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
  const [gmailBannerDismissed, setGmailBannerDismissed] = useState(() => {
    try { return localStorage.getItem('offerloop-gmail-banner-dismissed') === 'true'; } catch { return false; }
  });
  const dismissGmailBanner = () => {
    setGmailBannerDismissed(true);
    try { localStorage.setItem('offerloop-gmail-banner-dismissed', 'true'); } catch {}
  };

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("contact-search");
  const [showEliteGate, setShowEliteGate] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const isElite = user?.tier === "elite";

  // LinkedIn Import state
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [linkedInError, setLinkedInError] = useState<string | null>(null);
  const [linkedInSuccess, setLinkedInSuccess] = useState<string | null>(null);
  const [linkedInLastDraftUrl, setLinkedInLastDraftUrl] = useState<string | null>(null);

  // Email template state (saved default + session override)
  const [savedEmailTemplate, setSavedEmailTemplate] = useState<EmailTemplate | null>(null);
  const [sessionEmailTemplate, setSessionEmailTemplate] = useState<EmailTemplate | null>(null);
  const activeEmailTemplate = parentEmailTemplate ?? sessionEmailTemplate ?? savedEmailTemplate;

  // Fallback to 'free' config if tier not found (safety for new tiers)
  const currentTierConfig = TIER_CONFIGS[userTier] || TIER_CONFIGS.free;

  // Sync activeTab from URL ?tab= (for product tour)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'linkedin-email') {
      setActiveTab('contact-search');
    } else if (tabParam === 'contact-search' || tabParam === 'contact-library' || tabParam === 'import') {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Read URL parameters (e.g., from "View Contacts" in Firm Library)
  useEffect(() => {
    const companyParam = searchParams.get('company');
    const locationParam = searchParams.get('location');
    const roleParam = searchParams.get('role');

    if (companyParam || locationParam || roleParam) {
      const parts = [];
      if (roleParam) parts.push(roleParam);
      if (companyParam) parts.push(`at ${companyParam}`);
      if (locationParam) parts.push(`in ${locationParam}`);
      setSearchPrompt(parts.join(' ') || '');
      pendingAutoSearch.current = true;

      setSearchParams({}, { replace: true });
    }
  }, []); // Run once on mount

  // Auto-trigger search when pre-filled from URL params (e.g. job board "Find Contact")
  useEffect(() => {
    if (pendingAutoSearch.current && searchPrompt.trim() && user) {
      pendingAutoSearch.current = false;
      handleSearch();
    }
  }, [searchPrompt, user]);

  // Load saved email template on mount (contact search tab)
  useEffect(() => {
    if (!user?.uid || isDevPreview) return;
    apiService.getEmailTemplate().then((t) => {
      setSavedEmailTemplate({
        purpose: t.purpose ?? null,
        stylePreset: t.stylePreset ?? null,
        customInstructions: t.customInstructions ?? "",
        name: t.name,
        subject: t.subject,
        savedTemplateId: t.savedTemplateId,
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
      navigate("/find", { replace: true, state: {} });
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
          warmthScore: c.warmth_score ?? undefined,
          warmthTier: c.warmth_tier ?? undefined,
          warmthSignals: c.warmth_signals ?? undefined,
          personalizationLabel: c.personalization?.label ?? undefined,
          personalizationType: c.personalization?.commonality_type ?? undefined,
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
      const data = await apiService.gmailStatus();
      return !data.connected;
    } catch (error) {
      const isDev = import.meta.env.DEV;
      if (isDev) console.error("Error checking Gmail status:", error);
      return true;
    }
  };

  const initiateGmailOAuth = async () => {
    try {
      const authUrl = await apiService.startGmailOAuth();
      if (authUrl) {
        sessionStorage.setItem('gmail_oauth_return', window.location.pathname);
        window.location.href = authUrl;
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error("Error initiating Gmail OAuth:", error);
    }
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
    if (!user?.uid || isDevPreview) return;
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

      const API_URL = BACKEND_URL;

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
  const handleLinkedInImport = async (urlOverride?: string) => {
    const rawUrl = urlOverride || linkedInUrl;
    if (!rawUrl.trim()) return;

    // Normalize LinkedIn URL (accepts URLs with or without protocol)
    let normalizedUrl = rawUrl.trim();

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

      const API_BASE = BACKEND_URL;

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
    setResultMessage("");

    let progressInterval: NodeJS.Timeout | null = null;
    let searchSucceeded = false;
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
      const result = await apiService.runPromptSearch({ prompt: searchPrompt.trim(), batchSize, emailTemplate: activeEmailTemplate });

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

      const creditsUsed = (result as any)?.credits_used ?? result.contacts.length * 15;
      if ((result as any)?.credits_remaining !== undefined && updateCredits) {
        await updateCredits((result as any).credits_remaining).catch(() => {});
      } else if (updateCredits) {
        const newCredits = Math.max(0, currentCredits - creditsUsed);
        await updateCredits(newCredits).catch(() => {});
      }
      setProgressValue(100);
      const alreadySavedFromServer = (result as any)?.already_saved_contacts || [];
      const backendMessage = (result as any)?.message || "";
      setLastResults(result.contacts);
      setAlreadySavedResults(alreadySavedFromServer);
      setResultMessage(backendMessage);
      setCompanyContext((result as any)?.parsed_query?.company_context || "");

      if (result.contacts.length === 0 && alreadySavedFromServer.length === 0) {
        triggerScoutForNoResults();
        setSearchComplete(true);
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

      // Backend already saves contacts to Firestore (runs.py save loop) — no frontend save needed

      setLastSearchStats({
        successful_drafts: 0,
        total_contacts: result.contacts.length + ((result as any)?.already_saved_contacts?.length || 0),
      });
      setSearchComplete(true);
      searchSucceeded = true;

      const savedCount = alreadySavedFromServer.length;
      const newCount = result.contacts.length;
      if (newCount === 0 && savedCount === 0) {
        // Genuine no-results — Scout panel already opened above; a short toast
        // confirms the outcome without claiming "Contacts Found!".
        toast({
          title: "No matching contacts found",
          description: backendMessage || "Try broadening your search.",
          duration: 5000,
        });
      } else if (newCount === 0 && savedCount > 0) {
        // All matches already saved. Use the backend's exact message so the UI
        // copy matches what the API contract promises (and gives the user a
        // specific next step: open them in the network or broaden the search).
        toast({
          title: "Already in your tracker",
          description: backendMessage
            || `All ${savedCount} matching contact(s) are already in your tracker. Open them in your network, or broaden your search to find new people.`,
          duration: 7000,
        });
      } else {
        toast({
          title: "Contacts Found!",
          description: savedCount > 0
            ? `Found ${newCount + savedCount} contacts (${newCount} new, ${savedCount} already saved) — view in your Outbox.`
            : `Found ${newCount} contacts — view them in your Outbox to start outreach.`,
          duration: 5000,
        });
      }
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
      if (searchSucceeded) {
        setTimeout(() => {
          setProgressValue(0);
          setSearchComplete(false);
        }, 2000);
      } else {
        setTimeout(() => setProgressValue(0), 500);
      }
    }
  };

  // Unified submit handler — routes to LinkedIn import or search
  const handleSubmit = () => {
    const input = searchPrompt.trim();
    if (!input) return;
    if (isLinkedInUrl(input)) {
      const normalized = normalizeLinkedInUrl(input);
      setLinkedInUrl(normalized);
      handleLinkedInImport(normalized);
    } else {
      handleSearch();
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

  // --- Embedded content (rendered inside FindPage wrapper) ---
  const embeddedContent = (
    <>
      {/* Gmail hint — subtle inline text, not a warning banner */}
      {gmailConnected === false && !gmailBannerDismissed && (
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '8px 32px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--warm-ink-tertiary, #9C9590)' }}>
            <button
              type="button"
              onClick={initiateGmailOAuth}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--warm-ink-secondary, #6B6560)', textDecoration: 'underline', textUnderlineOffset: 2, fontFamily: 'inherit' }}
            >
              Connect Gmail
            </button>
            {' '}to auto-create email drafts
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismissGmailBanner}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-ink-tertiary, #9C9590)', fontSize: 14, lineHeight: 1, padding: 2 }}
          >
            &times;
          </button>
        </div>
      )}

      <div
        data-tour="tour-search-form"
        style={{ padding: '24px 32px 32px', maxWidth: '860px' }}
      >
        <input
          type="file"
          accept={ACCEPTED_RESUME_TYPES.accept}
          onChange={handleFileUpload}
          className="hidden"
          id="resume-upload"
          disabled={isSearching || isUploadingResume}
        />

        {/* Progress Bar */}
        {isSearching && (
          <div style={{ marginBottom: 16 }}>
            <Progress value={progressValue} className="h-0.5 rounded-none" />
          </div>
        )}

        {/* Targeted context banner */}
        {currentFitContext && currentFitContext.job_title && (
          <div
            style={{
              marginBottom: 16,
              background: '#FAFBFF',
              border: '0.5px solid #E2E8F0',
              borderRadius: 3,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-[#3B82F6]" />
              <span className="text-sm text-[#6B7280]">
                Targeting <span className="font-medium text-[#0F172A]">{currentFitContext.job_title}</span> at {currentFitContext.company || 'target companies'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem('scout_fit_context');
                setCurrentFitContext(null);
              }}
              className="h-7 text-[#94A3B8] hover:text-[#0F172A]"
            >
              Clear
            </Button>
          </div>
        )}

        {/* Personalized suggestion cards — shown above search box */}
        {!searchPrompt.trim() && (
          <SuggestionChips
            type="people"
            uid={user?.uid}
            onSelect={(prompt) => {
              setSearchPrompt(prompt);
              setTimeout(() => { pendingAutoSearch.current = true; }, 0);
            }}
            collapsed={suggestionsCollapsed}
            onCollapse={setSuggestionsCollapsed}
            hasSearched={hasResults}
            disabled={isSearching || linkedInLoading}
          />
        )}

        {/* Hero search bar */}
        <div style={{ marginTop: 20, marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '16px 20px',
              border: '1.5px solid var(--warm-border, #E8E4DE)',
              borderRadius: 14,
              background: 'var(--warm-surface, #FAF9F6)',
              transition: 'all .15s',
              minHeight: 110,
            }}
            className="focus-within:border-[#2563EB] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
          >
            <Search style={{ width: 16, height: 16, flexShrink: 0, color: '#3B82F6', marginTop: 1 }} />
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                value={searchPrompt}
                onChange={(e) => { setSearchPrompt(e.target.value); setLinkedInError(null); setLinkedInSuccess(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={inputFocused && !searchPrompt ? placeholderText : undefined}
                disabled={isSearching || linkedInLoading}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'none',
                  fontSize: 14,
                  color: '#0F172A',
                  outline: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                }}
              />
              {/* Animated placeholder overlay — fades between suggestions */}
              {showAnimatedPlaceholder && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    pointerEvents: 'none',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    color: 'var(--warm-ink-tertiary, #9C9590)',
                    opacity: placeholderVisible ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {placeholderText}
                </div>
              )}
            </div>
            {isLinkedInUrl(searchPrompt) && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(59,130,246,0.10)',
                color: '#3B82F6',
                fontSize: 12,
                fontWeight: 500,
                padding: '4px 10px',
                borderRadius: 100,
                whiteSpace: 'nowrap',
                marginTop: 2,
              }}>
                <Linkedin className="h-3 w-3" />
                LinkedIn
              </div>
            )}
          </div>
          {/* Template button + Import link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <TemplateButton
              template={activeEmailTemplate}
              onClick={() => navigate("/find/templates")}
            />
            <button
              type="button"
              onClick={() => setShowImportDialog(true)}
              style={{ fontSize: 12, color: 'var(--accent, #1B2A44)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
            >
              Import contacts
            </button>
          </div>
        </div>

        {linkedInError && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-[3px] flex items-center gap-2 border border-red-200 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {linkedInError}
          </div>
        )}

        {/* Quantity slider — shown after user types, hidden for LinkedIn */}
        {searchPrompt.trim() && !isLinkedInUrl(searchPrompt) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, letterSpacing: '.05em', marginBottom: 8 }}>
              HOW MANY TO FIND?
            </div>
            <div className="slider-container">
              <div className="slider-wrapper">
                <span className="text-xs text-[#94A3B8] min-w-[16px]">1</span>
                <div className="slider-input-wrapper">
                  <div
                    className="slider-filled-track"
                    style={{
                      width: maxBatchSize > 1 ? `${((batchSize - 1) / (maxBatchSize - 1)) * 100}%` : '0%'
                    }}
                  />
                  <input
                    type="range"
                    min={1}
                    max={maxBatchSize}
                    value={batchSize}
                    onChange={(e) => {
                      const clampedValue = Math.min(Number(e.target.value), maxBatchSize);
                      setBatchSize(clampedValue);
                    }}
                    disabled={isSearching}
                    className="slider-custom"
                    aria-label="Number of contacts to find"
                  />
                </div>
                <span className="text-xs text-[#94A3B8] min-w-[20px] text-right">{maxBatchSize}</span>
              </div>
            </div>
            <p className="text-xs text-[#6B7280] mt-2">{batchSize} contact{batchSize !== 1 ? 's' : ''}. {getContactCountHelper(batchSize)}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-[#6B7280]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-[#FAFBFF] border border-[#E2E8F0] font-medium text-[#0F172A]">
                {batchSize * 15} credits
              </span>
              <span>of {effectiveUser.credits ?? 0} available</span>
            </div>
          </div>
        )}

        {/* CTA button */}
        <button
          ref={originalButtonRef}
          onClick={handleSubmit}
          disabled={isSearching || linkedInLoading}
          style={{
            width: '100%',
            height: 52,
            borderRadius: 12,
            background: (isSearching || linkedInLoading) ? 'var(--warm-border, #E8E4DE)'
              : (!searchPrompt.trim() || !user) ? 'transparent'
              : 'var(--ink, #1A1D23)',
            color: (isSearching || linkedInLoading) ? 'var(--warm-ink-tertiary, #9C9590)'
              : (!searchPrompt.trim() || !user) ? '#6B6560'
              : 'var(--paper, #FFFFFF)',
            border: (!searchPrompt.trim() || !user) && !(isSearching || linkedInLoading) ? '1.5px solid #D5D0C9' : '1.5px solid transparent',
            fontSize: 15,
            fontWeight: 600,
            cursor: (isSearching || linkedInLoading) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all .15s ease',
            fontFamily: 'inherit',
          }}
        >
          {isSearching || linkedInLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{linkedInLoading ? 'Importing...' : 'Finding people...'}</span>
            </>
          ) : isLinkedInUrl(searchPrompt) ? (
            <>
              <Linkedin className="w-4 h-4" />
              <span>Import from LinkedIn</span>
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              <span>Find people</span>
            </>
          )}
        </button>

        {/* Resume upload card — shown when no results and no resume */}
        {!hasResults && !isSearching && !savedResumeUrl && (
          <div
            className="max-sm:flex-col max-sm:items-start"
            style={{
              marginTop: 20,
              background: '#FFFFFF',
              border: '1px solid var(--warm-border, #E8E4DE)',
              borderRadius: 12,
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'var(--warm-surface, #F9FAFB)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <FileText style={{ width: 20, height: 20, color: '#6B6560' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1714', marginBottom: 3 }}>
                Upload your resume for better matches
              </div>
              <div style={{ fontSize: 12, color: 'var(--warm-ink-tertiary, #9C9590)', lineHeight: 1.5 }}>
                We'll find people who hired for roles like yours — and tailor your outreach automatically.
              </div>
            </div>
            <button
              className="max-sm:w-full"
              onClick={() => document.getElementById('resume-upload')?.click()}
              style={{
                background: '#1A1714',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Upload resume
            </button>
          </div>
        )}

        {/* Resume status — compact indicator when resume is already uploaded */}
        {savedResumeUrl && savedResumeFileName && !hasResults && !isSearching && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
            <button
              onClick={() => document.getElementById('resume-upload')?.click()}
              disabled={isSearching || isUploadingResume}
              style={{
                fontSize: 11,
                color: 'var(--warm-ink-tertiary, #9C9590)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                fontFamily: 'inherit',
              }}
            >
              <Check className="w-3 h-3 text-green-600" />
              Resume: <span style={{ fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>{savedResumeFileName}</span>
            </button>
          </div>
        )}


        {/* Results section */}
        {hasResults && !isSearching && !linkedInSuccess && (
          <div
            ref={searchSuccessRef}
            style={{
              marginTop: 24,
              paddingTop: 24,
              borderTop: '0.5px solid #EEF2F8',
            }}
          >
            {/* Success pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                background: '#DCFCE7',
                color: '#15803D',
                border: '0.5px solid #BBF7D0',
                borderRadius: 100,
                fontSize: 11,
                fontWeight: 500,
              }}>
                <CheckCircle className="w-3 h-3" />
                {lastResults.length + alreadySavedResults.length} {(lastResults.length + alreadySavedResults.length) === 1 ? 'result' : 'results'} found
              </div>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>
                {lastResults.length > 0 ? `${lastResults.length} new — saved to your tracker automatically` : ''}
                {lastResults.length > 0 && alreadySavedResults.length > 0 ? ' · ' : ''}
                {alreadySavedResults.length > 0 ? `${alreadySavedResults.length} already in your tracker` : ''}
              </span>
            </div>

            {/* Backend message — persistent inline callout for "all already saved" (or similar)
                shapes. Prefer this over toast-only so users don't miss the context after the
                toast auto-dismisses. Only shown when there are no new contacts; otherwise the
                success pill + result cards already tell the story. */}
            {resultMessage && lastResults.length === 0 && alreadySavedResults.length > 0 && (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(245,158,11,0.06)',
                border: '0.5px solid #FDE68A',
                borderRadius: 6,
                fontSize: 13,
                color: '#713F12',
                lineHeight: 1.5,
                marginBottom: 12,
              }}>
                {resultMessage}
              </div>
            )}

            {/* Company context hint — explains when search intent was reinterpreted */}
            {companyContext && (
              <div style={{
                padding: '8px 12px',
                background: 'rgba(59,130,246,0.05)',
                border: '0.5px solid #E2E8F0',
                borderRadius: 3,
                fontSize: 12,
                color: '#6B7280',
                lineHeight: 1.4,
              }}>
                {companyContext}. Showing related roles at this organization.
              </div>
            )}

            {/* Contact cards */}
            {lastResults.length <= 8 && lastResults.map((c: any, i: number) => {
              const name = [c.FirstName || c.firstName, c.LastName || c.lastName].filter(Boolean).join(' ') || 'Unknown';
              const title = c.JobTitle || c.jobTitle || c.Title || '';
              const company = c.Company || c.company || '';
              const email = c.Email || c.email || '';
              const linkedin = c.LinkedIn || c.linkedinUrl || '';
              const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '11px 13px',
                    background: '#fff',
                    border: '0.5px solid #E2E8F0',
                    borderRadius: 3,
                    marginBottom: 6,
                    cursor: 'pointer',
                    transition: 'all .12s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#3B82F6';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(59,130,246,.08)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#E2E8F0';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: 'rgba(59,130,246,0.10)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#0F172A',
                    flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#0F172A' }}>{name}</span>
                      {/* Warmth indicator */}
                      {c.warmth_tier === 'warm' && (
                        <span
                          title={(() => {
                            const sigs = c.warmth_signals || [];
                            return sigs.slice(0, 2).map((s: any) => s.detail || s.signal?.replace(/_/g, ' ')).filter(Boolean).join(', ');
                          })()}
                          style={{
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: 'rgba(34, 197, 94, 0.10)',
                            color: '#16A34A',
                            fontSize: 10,
                            fontWeight: 600,
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                          }}
                        >
                          Strong match
                        </span>
                      )}
                      {c.warmth_tier === 'neutral' && (
                        <span
                          title={(() => {
                            const sigs = c.warmth_signals || [];
                            return sigs.slice(0, 2).map((s: any) => s.detail || s.signal?.replace(/_/g, ' ')).filter(Boolean).join(', ');
                          })()}
                          style={{
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: 'rgba(245, 158, 11, 0.10)',
                            color: '#D97706',
                            fontSize: 10,
                            fontWeight: 600,
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                          }}
                        >
                          Good fit
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                      {[title, company].filter(Boolean).join(' at ')}
                    </div>
                    {/* Personalization tag */}
                    {c.personalization?.label && (
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: 3,
                          padding: '1px 7px',
                          borderRadius: 3,
                          fontSize: 10,
                          fontWeight: 500,
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          background: c.personalization?.commonality_type === 'university' ? 'rgba(59,130,246,0.08)' :
                                     c.personalization?.commonality_type === 'hometown' ? 'rgba(34,197,94,0.08)' :
                                     c.personalization?.commonality_type === 'company' ? 'rgba(124,58,237,0.08)' :
                                     'rgba(107,114,128,0.08)',
                          color: c.personalization?.commonality_type === 'university' ? '#2563EB' :
                                 c.personalization?.commonality_type === 'hometown' ? '#16A34A' :
                                 c.personalization?.commonality_type === 'company' ? '#7C3AED' :
                                 '#6B7280',
                        }}
                      >
                        {c.personalization.label}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {email && <span style={{ fontSize: 11, color: '#94A3B8' }}>{email}</span>}
                    {linkedin && (
                      <a href={linkedin.startsWith('http') ? linkedin : `https://${linkedin}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Already saved contacts */}
            {alreadySavedResults.length > 0 && (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 10,
                  marginBottom: 4,
                }}>
                  <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                  <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Already in your tracker
                  </span>
                  <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                </div>
                {alreadySavedResults.map((c: any, i: number) => {
                  const name = [c.FirstName || c.firstName, c.LastName || c.lastName].filter(Boolean).join(' ') || 'Unknown';
                  const title = c.Title || c.JobTitle || c.jobTitle || '';
                  const company = c.Company || c.company || '';
                  const linkedin = c.LinkedIn || c.linkedinUrl || '';
                  const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
                  return (
                    <div
                      key={`saved-${i}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        padding: '11px 13px',
                        background: '#FAFAFA',
                        border: '0.5px solid #E2E8F0',
                        borderRadius: 3,
                        marginBottom: 6,
                        opacity: 0.7,
                      }}
                    >
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: 'rgba(107,114,128,0.10)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#6B7280',
                        flexShrink: 0,
                      }}>
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#6B7280' }}>{name}</span>
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: 'rgba(107,114,128,0.08)',
                            color: '#94A3B8',
                            fontSize: 10,
                            fontWeight: 500,
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                          }}>
                            Already saved
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                          {[title, company].filter(Boolean).join(' at ')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {linkedin && (
                          <a href={linkedin.startsWith('http') ? linkedin : `https://${linkedin}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            <ExternalLink className="w-3.5 h-3.5" style={{ color: '#CBD5E1' }} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 7, marginTop: 14 }}>
              <button
                onClick={() => navigate('/outbox')}
                style={{
                  flex: 1,
                  height: 37,
                  borderRadius: 3,
                  background: '#3B82F6',
                  color: '#fff',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  fontFamily: 'inherit',
                }}
              >
                <Inbox className="w-3 h-3" />
                View in Outbox
              </button>
              <button
                onClick={() => navigate('/contact-directory')}
                style={{
                  flex: 1,
                  height: 37,
                  borderRadius: 3,
                  background: '#fff',
                  border: '0.5px solid #E2E8F0',
                  color: '#6B7280',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  fontFamily: 'inherit',
                }}
              >
                <User className="w-3 h-3" />
                View in Spreadsheet
              </button>
            </div>
          </div>
        )}

        {/* LinkedIn success */}
        {linkedInSuccess && (
          <div style={{
            marginTop: 24,
            paddingTop: 24,
            borderTop: '0.5px solid #EEF2F8',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                background: '#DCFCE7',
                color: '#15803D',
                border: '0.5px solid #BBF7D0',
                borderRadius: 100,
                fontSize: 11,
                fontWeight: 500,
              }}>
                <CheckCircle className="w-3 h-3" />
                {linkedInSuccess}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              {linkedInLastDraftUrl && (
                <button
                  onClick={() => window.open(linkedInLastDraftUrl!, '_blank')}
                  style={{
                    flex: 1,
                    height: 37,
                    borderRadius: 3,
                    background: '#3B82F6',
                    color: '#fff',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    fontFamily: 'inherit',
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                  Open Gmail Draft
                </button>
              )}
              <button
                onClick={() => navigate('/contact-directory')}
                style={{
                  flex: 1,
                  height: 37,
                  borderRadius: 3,
                  background: '#fff',
                  border: '0.5px solid #E2E8F0',
                  color: '#6B7280',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  fontFamily: 'inherit',
                }}
              >
                <User className="w-3 h-3" />
                View in Spreadsheet
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <StickyCTA
        originalButtonRef={originalButtonRef}
        onClick={handleSubmit}
        isLoading={isSearching || linkedInLoading}
        disabled={isSearching || linkedInLoading || !searchPrompt.trim() || !user}
        buttonClassName="rounded-[3px]"
      >
        {isLinkedInUrl(searchPrompt)
          ? <span className="flex items-center gap-2"><Linkedin className="w-4 h-4" />Import from LinkedIn</span>
          : <span>Find people</span>
        }
      </StickyCTA>

      <EliteGateModal open={showEliteGate} onClose={() => setShowEliteGate(false)} />

      {/* Import CSV dialog */}
      {showImportDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }}
            onClick={() => setShowImportDialog(false)}
          />
          <div
            style={{
              position: 'relative',
              background: '#fff',
              borderRadius: 3,
              width: '100%',
              maxWidth: 600,
              maxHeight: '85vh',
              overflowY: 'auto',
              margin: 16,
              boxShadow: '0 4px 12px rgba(0,0,0,.08)',
            }}
          >
            <button
              type="button"
              onClick={() => setShowImportDialog(false)}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: '#94A3B8',
                zIndex: 1,
              }}
            >
              <X className="h-4 w-4" />
            </button>
            <div style={{ padding: '24px' }}>
              <ContactImport
                onImportComplete={() => setShowImportDialog(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return embeddedContent;

  // --- Standalone page with full shell ---
  return (
    <>
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#FFFFFF] text-foreground font-sans">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader
            title=""
            onJobTitleSuggestion={handleJobTitleSuggestion}
            rightContent={
              <>
                <button
                  onClick={() => navigate("/find/templates")}
                  className="hidden md:flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#0F172A] cursor-pointer transition-colors"
                >
                  Template:&nbsp;<span className="font-medium text-[#0F172A]">
                    {getEmailTemplateLabel(activeEmailTemplate)}
                  </span>
                </button>
                <Button
                  type="button"
                  onClick={() => isElite ? navigate("/find/templates") : setShowEliteGate(true)}
                  className="h-8 px-4 rounded-[3px] bg-[#3B82F6] hover:bg-[#2563EB] text-white text-sm font-medium transition-all"
                  data-tour="tour-templates-button"
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline whitespace-nowrap ml-2">
                    Email Template
                  </span>
                </Button>
              </>
            }
          />

          <main style={{ background: '#FFFFFF', flex: 1, overflowY: 'auto' }} className="px-4 py-8 pb-24 sm:px-8 sm:py-12 sm:pb-24">
            {/* Header */}
            <div className="w-full mb-8" style={{ maxWidth: '720px', margin: '0 auto' }}>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#0F172A] mb-2" style={{ fontFamily: "'Lora', Georgia, serif" }}>
                {(activeTab === 'contact-search' || activeTab === 'import') && 'Find People'}
                {activeTab === 'contact-library' && 'Your Contacts'}
                {!['contact-search', 'import', 'contact-library'].includes(activeTab) && 'Find'}
              </h1>
              <p className="text-sm text-[#6B7280] leading-relaxed">
                {(activeTab === 'contact-search' || activeTab === 'import') && 'Search by name, role, or company — or paste a LinkedIn URL.'}
                {activeTab === 'contact-library' && 'Everyone you find lands here. Track status, view emails, and export.'}
                {!['contact-search', 'import', 'contact-library'].includes(activeTab) && 'Discover professionals at your target companies.'}
              </p>
            </div>

            {embeddedContent}
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
    </>
  );

};

export default ContactSearchPage;