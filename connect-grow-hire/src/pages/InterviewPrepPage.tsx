import React, { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { Briefcase, Download, Loader2, BadgeCheck, Calendar, CheckCircle, XCircle } from "lucide-react";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { apiService } from "@/services/api";
import type { InterviewPrep, InterviewPrepStatus } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INTERVIEW_PREP_CREDITS } from "@/lib/constants";
import { flushSync } from "react-dom";
import { logActivity, generateInterviewPrepSummary } from "@/utils/activityLogger";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { InlineLoadingBar, SteppedLoadingBar } from "@/components/ui/LoadingBar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useSubscription } from "@/hooks/useSubscription";
import { canUseFeature, getFeatureLimit } from "@/utils/featureAccess";
import { trackFeatureActionCompleted, trackContentViewed, trackError } from "../lib/analytics";

// Stripe-style Tabs Component with animated underline
interface StripeTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { id: string; label: string }[];
}

const StripeTabs: React.FC<StripeTabsProps> = ({ activeTab, onTabChange, tabs }) => {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

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
      
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gray-200" />
      
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
    : effectiveUser.tier === 'elite'; // Default to allowing if no subscription data yet
  
  // Also check if user has enough credits
  const hasEnoughCredits = (effectiveUser.credits ?? 0) >= INTERVIEW_PREP_CREDITS;
  
  // User has access only if they have both monthly limit AND credits
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

  // Interview Prep steps for SteppedLoadingBar - must match backend status updates exactly
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load interview preps
  useEffect(() => {
    const loadPreps = async () => {
      try {
        const result = await apiService.getInterviewPrepHistory(1000); // Large limit to get all
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
      // Reload library after a short delay to ensure backend has saved
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
    console.log('🎬 handleInterviewPrepSubmit called');
    
    // Check if we have URL or manual input
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

    // Check credits
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
    setCurrentPrepStatus('processing'); // Start with 'processing' status to match backend initial status
    setInterviewPrepProgress('Initializing...');
    setInterviewPrepResult(null);

    try {
      // Start the generation
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
      
      // Poll for status - allow more time for comprehensive generation
      // Poll immediately first, then continue with interval
      let pollCount = 0;
      const maxPolls = 120; // 6 minutes max (120 * 2s)
      
      // Helper to handle status updates
      const handleStatusUpdate = (statusResult: any) => {
        if ('status' in statusResult) {
          const status = statusResult.status;
          console.log(`[InterviewPrep] Status update: ${status}`);
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
          console.log(`[InterviewPrep] Setting progress: ${progressMessage}`);
          setInterviewPrepProgress(progressMessage);
          
          if (statusResult.jobDetails) {
            setParsedJobDetails(statusResult.jobDetails);
          }
        }
      };
      
      // Helper to handle completion
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
          checkCredits().then(() => {
            console.log('✅ Interview Prep complete!');
          });
        }
      };
      
      const pollPromise = new Promise((resolve, reject) => {
        // Poll immediately first
        (async () => {
          try {
            const statusResult = await apiService.getInterviewPrepStatus(prepId);
            console.log(`[InterviewPrep] Initial poll result:`, statusResult);
            
            if (statusResult.pdfUrl) {
              handleCompletion(statusResult);
              resolve(statusResult);
              return;
            }
            
            handleStatusUpdate(statusResult);
          } catch (error) {
            console.error(`[InterviewPrep] Initial poll error:`, error);
          }
        })();
        
        // Then continue polling with interval
        const intervalId = setInterval(async () => {
          pollCount++;
          console.log(`[InterviewPrep] Polling status (attempt ${pollCount}/${maxPolls})...`);
          
          try {
            const statusResult = await apiService.getInterviewPrepStatus(prepId);
            console.log(`[InterviewPrep] Status result:`, statusResult);
            
            if ('error' in statusResult && !('status' in statusResult)) {
              clearInterval(intervalId);
              reject(new Error(statusResult.error));
              return;
            }
            
            // Update progress based on status
            if ('status' in statusResult) {
              const status = statusResult.status;
              console.log(`[InterviewPrep] Status update: ${status}`);
              
              // Update current prep status to trigger step progress update
              setCurrentPrepStatus(status);
              
              // Update progress message based on status (must match interviewPrepSteps labels)
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
              console.log(`[InterviewPrep] Setting progress: ${progressMessage}`);
              setInterviewPrepProgress(progressMessage);
              
              // Update parsed job details if available
              if (statusResult.jobDetails) {
                setParsedJobDetails(statusResult.jobDetails);
              }
            }
            
            // Check if completed
            if (statusResult.pdfUrl) {
              clearInterval(intervalId);
              console.log('✅ Interview Prep completed! pdfUrl:', statusResult.pdfUrl);
              handleCompletion(statusResult);
              resolve(statusResult);
              return;
            }
            
            handleStatusUpdate(statusResult);
            
            // Check if failed or needs manual input
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
        }, 2000); // QUICK WIN: Poll every 2 seconds to catch status updates faster
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

      // Generate filename: Oloop_interviewprep_{Company_name}_{Role}.pdf
      const sanitizeForFilename = (str: string): string => {
        return str
          .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
          .replace(/\s+/g, '_') // Replace spaces with underscores
          .replace(/_+/g, '_') // Replace multiple underscores with single
          .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
          .substring(0, 50); // Limit length
      };

      const company = companyName ? sanitizeForFilename(companyName) : 'Company';
      const role = jobTitle ? sanitizeForFilename(jobTitle) : 'Role';
      const filename = `Oloop_interviewprep_${company}_${role}.pdf`;

      await new Promise(r => setTimeout(r, 500));

      // Force download instead of opening in browser
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
        
        // Track PostHog event
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
        
        // Track PostHog event
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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader title="" />

          <main className="bg-white min-h-screen">
            <div className="max-w-5xl mx-auto px-8 pt-10 pb-4">
              <h1 className="text-[28px] font-semibold text-gray-900 mb-4">
                Interview Prep
              </h1>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <StripeTabs 
                  activeTab={activeTab} 
                  onTabChange={setActiveTab}
                  tabs={[
                    { id: 'interview-prep', label: 'Interview Prep' },
                    { id: 'interview-library', label: `Interview Library (${preps.length})` },
                  ]}
                />

                <div className="pb-8 pt-6">
                  <TabsContent value="interview-prep" className="mt-0">
                    {!hasAccess && (
                      <div className="mb-6">
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

                    <div className="mb-6">
                      <h2 className="text-xl font-semibold text-gray-900 mb-6">
                        What role are you preparing for?
                      </h2>

                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium mb-2 text-gray-700">
                            Job Posting URL <span className="text-red-500">*</span>
                          </label>
                          <Input
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
                            className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 hover:border-gray-400 transition-colors"
                            disabled={interviewPrepLoading || !hasAccess}
                          />
                          <p className="text-sm text-gray-500 mt-2">
                            Supports LinkedIn, Indeed, Greenhouse, Lever, Workday, and most career pages.
                          </p>
                        </div>
                        
                        {!showManualInput && !jobPostingUrl.trim() && (
                          <div className="space-y-4">
                            <p className="text-sm text-gray-500">Or enter manually:</p>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                  Company Name
                                </label>
                                <Input
                                  value={manualCompanyName}
                                  onChange={(e) => setManualCompanyName(e.target.value)}
                                  placeholder="e.g., Google, Amazon, Meta"
                                  className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 hover:border-gray-400 transition-colors"
                                  disabled={interviewPrepLoading || !hasAccess}
                                />
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                  Job Title
                                </label>
                                <Input
                                  value={manualJobTitle}
                                  onChange={(e) => setManualJobTitle(e.target.value)}
                                  placeholder="e.g., Software Engineer, Data Scientist"
                                  className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 hover:border-gray-400 transition-colors"
                                  disabled={interviewPrepLoading || !hasAccess}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {parsedJobDetails && (
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <p className="text-sm font-semibold text-gray-900 mb-3">Job Details Preview:</p>
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
                        
                        {showManualInput && (
                          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 space-y-4">
                            <div className="flex items-start gap-2">
                              <XCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-yellow-800 mb-1">
                                  URL Parsing Failed - Manual Input Required
                                </p>
                                <p className="text-xs text-yellow-700 mb-3">
                                  We couldn't parse the job posting URL. Please enter the details manually below.
                                </p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                  Company Name <span className="text-red-500">*</span>
                                </label>
                                <Input
                                  value={manualCompanyName}
                                  onChange={(e) => setManualCompanyName(e.target.value)}
                                  placeholder="e.g., Google, Amazon, Meta"
                                  className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 hover:border-gray-400 transition-colors"
                                  disabled={interviewPrepLoading || !hasAccess}
                                />
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                  Job Title <span className="text-red-500">*</span>
                                </label>
                                <Input
                                  value={manualJobTitle}
                                  onChange={(e) => setManualJobTitle(e.target.value)}
                                  placeholder="e.g., Software Engineer, Product Manager"
                                  className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 hover:border-gray-400 transition-colors"
                                  disabled={interviewPrepLoading || !hasAccess}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm space-y-3">
                          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                            What you'll receive
                          </h3>
                          <ul className="space-y-2 text-gray-700">
                            <li className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              Company-specific interview process overview
                            </li>
                            <li className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              Common questions grouped by category (Behavioral, Technical, etc.)
                            </li>
                            <li className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              Success tips from candidates who passed
                            </li>
                            <li className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              Red flags and things to avoid
                            </li>
                            <li className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              Culture insights and work environment details
                            </li>
                          </ul>
                          <p className="text-sm text-gray-500 mt-3">
                            Uses <span className="font-medium text-blue-600">{INTERVIEW_PREP_CREDITS}</span> credits • Generates a 5-6 page prep guide tailored to this specific role.
                          </p>
                        </div>

                        <div className="space-y-4 mt-8">
                          <Button
                            onClick={handleInterviewPrepSubmit}
                            disabled={
                              interviewPrepLoading || 
                              effectiveUser.credits < INTERVIEW_PREP_CREDITS ||
                              (!jobPostingUrl.trim() && (!manualCompanyName.trim() || !manualJobTitle.trim())) ||
                              !hasAccess
                            }
                            size="lg"
                            className="text-white font-medium px-8 transition-all hover:opacity-90 relative overflow-hidden"
                            style={{ background: '#3B82F6' }}
                          >
                            {interviewPrepLoading ? (
                              'Generating...'
                            ) : (
                              'Generate Interview Prep'
                            )}
                            <InlineLoadingBar isLoading={interviewPrepLoading} />
                          </Button>
                        </div>

                        {interviewPrepStatus !== 'idle' && (
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                            {interviewPrepStatus === 'completed' ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <span>{interviewPrepProgress}</span>
                              </div>
                            ) : interviewPrepStatus === 'failed' ? (
                              <div className="flex items-center gap-2">
                                <XCircle className="h-4 w-4 text-red-500" />
                                <span>{interviewPrepProgress || 'Generation failed'}</span>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                  <span className="font-medium">{interviewPrepProgress}</span>
                                </div>
                                <SteppedLoadingBar 
                                  steps={interviewPrepSteps} 
                                  currentStepId={currentPrepStatus} 
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {interviewPrepStatus === 'completed' && interviewPrepResult && (
                          <div className="space-y-4">
                            <div className="rounded-lg border border-green-200 bg-green-50 p-5 space-y-3">
                              <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wide">
                                  {interviewPrepResult.jobDetails?.job_title || interviewPrepResult.jobDetails?.company_name || 'Interview Prep'} - {interviewPrepResult.jobDetails?.company_name || ''}
                                </h3>
                                <span className="text-xs text-green-600">
                                  Ready to download
                                </span>
                              </div>
                              
                              {interviewPrepResult.insights && (
                                <div className="space-y-3 text-sm text-gray-700">
                                  {interviewPrepResult.insights.interview_process?.stages && interviewPrepResult.insights.interview_process.stages.length > 0 && (
                                    <div>
                                      <span className="text-gray-500">Interview Stages: </span>
                                      {interviewPrepResult.insights.interview_process.stages
                                        .map((stage: any) => typeof stage === 'string' ? stage : stage?.name || 'Stage')
                                        .join(', ')}
                                    </div>
                                  )}
                                  
                                  {interviewPrepResult.insights.common_questions && (
                                    <div>
                                      <span className="text-gray-500">Question Categories: </span>
                                      {(() => {
                                        const commonQuestions = interviewPrepResult.insights.common_questions;
                                        if (Array.isArray(commonQuestions)) {
                                          return commonQuestions.map((q: any) => q.category).join(', ');
                                        } else if (typeof commonQuestions === 'object' && commonQuestions !== null) {
                                          const categories: string[] = [];
                                          const questionsObj = commonQuestions as { behavioral?: any; technical?: any; company_specific?: any };
                                          if (questionsObj.behavioral) categories.push('Behavioral');
                                          if (questionsObj.technical) categories.push('Technical');
                                          if (questionsObj.company_specific) categories.push('Company-Specific');
                                          return categories.join(', ');
                                        }
                                        return '';
                                      })()}
                                      <div className="mt-2 text-xs text-gray-500">
                                        Sample questions preview:
                                        <ul className="list-disc list-inside mt-1 space-y-1">
                                          {(() => {
                                            const commonQuestions: any = interviewPrepResult.insights.common_questions;
                                            const sampleQuestions: string[] = [];
                                            
                                            if (Array.isArray(commonQuestions)) {
                                              commonQuestions.slice(0, 3).forEach((category: any) => {
                                                if (category.questions) {
                                                  category.questions.slice(0, 2).forEach((q: string) => {
                                                    sampleQuestions.push(q);
                                                  });
                                                }
                                              });
                                            } else if (typeof commonQuestions === 'object' && commonQuestions !== null) {
                                              const questionsObj = commonQuestions as { behavioral?: { questions?: any[] }; technical?: { questions?: any[] }; company_specific?: { questions?: any[] } };
                                              if (questionsObj.behavioral?.questions) {
                                                questionsObj.behavioral.questions.slice(0, 2).forEach((q: any) => {
                                                  sampleQuestions.push(typeof q === 'string' ? q : q.question || '');
                                                });
                                              }
                                              if (questionsObj.technical?.questions && sampleQuestions.length < 3) {
                                                questionsObj.technical.questions.slice(0, 2).forEach((q: any) => {
                                                  sampleQuestions.push(typeof q === 'string' ? q : q.question || '');
                                                });
                                              }
                                            }
                                            
                                            return sampleQuestions.slice(0, 3).map((q, idx) => (
                                              <li key={idx} className="text-gray-700">{q}</li>
                                            ));
                                          })()}
                                        </ul>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {interviewPrepResult.insights.sources_count && (
                                    <div>
                                      <span className="text-gray-500">Sources: </span>
                                      Analyzed {interviewPrepResult.insights.sources_count} Reddit posts
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <Button
                              onClick={() => downloadInterviewPrepPDF()}
                              size="lg"
                              className="text-white font-medium px-8 transition-all hover:opacity-90"
                              style={{ background: '#3B82F6' }}
                            >
                              <Download className="h-5 w-5 mr-2" />
                              Download Full PDF
                            </Button>
                          </div>
                        )}

                        {interviewPrepStatus === 'failed' && interviewPrepResult?.error && (
                          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                            <p className="text-sm text-red-700">
                              {interviewPrepResult.error}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="interview-library" className="mt-0">
                    <div className="space-y-6">
                      {libraryLoading ? (
                        <LoadingSkeleton variant="card" count={3} />
                      ) : preps.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-10 text-center space-y-4">
                          <Briefcase className="h-10 w-10 mx-auto text-blue-600" />
                          <h3 className="text-lg font-semibold text-gray-900">No preps yet</h3>
                          <p className="text-sm text-gray-500">
                            Generate your first interview prep to see it appear here.
                          </p>
                          <Button
                            onClick={() => setActiveTab('interview-prep')}
                            variant="outline"
                            className="border-blue-500 text-blue-600 hover:bg-blue-50"
                          >
                            Create Your First Prep
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {groupedPreps.inProgress.length > 0 && (
                            <section>
                              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                                In Progress
                              </h3>
                              <div className="grid gap-4">
                                {groupedPreps.inProgress.map((prep) => (
                                  <div
                                    key={prep.id}
                                    className="rounded-lg border border-yellow-200 bg-yellow-50 px-5 py-4 flex items-center justify-between"
                                  >
                                    <div>
                                      <p className="text-sm text-gray-900 font-medium">{prep.companyName}</p>
                                      {prep.jobTitle && (
                                        <p className="text-xs text-gray-500">{prep.jobTitle}</p>
                                      )}
                                      <p className="text-xs text-gray-400 mt-1">
                                        Requested {prep.createdAt ? new Date(prep.createdAt).toLocaleString() : ""}
                                      </p>
                                    </div>
                                    <div className="text-xs uppercase text-yellow-600 font-medium">Processing...</div>
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
                              <div className="grid gap-4">
                                {groupedPreps.completed.map((prep) => (
                                  <div
                                    key={prep.id}
                                    className="rounded-lg border border-gray-200 bg-white p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 text-sm text-gray-900 font-medium">
                                        <BadgeCheck className="h-4 w-4 text-blue-600" />
                                        {prep.companyName}
                                      </div>
                                      {prep.jobTitle && (
                                        <div className="text-sm text-gray-700">
                                          {prep.jobTitle}
                                        </div>
                                      )}
                                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : "—"}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-blue-500 text-blue-600 hover:bg-blue-50"
                                        onClick={() => handleDownload(prep)}
                                      >
                                        <Download className="h-4 w-4 mr-2" />
                                        PDF
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default InterviewPrepPage;

