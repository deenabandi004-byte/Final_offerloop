import React, { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BackToHomeButton } from "@/components/BackToHomeButton";
import { CreditPill } from "@/components/credits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { Briefcase, FileText, Sparkles, Download, Trash2, Loader2, BadgeCheck, Calendar, CheckCircle, XCircle } from "lucide-react";
// ScoutBubble removed - now using ScoutHeaderButton in PageHeaderActions
import { apiService } from "@/services/api";
import type { InterviewPrep, InterviewPrepStatus } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BetaBadge } from "@/components/BetaBadges";
import { INTERVIEW_PREP_CREDITS } from "@/lib/constants";
import { flushSync } from "react-dom";
import { logActivity, generateInterviewPrepSummary } from "@/utils/activityLogger";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { PageHeaderActions } from "@/components/PageHeaderActions";
import LockedFeatureOverlay from "@/components/LockedFeatureOverlay";

const InterviewPrepPage: React.FC = () => {
  const { user, checkCredits } = useFirebaseAuth();
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;

  // Interview Prep State
  const [interviewPrepLoading, setInterviewPrepLoading] = useState(false);
  const [interviewPrepProgress, setInterviewPrepProgress] = useState<string>("");
  const [interviewPrepId, setInterviewPrepId] = useState<string | null>(null);
  const [interviewPrepResult, setInterviewPrepResult] = useState<InterviewPrepStatus | null>(null);
  const [interviewPrepStatus, setInterviewPrepStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [jobPostingUrl, setJobPostingUrl] = useState("");
  const [parsedJobDetails, setParsedJobDetails] = useState<any | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCompanyName, setManualCompanyName] = useState("");
  const [manualJobTitle, setManualJobTitle] = useState("");

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
    setInterviewPrepProgress('Analyzing job posting...');
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
      let pollCount = 0;
      const maxPolls = 120; // 6 minutes max (120 * 3s)
      
      const pollPromise = new Promise((resolve, reject) => {
        const intervalId = setInterval(async () => {
          pollCount++;
          console.log(`🔄 Interview Prep Poll ${pollCount} starting...`);
          
          try {
            const statusResult = await apiService.getInterviewPrepStatus(prepId);
            console.log(`Poll ${pollCount}:`, statusResult);
            
            if ('error' in statusResult && !('status' in statusResult)) {
              clearInterval(intervalId);
              reject(new Error(statusResult.error));
              return;
            }
            
            // Update progress based on status
            if ('status' in statusResult) {
              const status = statusResult.status;
              if (status === 'parsing_job_posting') {
                setInterviewPrepProgress(statusResult.progress || 'Analyzing job posting...');
              } else if (status === 'extracting_requirements') {
                setInterviewPrepProgress(statusResult.progress || 'Extracting role requirements...');
              } else if (status === 'scraping_reddit') {
                setInterviewPrepProgress(statusResult.progress || 'Searching Reddit for interview experiences...');
              } else if (status === 'processing_content') {
                setInterviewPrepProgress(statusResult.progress || 'Processing insights...');
              } else if (status === 'generating_pdf') {
                setInterviewPrepProgress(statusResult.progress || 'Generating your prep guide...');
              } else {
                setInterviewPrepProgress(statusResult.progress || 'Processing your request...');
              }
              
              // Update parsed job details if available
              if (statusResult.jobDetails) {
                setParsedJobDetails(statusResult.jobDetails);
              }
            }
            
            // Check if completed
            if (statusResult.pdfUrl) {
              clearInterval(intervalId);
              console.log('✅ Interview Prep completed! pdfUrl:', statusResult.pdfUrl);
              
              // Log activity for interview prep creation
              if (user?.uid && statusResult.jobDetails) {
                try {
                  const jobDetails = statusResult.jobDetails;
                  const roleTitle = jobDetails.job_title || manualJobTitle.trim() || '';
                  const company = jobDetails.company_name || manualCompanyName.trim() || '';
                  const summary = generateInterviewPrepSummary({
                    roleTitle: roleTitle || undefined,
                    company: company || undefined,
                  });
                  await logActivity(user.uid, 'interviewPrep', summary, {
                    prepId: prepId,
                    roleTitle: roleTitle || '',
                    company: company || '',
                    jobPostingUrl: jobPostingUrl.trim() || '',
                  });
                } catch (error) {
                  console.error('Failed to log interview prep activity:', error);
                }
              }
              
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
              
              resolve(statusResult);
              return;
            }
            
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
        }, 3000); // Poll every 3 seconds
      });
      
      await pollPromise;
      
    } catch (error: any) {
      console.error('Interview prep failed:', error);
      setInterviewPrepStatus('failed');
      setInterviewPrepProgress('Generation failed');
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

      toast({
        title: "Preparing PDF",
        description: "Please wait while we prepare your Interview Prep PDF...",
        duration: 3000,
      });

      for (let i = 0; i < MAX_TRIES; i++) {
        try {
          const res = await apiService.downloadInterviewPrepPDF(id);
          pdfUrl = res?.pdfUrl || undefined;
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
        a.download = `interview-prep-${id}.pdf`;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
        
        toast({
          title: "PDF Downloaded",
          description: "Your Interview Prep PDF has been downloaded.",
          duration: 3000,
        });
      } catch (fetchError) {
        console.warn("Blob download failed, trying direct link:", fetchError);
        const a = document.createElement("a");
        a.href = pdfUrl;
        a.download = `interview-prep-${id}.pdf`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
        }, 100);
        
        toast({
          title: "PDF Download Started",
          description: "Your Interview Prep PDF download has started.",
          duration: 3000,
        });
      }
    } catch (err) {
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
        return;
      }
      const { pdfUrl } = await apiService.downloadInterviewPrepPDF(prep.id);
      if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener");
      } else {
        throw new Error("PDF URL not available yet");
      }
    } catch (error) {
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
      <div className="flex min-h-screen w-full bg-transparent text-foreground">
        <AppSidebar />

        <div className="flex-1">
          <header className="h-16 flex items-center justify-between border-b border-gray-100/30 px-6 bg-transparent shadow-sm relative z-20">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-foreground hover:bg-accent" />
              <h1 className="text-xl font-semibold">Interview Prep</h1>
            </div>
            <PageHeaderActions />
          </header>

          <main className="p-8 bg-transparent">
            <div className="max-w-5xl mx-auto">
              {effectiveUser.tier !== "pro" ? (
                <LockedFeatureOverlay 
                  featureName="Interview Prep" 
                  requiredTier="Pro"
                >
              <Tabs defaultValue="interview-prep" className="w-full">
                <div className="flex justify-center mb-8">
                  <TabsList className="h-14 tabs-container-gradient border border-border grid grid-cols-2 max-w-lg w-full rounded-xl p-1 bg-white">
                    <TabsTrigger
                      value="interview-prep"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <Briefcase className="h-5 w-5 mr-2" />
                      Interview Prep
                    </TabsTrigger>
                    <TabsTrigger
                      value="interview-library"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <FileText className="h-5 w-5 mr-2" />
                      Interview Library
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="interview-prep" className="mt-6">
                  <Card className="bg-white border-border relative overflow-hidden">
                    <CardHeader className="border-b border-border">
                      <CardTitle className="text-xl text-foreground flex items-center gap-2">
                        Interview Prep
                        <BetaBadge size="xs" variant="glow" />
                        <Badge variant="secondary" className="ml-auto">
                          {INTERVIEW_PREP_CREDITS} credits
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="space-y-6">
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-2 text-foreground">
                              Job Posting URL <span className="text-destructive">*</span>
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
                              className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-pink-500 hover:border-purple-400 transition-colors"
                              disabled={interviewPrepLoading}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Supports LinkedIn, Indeed, Greenhouse, Lever, Workday, and most career pages. If URL parsing fails, you can enter company and job title manually below.
                            </p>
                          </div>
                          
                          {!showManualInput && !jobPostingUrl.trim() && (
                            <div className="space-y-3">
                              <div className="text-sm text-muted-foreground mb-2">Or enter manually:</div>
                              <div>
                                <label className="block text-sm font-medium mb-2 text-foreground">
                                  Company Name
                                </label>
                                <Input
                                  value={manualCompanyName}
                                  onChange={(e) => setManualCompanyName(e.target.value)}
                                  placeholder="e.g., Google, Amazon, Meta"
                                  className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-pink-500 hover:border-purple-400 transition-colors"
                                  disabled={interviewPrepLoading}
                                />
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium mb-2 text-foreground">
                                  Job Title
                                </label>
                                <Input
                                  value={manualJobTitle}
                                  onChange={(e) => setManualJobTitle(e.target.value)}
                                  placeholder="e.g., Software Engineer, Data Scientist"
                                  className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-pink-500 hover:border-purple-400 transition-colors"
                                  disabled={interviewPrepLoading}
                                />
                              </div>
                            </div>
                          )}
                          
                          {parsedJobDetails && (
                            <div className="bg-muted/30 rounded-xl p-4 border border-border">
                              <p className="text-sm font-semibold text-foreground mb-3">Job Details Preview:</p>
                              <div className="space-y-2 text-sm text-foreground">
                                <div><span className="text-muted-foreground">Company:</span> {parsedJobDetails.company_name}</div>
                                <div><span className="text-muted-foreground">Role:</span> {parsedJobDetails.job_title}</div>
                                {parsedJobDetails.level && (
                                  <div><span className="text-muted-foreground">Level:</span> {parsedJobDetails.level}</div>
                                )}
                                {parsedJobDetails.team_division && (
                                  <div><span className="text-muted-foreground">Team:</span> {parsedJobDetails.team_division}</div>
                                )}
                                {parsedJobDetails.required_skills && parsedJobDetails.required_skills.length > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Key Skills:</span> {parsedJobDetails.required_skills.slice(0, 5).join(', ')}
                                    {parsedJobDetails.required_skills.length > 5 && ` +${parsedJobDetails.required_skills.length - 5} more`}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {showManualInput && (
                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-4">
                              <div className="flex items-start gap-2">
                                <XCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-yellow-800 mb-1">
                                    URL Parsing Failed - Manual Input Required
                                  </p>
                                  <p className="text-xs text-yellow-700/80 mb-3">
                                    We couldn't parse the job posting URL. Please enter the details manually below.
                                  </p>
                                </div>
                              </div>
                              
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-sm font-medium mb-2 text-foreground">
                                    Company Name <span className="text-destructive">*</span>
                                  </label>
                                  <Input
                                    value={manualCompanyName}
                                    onChange={(e) => setManualCompanyName(e.target.value)}
                                    placeholder="e.g., Google, Amazon, Meta"
                                    className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-pink-500 hover:border-purple-400 transition-colors"
                                    disabled={interviewPrepLoading}
                                  />
                                </div>
                                
                                <div>
                                  <label className="block text-sm font-medium mb-2 text-foreground">
                                    Job Title <span className="text-destructive">*</span>
                                  </label>
                                  <Input
                                    value={manualJobTitle}
                                    onChange={(e) => setManualJobTitle(e.target.value)}
                                    placeholder="e.g., Software Engineer, Data Scientist, Product Manager"
                                    className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-pink-500 hover:border-purple-400 transition-colors"
                                    disabled={interviewPrepLoading}
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="bg-muted/30 rounded-xl p-4 border border-border">
                            <p className="text-sm text-foreground mb-2">
                              <span className="font-semibold text-foreground">What you'll receive:</span>
                            </p>
                            <ul className="space-y-1.5 text-sm text-foreground">
                              <li className="flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <span>Company-specific interview process overview</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <span>Common questions grouped by category (Behavioral, Technical, System Design, etc.)</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <span>Success tips from candidates who passed</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <span>Red flags and things to avoid</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <span>Culture insights and work environment details</span>
                              </li>
                            </ul>
                            <p className="text-xs text-muted-foreground mt-3">
                              Uses {INTERVIEW_PREP_CREDITS} credits. Analyzes the job posting, searches Reddit for role-specific interview insights, and generates a comprehensive 5-6 page prep guide tailored to this specific role.
                            </p>
                          </div>

                          <Button
                            onClick={handleInterviewPrepSubmit}
                            disabled={
                              interviewPrepLoading || 
                              effectiveUser.credits < INTERVIEW_PREP_CREDITS ||
                              (!jobPostingUrl.trim() && (!manualCompanyName.trim() || !manualJobTitle.trim()))
                            }
                            className="w-full text-white font-semibold py-6 text-base shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
                          >
                            {interviewPrepLoading ? (
                              <>
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                Generating Interview Prep...
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-5 w-5 mr-2" />
                                Generate Interview Prep
                              </>
                            )}
                          </Button>

                          {interviewPrepStatus !== 'idle' && (
                            <div className="rounded-lg border border-border bg-muted/50 p-4 shadow-inner text-sm text-foreground">
                              <div className="flex items-center gap-2 mb-2">
                                {interviewPrepLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                ) : interviewPrepStatus === 'completed' ? (
                                  <CheckCircle className="h-4 w-4 text-blue-600" />
                                ) : interviewPrepStatus === 'failed' ? (
                                  <XCircle className="h-4 w-4 text-destructive" />
                                ) : null}
                                <span className="font-medium">
                                  {interviewPrepStatus === 'completed' ? 'Ready!' : 
                                   interviewPrepStatus === 'failed' ? 'Failed' : 
                                   'Processing...'}
                                </span>
                              </div>
                              <span className="text-muted-foreground">
                                {interviewPrepProgress || 'Processing your request...'}
                              </span>
                            </div>
                          )}

                          {interviewPrepStatus === 'completed' && interviewPrepResult && (
                            <div className="space-y-4">
                              <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wide">
                                    {interviewPrepResult.jobDetails?.job_title || interviewPrepResult.jobDetails?.company_name || 'Interview Prep'} - {interviewPrepResult.jobDetails?.company_name || ''}
                                  </h3>
                                  <span className="text-xs text-blue-600/80">
                                    Ready to download
                                  </span>
                                </div>
                                
                                {interviewPrepResult.insights && (
                                  <div className="space-y-3 text-sm text-foreground">
                                    {interviewPrepResult.insights.interview_process?.stages && interviewPrepResult.insights.interview_process.stages.length > 0 && (
                                      <div>
                                        <span className="text-muted-foreground">Interview Stages: </span>
                                        {interviewPrepResult.insights.interview_process.stages
                                          .map((stage: any) => typeof stage === 'string' ? stage : stage?.name || 'Stage')
                                          .join(', ')}
                                      </div>
                                    )}
                                    
                                    {interviewPrepResult.insights.common_questions && (
                                      <div>
                                        <span className="text-muted-foreground">Question Categories: </span>
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
                                        <div className="mt-2 text-xs text-muted-foreground">
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
                                                <li key={idx} className="text-foreground">{q}</li>
                                              ));
                                            })()}
                                          </ul>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {interviewPrepResult.insights.sources_count && (
                                      <div>
                                        <span className="text-muted-foreground">Sources: </span>
                                        Analyzed {interviewPrepResult.insights.sources_count} Reddit posts
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <Button
                                onClick={() => downloadInterviewPrepPDF()}
                                className="w-full text-white font-semibold py-6 text-base shadow-lg"
                                style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
                              >
                                <Download className="h-5 w-5 mr-2" />
                                Download Full PDF
                              </Button>
                            </div>
                          )}

                          {interviewPrepStatus === 'failed' && interviewPrepResult?.error && (
                            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
                              <p className="text-sm text-red-700">
                                {interviewPrepResult.error}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="interview-library" className="mt-6">
                  <div className="space-y-6">
                    {libraryLoading ? (
                      <Card className="bg-white border-border">
                        <CardContent className="p-6">
                          <LoadingSkeleton variant="card" count={3} />
                        </CardContent>
                      </Card>
                    ) : preps.length === 0 ? (
                      <div className="rounded-xl border border-border bg-white p-10 text-center space-y-4">
                        <Briefcase className="h-10 w-10 mx-auto text-primary" />
                        <h3 className="text-lg font-semibold text-foreground">No preps yet</h3>
                        <p className="text-sm text-muted-foreground">
                          Generate your first interview prep to see it appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {groupedPreps.inProgress.length > 0 && (
                          <section>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">
                              In Progress
                            </h3>
                            <div className="grid gap-4">
                              {groupedPreps.inProgress.map((prep) => (
                                <div
                                  key={prep.id}
                                  className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-5 py-4 flex items-center justify-between"
                                >
                                  <div>
                                    <p className="text-sm text-foreground font-medium">{prep.companyName}</p>
                                    {prep.jobTitle && (
                                      <p className="text-xs text-muted-foreground">{prep.jobTitle}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Requested {prep.createdAt ? new Date(prep.createdAt).toLocaleString() : ""}
                                    </p>
                                  </div>
                                  <div className="text-xs uppercase text-yellow-600">Processing...</div>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}

                        {groupedPreps.completed.length > 0 && (
                          <section className="space-y-3">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase">
                              Completed ({groupedPreps.completed.length})
                            </h3>
                            <div className="grid gap-4">
                              {groupedPreps.completed.map((prep) => (
                                <div
                                  key={prep.id}
                                  className="rounded-xl border border-border bg-white p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-foreground font-medium">
                                      <BadgeCheck className="h-4 w-4 text-primary" />
                                      {prep.companyName}
                                    </div>
                                    {prep.jobTitle && (
                                      <div className="text-sm text-foreground">
                                        {prep.jobTitle}
                                      </div>
                                    )}
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
                                      className="border-primary text-primary hover:bg-primary/10"
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
              </Tabs>
                </LockedFeatureOverlay>
              ) : (
                <Tabs defaultValue="interview-prep" className="w-full">
                  <div className="flex justify-center mb-8">
                    <TabsList className="h-14 tabs-container-gradient border border-border grid grid-cols-2 max-w-lg w-full rounded-xl p-1 bg-white">
                      <TabsTrigger
                        value="interview-prep"
                        className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                      >
                        <Briefcase className="h-5 w-5 mr-2" />
                        Interview Prep
                      </TabsTrigger>
                      <TabsTrigger
                        value="interview-library"
                        className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                      >
                        <FileText className="h-5 w-5 mr-2" />
                        Interview Library
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="interview-prep" className="mt-6">
                    <Card className="bg-white border-border relative overflow-hidden">
                      <CardHeader className="border-b border-border">
                        <CardTitle className="text-xl text-foreground flex items-center gap-2">
                          Interview Prep
                          <BetaBadge size="xs" variant="glow" />
                          <Badge variant="secondary" className="ml-auto">
                            {INTERVIEW_PREP_CREDITS} credits
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="space-y-6">
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-2 text-foreground">
                                Job Posting URL <span className="text-destructive">*</span>
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
                                className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-pink-500 hover:border-purple-400 transition-colors"
                                disabled={interviewPrepLoading}
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Supports LinkedIn, Indeed, Greenhouse, Lever, Workday, and most career pages. If URL parsing fails, you can enter company and job title manually below.
                              </p>
                            </div>
                            
                            {!showManualInput && !jobPostingUrl.trim() && (
                              <div className="space-y-3">
                                <div className="text-sm text-muted-foreground mb-2">Or enter manually:</div>
                                <div>
                                  <label className="block text-sm font-medium mb-2 text-foreground">
                                    Company Name
                                  </label>
                                  <Input
                                    value={manualCompanyName}
                                    onChange={(e) => setManualCompanyName(e.target.value)}
                                    placeholder="e.g., Google, Amazon, Meta"
                                    className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-pink-500 hover:border-purple-400 transition-colors"
                                    disabled={interviewPrepLoading}
                                  />
                                </div>
                                
                                <div>
                                  <label className="block text-sm font-medium mb-2 text-foreground">
                                    Job Title
                                  </label>
                                  <Input
                                    value={manualJobTitle}
                                    onChange={(e) => setManualJobTitle(e.target.value)}
                                    placeholder="e.g., Software Engineer, Data Scientist"
                                    className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-pink-500 hover:border-purple-400 transition-colors"
                                    disabled={interviewPrepLoading}
                                  />
                                </div>
                              </div>
                            )}
                            
                            {parsedJobDetails && (
                              <div className="bg-muted/30 rounded-xl p-4 border border-border">
                                <p className="text-sm font-semibold text-foreground mb-3">Job Details Preview:</p>
                                <div className="space-y-2 text-sm text-foreground">
                                  <div><span className="text-muted-foreground">Company:</span> {parsedJobDetails.company_name}</div>
                                  <div><span className="text-muted-foreground">Role:</span> {parsedJobDetails.job_title}</div>
                                  {parsedJobDetails.level && (
                                    <div><span className="text-muted-foreground">Level:</span> {parsedJobDetails.level}</div>
                                  )}
                                  {parsedJobDetails.team_division && (
                                    <div><span className="text-muted-foreground">Team:</span> {parsedJobDetails.team_division}</div>
                                  )}
                                  {parsedJobDetails.required_skills && parsedJobDetails.required_skills.length > 0 && (
                                    <div>
                                      <span className="text-muted-foreground">Key Skills:</span> {parsedJobDetails.required_skills.slice(0, 5).join(', ')}
                                      {parsedJobDetails.required_skills.length > 5 && ` +${parsedJobDetails.required_skills.length - 5} more`}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {showManualInput && (
                              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-4">
                                <div className="flex items-start gap-2">
                                  <XCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-sm font-semibold text-yellow-800 mb-1">
                                      URL Parsing Failed - Manual Input Required
                                    </p>
                                    <p className="text-xs text-yellow-700/80 mb-3">
                                      We couldn't parse the job posting URL. Please enter the details manually below.
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-sm font-medium mb-2 text-foreground">
                                      Company Name <span className="text-destructive">*</span>
                                    </label>
                                    <Input
                                      value={manualCompanyName}
                                      onChange={(e) => setManualCompanyName(e.target.value)}
                                      placeholder="e.g., Google, Amazon, Meta"
                                      className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-pink-500 hover:border-purple-400 transition-colors"
                                      disabled={interviewPrepLoading}
                                    />
                                  </div>
                                  
                                  <div>
                                    <label className="block text-sm font-medium mb-2 text-foreground">
                                      Job Title <span className="text-destructive">*</span>
                                    </label>
                                    <Input
                                      value={manualJobTitle}
                                      onChange={(e) => setManualJobTitle(e.target.value)}
                                      placeholder="e.g., Software Engineer, Data Scientist, Product Manager"
                                      className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-pink-500 hover:border-purple-400 transition-colors"
                                      disabled={interviewPrepLoading}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="bg-muted/30 rounded-xl p-4 border border-border">
                              <p className="text-sm text-foreground mb-2">
                                <span className="font-semibold text-foreground">What you'll receive:</span>
                              </p>
                              <ul className="space-y-1.5 text-sm text-foreground">
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                  <span>Company-specific interview process overview</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                  <span>Common questions grouped by category (Behavioral, Technical, System Design, etc.)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                  <span>Success tips from candidates who passed</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                  <span>Red flags and things to avoid</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                  <span>Culture insights and work environment details</span>
                                </li>
                              </ul>
                              <p className="text-xs text-muted-foreground mt-3">
                                Uses {INTERVIEW_PREP_CREDITS} credits. Analyzes the job posting, searches Reddit for role-specific interview insights, and generates a comprehensive 5-6 page prep guide tailored to this specific role.
                              </p>
                            </div>

                            <Button
                              onClick={handleInterviewPrepSubmit}
                              disabled={
                                interviewPrepLoading || 
                                effectiveUser.credits < INTERVIEW_PREP_CREDITS ||
                                (!jobPostingUrl.trim() && (!manualCompanyName.trim() || !manualJobTitle.trim()))
                              }
                              className="w-full text-white font-semibold py-6 text-base shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
                            >
                              {interviewPrepLoading ? (
                                <>
                                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                  Generating Interview Prep...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-5 w-5 mr-2" />
                                  Generate Interview Prep
                                </>
                              )}
                            </Button>

                            {interviewPrepStatus !== 'idle' && (
                              <div className="rounded-lg border border-border bg-muted/50 p-4 shadow-inner text-sm text-foreground">
                                <div className="flex items-center gap-2 mb-2">
                                  {interviewPrepLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                  ) : interviewPrepStatus === 'completed' ? (
                                    <CheckCircle className="h-4 w-4 text-blue-600" />
                                  ) : interviewPrepStatus === 'failed' ? (
                                    <XCircle className="h-4 w-4 text-destructive" />
                                  ) : null}
                                  <span className="font-medium">
                                    {interviewPrepStatus === 'completed' ? 'Ready!' : 
                                     interviewPrepStatus === 'failed' ? 'Failed' : 
                                     'Processing...'}
                                  </span>
                                </div>
                                <span className="text-muted-foreground">
                                  {interviewPrepProgress || 'Processing your request...'}
                                </span>
                              </div>
                            )}

                            {interviewPrepStatus === 'completed' && interviewPrepResult && (
                              <div className="space-y-4">
                                <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-5 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wide">
                                      {interviewPrepResult.jobDetails?.job_title || interviewPrepResult.jobDetails?.company_name || 'Interview Prep'} - {interviewPrepResult.jobDetails?.company_name || ''}
                                    </h3>
                                    <span className="text-xs text-blue-600/80">
                                      Ready to download
                                    </span>
                                  </div>
                                  
                                  {interviewPrepResult.insights && (
                                    <div className="space-y-3 text-sm text-foreground">
                                      {interviewPrepResult.insights.interview_process?.stages && interviewPrepResult.insights.interview_process.stages.length > 0 && (
                                        <div>
                                          <span className="text-muted-foreground">Interview Stages: </span>
                                          {interviewPrepResult.insights.interview_process.stages
                                            .map((stage: any) => typeof stage === 'string' ? stage : stage?.name || 'Stage')
                                            .join(', ')}
                                        </div>
                                      )}
                                      
                                      {interviewPrepResult.insights.common_questions && (
                                        <div>
                                          <span className="text-muted-foreground">Question Categories: </span>
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
                                        </div>
                                      )}
                                      
                                      {interviewPrepResult.insights.sources_count && (
                                        <div>
                                          <span className="text-muted-foreground">Sources: </span>
                                          Analyzed {interviewPrepResult.insights.sources_count} Reddit posts
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <Button
                                  onClick={() => downloadInterviewPrepPDF()}
                                  className="w-full text-white font-semibold py-6 text-base shadow-lg"
                                  style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
                                >
                                  <Download className="h-5 w-5 mr-2" />
                                  Download Full PDF
                                </Button>
                              </div>
                            )}

                            {interviewPrepStatus === 'failed' && interviewPrepResult?.error && (
                              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
                                <p className="text-sm text-red-700">
                                  {interviewPrepResult.error}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="interview-library" className="mt-6">
                    <div className="space-y-6">
                      {libraryLoading ? (
                        <Card className="bg-white border-border">
                          <CardContent className="p-6">
                            <LoadingSkeleton variant="card" count={3} />
                          </CardContent>
                        </Card>
                      ) : preps.length === 0 ? (
                        <div className="rounded-xl border border-border bg-white p-10 text-center space-y-4">
                          <Briefcase className="h-10 w-10 mx-auto text-primary" />
                          <h3 className="text-lg font-semibold text-foreground">No preps yet</h3>
                          <p className="text-sm text-muted-foreground">
                            Generate your first interview prep to see it appear here.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {groupedPreps.inProgress.length > 0 && (
                            <section>
                              <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">
                                In Progress
                              </h3>
                              <div className="grid gap-4">
                                {groupedPreps.inProgress.map((prep) => (
                                  <div
                                    key={prep.id}
                                    className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-5 py-4 flex items-center justify-between"
                                  >
                                    <div>
                                      <p className="text-sm text-foreground font-medium">{prep.companyName}</p>
                                      {prep.jobTitle && (
                                        <p className="text-xs text-muted-foreground">{prep.jobTitle}</p>
                                      )}
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Requested {prep.createdAt ? new Date(prep.createdAt).toLocaleString() : ""}
                                      </p>
                                    </div>
                                    <div className="text-xs uppercase text-yellow-600">Processing...</div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {groupedPreps.completed.length > 0 && (
                            <section className="space-y-3">
                              <h3 className="text-sm font-semibold text-muted-foreground uppercase">
                                Completed ({groupedPreps.completed.length})
                              </h3>
                              <div className="grid gap-4">
                                {groupedPreps.completed.map((prep) => (
                                  <div
                                    key={prep.id}
                                    className="rounded-xl border border-border bg-white p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 text-sm text-foreground font-medium">
                                        <BadgeCheck className="h-4 w-4 text-primary" />
                                        {prep.companyName}
                                      </div>
                                      {prep.jobTitle && (
                                        <div className="text-sm text-foreground">
                                          {prep.jobTitle}
                                        </div>
                                      )}
                                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
                                        className="border-primary text-primary hover:bg-primary/10"
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
                </Tabs>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default InterviewPrepPage;

