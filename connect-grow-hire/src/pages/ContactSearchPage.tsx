import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BackToHomeButton } from "@/components/BackToHomeButton";
import { CreditPill } from "@/components/credits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useScout } from "@/contexts/ScoutContext";
import { Search, FileText, Upload as UploadIcon, Download } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
// ScoutBubble removed - now using ScoutHeaderButton in PageHeaderActions
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PageHeaderActions } from "@/components/PageHeaderActions";
import { db, storage, auth } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PromptSearchFlow } from "@/components/search/PromptSearchFlow";
import { trackFeatureActionCompleted, trackError } from "../lib/analytics";
import ContactImport from "@/components/ContactImport";

// Session storage key for Scout auto-populate
const SCOUT_AUTO_POPULATE_KEY = 'scout_auto_populate';

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
    tier: "free",
  } as const;

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
  
  // Search mode state (traditional vs prompt)
  const [searchMode, setSearchMode] = useState<'traditional' | 'prompt'>('traditional');

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
        return stripUndefined({
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

    if (file.type !== "application/pdf") {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a PDF smaller than 10MB.",
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

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a PDF smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      await saveResumeToAccountSettings(file);
    } catch (error) {
      // Error already handled in saveResumeToAccountSettings
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

      // For pro tier, check if we have a resume (either uploaded in this session or saved)
      if (userTier === "pro" && !uploadedFile && !savedResumeUrl) {
        if (progressInterval) clearInterval(progressInterval);
        setIsSearching(false);
        setProgressValue(0);
        toast({
          title: "Resume Required",
          description: "Pro tier requires a resume upload for similarity matching.",
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

      if (userTier === "free" || userTier === "elite") {
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
        setLastSearchStats({
          successful_drafts: result.successful_drafts ?? 0,
          total_contacts: result.contacts.length,
        });

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

        try {
          await autoSaveToDirectory(result.contacts, location.trim());
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. ${newCredits} credits remaining.`,
            duration: 5000,
          });
        } catch (error) {
          console.error("Failed to save contacts:", error);
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits.`,
            variant: "destructive",
            duration: 5000,
          });
        }
      } else if (userTier === "pro") {
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
        setLastSearchStats({
          successful_drafts: result.successful_drafts,
          total_contacts: result.contacts.length,
        });

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

        try {
          await autoSaveToDirectory(result.contacts, location.trim());
          
          // Show enhanced success message if fit context was used
          const emailDescription = hasFitContext && fitContextInfo?.job_title
            ? `Found ${result.contacts.length} contacts. Generated targeted emails for ${fitContextInfo.job_title}${fitContextInfo.company ? ` at ${fitContextInfo.company}` : ''} using your fit analysis. Used ${creditsUsed} credits. ${newCredits} credits remaining.`
            : `Found ${result.contacts.length} contacts. Generated general networking emails. Used ${creditsUsed} credits. ${newCredits} credits remaining.`;
          
          toast({
            title: hasFitContext && fitContextInfo?.job_title ? "🎯 Targeted Search Complete!" : "Search Complete!",
            description: emailDescription,
            duration: 7000,
          });
        } catch (error) {
          const isDev = import.meta.env.DEV;
          if (isDev) console.error('Failed to save contacts:', error);
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits.`,
            variant: "destructive",
            duration: 5000,
          });
        }
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
          if (error.contacts && error.contacts.length > 0) {
            try {
              await autoSaveToDirectory(error.contacts, location.trim());
            } catch (saveError) {
              console.error("Failed to save contacts before redirect:", saveError);
            }
          }
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
      <div className="flex min-h-screen w-full bg-transparent text-foreground">
        <AppSidebar />

        <div className="flex-1">
          <header className="h-16 flex items-center justify-between border-b border-gray-100/30 px-6 bg-transparent shadow-sm relative z-20">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-foreground hover:bg-secondary" />
              <h1 className="text-xl font-semibold">Contact Search</h1>
            </div>
            <PageHeaderActions onJobTitleSuggestion={handleJobTitleSuggestion} />
          </header>

          <main className="p-8 bg-transparent">
            <div className="max-w-5xl mx-auto">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex justify-center mb-8">
                  <TabsList className="h-14 tabs-container-gradient border border-border grid grid-cols-3 max-w-2xl w-full rounded-xl p-1 bg-white">
                    <TabsTrigger
                      value="contact-search"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <Search className="h-5 w-5 mr-2" />
                      Contact Search
                    </TabsTrigger>
                    <TabsTrigger
                      value="contact-library"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <FileText className="h-5 w-5 mr-2" />
                      Contact Library
                    </TabsTrigger>
                    <TabsTrigger
                      value="import"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <UploadIcon className="h-5 w-5 mr-2" />
                      Import
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="contact-search" className="mt-6">
                  {/* Prompt Search Toggle */}
                  <div className="mb-6 flex justify-center">
                    <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                      <button
                        onClick={() => setSearchMode('traditional')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          searchMode === 'traditional'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Traditional Search
                      </button>
                      <button
                        onClick={() => userTier === 'elite' ? setSearchMode('prompt') : null}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                          searchMode === 'prompt'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        } ${userTier !== 'elite' ? 'opacity-70 cursor-not-allowed' : ''}`}
                        title={userTier !== 'elite' ? 'Upgrade to Elite to unlock Prompt Search' : ''}
                      >
                        Prompt Search
                        {userTier !== 'elite' && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded">
                            ELITE
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Prompt Search Flow */}
                  {searchMode === 'prompt' && (
                    <div className="mb-6">
                      {userTier === 'elite' ? (
                        <PromptSearchFlow
                          onSearchComplete={(contacts, parsedQuery) => {
                            setLastResults(contacts);
                            setSearchComplete(true);
                            setProgressValue(100);
                            setIsSearching(false);
                            
                            // Trigger Scout if 0 results
                            if (contacts.length === 0 && parsedQuery) {
                              openPanelWithSearchHelp({
                                searchType: 'contact',
                                failedSearchParams: {
                                  job_title: parsedQuery.jobTitle || '',
                                  company: parsedQuery.company || '',
                                  location: parsedQuery.location || '',
                                },
                                errorType: 'no_results',
                              });
                            }
                            
                            // Pass the parsed location to autoSaveToDirectory
                            const searchLocation = parsedQuery?.location || '';
                            autoSaveToDirectory(contacts, searchLocation);
                            // Track PostHog event
                            // Note: Only captures metadata (counts, credits, filter presence), not actual search terms or user input
                            const creditsUsed = contacts.length * 15;
                            trackFeatureActionCompleted('contact_search', 'search', true, {
                              results_count: contacts.length,
                              credits_spent: creditsUsed,
                              alumni_filter: !!(parsedQuery?.school || '').trim(),
                            });
                          }}
                          onSearchStart={() => {
                            setIsSearching(true);
                            setSearchComplete(false);
                            setLastResults([]); // Clear previous results
                            setProgressValue(0);
                          }}
                          userTier={userTier}
                          userCredits={effectiveUser.credits ?? 0}
                        />
                      ) : (
                        <div className="p-8 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-indigo-500/5">
                          <div className="text-center space-y-4">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-indigo-500/20 mb-2">
                              <span className="text-3xl">✨</span>
                            </div>
                            <h3 className="text-xl font-semibold text-foreground">
                              Prompt Search is an Elite Feature
                            </h3>
                            <p className="text-muted-foreground max-w-md mx-auto">
                              Describe who you want to reach in natural language - our AI parses your prompt and finds the perfect contacts automatically.
                            </p>
                            <button
                              onClick={() => navigate('/pricing')}
                              className="mt-4 px-6 py-3 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium hover:from-purple-600 hover:to-indigo-600 transition-all"
                            >
                              Upgrade to Elite
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Traditional Search Form */}
                  {searchMode === 'traditional' && (
                    <>
                  {/* Fit Context Indicator - Shows when emails will be targeted */}
                  {currentFitContext && currentFitContext.job_title && (
                    <Card className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-blue-600 text-lg">🎯</span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-blue-900">
                                Targeted Email Generation Active
                              </p>
                              <p className="text-xs text-blue-700">
                                Emails will be tailored for <strong>{currentFitContext.job_title}</strong>
                                {currentFitContext.company ? ` at ${currentFitContext.company}` : ''}
                                {currentFitContext.score ? ` (${currentFitContext.score}% fit match)` : ''}
                              </p>
                              <p className="text-xs text-blue-600 mt-1">
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
                            className="bg-white border-blue-300 text-blue-700 hover:bg-blue-50"
                          >
                            Clear
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* Gmail Connection Status */}
                  <Card className="mb-6 bg-white border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${gmailConnected ? 'bg-blue-500' : 'bg-yellow-500'}`} />
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {gmailConnected ? 'Gmail Connected' : 'Gmail Not Connected'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {gmailConnected 
                                ? 'Email drafts will be created in your Gmail' 
                                : 'Connect Gmail to create email drafts automatically'}
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={() => initiateGmailOAuth()}
                          variant={gmailConnected ? "outline" : "default"}
                          size="sm"
                          className={gmailConnected 
                            ? "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50" 
                            : " text-white shadow-sm"}
                          style={!gmailConnected ? { background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' } : undefined}
                        >
                          {gmailConnected ? 'Reconnect' : 'Connect Gmail'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white border-border">
                    <CardHeader className="border-b border-border">
                      <CardTitle className="text-xl text-foreground">
                        Professional Search Filters<span className="text-sm text-muted-foreground">- I want to network with...</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium mb-2 text-foreground">
                            Job Title <span className="text-destructive">*</span>
                          </label>
                          <AutocompleteInput
                            value={jobTitle}
                            onChange={setJobTitle}
                            placeholder="e.g. Analyst, unsure of exact title in company? Ask Scout"
                            dataType="job_title"
                            disabled={isSearching}
                            className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-purple-500 hover:border-purple-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 text-foreground">Company</label>
                          <AutocompleteInput
                            value={company}
                            onChange={setCompany}
                            placeholder="e.g. Google, Meta, or any preferred firm"
                            dataType="company"
                            disabled={isSearching}
                            className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-purple-500 hover:border-purple-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 text-foreground">
                            Location <span className="text-destructive">*</span>
                          </label>
                          <AutocompleteInput
                            value={location}
                            onChange={setLocation}
                            placeholder="e.g. Los Angeles, CA, New York, NY, city of office"
                            dataType="location"
                            disabled={isSearching}
                            className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-purple-500 hover:border-purple-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 text-foreground">
                            College Alumni
                          </label>
                          <AutocompleteInput
                            value={collegeAlumni}
                            onChange={setCollegeAlumni}
                            placeholder="e.g. Stanford, USC, preferred college they attended"
                            dataType="school"
                            disabled={isSearching}
                            className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-purple-500 hover:border-purple-400 transition-colors"
                          />
                        </div>
                      </div>

                      <div className="col-span-1 lg:col-span-2 mt-4">
                        <div className="flex items-center gap-2 mb-4">
                          <label className="text-sm font-medium text-foreground">
                            Email Batch Size
                          </label>
                          <span className="text-sm text-muted-foreground">
                            - Choose how many contacts to generate per search
                          </span>
                        </div>

                        <div className="bg-muted/30 rounded-xl p-4 sm:p-6 border border-border shadow-lg">
                          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                            <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-400/40 rounded-xl px-4 py-3 min-w-[60px] sm:min-w-[70px] text-center shadow-inner">
                              <span className="text-2xl font-bold bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">
                                {batchSize}
                              </span>
                            </div>

                            <div className="flex-1 w-full sm:max-w-[320px] pt-2 sm:pt-4">
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
                                    [&::-webkit-slider-thumb]:shadow-[0_0_20px_rgba(59,130,246,0.6)] 
                                    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-400
                                    [&::-webkit-slider-thumb]:hover:shadow-[0_0_25px_rgba(59,130,246,0.8)] 
                                    [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-200
                                    [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 
                                    [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white
                                    [&::-moz-range-thumb]:shadow-[0_0_20px_rgba(59,130,246,0.6)] 
                                    [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-400"
                                  style={{
                                    background: `linear-gradient(to right, 
                                      rgba(59, 130, 246, 0.8) 0%, 
                                      rgba(96, 165, 250, 0.8) ${((batchSize - 1) / (maxBatchSize - 1)) * 100}%, 
                                      rgba(55, 65, 81, 0.3) ${((batchSize - 1) / (maxBatchSize - 1)) * 100}%, 
                                      rgba(55, 65, 81, 0.3) 100%)`
                                  }}
                                />

                                <div className="flex justify-between text-xs text-muted-foreground mt-3 font-medium">
                                  <span>1</span>
                                  <span>{maxBatchSize}</span>
                                </div>
                              </div>
                            </div>

                            <div className="bg-blue-50 rounded-xl px-4 py-3 min-w-[80px] sm:min-w-[100px] w-full sm:w-auto border border-blue-400/20">
                              <div className="text-center">
                                <span className="text-xl font-bold text-blue-600">{batchSize * 15}</span>
                                <span className="text-sm text-blue-600/70 ml-2">credits</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {maxBatchSize < (userTier === 'free' ? 3 : userTier === 'pro' ? 8 : 15) && (
                          <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                            <p className="text-xs text-yellow-700 flex items-start gap-2">
                              <span>Warning</span>
                              <span>Limited by available credits. Maximum: {maxBatchSize} contacts.</span>
                            </p>
                          </div>
                        )}
                      </div>

                      {(userTier === "free" || userTier === "pro" || userTier === "elite") && (
                        <div className="mb-6">
                          <label className="block text-sm font-medium mb-2 text-foreground">
                            Resume {userTier === "pro" && <span className="text-destructive">*</span>}
                            {userTier === "pro" && " (Required for Pro tier AI similarity matching)"}
                            {userTier !== "pro" && " (Optional - helps with personalized matching)"}
                          </label>
                          {savedResumeUrl && savedResumeFileName ? (
                            <div className="border-2 border-dashed border-green-500/50 rounded-lg p-4 bg-green-500/10">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <FileText className="h-5 w-5 text-green-600" />
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{savedResumeFileName}</p>
                                    <p className="text-xs text-muted-foreground">Resume saved to your account</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const input = document.getElementById('resume-upload') as HTMLInputElement;
                                      input?.click();
                                    }}
                                    disabled={isSearching || isUploadingResume}
                                  >
                                    {isUploadingResume ? "Uploading..." : "Change"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="border-2 border-dashed border-input rounded-lg p-6 text-center hover:border-purple-400 transition-colors bg-muted/30 cursor-pointer"
                              onDragOver={handleDragOver}
                              onDragEnter={handleDragEnter}
                              onDragLeave={handleDragLeave}
                              onDrop={handleDrop}
                              onClick={() => {
                                if (!isSearching && !isUploadingResume) {
                                  const input = document.getElementById('resume-upload') as HTMLInputElement;
                                  input?.click();
                                }
                              }}
                            >
                              <input
                                type="file"
                                accept=".pdf"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="resume-upload"
                                disabled={isSearching || isUploadingResume}
                              />
                              <div className={`${isSearching || isUploadingResume ? "opacity-50 cursor-not-allowed" : ""}`}>
                                <UploadIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                <p className="text-sm text-foreground mb-1 font-medium">
                                  {isUploadingResume 
                                    ? "Uploading resume..." 
                                    : "Drag and drop your resume here, or click to upload"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">PDF only, max 10MB</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-4 mt-8">
                        <Button
                          onClick={handleSearch}
                          disabled={
                            !jobTitle.trim() ||
                            !location.trim() ||
                            isSearching ||
                            (userTier === "pro" && !uploadedFile && !savedResumeUrl) ||
                            (effectiveUser.credits ?? 0) < 15
                          }
                          size="lg"
                          className=" text-white font-medium px-8 transition-all hover:scale-105 shadow-sm"
                          style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
                        >
                          {isSearching ? "Searching..." : "Find Contacts"}
                        </Button>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Download className="h-4 w-4" />
                            <span>Up to {currentTierConfig.maxContacts} contacts + emails</span>
                          </div>
                          <span className="text-muted-foreground">•</span>
                          <span>Auto-saved to Contact Library</span>
                        </div>
                      </div>

                      {(isSearching || searchComplete) && (
                        <Card className="mt-6 bg-white border-border">
                          <CardContent className="p-6">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-foreground">
                                  {searchComplete ? (
                                    <span className="text-green-600 font-semibold">
                                      Search completed successfully!
                                    </span>
                                  ) : (
                                    `Searching with ${currentTierConfig.name} tier...`
                                  )}
                                </span>
                                <span className={searchComplete ? "text-green-600 font-bold" : "text-primary"}>
                                  {progressValue}%
                                </span>
                              </div>
                              <Progress value={progressValue} className="h-2" />
                              {searchComplete && (
                                <div className="mt-2 text-sm text-green-600">
                                  Check your Contact Library to view and manage your new contacts.
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {isSearching && !hasResults && (
                        <Card className="mt-6 bg-white border-border">
                          <CardContent className="p-6">
                            <LoadingSkeleton variant="contacts" count={3} />
                          </CardContent>
                        </Card>
                      )}

                      {searchComplete && lastResults.length === 0 && (
                        <div className="mt-4 p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-2 border-yellow-500/50 rounded-lg">
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
                            {searchMode === 'prompt' && (
                              <p className="mt-3 text-xs text-yellow-600">
                                💡 Tip: Edit the filters in the confirmation screen to make them less specific
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {hasResults && lastSearchStats && (
                        <div className="mt-4 p-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 border-2 border-green-500/50 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-base font-semibold text-green-700">
                              Search Completed Successfully!
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-3">
                            <div className="bg-blue-50 rounded p-2 border border-blue-200/50">
                              <div className="text-2xl font-bold text-blue-600">{lastResults.length}</div>
                              <div className="text-xs text-blue-600/70">Contacts Found</div>
                            </div>
                            <div className="bg-blue-50 rounded p-2 border border-blue-200/50">
                              <div className="text-2xl font-bold text-blue-600">{lastResults.length}</div>
                              <div className="text-xs text-blue-600/70">Email Drafts</div>
                            </div>
                          </div>
                          <div className="text-sm text-blue-700 mt-3 flex items-center">
                            <span className="mr-2">Saved</span>
                            All contacts saved to your Contact Library
                          </div>
                          <button 
                            onClick={() => setActiveTab('contact-library')}
                            className="mt-3 text-sm text-blue-600 hover:text-blue-700 underline"
                          >
                            View in Contact Library
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="contact-library" className="mt-6">
                  <ContactDirectoryComponent />
                </TabsContent>

                <TabsContent value="import" className="mt-6">
                  <div className="bg-white border border-border rounded-xl p-6">
                    <ContactImport 
                      onImportComplete={() => {
                        // Switch to Contact Library tab and refresh
                        setActiveTab('contact-library');
                      }} 
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ContactSearchPage;

