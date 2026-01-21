import React, { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { UpgradeBanner } from "@/components/UpgradeBanner";
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

const CoffeeChatPrepPage: React.FC = () => {
  const { user: firebaseUser, checkCredits } = useFirebaseAuth();
  const { subscription } = useSubscription();
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
    : effectiveUser.tier === 'elite'; // Default to allowing if no subscription data yet
  
  // Also check if user has enough credits
  const hasEnoughCredits = (effectiveUser.credits ?? 0) >= COFFEE_CHAT_CREDITS;
  
  // User has access only if they have both monthly limit AND credits
  const hasAccess = hasMonthlyAccess && hasEnoughCredits;

  // Coffee Chat Generation State
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [coffeeChatLoading, setCoffeeChatLoading] = useState(false);
  const [coffeeChatProgress, setCoffeeChatProgress] = useState<string>("");
  const [coffeeChatPrepId, setCoffeeChatPrepId] = useState<string | null>(null);
  const [coffeeChatResult, setCoffeeChatResult] = useState<CoffeeChatPrepStatus | null>(null);
  const [coffeeChatStatus, setCoffeeChatStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [currentPrepStatus, setCurrentPrepStatus] = useState<string>('pending');
  
  // Coffee Chat Prep steps for SteppedLoadingBar
  // Must match backend status updates exactly
  const coffeeChatSteps = [
    { id: 'processing', label: 'Initializing...' },
    { id: 'enriching_profile', label: 'Enriching profile data...' },
    { id: 'fetching_news', label: 'Fetching recent news...' },
    { id: 'building_context', label: 'Building user context...' },
    { id: 'extracting_hometown', label: 'Extracting location...' },
    { id: 'generating_content', label: 'Generating content...' },
    { id: 'generating_pdf', label: 'Generating PDF...' },
    { id: 'completed', label: 'Complete!' },
  ];
  const [renderKey, setRenderKey] = useState(0);
  const coffeeChatPollTimeoutRef = useRef<number | null>(null);

  // Library State
  const [preps, setPreps] = useState<CoffeeChatPrep[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    setCurrentPrepStatus('processing'); // Start with 'processing' status to match backend initial status
    setCoffeeChatProgress('Starting Coffee Chat Prep...');
    setCoffeeChatResult(null);
    setRenderKey((prev: number) => prev + 1);

    try {
      const result = await apiService.createCoffeeChatPrep({ linkedinUrl });
      
      if ('error' in result) {
        throw new Error(result.error);
      }

      const prepId = result.prepId;
      setCoffeeChatPrepId(prepId);
      
      let pollCount = 0;
      const maxPolls = 200;
      
      // Helper to handle status updates
      const handleStatusUpdate = (statusResult: any) => {
        if ('status' in statusResult) {
          const status = statusResult.status;
          console.log(`[CoffeeChatPrep] Status update: ${status}`);
          setCurrentPrepStatus(status);
          
          const statusMessages: Record<string, string> = {
            'processing': 'Initializing...',
            'enriching_profile': 'Enriching profile data...',
            'fetching_news': 'Fetching recent news...',
            'building_context': 'Building user context...',
            'extracting_hometown': 'Extracting location...',
            'generating_content': 'Generating content...',
            'generating_pdf': 'Generating PDF...',
            'completed': 'Coffee Chat Prep ready!',
            'failed': 'Generation failed',
          };
          const progressMessage = statusMessages[status] || 'Processing...';
          console.log(`[CoffeeChatPrep] Setting progress: ${progressMessage}`);
          setCoffeeChatProgress(progressMessage);
        }
      };
      
      // Helper to handle completion
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
          setRenderKey((prev: number) => prev + 1);
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
        // Poll immediately first
        (async () => {
          try {
            const statusResult = await apiService.getCoffeeChatPrepStatus(prepId);
            console.log(`[CoffeeChatPrep] Initial poll result:`, statusResult);
            
            if (statusResult.pdfUrl) {
              handleCompletion(statusResult);
              resolve(statusResult);
              return;
            }
            
            handleStatusUpdate(statusResult);
          } catch (error) {
            console.error(`[CoffeeChatPrep] Initial poll error:`, error);
          }
        })();
        
        // Then continue polling with interval
        const intervalId = setInterval(async () => {
          pollCount++;
          console.log(`[CoffeeChatPrep] Polling status (attempt ${pollCount}/${maxPolls})...`);
          
          try {
            const statusResult = await apiService.getCoffeeChatPrepStatus(prepId);
            console.log(`[CoffeeChatPrep] Status result:`, statusResult);
            
            if ('error' in statusResult && !('status' in statusResult)) {
              clearInterval(intervalId);
              reject(new Error(statusResult.error));
              return;
            }
            
            if (statusResult.pdfUrl) {
              clearInterval(intervalId);
              handleCompletion(statusResult);
              resolve(statusResult);
              return;
            }
            
            handleStatusUpdate(statusResult);
            
            if (pollCount >= maxPolls) {
              clearInterval(intervalId);
              reject(new Error('Generation timed out'));
            }
          } catch (error) {
            clearInterval(intervalId);
            reject(error);
          }
        }, 2000); // QUICK WIN: Reduced polling interval from 3s to 2s to catch status updates faster
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

      await new Promise(r => setTimeout(r, 500));

      const tab = window.open(pdfUrl, "_blank", "noopener,noreferrer");
      
      if (!tab) {
        const a = document.createElement("a");
        a.href = pdfUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      // Track PostHog event
      trackContentViewed('coffee_chat_prep', 'pdf');

      toast({
        title: "PDF Ready",
        description: "Opened your Coffee Chat one-pager in a new tab.",
      });
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
      if (prep.pdfUrl) {
        window.open(prep.pdfUrl, "_blank", "noopener");
        // Track PostHog event
        trackContentViewed('coffee_chat_prep', 'pdf', prep.id);
        return;
      }
      const { pdfUrl } = await apiService.downloadCoffeeChatPDF(prep.id);
      if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener");
        // Track PostHog event
        trackContentViewed('coffee_chat_prep', 'pdf', prep.id);
      } else {
        throw new Error("PDF URL not available yet");
      }
    } catch (error) {
      trackError('coffee_chat_prep', 'download', 'network_error', error instanceof Error ? error.message : undefined);
      toast({
        title: "Download failed",
        description: "Could not open the PDF. Please try again.",
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

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("coffee-chat-prep");

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader title="" />

          <main className="bg-white min-h-screen">
            <div className="max-w-5xl mx-auto px-8 pt-10 pb-4">
              <h1 className="text-[28px] font-semibold text-gray-900 mb-4">
                Coffee Chat Prep
              </h1>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <StripeTabs 
                  activeTab={activeTab} 
                  onTabChange={setActiveTab}
                  tabs={[
                    { id: 'coffee-chat-prep', label: 'Coffee Chat Prep' },
                    { id: 'coffee-library', label: `Coffee Library (${preps.length})` },
                  ]}
                />

                <div className="pb-8 pt-6">
                  <TabsContent value="coffee-chat-prep" className="mt-0">
                    {!hasAccess && (
                      <div className="mb-6">
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

                    <div className="mb-6">
                      <h2 className="text-xl font-semibold text-gray-900 mb-6">
                        Who are you meeting with?
                      </h2>

                      <div className="grid gap-6 lg:grid-cols-2">
                        <div className="space-y-5">
                          <div>
                            <label className="block text-sm font-medium mb-2 text-gray-700">
                              LinkedIn Profile URL <span className="text-red-500">*</span>
                            </label>
                            <Input
                              value={linkedinUrl}
                              onChange={(e) => setLinkedinUrl(e.target.value)}
                              placeholder="https://linkedin.com/in/username"
                              className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 hover:border-gray-400 transition-colors"
                              disabled={coffeeChatLoading || !hasAccess}
                            />
                            <p className="text-sm text-gray-500 mt-2">
                              Uses <span className="font-medium text-blue-600">{COFFEE_CHAT_CREDITS}</span> credits • Generates a PDF with recent news, talking points, and similarities.
                            </p>
                          </div>

                          <div className="space-y-4">
                            <Button
                              onClick={handleCoffeeChatSubmit}
                              disabled={coffeeChatLoading || !linkedinUrl.trim() || (effectiveUser.credits ?? 0) < COFFEE_CHAT_CREDITS || !hasAccess}
                              size="lg"
                              className="text-white font-medium px-8 transition-all hover:opacity-90 relative overflow-hidden"
                              style={{ background: '#3B82F6' }}
                            >
                              {coffeeChatLoading ? (
                                'Generating...'
                              ) : (
                                'Generate Prep'
                              )}
                              <InlineLoadingBar isLoading={coffeeChatLoading} />
                            </Button>

                            {coffeeChatStatus === 'completed' && (coffeeChatPrepId || coffeeChatResult) && (
                              <Button
                                variant="outline"
                                onClick={() => downloadCoffeeChatPDF()}
                                className="border-green-500 text-green-600 hover:bg-green-50"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
                              </Button>
                            )}
                          </div>

                          {coffeeChatStatus !== 'idle' && (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                              {coffeeChatStatus === 'completed' ? (
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                  <span>{coffeeChatProgress}</span>
                                </div>
                              ) : coffeeChatStatus === 'failed' ? (
                                <div className="flex items-center gap-2">
                                  <XCircle className="h-4 w-4 text-red-500" />
                                  <span>{coffeeChatProgress || 'Generation failed'}</span>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-blue-600" />
                                    <span className="font-medium">{coffeeChatProgress}</span>
                                  </div>
                                  <SteppedLoadingBar 
                                    steps={coffeeChatSteps} 
                                    currentStepId={currentPrepStatus} 
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-4">
                          {coffeeChatStatus === 'completed' && coffeeChatResult ? (
                            <>
                              <div className="rounded-lg border border-green-200 bg-green-50 p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wide">
                                    Contact Snapshot
                                  </h3>
                                  <span className="text-xs text-green-600">
                                    Ready for coffee chat
                                  </span>
                                </div>
                                <div className="space-y-1 text-sm text-gray-700">
                                  <p><span className="text-gray-500">Name:</span> {coffeeChatResult.contactData?.firstName} {coffeeChatResult.contactData?.lastName}</p>
                                  <p><span className="text-gray-500">Role:</span> {coffeeChatResult.contactData?.jobTitle}</p>
                                  <p><span className="text-gray-500">Company:</span> {coffeeChatResult.contactData?.company}</p>
                                  <p><span className="text-gray-500">Office:</span> {coffeeChatResult.contactData?.location || coffeeChatResult.context?.office}</p>
                                  {coffeeChatResult.hometown && (
                                    <p><span className="text-gray-500">Hometown:</span> {coffeeChatResult.hometown}</p>
                                  )}
                                </div>
                              </div>

                              {coffeeChatResult.similaritySummary && (
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                                  <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-2">
                                    Common Ground
                                  </h3>
                                  <p className="text-sm text-gray-700 leading-relaxed">
                                    {coffeeChatResult.similaritySummary}
                                  </p>
                                </div>
                              )}

                              {coffeeChatResult.industrySummary && (
                                <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                                  <h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wide mb-2">
                                    Industry Pulse
                                  </h3>
                                  <p className="text-sm text-gray-700 leading-relaxed">
                                    {coffeeChatResult.industrySummary}
                                  </p>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm space-y-3">
                              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                                What you'll receive
                              </h3>
                              <ul className="space-y-2 text-gray-700">
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5" />
                                  Curated headlines tied to the division and office
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5" />
                                  40-second similarity summary & coffee chat questions
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5" />
                                  PDF saved to your Coffee Library
                                </li>
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="coffee-library" className="mt-0">
                    <div className="space-y-6">
                      {libraryLoading ? (
                        <LoadingSkeleton variant="card" count={3} />
                      ) : preps.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-10 text-center space-y-4">
                          <Coffee className="h-10 w-10 mx-auto text-blue-600" />
                          <h3 className="text-lg font-semibold text-gray-900">No preps yet</h3>
                          <p className="text-sm text-gray-500">
                            Generate your first coffee chat prep to see it appear here.
                          </p>
                          <Button
                            onClick={() => setActiveTab('coffee-chat-prep')}
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
                                      <p className="text-sm text-gray-900 font-medium">{prep.contactName}</p>
                                      <p className="text-xs text-gray-500">
                                        {prep.jobTitle} @ {prep.company}
                                      </p>
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
                                        {prep.contactName}
                                      </div>
                                      <div className="text-sm text-gray-700">
                                        {prep.jobTitle} @ {prep.company}
                                      </div>
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
                                      {prep.industrySummary && (
                                        <p className="text-xs text-gray-500">
                                          {prep.industrySummary}
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-blue-500 text-blue-600 hover:bg-blue-50"
                                        onClick={() => handleLibraryDownload(prep)}
                                      >
                                        <Download className="h-4 w-4 mr-2" />
                                        PDF
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="relative overflow-hidden text-red-500 hover:text-red-600 hover:bg-red-50"
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

export default CoffeeChatPrepPage;

