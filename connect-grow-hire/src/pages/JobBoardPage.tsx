import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Briefcase,
  MapPin,
  Building2,
  Clock,
  DollarSign,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  FileText,
  Download,
  Copy,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  FileCheck,
  AlertTriangle,
  Users,
  Linkedin,
  Mail,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { apiService, type GenerateCoverLetterRequest, type Recruiter, type SuggestionsResult, type TemplateRebuildResult } from "@/services/api";
import { ResumeOptimizationModal } from '@/components/ResumeOptimizationModal';
import { SuggestionsView } from '@/components/SuggestionsView';
import { firebaseApi, type Recruiter as FirebaseRecruiter } from "../services/firebaseApi";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { cn } from "@/lib/utils";
import { InlineLoadingBar } from "@/components/ui/LoadingBar";
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ResumeRenderer from "@/components/ResumeRenderer";
import ResumeActions from "@/components/ResumeActions";
import RecruiterSpreadsheet from "@/components/RecruiterSpreadsheet";
import "@/components/ResumeRenderer.css";
import { downloadCoverLetterAsPDF } from "@/utils/pdfGenerator";

// ============================================================================
// TYPES
// ============================================================================

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  type: "Internship" | "Full-Time" | "Part-Time" | "Contract";
  posted: string;
  description: string;
  requirements: string[];
  url: string;
  logo?: string;
  remote?: boolean;
  experienceLevel?: string;
  via?: string;
  matchScore?: number;
  qualityScore?: number;
  combinedScore?: number;
}

interface UserPreferences {
  jobTypes: string[];
  industries: string[];
  locations: string[];
}

interface ATSScore {
  overall: number;
  keywords: number;
  formatting: number;
  relevance: number;
  suggestions: string[];
  jdQualityWarning?: string;
  technicalKeywordsInJd?: number;
}

interface OptimizedResume {
  content?: string;
  atsScore: ATSScore;
  keywordsAdded: string[];
  sectionsOptimized: string[];
  // JSON format fields (new format)
  name?: string;
  contact?: any;
  Summary?: string;
  Experience?: any[];
  Education?: any;
  Skills?: any;
  Projects?: any[];
  Extracurriculars?: any[];
}

interface CoverLetter {
  content: string;
  highlights: string[];
  tone: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const JOBS_PER_PAGE = 12;
const OPTIMIZATION_CREDIT_COST = 20;
const COVER_LETTER_CREDIT_COST = 15;

const JOB_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "Internship", label: "Internship" },
  { value: "Full-Time", label: "Full-Time" },
  { value: "Part-Time", label: "Part-Time" },
  { value: "Contract", label: "Contract" },
];

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

const MatchScoreBadge: React.FC<{ score?: number }> = ({ score }) => {
  if (!score && score !== 0) return null;
  
  let color = "bg-gray-100 text-gray-600";
  let label = "Match";
  
  if (score >= 80) {
    color = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    label = "Great Match";
  } else if (score >= 60) {
    color = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    label = "Good Match";
  } else if (score >= 40) {
    color = "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    label = "Fair Match";
  }
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${color}`}>
      {label} • {Math.round(score)}%
    </span>
  );
};

const JobCard: React.FC<{
  job: Job;
  isSelected: boolean;
  isSaved: boolean;
  onSelect: () => void;
  onSave: () => void;
  onApply: () => void;
  onOptimize: () => void;
}> = ({ job, isSelected, isSaved, onSelect, onSave, onApply, onOptimize }) => (
  <GlassCard
    className={cn(
      "p-5 cursor-pointer transition-all duration-300 hover:scale-[1.02]",
      isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
    )}
    glow={isSelected}
  >
    <div className="flex items-start justify-between gap-4">
      <div className="flex-shrink-0">
        {job.logo ? (
          <img
            src={job.logo}
            alt={job.company}
            className="w-12 h-12 rounded-lg object-cover bg-muted"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{job.title}</h3>
            <p className="text-sm text-muted-foreground">{job.company}</p>
            {job.matchScore !== undefined && (
              <div className="mt-2">
                <MatchScoreBadge score={job.matchScore} />
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onSave(); }}
            className="flex-shrink-0 p-1.5 rounded-full hover:bg-muted/50 transition-colors"
          >
            {isSaved ? (
              <BookmarkCheck className="w-5 h-5 text-primary" />
            ) : (
              <Bookmark className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="secondary" className="text-xs">
            <MapPin className="w-3 h-3 mr-1" />
            {job.location}
          </Badge>
          <Badge variant={job.type === "Internship" ? "default" : "outline"} className="text-xs">
            {job.type}
          </Badge>
          {job.remote && (
            <Badge variant="outline" className="text-xs text-green-600">Remote</Badge>
          )}
          {job.salary && (
            <Badge variant="outline" className="text-xs">
              <DollarSign className="w-3 h-3 mr-1" />
              {job.salary}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {job.posted}
          </span>
          {job.via && <span>{job.via}</span>}
        </div>
      </div>
    </div>

    <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
      {/* First row: Find Recruiters and Apply */}
      <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        <Users className="w-4 h-4 mr-2" />
        Find Recruiters
      </Button>
      <Button
        variant="gradient"
        size="sm"
        className="flex-1"
        onClick={(e) => { e.stopPropagation(); onApply(); }}
      >
        <ExternalLink className="w-4 h-4 mr-2" />
        Apply
        </Button>
      </div>
      
      {/* Second row: Optimize CV & Resume */}
      <Button
        variant="outline"
        size="sm"
        className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 hover:border-blue-300"
        onClick={(e) => { e.stopPropagation(); onOptimize(); }}
      >
        <FileCheck className="w-4 h-4 mr-2" />
        Optimize CV & Resume
      </Button>
    </div>
  </GlassCard>
);

const ATSScoreDisplay: React.FC<{ score: ATSScore }> = ({ score }) => {
  const getScoreColor = (value: number) => {
    if (value >= 80) return "text-green-500";
    if (value >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getProgressColor = (value: number) => {
    if (value >= 80) return "bg-green-500";
    if (value >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="border border-gray-200 rounded-md p-4 bg-white">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">ATS Score</h3>
        <div className={cn("text-2xl font-bold", getScoreColor(score.overall))}>
          {score.overall}%
        </div>
      </div>

      <div className="space-y-3">
        {[
          { label: "Keywords", value: score.keywords },
          { label: "Formatting", value: score.formatting },
          { label: "Relevance", value: score.relevance },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600">{label}</span>
              <span className={cn("font-medium", getScoreColor(value))}>{value}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", getProgressColor(value))}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}

        {score.jdQualityWarning && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-600 leading-relaxed">
                {score.jdQualityWarning}
              </p>
            </div>
          </div>
        )}

        {score.suggestions.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200">
            <h4 className="text-xs font-medium text-gray-700 mb-2">Suggestions</h4>
            <ul className="space-y-1.5">
              {score.suggestions.map((suggestion, idx) => (
                <li key={idx} className="text-xs text-gray-600 flex items-start gap-2">
                  <span className="text-gray-400 mt-0.5">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <div className="relative mb-8">
      {/* Animated glow effect */}
      <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse"></div>
      {/* Icon container with subtle animation */}
      <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/30 via-primary/20 to-accent/20 flex items-center justify-center border border-primary/30 shadow-xl shadow-primary/10 transform transition-transform hover:scale-105">
        {icon}
      </div>
    </div>
    <h3 className="text-2xl font-bold text-foreground mb-4">{title}</h3>
    <p className="text-muted-foreground max-w-lg mb-8 leading-relaxed text-base font-normal">{description}</p>
    {action}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const JobBoardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading: authLoading, updateCredits } = useFirebaseAuth();

  // Determine user tier (cast to include elite for subscription-backed tier)
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;

  const userTier: "free" | "pro" | "elite" = useMemo(() => {
    const tier = effectiveUser?.tier as "free" | "pro" | "elite" | undefined;
    if (tier === "pro" || tier === "elite") return tier;
    return "free";
  }, [effectiveUser?.tier]);

  const isElite = userTier === "elite";

  // Tab State
  const [activeTab, setActiveTab] = useState<string>(searchParams.get("tab") || "jobs");
  
  // Job Detail View State
  const [showJobDetailView, setShowJobDetailView] = useState(false);
  const [selectedJobForDetail, setSelectedJobForDetail] = useState<Job | null>(null);
  const [jobDetailActiveTab, setJobDetailActiveTab] = useState<string>("job-application");

  // Jobs Tab State
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJobType, setSelectedJobType] = useState("all");
  const [sortBy, setSortBy] = useState<"match" | "date" | "company">("match");
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);

  // Optimization Tab State
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [isOptimizing, _setIsOptimizing] = useState(false);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [optimizedResume, setOptimizedResume] = useState<OptimizedResume | null>(null);
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(null);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [recruitersLoading, setRecruitersLoading] = useState(false);
  const [recruitersError, setRecruitersError] = useState<string | null>(null);
  const [, setRecruitersCount] = useState(0);
  const [recruitersHasMore, setRecruitersHasMore] = useState(false);
  const [recruitersMoreAvailable, setRecruitersMoreAvailable] = useState(0);
  const [recruiterEmails, setRecruiterEmails] = useState<any[]>([]);
  const [draftsCreated, setDraftsCreated] = useState<any[]>([]);
  const [maxRecruitersRequested, setMaxRecruitersRequested] = useState<number>(2);
  const [, setLastSearchResult] = useState<{requestedCount: number; foundCount: number; creditsCharged: number; error?: string} | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null);
  const [, setGmailConnected] = useState<boolean | null>(null);
  const [, setCheckingGmail] = useState(false);
  const [parsedJobData, _setParsedJobData] = useState<{title?: string; company?: string; location?: string; description?: string} | null>(null);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const resumeRef = useRef<HTMLDivElement>(null);

  // Resume optimization V2 state
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);
  const [suggestionsResult, setSuggestionsResult] = useState<SuggestionsResult | null>(null);
  const [showSuggestionsView, setShowSuggestionsView] = useState(false);
  const [, setTemplateRebuildResult] = useState<TemplateRebuildResult | null>(null);

  // Calculate hasJobInfo reactively
  const hasJobInfo = useMemo(() => {
    return !!(jobUrl?.trim() || jobDescription?.trim());
  }, [jobUrl, jobDescription]);

  // Check Gmail connection status
  useEffect(() => {
    const checkGmailStatus = async () => {
      if (!user?.uid) {
        setGmailConnected(false);
        return;
      }
      
      try {
        setCheckingGmail(true);
        const { getAuth } = await import('firebase/auth');
        const auth = getAuth();
        const firebaseUser = auth.currentUser;
        
        if (!firebaseUser) {
          setGmailConnected(false);
          return;
        }
        
        const token = await firebaseUser.getIdToken();
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";
        
        const response = await fetch(`${API_BASE_URL}/api/google/gmail/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setGmailConnected(data.connected === true);
        } else {
          setGmailConnected(false);
        }
      } catch (error) {
        console.error('Error checking Gmail status:', error);
        setGmailConnected(false);
      } finally {
        setCheckingGmail(false);
      }
    };
    
    checkGmailStatus();
  }, [user?.uid]);

  // Fetch user preferences
  useEffect(() => {
    const fetchUserPreferences = async () => {
      if (!user?.uid) return;
      try {
        // Try to get from user document first
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const professionalInfo = userData.professionalInfo || {};
          
          // Get preferences from various possible locations
          const jobTypes = userData.jobTypes || professionalInfo.jobTypes || ["Internship"];
          const industries = professionalInfo.targetIndustries || userData.targetIndustries || [];
          const locations = userData.locationPreferences || professionalInfo.locationPreferences || userData.preferredLocation || [];
          
          setUserPreferences({
            jobTypes: Array.isArray(jobTypes) ? jobTypes : [jobTypes].filter(Boolean),
            industries: Array.isArray(industries) ? industries : [],
            locations: Array.isArray(locations) ? locations : [],
          });
        } else {
          // Fallback to professionalInfo API
          const professionalInfo = await firebaseApi.getProfessionalInfo(user.uid);
          if (professionalInfo) {
            setUserPreferences({
              jobTypes: ["Internship"],
              industries: professionalInfo.targetIndustries || [],
              locations: [],
            });
          }
        }
      } catch (error) {
        console.error("Error fetching user preferences:", error);
        // Set defaults
        setUserPreferences({
          jobTypes: ["Internship"],
          industries: [],
          locations: [],
        });
      }
    };
    fetchUserPreferences();
  }, [user?.uid]);

  // Track if we're in a search state (vs recommended jobs)
  const [isSearchState, setIsSearchState] = useState(false);
  const [, setLastSearchQuery] = useState("");

  // Helper to merge jobs with saved jobs (saved at top)
  const mergeJobsWithSaved = useCallback((newJobs: Job[]): Job[] => {
    // Get saved job IDs
    const savedIds = Array.from(savedJobs);
    
    // Separate saved and unsaved jobs
    const savedJobsList: Job[] = [];
    const unsavedJobsList: Job[] = [];
    const savedIdsSet = new Set(savedIds);
    
    newJobs.forEach(job => {
      if (savedIdsSet.has(job.id)) {
        savedJobsList.push(job);
      } else {
        unsavedJobsList.push(job);
      }
    });
    
    // Return saved jobs first, then unsaved
    return [...savedJobsList, ...unsavedJobsList];
  }, [savedJobs]);

  // Fetch recommended jobs - backend returns up to 200 jobs on first page
  useEffect(() => {
    const fetchJobs = async () => {
      if (!user?.uid || !userPreferences) return;
      // Only fetch recommended jobs if not in search state
      if (isSearchState) return;
      
      setLoadingJobs(true);
      try {
        // QUICK WIN: Backend now fetches 50 jobs on page 1 for faster loading
        const response = await apiService.getJobListings({
          jobTypes: userPreferences.jobTypes || ["Internship"],
          industries: userPreferences.industries || [],
          locations: userPreferences.locations || [],
          page: 1,
          perPage: 50, // QUICK WIN: Reduced from 200 to 50 for faster initial load
        });
        
        if (response.jobs && response.jobs.length > 0) {
          // Merge with saved jobs (saved jobs at top)
          const mergedJobs = mergeJobsWithSaved(response.jobs);
          setJobs(mergedJobs);
          console.log(`[JobBoard] Loaded ${response.jobs.length} recommended jobs`);
        }
      } catch (error) {
        console.error("Error fetching jobs:", error);
        toast({
          title: "Error loading jobs",
          description: "Using demo data. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setLoadingJobs(false);
      }
    };
    fetchJobs();
  }, [user?.uid, userPreferences, isSearchState, mergeJobsWithSaved]);

  // Load saved jobs from Firestore (with localStorage fallback)
  useEffect(() => {
    const loadSavedJobs = async () => {
      if (!user?.uid) {
        // Fallback to localStorage for non-authenticated users
    const saved = localStorage.getItem("offerloop_saved_jobs");
    if (saved) setSavedJobs(new Set(JSON.parse(saved)));
        return;
      }

      try {
        // Try Firestore first
        const savedJobsRef = collection(db, 'users', user.uid, 'savedJobs');
        const snapshot = await getDocs(savedJobsRef);
        const savedIds = snapshot.docs.map(doc => doc.id);
        
        if (savedIds.length > 0) {
          setSavedJobs(new Set(savedIds));
          // Also sync to localStorage as backup
          localStorage.setItem("offerloop_saved_jobs", JSON.stringify(savedIds));
        } else {
          // Fallback to localStorage if Firestore is empty
          const saved = localStorage.getItem("offerloop_saved_jobs");
          if (saved) {
            const ids = JSON.parse(saved);
            setSavedJobs(new Set(ids));
            // Migrate to Firestore
            for (const jobId of ids) {
              await setDoc(doc(db, 'users', user.uid, 'savedJobs', jobId), {
                savedAt: new Date().toISOString(),
              });
            }
          }
        }
      } catch (error) {
        console.error("Error loading saved jobs:", error);
        // Fallback to localStorage
        const saved = localStorage.getItem("offerloop_saved_jobs");
        if (saved) setSavedJobs(new Set(JSON.parse(saved)));
      }
    };
    
    loadSavedJobs();
  }, [user?.uid]);

  // Helper function to parse posted date
  const parsePostedDate = (posted: string): number => {
    if (!posted) return 0;
    const lower = posted.toLowerCase();
    
    // Extract days/weeks/months
    const dayMatch = lower.match(/(\d+)\s*days?/);
    if (dayMatch) return parseInt(dayMatch[1], 10);
    
    const weekMatch = lower.match(/(\d+)\s*weeks?/);
    if (weekMatch) return parseInt(weekMatch[1], 10) * 7;
    
    const monthMatch = lower.match(/(\d+)\s*months?/);
    if (monthMatch) return parseInt(monthMatch[1], 10) * 30;
    
    // "just now", "today", "hours ago" = 0
    if (lower.includes("just") || lower.includes("today") || lower.includes("hour")) {
      return 0;
    }
    
    return 999; // Unknown/old dates go to end
  };

  // Filter jobs (only by type, not by search - search generates new jobs)
  const filteredJobs = jobs.filter((job) => {
    const matchesType = selectedJobType === "all" || job.type === selectedJobType;
    return matchesType;
  });

  // Sort jobs - saved jobs always at top, then apply sorting
  const sortedJobs = useMemo(() => {
    const filtered = [...filteredJobs];
    
    // Separate saved and unsaved jobs
    const savedIdsSet = new Set(savedJobs);
    const savedJobsList: Job[] = [];
    const unsavedJobsList: Job[] = [];
    
    filtered.forEach(job => {
      if (savedIdsSet.has(job.id)) {
        savedJobsList.push(job);
      } else {
        unsavedJobsList.push(job);
      }
    });
    
    // Sort each group
    const sortJobs = (jobs: Job[]) => {
    switch (sortBy) {
      case "match":
          return jobs.sort((a, b) => {
          const scoreA = a.matchScore ?? a.combinedScore ?? 0;
          const scoreB = b.matchScore ?? b.combinedScore ?? 0;
          return scoreB - scoreA;
        });
      case "date":
          return jobs.sort((a, b) => {
          const daysA = parsePostedDate(a.posted);
          const daysB = parsePostedDate(b.posted);
          return daysA - daysB;
        });
      case "company":
          return jobs.sort((a, b) => a.company.localeCompare(b.company));
      default:
          return jobs;
      }
    };
    
    // Sort saved jobs
    const sortedSaved = sortJobs(savedJobsList);
    // Sort unsaved jobs
    const sortedUnsaved = sortJobs(unsavedJobsList);
    
    // Return saved jobs first, then unsaved
    return [...sortedSaved, ...sortedUnsaved];
  }, [filteredJobs, sortBy, savedJobs]);

  // Pagination
  const totalPages = Math.ceil(sortedJobs.length / JOBS_PER_PAGE);
  const paginatedJobs = sortedJobs.slice(
    (currentPage - 1) * JOBS_PER_PAGE,
    currentPage * JOBS_PER_PAGE
  );

  // Handlers
  const handleSaveJob = useCallback(async (jobId: string) => {
    const isCurrentlySaved = savedJobs.has(jobId);
    
    setSavedJobs((prev) => {
      const newSaved = new Set(prev);
      if (isCurrentlySaved) {
        newSaved.delete(jobId);
        toast({ title: "Job removed from saved" });
      } else {
        newSaved.add(jobId);
        toast({ title: "Job saved!" });
      }
      // Update localStorage immediately for responsive UI
      localStorage.setItem("offerloop_saved_jobs", JSON.stringify([...newSaved]));
      return newSaved;
    });

    // Persist to Firestore if user is authenticated
    if (user?.uid) {
      try {
        const jobRef = doc(db, 'users', user.uid, 'savedJobs', jobId);
        if (isCurrentlySaved) {
          // Remove from Firestore
          await deleteDoc(jobRef);
        } else {
          // Save to Firestore
          await setDoc(jobRef, {
            savedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error("Error saving job to Firestore:", error);
        // Revert state on error
        setSavedJobs((prev) => {
          const reverted = new Set(prev);
          if (isCurrentlySaved) {
            reverted.add(jobId);
          } else {
            reverted.delete(jobId);
          }
          return reverted;
        });
      }
    }
  }, [savedJobs, user?.uid]);

  const handleSelectJobForOptimization = useCallback((job: Job) => {
    setSelectedJob(job);
    setJobUrl(job.url);
    setJobDescription(job.description);
    setOptimizedResume(null);
    setCoverLetter(null);
    // Open job detail view
    setSelectedJobForDetail(job);
    setShowJobDetailView(true);
    setJobDetailActiveTab("contact-recruiter");
  }, []);

  const handleApplyToJob = useCallback((job: Job) => {
    // Open job detail view instead of directly opening link
    setSelectedJobForDetail(job);
    setSelectedJob(job);
    setJobUrl(job.url);
    setJobDescription(job.description);
    setShowJobDetailView(true);
    setJobDetailActiveTab("job-application");
  }, []);
  
  const handleReturnToJobBoard = useCallback(() => {
    setShowJobDetailView(false);
    setSelectedJobForDetail(null);
  }, []);

  // Handle search - generates new jobs (Elite only)
  const handleSearch = useCallback(async () => {
    if (!isElite) {
      toast({
        title: "Elite Feature",
        description: "Upgrade to Elite to search jobs by company, role, or location.",
        variant: "destructive",
      });
      return;
    }

    if (!searchQuery.trim()) {
      // Clear search and return to recommended jobs
      setIsSearchState(false);
      setLastSearchQuery("");
      setSearchQuery("");
      return;
    }

    if (!user?.uid || !userPreferences) {
      toast({
        title: "Error",
        description: "Please sign in to search jobs.",
        variant: "destructive",
      });
      return;
    }

    setLoadingJobs(true);
    setIsSearchState(true);
    setLastSearchQuery(searchQuery.trim());

    try {
      // Generate new jobs based on search query
      const response = await apiService.getJobListings({
        jobTypes: userPreferences.jobTypes || ["Internship"],
        industries: userPreferences.industries || [],
        locations: userPreferences.locations || [],
        searchQuery: searchQuery.trim(),
        page: 1,
        perPage: 200,
      });

      if (response.jobs && response.jobs.length > 0) {
        // Merge with saved jobs (saved jobs at top)
        const mergedJobs = mergeJobsWithSaved(response.jobs);
        setJobs(mergedJobs);
        console.log(`[JobBoard] Generated ${response.jobs.length} jobs for search: "${searchQuery.trim()}"`);
      } else {
        toast({
          title: "No jobs found",
          description: "Try a different search query.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error searching jobs:", error);
      toast({
        title: "Search failed",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoadingJobs(false);
    }
  }, [isElite, searchQuery, user?.uid, userPreferences, mergeJobsWithSaved]);

  const handleRefreshJobs = async () => {
    setLoadingJobs(true);
    try {
      const response = await apiService.getJobListings({
        jobTypes: userPreferences?.jobTypes || ["Internship"],
        industries: userPreferences?.industries || [],
        locations: userPreferences?.locations || [],
        refresh: true,
      });
      if (response.jobs) {
        setJobs(response.jobs);
        toast({ title: "Jobs refreshed!" });
      }
    } catch (error) {
      toast({ title: "Refresh Failed", variant: "destructive" });
    } finally {
      setLoadingJobs(false);
    }
  };

  // Helper function to save recruiters to Recruiter Spreadsheet
  const saveRecruitersToSpreadsheet = async (apiRecruiters: Recruiter[], job: Job | null) => {
    if (!user || !apiRecruiters.length) return;

    try {
      // Convert API recruiters to Firebase recruiter format
      const firebaseRecruiters: Omit<FirebaseRecruiter, 'id'>[] = apiRecruiters.map((apiRecruiter) => ({
        firstName: apiRecruiter.FirstName || '',
        lastName: apiRecruiter.LastName || '',
        linkedinUrl: apiRecruiter.LinkedIn || '',
        email: apiRecruiter.Email || apiRecruiter.WorkEmail || '',
        company: apiRecruiter.Company || '',
        jobTitle: apiRecruiter.Title || '',
        location: `${apiRecruiter.City || ''}${apiRecruiter.City && apiRecruiter.State ? ', ' : ''}${apiRecruiter.State || ''}`.trim() || '',
        phone: apiRecruiter.Phone,
        workEmail: apiRecruiter.WorkEmail,
        personalEmail: apiRecruiter.PersonalEmail,
        associatedJobId: job?.id,
        associatedJobTitle: job?.title,
        associatedJobUrl: job?.url,
        dateAdded: new Date().toISOString(),
        status: 'Not Contacted',
      }));

      // Check for duplicates before saving (by email or LinkedIn)
      const existingRecruiters = await firebaseApi.getRecruiters(user.uid);
      const existingEmails = new Set(existingRecruiters.map(r => r.email).filter(Boolean));
      const existingLinkedIns = new Set(existingRecruiters.map(r => r.linkedinUrl).filter(Boolean));

      const newRecruiters = firebaseRecruiters.filter(r => {
        const hasEmail = r.email && existingEmails.has(r.email);
        const hasLinkedIn = r.linkedinUrl && existingLinkedIns.has(r.linkedinUrl);
        return !hasEmail && !hasLinkedIn;
      });

      if (newRecruiters.length > 0) {
        await firebaseApi.bulkCreateRecruiters(user.uid, newRecruiters);
        console.log(`✅ Saved ${newRecruiters.length} recruiter(s) to Recruiter Spreadsheet`);
      }
    } catch (error) {
      console.error('Error saving recruiters to spreadsheet:', error);
      // Don't show error to user - this is a background operation
    }
  };

  const handleFindRecruiter = async () => {
    if ((user?.credits ?? 0) < 15) {
      toast({
        title: "Insufficient Credits",
        description: "You need at least 15 credits to find recruiters.",
        variant: "destructive"
      });
      return;
    }
    
    // Capture the current active tab at the start of the function
    const currentActiveTab = activeTab;
    
    // Determine company, title, location, and description from various sources
    let company: string | undefined;
    let jobTitle: string = '';
    let location: string = '';
    let description: string = '';
    
    // Priority 1: Use selectedJob from job board (most reliable source)
    if (selectedJob) {
      company = selectedJob.company;
      jobTitle = selectedJob.title || '';
      location = selectedJob.location || '';
      description = jobDescription || selectedJob.description || '';
    }
    
    // Priority 2: Parse job URL if provided (may have additional/updated info)
    if (jobUrl && jobUrl.trim()) {
      try {
        const parseResponse = await apiService.parseJobUrl({ url: jobUrl });
        if (parseResponse.job) {
          // Use parsed data to fill in missing fields or override if more complete
          if (parseResponse.job.company && !company) {
          company = parseResponse.job.company;
          }
          if (parseResponse.job.title && !jobTitle) {
            jobTitle = parseResponse.job.title;
          }
          // Location: prefer parsed location if available, otherwise keep selectedJob location
          if (parseResponse.job.location) {
            location = parseResponse.job.location;
          }
          // Description: prefer parsed description if available, otherwise keep existing
          if (parseResponse.job.description && !description) {
            description = parseResponse.job.description;
          }
        } else if (parseResponse.error) {
          console.warn('Failed to parse job URL:', parseResponse.error);
          // Show friendly message in recruiter search mode
          if (currentActiveTab === "recruiter-search") {
            toast({
              title: "Could not parse job URL",
              description: "Please paste the job description instead of using the URL.",
              variant: "default"
            });
          }
        }
      } catch (error) {
        console.error('Error parsing job URL:', error);
        // Show friendly message in recruiter search mode for catch errors too
        if (currentActiveTab === "recruiter-search") {
          toast({
            title: "Could not parse job URL",
            description: "Please paste the job description instead of using the URL.",
            variant: "default"
          });
        }
      }
    }
    
    // Priority 3: Fallback to jobDescription if still no description
    if (!description && jobDescription) {
      description = jobDescription;
    }
    
    // Ensure location is populated from selectedJob if we still don't have it
    if (!location && selectedJob?.location) {
      location = selectedJob.location;
    }
    
    // If still no company, that's okay - backend will extract it from description via OpenAI
    // But we should still show a warning if we don't have a description either
    if (!company && !description) {
      toast({
        title: "Job Information Required",
        description: "Please select a job from the list, paste a job URL, or paste the job description in the text area below.",
        variant: "destructive"
      });
      return;
    }
    
    setRecruitersLoading(true);
    setRecruitersError(null);
    
    try {
      // Only send company if we're confident it's valid (from selectedJob or URL parsing)
      // Otherwise, let backend extract it via OpenAI from description
      // Reject obviously invalid company names
      const invalidCompanyNames = ['job type', 'job details', 'job description', 'employer', 'company', 'organization'];
      const isValidCompany = company && company.trim() && !invalidCompanyNames.includes(company.toLowerCase().trim());
      
      const response = await apiService.findRecruiters({
        company: isValidCompany ? company : undefined,  // Only send if valid
        jobTitle: jobTitle || undefined,
        jobDescription: description || jobDescription || undefined,  // Always send description if available
        location: location || undefined,
        jobUrl: jobUrl || undefined,  // Pass jobUrl as fallback for backend parsing
        maxResults: maxRecruitersRequested  // Pass user's requested number
      });
      
      const requestedCount = response.requestedCount ?? maxRecruitersRequested;
      const foundCount = response.foundCount ?? response.recruiters.length;
      
      // Store last search result for inline alert
      setLastSearchResult({
        requestedCount,
        foundCount,
        creditsCharged: response.creditsCharged,
        error: response.error
      });
      
      if (response.error) {
        setRecruitersError(response.error);
        setRecruiters([]);
        setRecruitersCount(0);
        setRecruitersHasMore(false);
        toast({
          title: "Error",
          description: "Something went wrong. No credits were charged.",
          variant: "destructive"
        });
      } else if (foundCount === 0) {
        setRecruitersError(response.message || "No recruiters found at this company.");
        setRecruiters([]);
        setRecruitersCount(0);
        setRecruitersHasMore(false);
        toast({
          title: "No Recruiters Found",
          description: "No recruiters found matching this job. Try a different job title or company. No credits were charged.",
          variant: "default"
        });
      } else if (foundCount < requestedCount) {
        // Found fewer than requested
        setRecruiters(response.recruiters);
        setRecruitersCount(response.totalFound || response.recruiters.length);
        setRecruitersHasMore(response.hasMore || false);
        setRecruitersMoreAvailable(response.moreAvailable || 0);
        setRecruiterEmails(response.emails || []);
        setDraftsCreated(response.draftsCreated || []);
        if (response.creditsRemaining !== undefined) {
          await updateCredits(response.creditsRemaining);
        }
        
        // Auto-save recruiters to Recruiter Spreadsheet
        if (user && response.recruiters.length > 0) {
          // If we're in Recruiter Search, don't associate with a job; otherwise use selectedJobForDetail
          const jobToAssociate = currentActiveTab === "recruiter-search" ? null : selectedJobForDetail;
          await saveRecruitersToSpreadsheet(response.recruiters, jobToAssociate);
        }
        
        const draftMessage = response.draftsCreated && response.draftsCreated.length > 0
          ? ` ${response.draftsCreated.length} email draft${response.draftsCreated.length > 1 ? 's' : ''} created in Gmail!`
          : '';
        toast({
          title: "Found Fewer Than Requested",
          description: `Found ${foundCount} of ${requestedCount} requested recruiters (${response.creditsCharged} credits used). We couldn't find more matches for this job — try broadening the job title or company criteria.${draftMessage}`,
          variant: "default"
        });
        // Switch to recruiters tab to show results (only if not in Recruiter Search)
        if (currentActiveTab !== "recruiter-search") {
        setActiveTab("recruiters");
        }
      } else {
        // Found exactly what was requested (or more)
        setRecruiters(response.recruiters);
        setRecruitersCount(response.totalFound || response.recruiters.length);
        setRecruitersHasMore(response.hasMore || false);
        setRecruitersMoreAvailable(response.moreAvailable || 0);
        setRecruiterEmails(response.emails || []);
        setDraftsCreated(response.draftsCreated || []);
        if (response.creditsRemaining !== undefined) {
          await updateCredits(response.creditsRemaining);
        }
        
        // Auto-save recruiters to Recruiter Spreadsheet
        if (user && response.recruiters.length > 0) {
          // If we're in Recruiter Search, don't associate with a job; otherwise use selectedJobForDetail
          const jobToAssociate = currentActiveTab === "recruiter-search" ? null : selectedJobForDetail;
          await saveRecruitersToSpreadsheet(response.recruiters, jobToAssociate);
        }
        
        const draftMessage = response.draftsCreated && response.draftsCreated.length > 0
          ? ` ${response.draftsCreated.length} email draft${response.draftsCreated.length > 1 ? 's' : ''} created in Gmail!`
          : '';
        toast({
          title: "Recruiters Found!",
          description: `Found ${foundCount} recruiter${foundCount !== 1 ? 's' : ''} (${response.creditsCharged} credits used).${draftMessage}`,
          variant: "default"
        });
        // Switch to recruiters tab to show results (only if not in Recruiter Search)
        if (currentActiveTab !== "recruiter-search") {
        setActiveTab("recruiters");
        }
      }
    } catch (error: any) {
      setRecruitersError(error.message || "Failed to find recruiters");
      setRecruiters([]);
      setRecruitersCount(0);
      setRecruitersHasMore(false);
      setLastSearchResult({
        requestedCount: maxRecruitersRequested,
        foundCount: 0,
        creditsCharged: 0,
        error: error.message || "Failed to find recruiters"
      });
      toast({
        title: "Error",
        description: "Something went wrong. No credits were charged.",
        variant: "destructive"
      });
    } finally {
      setRecruitersLoading(false);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!user?.uid) return;
    if ((user?.credits ?? 0) < COVER_LETTER_CREDIT_COST) {
      toast({ title: "Insufficient Credits", description: `You need ${COVER_LETTER_CREDIT_COST} credits.`, variant: "destructive" });
      return;
    }
    if (!jobUrl && !jobDescription) {
      toast({ title: "Job Information Required", variant: "destructive" });
      return;
    }

    setIsGeneratingCoverLetter(true);
    try {
      // Only send jobTitle and company if we have a selectedJob AND no URL
      // If URL is provided, let the backend parse it fresh and use that data
      const requestPayload: GenerateCoverLetterRequest = {
        jobUrl: jobUrl || undefined,
        jobDescription: jobDescription || undefined,
        userId: user.uid,
      };
      
      // Only include jobTitle and company if we have a selectedJob from the list
      // AND no URL was manually pasted (to avoid sending stale data)
      if (selectedJob && !jobUrl) {
        requestPayload.jobTitle = selectedJob.title;
        requestPayload.company = selectedJob.company;
      }
      
      const response = await apiService.generateCoverLetter(requestPayload);
      if (response.coverLetter) {
        setCoverLetter(response.coverLetter);
        // Backend already deducted credits, just update with the remaining balance
        if (response.creditsRemaining !== undefined) {
          await updateCredits(response.creditsRemaining);
        }
        toast({ title: "Cover Letter Generated!" });
      }
    } catch (error: any) {
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const handleCopyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${type} copied to clipboard!` });
  };

  const handleDownload = async (content: string, filename: string) => {
    try {
      // Extract base filename without extension for PDF
      const baseFilename = filename.replace(/\.(txt|pdf)$/i, '');
      await downloadCoverLetterAsPDF(content, baseFilename);
      toast({ title: "Downloaded!" });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({ 
        title: "Download failed", 
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Helper to normalize LinkedIn URLs
  const normalizeLinkedInUrl = (url: string): string => {
    if (!url || url.trim() === '') return '';
    
    const trimmedUrl = url.trim();
    
    // If it already starts with http, return as is
    if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
      return trimmedUrl;
    }
    
    // If it starts with linkedin.com or www.linkedin.com, add https://
    if (trimmedUrl.startsWith('linkedin.com') || trimmedUrl.startsWith('www.linkedin.com')) {
      return `https://${trimmedUrl}`;
    }
    
    // If it's just a path like /in/username, add the full domain
    if (trimmedUrl.startsWith('/in/')) {
      return `https://www.linkedin.com${trimmedUrl}`;
    }
    
    // If it contains linkedin but is malformed, try to fix it
    if (trimmedUrl.includes('linkedin') && trimmedUrl.includes('/in/')) {
      // Extract the /in/username part and rebuild
      const match = trimmedUrl.match(/\/in\/[^\/\s]+/);
      if (match) {
        return `https://www.linkedin.com${match[0]}`;
      }
    }
    
    // Otherwise, assume it's just a username and add the full path
    return `https://www.linkedin.com/in/${trimmedUrl}`;
  };

  // Update URL when tab changes
  useEffect(() => {
    setSearchParams({ tab: activeTab });
  }, [activeTab, setSearchParams]);

  // Reset page on filter/sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedJobType, sortBy]);

  if (authLoading) return <LoadingSkeleton />;

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <AppHeader title="Job Board" />

          {/* Tabs - Hide when in job detail view */}
          {!showJobDetailView && (
            <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm px-6 pt-4">
              <div className="flex justify-center mb-4">
                <Tabs 
                  value={activeTab} 
                  onValueChange={setActiveTab}
                  className="w-full max-w-2xl"
                >
                  <TabsList className="h-14 tabs-container-gradient border border-border grid grid-cols-3 max-w-2xl w-full rounded-xl p-1 bg-white">
                    <TabsTrigger
                      value="jobs"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <Briefcase className="h-5 w-5 mr-2" />
                      Job Board
                  </TabsTrigger>
                    <TabsTrigger
                      value="recruiter-search"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <FileCheck className="h-5 w-5 mr-2" />
                      Recruiter Search
                  </TabsTrigger>
                    <TabsTrigger
                      value="recruiters"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <Users className="h-5 w-5 mr-2" />
                      Recruiter Spreadsheet
                    {recruiters.length > 0 && (
                        <span className="ml-2 bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                        {recruiters.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
                </Tabs>
              </div>
              {activeTab === "jobs" && (
                <p className="text-center text-muted-foreground text-sm max-w-xl mx-auto pb-4">
                  Browse job listings tailored to your profile. Optimize your resume for specific jobs, generate cover letters, and find recruiters.
                </p>
              )}
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
            {showJobDetailView && selectedJobForDetail ? (
              // Job Detail View
              <div className="w-full p-6 min-w-0">
                {/* Return to Job Board Button */}
                <Button
                  variant="ghost"
                  onClick={handleReturnToJobBoard}
                  className="mb-6 flex items-center gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Return to Job Board
                </Button>

                {/* Job Detail Tabs */}
                <Tabs value={jobDetailActiveTab} onValueChange={setJobDetailActiveTab} className="space-y-6 w-full">
                  <div className="flex mb-8">
                    <TabsList className="h-14 tabs-container-gradient border border-border grid grid-cols-3 w-full rounded-xl p-1 bg-white">
                      <TabsTrigger
                        value="job-application"
                        className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                      >
                        <FileText className="h-5 w-5 mr-2" />
                        Job Application
                      </TabsTrigger>
                      <TabsTrigger
                        value="optimize-cv"
                        className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                      >
                        <FileCheck className="h-5 w-5 mr-2" />
                        Optimize CV & Resume
                      </TabsTrigger>
                      <TabsTrigger
                        value="contact-recruiter"
                        className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                      >
                        <Users className="h-5 w-5 mr-2" />
                        Contact Recruiter(s)
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Job Application Tab */}
                  <TabsContent value="job-application" className="space-y-6">
                    <GlassCard className="p-6">
                      <div className="space-y-6">
                        {/* Job Title */}
                        <div>
                          <h2 className="text-2xl font-bold text-foreground mb-2">
                            {selectedJobForDetail.title}
                          </h2>
                          <p className="text-lg text-muted-foreground mb-4">
                            {selectedJobForDetail.company} • {selectedJobForDetail.location}
                          </p>
                          <Button
                            variant="gradient"
                            size="lg"
                            onClick={() => {
                              if (selectedJobForDetail.url) {
                                window.open(selectedJobForDetail.url, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className="w-full sm:w-auto"
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Apply
                          </Button>
                        </div>

                        {/* Job Link */}
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Job Link
                          </label>
                          <a
                            href={selectedJobForDetail.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-2"
                          >
                            {selectedJobForDetail.url}
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>

                        {/* Job Description */}
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Job Description
                          </label>
                          <div className="max-h-96 overflow-y-auto p-4 bg-muted/50 rounded-lg border border-border">
                            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                              {selectedJobForDetail.description || "No description available."}
                            </div>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  </TabsContent>

                  {/* Optimize CV & Resume Tab */}
                  <TabsContent value="optimize-cv" className="space-y-6">
                    <GlassCard className="p-6">
                      <div className="flex flex-col gap-4 w-full">
                        <Button
                          variant="gradient"
                          size="lg"
                          onClick={() => {
                            setSelectedJob(selectedJobForDetail);
                            setJobUrl(selectedJobForDetail.url);
                            setJobDescription(selectedJobForDetail.description);
                            setShowOptimizationModal(true);
                          }}
                          className="w-full"
                        >
                          <FileCheck className="h-5 w-5 mr-2" />
                          Optimize Resume
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => {
                            setSelectedJob(selectedJobForDetail);
                            setJobUrl(selectedJobForDetail.url);
                            setJobDescription(selectedJobForDetail.description);
                            handleGenerateCoverLetter();
                          }}
                          disabled={!selectedJobForDetail.url && !selectedJobForDetail.description}
                          className="w-full"
                        >
                          <FileText className="h-5 w-5 mr-2" />
                          Generate CV
                        </Button>
                      </div>
                    </GlassCard>
                  </TabsContent>

                  {/* Contact Recruiter(s) Tab */}
                  <TabsContent value="contact-recruiter" className="w-full">
                    <GlassCard className="p-0 overflow-hidden">
                      <div className="w-full h-full">
                        {/* Reuse recruiter UI - header section */}
                        <div className="bg-background border-b border-border/40 px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
                              <Users className="w-6 h-6 text-primary" />
                              Recruiters
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                              {recruiters.length > 0 
                                ? `${recruiters.length} recruiter${recruiters.length !== 1 ? 's' : ''} found`
                                : 'No recruiters found yet. Use "Find Recruiters" to search.'}
                            </p>
                          </div>
                          {selectedJobForDetail && (
                            <div className="flex items-center gap-3">
                              <label className="text-sm text-gray-600 flex items-center gap-2">
                                Number of recruiters:
                                <Select
                                  value={maxRecruitersRequested.toString()}
                                  onValueChange={(value) => setMaxRecruitersRequested(parseInt(value))}
                                  disabled={recruitersLoading}
                                >
                                  <SelectTrigger className="w-20 h-8 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[1, 2, 3, 4, 5].map((num) => (
                                      <SelectItem key={num} value={num.toString()}>
                                        {num}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </label>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <Button
                                        disabled={recruitersLoading || (user?.credits ?? 0) < 15}
                                        onClick={() => {
                                          // Set selected job info for recruiter search
                                          setSelectedJob(selectedJobForDetail);
                                          setJobUrl(selectedJobForDetail.url);
                                          setJobDescription(selectedJobForDetail.description);
                                          handleFindRecruiter();
                                        }}
                                        variant={undefined}
                                        className={`
                                          relative overflow-hidden text-sm px-4 py-2 rounded-lg font-medium transition-colors
                                          ${!recruitersLoading && (user?.credits ?? 0) >= 15
                                            ? '!bg-blue-600 !text-white hover:!bg-blue-700 active:!bg-blue-800 focus-visible:!ring-blue-600' 
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                          }
                                        `}
                                        style={!recruitersLoading && (user?.credits ?? 0) >= 15 ? { 
                                          backgroundColor: '#2563eb',
                                          color: '#ffffff'
                                        } : undefined}
                                      >
                                        {recruitersLoading ? 'Finding...' : 'Find Recruiters'}
                                        <InlineLoadingBar isLoading={recruitersLoading} />
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  {(user?.credits ?? 0) < 15 && (
                                    <TooltipContent>
                                      <p>You need at least 15 credits. You have {user?.credits ?? 0}.</p>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          )}
                        </div>
                        
                        {/* Show drafts created notification */}
                        {draftsCreated.length > 0 && (
                          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mt-4">
                            <div className="flex items-center gap-2">
                              <Mail className="h-5 w-5 text-green-600" />
                              <div className="flex-1">
                                <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                                  {draftsCreated.length} email draft{draftsCreated.length > 1 ? 's' : ''} created in your Gmail!
                                </p>
                                <a 
                                  href="https://mail.google.com/mail/u/0/#drafts"
                                  target="_blank"
                                  rel="noopener,noreferrer"
                                  className="text-sm text-green-600 dark:text-green-400 hover:underline mt-1 inline-block"
                                >
                                  Open Gmail Drafts →
                                </a>
                              </div>
                            </div>
                          </div>
                        )}

                        {recruitersHasMore && (
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mt-4">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                                  More Recruiters Available
                                </p>
                                <p className="text-xs text-yellow-800 dark:text-yellow-300 mt-1">
                                  {recruitersMoreAvailable} more recruiter{recruitersMoreAvailable !== 1 ? 's' : ''} found, but you need {recruitersMoreAvailable * 15} more credits to view them. 
                                  You currently have {user?.credits ?? 0} credits.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Recruiter Table - reuse existing recruiter table */}
                      {recruiters.length === 0 ? (
                        <div className="flex items-center justify-center h-[calc(100vh-400px)]">
                          <div className="text-center">
                            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                            <p className="text-muted-foreground text-lg">
                              No recruiters found yet.
                            </p>
                            <p className="text-muted-foreground mt-2 text-sm">
                              Click "Find Recruiters" to search for recruiters at this company.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full overflow-x-auto">
                          <div className="rounded-md border border-border bg-background/60 backdrop-blur-sm min-w-full">
                            <table className="w-full">
                              <thead className="bg-muted/50 sticky top-0 z-10">
                                <tr>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">First Name</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Name</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">LinkedIn</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Location</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="bg-background divide-y divide-border">
                                {recruiters.map((recruiter, index) => {
                                  const emailData = recruiterEmails.find(e => e.to_email === recruiter.Email);
                                  const draftData = draftsCreated.find(d => d.recruiter_email === recruiter.Email);
                                  
                                  return (
                                    <React.Fragment key={index}>
                                      <tr className="hover:bg-secondary/50">
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.FirstName}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.LastName}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                                          {recruiter.LinkedIn ? (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => window.open(normalizeLinkedInUrl(recruiter.LinkedIn), '_blank', 'noopener,noreferrer')}
                                              className="p-1 h-auto text-primary hover:text-primary/80 cursor-pointer"
                                              title="View LinkedIn"
                                            >
                                              <ExternalLink className="h-4 w-4 mr-1" />
                                              LinkedIn
                                            </Button>
                                          ) : (
                                            <span className="text-muted-foreground text-xs">No LinkedIn</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                                          {recruiter.Email && recruiter.Email !== "Not available" ? (
                                            <a href={`mailto:${recruiter.Email}`} className="text-primary hover:underline">
                                              {recruiter.Email}
                                            </a>
                                          ) : (
                                            <span className="text-muted-foreground text-xs">Not available</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.Title}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.Company}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                                          {recruiter.City && recruiter.State ? `${recruiter.City}, ${recruiter.State}` : 'N/A'}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                                          <div className="flex gap-2">
                                            {recruiter.LinkedIn && (
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => window.open(normalizeLinkedInUrl(recruiter.LinkedIn), '_blank', 'noopener,noreferrer')}
                                                className="h-8 w-8"
                                                title="View LinkedIn"
                                              >
                                                <Linkedin className="h-4 w-4" />
                                              </Button>
                                            )}
                                            {draftData?.draft_url ? (
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => window.open(draftData.draft_url, '_blank')}
                                                className="h-8 w-8 text-green-600 hover:text-green-700"
                                                title="Open Email Draft"
                                              >
                                                <Mail className="h-4 w-4" />
                                              </Button>
                                            ) : recruiter.Email && recruiter.Email !== "Not available" ? (
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                asChild
                                                className="h-8 w-8"
                                                title="Send Email"
                                              >
                                                <a href={`mailto:${recruiter.Email}`}>
                                                  <Mail className="h-4 w-4" />
                                                </a>
                                              </Button>
                                            ) : null}
                                          </div>
                                        </td>
                                      </tr>
                                      {emailData && (
                                        <tr key={`email-${index}`} className="bg-muted/30">
                                          <td colSpan={8} className="px-4 py-3">
                                            <div className="space-y-2">
                                              <button
                                                onClick={() => setExpandedEmail(expandedEmail === index ? null : index)}
                                                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                              >
                                                {expandedEmail === index ? (
                                                  <>
                                                    <ChevronUp className="h-4 w-4" />
                                                    Hide email preview
                                                  </>
                                                ) : (
                                                  <>
                                                    <ChevronDown className="h-4 w-4" />
                                                    Preview email
                                                  </>
                                                )}
                                              </button>
                                              
                                              {expandedEmail === index && (
                                                <div className="mt-2 p-3 bg-background rounded-lg border border-border text-sm">
                                                  <p className="font-medium text-foreground mb-2">Subject: {emailData.subject}</p>
                                                  <div className="text-muted-foreground whitespace-pre-wrap">
                                                    {emailData.plain_body}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      </div>
                    </GlassCard>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              // Original Job Board View
              <div className="w-full p-6 min-w-0 space-y-6">
                {/* JOBS TAB CONTENT */}
                {activeTab === "jobs" && (
                  <div className="space-y-6">
                  {/* Filters */}
                  <GlassCard className="p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                                placeholder={isElite ? "Search jobs, companies, locations..." : "Upgrade to Elite to search jobs"}
                          value={searchQuery}
                                onChange={(e) => {
                                  if (isElite) {
                                    setSearchQuery(e.target.value);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && isElite) {
                                    handleSearch();
                                  }
                                }}
                                disabled={!isElite}
                          className="pl-10"
                        />
                      </div>
                          </TooltipTrigger>
                          {!isElite && (
                            <TooltipContent>
                              <p>Upgrade to Elite to search jobs by company, role, or location</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                      {isElite && (
                        <Button
                          variant="outline"
                          onClick={handleSearch}
                          disabled={loadingJobs}
                          className="whitespace-nowrap"
                        >
                          <Search className="w-4 h-4 mr-2" />
                          Search
                        </Button>
                      )}
                      <Select value={selectedJobType} onValueChange={setSelectedJobType}>
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Job Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {JOB_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={sortBy} onValueChange={(value) => setSortBy(value as "match" | "date" | "company")}>
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="match">Best Match</SelectItem>
                          <SelectItem value="date">Most Recent</SelectItem>
                          <SelectItem value="company">Company A-Z</SelectItem>
                        </SelectContent>
                      </Select>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={handleRefreshJobs} disabled={loadingJobs}>
                              <RefreshCw className={cn("w-4 h-4", loadingJobs && "animate-spin")} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Refresh jobs</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </GlassCard>

                  {/* Jobs Grid */}
                  {loadingJobs ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[...Array(6)].map((_, i) => (
                        <GlassCard key={i} className="p-5 animate-pulse">
                          <div className="flex gap-4">
                            <div className="w-12 h-12 bg-muted rounded-lg" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 bg-muted rounded w-3/4" />
                              <div className="h-3 bg-muted rounded w-1/2" />
                            </div>
                          </div>
                        </GlassCard>
                      ))}
                    </div>
                  ) : sortedJobs.length === 0 ? (
                    <EmptyState
                      icon={<Briefcase className="w-8 h-8 text-primary" />}
                      title="No jobs found"
                      description="Try adjusting your filters or search query."
                      action={
                        <Button variant="gradient" onClick={() => { setSearchQuery(""); setSelectedJobType("all"); }}>
                          Clear Filters
                        </Button>
                      }
                    />
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * JOBS_PER_PAGE + 1}-
                        {Math.min(currentPage * JOBS_PER_PAGE, sortedJobs.length)} of {sortedJobs.length} jobs
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {paginatedJobs.map((job) => (
                          <JobCard
                            key={job.id}
                            job={job}
                            isSelected={selectedJob?.id === job.id}
                            isSaved={savedJobs.has(job.id)}
                            onSelect={() => {
                              handleSelectJobForOptimization(job);
                              setSelectedJobForDetail(job);
                              setShowJobDetailView(true);
                              setJobDetailActiveTab("contact-recruiter");
                            }}
                            onSave={() => handleSaveJob(job.id)}
                            onApply={() => handleApplyToJob(job)}
                            onOptimize={() => handleSelectJobForOptimization(job)}
                          />
                        ))}
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-6">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                  </div>
                )}

                {/* RECRUITER SEARCH TAB CONTENT */}
                {activeTab === "recruiter-search" && (
                  <div className="space-y-6 max-w-4xl mx-auto">
                    {/* Job Input Card */}
                    <GlassCard className="p-6">
                      <div className="space-y-6">
                              <div>
                          <h2 className="text-2xl font-bold text-foreground mb-2">
                            Recruiter Search
                          </h2>
                          <p className="text-muted-foreground">
                            Paste a job URL or job description to find recruiters, optimize your resume, and generate a cover letter.
                                </p>
                              </div>

                        {/* Job URL Input */}
                          <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Job URL (Optional)
                        </label>
                              <Input
                            placeholder="https://jobs.company.com/position/123"
                                value={jobUrl}
                            onChange={(e) => setJobUrl(e.target.value)}
                            className="w-full"
                              />
                          </div>

                        {/* Job Description Textarea */}
                          <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Job Description
                        </label>
                            <Textarea
                            placeholder="Paste the job description here..."
                              value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            className="w-full min-h-[200px]"
                          />
                          <p className="text-xs text-muted-foreground mt-2">
                            Provide either a job URL or job description (or both) to get started.
                          </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                    variant="gradient"
                                    size="lg"
                                  onClick={handleFindRecruiter}
                                    disabled={recruitersLoading || (user?.credits ?? 0) < 15 || (!jobUrl.trim() && !jobDescription.trim())}
                                    className="w-full relative overflow-hidden"
                                  >
                                    <Users className="h-5 w-5 mr-2" />
                                    Find Recruiters
                                  <InlineLoadingBar isLoading={recruitersLoading} />
                                </Button>
                              </span>
                            </TooltipTrigger>
                              {(!jobUrl.trim() && !jobDescription.trim()) && (
                              <TooltipContent>
                                  <p>Please provide a job URL or job description first</p>
                              </TooltipContent>
                              )}
                              {(user?.credits ?? 0) < 15 && (
                              <TooltipContent>
                                <p>You need at least 15 credits. You have {user?.credits ?? 0}.</p>
                              </TooltipContent>
                              )}
                          </Tooltip>
                        </TooltipProvider>

                          <Button
                            variant="gradient"
                            size="lg"
                            onClick={() => {
                              setShowOptimizationModal(true);
                            }}
                            disabled={isOptimizing || (user?.credits ?? 0) < OPTIMIZATION_CREDIT_COST || (!jobUrl.trim() && !jobDescription.trim())}
                            className="w-full relative overflow-hidden"
                          >
                            <FileCheck className="h-5 w-5 mr-2" />
                            Optimize Resume
                            <InlineLoadingBar isLoading={isOptimizing} />
                          </Button>

                          <Button
                            variant="outline"
                            size="lg"
                        onClick={handleGenerateCoverLetter}
                            disabled={isGeneratingCoverLetter || (user?.credits ?? 0) < COVER_LETTER_CREDIT_COST || (!jobUrl.trim() && !jobDescription.trim())}
                            className="w-full relative overflow-hidden"
                          >
                            <FileText className="h-5 w-5 mr-2" />
                            Generate Cover Letter
                        <InlineLoadingBar isLoading={isGeneratingCoverLetter} />
                          </Button>
                    </div>
                        
                        {/* Number of Recruiters Selector */}
                        {hasJobInfo && (
                          <div className="flex items-center gap-3 pt-2 border-t border-border">
                            <label className="text-sm text-foreground flex items-center gap-2">
                              Number of recruiters to find:
                              <Select
                                value={maxRecruitersRequested.toString()}
                                onValueChange={(value) => setMaxRecruitersRequested(parseInt(value))}
                                disabled={recruitersLoading}
                              >
                                <SelectTrigger className="w-20 h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4, 5].map((num) => (
                                    <SelectItem key={num} value={num.toString()}>
                                      {num}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                            </div>
                          )}
                          </div>
                    </GlassCard>

                    {/* Error Display */}
                    {recruitersError && (
                      <div className="bg-destructive/10 border border-destructive text-destructive px-6 py-3 rounded-lg">
                        {recruitersError}
                            </div>
                    )}
                      
                      {/* Show drafts created notification */}
                      {draftsCreated.length > 0 && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                          <div className="flex items-center gap-2">
                            <Mail className="h-5 w-5 text-green-600" />
                            <div className="flex-1">
                              <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                                {draftsCreated.length} email draft{draftsCreated.length > 1 ? 's' : ''} created in your Gmail!
                              </p>
                              <a 
                                href="https://mail.google.com/mail/u/0/#drafts"
                                target="_blank"
                              rel="noopener,noreferrer"
                                className="text-sm text-green-600 dark:text-green-400 hover:underline mt-1 inline-block"
                              >
                                Open Gmail Drafts →
                              </a>
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Recruiters Table */}
                    {recruiters.length > 0 && (
                      <GlassCard className="p-0 overflow-hidden">
                        <div className="bg-background border-b border-border/40 px-6 py-4">
                          <h3 className="text-xl font-bold flex items-center gap-2 text-foreground">
                            <Users className="w-6 h-6 text-primary" />
                            Found {recruiters.length} Recruiter{recruiters.length !== 1 ? 's' : ''}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            These recruiters have been automatically saved to your Recruiter Spreadsheet
                              </p>
                            </div>
                      <div className="w-full overflow-x-auto">
                        <div className="rounded-md border border-border bg-background/60 backdrop-blur-sm min-w-full">
                          <table className="w-full">
                            <thead className="bg-muted/50 sticky top-0 z-10">
                              <tr>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">First Name</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Name</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">LinkedIn</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="bg-background divide-y divide-border">
                              {recruiters.map((recruiter, index) => {
                                const emailData = recruiterEmails.find(e => e.to_email === recruiter.Email);
                                const draftData = draftsCreated.find(d => d.recruiter_email === recruiter.Email);
                                
                                return (
                                  <React.Fragment key={index}>
                                    <tr className="hover:bg-secondary/50">
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.FirstName}</td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.LastName}</td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        {recruiter.LinkedIn ? (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => window.open(normalizeLinkedInUrl(recruiter.LinkedIn), '_blank', 'noopener,noreferrer')}
                                            className="p-1 h-auto text-primary hover:text-primary/80 cursor-pointer"
                                            title="View LinkedIn"
                                          >
                                            <ExternalLink className="h-4 w-4 mr-1" />
                                            LinkedIn
                                          </Button>
                                        ) : (
                                          <span className="text-muted-foreground text-xs">No LinkedIn</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                                        {recruiter.Email && recruiter.Email !== "Not available" ? (
                                          <a href={`mailto:${recruiter.Email}`} className="text-primary hover:underline">
                                            {recruiter.Email}
                                          </a>
                                        ) : (
                                          <span className="text-muted-foreground text-xs">Not available</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.Title}</td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.Company}</td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        <div className="flex gap-2">
                                          {recruiter.LinkedIn && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => window.open(normalizeLinkedInUrl(recruiter.LinkedIn), '_blank', 'noopener,noreferrer')}
                                              className="h-8 w-8"
                                              title="View LinkedIn"
                                            >
                                              <Linkedin className="h-4 w-4" />
                                            </Button>
                                          )}
                                          {draftData?.draft_url ? (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => window.open(draftData.draft_url, '_blank')}
                                              className="h-8 w-8 text-green-600 hover:text-green-700"
                                              title="Open Email Draft"
                                            >
                                              <Mail className="h-4 w-4" />
                                            </Button>
                                          ) : recruiter.Email && recruiter.Email !== "Not available" ? (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              asChild
                                              className="h-8 w-8"
                                              title="Send Email"
                                            >
                                              <a href={`mailto:${recruiter.Email}`}>
                                                <Mail className="h-4 w-4" />
                                              </a>
                                            </Button>
                                          ) : null}
                                        </div>
                                      </td>
                                    </tr>
                                    {emailData && (
                                      <tr key={`email-${index}`} className="bg-muted/30">
                                          <td colSpan={7} className="px-4 py-3">
                                          <div className="space-y-2">
                                            <button
                                              onClick={() => setExpandedEmail(expandedEmail === index ? null : index)}
                                              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                              {expandedEmail === index ? (
                                                <>
                                                  <ChevronUp className="h-4 w-4" />
                                                  Hide email preview
                                                </>
                                              ) : (
                                                <>
                                                  <ChevronDown className="h-4 w-4" />
                                                  Preview email
                                                </>
                                              )}
                                            </button>
                                            
                                            {expandedEmail === index && (
                                              <div className="mt-2 p-3 bg-background rounded-lg border border-border text-sm">
                                                <p className="font-medium text-foreground mb-2">Subject: {emailData.subject}</p>
                                                <div className="text-muted-foreground whitespace-pre-wrap">
                                                  {emailData.plain_body}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        </div>
                      </GlassCard>
                    )}

                    {/* Cover Letter Display */}
                    {coverLetter && (
                      <GlassCard className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xl font-bold text-foreground">Cover Letter</h3>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyToClipboard(coverLetter.content, "Cover Letter")}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(coverLetter.content, "cover_letter.pdf")}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                                  </div>
                                </div>
                        <div className="bg-muted/50 rounded-lg border border-border p-4 max-h-96 overflow-y-auto">
                          <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                            {coverLetter.content}
                              </div>
                                  </div>
                      </GlassCard>
                    )}

                    {/* Optimized Resume Display */}
                    {optimizedResume && (
                      <GlassCard className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xl font-bold text-foreground">Optimized Resume</h3>
                          <ResumeActions
                            resumeData={optimizedResume}
                            resumeRef={resumeRef}
                          />
                                </div>
                        {optimizedResume.atsScore && (
                          <div className="mb-4">
                            <ATSScoreDisplay score={optimizedResume.atsScore} />
                              </div>
                        )}
                        <div className="bg-muted/50 rounded-lg border border-border p-4 max-h-96 overflow-y-auto">
                          <ResumeRenderer resume={optimizedResume} />
                                  </div>
                      </GlassCard>
                            )}
                          </div>
                        )}

                {/* RECRUITERS TAB CONTENT */}
                {activeTab === "recruiters" && (
                  <div className="w-full">
                    <RecruiterSpreadsheet />
                  </div>
                )}
                      </div>
                    )}
          </div>
        </div>
      </div>

      {/* Job Details Dialog */}
      <Dialog open={showJobDetails} onOpenChange={setShowJobDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedJob?.title}</DialogTitle>
            <DialogDescription>
              {selectedJob?.company} • {selectedJob?.location}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{selectedJob?.type}</Badge>
              {selectedJob?.remote && <Badge variant="outline">Remote</Badge>}
              {selectedJob?.salary && <Badge variant="outline">{selectedJob.salary}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedJob?.description}</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resume Optimization V2 Modal */}
      <ResumeOptimizationModal
        isOpen={showOptimizationModal}
        onClose={() => setShowOptimizationModal(false)}
        jobDescription={selectedJob?.description || jobDescription || ''}
        jobTitle={selectedJob?.title || parsedJobData?.title || ''}
        company={selectedJob?.company || parsedJobData?.company || ''}
        jobUrl={selectedJob?.url || jobUrl || ''}
        onSuggestionsReceived={(result) => {
          setSuggestionsResult(result);
          setShowSuggestionsView(true);
          // Refresh credits display
          if (result.creditsRemaining !== undefined && user) {
            updateCredits(result.creditsRemaining);
          }
        }}
        onTemplateRebuildReceived={(result) => {
          setTemplateRebuildResult(result);
          // Handle template rebuild - convert to OptimizedResume format for existing display
          if (result.structured_content) {
            const convertedResume: OptimizedResume = {
              name: result.structured_content.contact?.name,
              contact: result.structured_content.contact,
              Summary: result.structured_content.summary,
              Experience: result.structured_content.experience,
              Education: result.structured_content.education,
              Skills: result.structured_content.skills,
              Projects: result.structured_content.projects,
              atsScore: {
                overall: result.ats_score_estimate || 0,
                keywords: 0,
                formatting: 0,
                relevance: 0,
                suggestions: [],
              },
              keywordsAdded: result.keywords_added || [],
              sectionsOptimized: [],
            };
            setOptimizedResume(convertedResume);
          }
          // Refresh credits display
          if (result.creditsRemaining !== undefined && user) {
            updateCredits(result.creditsRemaining);
          }
        }}
      />

      {/* Suggestions View Modal */}
      {suggestionsResult && (
        <SuggestionsView
          result={suggestionsResult}
          isOpen={showSuggestionsView}
          onClose={() => {
            setShowSuggestionsView(false);
          }}
        />
      )}
    </SidebarProvider>
  );
};

export default JobBoardPage;