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
  Briefcase, Building2, MapPin, GraduationCap, User, Check, CheckCircle,
  FileText, Upload, Mail, Inbox, AlertCircle
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
// ScoutBubble removed - now using ScoutHeaderButton in PageHeaderActions
import { Button } from "@/components/ui/button";
import ContactDirectoryComponent from "@/components/ContactDirectory";
import { Progress } from "@/components/ui/progress";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { apiService, isErrorResponse } from "@/services/api";
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

// Quick start templates for common searches
const quickStartTemplates = [
  { id: 1, label: 'IB Analyst in NYC', jobTitle: 'Investment Banking Analyst', location: 'New York, NY', company: '', college: '' },
  { id: 2, label: 'PM at Google', jobTitle: 'Product Manager', company: 'Google', location: 'San Francisco, CA', college: '' },
  { id: 3, label: 'Consulting at McKinsey', jobTitle: 'Consultant', company: 'McKinsey', location: 'New York, NY', college: '' },
  { id: 4, label: 'SWE in Bay Area', jobTitle: 'Software Engineer', location: 'San Francisco, CA', company: '', college: '' },
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

  // Form state
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [collegeAlumni, setCollegeAlumni] = useState("");
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

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("contact-search");

  // LinkedIn Import state
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [linkedInError, setLinkedInError] = useState<string | null>(null);
  const [linkedInSuccess, setLinkedInSuccess] = useState<string | null>(null);

  // Fallback to 'free' config if tier not found (safety for new tiers)
  const currentTierConfig = TIER_CONFIGS[userTier] || TIER_CONFIGS.free;

  // Read URL parameters (e.g., from "View Contacts" in Firm Library)
  useEffect(() => {
    const companyParam = searchParams.get('company');
    const locationParam = searchParams.get('location');

    if (companyParam || locationParam) {
      if (companyParam) {
        setCompany(companyParam);
      }
      if (locationParam) {
        setLocation(locationParam);
      }

      // Clear URL params after reading to avoid re-triggering
      setSearchParams({}, { replace: true });

      // Show toast to indicate pre-fill
      toast({
        title: "Search pre-filled",
        description: `Finding contacts at ${companyParam || 'this company'}`,
      });
    }
  }, []); // Run once on mount

  // Handle Scout auto-populate from failed search or chat requests
  useEffect(() => {
    const handleAutoPopulate = () => {
      try {
        const stored = sessionStorage.getItem(SCOUT_AUTO_POPULATE_KEY);
        if (stored) {
          const data = JSON.parse(stored);

          // Handle both formats: search help format (nested) and chat format (flat)
          let populateData;
          if (data.search_type === 'contact') {
            if (data.auto_populate) {
              // Search help format (nested)
              populateData = data.auto_populate;
            } else {
              // Chat format (flat)
              populateData = data;
            }

            const { job_title, company: autoCompany, location: autoLocation } = populateData;
            if (job_title) setJobTitle(job_title);
            if (autoCompany) setCompany(autoCompany);
            if (autoLocation) setLocation(autoLocation);

            // Clear the stored data
            sessionStorage.removeItem(SCOUT_AUTO_POPULATE_KEY);

            toast({
              title: "Search pre-filled",
              description: "Scout has filled in your search fields. Click Search to find contacts.",
            });
          }
        }
      } catch (e) {
        console.error('[Scout] Auto-populate error:', e);
      }
    };

    // Run on mount
    handleAutoPopulate();

    // Also listen for custom event (for when already on page)
    window.addEventListener('scout-auto-populate', handleAutoPopulate);
    return () => window.removeEventListener('scout-auto-populate', handleAutoPopulate);
  }, []);

  // Helper function to trigger Scout on 0 results
  const triggerScoutForNoResults = useCallback(() => {
    openPanelWithSearchHelp({
      searchType: 'contact',
      failedSearchParams: {
        job_title: jobTitle.trim(),
        company: company.trim(),
        location: location.trim(),
      },
      errorType: 'no_results',
    });
  }, [openPanelWithSearchHelp, jobTitle, company, location]);

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

  // Scout job title suggestion handler
  const handleJobTitleSuggestion = (title: string, company?: string, location?: string) => {
    setJobTitle(title);
    if (company) setCompany(company);
    if (location) setLocation(location);

    // Note: Fit context is stored separately when user clicks "Find Contacts in This Role"
    // from the job analysis panel, so we don't clear it here
  };

  // Clear fit context when user manually edits search fields (starts fresh search)
  useEffect(() => {
    const handleFieldChange = () => {
      // If user manually changes job title or clears it, they're starting a new search
      // Don't auto-clear fit context though - let it persist until email generation
    };

    // Only clear fit context on explicit "Clear" action or new search without Scout
    // Fit context will be cleared after email generation completes
  }, [jobTitle, company]);

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

  // Search handler
  const handleSearch = async () => {
    if (!jobTitle.trim() || !location.trim()) {
      toast({
        title: "Missing Required Fields",
        description: "Please enter both job title and location.",
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
    setProgressValue(10); // Start at 10% to show search has begun
    setSearchComplete(false);

    // Progress simulation interval - declared outside try block for proper cleanup
    let progressInterval: NodeJS.Timeout | null = null;
    const startProgressSimulation = () => {
      let currentProgress = 10;
      progressInterval = setInterval(() => {
        if (currentProgress < 85) {
          // Gradually increase progress up to 85% while waiting
          currentProgress += Math.random() * 5 + 2; // Increment by 2-7%
          currentProgress = Math.min(currentProgress, 85); // Cap at 85% until search completes
          setProgressValue(Math.floor(currentProgress));
        }
      }, 500); // Update every 500ms
    };

    try {
      // Start progress simulation
      startProgressSimulation();

      // ✅ FIXED: Parallelize API calls instead of sequential
      const [userProfile, currentCredits] = await Promise.all([
        getUserProfileData(),
        checkCredits ? checkCredits() : Promise.resolve(effectiveUser.credits ?? 0)
      ]);

      // Update progress after initial data fetch
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

      // For pro and elite tiers, check if we have a resume (either uploaded in this session or saved)
      if ((userTier === "pro" || userTier === "elite") && !uploadedFile && !savedResumeUrl) {
        if (progressInterval) clearInterval(progressInterval);
        setIsSearching(false);
        setProgressValue(0);
        toast({
          title: "Resume Required",
          description: `${userTier === "elite" ? "Elite" : "Pro"} tier requires a resume upload for similarity matching.`,
          variant: "destructive",
        });
        return;
      }

      // Helper function to get resume file (either uploaded or downloaded from saved URL)
      const getResumeFile = async (): Promise<File> => {
        if (uploadedFile) {
          return uploadedFile;
        }

        if (savedResumeUrl && savedResumeFileName) {
          // Download the saved resume and convert to File
          const response = await fetch(savedResumeUrl);
          const blob = await response.blob();
          return new File([blob], savedResumeFileName, { type: 'application/pdf' });
        }

        throw new Error('No resume available');
      };

      // Update progress before starting search
      setProgressValue(30);

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

        setProgressValue(40); // Progress update before API call
        const result = await apiService.runFreeSearch(searchRequest);
        if (!isSearchResult(result)) {
          if (progressInterval) clearInterval(progressInterval);
          setProgressValue(0);
          toast({
            title: "Search Failed",
            description: (result as any)?.error || "Please try again.",
            variant: "destructive",
          });
          return;
        }

        // Clear progress interval and update to 90% while processing results
        if (progressInterval) clearInterval(progressInterval);
        setProgressValue(90);

        const creditsUsed = result.contacts.length * 15;
        const newCredits = Math.max(0, currentCredits - creditsUsed);

        // Wait for credits to be updated before showing success screen
        if (updateCredits) {
          await updateCredits(newCredits).catch(() => { });
        }

        // Set progress to 100% when search completes
        setProgressValue(100);

        setLastResults(result.contacts);

        // Delay showing success message until after:
        // 1. Credits are subtracted (already done above)
        // 2. Contacts are saved to Firestore (backend completes before response, but allow propagation time)
        // 3. All drafts are created and logged
        setTimeout(() => {
          setLastSearchStats({
            successful_drafts: result.successful_drafts ?? 0,
            total_contacts: result.contacts.length,
          });
          // Show success screen only after credits are updated and contacts are saved
          setSearchComplete(true);
        }, 2000); // 2 second delay to ensure Firestore writes propagate and credits are fully updated

        // Trigger Scout if 0 results
        if (result.contacts.length === 0) {
          triggerScoutForNoResults();
        }

        // Track PostHog event
        // Note: Only captures metadata (counts, credits, filter presence), not actual search terms or user input
        trackFeatureActionCompleted('contact_search', 'search', true, {
          results_count: result.contacts.length,
          credits_spent: creditsUsed,
          alumni_filter: !!(collegeAlumni || '').trim(),
        });

        // Log activity for contact search
        if (user?.uid && result.contacts.length > 0) {
          try {
            const summary = generateContactSearchSummary({
              jobTitle: jobTitle.trim(),
              company: company.trim() || undefined,
              location: location.trim(),
              college: collegeAlumni.trim() || undefined,
              contactCount: result.contacts.length,
            });
            await logActivity(user.uid, 'contactSearch', summary, {
              jobTitle: jobTitle.trim(),
              company: company.trim() || '',
              location: location.trim(),
              collegeAlumni: collegeAlumni.trim() || '',
              contactCount: result.contacts.length,
              tier: 'free',
            });
          } catch (error) {
            const isDev = import.meta.env.DEV;
            if (isDev) console.error('Failed to log contact search activity:', error);
          }
        }

        // ✅ TASK 3: Contacts are now saved automatically in backend (run_pro_tier_enhanced_final_with_text)
        // No need to call autoSaveToDirectory - this eliminates redundant duplicate checking
        // DEBUG: Log raw search result contacts
        console.log('[DEBUG] Raw search result contacts:', JSON.stringify(result.contacts.slice(0, 2), null, 2));

        // Contacts are automatically saved to Firestore in the backend, so we skip the frontend save
        toast({
          title: "Search Complete!",
          description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. ${newCredits} credits remaining.`,
          duration: 5000,
        });

        // OLD CODE (removed - contacts now saved in backend):
        // try {
        //   await autoSaveToDirectory(result.contacts, location.trim());
        // } catch (error) {
        //   console.error("Failed to save contacts:", error);
        // }
      } else if (userTier === "pro" || userTier === "elite") {
        // Get resume file (either uploaded or from saved resume)
        const resumeFile = await getResumeFile();

        const proRequest = {
          jobTitle: jobTitle.trim(),
          company: company.trim() || "",
          location: location.trim(),
          resume: resumeFile,
          saveToDirectory: false,
          userProfile,
          careerInterests: userProfile?.careerInterests || [],
          collegeAlumni: (collegeAlumni || '').trim(),
          batchSize: batchSize,
        };

        setProgressValue(40); // Progress update before API call
        const result = await apiService.runProSearch(proRequest);
        if (isErrorResponse(result)) {
          if (progressInterval) clearInterval(progressInterval);
          setIsSearching(false);
          setProgressValue(0);
          const errorType = result.error?.includes("Insufficient credits") ? "insufficient_credits" : "api_error";
          trackError('contact_search', 'search', errorType, result.error);
          if (result.error?.includes("Insufficient credits")) {
            toast({
              title: "Insufficient Credits",
              description: result.error,
              variant: "destructive",
            });
            if (checkCredits) await checkCredits();
            return;
          }
          toast({
            title: "Search Failed",
            description: result.error || "Please try again.",
            variant: "destructive",
          });
          return;
        }

        // Clear progress interval and update to 90% while processing results
        if (progressInterval) clearInterval(progressInterval);
        setProgressValue(90);

        const creditsUsed = result.contacts.length * 15;
        const newCredits = Math.max(0, currentCredits - creditsUsed);

        // Wait for credits to be updated before showing success screen
        if (updateCredits) {
          await updateCredits(newCredits);
        }

        setLastResults(result.contacts);

        // Delay showing success message until after:
        // 1. Credits are subtracted (already done above)
        // 2. Contacts are saved to Firestore (backend completes before response, but allow propagation time)
        // 3. All drafts are created and logged
        setTimeout(() => {
          setLastSearchStats({
            successful_drafts: result.successful_drafts,
            total_contacts: result.contacts.length,
          });
          // Show success screen only after credits are updated and contacts are saved
          setSearchComplete(true);
        }, 2000); // 2 second delay to ensure Firestore writes propagate and credits are fully updated

        setProgressValue(100);

        // Trigger Scout if 0 results
        if (result.contacts.length === 0) {
          triggerScoutForNoResults();
        }

        // Track PostHog event
        // Note: Only captures metadata (counts, credits, filter presence), not actual search terms or user input
        trackFeatureActionCompleted('contact_search', 'search', true, {
          results_count: result.contacts.length,
          credits_spent: creditsUsed,
          alumni_filter: !!(collegeAlumni || '').trim(),
        });

        // Log activity for contact search
        if (user?.uid && result.contacts.length > 0) {
          try {
            const summary = generateContactSearchSummary({
              jobTitle: jobTitle.trim(),
              company: company.trim() || undefined,
              location: location.trim(),
              college: collegeAlumni.trim() || undefined,
              contactCount: result.contacts.length,
            });
            await logActivity(user.uid, 'contactSearch', summary, {
              jobTitle: jobTitle.trim(),
              company: company.trim() || '',
              location: location.trim(),
              collegeAlumni: collegeAlumni.trim() || '',
              contactCount: result.contacts.length,
              tier: 'pro',
            });
          } catch (error) {
            const isDev = import.meta.env.DEV;
            if (isDev) console.error('Failed to log contact search activity:', error);
          }
        }

        // Check if we have fit context for targeted emails
        const hasFitContext = !!localStorage.getItem('scout_fit_context');
        let fitContextInfo = null;
        if (hasFitContext) {
          try {
            fitContextInfo = JSON.parse(localStorage.getItem('scout_fit_context') || '{}');
            setCurrentFitContext(fitContextInfo); // Store for UI display
          } catch (e) {
            // Ignore parse errors
          }
        }

        // ✅ FIX: Check if contacts already have emails generated by backend
        // The backend search endpoint already generates emails and creates drafts,
        // so we only need to call generateAndDraftEmailsBatch if emails are missing
        const contactsWithEmails = result.contacts.filter(
          (c: any) => (c.emailSubject || c.email_subject) && (c.emailBody || c.email_body)
        );
        const contactsWithoutEmails = result.contacts.filter(
          (c: any) => !(c.emailSubject || c.email_subject) || !(c.emailBody || c.email_body)
        );

        if (contactsWithoutEmails.length > 0) {
          // Only generate emails for contacts that don't have them
          console.log(`[ContactSearch] ${contactsWithEmails.length} contacts already have emails, generating for ${contactsWithoutEmails.length} remaining contacts`);
          try {
            await generateAndDraftEmailsBatch(contactsWithoutEmails);

            // Clear fit context after using it (one-time use)
            if (hasFitContext) {
              localStorage.removeItem('scout_fit_context');
              setCurrentFitContext(null); // Clear UI state
            }
          } catch (emailError: any) {
            if (emailError?.needsAuth || emailError?.require_reauth) {
              const authUrl = emailError.authUrl;
              if (authUrl) {
                window.location.href = authUrl;
                return;
              }
            }
          }
        } else {
          // All contacts already have emails - skip generation
          console.log(`[ContactSearch] All ${result.contacts.length} contacts already have emails, skipping generation`);
          
          // Clear fit context after using it (one-time use)
          if (hasFitContext) {
            localStorage.removeItem('scout_fit_context');
            setCurrentFitContext(null); // Clear UI state
          }
        }

        // DEBUG: Log raw search result contacts before saving
        console.log('[DEBUG] Raw search result contacts:', JSON.stringify(result.contacts.slice(0, 2), null, 2));

        // ✅ TASK 3: Contacts are now saved automatically in backend - no need to call autoSaveToDirectory
        // Show enhanced success message if fit context was used
        const emailDescription = hasFitContext && fitContextInfo?.job_title
          ? `Found ${result.contacts.length} contacts. Generated targeted emails for ${fitContextInfo.job_title}${fitContextInfo.company ? ` at ${fitContextInfo.company}` : ''} using your fit analysis. Used ${creditsUsed} credits. ${newCredits} credits remaining.`
          : `Found ${result.contacts.length} contacts. Generated general networking emails. Used ${creditsUsed} credits. ${newCredits} credits remaining.`;

        toast({
          title: hasFitContext && fitContextInfo?.job_title ? "🎯 Targeted Search Complete!" : "Search Complete!",
          description: emailDescription,
          duration: 7000,
        });

        // OLD CODE (removed - contacts now saved in backend):
        // try {
        //   await autoSaveToDirectory(result.contacts, location.trim());
        // } catch (error) {
        //   const isDev = import.meta.env.DEV;
        //   if (isDev) console.error('Failed to save contacts:', error);
        // }
      }
    } catch (error: any) {
      // Clear progress interval on error
      if (progressInterval) clearInterval(progressInterval);
      const isDev = import.meta.env.DEV;
      if (isDev) console.error("Search failed:", error);
      if (error?.needsAuth || error?.require_reauth) {
        const authUrl = error.authUrl;
        if (authUrl) {
          toast({
            title: "Gmail Connection Expired",
            description: error.message || "Please reconnect your Gmail account to create drafts.",
            variant: "destructive",
            duration: 5000,
          });
          // ✅ TASK 3: Contacts are now saved automatically in backend - no need to call autoSaveToDirectory
          // if (error.contacts && error.contacts.length > 0) {
          //   try {
          //     await autoSaveToDirectory(error.contacts, location.trim());
          //   } catch (saveError) {
          //     console.error("Failed to save contacts before redirect:", saveError);
          //   }
          // }
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

          <main className="w-full max-w-5xl mx-auto px-6 py-12 pb-24">
            {/* Header Section */}
            <div className="text-center mb-12 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-4">
                Find your next connection
              </h1>
              <p className="text-lg text-gray-500 leading-relaxed">
                Discover professionals who can open doors at your target companies.
                <br className="hidden md:block" />
                <span className="text-gray-400 text-base mt-2 block">
                  Reaching out to 10+ contacts triples your interview chances.
                </span>
              </p>
            </div>

            {/* Navigation Tabs */}
            <div className="flex justify-center mb-10">
              <div className="inline-flex items-center p-1 bg-white border border-gray-200 rounded-full shadow-sm">
                {[
                  { id: 'contact-search', label: 'Search', icon: Search },
                  { id: 'import', label: 'Import', icon: Upload },
                  { id: 'linkedin-email', label: 'LinkedIn', icon: Linkedin },
                  { id: 'contact-library', label: 'Tracker', icon: User },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300
                      ${activeTab === tab.id
                        ? 'bg-indigo-600 text-white shadow-md transform scale-[1.02]'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-white' : 'text-current'}`} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsContent value="contact-search" className="mt-0 focus-visible:outline-none">

                  {/* Search Card */}
                  <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">

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
                              <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center border border-gray-200 group-hover:border-indigo-300 group-hover:bg-indigo-50 transition-colors">
                                <Upload className="w-5 h-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">Upload Resume</p>
                                <p className="text-sm text-gray-500">For better matching</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Quick Start Chips */}
                        <div className="flex flex-wrap gap-2 justify-end">
                          {quickStartTemplates.map((template) => (
                            <button
                              key={template.id}
                              onClick={() => {
                                setJobTitle(template.jobTitle);
                                setCompany(template.company);
                                setLocation(template.location);
                                setCollegeAlumni(template.college);
                                setSelectedExampleId(template.id);
                                // Briefly highlight inputs
                                setTimeout(() => setSelectedExampleId(null), 150);
                              }}
                              disabled={isSearching}
                              className={`px-4 py-2 text-xs font-medium rounded-full border transition-all duration-150
                                ${selectedExampleId === template.id
                                  ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                                  : 'bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-700 border-gray-200 hover:border-blue-200 hover:shadow-sm'
                                }`}
                            >
                              {template.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Targeted Email Indicator */}
                      {currentFitContext && currentFitContext.job_title && (
                        <div className="mb-8 bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white border border-gray-200 rounded-lg">
                              <Sparkles className="w-4 h-4 text-indigo-600" />
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

                      {/* Main Form Fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8 mb-10">
                        {/* Job Title */}
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-gray-700 ml-1">Job Title <span className="text-red-400">*</span></label>
                          <div className="relative group">
                            <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                            <AutocompleteInput
                              value={jobTitle}
                              onChange={setJobTitle}
                              placeholder="e.g. Product Manager"
                              dataType="job_title"
                              disabled={isSearching}
                              className={`w-full pl-12 h-12 bg-white border rounded-xl text-gray-900 placeholder:text-gray-400 transition-all duration-150 shadow-sm shadow-gray-200/50
                                ${selectedExampleId !== null
                                  ? 'border-blue-300 bg-blue-50/30 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400'
                                  : 'border-gray-200 hover:border-gray-300 focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400'
                                }`}
                            />
                            {jobTitle && <CheckCircle className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500 animate-in zoom-in" />}
                          </div>
                          {!jobTitle && (
                            <p className="text-xs text-gray-400 ml-1">We'll match contacts with this role.</p>
                          )}
                        </div>

                        {/* Company */}
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-gray-700 ml-1">Company</label>
                          <div className="relative group">
                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                            <AutocompleteInput
                              value={company}
                              onChange={setCompany}
                              placeholder="e.g. Google, Microsoft"
                              dataType="company"
                              disabled={isSearching}
                              className="w-full pl-12 h-12 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 transition-all duration-150 shadow-sm shadow-gray-200/50"
                            />
                          </div>
                        </div>

                        {/* Location */}
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-gray-700 ml-1">Location <span className="text-red-400">*</span></label>
                          <div className="relative group">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                            <AutocompleteInput
                              value={location}
                              onChange={setLocation}
                              placeholder="e.g. New York, Remote"
                              dataType="location"
                              disabled={isSearching}
                              className={`w-full pl-12 h-12 bg-white border rounded-xl text-gray-900 placeholder:text-gray-400 transition-all duration-150 shadow-sm shadow-gray-200/50
                                ${selectedExampleId !== null
                                  ? 'border-blue-300 bg-blue-50/30 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400'
                                  : 'border-gray-200 hover:border-gray-300 focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400'
                                }`}
                            />
                            {location && <CheckCircle className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500 animate-in zoom-in" />}
                          </div>
                          {!location && (
                            <p className="text-xs text-gray-400 ml-1">Required to find local contacts.</p>
                          )}
                        </div>

                        {/* Alumni */}
                        <div className="space-y-2">
                          <label className="flex items-center justify-between text-sm font-semibold text-gray-700 ml-1">
                            <span>School Alumni</span>
                            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Optional</span>
                          </label>
                          <div className="relative group">
                            <GraduationCap className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                            <AutocompleteInput
                              value={collegeAlumni}
                              onChange={setCollegeAlumni}
                              placeholder="e.g. Stanford University"
                              dataType="school"
                              disabled={isSearching}
                              className="w-full pl-12 h-12 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 transition-all duration-150 shadow-sm shadow-gray-200/50"
                            />
                          </div>
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
                      <div className="flex flex-col items-center">
                        <Button
                          ref={originalButtonRef}
                          onClick={handleSearch}
                          disabled={isSearching}
                          className={`
                            h-14 px-12 rounded-full text-lg font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300
                            ${isSearching
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02]'
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


                      </div>

                    </div>
                  </div>
                </TabsContent>

                {/* Other Tabs content would go here, preserved as placeholders or real components if needed */}
                <TabsContent value="import" className="mt-6">
                  <ContactImport />
                </TabsContent>

                <TabsContent value="linkedin-email" className="mt-6">
                  <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden p-12 text-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <Linkedin className="w-8 h-8 text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Import from LinkedIn</h2>
                    <p className="text-gray-500 mb-8 max-w-md mx-auto">
                      Paste a LinkedIn profile URL to instantly import their details and generate a draft.
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
                            className="w-full h-12 pl-12 pr-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
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
                        <div className="mt-4 p-3 bg-green-50 text-green-700 text-sm rounded-lg flex items-center gap-2 justify-center animate-in fade-in slide-in-from-top-2">
                          <CheckCircle className="w-4 h-4" />
                          {linkedInSuccess}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="contact-library" className="mt-6">
                  <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden min-h-[600px]">
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
            disabled={isSearching || !jobTitle.trim() || !location.trim() || !user}
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

