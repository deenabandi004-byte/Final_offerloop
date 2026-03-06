import React, { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Coffee,
  Download,
  Trash2,
  BadgeCheck,
  MapPin,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Linkedin,
  MessageSquare,
  FileText,
  Newspaper,
  Loader2,
  AlertCircle,
  Upload,
  FolderOpen,
} from "lucide-react";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { VideoDemo } from "@/components/VideoDemo";
import { ProGate } from "@/components/ProGate";
import { apiService } from "@/services/api";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import type { CoffeeChatPrep, CoffeeChatPrepStatus } from "@/services/api";
import { InlineLoadingBar, SteppedLoadingBar } from "@/components/ui/LoadingBar";
import { toast } from "@/hooks/use-toast";
import { COFFEE_CHAT_CREDITS } from "@/lib/constants";
import { flushSync } from "react-dom";
import { logActivity, generateCoffeeChatPrepSummary } from "@/utils/activityLogger";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useSubscription } from "@/hooks/useSubscription";
import { canUseFeature, getFeatureLimit } from "@/utils/featureAccess";
import { trackFeatureActionCompleted, trackContentViewed, trackError } from "../lib/analytics";

const CoffeeChatPrepPage: React.FC = () => {
  const { user: firebaseUser, checkCredits } = useFirebaseAuth();
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  const effectiveUser = firebaseUser || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;
  
  // Check if user has access to coffee chat prep based on remaining uses
  const currentUsage = subscription?.coffeeChatPrepsUsed || 0;
  const tier = subscription?.tier || effectiveUser.tier || 'free';
  const limit = getFeatureLimit(tier, 'coffeeChatPreps');
  const hasMonthlyAccess = subscription 
    ? canUseFeature(
        subscription.tier,
        'coffeeChatPreps',
        currentUsage
      )
    : effectiveUser.tier === 'elite';
  
  const hasEnoughCredits = (effectiveUser.credits ?? 0) >= COFFEE_CHAT_CREDITS;
  const hasAccess = hasMonthlyAccess && hasEnoughCredits;

  // Coffee Chat Generation State
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [coffeeChatLoading, setCoffeeChatLoading] = useState(false);
  const [coffeeChatProgress, setCoffeeChatProgress] = useState<string>("");
  const [coffeeChatPrepId, setCoffeeChatPrepId] = useState<string | null>(null);
  const [coffeeChatResult, setCoffeeChatResult] = useState<CoffeeChatPrepStatus | null>(null);
  const [coffeeChatStatus, setCoffeeChatStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [currentPrepStatus, setCurrentPrepStatus] = useState<string>('pending');
  
  const coffeeChatSteps = [
    { id: 'processing', label: 'Initializing...' },
    { id: 'enriching', label: 'Looking up LinkedIn profile...' },
    { id: 'researching', label: 'Researching company & industry...' },
    { id: 'analyzing', label: 'Analyzing career history...' },
    { id: 'generating', label: 'Writing tailored questions...' },
    { id: 'building', label: 'Building your prep sheet...' },
    { id: 'completed', label: 'Complete!' },
  ];
  const coffeeChatPollTimeoutRef = useRef<number | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Library State
  const [preps, setPreps] = useState<CoffeeChatPrep[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("coffee-chat-prep");

  // LinkedIn URL validation
  const isValidLinkedInUrl = (url: string) => {
    return url.match(/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/);
  };

  const coffeeChatTabs = [
    { id: 'coffee-chat-prep', label: 'Coffee Chat Prep', icon: MessageSquare },
    { id: 'coffee-library', label: 'Coffee Library', icon: FolderOpen },
  ];

  useLayoutEffect(() => {
    const activeIndex = coffeeChatTabs.findIndex(t => t.id === activeTab);
    const el = tabRefs.current[activeIndex];
    if (el) {
      setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeTab]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (coffeeChatPollTimeoutRef.current) {
        clearTimeout(coffeeChatPollTimeoutRef.current);
        coffeeChatPollTimeoutRef.current = null;
      }
    };
  }, []);

  // Load library preps
  useEffect(() => {
    const loadPreps = async () => {
      try {
        const result = await apiService.getAllCoffeeChatPreps();
        if ("error" in result) {
          throw new Error(result.error);
        }
        setPreps(result.preps || []);
      } catch (error) {
        console.error("Failed to load coffee chat preps:", error);
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

  // Refresh library after successful generation
  useEffect(() => {
    if (coffeeChatStatus === 'completed' && coffeeChatPrepId) {
      const loadPreps = async () => {
        try {
          const result = await apiService.getAllCoffeeChatPreps();
          if ("error" in result) {
            return;
          }
          setPreps(result.preps || []);
        } catch (error) {
          // Silent fail on refresh
        }
      };
      loadPreps();
    }
  }, [coffeeChatStatus, coffeeChatPrepId]);

  const handleCoffeeChatSubmit = async () => {
    if (!linkedinUrl.trim()) {
      toast({
        title: "Missing LinkedIn URL",
        description: "Please enter a LinkedIn profile URL.",
        variant: "destructive",
      });
      return;
    }

    if (!firebaseUser) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to continue.",
        variant: "destructive",
      });
      return;
    }

    if ((effectiveUser.credits ?? 0) < COFFEE_CHAT_CREDITS) {
      toast({
        title: "Insufficient Credits",
        description: `You need ${COFFEE_CHAT_CREDITS} credits to generate a coffee chat prep.`,
        variant: "destructive",
      });
      return;
    }

    setCoffeeChatLoading(true);
    setCoffeeChatStatus('processing');
    setCurrentPrepStatus('processing');
    setCoffeeChatProgress('Starting Coffee Chat Prep...');
    setCoffeeChatResult(null);

    try {
      const result = await apiService.createCoffeeChatPrep({ linkedinUrl });
      
      if ('error' in result) {
        throw new Error(result.error);
      }

      const prepId = result.prepId;
      setCoffeeChatPrepId(prepId);
      
      let pollCount = 0;
      const maxPolls = 200;
      
      const handleStatusUpdate = (statusResult: any) => {
        if ('status' in statusResult) {
          const stage = statusResult.stage || statusResult.status;
          setCurrentPrepStatus(stage);

          // Use stageLabel from backend if available, otherwise fallback
          const progressMessage = statusResult.stageLabel || (() => {
            const statusMessages: Record<string, string> = {
              'processing': 'Initializing...',
              'enriching': 'Looking up LinkedIn profile...',
              'researching': 'Researching company & industry...',
              'analyzing': 'Analyzing career history...',
              'generating': 'Writing tailored questions...',
              'building': 'Building your prep sheet...',
              'completed': 'Coffee Chat Prep ready!',
              'failed': 'Generation failed',
            };
            return statusMessages[stage] || 'Processing...';
          })();
          setCoffeeChatProgress(progressMessage);
        }
      };
      
      const handleCompletion = (statusResult: any) => {
        const contactData = statusResult.contactData || {};
        if (firebaseUser?.uid && statusResult.contactData) {
          try {
            const contactName = statusResult.contactData.name ||
                               `${statusResult.contactData.firstName || ''} ${statusResult.contactData.lastName || ''}`.trim() ||
                               '';
            const company = statusResult.contactData.company || statusResult.contactData.companyName || '';
            const summary = generateCoffeeChatPrepSummary({
              contactName: contactName || undefined,
              company: company || undefined,
            });
            logActivity(firebaseUser.uid, 'coffeePrep', summary, {
              prepId: prepId,
              linkedinUrl: linkedinUrl,
              contactName: contactName || '',
              company: company || '',
            }).catch(err => console.error('Failed to log activity:', err));
          } catch (error) {
            console.error('Failed to log coffee chat prep activity:', error);
          }
        }
        
        flushSync(() => {
          setCoffeeChatLoading(false);
          setCoffeeChatStatus('completed');
          setCoffeeChatProgress('Coffee Chat Prep ready!');
          setCoffeeChatResult(statusResult as CoffeeChatPrepStatus);
          setCoffeeChatPrepId((statusResult as any).id || prepId);
        });
        
        trackFeatureActionCompleted('coffee_chat_prep', 'generate', true, {
          company: contactData.company || contactData.companyName || '',
          role: contactData.jobTitle || contactData.title || undefined,
        });
        
        toast({
          title: "Coffee Chat Prep Ready!",
          description: "Your one-pager has been generated successfully.",
          duration: 5000,
        });
        
        checkCredits?.();
      };
      
      const pollPromise = new Promise((resolve, reject) => {
        let pollInterval = 3000;
        const maxInterval = 10000;
        let polling = false;
        let stopped = false;

        const doPoll = async () => {
          if (polling || stopped) return;
          polling = true;
          pollCount++;
          try {
            const statusResult = await apiService.getCoffeeChatPrepStatus(prepId);

            if ('error' in statusResult && !('status' in statusResult)) {
              stopped = true;
              reject(new Error(statusResult.error));
              return;
            }

            if ('pdfUrl' in statusResult && statusResult.pdfUrl) {
              stopped = true;
              handleCompletion(statusResult);
              resolve(statusResult);
              return;
            }

            handleStatusUpdate(statusResult);
            // Reset interval on success
            pollInterval = 3000;

            if (pollCount >= maxPolls) {
              stopped = true;
              reject(new Error('Generation timed out'));
              return;
            }
          } catch (error: any) {
            // Exponential backoff on 429
            if (error?.message?.includes('429') || error?.status === 429) {
              pollInterval = Math.min(pollInterval * 2, maxInterval);
              console.warn(`[CoffeeChatPrep] 429 — backing off to ${pollInterval}ms`);
            } else {
              stopped = true;
              reject(error);
              return;
            }
          } finally {
            polling = false;
          }
          if (!stopped) schedulePoll();
        };

        const schedulePoll = () => {
          if (stopped) return;
          setTimeout(doPoll, pollInterval);
        };

        // Initial poll immediately
        doPoll();
      });
      
      await pollPromise;
      
    } catch (error: any) {
      console.error('Coffee chat prep failed:', error);
      setCoffeeChatStatus('failed');
      setCoffeeChatProgress('Generation failed');
      trackError('coffee_chat_prep', 'generate', 'api_error', error.message);
      toast({
        title: "Generation Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCoffeeChatLoading(false);
    }
  };

  const downloadCoffeeChatPDF = async (prepId?: string) => {
    const id = prepId || coffeeChatPrepId;
    if (!id || !firebaseUser) return;

    try {
      const MAX_TRIES = 20;
      const DELAY_MS = 1000;
      let pdfUrl: string | undefined;
      let contactName: string | undefined;

      toast({
        title: "Preparing PDF",
        description: "Please wait while we prepare your Coffee Chat PDF...",
        duration: 3000,
      });

      for (let i = 0; i < MAX_TRIES; i++) {
        try {
          const res = await apiService.downloadCoffeeChatPDF(id);
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

      // Get contact name from result if available, or from coffeeChatResult
      if (coffeeChatResult?.contactData) {
        const firstName = coffeeChatResult.contactData.firstName || '';
        const lastName = coffeeChatResult.contactData.lastName || '';
        contactName = `${firstName} ${lastName}`.trim() || undefined;
      }

      const sanitizeForFilename = (str: string): string => {
        return str
          .replace(/[^a-zA-Z0-9\s-]/g, '')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 50);
      };

      const name = contactName ? sanitizeForFilename(contactName) : 'Contact';
      const filename = `Oloop_coffeechat_${name}.pdf`;

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
        
        trackContentViewed('coffee_chat_prep', 'pdf', id);
        
        toast({
          title: "PDF Downloaded",
          description: "Your Coffee Chat Prep PDF has been downloaded.",
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
        
        trackContentViewed('coffee_chat_prep', 'pdf', id);
        
        toast({
          title: "PDF Download Started",
          description: "Your Coffee Chat Prep PDF download has started.",
          duration: 3000,
        });
      }
    } catch (err) {
      trackError('coffee_chat_prep', 'download', 'network_error', err instanceof Error ? err.message : undefined);
      toast({
        title: "Download Failed",
        description: err instanceof Error ? err.message : "Could not download the PDF.",
        variant: "destructive",
      });
    }
  };

  const handleLibraryDownload = async (prep: CoffeeChatPrep) => {
    try {
      const pdfUrl = prep.pdfUrl || (await apiService.downloadCoffeeChatPDF(prep.id)).pdfUrl;
      
      if (!pdfUrl) {
        throw new Error("PDF URL not available yet");
      }

      const sanitizeForFilename = (str: string): string => {
        return str
          .replace(/[^a-zA-Z0-9\s-]/g, '')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 50);
      };

      const contactName = prep.contactName || 'Contact';
      const name = sanitizeForFilename(contactName);
      const filename = `Oloop_coffeechat_${name}.pdf`;

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
        
        trackContentViewed('coffee_chat_prep', 'pdf', prep.id);
        
        toast({
          title: "PDF Downloaded",
          description: "Your Coffee Chat Prep PDF has been downloaded.",
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
        
        trackContentViewed('coffee_chat_prep', 'pdf', prep.id);
        
        toast({
          title: "PDF Download Started",
          description: "Your Coffee Chat Prep PDF download has started.",
          duration: 3000,
        });
      }
    } catch (error) {
      trackError('coffee_chat_prep', 'download', 'network_error', error instanceof Error ? error.message : undefined);
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not download the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLibraryDelete = async (prepId: string) => {
    setDeletingId(prepId);
    try {
      const result = await apiService.deleteCoffeeChatPrep(prepId);
      if ("error" in result) {
        throw new Error(result.error);
      }
      setPreps((prev) => prev.filter((prep) => prep.id !== prepId));
      toast({
        title: "Prep deleted",
        description: "Removed from your Coffee Chat Library.",
      });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
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

          <ProGate title="Coffee Chat Prep" description="Get AI-generated talking points, background research, and conversation starters for any professional — just paste their LinkedIn." videoId="D1--4aVisho">
          <main data-tour="tour-coffee-chat-prep" style={{ background: '#F8FAFF', flex: 1, overflowY: 'auto' }}>
            <div className="max-w-4xl mx-auto px-3 py-6 sm:px-6 sm:py-12">
              
              {/* Header Section */}
              <div className="w-full px-3 py-6 sm:px-6 sm:py-12 !pb-0" style={{ maxWidth: '900px', margin: '0 auto' }}>
                <h1
                  className="text-[28px] sm:text-[42px]"
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontWeight: 400,
                    letterSpacing: '-0.025em',
                    color: '#0F172A',
                    textAlign: 'center',
                    marginBottom: '10px',
                    lineHeight: 1.1,
                  }}
                >
                  Coffee Chat Prep
                </h1>
                <p
                  style={{
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontSize: '16px',
                    color: '#64748B',
                    textAlign: 'center',
                    marginBottom: '28px',
                    lineHeight: 1.5,
                  }}
                >
                  Paste a LinkedIn URL and get a personalized prep sheet with talking points, recent news, and smart questions.
                </p>
              </div>

              {/* Animated underline tabs — matches Find page StripeTabs */}
              <div className="flex justify-center mb-9">
              <div className="relative">
                <div className="flex items-center gap-8">
                  {coffeeChatTabs.map((tab, index) => (
                    <button
                      key={tab.id}
                      ref={(el) => { tabRefs.current[index] = el; }}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        relative pb-2.5 text-sm transition-colors duration-150 flex items-center gap-1.5
                        focus:outline-none focus-visible:outline-none
                        ${activeTab === tab.id
                          ? 'text-gray-900 font-bold'
                          : 'text-gray-400 hover:text-gray-700 font-medium'
                        }
                      `}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  ))}
                </div>
                {/* Full-width divider line */}
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gray-200" />
                {/* Animated underline indicator */}
                <div
                  className="absolute bottom-0 h-[2px] bg-gray-900 transition-all duration-200 ease-out"
                  style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
                />
              </div>
              </div>

              <div className="flex justify-center mb-6">
                <VideoDemo videoId="D1--4aVisho" />
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                {/* COFFEE CHAT PREP TAB */}
                <TabsContent value="coffee-chat-prep" className="mt-0">
                  {!hasAccess && (
                    <div className="mb-6 animate-fadeInUp" style={{ animationDelay: '150ms' }}>
                      <UpgradeBanner
                        hasExhaustedLimit={!hasMonthlyAccess}
                        hasEnoughCredits={hasEnoughCredits}
                        currentUsage={currentUsage}
                        limit={limit}
                        tier={tier}
                        requiredCredits={COFFEE_CHAT_CREDITS}
                        currentCredits={effectiveUser.credits ?? 0}
                        featureName="Coffee Chat Preps"
                        nextTier={subscription?.tier === 'free' ? 'Pro' : 'Elite'}
                        showUpgradeButton={!hasMonthlyAccess || !hasEnoughCredits}
                      />
                    </div>
                  )}

                  <div className="animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                      {/* Enhanced URL Input with Integrated Button */}
                      <div className="max-w-2xl mx-auto">
                        <div className="relative flex items-center group">
                          {/* LinkedIn icon inside input */}
                          <div className="absolute left-3 pointer-events-none">
                            <Linkedin className="w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                          </div>

                          <input
                            type="url"
                            value={linkedinUrl}
                            onChange={(e) => setLinkedinUrl(e.target.value)}
                            placeholder="https://linkedin.com/in/username"
                            disabled={coffeeChatLoading || !hasAccess}
                            className="w-full pl-10 pr-36 h-[46px] text-[13.5px] border border-gray-200 rounded-xl
                                       text-gray-900 placeholder-gray-300 bg-white
                                       hover:border-gray-300
                                       focus:border-blue-300 focus:ring-2 focus:ring-blue-400/10
                                       transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                          />
                          
                          {/* Button inside input */}
                          <button
                            onClick={handleCoffeeChatSubmit}
                            disabled={!linkedinUrl.trim() || coffeeChatLoading || !hasAccess || (effectiveUser.credits ?? 0) < COFFEE_CHAT_CREDITS}
                            className={`
                              absolute right-2 px-5 py-2 rounded-full font-semibold text-sm
                              flex items-center gap-2 transition-all duration-150
                              ${linkedinUrl.trim() && !coffeeChatLoading && hasAccess
                                ? 'bg-blue-600 text-white shadow-md hover:shadow-lg hover:scale-[1.02]'
                                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                              }
                            `}
                          >
                            {coffeeChatLoading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                Generate Prep
                              </>
                            )}
                          </button>
                        </div>
                        
                        {/* Validation + helper — 2 lines max */}
                        <div className="text-center mt-2 space-y-0.5">
                          {linkedinUrl && !isValidLinkedInUrl(linkedinUrl) && linkedinUrl.length > 10 ? (
                            <p className="text-xs text-red-500 flex items-center justify-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Please enter a valid LinkedIn profile URL
                            </p>
                          ) : linkedinUrl && isValidLinkedInUrl(linkedinUrl) ? (
                            <p className="text-xs text-green-600 flex items-center justify-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Valid LinkedIn URL — ready to generate
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400">Uses {COFFEE_CHAT_CREDITS} credits · PDF saved automatically</p>
                          )}
                          {subscription?.resumeFileName ? (
                            <p className="text-xs text-center">
                              <span className="text-green-600 font-medium">✓ Using {subscription.resumeFileName}</span>
                              <span className="text-gray-400"> — questions personalized to your background</span>
                            </p>
                          ) : (
                            <p className="text-xs text-center">
                              <span className="text-amber-500">⚠ No resume on file</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Progress/Status Display */}
                      {coffeeChatStatus !== 'idle' && (
                        <div className="mt-6 max-w-2xl mx-auto">
                          {coffeeChatStatus === 'completed' ? (
                            <div className="mt-5 flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl animate-in fade-in">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-green-50 border border-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    {coffeeChatResult?.contactData?.firstName} {coffeeChatResult?.contactData?.lastName} — prep sheet ready
                                  </p>
                                  <p className="text-xs text-gray-400">{coffeeChatResult?.contactData?.company}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => downloadCoffeeChatPDF()}
                                className="px-4 py-2 bg-green-600 text-white text-xs font-semibold rounded-full hover:bg-green-700 transition-colors flex items-center gap-1.5 shadow-sm"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download PDF
                              </button>
                            </div>
                          ) : coffeeChatStatus === 'failed' ? (
                            <div className="flex items-center justify-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                              <XCircle className="h-5 w-5" />
                              <span>{coffeeChatProgress || 'Generation failed'}</span>
                            </div>
                          ) : (
                            <div className="mt-5 space-y-2.5">
                              <SteppedLoadingBar steps={coffeeChatSteps} currentStepId={currentPrepStatus} />
                              <p className="text-xs text-gray-400 text-center">Usually 20–35 seconds</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* What You'll Receive Section */}
                      {coffeeChatStatus !== 'completed' && (
                        <div className="mt-8 pt-6 border-t border-gray-100">
                          <p className="text-center text-xs text-gray-400 mb-5">Includes curated headlines, talking points, and a PDF prep sheet</p>
                          <div className="flex items-start justify-center gap-10 max-w-2xl mx-auto">
                            <div className="flex flex-col items-center gap-1.5 text-center">
                              <div className="w-8 h-8 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center">
                                <Newspaper className="w-4 h-4 text-gray-400" />
                              </div>
                              <p className="text-xs font-medium text-gray-700">Curated Headlines</p>
                              <p className="text-[11px] text-gray-400">Recent news</p>
                            </div>
                            <div className="flex flex-col items-center gap-1.5 text-center">
                              <div className="w-8 h-8 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center">
                                <MessageSquare className="w-4 h-4 text-gray-400" />
                              </div>
                              <p className="text-xs font-medium text-gray-700">Talking Points</p>
                              <p className="text-[11px] text-gray-400">Similarity summary</p>
                            </div>
                            <div className="flex flex-col items-center gap-1.5 text-center">
                              <div className="w-8 h-8 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center">
                                <FileText className="w-4 h-4 text-gray-400" />
                              </div>
                              <p className="text-xs font-medium text-gray-700">PDF Prep Sheet</p>
                              <p className="text-[11px] text-gray-400">Auto-saved</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Recent Preps from Library */}
                      {recentPreps.length > 0 && coffeeChatStatus !== 'completed' && (
                        <div className="mt-10 pt-8 border-t border-gray-100">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-gray-700">Recent Prep Sheets</h3>
                            <button 
                              onClick={() => setActiveTab('coffee-library')}
                              className="text-sm text-blue-600 hover:underline"
                            >
                              View all ({preps.length})
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {recentPreps.map((prep) => (
                              <div 
                                key={prep.id}
                                onClick={() => handleLibraryDownload(prep)}
                                className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer transition-colors group"
                              >
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center border border-gray-200">
                                    <MessageSquare className="h-4 w-4 text-gray-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 text-sm truncate">{prep.contactName}</p>
                                    <p className="text-xs text-gray-500 truncate">{prep.company}</p>
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

                      {/* Resume status — matches Find page style */}
                      <div className="flex justify-center mt-8 pt-6 border-t border-gray-100">
                        {subscription?.resumeFileName ? (
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-green-50 border border-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900">Resume Active</p>
                                <span className="text-[10px] font-bold tracking-wider uppercase bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                  Optimizing
                                </span>
                              </div>
                              <p className="text-sm text-gray-500">
                                Using <span className="font-medium text-gray-700">{subscription.resumeFileName}</span>
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-4 cursor-pointer group" onClick={() => navigate('/settings')}>
                            <div className="w-10 h-10 bg-gray-50 border border-gray-200 rounded-full flex items-center justify-center group-hover:bg-blue-50 group-hover:border-blue-200 transition-colors">
                              <Upload className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">Upload Resume</p>
                              <p className="text-sm text-gray-500">For personalized questions</p>
                            </div>
                          </div>
                        )}
                      </div>
                  </div>
                </TabsContent>

                {/* COFFEE LIBRARY TAB */}
                <TabsContent value="coffee-library" className="mt-0">
                  <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                    <div className="h-1 bg-gray-100"></div>
                    
                    <div className="p-8">
                      {libraryLoading ? (
                        <LoadingSkeleton variant="card" count={3} />
                      ) : preps.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Coffee className="h-8 w-8 text-gray-600" />
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">No preps yet</h3>
                          <p className="text-sm text-gray-500 mb-6">
                            Generate your first coffee chat prep to see it appear here.
                          </p>
                          <button
                            onClick={() => setActiveTab('coffee-chat-prep')}
                            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:shadow-lg transition-all"
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
                                    className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between"
                                  >
                                    <div>
                                      <p className="font-medium text-gray-900">{prep.contactName}</p>
                                      <p className="text-sm text-gray-600">
                                        {prep.jobTitle} @ {prep.company}
                                      </p>
                                      <p className="text-xs text-gray-400 mt-1">
                                        Requested {prep.createdAt ? new Date(prep.createdAt).toLocaleString() : ""}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600">
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
                                        <span className="font-semibold text-gray-900">{prep.contactName}</span>
                                      </div>
                                      <p className="text-sm text-gray-600">
                                        {prep.jobTitle} @ {prep.company}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : "—"}
                                        </span>
                                        {prep.hometown && (
                                          <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {prep.hometown}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={() => handleLibraryDownload(prep)}
                                        className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium hover:bg-blue-200 transition-colors flex items-center gap-2"
                                      >
                                        <Download className="h-4 w-4" />
                                        PDF
                                      </button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="relative overflow-hidden text-red-500 hover:text-red-600 hover:bg-red-50 rounded-full"
                                        disabled={deletingId === prep.id}
                                        onClick={() => handleLibraryDelete(prep.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        <InlineLoadingBar isLoading={deletingId === prep.id} />
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
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </main>
          </ProGate>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default CoffeeChatPrepPage;
