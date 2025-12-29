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
  Loader2,
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
import { apiService, type OptimizeResumeRequest, type GenerateCoverLetterRequest, type Recruiter, type FindRecruiterRequest } from "@/services/api";
import { firebaseApi } from "../services/firebaseApi";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { CreditPill } from "@/components/credits";
import { cn } from "@/lib/utils";
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
        <Sparkles className="w-4 h-4 mr-2" />
        Optimize
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
    <div className="bg-background/80 backdrop-blur-sm rounded-lg border border-border/60 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          ATS Score Analysis
        </h3>
        <div className={cn("text-3xl font-bold", getScoreColor(score.overall))}>
          {score.overall}%
        </div>
      </div>

      <div className="space-y-4">
        {[
          { label: "Keywords Match", value: score.keywords },
          { label: "Formatting", value: score.formatting },
          { label: "Job Relevance", value: score.relevance },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">{label}</span>
              <span className={getScoreColor(value)}>{value}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", getProgressColor(value))}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}

        {/* Job Description Quality Warning */}
        {score.jdQualityWarning && (
          <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {score.jdQualityWarning}
              </p>
            </div>
          </div>
        )}

        {score.suggestions.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              Improvement Suggestions
            </h4>
            <ul className="space-y-2">
              {score.suggestions.map((suggestion, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  {suggestion}
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
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [checkingGmail, setCheckingGmail] = useState(false);
  const [parsedJobData, setParsedJobData] = useState<{title?: string; company?: string; location?: string; description?: string} | null>(null);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const resumeRef = useRef<HTMLDivElement>(null);

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
      
      const response = await apiService.optimizeResume(requestPayload);
      if (response.optimizedResume) {
        setOptimizedResume(response.optimizedResume);
        // Backend already deducted credits, just update with the remaining balance
        if (response.creditsRemaining !== undefined) {
          await updateCredits(response.creditsRemaining);
        }
        toast({ title: "Resume Optimized!", description: `ATS Score: ${response.optimizedResume.atsScore.overall}%` });
      }
    } catch (error: any) {
      // Handle improved error responses
      const errorResponse = error.response?.data || error;
      const errorCode = errorResponse.error_code || errorResponse.error?.error_code;
      const errorMessage = errorResponse.message || errorResponse.error?.message || error.message || "Optimization failed";
      const creditsRefunded = errorResponse.credits_refunded || errorResponse.error?.credits_refunded || false;
      
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
    
    // Priority 1: Parse job URL if provided
    if (jobUrl && jobUrl.trim()) {
      try {
        const parseResponse = await apiService.parseJobUrl({ url: jobUrl });
        if (parseResponse.job && parseResponse.job.company) {
          company = parseResponse.job.company;
          jobTitle = parseResponse.job.title || '';
          location = parseResponse.job.location || '';
          description = parseResponse.job.description || jobDescription || '';
        } else if (parseResponse.error) {
          console.warn('Failed to parse job URL:', parseResponse.error);
        }
      } catch (error) {
        console.error('Error parsing job URL:', error);
      }
    }
    
    // Priority 2: Use selectedJob from job board
    if (!company && selectedJob?.company) {
      company = selectedJob.company;
      jobTitle = selectedJob.title || '';
      location = selectedJob.location || '';
      description = jobDescription || '';
    }
    
    // Priority 3: Don't try to extract company from description on frontend
    // Let the backend handle all extraction via OpenAI (more reliable)
    // Just ensure we have a job description to send
    if (!description && jobDescription) {
      description = jobDescription;
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
        jobUrl: jobUrl || undefined  // Pass jobUrl as fallback for backend parsing
      });
      
      if (response.error) {
        setRecruitersError(response.error);
        toast({
          title: "Error Finding Recruiters",
          description: response.error,
          variant: "destructive"
        });
      } else if (response.recruiters.length === 0) {
        setRecruitersError(response.message || "No recruiters found at this company.");
        setRecruitersCount(0);
        setRecruitersHasMore(false);
        toast({
          title: "No Recruiters Found",
          description: response.message || "Try reaching out via LinkedIn.",
        });
      } else {
        setRecruiters(response.recruiters);
        setRecruitersCount(response.totalFound || response.recruiters.length);
        setRecruitersHasMore(response.hasMore || false);
        setRecruitersMoreAvailable(response.moreAvailable || 0);
        setRecruiterEmails(response.emails || []);
        setDraftsCreated(response.draftsCreated || []);
        if (response.creditsRemaining !== undefined) {
          await updateCredits(response.creditsRemaining);
        }
        
        // Show success message
        const draftMessage = response.draftsCreated && response.draftsCreated.length > 0
          ? ` ${response.draftsCreated.length} email draft${response.draftsCreated.length > 1 ? 's' : ''} created in Gmail!`
          : '';
        toast({
          title: "Recruiters Found!",
          description: `Found ${response.recruiters.length} recruiter(s). ${response.creditsCharged} credits used.${draftMessage} ${response.hasMore ? `${response.moreAvailable} more available.` : ''}`,
        });
        // Switch to recruiters tab to show results
        setActiveTab("recruiters");
      }
    } catch (error: any) {
      setRecruitersError(error.message || "Failed to find recruiters");
      toast({
        title: "Error",
        description: error.message || "Failed to find recruiters",
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
      <div className="flex h-screen bg-white">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b border-border/50 bg-white">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <h1 className="text-xl font-semibold text-foreground">
                  Job Board
                </h1>
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
                    <Briefcase className="w-4 h-4" />
                    {userPreferences?.jobTypes?.includes("Internship") ? "Internships" : "Jobs"}
                  </TabsTrigger>
                  <TabsTrigger value="optimize" className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Optimize
                  </TabsTrigger>
                  <TabsTrigger value="recruiters" className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Recruiters
                    {recruiters.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                        {recruiters.length}
                      </Badge>
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
                  {/* Unified workspace container with neutral background */}
                  <div className="bg-gradient-to-br from-slate-50/50 via-background to-slate-50/30 rounded-xl border border-border/50 shadow-sm p-6 lg:p-8">
                    {/* Two-column layout - always visible */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                      {/* Left: Input Section */}
                      <div className="space-y-6 min-w-0">
                      {/* Job Information Section */}
                      <div className="bg-background/80 backdrop-blur-sm rounded-lg border border-border/40 p-8 shadow-lg shadow-black/5">
                        <h2 className="text-xl font-bold mb-6 flex items-center gap-2.5 text-foreground">
                          <FileText className="w-6 h-6 text-primary" />
                          Job Information
                        </h2>

                        {selectedJob && (
                          <div className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-semibold text-foreground">{selectedJob.title}</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {selectedJob.company} • {selectedJob.location}
                                </p>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedJob(null); setJobUrl(""); setJobDescription(""); }}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-6">
                          <div>
                            <label className="text-sm font-semibold mb-2.5 block text-foreground">Job Posting URL</label>
                            <div className="relative">
                              <Link className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                              <Input
                                placeholder="https://linkedin.com/jobs/..."
                                value={jobUrl}
                                onChange={(e) => {
                                  const newUrl = e.target.value;
                                  setJobUrl(newUrl);
                                  // When URL changes, clear old job data to prevent stale data from being sent
                                  // This ensures only the new URL is sent to the backend for parsing
                                  if (newUrl && newUrl.trim() !== "") {
                                    setSelectedJob(null);
                                    setJobDescription("");
                                  }
                                }}
                                className="pl-10 border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                              />
                            </div>
                          </div>

                          <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                              <span className="w-full border-t border-border/40" />
                            </div>
                            <div className="relative flex justify-center text-xs">
                              <span className="bg-background/80 backdrop-blur-sm px-3 text-muted-foreground font-medium">or paste job description</span>
                            </div>
                          </div>

                          <div>
                            <label className="text-sm font-semibold mb-2.5 block text-foreground">Job Description</label>
                            <Textarea
                              placeholder="Paste the job description here..."
                              value={jobDescription}
                              onChange={(e) => {
                                const newDescription = e.target.value;
                                setJobDescription(newDescription);
                                // When description is manually changed, clear selectedJob and URL
                                // This ensures manual description takes precedence
                                if (newDescription && newDescription.trim() !== "") {
                                  setSelectedJob(null);
                                  setJobUrl("");
                                }
                              }}
                              rows={10}
                              className="border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-y"
                            />
                          </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-border/50 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Your Credits</span>
                            <div className="flex items-center gap-2">
                              <Zap className="w-4 h-4 text-primary" />
                              <span className="text-sm font-semibold tabular-nums text-foreground">
                                {user?.credits ?? 0} / {user?.maxCredits ?? 300}
                              </span>
                              <span className="text-xs text-muted-foreground">credits</span>
                            </div>
                          </div>
                          
                          {/* Gmail Connection Status */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Gmail</span>
                            {checkingGmail ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Checking...
                              </div>
                            ) : gmailConnected ? (
                              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                                <Mail className="w-3 h-3" />
                                Connected
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
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
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                              >
                                <Mail className="w-3 h-3 mr-1.5" />
                                Connect
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons - Segmented Control Style */}
                      <div className="space-y-3">
                        <div className="bg-muted/30 rounded-lg p-1 border border-border/50 inline-flex gap-1 w-full">
                          <Button
                            variant="gradient"
                            size="lg"
                            onClick={handleOptimizeResume}
                            disabled={isOptimizing || (!jobUrl && !jobDescription)}
                            className="flex-1 relative overflow-hidden group transition-all hover:scale-[1.02]"
                          >
                            {isOptimizing ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Optimizing...
                              </>
                            ) : (
                              <>
                                <FileCheck className="w-4 h-4 mr-2" />
                                <span className="font-semibold">Optimize Resume</span>
                                <Badge variant="secondary" className="ml-2 bg-background/50 text-xs font-medium px-2 py-0.5">
                                  {OPTIMIZATION_CREDIT_COST}
                                </Badge>
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="lg"
                            onClick={handleGenerateCoverLetter}
                            disabled={isGeneratingCoverLetter || (!jobUrl && !jobDescription)}
                            className="flex-1 relative overflow-hidden group transition-all hover:scale-[1.02] hover:bg-background/50"
                          >
                            {isGeneratingCoverLetter ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <PenTool className="w-4 h-4 mr-2" />
                                <span className="font-semibold">Cover Letter</span>
                                <Badge variant="secondary" className="ml-2 bg-background/50 text-xs font-medium px-2 py-0.5">
                                  {COVER_LETTER_CREDIT_COST}
                                </Badge>
                              </>
                            )}
                          </Button>
                        </div>
                        
                        {/* Find Recruiters Button - visible when job URL, description, or selected job is available */}
                        {(selectedJob || jobUrl || jobDescription) && (
                          <Button
                            variant="outline"
                            size="lg"
                            onClick={handleFindRecruiter}
                            disabled={recruitersLoading || (user?.credits ?? 0) < 15}
                            className="w-full relative overflow-hidden group transition-all hover:scale-[1.02] hover:bg-blue-50 dark:hover:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                          >
                            {recruitersLoading ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Finding Recruiters...
                              </>
                            ) : (
                              <>
                                <Users className="w-4 h-4 mr-2 text-blue-600" />
                                <span className="font-semibold text-blue-600 dark:text-blue-400">Find Recruiters</span>
                                <Badge variant="secondary" className="ml-2 bg-background/50 text-xs font-medium px-2 py-0.5">
                                  15+ credits
                                </Badge>
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                      {/* Right: Results or Tips Panel */}
                      <div className="space-y-6 min-w-0">
                        {/* Show results if available */}
                        {isOptimizing && <ResumeRendererSkeleton />}
                        {optimizedResume && <ATSScoreDisplay score={optimizedResume.atsScore} />}

                        {optimizedResume && (
                          <div className="bg-background/80 backdrop-blur-sm rounded-lg border border-border/60 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-lg font-semibold flex items-center gap-2">
                                <FileCheck className="w-5 h-5 text-green-500" />
                                Optimized Resume
                              </h3>
                              <ResumeActions 
                                resumeData={optimizedResume}
                                resumeRef={resumeRef}
                                className="no-print"
                              />
                            </div>
                            {optimizedResume.keywordsAdded.length > 0 && (
                              <div className="mb-4">
                                <p className="text-sm text-muted-foreground mb-2">Keywords added:</p>
                                <div className="flex flex-wrap gap-2">
                                  {optimizedResume.keywordsAdded.map((kw, i) => (
                                    <Badge key={i} variant="outline">+ {kw}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div ref={resumeRef} className="border rounded-lg shadow-sm overflow-hidden bg-white">
                              <ResumeRenderer 
                                resume={normalizeResumeData(optimizedResume)}
                                className="theme-classic"
                              />
                            </div>
                          </div>
                        )}

                        {coverLetter && (
                          <div className="bg-background/80 backdrop-blur-sm rounded-lg border border-border/60 p-6 shadow-sm">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                              <PenTool className="w-5 h-5 text-primary" />
                              Cover Letter
                            </h3>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleCopyToClipboard(coverLetter.content, "Cover letter")}>
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDownload(coverLetter.content, "cover-letter.txt")}>
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          {coverLetter.highlights.length > 0 && (
                            <div className="mb-4">
                              <p className="text-sm text-muted-foreground mb-2">Key highlights:</p>
                              <div className="flex flex-wrap gap-2">
                                {coverLetter.highlights.map((h, i) => (
                                  <Badge key={i} variant="secondary">{h}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="bg-muted/50 rounded-lg p-4 max-h-64 overflow-y-auto">
                            <p className="text-sm whitespace-pre-wrap">{coverLetter.content}</p>
                          </div>
                          </div>
                        )}

                        {/* Recruiter Count Message - visible when recruiters are found */}
                        {recruiters.length > 0 && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-6">
                            <div className="flex items-center gap-2">
                              <Users className="h-5 w-5 text-blue-600" />
                              <div>
                                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                                  Found {recruiters.length} recruiter{recruiters.length !== 1 ? 's' : ''} at {selectedJob?.company || 'this company'}
                                </p>
                                {recruitersHasMore && (
                                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                                    {recruitersMoreAvailable} more available. You need {recruitersMoreAvailable * 15} more credits to view them.
                                  </p>
                                )}
                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                  View all recruiters in the Recruiters tab →
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Tips Panel - show when no results */}
                        {!optimizedResume && !coverLetter && (
                          <div className="bg-gradient-to-br from-primary/5 via-background/80 to-accent/5 backdrop-blur-sm rounded-lg border border-border/60 p-6 lg:p-8 shadow-lg shadow-black/5 h-full flex flex-col relative overflow-hidden">
                            {/* Subtle gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none"></div>
                            <div className="flex-1 flex items-center justify-center relative z-10">
                              <div className="w-full max-w-md">
                                <EmptyState
                                  icon={<Wand2 className="w-12 h-12 text-primary" />}
                                  title="Ready to optimize"
                                  description="Select a job from the list above or paste a job description to get your ATS-optimized resume and personalized cover letter."
                                  action={
                                    <div className="space-y-4 mt-8">
                                      <div className="bg-primary/8 rounded-lg p-5 border border-primary/15 shadow-sm">
                                        <h4 className="text-sm font-bold mb-3 flex items-center gap-2 text-foreground">
                                          <Zap className="w-4 h-4 text-primary" />
                                          What you'll get:
                                        </h4>
                                        <div className="space-y-3">
                                          <div className="flex items-start gap-2.5 text-sm">
                                            <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                            <span className="text-muted-foreground font-normal">ATS keyword optimization to pass screening systems</span>
                                          </div>
                                          <div className="flex items-start gap-2.5 text-sm">
                                            <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                            <span className="text-muted-foreground font-normal">Resume formatting improvements for better readability</span>
                                          </div>
                                          <div className="flex items-start gap-2.5 text-sm">
                                            <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                            <span className="text-muted-foreground font-normal">Personalized cover letter tailored to the job</span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="bg-muted/40 rounded-lg p-4 border border-border/50 backdrop-blur-sm">
                                        <p className="text-xs text-muted-foreground leading-relaxed font-normal">
                                          <strong className="text-foreground font-semibold">Tip:</strong> The more detailed the job description, the better we can optimize your resume to match the role's requirements.
                                        </p>
                                      </div>
                                    </div>
                                  }
                                />
                              </div>
                            </div>
                          </div>
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
                                            onClick={() => window.open(recruiter.LinkedIn, '_blank')}
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
                                              onClick={() => window.open(recruiter.LinkedIn, '_blank')}
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
    </SidebarProvider>
  );
};

export default JobBoardPage;

