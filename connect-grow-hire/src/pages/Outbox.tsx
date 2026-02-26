import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiService, OutboxThread, PipelineStage } from "@/services/api";
import { VideoDemo } from "@/components/VideoDemo";
import {
  Mail,
  Search,
  ExternalLink,
  RefreshCw,
  Inbox,
  AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

/* ---------- Pipeline stage badge ---------- */

const PIPELINE_LABEL: Record<string, string> = {
  draft_created: "Draft",
  email_sent: "Sent",
  waiting_on_reply: "Awaiting Reply",
  replied: "Replied",
  meeting_scheduled: "Meeting",
  connected: "Connected",
  no_response: "No Response",
  bounced: "Bounced",
  closed: "Closed",
};

const PIPELINE_BADGE_CLASS: Record<string, string> = {
  draft_created: "bg-slate-100 text-slate-600 border-slate-200",
  email_sent: "bg-blue-50 text-blue-600 border-blue-200",
  waiting_on_reply: "bg-amber-50 text-amber-600 border-amber-200",
  replied: "bg-emerald-50 text-emerald-600 border-emerald-200",
  meeting_scheduled: "bg-purple-50 text-purple-600 border-purple-200",
  connected: "bg-green-50 text-green-700 border-green-200",
  no_response: "bg-gray-100 text-gray-500 border-gray-200",
  bounced: "bg-gray-100 text-gray-500 border-gray-200",
  closed: "bg-gray-100 text-gray-400 border-gray-200",
};

/** Derive pipeline stage from legacy status when pipelineStage is missing (mirrors backend fallback). */
function getDisplayStage(t: OutboxThread): string | null {
  if (t.pipelineStage) return t.pipelineStage;
  const s = t.status;
  if (s === "no_reply_yet") return "draft_created";
  if (s === "waiting_on_them") return "waiting_on_reply";
  if (s === "new_reply" || s === "waiting_on_you") return "replied";
  if (s === "closed") return "closed";
  return null;
}

function getPipelineLabel(stage: string | null | undefined): string {
  if (!stage) return "—";
  return PIPELINE_LABEL[stage] ?? stage;
}

/** Stage badge inline styles for list/detail (design system). */
const PIPELINE_BADGE_STYLES: Record<string, { background: string; color: string }> = {
  draft_created: { background: "#F1F5F9", color: "#64748B" },
  email_sent: { background: "#EFF6FF", color: "#2563EB" },
  waiting_on_reply: { background: "#FFFBEB", color: "#D97706" },
  replied: { background: "#ECFDF5", color: "#059669" },
  meeting_scheduled: { background: "#F5F3FF", color: "#7C3AED" },
  connected: { background: "#ECFDF5", color: "#047857" },
  no_response: { background: "#F9FAFB", color: "#9CA3AF" },
  bounced: { background: "#F9FAFB", color: "#9CA3AF" },
  closed: { background: "#F9FAFB", color: "#9CA3AF" },
};

function getPipelineBadgeStyle(stage: string | null | undefined): { background: string; color: string } {
  if (!stage) return { background: "#F9FAFB", color: "#9CA3AF" };
  return PIPELINE_BADGE_STYLES[stage] ?? { background: "#F9FAFB", color: "#9CA3AF" };
}

function getPipelineBadgeClass(stage: string | null | undefined): string {
  if (!stage) return "bg-gray-100 text-gray-400 border-gray-200";
  return PIPELINE_BADGE_CLASS[stage] ?? "bg-gray-100 text-gray-500 border-gray-200";
}

/* ---------- Journey steps (for detail panel visualization) ---------- */
const JOURNEY_STAGES = ["draft_created", "email_sent", "waiting_on_reply", "replied", "meeting_scheduled", "connected"] as const;
const JOURNEY_LABELS: Record<string, string> = {
  draft_created: "Draft",
  email_sent: "Sent",
  waiting_on_reply: "Waiting",
  replied: "Reply",
  meeting_scheduled: "Meeting",
  connected: "Connected",
};

/* ---------- Tab / filter ---------- */

type TabId = "all" | "drafts" | "sent" | "replied" | "meeting" | "connected" | "no_response";

const TAB_STAGES: Record<TabId, (string | null)[] | null> = {
  all: null,
  drafts: ["draft_created"],
  sent: ["email_sent", "waiting_on_reply"],
  replied: ["replied"],
  meeting: ["meeting_scheduled"],
  connected: ["connected"],
  no_response: ["no_response"],
};

function filterThreadsByTab(threads: OutboxThread[], tab: TabId): OutboxThread[] {
  const stages = TAB_STAGES[tab];
  if (!stages) return threads;
  return threads.filter((t) => {
    const s = getDisplayStage(t);
    return s != null && stages.includes(s);
  });
}

/* ---------- Sort ---------- */

type SortId = "recent_activity" | "oldest_first" | "recently_sent";

function sortThreads(threads: OutboxThread[], sortId: SortId): OutboxThread[] {
  const copy = [...threads];
  if (sortId === "recent_activity") {
    copy.sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
  } else if (sortId === "oldest_first") {
    copy.sort((a, b) => (a.lastActivityAt || "").localeCompare(b.lastActivityAt || ""));
  } else {
    copy.sort((a, b) => {
      const at = a.emailSentAt || "";
      const bt = b.emailSentAt || "";
      return bt.localeCompare(at);
    });
  }
  return copy;
}

export default function Outbox() {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { markOneRead } = useNotifications();
  const queryClient = useQueryClient();

  const [selectedThread, setSelectedThread] = useState<OutboxThread | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [sortBy, setSortBy] = useState<SortId>("recent_activity");
  const [generating, setGenerating] = useState(false);
  const [batchSyncing, setBatchSyncing] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchSyncDoneRef = useRef(false);

  /* ---------- Debounce search ---------- */
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  /* ---------- Queries ---------- */
  const {
    data: threadsData,
    isLoading: threadsLoading,
    isError: threadsError,
    refetch: refetchThreads,
  } = useQuery({
    queryKey: ["outbox-threads"],
    queryFn: async () => {
      const result = await apiService.getOutboxThreads();
      if ("error" in result) throw new Error(result.error);
      return result.threads ?? [];
    },
    staleTime: 30 * 1000,
  });

  const threads = threadsData ?? [];

  const { data: statsData } = useQuery({
    queryKey: ["outbox-stats"],
    queryFn: async () => {
      const result = await apiService.getOutboxStats();
      if ("error" in result) throw new Error((result as { error: string }).error);
      return result;
    },
    staleTime: 30 * 1000,
  });

  const stats = statsData ?? null;

  /* ---------- Batch sync on load (stale mode: server picks 10 most stale) ---------- */
  useEffect(() => {
    if (batchSyncDoneRef.current || batchSyncing) return;
    batchSyncDoneRef.current = true;
    setBatchSyncing(true);
    apiService
      .batchSyncOutbox({ mode: "stale", max: 10 })
      .then((res) => {
        if ("error" in res) return;
        queryClient.invalidateQueries({ queryKey: ["outbox-threads"] });
        queryClient.invalidateQueries({ queryKey: ["outbox-stats"] });
        if (res.results?.some((r) => r.synced)) {
          refetchThreads();
        }
      })
      .catch(() => {})
      .finally(() => setBatchSyncing(false));
  }, [batchSyncing, queryClient, refetchThreads]);

  /* ---------- Stage mutation ---------- */
  const stageMutation = useMutation({
    mutationFn: async ({ contactId, stage }: { contactId: string; stage: PipelineStage }) => {
      const result = await apiService.patchOutboxStage(contactId, stage);
      if ("error" in result) throw new Error(result.error);
      return result.thread;
    },
    onMutate: async ({ contactId, stage }) => {
      await queryClient.cancelQueries({ queryKey: ["outbox-threads"] });
      const prev = queryClient.getQueryData<OutboxThread[]>(["outbox-threads"]);
      queryClient.setQueryData<OutboxThread[]>(["outbox-threads"], (old) =>
        (old ?? []).map((t) =>
          t.id === contactId ? { ...t, pipelineStage: stage } : t
        )
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev != null) {
        queryClient.setQueryData(["outbox-threads"], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["outbox-threads"] });
      queryClient.invalidateQueries({ queryKey: ["outbox-stats"] });
    },
  });

  const handleStageChange = (contactId: string, stage: PipelineStage, label: string) => {
    setSelectedThread((curr) =>
      curr?.id === contactId ? { ...curr, pipelineStage: stage } : curr
    );
    stageMutation.mutate(
      { contactId, stage },
      {
        onSuccess: () => {
          toast({ title: `Updated to ${label}` });
        },
        onError: (err: Error) => {
          toast({ title: "Update failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  /* ---------- Filtered & sorted list ---------- */
  const tabFiltered = useMemo(
    () => filterThreadsByTab(threads, activeTab),
    [threads, activeTab]
  );
  const searchFiltered = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase();
    if (!q) return tabFiltered;
    return tabFiltered.filter((t) =>
      [t.contactName, t.company, t.jobTitle, t.email, t.lastMessageSnippet]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [tabFiltered, debouncedSearchQuery]);
  const displayedThreads = useMemo(
    () => sortThreads(searchFiltered, sortBy),
    [searchFiltered, sortBy]
  );

  /* ---------- Helpers ---------- */
  const formatLastActivity = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  };

  const formatSentAt = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 86400) return `Sent ${Math.round(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `Sent ${Math.round(diff / 86400)}d ago`;
    return `Sent ${d.toLocaleDateString()}`;
  };

  const handleOpenDraft = () => {
    const thread = selectedThread;
    if (!thread) return;
    // Prefer #drafts?compose=<messageId> to open the specific draft (not the folder)
    let draftUrl: string | undefined;
    if (thread.gmailMessageId) {
      draftUrl = `https://mail.google.com/mail/u/0/#drafts?compose=${thread.gmailMessageId}`;
    } else if (thread.gmailDraftUrl) {
      draftUrl = thread.gmailDraftUrl;
    }
    if (!draftUrl) {
      toast({
        title: "No Gmail draft found",
        description: "Generate or regenerate a reply draft first.",
        variant: "destructive",
      });
      return;
    }
    window.open(draftUrl, "_blank");
  };

  const handleRegenerate = async () => {
    if (!selectedThread) return;
    const hasReplied =
      selectedThread.status === "new_reply" || selectedThread.status === "waiting_on_you";
    if (!hasReplied) {
      toast({
        title: "No reply from contact",
        description: "You can only generate a reply after the contact responds.",
        variant: "destructive",
      });
      return;
    }
    try {
      setGenerating(true);
      const result = await apiService.regenerateOutboxReply(selectedThread.id);
      if ("error" in result) {
        const err = result as { error: string; error_code?: string; credits_available?: number; credits_required?: number };
        if (err.error_code === "insufficient_credits") {
          toast({
            title: "Insufficient credits",
            description: err.error,
            variant: "destructive",
            action: <Button size="sm" variant="outline" onClick={() => navigate("/pricing")}>View Plans</Button>,
          });
        } else if (err.error_code === "gmail_not_connected") {
          toast({
            title: "Gmail not connected",
            description: err.error,
            variant: "destructive",
            action: <Button size="sm" variant="outline" onClick={() => navigate("/account-settings")}>Connect Gmail</Button>,
          });
        } else {
          toast({ title: "Error", description: err.error, variant: "destructive" });
        }
        return;
      }
      const updated = (result as { thread: OutboxThread }).thread;
      queryClient.setQueryData<OutboxThread[]>(["outbox-threads"], (old) =>
        (old ?? []).map((t) => (t.id === updated.id ? updated : t))
      );
      setSelectedThread(updated);
      toast({
        title: "Reply generated",
        description: updated.hasDraft ? "Saved as a Gmail draft." : "Reply generated.",
      });
    } catch (err: any) {
      toast({ title: "Failed to regenerate", description: err?.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!selectedThread?.suggestedReply) return;
    await navigator.clipboard.writeText(selectedThread.suggestedReply);
    toast({ title: "Copied", description: "Reply text copied to clipboard." });
  };

  const handleThreadClick = async (t: OutboxThread) => {
    setSelectedThread(t);
    if (t.hasUnreadReply) {
      markOneRead(t.id).catch(() => {});
      queryClient.setQueryData<OutboxThread[]>(["outbox-threads"], (old) =>
        (old ?? []).map((thread) =>
          thread.id === t.id ? { ...thread, hasUnreadReply: false } : thread
        )
      );
    }
    try {
      const synced = await apiService.syncOutboxThread(t.id);
      if (synced && "thread" in synced && synced.thread) {
        queryClient.setQueryData<OutboxThread[]>(["outbox-threads"], (old) =>
          (old ?? []).map((thread) => (thread.id === t.id ? synced.thread : thread))
        );
        setSelectedThread((curr) => (curr?.id === t.id ? synced.thread : curr));
      }
    } catch {
      // keep cached data
    }
  };

  /* ---------- Tab counts: stats when available, else local counts from loaded threads ---------- */
  const localCountByStage = (tab: TabId): number => {
    if (tab === "all") return threads?.length ?? 0;
    const stages = TAB_STAGES[tab];
    if (!stages) return 0;
    return (threads ?? []).filter((t) => {
      const s = getDisplayStage(t);
      return s != null && stages.includes(s);
    }).length;
  };
  const tabCount = (tab: TabId): number => {
    const fromStats =
      stats != null && typeof stats.total === "number"
        ? tab === "all"
          ? stats.total
          : tab === "drafts"
            ? stats.draft_created ?? 0
            : tab === "sent"
              ? (stats.email_sent ?? 0) + (stats.waiting_on_reply ?? 0)
              : tab === "replied"
                ? stats.replied ?? 0
                : tab === "meeting"
                  ? stats.meeting_scheduled ?? 0
                  : tab === "connected"
                    ? stats.connected ?? 0
                    : tab === "no_response"
                      ? stats.no_response ?? 0
                      : 0
        : null;
    if (fromStats != null) return fromStats;
    return localCountByStage(tab);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "all", label: "All" },
    { id: "drafts", label: "Drafts" },
    { id: "sent", label: "Sent" },
    { id: "replied", label: "Replied" },
    { id: "meeting", label: "Meeting" },
    { id: "connected", label: "Connected" },
    { id: "no_response", label: "No Reply" },
  ];

  const loading = threadsLoading;
  const credits = user?.credits ?? 0;

  return (
    <TooltipProvider>
      <style>{`
  .outbox-thread-list::-webkit-scrollbar { width: 4px; }
  .outbox-thread-list::-webkit-scrollbar-track { background: transparent; }
  .outbox-thread-list::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
  .outbox-thread-list::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
  .outbox-detail-panel::-webkit-scrollbar { width: 4px; }
  .outbox-detail-panel::-webkit-scrollbar-track { background: transparent; }
  .outbox-detail-panel::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
  .outbox-detail-panel::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
`}</style>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-white text-foreground">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <AppHeader title="" />
            <main style={{ background: "#F8FAFF", flex: 1, overflowY: "auto", padding: "48px 24px" }}>
              <div style={{ width: "100%", minWidth: "fit-content" }}>
                <div style={{ maxWidth: "1680px", margin: "0 auto", width: "100%" }}>
                  <h1
                    style={{
                      fontFamily: "'Instrument Serif', Georgia, serif",
                      fontSize: "28px",
                      fontWeight: 400,
                      letterSpacing: "-0.02em",
                      color: "#0F172A",
                      marginBottom: "4px",
                      lineHeight: 1.2,
                      textShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                    }}
                  >
                    Email Outreach
                  </h1>
                  <p
                    style={{
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      fontSize: "14px",
                      color: "#94A3B8",
                      marginBottom: "20px",
                      lineHeight: 1.4,
                    }}
                  >
                    Track your pipeline from draft to connection.
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <VideoDemo videoId="n_AYHEJSXrE" />
                  </div>

                  {/* Tabs + search + sort (one row) */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ display: "inline-flex", background: "#F0F4FD", borderRadius: "12px", padding: "4px" }}>
                      {tabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          onMouseEnter={(e) => {
                            if (activeTab !== tab.id) {
                              e.currentTarget.style.color = "#334155";
                              e.currentTarget.style.background = "rgba(37, 99, 235, 0.06)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (activeTab !== tab.id) {
                              e.currentTarget.style.color = "#64748B";
                              e.currentTarget.style.background = "transparent";
                            }
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "8px 18px",
                            borderRadius: "9px",
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            fontSize: "13px",
                            fontWeight: 500,
                            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                            background: activeTab === tab.id ? "#2563EB" : "transparent",
                            color: activeTab === tab.id ? "white" : "#64748B",
                            boxShadow: activeTab === tab.id ? "0 1px 3px rgba(37, 99, 235, 0.25)" : "none",
                          }}
                        >
                          {tab.label}
                          <span style={{ fontSize: "11px", opacity: 0.7 }}>{tabCount(tab.id)}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ position: "relative" }}>
                        <Search style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#94A3B8" }} />
                        <input
                          type="text"
                          placeholder="Search by name, firm, subject…"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          style={{
                            width: "240px",
                            height: "38px",
                            borderRadius: "10px",
                            border: "1px solid #E2E8F0",
                            background: "#FAFBFC",
                            paddingLeft: "36px",
                            fontSize: "13px",
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            outline: "none",
                            transition: "all 0.2s ease",
                            color: "#334155",
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = "#3B82F6";
                            e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.08)";
                            e.target.style.background = "#FFFFFF";
                            e.target.style.width = "300px";
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = "#E2E8F0";
                            e.target.style.boxShadow = "none";
                            e.target.style.background = "#FAFBFC";
                            e.target.style.width = "240px";
                          }}
                        />
                      </div>
                      {batchSyncing && (
                        <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: "12px", color: "#64748B" }}>Syncing…</span>
                      )}
                      <Button size="icon" variant="outline" onClick={() => refetchThreads()} style={{ height: "40px", width: "40px", borderRadius: "10px", border: "1px solid #E2E8F0", background: "#FFF" }}>
                        <RefreshCw style={{ width: 16, height: 16 }} />
                      </Button>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortId)}
                        style={{
                          height: "40px",
                          borderRadius: "10px",
                          border: "1px solid #E2E8F0",
                          background: "#FFF",
                          fontSize: "13px",
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          paddingLeft: "12px",
                          paddingRight: "28px",
                          minWidth: "140px",
                          cursor: "pointer",
                        }}
                      >
                        <option value="recent_activity">Recent activity</option>
                        <option value="oldest_first">Oldest first</option>
                        <option value="recently_sent">Recently sent</option>
                      </select>
                    </div>
                  </div>

                  {/* Main card: two-panel layout */}
                  <div
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid rgba(37, 99, 235, 0.06)",
                      borderRadius: "16px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "calc(100vh - 260px)" }}>
                      {/* LEFT: Thread list — minWidth 0 so grid column can shrink; snippet can use full width */}
                      <div className="outbox-thread-list" style={{ borderRight: "1px solid rgba(37, 99, 235, 0.06)", overflowY: "auto", overflowX: "hidden", maxHeight: "calc(100vh - 260px)", minWidth: 0 }}>
                        {loading && (
                          <div style={{ padding: "40px 24px", textAlign: "center", fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: "13px", color: "#64748B" }}>
                            <p>Loading…</p>
                            <div style={{ width: "192px", margin: "12px auto 0", height: "4px", background: "#E2E8F0", borderRadius: "9999px", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: "30%", background: "#2563EB", borderRadius: "9999px", animation: "pulse 1.5s ease-in-out infinite" }} />
                            </div>
                          </div>
                        )}

                        {!loading && threadsError && (
                          <div style={{ textAlign: "center", padding: "48px 24px" }}>
                            <p style={{ color: "#DC2626", marginBottom: "8px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>Failed to load</p>
                            <Button size="sm" variant="outline" onClick={() => refetchThreads()}>Retry</Button>
                          </div>
                        )}

                        {!loading && !threadsError && displayedThreads.length === 0 && threads.length === 0 && (
                          <div style={{ textAlign: "center", padding: "48px 24px" }}>
                            <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "#F1F5F9", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Inbox style={{ width: 28, height: 28, color: "#94A3B8" }} />
                            </div>
                            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#0F172A", marginBottom: "8px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>No drafts yet</h3>
                            <p style={{ color: "#94A3B8", fontSize: "13px", marginBottom: "16px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>Find contacts and start building your network</p>
                            <Button onClick={() => navigate("/contact-search")} style={{ background: "#2563EB", color: "white", border: "none" }}>Find Contacts</Button>
                          </div>
                        )}

                        {!loading && !threadsError && displayedThreads.length === 0 && threads.length > 0 && (
                          <div style={{ textAlign: "center", padding: "48px 24px" }}>
                            <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "#F1F5F9", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Search style={{ width: 28, height: 28, color: "#94A3B8" }} />
                            </div>
                            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#0F172A", marginBottom: "8px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>No results found</h3>
                            <p style={{ color: "#94A3B8", fontSize: "13px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>Try adjusting your search or filter</p>
                          </div>
                        )}

                        {!loading && !threadsError && displayedThreads.length > 0 &&
                          displayedThreads.map((t) => {
                            const stage = getDisplayStage(t);
                            const badgeStyle = getPipelineBadgeStyle(stage);
                            const initials = (t.contactName || "?").split(/\s+/).map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "?";
                            const isSelected = selectedThread?.id === t.id;
                            return (
                              <div
                                key={t.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleThreadClick(t)}
                                onKeyDown={(e) => e.key === "Enter" && handleThreadClick(t)}
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: "12px",
                                  padding: "14px 20px",
                                  cursor: "pointer",
                                  borderBottom: "1px solid #F1F5F9",
                                  position: "relative",
                                  background: isSelected ? "#EFF6FF" : undefined,
                                  fontFamily: "'DM Sans', system-ui, sans-serif",
                                  minWidth: 0,
                                  width: "100%",
                                  boxSizing: "border-box",
                                  transition: "background 0.15s ease, box-shadow 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.background = "#F8FAFF";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.background = "";
                                  }
                                }}
                              >
                                {(t.hasUnreadReply || t.status === "new_reply") && (
                                  <span style={{ position: "absolute", left: "6px", top: "22px", width: "6px", height: "6px", borderRadius: "50%", background: "#2563EB" }} />
                                )}
                                <div style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: 12,
                                  background: badgeStyle.background,
                                  color: badgeStyle.color,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "13px",
                                  fontWeight: 700,
                                  flexShrink: 0,
                                  letterSpacing: "0.04em",
                                  boxShadow: `inset 0 0 0 1px ${badgeStyle.color}15`,
                                }}>{initials}</div>
                                {/* Content column: name, role, snippet only — takes all remaining space so snippet uses full line */}
                                <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                                  <div style={{ fontSize: 13.5, fontWeight: (t.hasUnreadReply || t.status === "new_reply") ? 700 : 600, color: (t.hasUnreadReply || t.status === "new_reply") ? "#0F172A" : "#1E293B", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.contactName}</div>
                                  <div style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{t.jobTitle} · {t.company}</div>
                                  <p
                                    style={{
                                      fontSize: 12,
                                      color: "#64748B",
                                      marginTop: 6,
                                      lineHeight: 1.5,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      minWidth: 0,
                                    }}
                                  >
                                    {t.lastMessageSnippet || "—"}
                                  </p>
                                </div>
                                {/* Meta column: time + badge — fixed width so content column gets the rest */}
                                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginLeft: "8px" }}>
                                  <span style={{ fontSize: 11, color: "#94A3B8" }}>{formatLastActivity(t.lastActivityAt)}</span>
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 6, background: badgeStyle.background, color: badgeStyle.color, letterSpacing: "0.02em" }}>{getPipelineLabel(stage)}</span>
                                    {t.lastSyncError && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span><AlertCircle style={{ width: 14, height: 14, color: "#F59E0B" }} /></span>
                                        </TooltipTrigger>
                                        <TooltipContent><p style={{ fontSize: "12px" }}>{t.lastSyncError.message}</p></TooltipContent>
                                      </Tooltip>
                                    )}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {/* RIGHT: Detail panel */}
                      <div className="outbox-detail-panel" style={{ overflowY: "auto", maxHeight: "calc(100vh - 260px)" }}>
                      {!selectedThread ? (
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: "400px",
                          padding: "24px",
                          background: "linear-gradient(135deg, #FAFBFE 0%, #F5F7FD 100%)",
                        }}>
                          <div style={{
                            width: 56,
                            height: 56,
                            borderRadius: 16,
                            background: "#FFFFFF",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: 16,
                          }}>
                            <Inbox style={{ width: 24, height: 24, color: "#94A3B8" }} />
                          </div>
                          <p style={{ fontSize: "14px", color: "#94A3B8", fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 500 }}>
                            Select a conversation to view details
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* 8a. Header section */}
                          <div style={{
                            padding: "20px 24px 16px",
                            borderBottom: "1px solid #F1F5F9",
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: "12px",
                            background: "linear-gradient(to bottom, #FAFBFE, #FFFFFF)",
                          }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em", color: "#0F172A", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{selectedThread.contactName}</p>
                              <p style={{ fontSize: "13px", color: "#64748B", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{selectedThread.jobTitle} at {selectedThread.company}</p>
                              <p style={{ fontSize: "12px", color: "#94A3B8", marginTop: "3px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{selectedThread.email}</p>
                            </div>
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "5px 10px",
                                fontSize: "12px",
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                                fontWeight: 500,
                                borderRadius: "10px",
                                border: "1px solid #E2E8F0",
                                background: getPipelineBadgeStyle(getDisplayStage(selectedThread)).background,
                                color: getPipelineBadgeStyle(getDisplayStage(selectedThread)).color,
                                flexShrink: 0,
                                cursor: "default",
                                transition: "all 0.15s ease",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: getPipelineBadgeStyle(getDisplayStage(selectedThread)).color }} />
                              {getPipelineLabel(getDisplayStage(selectedThread))}
                            </span>
                          </div>

                          {/* 8c. Latest message */}
                          <div style={{ padding: "12px 20px", borderBottom: "1px solid #F1F5F9" }}>
                            <p style={{ fontSize: "10px", fontWeight: 500, color: "#B0B8C4", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                              {selectedThread.pipelineStage === "draft_created" ? "Draft Preview" : "Latest Message"}
                            </p>
                            <div style={{ background: "#FAFBFE", border: "1px solid #EEF2F6", borderRadius: "12px", padding: "16px 18px", fontSize: "13.5px", lineHeight: 1.7, color: "#334155", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                              {selectedThread.lastMessageSnippet || (selectedThread.status === "no_reply_yet" ? "Draft is ready to send in Gmail" : "No message content available.")}
                            </div>
                            {selectedThread.emailSentAt && (
                              <p style={{ fontSize: "11px", color: "#94A3B8", marginTop: "8px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{formatSentAt(selectedThread.emailSentAt)}</p>
                            )}
                          </div>

                          {/* 8d. Suggested reply */}
                          <div style={{ padding: "12px 20px", borderBottom: "1px solid #F1F5F9" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                              <p style={{ fontSize: "10px", fontWeight: 500, color: "#B0B8C4", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans', system-ui, sans-serif" }}>Suggested Reply</p>
                              {selectedThread.hasDraft && selectedThread.suggestedReply && (
                                <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "6px", background: "#EFF6FF", color: "#2563EB", fontWeight: 500 }}>Draft saved</span>
                              )}
                              {selectedThread.replyType && (
                                <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "6px", fontWeight: 500, ...(selectedThread.replyType === "positive" ? { background: "#ECFDF5", color: "#059669" } : selectedThread.replyType === "decline" ? { background: "#FEF2F2", color: "#DC2626" } : { background: "#EFF6FF", color: "#2563EB" }) }}>{selectedThread.replyType}</span>
                              )}
                            </div>
                            {selectedThread.suggestedReply ? (
                              <textarea
                                readOnly
                                value={selectedThread.suggestedReply}
                                style={{ width: "100%", minHeight: 90, padding: "14px 16px", fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: "13px", lineHeight: 1.6, border: "1px solid #E2E8F0", borderRadius: "12px", background: "#FAFBFC", resize: "vertical" }}
                              />
                            ) : (
                              <div style={{ padding: "24px", textAlign: "center", border: "1px dashed #E8ECF1", borderRadius: "12px", color: "#B0B8C4", fontSize: "13px", fontFamily: "'DM Sans', system-ui, sans-serif", background: "#FCFCFD" }}>
                                No reply generated yet — click Regenerate after they respond
                              </div>
                            )}
                          </div>

                          {/* 8e. Action buttons */}
                          <div style={{ padding: "12px 20px 16px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={handleOpenDraft}
                              disabled={!selectedThread.hasDraft}
                              onMouseEnter={(e) => {
                                if (selectedThread?.hasDraft) {
                                  e.currentTarget.style.background = "#1D4ED8";
                                  e.currentTarget.style.transform = "translateY(-1px)";
                                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(37, 99, 235, 0.35)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#2563EB";
                                e.currentTarget.style.transform = "";
                                e.currentTarget.style.boxShadow = "0 1px 2px rgba(37, 99, 235, 0.3)";
                              }}
                              style={{
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                                fontSize: "13px",
                                fontWeight: 500,
                                padding: "8px 16px",
                                borderRadius: "10px",
                                border: "1px solid #1D4ED8",
                                background: "#2563EB",
                                color: "white",
                                cursor: selectedThread.hasDraft ? "pointer" : "not-allowed",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                opacity: selectedThread.hasDraft ? 1 : 0.4,
                                boxShadow: "0 1px 2px rgba(37, 99, 235, 0.3)",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <ExternalLink style={{ width: 16, height: 16 }} /> Open Gmail Draft
                            </button>
                            <button
                              type="button"
                              onClick={handleCopy}
                              disabled={!selectedThread.suggestedReply}
                              onMouseEnter={(e) => {
                                if (selectedThread.suggestedReply) {
                                  e.currentTarget.style.background = "#F8FAFF";
                                  e.currentTarget.style.borderColor = "#CBD5E1";
                                  e.currentTarget.style.transform = "translateY(-1px)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#FFF";
                                e.currentTarget.style.borderColor = "#E2E8F0";
                                e.currentTarget.style.transform = "";
                              }}
                              style={{
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                                fontSize: "13px",
                                fontWeight: 500,
                                padding: "8px 16px",
                                borderRadius: "10px",
                                border: "1px solid #E2E8F0",
                                background: "#FFF",
                                color: "#334155",
                                cursor: selectedThread.suggestedReply ? "pointer" : "not-allowed",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                opacity: selectedThread.suggestedReply ? 1 : 0.4,
                                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <Mail style={{ width: 16, height: 16 }} /> Copy Reply
                            </button>
                            <button
                              type="button"
                              onClick={handleRegenerate}
                              disabled={generating}
                              onMouseEnter={(e) => {
                                if (!generating) {
                                  e.currentTarget.style.background = "#F8FAFF";
                                  e.currentTarget.style.borderColor = "#CBD5E1";
                                  e.currentTarget.style.transform = "translateY(-1px)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#FFF";
                                e.currentTarget.style.borderColor = "#E2E8F0";
                                e.currentTarget.style.transform = "";
                              }}
                              style={{
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                                fontSize: "13px",
                                fontWeight: 500,
                                padding: "8px 16px",
                                borderRadius: "10px",
                                border: "1px solid #E2E8F0",
                                background: "#FFF",
                                color: "#334155",
                                cursor: generating ? "not-allowed" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                opacity: generating ? 0.4 : 1,
                                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <RefreshCw style={{ width: 16, height: 16 }} />
                              Regenerate
                              {generating && <span style={{ display: "inline-block", width: 16, height: 4, background: "#E2E8F0", borderRadius: 2, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: "30%", background: "#2563EB", animation: "pulse 1s ease-in-out infinite" }} /></span>}
                            </button>
                          </div>
                        </>
                      )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
