import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiService, OutboxThread, OutboxStatus } from "@/services/api";
import {
  Mail,
  Search,
  ExternalLink,
  RefreshCw,
  Sparkles,
  FileText,
  Send,
  Coins,
  Inbox,
  LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

/* ---------- Status UI ---------- */

const statusLabel: Record<OutboxStatus, string> = {
  no_reply_yet: "Draft (not sent)",
  new_reply: "New reply",
  waiting_on_them: "Sent - waiting for reply",
  waiting_on_you: "Waiting on you",
  closed: "Closed",
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
  <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
    <Icon className="w-5 h-5 text-muted-foreground" />
    <div>
      <p className="text-xl font-semibold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  </div>
);

export default function Outbox() {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [threads, setThreads] = useState<OutboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<OutboxThread | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [generating, setGenerating] = useState(false);

  /* ---------- Load threads ---------- */

  const loadThreads = async () => {
    try {
      setLoading(true);
      const result = await apiService.getOutboxThreads();
      if ("error" in result) throw new Error(result.error);
      setThreads(result.threads || []);
    } catch (err: any) {
      toast({
        title: "Failed to load Outbox",
        description: err.message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThreads();
  }, []);

  const filteredThreads = useMemo(() => {
    const q = searchQuery.toLowerCase();
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
  }, [threads, searchQuery]);

  /* ---------- Dashboard Stats ---------- */

  const draftCount = useMemo(() => {
    return threads.filter((t) => t.hasDraft).length;
  }, [threads]);

  const sentCount = useMemo(() => {
    // Count threads that have been sent (status indicates sent, or has gmailThreadId)
    // For now, we'll count threads that are not "no_reply_yet" as sent
    return threads.filter((t) => t.status !== "no_reply_yet").length;
  }, [threads]);

  const credits = user?.credits ?? 0;

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
    // Get draft ID first
    const draftId = selectedThread?.gmailDraftId;
    
    if (!draftId) {
      toast({
        title: "No Gmail draft found",
        description: "Generate or regenerate a reply draft first.",
        variant: "destructive",
      });
      return;
    }
    
    // Always construct the correct URL format: #draft (singular) not #drafts (plural)
    // The correct format opens the specific draft, not the drafts folder
    let draftUrl = selectedThread?.gmailDraftUrl;
    
    // If URL exists but uses wrong format (#drafts), fix it
    if (draftUrl && draftUrl.includes('#drafts/')) {
      draftUrl = draftUrl.replace('#drafts/', '#draft/');
    }
    
    // If no URL or invalid format, construct correct one
    if (!draftUrl || !draftUrl.includes('#draft/')) {
      draftUrl = `https://mail.google.com/mail/u/0/#draft/${draftId}`;
    }
    
    console.log('Opening draft URL:', draftUrl);
    window.open(draftUrl, "_blank");
  };

  const handleRegenerate = async () => {
    if (!selectedThread) return;
    try {
      setGenerating(true);
      const result = await apiService.regenerateOutboxReply(selectedThread.id);
      if ("error" in result) throw new Error(result.error);

      const updated = result.thread;
      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelectedThread(updated);

      toast({
        title: "Reply generated",
        description: updated.hasDraft 
          ? "Your AI-generated reply has been saved as a Gmail draft."
          : "Reply generated successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Failed to regenerate",
        description: err.message,
        variant: "destructive",
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
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-white text-foreground">
        <AppSidebar />

        <div className="flex-1 flex flex-col">
          <AppHeader title="" />

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-6 bg-white">
            <div style={{ width: '100%', minWidth: 'fit-content' }}>
              <div style={{ maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
                {/* Page Title - Matching Find People styling */}
                <h1 className="text-[28px] font-semibold text-gray-900 mb-2">
                  Track Email Outreach
                </h1>
                
                {/* Helper text */}
                <p className="text-gray-500 text-sm mb-6">
                  Track outreach, responses, and generate follow-ups automatically.
                </p>

                {/* Stats Row */}
                <div className="flex flex-wrap gap-4 mb-6">
                  <StatCard icon={FileText} label="Drafts" value={draftCount} />
                  <StatCard icon={Send} label="Sent" value={sentCount} />
                  <StatCard icon={Coins} label="Credits" value={credits} />
                </div>

                {/* Main Content Area */}
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
                      <p>Loading conversations…</p>
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
                        onClick={() => setSelectedThread(t)}
                        className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${
                          selectedThread?.id === t.id
                            ? "bg-gradient-to-r from-blue-50 to-indigo-50 shadow-md ring-2 ring-blue-500/30"
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

                      {/* Actions */}
                      <div className="mt-3 flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          onClick={handleOpenDraft}
                          disabled={!selectedThread.hasDraft}
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
                          disabled={generating}
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
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

/* ---------- Loading Components ---------- */

const LoadingBar = ({ variant = "determinate", size = "md", progress = 0 }: { 
  variant?: "determinate" | "indeterminate"; 
  size?: "sm" | "md"; 
  progress?: number;
}) => {
  const height = size === "sm" ? "h-1" : "h-2";
  
  if (variant === "indeterminate") {
    return (
      <div className={`w-full ${height} bg-gray-200 rounded-full overflow-hidden`}>
        <div 
          className={`${height} bg-blue-500 rounded-full animate-[loading_1.5s_ease-in-out_infinite]`}
          style={{ width: "30%" }}
        />
      </div>
    );
  }
  
  return (
    <div className={`w-full ${height} bg-gray-200 rounded-full overflow-hidden`}>
      <div 
        className={`${height} bg-blue-500 rounded-full transition-all duration-300`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

const InlineLoadingBar = ({ isLoading }: { isLoading: boolean }) => {
  if (!isLoading) return null;
  
  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200 overflow-hidden">
      <div 
        className="h-full bg-blue-500 animate-[loading_1.5s_ease-in-out_infinite]"
        style={{ width: "30%" }}
      />
    </div>
  );
};
