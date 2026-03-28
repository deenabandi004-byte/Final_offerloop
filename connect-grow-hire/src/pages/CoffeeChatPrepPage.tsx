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
          <main data-tour="tour-coffee-chat-prep" style={{ background: '#FFFFFF', flex: 1, overflowY: 'auto' }}>

            <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 40px' }}>

              {/* ── Book-aesthetic page header ── */}
              <div style={{ marginBottom: 32, paddingTop: 44 }}>
                <h1 style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: '#0F172A',
                  letterSpacing: '-.02em',
                  lineHeight: 1.2,
                  marginBottom: 10,
                  fontFamily: "'Lora', Georgia, serif",
                }}>
                  Coffee Chat Prep
                </h1>
                <div style={{
                  height: 1.5,
                  background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)',
                  marginBottom: 10,
                }} />
                <p style={{
                  fontSize: 14,
                  color: '#94A3B8',
                  lineHeight: 1.5,
                }}>
                  Paste a LinkedIn URL and get a personalized prep sheet with company intel, talking points, and smart questions.
                </p>
              </div>

              {/* ── Search area (no card wrapper) ── */}
              <div style={{ marginBottom: 32 }}>
                {!hasAccess && (
                  <div style={{ marginBottom: 16 }}>
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

                {/* Input row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1.5px solid #CBD5E1',
                  transition: 'border-color .15s',
                  marginBottom: 12,
                }}
                className="focus-within:border-b-[#3B82F6]"
                >
                  <Linkedin style={{ width: 16, height: 16, flexShrink: 0, color: '#0A66C2', strokeWidth: 1.5 }} />
                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCoffeeChatSubmit(); } }}
                    placeholder="Paste a LinkedIn profile URL..."
                    disabled={coffeeChatLoading || !hasAccess}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: 'none',
                      fontSize: 14,
                      color: '#0F172A',
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                  {linkedinUrl && isValidLinkedInUrl(linkedinUrl) && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: '#DCFCE7', color: '#15803D',
                      fontSize: 11, fontWeight: 500, padding: '3px 8px',
                      borderRadius: 100, whiteSpace: 'nowrap',
                    }}>
                      <CheckCircle className="h-2.5 w-2.5" />
                      Valid
                    </div>
                  )}
                </div>

                {linkedinUrl && !isValidLinkedInUrl(linkedinUrl) && linkedinUrl.length > 10 && (
                  <p className="text-xs text-red-500 flex items-center gap-1 mb-3">
                    <AlertCircle className="w-3 h-3" /> Please enter a valid LinkedIn profile URL
                  </p>
                )}

                {/* CTA */}
                <button
                  onClick={handleCoffeeChatSubmit}
                  disabled={!linkedinUrl.trim() || coffeeChatLoading || !hasAccess || (effectiveUser.credits ?? 0) < COFFEE_CHAT_CREDITS}
                  style={{
                    width: '100%',
                    height: 46,
                    borderRadius: 3,
                    background: (!linkedinUrl.trim() || coffeeChatLoading || !hasAccess) ? '#E2E8F0' : '#0F172A',
                    color: (!linkedinUrl.trim() || coffeeChatLoading || !hasAccess) ? '#94A3B8' : '#DBEAFE',
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: (!linkedinUrl.trim() || coffeeChatLoading || !hasAccess) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all .15s',
                    fontFamily: 'inherit',
                    letterSpacing: '-.01em',
                  }}
                >
                  {coffeeChatLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating prep sheet...</span>
                    </>
                  ) : (
                    <span>Generate Prep Sheet</span>
                  )}
                </button>

                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>{COFFEE_CHAT_CREDITS} credits · PDF auto-saved</span>
                  {subscription?.resumeFileName ? (
                    <button
                      onClick={() => navigate('/settings')}
                      style={{
                        fontSize: 11, color: '#16A34A', fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 3,
                        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <CheckCircle className="w-3 h-3" />
                      {subscription.resumeFileName}
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate('/settings')}
                      style={{
                        fontSize: 11, color: '#3B82F6', fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 3,
                        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <Upload className="w-3 h-3" />
                      Add resume for personalized questions
                    </button>
                  )}
                </div>
              </div>

              {/* ── Tabs ── */}
              <div style={{ marginBottom: 28 }}>
                <div className="relative">
                  <div className="flex items-center gap-8">
                    {coffeeChatTabs.map((tab, index) => (
                      <button
                        key={tab.id}
                        ref={(el) => { tabRefs.current[index] = el; }}
                        onClick={() => setActiveTab(tab.id)}
                        style={{ color: activeTab === tab.id ? '#0F172A' : '#94A3B8' }}
                        className={`
                          relative pb-2.5 text-sm transition-colors duration-150 flex items-center gap-1.5
                          focus:outline-none focus-visible:outline-none
                          ${activeTab === tab.id
                            ? 'font-bold'
                            : 'font-medium'
                          }
                        `}
                      >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{ background: '#E2E8F0' }} />
                  <div
                    className="absolute bottom-0 h-[2px] transition-all duration-200 ease-out" style={{ background: '#0F172A' }}
                    style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
                  />
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                {/* COFFEE CHAT PREP TAB */}
                <TabsContent value="coffee-chat-prep" className="mt-0">
                  <div>

                      {/* Progress/Status Display */}
                      {coffeeChatStatus !== 'idle' && (
                        <div style={{ marginBottom: 24 }}>
                          {coffeeChatStatus === 'completed' ? (
                            <div style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '16px 20px',
                              background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 3,
                            }}>
                              <div className="flex items-center gap-3">
                                <div style={{
                                  width: 36, height: 36, borderRadius: '50%', background: '#DCFCE7',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                  <CheckCircle className="w-4 h-4" style={{ color: '#15803D' }} />
                                </div>
                                <div>
                                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>
                                    {coffeeChatResult?.contactData?.firstName} {coffeeChatResult?.contactData?.lastName} — prep sheet ready
                                  </p>
                                  <p style={{ fontSize: 12, color: '#6B7280' }}>{coffeeChatResult?.contactData?.company}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => downloadCoffeeChatPDF()}
                                style={{
                                  padding: '9px 18px', background: '#0F172A', color: '#DBEAFE',
                                  fontSize: 13, fontWeight: 600, borderRadius: 3, border: 'none',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
                                }}
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download PDF
                              </button>
                            </div>
                          ) : coffeeChatStatus === 'failed' ? (
                            <div className="flex items-center justify-center gap-2 p-4 bg-red-50 border border-red-200 text-red-700" style={{ borderRadius: 3 }}>
                              <XCircle className="h-5 w-5" />
                              <span>{coffeeChatProgress || 'Generation failed'}</span>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              <SteppedLoadingBar steps={coffeeChatSteps} currentStepId={currentPrepStatus} />
                              <p style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>Usually 20-35 seconds</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* What's included — feature cards */}
                      {coffeeChatStatus !== 'completed' && (
                        <div style={{ marginTop: 36, marginBottom: 32 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                            {[
                              {
                                section: 'Section i',
                                icon: Newspaper,
                                title: 'Company Intel',
                                desc: 'Recent news, funding rounds, leadership changes, and industry trends',
                                iconBg: 'rgba(59,130,246,0.06)',
                                iconColor: '#3B82F6',
                              },
                              {
                                section: 'Section ii',
                                icon: MessageSquare,
                                title: 'Talking Points',
                                desc: 'Shared backgrounds, mutual connections, and common ground to build rapport',
                                iconBg: 'rgba(37,99,235,0.06)',
                                iconColor: '#2563EB',
                              },
                              {
                                section: 'Section iii',
                                icon: FileText,
                                title: 'PDF Prep Sheet',
                                desc: 'Smart questions, career timeline analysis, and conversation starters',
                                iconBg: 'rgba(37,99,235,0.06)',
                                iconColor: '#2563EB',
                              },
                            ].map((item) => (
                              <div
                                key={item.title}
                                style={{
                                  background: '#FAFBFF',
                                  border: '1px solid #E2E8F0',
                                  borderRadius: 3,
                                  padding: '20px 18px 22px',
                                  transition: 'transform .18s ease, box-shadow .18s ease',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.04)';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                                }}
                              >
                                <div style={{
                                  width: 28, height: 28, borderRadius: 3,
                                  background: item.iconBg,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  marginBottom: 12,
                                }}>
                                  <item.icon style={{ width: 14, height: 14, color: item.iconColor }} />
                                </div>
                                <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 6, letterSpacing: '-.01em', fontFamily: "'Lora', Georgia, serif" }}>{item.title}</p>
                                <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.55 }}>{item.desc}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recent Preps from Library */}
                      {recentPreps.length > 0 && coffeeChatStatus !== 'completed' && (
                        <div style={{ paddingTop: 24, borderTop: '1px solid #EEF2F8' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', fontFamily: "'Lora', Georgia, serif" }}>Recent Prep Sheets</h3>
                            <button
                              onClick={() => setActiveTab('coffee-library')}
                              style={{
                                fontSize: 12, color: '#3B82F6', fontWeight: 500,
                                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              View all ({preps.length})
                            </button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            {recentPreps.map((prep) => (
                              <div
                                key={prep.id}
                                onClick={() => handleLibraryDownload(prep)}
                                style={{
                                  padding: '14px 16px',
                                  border: '1px solid #EEF2F8',
                                  borderRadius: 3,
                                  cursor: 'pointer',
                                  transition: 'all .15s',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.borderColor = '#3B82F6';
                                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(59,130,246,.08)';
                                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.borderColor = '#EEF2F8';
                                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                  <div style={{
                                    width: 32, height: 32, borderRadius: 3, background: 'rgba(59,130,246,0.05)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                  }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#3B82F6' }}>
                                      {(prep.contactName || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                                    </span>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 13, fontWeight: 500, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prep.contactName}</p>
                                    <p style={{ fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prep.company}</p>
                                  </div>
                                </div>
                                <p style={{ fontSize: 11, color: '#94A3B8' }}>
                                  {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </TabsContent>

                {/* COFFEE LIBRARY TAB */}
                <TabsContent value="coffee-library" className="mt-0">
                  <div className="bg-white overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms', borderRadius: 3, boxShadow: '0 1px 4px rgba(0,0,0,.03)', border: '1px solid #EEF2F8' }}>
                    <div className="h-1" style={{ background: '#EEF2F8' }}></div>
                    
                    <div className="p-8">
                      {libraryLoading ? (
                        <LoadingSkeleton variant="card" count={3} />
                      ) : preps.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4" style={{ background: '#FAFBFF', borderRadius: 3 }}>
                            <Coffee className="h-8 w-8" style={{ color: '#6B7280' }} />
                          </div>
                          <h3 className="text-lg font-semibold mb-2" style={{ color: '#0F172A', fontFamily: "'Lora', Georgia, serif" }}>No preps yet</h3>
                          <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
                            Generate your first coffee chat prep to see it appear here.
                          </p>
                          <button
                            onClick={() => setActiveTab('coffee-chat-prep')}
                            className="px-6 py-3 font-semibold transition-all" style={{ background: '#0F172A', color: '#DBEAFE', borderRadius: 3 }}
                          >
                            Create Your First Prep
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {groupedPreps.inProgress.length > 0 && (
                            <section>
                              <h3 className="text-sm font-semibold uppercase mb-3" style={{ color: '#6B7280' }}>
                                In Progress
                              </h3>
                              <div className="space-y-3">
                                {groupedPreps.inProgress.map((prep) => (
                                  <div
                                    key={prep.id}
                                    className="p-4 flex items-center justify-between" style={{ background: '#FAFBFF', border: '1px solid #E2E8F0', borderRadius: 3 }}
                                  >
                                    <div>
                                      <p className="font-medium" style={{ color: '#0F172A' }}>{prep.contactName}</p>
                                      <p className="text-sm" style={{ color: '#6B7280' }}>
                                        {prep.jobTitle} @ {prep.company}
                                      </p>
                                      <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                                        Requested {prep.createdAt ? new Date(prep.createdAt).toLocaleString() : ""}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2" style={{ color: '#6B7280' }}>
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
                              <h3 className="text-sm font-semibold uppercase" style={{ color: '#6B7280' }}>
                                Completed ({groupedPreps.completed.length})
                              </h3>
                              <div className="space-y-3">
                                {groupedPreps.completed.map((prep) => (
                                  <div
                                    key={prep.id}
                                    className="p-5 bg-white flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-shadow" style={{ border: '1px solid #E2E8F0', borderRadius: 3 }}
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <BadgeCheck className="h-5 w-5 text-green-600" />
                                        <span className="font-semibold" style={{ color: '#0F172A' }}>{prep.contactName}</span>
                                      </div>
                                      <p className="text-sm" style={{ color: '#6B7280' }}>
                                        {prep.jobTitle} @ {prep.company}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: '#94A3B8' }}>
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
                                        className="px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2" style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6', borderRadius: 3 }}
                                      >
                                        <Download className="h-4 w-4" />
                                        PDF
                                      </button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="relative overflow-hidden text-red-500 hover:text-red-600 hover:bg-red-50" style={{ borderRadius: 3 }}
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
