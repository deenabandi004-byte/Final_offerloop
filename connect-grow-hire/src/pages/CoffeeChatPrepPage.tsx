import React, { useEffect, useMemo, useState, useRef } from "react";
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
  FolderOpen,
  AlertCircle,
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
    { id: 'enriching_profile', label: 'Enriching profile data...' },
    { id: 'fetching_news', label: 'Fetching recent news...' },
    { id: 'building_context', label: 'Building user context...' },
    { id: 'extracting_hometown', label: 'Extracting location...' },
    { id: 'generating_content', label: 'Generating content...' },
    { id: 'generating_pdf', label: 'Generating PDF...' },
    { id: 'completed', label: 'Complete!' },
  ];
  const coffeeChatPollTimeoutRef = useRef<number | null>(null);

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
          const status = statusResult.status;
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
        (async () => {
          try {
            const statusResult = await apiService.getCoffeeChatPrepStatus(prepId);
            
            if ('pdfUrl' in statusResult && statusResult.pdfUrl) {
              handleCompletion(statusResult);
              resolve(statusResult);
              return;
            }
            
            handleStatusUpdate(statusResult);
          } catch (error) {
            console.error(`[CoffeeChatPrep] Initial poll error:`, error);
          }
        })();
        
        const intervalId = setInterval(async () => {
          pollCount++;
          
          try {
            const statusResult = await apiService.getCoffeeChatPrepStatus(prepId);
            
            if ('error' in statusResult && !('status' in statusResult)) {
              clearInterval(intervalId);
              reject(new Error(statusResult.error));
              return;
            }
            
            if ('pdfUrl' in statusResult && statusResult.pdfUrl) {
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
        }, 2000);
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

          <main style={{ background: '#F8FAFF', flex: 1, overflowY: 'auto' }}>
            <div className="max-w-4xl mx-auto px-6 pt-10 pb-8">
              
              {/* Header Section */}
              <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px 0' }}>
                <h1
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: '42px',
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
                  Walk into every conversation confident and prepared.
                </p>
              </div>

              {/* Pill-style Tabs */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '36px' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    gap: '0',
                    background: '#F0F4FD',
                    borderRadius: '12px',
                    padding: '4px',
                    margin: '0 auto',
                  }}
                >
                  <button
                    onClick={() => setActiveTab('coffee-chat-prep')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      borderRadius: '9px',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      fontSize: '14px',
                      fontWeight: 500,
                      transition: 'all 0.15s ease',
                      background: activeTab === 'coffee-chat-prep' ? '#2563EB' : 'transparent',
                      color: activeTab === 'coffee-chat-prep' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'coffee-chat-prep' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Coffee Chat Prep
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('coffee-library')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      borderRadius: '9px',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      fontSize: '14px',
                      fontWeight: 500,
                      transition: 'all 0.15s ease',
                      background: activeTab === 'coffee-library' ? '#2563EB' : 'transparent',
                      color: activeTab === 'coffee-library' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'coffee-library' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Coffee Library
                    {preps.length > 0 && (
                      <span
                        style={{
                          marginLeft: '6px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: activeTab === 'coffee-library' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(37, 99, 235, 0.08)',
                          color: activeTab === 'coffee-library' ? 'white' : '#2563EB',
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          fontSize: '11px',
                          fontWeight: 600,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {preps.length}
                      </span>
                    )}
                  </button>
                </div>
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

                  {/* Main Card */}
                  <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                    {/* Simple gray divider */}
                    <div className="h-1 bg-gray-100"></div>
                    
                    <div className="p-8">
                      {/* Card Header */}
                      <div className="text-center mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Who are you meeting with?</h2>
                        <p className="text-gray-600 max-w-lg mx-auto">
                          Enter their LinkedIn profile to generate a personalized prep sheet.
                        </p>
                      </div>

                      {/* Enhanced URL Input with Integrated Button */}
                      <div className="max-w-2xl mx-auto">
                        <div className="relative flex items-center group">
                          {/* LinkedIn icon inside input */}
                          <div className="absolute left-4 pointer-events-none">
                            <Linkedin className="w-5 h-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                          </div>
                          
                          <input
                            type="url"
                            value={linkedinUrl}
                            onChange={(e) => setLinkedinUrl(e.target.value)}
                            placeholder="https://linkedin.com/in/username"
                            disabled={coffeeChatLoading || !hasAccess}
                            className="w-full pl-12 pr-44 py-4 text-lg border-2 border-gray-300 rounded-2xl
                                       text-gray-900 placeholder-gray-400 bg-white
                                       hover:border-gray-400
                                       focus:border-blue-400 focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20
                                       transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          
                          {/* Button inside input */}
                          <button
                            onClick={handleCoffeeChatSubmit}
                            disabled={!linkedinUrl.trim() || coffeeChatLoading || !hasAccess || (effectiveUser.credits ?? 0) < COFFEE_CHAT_CREDITS}
                            className={`
                              absolute right-2 px-6 py-2.5 rounded-full font-semibold text-sm
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
                        
                        {/* Validation Feedback */}
                        {linkedinUrl && !isValidLinkedInUrl(linkedinUrl) && linkedinUrl.length > 10 && (
                          <p className="text-center text-sm text-gray-600 mt-3 flex items-center justify-center gap-1">
                            <AlertCircle className="w-4 h-4" />
                            Please enter a valid LinkedIn profile URL
                          </p>
                        )}
                        
                        {linkedinUrl && isValidLinkedInUrl(linkedinUrl) && (
                          <p className="text-center text-sm text-green-600 mt-3 flex items-center justify-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            Valid LinkedIn URL — ready to generate
                          </p>
                        )}
                        
                        {/* Helper text */}
                        {!linkedinUrl && (
                          <p className="text-center text-xs text-gray-400 mt-3">
                            Uses {COFFEE_CHAT_CREDITS} credits • PDF saved automatically
                          </p>
                        )}
                      </div>

                      {/* Progress/Status Display */}
                      {coffeeChatStatus !== 'idle' && (
                        <div className="mt-6 max-w-2xl mx-auto">
                          {coffeeChatStatus === 'completed' ? (
                            <div className="flex items-center justify-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
                              <CheckCircle className="h-5 w-5" />
                              <span className="font-medium">{coffeeChatProgress}</span>
                              <button
                                onClick={() => downloadCoffeeChatPDF()}
                                className="ml-4 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-full hover:bg-green-700 transition-colors flex items-center gap-2"
                              >
                                <Download className="h-4 w-4" />
                                Download PDF
                              </button>
                            </div>
                          ) : coffeeChatStatus === 'failed' ? (
                            <div className="flex items-center justify-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                              <XCircle className="h-5 w-5" />
                              <span>{coffeeChatProgress || 'Generation failed'}</span>
                            </div>
                          ) : (
                            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                              <div className="flex items-center justify-center gap-2 mb-3">
                                <Clock className="h-5 w-5 text-gray-600" />
                                <span className="font-medium text-gray-700">{coffeeChatProgress}</span>
                              </div>
                              <SteppedLoadingBar 
                                steps={coffeeChatSteps} 
                                currentStepId={currentPrepStatus} 
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Contact Snapshot (when completed) */}
                      {coffeeChatStatus === 'completed' && coffeeChatResult && (
                        <div className="mt-6 max-w-2xl mx-auto space-y-4">
                          <div className="p-5 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wide">
                                Contact Snapshot
                              </h3>
                              <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
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
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                              <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-2">
                                Common Ground
                              </h3>
                              <p className="text-sm text-gray-700 leading-relaxed">
                                {coffeeChatResult.similaritySummary}
                              </p>
                            </div>
                          )}

                          {coffeeChatResult.industrySummary && (
                            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                              <h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wide mb-2">
                                Industry Pulse
                              </h3>
                              <p className="text-sm text-gray-700 leading-relaxed">
                                {coffeeChatResult.industrySummary}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* What You'll Receive Section - Demoted */}
                      {coffeeChatStatus !== 'completed' && (
                        <div className="mt-8 pt-6 border-t border-gray-100">
                          <p className="text-center text-xs text-gray-400 mb-4">Includes curated headlines, talking points, and a PDF prep sheet</p>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                            <div className="text-center p-3">
                              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                                <Newspaper className="w-4 h-4 text-gray-500" />
                              </div>
                              <p className="font-medium text-gray-700 text-xs">Curated Headlines</p>
                              <p className="text-xs text-gray-400 mt-0.5">Recent news</p>
                            </div>
                            
                            <div className="text-center p-3">
                              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                                <MessageSquare className="w-4 h-4 text-gray-500" />
                              </div>
                              <p className="font-medium text-gray-700 text-xs">Talking Points</p>
                              <p className="text-xs text-gray-400 mt-0.5">Similarity summary</p>
                            </div>
                            
                            <div className="text-center p-3">
                              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                                <FileText className="w-4 h-4 text-gray-500" />
                              </div>
                              <p className="font-medium text-gray-700 text-xs">PDF Prep Sheet</p>
                              <p className="text-xs text-gray-400 mt-0.5">Auto-saved</p>
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
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default CoffeeChatPrepPage;
