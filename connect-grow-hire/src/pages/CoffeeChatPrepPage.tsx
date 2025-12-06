import React, { useEffect, useMemo, useState, useRef } from "react";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Coffee,
  Download,
  Trash2,
  Loader2,
  BadgeCheck,
  MapPin,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
} from "lucide-react";
import { CreditPill } from "@/components/credits";
import { BackToHomeButton } from "@/components/BackToHomeButton";
import { BetaBadge } from "@/components/BetaBadges";
import { apiService } from "@/services/api";
import type { CoffeeChatPrep, CoffeeChatPrepStatus } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { COFFEE_CHAT_CREDITS } from "@/lib/constants";
import { flushSync } from "react-dom";
import ScoutBubble from "@/components/ScoutBubble";
import { logActivity, generateCoffeeChatPrepSummary } from "@/utils/activityLogger";

const CoffeeChatPrepPage: React.FC = () => {
  const { user: firebaseUser, checkCredits } = useFirebaseAuth();
  const effectiveUser = firebaseUser || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;

  // Coffee Chat Generation State
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [coffeeChatLoading, setCoffeeChatLoading] = useState(false);
  const [coffeeChatProgress, setCoffeeChatProgress] = useState<string>("");
  const [coffeeChatPrepId, setCoffeeChatPrepId] = useState<string | null>(null);
  const [coffeeChatResult, setCoffeeChatResult] = useState<CoffeeChatPrepStatus | null>(null);
  const [coffeeChatStatus, setCoffeeChatStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
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
      
      const pollPromise = new Promise((resolve, reject) => {
        const intervalId = setInterval(async () => {
          pollCount++;
          
          try {
            const statusResult = await apiService.getCoffeeChatPrepStatus(prepId);
            
            if ('error' in statusResult && !('status' in statusResult)) {
              clearInterval(intervalId);
              reject(new Error(statusResult.error));
              return;
            }
            
            if (statusResult.pdfUrl) {
              clearInterval(intervalId);
              
              // Log activity for coffee chat prep creation
              if (firebaseUser?.uid && statusResult.contactData) {
                try {
                  const contactData = statusResult.contactData;
                  const contactName = contactData.name ||
                                     `${contactData.firstName || ''} ${contactData.lastName || ''}`.trim() ||
                                     '';
                  const company = contactData.company || contactData.companyName || '';
                  const summary = generateCoffeeChatPrepSummary({
                    contactName: contactName || undefined,
                    company: company || undefined,
                  });
                  await logActivity(firebaseUser.uid, 'coffeePrep', summary, {
                    prepId: prepId,
                    linkedinUrl: linkedinUrl,
                    contactName: contactName || '',
                    company: company || '',
                  });
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
              
              toast({
                title: "Coffee Chat Prep Ready!",
                description: "Your one-pager has been generated successfully.",
                duration: 5000,
              });
              
              checkCredits?.();
              resolve(statusResult);
              return;
            }
            
            if ('status' in statusResult) {
              setCoffeeChatProgress('Processing your request...');
            }
            
            if (pollCount >= maxPolls) {
              clearInterval(intervalId);
              reject(new Error('Generation timed out'));
            }
          } catch (error) {
            clearInterval(intervalId);
            reject(error);
          }
        }, 3000);
      });
      
      await pollPromise;
      
    } catch (error: any) {
      console.error('Coffee chat prep failed:', error);
      setCoffeeChatStatus('failed');
      setCoffeeChatProgress('Generation failed');
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

      toast({
        title: "PDF Ready",
        description: "Opened your Coffee Chat one-pager in a new tab.",
      });
    } catch (err) {
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
        return;
      }
      const { pdfUrl } = await apiService.downloadCoffeeChatPDF(prep.id);
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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AppSidebar />

        <div className="flex-1">
          <header className="h-16 flex items-center justify-between border-b border-border px-6 bg-background">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-foreground hover:bg-accent" />
              <h1 className="text-xl font-semibold">Coffee Chat Prep</h1>
            </div>

            <div className="flex items-center gap-4">
              <CreditPill credits={effectiveUser.credits ?? 0} max={effectiveUser.maxCredits ?? 150} />
              <BackToHomeButton />
            </div>
          </header>

          <main className="p-8 bg-white">
            <div className="max-w-5xl mx-auto">
              <Tabs defaultValue="coffee-chat-prep" className="w-full">
                <div className="flex justify-center mb-6">
                  <TabsList className="h-14 bg-card border border-border grid grid-cols-2">
                    <TabsTrigger
                      value="coffee-chat-prep"
                      className="h-12 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-400 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <Coffee className="h-4 w-4 mr-2" />
                      Coffee Chat Prep
                    </TabsTrigger>
                    <TabsTrigger
                      value="coffee-library"
                      className="h-12 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-400 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Coffee Library
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="coffee-chat-prep" className="mt-6">
                  <Card className="bg-card border-border rounded-2xl">
                    <CardHeader className="border-b border-border">
                      <CardTitle className="text-xl text-foreground flex items-center gap-2">
                        Coffee Chat Prep
                        <BetaBadge size="xs" variant="glow" />
                        <Badge variant="secondary" className="ml-auto">
                          {COFFEE_CHAT_CREDITS} credits
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-8">
                      <div className="grid gap-6 lg:grid-cols-2">
                        <div className="space-y-5">
                          <div>
                            <label className="block text-sm font-medium mb-2 text-foreground">
                              LinkedIn Profile URL
                            </label>
                            <Input
                              value={linkedinUrl}
                              onChange={(e) => setLinkedinUrl(e.target.value)}
                              placeholder="https://linkedin.com/in/username"
                              className="bg-background border-input text-foreground placeholder:text-muted-foreground"
                              disabled={coffeeChatLoading}
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                              Uses {COFFEE_CHAT_CREDITS} credits. Generates a PDF with recent division news, talking points, and similarities.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Button
                              onClick={handleCoffeeChatSubmit}
                              disabled={coffeeChatLoading || !linkedinUrl.trim() || (effectiveUser.credits ?? 0) < COFFEE_CHAT_CREDITS}
                              className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                            >
                              {coffeeChatLoading ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Coffee className="h-4 w-4 mr-2" />
                                  Generate Prep
                                </>
                              )}
                            </Button>

                            {coffeeChatStatus === 'completed' && (coffeeChatPrepId || coffeeChatResult) && (
                              <Button
                                variant="outline"
                                onClick={() => downloadCoffeeChatPDF()}
                                className="border-green-500/60 text-green-300 hover:bg-green-500/10"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
                              </Button>
                            )}
                          </div>

                          {coffeeChatStatus !== 'idle' && (
                            <div className="rounded-lg border border-border bg-muted/50 p-4 shadow-inner text-sm text-foreground">
                              <div className="flex items-center gap-2">
                                {coffeeChatLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                ) : coffeeChatStatus === 'completed' ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : coffeeChatStatus === 'failed' ? (
                                  <XCircle className="h-4 w-4 text-destructive" />
                                ) : (
                                  <Clock className="h-4 w-4 text-primary" />
                                )}
                                <span>{coffeeChatProgress}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-4">
                          {coffeeChatStatus === 'completed' && coffeeChatResult ? (
                            <>
                              <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wide">
                                    Contact Snapshot
                                  </h3>
                                  <span className="text-xs text-green-600/80">
                                    Ready for coffee chat
                                  </span>
                                </div>
                                <div className="space-y-1 text-sm text-foreground">
                                  <p><span className="text-muted-foreground">Name:</span> {coffeeChatResult.contactData?.firstName} {coffeeChatResult.contactData?.lastName}</p>
                                  <p><span className="text-muted-foreground">Role:</span> {coffeeChatResult.contactData?.jobTitle}</p>
                                  <p><span className="text-muted-foreground">Company:</span> {coffeeChatResult.contactData?.company}</p>
                                  <p><span className="text-muted-foreground">Office:</span> {coffeeChatResult.contactData?.location || coffeeChatResult.context?.office}</p>
                                  {coffeeChatResult.hometown && (
                                    <p><span className="text-muted-foreground">Hometown:</span> {coffeeChatResult.hometown}</p>
                                  )}
                                </div>
                              </div>

                              {coffeeChatResult.similaritySummary && (
                                <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4">
                                  <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-2">
                                    Common Ground
                                  </h3>
                                  <p className="text-sm text-foreground leading-relaxed">
                                    {coffeeChatResult.similaritySummary}
                                  </p>
                                </div>
                              )}

                              {coffeeChatResult.industrySummary && (
                                <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4">
                                  <h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wide mb-2">
                                    Industry Pulse
                                  </h3>
                                  <p className="text-sm text-foreground leading-relaxed">
                                    {coffeeChatResult.industrySummary}
                                  </p>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="rounded-xl border border-border bg-muted/30 p-5 text-sm text-foreground space-y-3">
                              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                                What you'll receive
                              </h3>
                              <ul className="space-y-2 text-foreground">
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                                  Curated headlines tied to the division and office
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                                  40-second similarity summary & coffee chat questions
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                                  PDF saved to your Coffee Chat Library
                                </li>
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="coffee-library" className="mt-6">
                  <div className="space-y-6">
                    {libraryLoading ? (
                      <div className="flex items-center justify-center h-48 rounded-xl border border-border bg-card">
                        <div className="flex items-center gap-3 text-foreground">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          Loading your library...
                        </div>
                      </div>
                    ) : preps.length === 0 ? (
                      <div className="rounded-xl border border-border bg-card p-10 text-center space-y-4">
                        <Coffee className="h-10 w-10 mx-auto text-primary" />
                        <h3 className="text-lg font-semibold text-foreground">No preps yet</h3>
                        <p className="text-sm text-muted-foreground">
                          Generate your first coffee chat prep to see it appear here.
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
                                    <p className="text-sm text-foreground font-medium">{prep.contactName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {prep.jobTitle} @ {prep.company}
                                    </p>
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
                                  className="rounded-xl border border-border bg-card p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-foreground font-medium">
                                      <BadgeCheck className="h-4 w-4 text-green-600" />
                                      {prep.contactName}
                                    </div>
                                    <div className="text-sm text-foreground">
                                      {prep.jobTitle} @ {prep.company}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
                                      <p className="text-xs text-muted-foreground">
                                        {prep.industrySummary}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-primary text-primary hover:bg-primary/10"
                                      onClick={() => handleLibraryDownload(prep)}
                                    >
                                      <Download className="h-4 w-4 mr-2" />
                                      PDF
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive/80"
                                      disabled={deletingId === prep.id}
                                      onClick={() => handleLibraryDelete(prep.id)}
                                    >
                                      {deletingId === prep.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
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
            </div>
          </main>
        </div>
      </div>
      <ScoutBubble 
        onJobTitleSuggestion={(_title, _company, _location) => {
          // Scout suggestions can be used for future enhancements
        }}
      />
    </SidebarProvider>
  );
};

export default CoffeeChatPrepPage;

