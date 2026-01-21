import React, { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { 
  Briefcase, Download, Loader2, BadgeCheck, Calendar, CheckCircle, XCircle,
  Link, Building2, MessageSquare, Lightbulb, AlertTriangle, FileText,
  ClipboardList, FolderOpen, ArrowRight, CreditCard
} from "lucide-react";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { apiService } from "@/services/api";
import type { InterviewPrep, InterviewPrepStatus } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { INTERVIEW_PREP_CREDITS } from "@/lib/constants";
import { flushSync } from "react-dom";
import { logActivity, generateInterviewPrepSummary } from "@/utils/activityLogger";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { SteppedLoadingBar } from "@/components/ui/LoadingBar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useSubscription } from "@/hooks/useSubscription";
import { canUseFeature, getFeatureLimit } from "@/utils/featureAccess";
import { trackFeatureActionCompleted, trackContentViewed, trackError } from "../lib/analytics";

const InterviewPrepPage: React.FC = () => {
  const { user, checkCredits } = useFirebaseAuth();
  const { subscription } = useSubscription();
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;
  
  // Check if user has access to interview prep based on remaining uses
  const currentUsage = subscription?.interviewPrepsUsed || 0;
  const tier = subscription?.tier || effectiveUser.tier || 'free';
  const limit = getFeatureLimit(tier, 'interviewPreps');
  const hasMonthlyAccess = subscription 
    ? canUseFeature(
        subscription.tier,
        'interviewPreps',
        currentUsage
      )
    : effectiveUser.tier === 'elite';
  
  const hasEnoughCredits = (effectiveUser.credits ?? 0) >= INTERVIEW_PREP_CREDITS;
  const hasAccess = hasMonthlyAccess && hasEnoughCredits;

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("interview-prep");

  // Interview Prep State
  const [interviewPrepLoading, setInterviewPrepLoading] = useState(false);
  const [interviewPrepProgress, setInterviewPrepProgress] = useState<string>("");
  const [interviewPrepId, setInterviewPrepId] = useState<string | null>(null);
  const [interviewPrepResult, setInterviewPrepResult] = useState<InterviewPrepStatus | null>(null);
  const [interviewPrepStatus, setInterviewPrepStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [currentPrepStatus, setCurrentPrepStatus] = useState<string>('processing');
  const [jobPostingUrl, setJobPostingUrl] = useState("");
  const [parsedJobDetails, setParsedJobDetails] = useState<any | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCompanyName, setManualCompanyName] = useState("");
  const [manualJobTitle, setManualJobTitle] = useState("");

  // Interview Prep steps for SteppedLoadingBar
  const interviewPrepSteps = [
    { id: 'processing', label: 'Initializing...' },
    { id: 'parsing_job_posting', label: 'Parsing job posting...' },
    { id: 'extracting_requirements', label: 'Extracting requirements...' },
    { id: 'scraping_reddit', label: 'Scraping Reddit...' },
    { id: 'processing_content', label: 'Processing insights...' },
    { id: 'generating_pdf', label: 'Generating PDF...' },
    { id: 'completed', label: 'Complete!' },
  ];

  // Interview Library State
  const [preps, setPreps] = useState<InterviewPrep[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);

  // URL validation
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Can generate check
  const canGenerate = jobPostingUrl.trim() || (manualCompanyName.trim() && manualJobTitle.trim());

  // Load interview preps
  useEffect(() => {
    const loadPreps = async () => {
      try {
        const result = await apiService.getInterviewPrepHistory(1000);
        if ("error" in result) {
          throw new Error(result.error);
        }
        setPreps(result.history || []);
      } catch (error) {
        console.error("Failed to load interview preps:", error);
        toast({
          title: "Unable to load library",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setLibraryLoading(false);
      }
    };
    loadPreps();
  }, []);

  // Refresh library when a new prep is completed
  useEffect(() => {
    if (interviewPrepStatus === 'completed') {
      setTimeout(() => {
        const loadPreps = async () => {
          try {
            const result = await apiService.getInterviewPrepHistory(1000);
            if ("error" in result) {
              throw new Error(result.error);
            }
            setPreps(result.history || []);
          } catch (error) {
            console.error("Failed to reload interview preps:", error);
          }
        };
        loadPreps();
      }, 2000);
    }
  }, [interviewPrepStatus]);

  const handleInterviewPrepSubmit = async () => {
    const hasUrl = jobPostingUrl.trim();
    const hasManualInput = manualCompanyName.trim() && manualJobTitle.trim();
    
    if (!hasUrl && !hasManualInput) {
      toast({
        title: "Missing Information",
        description: "Please enter a job posting URL, or provide company name and job title.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to continue.",
        variant: "destructive",
      });
      return;
    }

    if (effectiveUser.credits < INTERVIEW_PREP_CREDITS) {
      toast({
        title: "Insufficient Credits",
        description: `You need ${INTERVIEW_PREP_CREDITS} credits to generate an interview prep.`,
        variant: "destructive",
      });
      return;
    }

    setInterviewPrepLoading(true);
    setInterviewPrepStatus('processing');
    setCurrentPrepStatus('processing');
    setInterviewPrepProgress('Initializing...');
    setInterviewPrepResult(null);

    try {
      const request: any = {};
      if (jobPostingUrl.trim()) {
        request.job_posting_url = jobPostingUrl.trim();
      } else {
        request.company_name = manualCompanyName.trim();
        request.job_title = manualJobTitle.trim();
      }
      
      const result = await apiService.generateInterviewPrep(request);
      
      if ('error' in result) {
        throw new Error(result.error);
      }

      const prepId = result.id;
      setInterviewPrepId(prepId);
      
      let pollCount = 0;
      const maxPolls = 120;
      
      const handleStatusUpdate = (statusResult: any) => {
        if ('status' in statusResult) {
          const status = statusResult.status;
          setCurrentPrepStatus(status);
          
          const statusMessages: Record<string, string> = {
            'processing': 'Initializing...',
            'parsing_job_posting': 'Parsing job posting...',
            'extracting_requirements': 'Extracting requirements...',
            'scraping_reddit': 'Scraping Reddit...',
            'processing_content': 'Processing insights...',
            'generating_pdf': 'Generating PDF...',
            'completed': 'Interview Prep ready!',
            'failed': 'Generation failed',
          };
          const progressMessage = statusMessages[status] || statusResult.progress || 'Processing...';
          setInterviewPrepProgress(progressMessage);
          
          if (statusResult.jobDetails) {
            setParsedJobDetails(statusResult.jobDetails);
          }
        }
      };
      
      const handleCompletion = (statusResult: any) => {
        if (user?.uid && statusResult.jobDetails) {
          try {
            const jobDetails = statusResult.jobDetails;
            const roleTitle = jobDetails.job_title || manualJobTitle.trim() || '';
            const company = jobDetails.company_name || manualCompanyName.trim() || '';
            const summary = generateInterviewPrepSummary({
              roleTitle: roleTitle || undefined,
              company: company || undefined,
            });
            logActivity(user.uid, 'interviewPrep', summary, {
              prepId: prepId,
              roleTitle: roleTitle || '',
              company: company || '',
              jobPostingUrl: jobPostingUrl.trim() || '',
            }).catch(err => console.error('Failed to log activity:', err));
          } catch (error) {
            console.error('Failed to log interview prep activity:', error);
          }
        }
        
        trackFeatureActionCompleted('interview_prep', 'generate', true, {
          credits_spent: INTERVIEW_PREP_CREDITS,
        });
        
        flushSync(() => {
          setInterviewPrepLoading(false);
          setInterviewPrepStatus('completed');
          setInterviewPrepProgress('Interview Prep ready!');
          setInterviewPrepResult(statusResult as InterviewPrepStatus);
          setInterviewPrepId((statusResult as any).id || prepId);
        });
        
        toast({
          title: "Interview Prep Ready!",
          description: "Your interview prep PDF has been generated successfully.",
          duration: 5000,
        });
        
        if (checkCredits) {
          checkCredits();
        }
      };
      
      const pollPromise = new Promise((resolve, reject) => {
        (async () => {
          try {
            const statusResult = await apiService.getInterviewPrepStatus(prepId);
            
            if ('pdfUrl' in statusResult && statusResult.pdfUrl) {
              handleCompletion(statusResult);
              resolve(statusResult);
              return;
            }
            
            handleStatusUpdate(statusResult);
          } catch (error) {
            console.error(`[InterviewPrep] Initial poll error:`, error);
          }
        })();
        
        const intervalId = setInterval(async () => {
          pollCount++;
          
          try {
            const statusResult = await apiService.getInterviewPrepStatus(prepId);
            
            if ('error' in statusResult && !('status' in statusResult)) {
              clearInterval(intervalId);
              reject(new Error(statusResult.error));
              return;
            }
            
            if ('status' in statusResult) {
              const status = statusResult.status;
              setCurrentPrepStatus(status);
              
              const statusMessages: Record<string, string> = {
                'processing': 'Initializing...',
                'parsing_job_posting': 'Parsing job posting...',
                'extracting_requirements': 'Extracting requirements...',
                'scraping_reddit': 'Scraping Reddit...',
                'processing_content': 'Processing insights...',
                'generating_pdf': 'Generating PDF...',
                'completed': 'Interview Prep ready!',
                'failed': 'Generation failed',
              };
              const progressMessage = statusMessages[status] || statusResult.progress || 'Processing...';
              setInterviewPrepProgress(progressMessage);
              
              if (statusResult.jobDetails) {
                setParsedJobDetails(statusResult.jobDetails);
              }
            }
            
            if ('pdfUrl' in statusResult && statusResult.pdfUrl) {
              clearInterval(intervalId);
              handleCompletion(statusResult);
              resolve(statusResult);
              return;
            }
            
            handleStatusUpdate(statusResult);
            
            if (statusResult.status === 'failed' || statusResult.status === 'parsing_failed') {
              clearInterval(intervalId);
              if (statusResult.needsManualInput || statusResult.status === 'parsing_failed') {
                setShowManualInput(true);
                setInterviewPrepLoading(false);
                setInterviewPrepStatus('idle');
                toast({
                  title: "URL Parsing Failed",
                  description: "Please enter the company name and job title manually below.",
                  variant: "default",
                });
                resolve(statusResult);
                return;
              }
              reject(new Error(statusResult.error || 'Generation failed'));
              return;
            }
            
            if (pollCount >= maxPolls) {
              clearInterval(intervalId);
              setTimeout(async () => {
                try {
                  const finalCheck = await apiService.getInterviewPrepStatus(prepId);
                  if ('pdfUrl' in finalCheck && finalCheck.pdfUrl) {
                    flushSync(() => {
                      setInterviewPrepLoading(false);
                      setInterviewPrepStatus('completed');
                      setInterviewPrepProgress('Interview Prep ready!');
                      setInterviewPrepResult(finalCheck as InterviewPrepStatus);
                      setInterviewPrepId((finalCheck as any).id || prepId);
                    });
                    toast({
                      title: "Interview Prep Ready!",
                      description: "Your interview prep PDF has been generated successfully.",
                      duration: 5000,
                    });
                    if (checkCredits) checkCredits();
                    resolve(finalCheck);
                  } else {
                    reject(new Error('Generation is taking longer than expected. Please check back in a few minutes.'));
                  }
                } catch (e) {
                  reject(new Error('Generation timed out. Please try again or check back later.'));
                }
              }, 2000);
              return;
            }
          } catch (error) {
            clearInterval(intervalId);
            reject(error);
          }
        }, 2000);
      });
      
      await pollPromise;
      
    } catch (error: any) {
      console.error('Interview prep failed:', error);
      setInterviewPrepStatus('failed');
      setInterviewPrepProgress('Generation failed');
      trackError('interview_prep', 'generate', 'api_error', error.message);
      toast({
        title: "Generation Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setInterviewPrepLoading(false);
    }
  };

  const downloadInterviewPrepPDF = async (prepId?: string) => {
    const id = prepId || interviewPrepId;
    if (!id || !user) return;

    try {
      const MAX_TRIES = 20;
      const DELAY_MS = 1000;
      let pdfUrl: string | undefined;
      let companyName: string | undefined;
      let jobTitle: string | undefined;

      toast({
        title: "Preparing PDF",
        description: "Please wait while we prepare your Interview Prep PDF...",
        duration: 3000,
      });

      for (let i = 0; i < MAX_TRIES; i++) {
        try {
          const res = await apiService.downloadInterviewPrepPDF(id);
          pdfUrl = res?.pdfUrl || undefined;
          companyName = res?.companyName || undefined;
          jobTitle = res?.jobTitle || undefined;
          if (pdfUrl) {
            const response = await fetch(pdfUrl, { method: 'HEAD' });
            if (response.ok) {
              break;
            }
          }
        } catch { /* ignore transient errors */ }
        await new Promise(r => setTimeout(r, DELAY_MS));
      }

      if (!pdfUrl) {
        throw new Error("PDF isn't ready yet. Please try again in a moment.");
      }

      const sanitizeForFilename = (str: string): string => {
        return str
          .replace(/[^a-zA-Z0-9\s-]/g, '')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 50);
      };

      const company = companyName ? sanitizeForFilename(companyName) : 'Company';
      const role = jobTitle ? sanitizeForFilename(jobTitle) : 'Role';
      const filename = `Oloop_interviewprep_${company}_${role}.pdf`;

      await new Promise(r => setTimeout(r, 500));

      try {
        const response = await fetch(pdfUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status}`);
        }
        
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
        
        trackContentViewed('interview_prep', 'pdf', id);
        
        toast({
          title: "PDF Downloaded",
          description: "Your Interview Prep PDF has been downloaded.",
          duration: 3000,
        });
      } catch (fetchError) {
        console.warn("Blob download failed, trying direct link:", fetchError);
        const a = document.createElement("a");
        a.href = pdfUrl;
        a.download = filename;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
        }, 100);
        
        trackContentViewed('interview_prep', 'pdf', id);
        
        toast({
          title: "PDF Download Started",
          description: "Your Interview Prep PDF download has started.",
          duration: 3000,
        });
      }
    } catch (err) {
      trackError('interview_prep', 'download', 'network_error', err instanceof Error ? err.message : undefined);
      toast({
        title: "Download Failed",
        description: err instanceof Error ? err.message : "Could not download the PDF.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (prep: InterviewPrep) => {
    try {
      if (prep.pdfUrl) {
        window.open(prep.pdfUrl, "_blank", "noopener");
        trackContentViewed('interview_prep', 'pdf', prep.id);
        return;
      }
      const { pdfUrl } = await apiService.downloadInterviewPrepPDF(prep.id);
      if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener");
        trackContentViewed('interview_prep', 'pdf', prep.id);
      } else {
        throw new Error("PDF URL not available yet");
      }
    } catch (error) {
      trackError('interview_prep', 'download', 'network_error', error instanceof Error ? error.message : undefined);
      toast({
        title: "Download failed",
        description: "Could not open the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const groupedPreps = useMemo(() => {
    const completed = preps.filter((p) => p.status === "completed");
    const inProgress = preps.filter((p) => p.status !== "completed");
    return { completed, inProgress };
  }, [preps]);

  const recentPreps = useMemo(() => {
    return groupedPreps.completed.slice(0, 3);
  }, [groupedPreps.completed]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader title="" />

          <main className="bg-gradient-to-b from-slate-50 via-white to-white min-h-screen">
            <div className="max-w-4xl mx-auto px-6 pt-10 pb-8">
              
              {/* Inspiring Header Section */}
              <div className="text-center mb-8 animate-fadeInUp">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Interview Prep
                </h1>
                <p className="text-gray-600 text-lg">
                  Go into every interview knowing exactly what to expect.
                </p>
              </div>

              {/* Pill-style Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit mx-auto mb-8 animate-fadeInUp" style={{ animationDelay: '100ms' }}>
                  <button
                    onClick={() => setActiveTab('interview-prep')}
                    className={`
                      flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                      ${activeTab === 'interview-prep' 
                        ? 'bg-white text-green-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <Briefcase className="w-4 h-4" />
                    Interview Prep
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('interview-library')}
                    className={`
                      flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                      ${activeTab === 'interview-library' 
                        ? 'bg-white text-green-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <FolderOpen className="w-4 h-4" />
                    Interview Library
                    {preps.length > 0 && (
                      <span className="ml-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                        {preps.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* INTERVIEW PREP TAB */}
                <TabsContent value="interview-prep" className="mt-0">
                  {!hasAccess && (
                    <div className="mb-6 animate-fadeInUp" style={{ animationDelay: '150ms' }}>
                      <UpgradeBanner
                        hasExhaustedLimit={!hasMonthlyAccess}
                        hasEnoughCredits={hasEnoughCredits}
                        currentUsage={currentUsage}
                        limit={limit}
                        tier={tier}
                        requiredCredits={INTERVIEW_PREP_CREDITS}
                        currentCredits={effectiveUser.credits ?? 0}
                        featureName="Interview Preps"
                        nextTier={subscription?.tier === 'free' ? 'Pro' : 'Elite'}
                        showUpgradeButton={!hasMonthlyAccess || !hasEnoughCredits}
                      />
                    </div>
                  )}

                  {/* Main Card */}
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                    {/* Green gradient accent at top */}
                    <div className="h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500"></div>
                    
                    <div className="p-8">
                      {/* Card Header with Icon */}
                      <div className="text-center mb-8">
                        <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                          <Briefcase className="w-7 h-7 text-green-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">What role are you preparing for?</h2>
                        <p className="text-gray-600 max-w-lg mx-auto">
                          Paste a job posting URL or enter the details manually to generate a comprehensive prep guide.
                        </p>
                      </div>

                      {/* URL Input Section */}
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Job Posting URL <span className="text-red-500">*</span>
                          </label>
                          
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                              <Link className="h-5 w-5 text-gray-400" />
                            </div>
                            
                            <input
                              type="url"
                              value={jobPostingUrl}
                              onChange={(e) => {
                                setJobPostingUrl(e.target.value);
                                if (e.target.value.trim()) {
                                  setShowManualInput(false);
                                  setManualCompanyName("");
                                  setManualJobTitle("");
                                }
                              }}
                              placeholder="Paste the job posting URL here..."
                              disabled={interviewPrepLoading || !hasAccess}
                              className="block w-full pl-12 pr-12 py-4 text-base border-2 border-gray-200 rounded-xl
                                         text-gray-900 placeholder-gray-400
                                         focus:ring-2 focus:ring-green-500 focus:border-green-500
                                         hover:border-gray-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            
                            {jobPostingUrl && isValidUrl(jobPostingUrl) && (
                              <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              </div>
                            )}
                          </div>
                          
                          {/* Supported platforms */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-500">Supports:</span>
                            {['LinkedIn', 'Indeed', 'Greenhouse', 'Lever', 'Workday'].map((platform) => (
                              <span 
                                key={platform}
                                className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                              >
                                {platform}
                              </span>
                            ))}
                            <span className="text-xs text-gray-500">+ most career pages</span>
                          </div>
                        </div>

                        {/* OR Divider */}
                        {!showManualInput && !jobPostingUrl.trim() && (
                          <div className="relative py-4">
                            <div className="absolute inset-0 flex items-center">
                              <div className="w-full border-t border-gray-200"></div>
                            </div>
                            <div className="relative flex justify-center">
                              <span className="px-4 bg-white text-sm text-gray-500">Or enter manually</span>
                            </div>
                          </div>
                        )}

                        {/* Manual Entry Fields */}
                        {!showManualInput && !jobPostingUrl.trim() && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Company Name
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Building2 className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                  type="text"
                                  value={manualCompanyName}
                                  onChange={(e) => setManualCompanyName(e.target.value)}
                                  placeholder="e.g., Google, Amazon, Meta"
                                  disabled={interviewPrepLoading || !hasAccess}
                                  className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl
                                             text-gray-900 placeholder-gray-400
                                             focus:ring-2 focus:ring-green-500 focus:border-green-500
                                             hover:border-gray-300 transition-all disabled:opacity-50"
                                />
                              </div>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Job Title
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Briefcase className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                  type="text"
                                  value={manualJobTitle}
                                  onChange={(e) => setManualJobTitle(e.target.value)}
                                  placeholder="e.g., Software Engineer, Data Scientist"
                                  disabled={interviewPrepLoading || !hasAccess}
                                  className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl
                                             text-gray-900 placeholder-gray-400
                                             focus:ring-2 focus:ring-green-500 focus:border-green-500
                                             hover:border-gray-300 transition-all disabled:opacity-50"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Manual Input Required (fallback) */}
                        {showManualInput && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-4">
                            <div className="flex items-start gap-2">
                              <XCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-amber-800 mb-1">
                                  URL Parsing Failed - Manual Input Required
                                </p>
                                <p className="text-xs text-amber-700">
                                  We couldn't parse the job posting URL. Please enter the details manually below.
                                </p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Company Name <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Building2 className="h-5 w-5 text-gray-400" />
                                  </div>
                                  <input
                                    type="text"
                                    value={manualCompanyName}
                                    onChange={(e) => setManualCompanyName(e.target.value)}
                                    placeholder="e.g., Google, Amazon, Meta"
                                    disabled={interviewPrepLoading || !hasAccess}
                                    className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white
                                               text-gray-900 placeholder-gray-400
                                               focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                  />
                                </div>
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Job Title <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Briefcase className="h-5 w-5 text-gray-400" />
                                  </div>
                                  <input
                                    type="text"
                                    value={manualJobTitle}
                                    onChange={(e) => setManualJobTitle(e.target.value)}
                                    placeholder="e.g., Software Engineer, Product Manager"
                                    disabled={interviewPrepLoading || !hasAccess}
                                    className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white
                                               text-gray-900 placeholder-gray-400
                                               focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Parsed Job Details Preview */}
                        {parsedJobDetails && (
                          <div className="rounded-xl border border-green-200 bg-green-50 p-5">
                            <p className="text-sm font-semibold text-green-700 mb-3">Job Details Preview:</p>
                            <div className="space-y-2 text-sm text-gray-700">
                              <div><span className="text-gray-500">Company:</span> {parsedJobDetails.company_name}</div>
                              <div><span className="text-gray-500">Role:</span> {parsedJobDetails.job_title}</div>
                              {parsedJobDetails.level && (
                                <div><span className="text-gray-500">Level:</span> {parsedJobDetails.level}</div>
                              )}
                              {parsedJobDetails.team_division && (
                                <div><span className="text-gray-500">Team:</span> {parsedJobDetails.team_division}</div>
                              )}
                              {parsedJobDetails.required_skills && parsedJobDetails.required_skills.length > 0 && (
                                <div>
                                  <span className="text-gray-500">Key Skills:</span> {parsedJobDetails.required_skills.slice(0, 5).join(', ')}
                                  {parsedJobDetails.required_skills.length > 5 && ` +${parsedJobDetails.required_skills.length - 5} more`}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* What You'll Receive Section */}
                      <div className="mt-8 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-5">What you'll receive</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                              <ClipboardList className="w-4 h-4 text-green-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">Interview Process</p>
                              <p className="text-xs text-gray-500">Company-specific stages</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <MessageSquare className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">Common Questions</p>
                              <p className="text-xs text-gray-500">Behavioral & Technical</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                              <Lightbulb className="w-4 h-4 text-purple-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">Success Tips</p>
                              <p className="text-xs text-gray-500">From candidates who passed</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                              <AlertTriangle className="w-4 h-4 text-red-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">Red Flags to Avoid</p>
                              <p className="text-xs text-gray-500">Common mistakes</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-4 h-4 text-amber-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">Culture Insights</p>
                              <p className="text-xs text-gray-500">Work environment & values</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">5-6 Page PDF Guide</p>
                              <p className="text-xs text-gray-500">Tailored to this role</p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Credits info */}
                        <div className="mt-5 pt-4 border-t border-green-200 flex items-center justify-center gap-2 text-sm text-gray-600">
                          <CreditCard className="w-4 h-4 text-green-600" />
                          <span>Uses <span className="font-semibold">{INTERVIEW_PREP_CREDITS} credits</span> per prep guide</span>
                        </div>
                      </div>

                      {/* CTA Button */}
                      <div className="mt-8">
                        <button
                          onClick={handleInterviewPrepSubmit}
                          disabled={
                            interviewPrepLoading || 
                            effectiveUser.credits < INTERVIEW_PREP_CREDITS ||
                            !canGenerate ||
                            !hasAccess
                          }
                          className={`
                            w-full md:w-auto px-8 py-4 rounded-full font-semibold text-lg
                            flex items-center justify-center gap-3 mx-auto
                            transition-all duration-200 transform
                            ${(!canGenerate || interviewPrepLoading || !hasAccess)
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-gradient-to-r from-green-600 to-emerald-500 text-white shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40 hover:scale-105 active:scale-100'
                            }
                          `}
                        >
                          {interviewPrepLoading ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              Generate Interview Prep
                              <ArrowRight className="w-5 h-5" />
                            </>
                          )}
                        </button>
                        
                        {/* Helper text */}
                        <p className="text-center text-sm text-gray-500 mt-4">
                          {jobPostingUrl 
                            ? "We'll extract the role details from the job posting"
                            : manualCompanyName && manualJobTitle 
                              ? `Preparing guide for ${manualJobTitle} at ${manualCompanyName}`
                              : "Enter a job URL or fill in the company and title"
                          }
                        </p>
                      </div>

                      {/* Progress/Status Display */}
                      {interviewPrepStatus !== 'idle' && (
                        <div className="mt-6">
                          {interviewPrepStatus === 'completed' ? (
                            <div className="flex flex-col items-center gap-4 p-6 bg-green-50 border border-green-200 rounded-xl">
                              <div className="flex items-center gap-2 text-green-700">
                                <CheckCircle className="h-5 w-5" />
                                <span className="font-medium">{interviewPrepProgress}</span>
                              </div>
                              <button
                                onClick={() => downloadInterviewPrepPDF()}
                                className="px-6 py-3 bg-green-600 text-white font-semibold rounded-full hover:bg-green-700 transition-colors flex items-center gap-2"
                              >
                                <Download className="h-5 w-5" />
                                Download Full PDF
                              </button>
                            </div>
                          ) : interviewPrepStatus === 'failed' ? (
                            <div className="flex items-center justify-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                              <XCircle className="h-5 w-5" />
                              <span>{interviewPrepProgress || 'Generation failed'}</span>
                            </div>
                          ) : (
                            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                              <div className="flex items-center justify-center gap-2 mb-3">
                                <Loader2 className="h-5 w-5 animate-spin text-green-600" />
                                <span className="font-medium text-green-700">{interviewPrepProgress}</span>
                              </div>
                              <SteppedLoadingBar 
                                steps={interviewPrepSteps} 
                                currentStepId={currentPrepStatus} 
                              />
                              <p className="text-center text-xs text-gray-500 mt-3">This usually takes 15-30 seconds</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Recent Preps from Library */}
                      {recentPreps.length > 0 && interviewPrepStatus !== 'completed' && (
                        <div className="mt-10 pt-8 border-t border-gray-100">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-gray-700">Recent Prep Guides</h3>
                            <button 
                              onClick={() => setActiveTab('interview-library')}
                              className="text-sm text-green-600 hover:underline"
                            >
                              View all ({preps.length})
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {recentPreps.map((prep) => (
                              <div 
                                key={prep.id}
                                onClick={() => handleDownload(prep)}
                                className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer transition-colors group border border-transparent hover:border-green-200"
                              >
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-gray-200 group-hover:border-green-300 transition-colors">
                                    <Briefcase className="w-5 h-5 text-green-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 text-sm truncate">{prep.jobTitle || 'Interview Prep'}</p>
                                    <p className="text-xs text-gray-500 truncate">{prep.companyName}</p>
                                  </div>
                                </div>
                                <p className="text-xs text-gray-400">
                                  {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* INTERVIEW LIBRARY TAB */}
                <TabsContent value="interview-library" className="mt-0">
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                    <div className="h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500"></div>
                    
                    <div className="p-8">
                      {libraryLoading ? (
                        <LoadingSkeleton variant="card" count={3} />
                      ) : preps.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Briefcase className="h-8 w-8 text-green-600" />
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">No preps yet</h3>
                          <p className="text-sm text-gray-500 mb-6">
                            Generate your first interview prep to see it appear here.
                          </p>
                          <button
                            onClick={() => setActiveTab('interview-prep')}
                            className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-500 text-white font-semibold rounded-full hover:shadow-lg transition-all"
                          >
                            Create Your First Prep
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {groupedPreps.inProgress.length > 0 && (
                            <section>
                              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                                In Progress
                              </h3>
                              <div className="space-y-3">
                                {groupedPreps.inProgress.map((prep) => (
                                  <div
                                    key={prep.id}
                                    className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between"
                                  >
                                    <div>
                                      <p className="font-medium text-gray-900">{prep.companyName}</p>
                                      {prep.jobTitle && (
                                        <p className="text-sm text-gray-600">{prep.jobTitle}</p>
                                      )}
                                      <p className="text-xs text-gray-400 mt-1">
                                        Requested {prep.createdAt ? new Date(prep.createdAt).toLocaleString() : ""}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 text-amber-600">
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      <span className="text-xs uppercase font-medium">Processing...</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {groupedPreps.completed.length > 0 && (
                            <section className="space-y-3">
                              <h3 className="text-sm font-semibold text-gray-500 uppercase">
                                Completed ({groupedPreps.completed.length})
                              </h3>
                              <div className="space-y-3">
                                {groupedPreps.completed.map((prep) => (
                                  <div
                                    key={prep.id}
                                    className="p-5 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <BadgeCheck className="h-5 w-5 text-green-600" />
                                        <span className="font-semibold text-gray-900">{prep.companyName}</span>
                                      </div>
                                      {prep.jobTitle && (
                                        <p className="text-sm text-gray-600">{prep.jobTitle}</p>
                                      )}
                                      <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Calendar className="h-3 w-3" />
                                        {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : "—"}
                                      </div>
                                    </div>

                                    <button
                                      onClick={() => handleDownload(prep)}
                                      className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium hover:bg-green-200 transition-colors flex items-center gap-2"
                                    >
                                      <Download className="h-4 w-4" />
                                      PDF
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default InterviewPrepPage;
