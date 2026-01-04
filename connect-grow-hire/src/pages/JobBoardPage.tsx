import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Briefcase,
  Sparkles,
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
  Wand2,
  CheckCircle2,
  Download,
  Copy,
  Link,
  Target,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  X,
  Zap,
  FileCheck,
  PenTool,
  AlertTriangle,
  Users,
  Linkedin,
  Mail,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PageHeaderActions } from "@/components/PageHeaderActions";
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
import { apiService, type OptimizeResumeRequest, type GenerateCoverLetterRequest, type Recruiter, type FindRecruiterRequest, type SuggestionsResult, type TemplateRebuildResult } from "@/services/api";
import { ResumeOptimizationModal } from '@/components/ResumeOptimizationModal';
import { SuggestionsView } from '@/components/SuggestionsView';
import { firebaseApi } from "../services/firebaseApi";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { CreditPill } from "@/components/credits";
import { cn } from "@/lib/utils";
import { InlineLoadingBar } from "@/components/ui/LoadingBar";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ResumeRenderer from "@/components/ResumeRenderer";
import ResumeActions from "@/components/ResumeActions";
import ResumeRendererSkeleton from "@/components/ResumeRendererSkeleton";
import "@/components/ResumeRenderer.css";

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
}> = ({ job, isSelected, isSaved, onSelect, onSave, onApply }) => (
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

    <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
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

  // Tab State
  const [activeTab, setActiveTab] = useState<string>(searchParams.get("tab") || "jobs");

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
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [optimizedResume, setOptimizedResume] = useState<OptimizedResume | null>(null);
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(null);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [recruitersLoading, setRecruitersLoading] = useState(false);
  const [recruitersError, setRecruitersError] = useState<string | null>(null);
  const [recruitersCount, setRecruitersCount] = useState(0);
  const [recruitersHasMore, setRecruitersHasMore] = useState(false);
  const [recruitersMoreAvailable, setRecruitersMoreAvailable] = useState(0);
  const [recruiterEmails, setRecruiterEmails] = useState<any[]>([]);
  const [draftsCreated, setDraftsCreated] = useState<any[]>([]);
  const [maxRecruitersRequested, setMaxRecruitersRequested] = useState<number>(2);
  const [lastSearchResult, setLastSearchResult] = useState<{requestedCount: number; foundCount: number; creditsCharged: number; error?: string} | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [checkingGmail, setCheckingGmail] = useState(false);
  const [parsedJobData, setParsedJobData] = useState<{title?: string; company?: string; location?: string; description?: string} | null>(null);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const resumeRef = useRef<HTMLDivElement>(null);

  // Resume optimization V2 state
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);
  const [suggestionsResult, setSuggestionsResult] = useState<SuggestionsResult | null>(null);
  const [showSuggestionsView, setShowSuggestionsView] = useState(false);
  const [templateRebuildResult, setTemplateRebuildResult] = useState<TemplateRebuildResult | null>(null);

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

  // Fetch jobs - backend returns up to 200 jobs on first page
  useEffect(() => {
    const fetchJobs = async () => {
      if (!user?.uid || !userPreferences) return;
      setLoadingJobs(true);
      try {
        // Backend fetches up to 200 jobs on page 1, so just request page 1
        const response = await apiService.getJobListings({
          jobTypes: userPreferences.jobTypes || ["Internship"],
          industries: userPreferences.industries || [],
          locations: userPreferences.locations || [],
          page: 1,
          perPage: 200, // Request more jobs per page
        });
        
        if (response.jobs && response.jobs.length > 0) {
          setJobs(response.jobs);
          console.log(`[JobBoard] Loaded ${response.jobs.length} jobs`);
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
  }, [user?.uid, userPreferences]);

  // Load saved jobs from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("offerloop_saved_jobs");
    if (saved) setSavedJobs(new Set(JSON.parse(saved)));
  }, []);

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

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    const matchesSearch = !searchQuery || 
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedJobType === "all" || job.type === selectedJobType;
    return matchesSearch && matchesType;
  });

  // Sort jobs
  const sortedJobs = useMemo(() => {
    const filtered = [...filteredJobs];
    
    switch (sortBy) {
      case "match":
        return filtered.sort((a, b) => {
          // Sort by matchScore (descending), fallback to combinedScore
          const scoreA = a.matchScore ?? a.combinedScore ?? 0;
          const scoreB = b.matchScore ?? b.combinedScore ?? 0;
          return scoreB - scoreA;
        });
      case "date":
        return filtered.sort((a, b) => {
          // Sort by recency (ascending - lower days = more recent)
          const daysA = parsePostedDate(a.posted);
          const daysB = parsePostedDate(b.posted);
          return daysA - daysB;
        });
      case "company":
        return filtered.sort((a, b) => a.company.localeCompare(b.company));
      default:
        return filtered;
    }
  }, [filteredJobs, sortBy]);

  // Pagination
  const totalPages = Math.ceil(sortedJobs.length / JOBS_PER_PAGE);
  const paginatedJobs = sortedJobs.slice(
    (currentPage - 1) * JOBS_PER_PAGE,
    currentPage * JOBS_PER_PAGE
  );

  // Handlers
  const handleSaveJob = useCallback((jobId: string) => {
    setSavedJobs((prev) => {
      const newSaved = new Set(prev);
      if (newSaved.has(jobId)) {
        newSaved.delete(jobId);
        toast({ title: "Job removed from saved" });
      } else {
        newSaved.add(jobId);
        toast({ title: "Job saved!" });
      }
      localStorage.setItem("offerloop_saved_jobs", JSON.stringify([...newSaved]));
      return newSaved;
    });
  }, []);

  const handleSelectJobForOptimization = useCallback((job: Job) => {
    setSelectedJob(job);
    setJobUrl(job.url);
    setJobDescription(job.description);
    setActiveTab("optimize");
    setOptimizedResume(null);
    setCoverLetter(null);
    // Scroll to top of optimize tab to show the Find Recruiters section
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  }, []);

  const handleApplyToJob = useCallback((job: Job) => {
    window.open(job.url, "_blank", "noopener,noreferrer");
  }, []);

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

  const handleOptimizeResume = async () => {
    if (!user?.uid) return;
    if ((user?.credits ?? 0) < OPTIMIZATION_CREDIT_COST) {
      toast({ title: "Insufficient Credits", description: `You need ${OPTIMIZATION_CREDIT_COST} credits.`, variant: "destructive" });
      return;
    }
    if (!jobUrl && !jobDescription) {
      toast({ title: "Job Information Required", variant: "destructive" });
      return;
    }

    setIsOptimizing(true);
    try {
      // Only send jobTitle and company if we have a selectedJob AND no URL
      // If URL is provided, let the backend parse it fresh and use that data
      const requestPayload: OptimizeResumeRequest = {
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
      
      // Use v2 endpoint (format-preserving)
      const pdfBlob = await apiService.optimizeResumeV2(requestPayload);
      
      // Download the PDF
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'optimized_resume.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Update credits (deduct 20)
      const currentCredits = user?.credits ?? 0;
      await updateCredits(Math.max(0, currentCredits - OPTIMIZATION_CREDIT_COST));
      
      toast({ 
        title: "Resume Optimized!", 
        description: "Your optimized resume has been downloaded. Original formatting preserved!",
        duration: 5000,
      });
      
      // Clear any old optimized resume state since we're not showing it inline anymore
      setOptimizedResume(null);
      
    } catch (error: any) {
      // Handle error responses
      let errorMessage = "Optimization failed";
      let creditsRefunded = false;
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data) {
        const errorData = error.response.data;
        errorMessage = errorData.message || errorData.error || errorMessage;
        creditsRefunded = errorData.credits_refunded || false;
      }
      
      // Show appropriate error message
      if (creditsRefunded) {
        toast({ 
          title: errorMessage, 
          description: "Don't worry, your credits have been refunded.",
          variant: "destructive",
          duration: 5000,
        });
      } else {
        toast({ 
          title: "Optimization Failed", 
          description: errorMessage,
          variant: "destructive",
        });
      }
      
      // If URL is not supported, suggest using job description instead
      if (errorCode === "url_not_supported" || errorCode === "url_parse_failed") {
        // Job description textarea is already visible, user can paste there
      }
    } finally {
      setIsOptimizing(false);
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
        }
      } catch (error) {
        console.error('Error parsing job URL:', error);
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
        
        const draftMessage = response.draftsCreated && response.draftsCreated.length > 0
          ? ` ${response.draftsCreated.length} email draft${response.draftsCreated.length > 1 ? 's' : ''} created in Gmail!`
          : '';
        toast({
          title: "Found Fewer Than Requested",
          description: `Found ${foundCount} of ${requestedCount} requested recruiters (${response.creditsCharged} credits used). We couldn't find more matches for this job — try broadening the job title or company criteria.${draftMessage}`,
          variant: "default"
        });
        // Switch to recruiters tab to show results
        setActiveTab("recruiters");
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
        
        const draftMessage = response.draftsCreated && response.draftsCreated.length > 0
          ? ` ${response.draftsCreated.length} email draft${response.draftsCreated.length > 1 ? 's' : ''} created in Gmail!`
          : '';
        toast({
          title: "Recruiters Found!",
          description: `Found ${foundCount} recruiter${foundCount !== 1 ? 's' : ''} (${response.creditsCharged} credits used).${draftMessage}`,
          variant: "default"
        });
        // Switch to recruiters tab to show results
        setActiveTab("recruiters");
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

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded!" });
  };

  // Helper to normalize resume data from API response
  const normalizeResumeData = (data: any): any => {
    // Handle both 'Summary' and 'summary', 'Experience' and 'experience', etc.
    // If it has content field, it's the old format (text), return as-is
    if (data.content && typeof data.content === 'string') {
      return data.content;
    }
    
    // Otherwise, normalize JSON format
    return {
      name: data.name || data.Name,
      contact: data.contact || data.Contact,
      Summary: data.Summary || data.summary,
      Experience: data.Experience || data.experience,
      Education: data.Education || data.education,
      Skills: data.Skills || data.skills,
      Projects: data.Projects || data.projects,
      Extracurriculars: data.Extracurriculars || data.extracurriculars,
    };
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
      <div className="flex h-screen bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div>
                  <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-primary" />
                    Job Board
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Discover opportunities and optimize your applications
                  </p>
                </div>
              </div>
              <PageHeaderActions />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="w-full p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-3 max-w-md">
                  <TabsTrigger value="jobs" className="flex items-center gap-2">
                    {userPreferences?.jobTypes?.includes("Internship") ? "Internships" : "Jobs"}
                  </TabsTrigger>
                  <TabsTrigger value="optimize" className="flex items-center gap-2">
                    Optimize
                  </TabsTrigger>
                  <TabsTrigger value="recruiters" className="flex items-center gap-2">
                    Recruiters
                    {recruiters.length > 0 && (
                      <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                        {recruiters.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* JOBS TAB */}
                <TabsContent value="jobs" className="space-y-6">
                  {/* Filters */}
                  <GlassCard className="p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search jobs, companies, locations..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>
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
                            onSelect={() => handleSelectJobForOptimization(job)}
                            onSave={() => handleSaveJob(job.id)}
                            onApply={() => handleApplyToJob(job)}
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
                </TabsContent>

                {/* OPTIMIZE TAB */}
                <TabsContent value="optimize" className="w-full">
                  <div className="max-w-3xl mx-auto p-6 space-y-6">
                    {/* Job Header - Inline, not boxed */}
                        {selectedJob && (
                      <div className="flex items-start justify-between pb-4 border-b border-gray-200">
                              <div>
                          <h2 className="text-lg font-semibold text-gray-900 leading-tight">
                            {selectedJob.title}
                          </h2>
                          <p className="text-sm text-gray-500 mt-0.5">
                                  {selectedJob.company} • {selectedJob.location}
                                </p>
                              </div>
                        <button
                          onClick={() => { setSelectedJob(null); setJobUrl(""); setJobDescription(""); }}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                                <X className="w-4 h-4" />
                        </button>
                          </div>
                        )}

                    {/* Job Information - Compact */}
                    <div className="space-y-4">
                          <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                          Job URL
                        </label>
                              <Input
                          type="url"
                          placeholder="https://..."
                                value={jobUrl}
                                onChange={(e) => {
                                  const newUrl = e.target.value;
                                  setJobUrl(newUrl);
                                  if (newUrl && newUrl.trim() !== "") {
                                    setSelectedJob(null);
                                    setJobDescription("");
                                  }
                                }}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg hover:border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors outline-none"
                              />
                          </div>

                      <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-gray-200" />
                            </div>
                            <div className="relative flex justify-center text-xs">
                          <span className="bg-white px-2 text-gray-400">or</span>
                            </div>
                          </div>

                          <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                          Description
                        </label>
                            <Textarea
                          placeholder="Paste job description..."
                              value={jobDescription}
                              onChange={(e) => {
                                const newDescription = e.target.value;
                                setJobDescription(newDescription);
                                if (newDescription && newDescription.trim() !== "") {
                                  setSelectedJob(null);
                                  setJobUrl("");
                                }
                              }}
                          rows={6}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg hover:border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors outline-none resize-none"
                            />
                          </div>
                        </div>

                    {/* Find Recruiters - Subtle, inline */}
                    <div className="py-4 border-t border-gray-100">
                      <div className="flex items-center justify-end gap-3">
                        <label className="text-sm text-gray-600 flex items-center gap-2">
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  disabled={!hasJobInfo || recruitersLoading || (user?.credits ?? 0) < 15}
                                  onClick={handleFindRecruiter}
                                  variant={undefined}
                                  className={`
                                    relative overflow-hidden text-sm px-4 py-2 rounded-lg font-medium transition-colors
                                    ${hasJobInfo && !recruitersLoading && (user?.credits ?? 0) >= 15
                                      ? '!bg-blue-600 !text-white hover:!bg-blue-700 active:!bg-blue-800 focus-visible:!ring-blue-600' 
                                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }
                                  `}
                                  style={hasJobInfo && !recruitersLoading && (user?.credits ?? 0) >= 15 ? { 
                                    backgroundColor: '#2563eb',
                                    color: '#ffffff'
                                  } : undefined}
                                >
                                  {recruitersLoading ? 'Finding...' : 'Find Recruiters'}
                                  <InlineLoadingBar isLoading={recruitersLoading} />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!hasJobInfo ? (
                              <TooltipContent>
                                <p>Enter a job URL or description to find recruiters</p>
                              </TooltipContent>
                            ) : (user?.credits ?? 0) < 15 ? (
                              <TooltipContent>
                                <p>You need at least 15 credits. You have {user?.credits ?? 0}.</p>
                              </TooltipContent>
                            ) : null}
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>

                    {/* Recruiter Preview - Inline when available */}
                    {recruiters.length > 0 && (
                      <div className="border-t border-gray-100 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-900">
                            {recruiters.length} recruiter{recruiters.length !== 1 ? 's' : ''} found
                          </span>
                          <button
                            onClick={() => setActiveTab("recruiters")}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
                          >
                            View all
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                        <div className="space-y-1">
                          {recruiters.slice(0, 3).map((recruiter, index) => {
                            const initials = `${recruiter.FirstName?.[0] || ''}${recruiter.LastName?.[0] || ''}`.toUpperCase();
                            const hasEmail = recruiter.Email && recruiter.Email !== "Not available";
                            return (
                              <div
                                key={index}
                                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
                                onClick={() => setActiveTab("recruiters")}
                              >
                                <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
                                  {initials || '—'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {recruiter.FirstName} {recruiter.LastName}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">{recruiter.Title}</p>
                                </div>
                                {hasEmail ? (
                                  <div className="flex items-center gap-1 text-green-600 flex-shrink-0">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    <span className="text-xs">Email ready</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400 flex-shrink-0">No email</span>
                                )}
                                <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            );
                          })}
                        </div>
                        {recruitersHasMore && (
                          <p className="text-xs text-gray-500 mt-2">
                            {recruitersMoreAvailable} more available ({recruitersMoreAvailable * 15} credits)
                          </p>
                        )}
                      </div>
                    )}

                    {/* Tab Selection - Segmented Control Style */}
                    <div className="border-t border-gray-100 pt-4">
                      <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <button
                        onClick={() => setShowOptimizationModal(true)}
                        disabled={(!jobUrl && !jobDescription)}
                        className={cn(
                          "flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative",
                          (!jobUrl && !jobDescription)
                            ? 'bg-white text-gray-400 cursor-not-allowed'
                            : optimizedResume
                            ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        <>
                          <Sparkles className="w-3 h-3 mr-1.5 inline" />
                          Resume
                          <span className={`ml-1.5 ${optimizedResume ? 'text-blue-500' : 'text-gray-400'}`}>
                            ({OPTIMIZATION_CREDIT_COST})
                          </span>
                        </>
                      </button>
                      <button
                        onClick={handleGenerateCoverLetter}
                        disabled={isGeneratingCoverLetter || (!jobUrl && !jobDescription)}
                        className={`
                          relative overflow-hidden flex-1 px-4 py-2.5 text-sm font-medium transition-colors
                          ${isGeneratingCoverLetter
                            ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600 cursor-wait'
                            : (!jobUrl && !jobDescription)
                            ? 'bg-white text-gray-400 cursor-not-allowed'
                            : coverLetter
                            ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                          }
                        `}
                      >
                        {isGeneratingCoverLetter ? (
                          'Generating...'
                        ) : (
                          <>
                            Cover Letter
                            <span className={`ml-1.5 ${coverLetter ? 'text-blue-500' : 'text-gray-400'}`}>
                              ({COVER_LETTER_CREDIT_COST})
                            </span>
                          </>
                        )}
                        <InlineLoadingBar isLoading={isGeneratingCoverLetter} />
                      </button>
                      </div>
                    </div>
                        
                    {/* Results Section */}
                        {isOptimizing && <ResumeRendererSkeleton />}

                        {optimizedResume && (
                      <div className="space-y-4 border-t border-gray-200 pt-6">
                        <ATSScoreDisplay score={optimizedResume.atsScore} />
                        
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-900">Optimized Resume</h3>
                              <ResumeActions 
                                resumeData={optimizedResume}
                                resumeRef={resumeRef}
                                className="no-print"
                              />
                            </div>
                            {optimizedResume.keywordsAdded.length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs text-gray-500 mb-1.5">Keywords added</p>
                              <div className="flex flex-wrap gap-1.5">
                                  {optimizedResume.keywordsAdded.map((kw, i) => (
                                  <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                                    + {kw}
                                  </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          <div ref={resumeRef} className="border border-gray-200 rounded-md overflow-hidden bg-white">
                              <ResumeRenderer 
                                resume={normalizeResumeData(optimizedResume)}
                                className="theme-classic"
                              />
                          </div>
                            </div>
                          </div>
                        )}

                        {coverLetter && (
                      <div className="border-t border-gray-200 pt-6">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-gray-900">Cover Letter</h3>
                            <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyToClipboard(coverLetter.content, "Cover letter")}
                              className="h-7 px-2 text-gray-600 hover:text-gray-900"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(coverLetter.content, "cover-letter.txt")}
                              className="h-7 px-2 text-gray-600 hover:text-gray-900"
                            >
                              <Download className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                          {coverLetter.highlights.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs text-gray-500 mb-1.5">Highlights</p>
                            <div className="flex flex-wrap gap-1.5">
                                {coverLetter.highlights.map((h, i) => (
                                <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                                  {h}
                                </span>
                                ))}
                              </div>
                            </div>
                          )}
                        <div className="bg-gray-50 rounded-md p-4 max-h-96 overflow-y-auto border border-gray-200">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{coverLetter.content}</p>
                          </div>
                          </div>
                        )}

                    {/* Status Footer - Subtle */}
                    <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-4">
                        <span>{user?.credits ?? 0} / {user?.maxCredits ?? 300} credits</span>
                        {gmailConnected && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Gmail connected
                          </span>
                        )}
                        {!gmailConnected && !checkingGmail && (
                          <button
                            onClick={async () => {
                              try {
                                const { getAuth } = await import('firebase/auth');
                                const auth = getAuth();
                                const firebaseUser = auth.currentUser;
                                
                                if (!firebaseUser) {
                                  toast({
                                    title: "Authentication Required",
                                    description: "Please sign in to connect Gmail.",
                                    variant: "destructive"
                                  });
                                  return;
                                }
                                
                                const token = await firebaseUser.getIdToken();
                                const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";
                                
                                const response = await fetch(`${API_BASE_URL}/api/google/oauth/start?t=${Date.now()}`, {
                                  headers: { 
                                    'Authorization': `Bearer ${token}`,
                                    'Cache-Control': 'no-cache'
                                  },
                                  credentials: 'include',
                                  mode: 'cors'
                                });
                                
                                if (!response.ok) {
                                  throw new Error('Failed to start OAuth');
                                }
                                
                                const data = await response.json();
                                if (data.authUrl) {
                                  window.location.href = data.authUrl;
                                }
                              } catch (error: any) {
                                toast({
                                  title: "Error",
                                  description: error.message || "Failed to connect Gmail. Please try again.",
                                  variant: "destructive"
                                });
                              }
                            }}
                            className="hover:text-gray-700 transition-colors"
                          >
                            Connect Gmail
                          </button>
                        )}
                        {checkingGmail && (
                          <span className="flex items-center gap-2">
                            <div className="w-12 h-0.5 bg-blue-100 rounded-full overflow-hidden">
                              <div className="h-full w-full bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600 bg-[length:200%_100%] animate-loading-shimmer" />
                            </div>
                            <span className="text-xs">Checking...</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* RECRUITERS TAB */}
                <TabsContent value="recruiters" className="w-full -mx-6">
                  <div className="w-full h-full">
                    <div className="bg-background border-b border-border/40 px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
                            <Users className="w-6 h-6 text-primary" />
                            Recruiters Library
                          </h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            {recruiters.length > 0 
                              ? `${recruiters.length} recruiter${recruiters.length !== 1 ? 's' : ''} found`
                              : 'No recruiters found yet. Use "Find Recruiters" in the Optimize tab to search.'}
                          </p>
                        </div>
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
                                rel="noopener noreferrer"
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

                    {recruiters.length === 0 ? (
                      <div className="flex items-center justify-center h-[calc(100vh-300px)]">
                        <div className="text-center">
                          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                          <p className="text-muted-foreground text-lg">
                            No recruiters in your library yet.
                          </p>
                          <p className="text-muted-foreground mt-2 text-sm">
                            Select a job and click "Find Recruiters" in the Optimize tab to get started.
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
                        
                        {/* Inline Alert for Search Results */}
                        {lastSearchResult && (
                          <div className="mt-4 px-6">
                            {lastSearchResult.error ? (
                              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                                  <div>
                                    <p className="text-sm font-medium text-red-900 dark:text-red-200">
                                      Error
                                    </p>
                                    <p className="text-sm text-red-800 dark:text-red-300 mt-1">
                                      Something went wrong. No credits were charged.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : lastSearchResult.foundCount === 0 ? (
                              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
                                  <div>
                                    <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                                      No Recruiters Found
                                    </p>
                                    <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
                                      No recruiters found matching this job. Try a different job title or company. No credits were charged.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : lastSearchResult.foundCount < lastSearchResult.requestedCount ? (
                              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                                  <div>
                                    <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                                      Found Fewer Than Requested
                                    </p>
                                    <p className="text-sm text-yellow-800 dark:text-yellow-300 mt-1">
                                      Found {lastSearchResult.foundCount} of {lastSearchResult.requestedCount} requested recruiters ({lastSearchResult.creditsCharged} credits used). We couldn't find more matches for this job — try broadening the job title or company criteria.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                <div className="flex items-start gap-2">
                                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                                  <div>
                                    <p className="text-sm font-medium text-green-900 dark:text-green-200">
                                      Success
                                    </p>
                                    <p className="text-sm text-green-800 dark:text-green-300 mt-1">
                                      Found {lastSearchResult.foundCount} recruiter{lastSearchResult.foundCount !== 1 ? 's' : ''} ({lastSearchResult.creditsCharged} credits used).
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
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

