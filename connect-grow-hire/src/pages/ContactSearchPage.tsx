import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { BackToHomeButton } from "@/components/BackToHomeButton";
import { CreditPill } from "@/components/credits";
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

// Session storage key for Scout auto-populate
const SCOUT_AUTO_POPULATE_KEY = 'scout_auto_populate';

// Quick start templates for common searches
const quickStartTemplates = [
  { id: 1, label: 'IB Analyst in NYC', jobTitle: 'Investment Banking Analyst', location: 'New York, NY', company: '', college: '' },
  { id: 2, label: 'PM at Google', jobTitle: 'Product Manager', company: 'Google', location: 'San Francisco, CA', college: '' },
  { id: 3, label: 'Consulting at McKinsey', jobTitle: 'Consultant', company: 'McKinsey', location: 'New York, NY', college: '' },
  { id: 4, label: 'SWE in Bay Area', jobTitle: 'Software Engineer', location: 'San Francisco, CA', company: '', college: '' },
];

// Helper function for slider encouragement messages
const getSliderMessage = (count: number): string => {
  if (count === 1) return "Perfect for testing a specific target";
  if (count <= 3) return "Great for focused outreach";
  if (count <= 7) return "Good for exploring a company";
  if (count <= 10) return "Solid networking foundation";
  return "Maximum reach — highly recommended!";
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
        if (updateCredits) await updateCredits(newCredits).catch(() => {});
        
        // Set progress to 100% when search completes
        setProgressValue(100);

        setLastResults(result.contacts);
        
        // Delay showing success message until after all drafts are created and logged
        // This ensures the success message appears after the backend finishes all draft creation
        setTimeout(() => {
          setLastSearchStats({
            successful_drafts: result.successful_drafts ?? 0,
            total_contacts: result.contacts.length,
          });
        }, 3000); // 3 second delay to allow backend to complete all draft creation and Firestore updates

        setProgressValue(100);
        setSearchComplete(true);

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
        if (updateCredits) await updateCredits(newCredits);

        setLastResults(result.contacts);
        
        // Delay showing success message until after all drafts are created and logged
        // This ensures the success message appears after the backend finishes all draft creation
        setTimeout(() => {
          setLastSearchStats({
            successful_drafts: result.successful_drafts,
            total_contacts: result.contacts.length,
          });
        }, 3000); // 3 second delay to allow backend to complete all draft creation and Firestore updates

        setProgressValue(100);
        setSearchComplete(true);

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
        
        try {
          await generateAndDraftEmailsBatch(result.contacts);
          
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
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader 
            title="" 
            onJobTitleSuggestion={handleJobTitleSuggestion}
          />

          <main className="bg-gradient-to-b from-slate-50 via-white to-white min-h-screen contact-search-page">
            {/* Page Header Container */}
            <div className="max-w-4xl mx-auto px-6 pt-10 pb-4 contact-search-container">
              
              {/* Inspiring Header Section */}
              <div className="text-center mb-8 animate-fadeInUp contact-search-header">
                <h1 className="text-3xl font-bold text-gray-900 mb-2 contact-search-title">
                  Find Your Next Connection
                </h1>
                <p className="text-gray-600 text-lg mb-3 contact-search-subtitle">
                  Discover professionals who can open doors at your target companies.
                </p>
                <p className="text-sm text-gray-500 contact-search-subtitle-small">
                  Users who reach out to 10+ contacts are 3x more likely to land interviews
                </p>
              </div>

              {/* Pill-style Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit mx-auto mb-8 animate-fadeInUp contact-search-tabs" style={{ animationDelay: '100ms' }}>
                  {[
                    { id: 'contact-search', label: 'Find People', icon: Search },
                    { id: 'import', label: 'Spreadsheet', icon: Upload },
                    { id: 'linkedin-email', label: 'LinkedIn', icon: Linkedin },
                    { id: 'contact-library', label: 'Tracker', icon: User },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                        ${activeTab === tab.id 
                          ? 'bg-white text-blue-600 shadow-sm' 
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }
                      `}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Content area with proper spacing from divider */}
                <div className="pb-8">
                  <TabsContent value="contact-search" className="mt-0">
                  {/* Fit Context Indicator - Shows when emails will be targeted */}
                  {currentFitContext && currentFitContext.job_title && (
                    <div className="mb-6 p-4 border border-blue-200 rounded-lg bg-blue-50/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-blue-600 text-lg">🎯</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-blue-700">
                              Targeted Email Generation Active
                            </p>
                            <p className="text-xs text-gray-600">
                              Emails will be tailored for <strong className="text-gray-900">{currentFitContext.job_title}</strong>
                              {currentFitContext.company ? ` at ${currentFitContext.company}` : ''}
                              {currentFitContext.score ? ` (${currentFitContext.score}% fit match)` : ''}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Includes your strengths, talking points, and role-specific insights
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={() => {
                            localStorage.removeItem('scout_fit_context');
                            setCurrentFitContext(null);
                            toast({
                              title: "Fit context cleared",
                              description: "Emails will now use general networking format",
                            });
                          }}
                          variant="outline"
                          size="sm"
                          className="border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Hidden file input for resume upload */}
                  <input
                    type="file"
                    accept={ACCEPTED_RESUME_TYPES.accept}
                    onChange={handleFileUpload}
                    className="hidden"
                    id="resume-upload"
                    disabled={isSearching || isUploadingResume}
                  />

                  {/* Quick Start Templates */}
                  <div className="mb-6 animate-fadeInUp contact-search-quick-start" style={{ animationDelay: '200ms' }}>
                    <p className="text-sm text-gray-500 mb-3 text-center">Quick Start — Popular Searches</p>
                    <div className="flex flex-wrap justify-center gap-2 contact-search-quick-chips">
                      {quickStartTemplates.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => {
                            setJobTitle(template.jobTitle);
                            setCompany(template.company);
                            setLocation(template.location);
                            setCollegeAlumni(template.college);
                          }}
                          disabled={isSearching}
                          className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 
                                     hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 
                                     transition-all duration-200 shadow-sm hover:shadow disabled:opacity-50"
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Elevated Resume Section */}
                  <div className="mb-6 animate-fadeInUp contact-search-resume-card" style={{ animationDelay: '300ms' }}>
                    {savedResumeUrl && savedResumeFileName ? (
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between contact-search-resume-connected">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center">
                            <FileText className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900">Resume Connected</p>
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Improving matches
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">{savedResumeFileName}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => document.getElementById('resume-upload')?.click()}
                          disabled={isSearching || isUploadingResume}
                          className="text-blue-600 text-sm font-medium hover:text-blue-800 hover:underline transition-colors disabled:opacity-50"
                        >
                          {isUploadingResume ? "Uploading..." : "Change"}
                        </button>
                      </div>
                    ) : (
                      <div 
                        onClick={() => !isSearching && !isUploadingResume && document.getElementById('resume-upload')?.click()}
                        className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer"
                      >
                        <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mx-auto mb-3">
                          <Upload className="w-6 h-6 text-gray-400" />
                        </div>
                        <p className="font-medium text-gray-700 mb-1">
                          {isUploadingResume ? "Uploading..." : "Upload your resume"}
                        </p>
                        <p className="text-sm text-gray-500">Improves match quality and email personalization</p>
                      </div>
                    )}
                  </div>

                  {/* Main Search Card */}
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-fadeInUp contact-search-form-card" style={{ animationDelay: '400ms' }}>
                    {/* Gradient accent at top */}
                    <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600"></div>
                    
                    <div className="p-8 contact-search-form-content">
                      {/* Search Filters Section */}
                      <div className="mb-6 contact-search-form-section">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6 contact-search-form-title">
                          Who are you trying to find?
                        </h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 contact-search-form-grid">
                          {/* Job Title - with icon */}
                          <div className="md:col-span-1">
                            <label className="block text-sm font-medium mb-2 text-gray-700">
                              Job Title <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Briefcase className="h-5 w-5 text-gray-400" />
                              </div>
                              <AutocompleteInput
                                value={jobTitle}
                                onChange={setJobTitle}
                                placeholder="e.g. Analyst, Associate, PM"
                                dataType="job_title"
                                disabled={isSearching}
                                className="pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors rounded-xl"
                              />
                              {jobTitle && (
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                  <CheckCircle className="h-5 w-5 text-green-500" />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Company - with icon */}
                          <div>
                            <label className="block text-sm font-medium mb-2 text-gray-700">Company</label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Building2 className="h-5 w-5 text-gray-400" />
                              </div>
                              <AutocompleteInput
                                value={company}
                                onChange={setCompany}
                                placeholder="e.g. Google, Goldman Sachs"
                                dataType="company"
                                disabled={isSearching}
                                className="pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors rounded-xl"
                              />
                            </div>
                          </div>

                          {/* Location - with icon */}
                          <div>
                            <label className="block text-sm font-medium mb-2 text-gray-700">
                              Location <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <MapPin className="h-5 w-5 text-gray-400" />
                              </div>
                              <AutocompleteInput
                                value={location}
                                onChange={setLocation}
                                placeholder="e.g. Los Angeles, CA"
                                dataType="location"
                                disabled={isSearching}
                                className="pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors rounded-xl"
                              />
                              {location && (
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                  <CheckCircle className="h-5 w-5 text-green-500" />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* College Alumni - with icon */}
                          <div>
                            <label className="block text-sm font-medium mb-2 text-gray-500">
                              College Alumni
                              <span className="ml-2 text-xs text-gray-400 font-normal">Optional</span>
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <GraduationCap className="h-5 w-5 text-gray-400" />
                              </div>
                              <AutocompleteInput
                                value={collegeAlumni}
                                onChange={setCollegeAlumni}
                                placeholder="e.g. Stanford, USC"
                                dataType="school"
                                disabled={isSearching}
                                className="pl-10 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white hover:border-gray-300 transition-all rounded-xl"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Excitement-Building Slider Section */}
                      <div className="mt-8 pt-8 border-t border-gray-100 contact-search-slider-section">
                        <h2 className="text-xl font-semibold text-gray-900 mb-2 contact-search-slider-title">
                          How many connections do you want to discover?
                        </h2>
                        <p className="text-gray-600 mb-6">
                          We create an{' '}
                          <a 
                            href="https://mail.google.com/mail/u/0/#drafts" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium"
                          >
                            email draft
                          </a>
                          {' '}for each person and save them to your{' '}
                          <button
                            type="button"
                            onClick={() => setActiveTab('contact-library')}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            Networking Tracker
                          </button>
                          .
                        </p>

                        <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-6">
                          {/* Slider Row */}
                          <div className="flex items-center gap-4 mb-4">
                            {/* Current value */}
                            <div className="w-16 h-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center font-semibold text-gray-900">
                              {batchSize}
                            </div>

                            {/* Slider */}
                            <div className="flex-1 relative">
                              <input
                                type="range"
                                min="1"
                                max={maxBatchSize}
                                value={batchSize}
                                onChange={(e) => setBatchSize(Number(e.target.value))}
                                disabled={isSearching || maxBatchSize < 1}
                                className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed 
                                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
                                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600
                                  [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
                                  [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
                                  [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 
                                  [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600
                                  [&::-moz-range-thumb]:border-0"
                                style={{
                                  background: `linear-gradient(to right, 
                                    rgb(59, 130, 246) 0%, 
                                    rgb(59, 130, 246) ${((batchSize - 1) / Math.max(maxBatchSize - 1, 1)) * 100}%, 
                                    rgb(229, 231, 235) ${((batchSize - 1) / Math.max(maxBatchSize - 1, 1)) * 100}%, 
                                    rgb(229, 231, 235) 100%)`
                                }}
                              />
                            </div>

                            {/* Max value */}
                            <div className="w-16 h-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center font-semibold text-gray-400">
                              {maxBatchSize}
                            </div>
                          </div>

                          {/* Dynamic feedback */}
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">🎯</span>
                              <span className="text-gray-900">
                                Finding <span className="font-bold text-blue-600">{batchSize}</span> {batchSize === 1 ? 'person' : 'people'}
                              </span>
                              <span className="text-gray-400">•</span>
                              <span className="text-gray-600">{batchSize * 15} credits</span>
                            </div>
                            
                            {/* Dynamic encouragement message */}
                            <p className="text-sm text-gray-500 italic">
                              {getSliderMessage(batchSize)}
                            </p>
                          </div>

                          {/* Visual people indicators */}
                          <div className="flex items-center gap-1 mt-4 contact-search-person-icons">
                            {[...Array(maxBatchSize)].map((_, i) => (
                              <div
                                key={i}
                                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200
                                  ${i < batchSize 
                                    ? 'bg-blue-500 text-white scale-100' 
                                    : 'bg-gray-200 text-gray-400 scale-90'
                                  }`}
                              >
                                <User className="w-3 h-3" />
                              </div>
                            ))}
                          </div>

                          {maxBatchSize < (userTier === 'free' ? 3 : userTier === 'pro' ? 8 : 15) && (
                            <p className="text-xs text-yellow-600 mt-3">
                              Limited by available credits. Maximum: {maxBatchSize} contacts.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Enhanced CTA Button */}
                      <div className="mt-8 contact-search-cta">
                        <button
                          onClick={handleSearch}
                          disabled={
                            !jobTitle.trim() ||
                            !location.trim() ||
                            isSearching ||
                            ((userTier === "pro" || userTier === "elite") && !uploadedFile && !savedResumeUrl) ||
                            (effectiveUser.credits ?? 0) < 15
                          }
                          className={`
                            w-full md:w-auto px-8 py-4 rounded-full font-semibold text-lg
                            flex items-center justify-center gap-3 mx-auto
                            transition-all duration-200 transform contact-search-discover-btn
                            ${(!jobTitle.trim() || !location.trim() || isSearching || (effectiveUser.credits ?? 0) < 15)
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 active:scale-100'
                            }
                          `}
                        >
                          {isSearching ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Searching...
                            </>
                          ) : (
                            <>
                              Discover Contacts
                              <ArrowRight className="w-5 h-5" />
                            </>
                          )}
                        </button>
                      </div>

                      {/* Value Proposition Below CTA */}
                      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500 contact-search-benefits">
                        <span className="flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-green-500" />
                          Verified work emails
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-green-500" />
                          AI-personalized drafts
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-green-500" />
                          Auto-saved to Tracker
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-green-500" />
                          Up to {currentTierConfig.maxContacts} contacts
                        </span>
                      </div>

                      {(isSearching || searchComplete) && (
                      <div className="mt-6">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">
                              {searchComplete ? (
                                <span className="text-green-600 font-semibold">
                                  Search completed successfully!
                                </span>
                              ) : (
                                `Searching with ${currentTierConfig.name} tier...`
                              )}
                            </span>
                            <span className={searchComplete ? "text-green-600 font-bold" : "text-blue-600"}>
                              {progressValue}%
                            </span>
                          </div>
                          <Progress value={progressValue} className="h-2" />
                          {searchComplete && (
                            <div className="mt-2 text-sm text-green-600">
                              Check your Networking Tracker to view and manage your new contacts.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isSearching && !hasResults && (
                      <div className="mt-6">
                        <LoadingSkeleton variant="contacts" count={3} />
                      </div>
                    )}

                    {searchComplete && lastResults.length === 0 && (
                      <div className="mt-6 p-4 border border-yellow-300 rounded-lg bg-yellow-50/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-base font-semibold text-yellow-700">
                            No Contacts Found
                          </div>
                        </div>
                        <div className="text-sm text-yellow-700 mt-2">
                          <p className="mb-2">The search criteria may be too restrictive. Try:</p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>Using a broader job title (e.g., "analyst" instead of "investment banking analyst")</li>
                            <li>Removing the company filter</li>
                            <li>Using a broader location (e.g., just the state instead of city)</li>
                            <li>Removing the school filter if searching for alumni</li>
                          </ul>
                        </div>
                      </div>
                    )}

                    {hasResults && lastSearchStats && (
                      <div className="mt-6 p-4 border border-green-300 rounded-lg bg-green-50/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-base font-semibold text-green-700">
                            Search Completed Successfully!
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-3">
                          <div className="p-2">
                            <div className="text-2xl font-bold text-blue-600">{lastResults.length}</div>
                            <div className="text-xs text-gray-500">Contacts Found</div>
                          </div>
                          <div className="p-2">
                            <div className="text-2xl font-bold text-blue-600">{lastResults.length}</div>
                            <div className="text-xs text-gray-500">Email Drafts</div>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 mt-3 flex items-center">
                          <span className="mr-2">✓</span>
                          All contacts saved to your Networking Tracker
                        </div>
                        <button 
                          onClick={() => setActiveTab('contact-library')}
                          className="mt-3 text-sm text-blue-600 hover:text-blue-700 underline"
                        >
                          View in Networking Tracker
                        </button>
                      </div>
                    )}
                    </div>
                  </div>
                </TabsContent>
                  
                  <TabsContent value="contact-library" className="mt-0">
                    <ContactDirectoryComponent />
                  </TabsContent>

                  <TabsContent value="import" className="mt-0">
                    <ContactImport 
                      onImportComplete={() => {
                        // Switch to Networking Tracker tab and refresh
                        setActiveTab('contact-library');
                      }}
                      onSwitchTab={(tab) => setActiveTab(tab)}
                    />
                  </TabsContent>

                  <TabsContent value="linkedin-email" className="mt-0">
                    {/* Main LinkedIn Card */}
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                      {/* Gradient accent at top */}
                      <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600"></div>
                      
                      <div className="p-8">
                        {/* Card Header with Icon */}
                        <div className="text-center mb-8">
                          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Linkedin className="w-7 h-7 text-blue-700" />
                          </div>
                          <h2 className="text-xl font-semibold text-gray-900 mb-2">LinkedIn Lookup</h2>
                          <p className="text-gray-600 max-w-lg mx-auto">
                            Paste a LinkedIn profile URL to automatically find their email, generate a personalized message, and create a Gmail draft.
                          </p>
                        </div>

                        {/* Enhanced URL Input with Integrated Button */}
                        <div className="max-w-2xl mx-auto">
                          <div className="relative flex items-center">
                            {/* LinkedIn icon inside input */}
                            <div className="absolute left-4 pointer-events-none">
                              <Linkedin className="w-5 h-5 text-gray-400" />
                            </div>
                            
                            <input
                              type="url"
                              value={linkedInUrl}
                              onChange={(e) => setLinkedInUrl(e.target.value)}
                              placeholder="https://www.linkedin.com/in/username"
                              className="w-full pl-12 pr-44 py-4 text-lg border-2 border-gray-200 rounded-full
                                         text-gray-900 placeholder-gray-400
                                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                         hover:border-gray-300 transition-all"
                            />
                            
                            {/* Button inside input */}
                            <button
                              onClick={handleLinkedInImport}
                              disabled={!linkedInUrl.trim() || linkedInLoading}
                              className={`
                                absolute right-2 px-6 py-2.5 rounded-full font-semibold text-sm
                                flex items-center gap-2 transition-all duration-200
                                ${linkedInUrl.trim() && !linkedInLoading
                                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md hover:shadow-lg hover:scale-105'
                                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                }
                              `}
                            >
                              {linkedInLoading ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <Send className="w-4 h-4" />
                                  Import & Draft
                                </>
                              )}
                            </button>
                          </div>
                          
                          {/* Validation Feedback */}
                          {linkedInUrl && !linkedInUrl.match(/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/) && linkedInUrl.length > 10 && (
                            <p className="text-center text-sm text-amber-600 mt-3 flex items-center justify-center gap-1">
                              <AlertCircle className="w-4 h-4" />
                              Please enter a valid LinkedIn profile URL (e.g., linkedin.com/in/username)
                            </p>
                          )}
                          
                          {linkedInUrl && linkedInUrl.match(/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/) && (
                            <p className="text-center text-sm text-green-600 mt-3 flex items-center justify-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              Valid LinkedIn URL — ready to import
                            </p>
                          )}
                          
                          {/* Helper text below input */}
                          {!linkedInUrl && (
                            <p className="text-center text-sm text-gray-500 mt-4">
                              Uses <span className="font-medium">1 credit</span> per import • Email draft will be saved to your Gmail Drafts
                            </p>
                          )}
                        </div>

                        {/* Error State */}
                        {linkedInError && (
                          <div className="mt-6 max-w-2xl mx-auto flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                            <AlertCircle className="h-5 w-5 flex-shrink-0" />
                            <p>{linkedInError}</p>
                          </div>
                        )}

                        {/* Success State */}
                        {linkedInSuccess && (
                          <div className="mt-6 max-w-2xl mx-auto flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">
                            <CheckCircle className="h-5 w-5 flex-shrink-0" />
                            <p>{linkedInSuccess}</p>
                          </div>
                        )}

                        {/* What You'll Get Section */}
                        <div className="mt-10 pt-8 border-t border-gray-100">
                          <h3 className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wide mb-6">What you'll get</h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto">
                            <div className="text-center">
                              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                                <Mail className="w-6 h-6 text-green-600" />
                              </div>
                              <p className="font-medium text-gray-900 text-sm">Verified Email</p>
                              <p className="text-xs text-gray-500 mt-1">Professional work email</p>
                            </div>
                            
                            <div className="text-center">
                              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                                <Sparkles className="w-6 h-6 text-purple-600" />
                              </div>
                              <p className="font-medium text-gray-900 text-sm">AI-Personalized Draft</p>
                              <p className="text-xs text-gray-500 mt-1">Based on their profile</p>
                            </div>
                            
                            <div className="text-center">
                              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                                <Inbox className="w-6 h-6 text-blue-600" />
                              </div>
                              <p className="font-medium text-gray-900 text-sm">Gmail Draft Created</p>
                              <p className="text-xs text-gray-500 mt-1">Ready to review & send</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Tips Section */}
                    <div className="mt-8 text-center animate-fadeInUp" style={{ animationDelay: '300ms' }}>
                      <p className="text-sm text-gray-500 mb-3">Want to find people a different way?</p>
                      <div className="flex flex-wrap justify-center gap-3">
                        <button 
                          onClick={() => setActiveTab('contact-search')}
                          className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 
                                     hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 
                                     transition-all duration-200 shadow-sm hover:shadow flex items-center gap-2"
                        >
                          <Search className="w-4 h-4" />
                          Search by criteria
                        </button>
                        <button 
                          onClick={() => setActiveTab('import')}
                          className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 
                                     hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 
                                     transition-all duration-200 shadow-sm hover:shadow flex items-center gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          Upload spreadsheet
                        </button>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </main>
        </MainContentWrapper>
      </div>

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* 1. PAGE CONTAINER - Prevent horizontal overflow */
          .contact-search-page {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .contact-search-container {
            max-width: 100%;
            padding-left: 16px;
            padding-right: 16px;
            box-sizing: border-box;
          }

          /* 2. HEADER TEXT - Reduce font size, ensure wrapping */
          .contact-search-title {
            font-size: 1.75rem !important;
            line-height: 1.3;
            word-wrap: break-word;
            overflow-wrap: break-word;
            padding-left: 0;
            padding-right: 0;
          }

          /* 3. SUBTITLE TEXT - Reduce font size */
          .contact-search-subtitle {
            font-size: 0.9rem !important;
            line-height: 1.4;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          .contact-search-subtitle-small {
            font-size: 0.8rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 4. TAB BAR - Horizontal scroll or stack */
          .contact-search-tabs {
            width: 100% !important;
            max-width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE and Edge */
            padding: 8px !important;
            justify-content: flex-start;
          }

          .contact-search-tabs::-webkit-scrollbar {
            display: none; /* Chrome, Safari, Opera */
          }

          .contact-search-tabs button {
            min-width: fit-content;
            min-height: 44px;
            flex-shrink: 0;
            white-space: nowrap;
          }

          /* 5. QUICK START CHIPS - Allow horizontal scroll or wrap */
          .contact-search-quick-start {
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
          }

          .contact-search-quick-chips {
            flex-wrap: wrap !important;
            justify-content: center;
            gap: 8px;
            max-width: 100%;
          }

          .contact-search-quick-chips button {
            flex-shrink: 0;
            max-width: 100%;
            word-wrap: break-word;
            white-space: normal;
            padding: 8px 12px;
            font-size: 0.875rem;
          }

          /* 6. RESUME CONNECTED CARD - Full width, proper padding */
          .contact-search-resume-card {
            width: 100%;
            max-width: 100%;
          }

          .contact-search-resume-connected {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            padding: 16px !important;
          }

          .contact-search-resume-connected > div:first-child {
            width: 100%;
          }

          .contact-search-resume-connected button {
            width: 100%;
            text-align: center;
            min-height: 44px;
          }

          /* 7. FORM SECTION - Full width, proper padding */
          .contact-search-form-card {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .contact-search-form-content {
            padding: 16px !important;
            box-sizing: border-box;
          }

          .contact-search-form-title {
            font-size: 1.125rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            margin-bottom: 16px !important;
          }

          .contact-search-form-grid {
            width: 100%;
            gap: 16px;
          }

          .contact-search-form-grid > div {
            width: 100%;
            max-width: 100%;
          }

          .contact-search-form-grid input,
          .contact-search-form-grid .relative {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          /* 8. SLIDER SECTION - Full width */
          .contact-search-slider-section {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .contact-search-slider-title {
            font-size: 1.125rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.4;
          }

          .contact-search-slider-section p {
            font-size: 0.875rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          .contact-search-slider-section > div {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            padding: 16px !important;
          }

          .contact-search-slider-section input[type="range"] {
            width: 100%;
            max-width: 100%;
          }

          /* 9. BENEFITS LIST - Stack vertically */
          .contact-search-benefits {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
            text-align: left;
          }

          .contact-search-benefits span {
            width: 100%;
            justify-content: flex-start;
          }

          /* 10. DISCOVER CONTACTS BUTTON - Full width */
          .contact-search-cta {
            width: 100%;
            max-width: 100%;
          }

          .contact-search-discover-btn {
            width: 100% !important;
            min-height: 48px !important;
            max-width: 100%;
            box-sizing: border-box;
          }

          /* 11. PERSON ICONS ROW - Horizontal scroll or reduce */
          .contact-search-person-icons {
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            max-width: 100%;
            flex-wrap: nowrap;
            padding-bottom: 4px;
          }

          .contact-search-person-icons::-webkit-scrollbar {
            display: none;
          }

          .contact-search-person-icons > div {
            min-width: 32px;
            min-height: 32px;
            flex-shrink: 0;
          }

          /* GENERAL - Ensure all containers respect max-width */
          .contact-search-page * {
            max-width: 100%;
            box-sizing: border-box;
          }

          .contact-search-page input,
          .contact-search-page textarea,
          .contact-search-page select,
          .contact-search-page button {
            max-width: 100%;
            box-sizing: border-box;
          }

          /* Prevent text overflow */
          .contact-search-page p,
          .contact-search-page h1,
          .contact-search-page h2,
          .contact-search-page h3,
          .contact-search-page span,
          .contact-search-page label {
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
          }

          /* Additional overflow fixes */
          html, body {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .contact-search-page {
            overflow-x: hidden;
          }

          .contact-search-header {
            padding-left: 16px;
            padding-right: 16px;
          }
        }
      `}</style>
    </SidebarProvider>
  );
};

export default ContactSearchPage;

