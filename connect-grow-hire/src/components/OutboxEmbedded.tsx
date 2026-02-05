import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiService, OutboxThread, OutboxStatus } from "@/services/api";
import { InlineLoadingBar, LoadingBar } from "@/components/ui/LoadingBar";
import {
  Mail,
  Search,
  ExternalLink,
  RefreshCw,
  Sparkles,
  FileText,
  Send,
  Inbox,
  LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

/* ---------- Status UI ---------- */

const statusLabel: Record<OutboxStatus, string> = {
  no_reply_yet: "Draft pending",
  new_reply: "New reply received",
  waiting_on_them: "Waiting for reply",
  waiting_on_you: "Your turn to reply",
  closed: "Conversation closed",
};

const statusColor: Record<OutboxStatus, string> = {
  no_reply_yet: "bg-muted text-foreground border-border",
  new_reply: "bg-blue-500/10 text-blue-700 border-blue-500/40",
  waiting_on_them: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40",
  waiting_on_you: "bg-amber-500/10 text-amber-700 border-amber-500/40",
  closed: "bg-muted text-muted-foreground border-border",
};

/* ---------- StatCard Component ---------- */

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
}

const StatCard = ({ icon: Icon, label, value }: StatCardProps) => (
  <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg shadow-sm border border-border transform transition-all hover:scale-[1.02]">
    <Icon className="w-5 h-5 text-muted-foreground" />
    <div>
      <p className="text-xl font-semibold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  </div>
);

/* ---------- Helper Functions ---------- */

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const parseFirstName = (fullName: string | undefined): string => {
  if (!fullName || typeof fullName !== 'string') {
    return "";
  }
  const nameParts = fullName.trim().split(' ');
  return nameParts[0] || "";
};

const contactHasReplied = (thread: OutboxThread | null): boolean => {
  if (!thread) return false;
  return thread.status === "new_reply" || thread.status === "waiting_on_you";
};

export function OutboxEmbedded() {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [threads, setThreads] = useState<OutboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<OutboxThread | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [generating, setGenerating] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /* ---------- Search debouncing ---------- */
  
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms debounce
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  /* ---------- Load threads with retry logic ---------- */

  const loadThreads = useCallback(async (retryAttempt = 0): Promise<void> => {
    const maxRetries = 3;
    const retryDelay = 1000 * Math.pow(2, retryAttempt); // Exponential backoff
    
    try {
      setLoading(true);
      const result = await apiService.getOutboxThreads();
      if ("error" in result) throw new Error(result.error);
      setThreads(result.threads || []);
      setRetryCount(0); // Reset retry count on success
    } catch (err: any) {
      const errorMessage = err.message || "Failed to load conversations";
      
      if (retryAttempt < maxRetries) {
        // Retry with exponential backoff
        console.log(`Retrying loadThreads (attempt ${retryAttempt + 1}/${maxRetries})...`);
        setTimeout(() => {
          loadThreads(retryAttempt + 1);
        }, retryDelay);
        setRetryCount(retryAttempt + 1);
      } else {
        // Max retries reached
        toast({
          title: "Failed to load Outbox",
          description: `${errorMessage}. Please check your connection and try again.`,
          variant: "destructive",
          action: (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRetryCount(0);
                loadThreads(0);
              }}
            >
              Retry
            </Button>
          ),
        });
        setRetryCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const filteredThreads = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase();
    if (!q) return threads;
    
    return threads.filter((t) =>
      [
        t.contactName,
        t.company,
        t.jobTitle,
        t.email,
        t.lastMessageSnippet,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [threads, debouncedSearchQuery]);

  /* ---------- Dashboard Stats ---------- */

  const draftCount = useMemo(() => {
    return threads.filter((t) => t.hasDraft).length;
  }, [threads]);

  const sentCount = useMemo(() => {
    // Count threads that have been sent (have gmailThreadId and no draft, or status indicates sent)
    return threads.filter((t) => 
      t.status === "waiting_on_them" || 
      t.status === "new_reply" || 
      t.status === "waiting_on_you"
    ).length;
  }, [threads]);

  const firstName = parseFirstName(user?.name);
  const greeting = getGreeting();
  const contextualSubtitle = useMemo(() => {
    if (draftCount > 0) {
      return `You have ${draftCount} ${draftCount === 1 ? 'draft' : 'drafts'} ready to send`;
    }
    if (threads.length === 0) {
      return "Ready to grow your network?";
    }
    return "Let's keep the conversation going";
  }, [draftCount, threads.length]);

  /* ---------- Helpers ---------- */

  const formatLastActivity = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  };

  const handleOpenDraft = () => {
    if (!selectedThread) return;
    
    // Check for both gmailDraftId and gmailDraftUrl
    const draftId = selectedThread.gmailDraftId;
    let draftUrl = selectedThread.gmailDraftUrl;
    
    // If we have neither, show error
    if (!draftId && !draftUrl) {
      toast({
        title: "No Gmail draft found",
        description: "Generate or regenerate a reply draft first.",
        variant: "destructive",
      });
      return;
    }
    
    // If URL exists but uses wrong format (#drafts), fix it
    if (draftUrl && draftUrl.includes('#drafts/')) {
      draftUrl = draftUrl.replace('#drafts/', '#draft/');
    }
    
    // If no URL or invalid format, construct correct one from draftId
    if (!draftUrl || !draftUrl.includes('#draft/')) {
      if (draftId) {
        draftUrl = `https://mail.google.com/mail/u/0/#draft/${draftId}`;
      } else {
        toast({
          title: "No Gmail draft found",
          description: "Generate or regenerate a reply draft first.",
          variant: "destructive",
        });
        return;
      }
    }
    
    console.log('Opening draft URL:', draftUrl);
    window.open(draftUrl, "_blank");
  };

  const handleRegenerate = async () => {
    if (!selectedThread) return;
    
    if (!contactHasReplied(selectedThread)) {
      toast({
        title: "No reply from contact",
        description: "You can only generate a reply after the contact responds to your message.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setGenerating(true);
      const result = await apiService.regenerateOutboxReply(selectedThread.id);
      if ("error" in result) {
        // Handle specific error codes
        const errorData = result as { error: string; error_code?: string; credits_available?: number; credits_required?: number };
        
        if (errorData.error_code === "insufficient_credits") {
          toast({
            title: "Insufficient credits",
            description: errorData.error || `You need ${errorData.credits_required} credits but only have ${errorData.credits_available}. Please upgrade your plan or wait for your credits to reset.`,
            variant: "destructive",
            action: (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/pricing")}
              >
                View Plans
              </Button>
            ),
          });
        } else if (errorData.error_code === "gmail_not_connected") {
          toast({
            title: "Gmail not connected",
            description: "Please connect your Gmail account in Account Settings to generate replies.",
            variant: "destructive",
            action: (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/account-settings")}
              >
                Connect Gmail
              </Button>
            ),
          });
        } else {
          throw new Error(errorData.error);
        }
        return;
      }

      const updated = (result as { thread: OutboxThread; credits_used?: number; credits_remaining?: number }).thread;
      const creditsUsed = (result as { credits_used?: number }).credits_used;
      const creditsRemaining = (result as { credits_remaining?: number }).credits_remaining;
      
      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelectedThread(updated);

      toast({
        title: "Reply generated",
        description: updated.hasDraft 
          ? `Your AI-generated reply has been saved as a Gmail draft.${creditsUsed ? ` (${creditsUsed} credits used, ${creditsRemaining} remaining)` : ""}`
          : `Reply generated successfully.${creditsUsed ? ` (${creditsUsed} credits used, ${creditsRemaining} remaining)` : ""}`,
      });
    } catch (err: any) {
      const errorMessage = err.message || "Failed to generate reply";
      
      // Provide actionable error messages
      let actionableMessage = errorMessage;
      if (errorMessage.includes("credits")) {
        actionableMessage = `${errorMessage} Visit the Pricing page to upgrade your plan.`;
      } else if (errorMessage.includes("Gmail") || errorMessage.includes("gmail")) {
        actionableMessage = `${errorMessage} Please check your Gmail connection in Account Settings.`;
      }
      
      toast({
        title: "Failed to regenerate",
        description: actionableMessage,
        variant: "destructive",
        action: errorMessage.includes("credits") ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/pricing")}
          >
            View Plans
          </Button>
        ) : undefined,
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!selectedThread?.suggestedReply) return;
    await navigator.clipboard.writeText(selectedThread.suggestedReply);
    toast({
      title: "Copied",
      description: "Reply text copied to clipboard.",
    });
  };

  /* ---------- Layout ---------- */

  return (
    <div className="w-full space-y-8">
      {/* Welcome Header - First thing users see after login */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">
          {greeting}{firstName ? `, ${firstName}` : ""}!
        </h1>
        <p className="text-muted-foreground">
          {contextualSubtitle}
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex flex-wrap gap-4">
        <StatCard icon={FileText} label="Drafts" value={draftCount} />
        <StatCard icon={Send} label="Sent" value={sentCount} />
        </div>

      {/* Divider */}
      <div className="border-t border-gray-100/30 pt-6">
        <div className="flex gap-6">
          {/* LEFT: Thread list */}
          <div className="w-1/2 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-foreground">Your Drafts</h2>
        <Button
                size="icon"
          variant="outline"
          onClick={loadThreads}
                className="relative overflow-hidden border-0 shadow-sm hover:shadow-md bg-white"
        >
          <RefreshCw className="h-4 w-4" />
          <InlineLoadingBar isLoading={loading} />
        </Button>
      </div>

          {/* Search */}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
            <Input
                className="pl-9 bg-white shadow-sm hover:shadow-md transition-shadow border-0 focus:ring-2 focus:ring-purple-500/20"
              placeholder="Search by name, firm, subject…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Thread list */}
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {loading && (
              <div className="py-10 text-center text-muted-foreground text-sm space-y-3">
                <p>Loading conversations{retryCount > 0 ? ` (retrying ${retryCount}/3)…` : "…"}</p>
                <div className="w-48 mx-auto">
                  <LoadingBar variant="indeterminate" size="sm" />
                </div>
              </div>
            )}

            {!loading && filteredThreads.length === 0 && threads.length === 0 && (
              <div className="text-center py-12">
                <Inbox className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No drafts yet
                </h3>
                <p className="text-muted-foreground mb-4">
                  Find contacts and start building your network
                </p>
                <Button onClick={() => navigate("/contact-search")}>
                  Find Contacts
                </Button>
              </div>
            )}

            {!loading && filteredThreads.length === 0 && threads.length > 0 && (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No results found
                </h3>
                <p className="text-muted-foreground mb-4">
                  Try adjusting your search query
                </p>
              </div>
            )}

            {!loading && filteredThreads.length > 0 &&
              filteredThreads.map((t) => (
                <button
                  key={t.id}
                  onClick={async () => {
                    setSelectedThread(t);
                    // Sync thread in background when selected (non-blocking)
                    try {
                      const synced = await apiService.syncOutboxThread(t.id);
                      if (synced && "thread" in synced && synced.thread) {
                        // Update the thread in the list
                        setThreads((prev) =>
                          prev.map((thread) =>
                            thread.id === t.id ? synced.thread : thread
                          )
                        );
                        // Update selected thread if it's still selected
                        setSelectedThread((current) =>
                          current?.id === t.id ? synced.thread : current
                        );
                      }
                    } catch (err) {
                      // Silently fail - user still sees cached data
                      console.warn("Failed to sync thread:", err);
                    }
                  }}
                    className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${
                    selectedThread?.id === t.id
                        ? "bg-gradient-to-r from-blue-50 to-blue-50 shadow-md ring-2 ring-blue-500/30"
                        : "bg-white shadow-sm hover:shadow-md hover:bg-gray-50/50"
                  }`}
                >
                  <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-sm">{t.contactName}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.jobTitle} · {t.company}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {t.lastMessageSnippet}
                      </p>
                    </div>

                      <div className="flex flex-col items-end gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        {formatLastActivity(t.lastActivityAt)}
                      </span>
                        <Badge className={`border ${statusColor[t.status]} text-[10px]`}>
                        {statusLabel[t.status]}
                      </Badge>
                      {t.hasDraft && (
                          <span className="text-[10px] text-blue-700 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Draft ready
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* RIGHT: Thread detail + Suggested reply */}
          <div className="w-1/2">
          {!selectedThread ? (
              <div className="h-full rounded-2xl p-6 text-center text-muted-foreground text-sm bg-gradient-to-br from-gray-50/50 to-white shadow-inner">
              <div className="flex flex-col items-center justify-center h-full">
                  <Inbox className="w-16 h-16 text-muted-foreground/30 mb-4" />
                <p>Select a conversation to view the reply and your AI-generated response draft.</p>
              </div>
            </div>
          ) : (
              <div className="h-full rounded-2xl p-6 bg-white shadow-lg flex flex-col">
              {/* Header */}
                <div className="mb-3">
                  <p className="font-semibold text-sm text-foreground">{selectedThread.contactName}</p>
                  <p className="text-xs text-muted-foreground">
                  {selectedThread.jobTitle} · {selectedThread.company}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{selectedThread.email}</p>
              </div>

              {/* Latest message snippet */}
                <div className="rounded-xl border border-gray-100 bg-white p-3 mb-4">
                  <p className="text-[11px] font-medium text-foreground mb-2">
                  {selectedThread.status === "no_reply_yet" 
                    ? "Draft content" 
                    : "Latest message"}
                </p>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
                  {selectedThread.lastMessageSnippet || 
                   (selectedThread.status === "no_reply_yet" 
                     ? "Draft is ready to send in Gmail" 
                     : "No message content available.")}
                </p>
              </div>

              {/* Suggested Reply */}
                {contactHasReplied(selectedThread) ? (
                  <div className="border border-gray-100 rounded-xl p-4 bg-white flex flex-col flex-1">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Suggested reply</h3>
                      </div>
                      {selectedThread.hasDraft && selectedThread.suggestedReply && (
                        <Badge
                          variant="outline"
                          className="border-blue-500/60 bg-blue-500/10 text-[10px] text-blue-700"
                        >
                          Draft saved in Gmail
                        </Badge>
                      )}
                    </div>

                    {selectedThread.suggestedReply ? (
                      <>
                        <p className="text-[11px] text-muted-foreground mb-3">
                          We drafted this response based on their message. Review and edit before
                          sending — you're always in control.
                        </p>
                        <textarea
                          readOnly
                          value={selectedThread.suggestedReply}
                          className="flex-1 w-full text-xs bg-white rounded-xl p-3 resize-none text-foreground whitespace-pre-wrap shadow-inner focus:ring-2 focus:ring-purple-500/20"
                        />
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] text-muted-foreground mb-3">
                          Generate an AI-powered reply based on their message. We'll analyze their
                          tone and content to craft an appropriate response.
                        </p>
                        <div className="flex-1 flex items-center justify-center border border-dashed border-gray-100 rounded-xl p-6 bg-white">
                          <div className="text-center">
                            <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">
                              No suggested reply yet
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Click "Regenerate" to create one
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="border border-gray-100 rounded-xl p-4 bg-white flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">Suggested reply</h3>
                    </div>
                    <div className="flex-1 flex items-center justify-center border border-dashed border-gray-100 rounded-xl p-6 bg-white">
                      <div className="text-center">
                        <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">
                          Waiting for reply from contact
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          We'll generate a suggested reply once they respond
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={handleOpenDraft}
                    disabled={!selectedThread.gmailDraftId && !selectedThread.gmailDraftUrl}
                    className="flex items-center gap-1"
                  >
                    <ExternalLink className="h-4 w-4" /> Open Gmail draft
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopy}
                    disabled={!selectedThread.suggestedReply}
                    className="flex items-center gap-1 border-input"
                  >
                    <Mail className="h-4 w-4" /> Copy reply text
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRegenerate}
                    disabled={generating || !selectedThread || !contactHasReplied(selectedThread)}
                    className="relative overflow-hidden flex items-center gap-1 text-foreground"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Regenerate
                    <InlineLoadingBar isLoading={generating} />
                  </Button>
                </div>

                <p className="text-[10px] text-muted-foreground mt-3">
                  Tip: personalize your first line — it's the one they read carefully.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
