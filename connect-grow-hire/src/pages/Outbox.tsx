import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiService, OutboxThread, PipelineStage } from "@/services/api";
import {
  Mail,
  Search,
  ExternalLink,
  RefreshCw,
  FileText,
  Send,
  MessageSquare,
  UserCheck,
  TrendingUp,
  Inbox,
  LucideIcon,
  AlertCircle,
  MoreHorizontal,
  Clock,
  Calendar,
  MessageCircle,
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

function getPipelineBadgeClass(stage: string | null | undefined): string {
  if (!stage) return "bg-gray-100 text-gray-400 border-gray-200";
  return PIPELINE_BADGE_CLASS[stage] ?? "bg-gray-100 text-gray-500 border-gray-200";
}

/* ---------- StatCard ---------- */

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
}

const StatCard = ({ icon: Icon, label, value }: StatCardProps) => (
  <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-sm">
    <Icon className="w-4 h-4 text-muted-foreground" />
    <div>
      <p className="text-base font-medium text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  </div>
);

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
    const draftId = selectedThread?.gmailDraftId;
    if (!draftId) {
      toast({
        title: "No Gmail draft found",
        description: "Generate or regenerate a reply draft first.",
        variant: "destructive",
      });
      return;
    }
    let draftUrl = selectedThread?.gmailDraftUrl;
    if (draftUrl?.includes("#drafts/")) draftUrl = draftUrl.replace("#drafts/", "#draft/");
    if (!draftUrl?.includes("#draft/")) draftUrl = `https://mail.google.com/mail/u/0/#draft/${draftId}`;
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
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-white text-foreground">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <AppHeader title="" />
            <main style={{ background: "#F8FAFF", flex: 1, overflowY: "auto", padding: "48px 24px" }}>
              <div style={{ width: "100%", minWidth: "fit-content" }}>
                <div style={{ maxWidth: "900px", margin: "0 auto", width: "100%" }}>
                  <h1
                    style={{
                      fontFamily: "'Instrument Serif', Georgia, serif",
                      fontSize: "42px",
                      fontWeight: 400,
                      letterSpacing: "-0.025em",
                      color: "#0F172A",
                      textAlign: "center",
                      marginBottom: "10px",
                      lineHeight: 1.1,
                    }}
                  >
                    Email Outreach
                  </h1>
                  <p
                    style={{
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      fontSize: "16px",
                      color: "#64748B",
                      textAlign: "center",
                      marginBottom: "28px",
                      lineHeight: 1.5,
                    }}
                  >
                    Track your networking pipeline from first email to connection.
                  </p>

                  {/* Stats */}
                  <div className="mb-6">
                    <div className="flex flex-wrap gap-3 mb-2">
                      <StatCard
                        icon={FileText}
                        label="Drafts"
                        value={stats?.draft_created ?? 0}
                      />
                      <StatCard
                        icon={Send}
                        label="Sent"
                        value={stats?.waiting_on_reply ?? 0}
                      />
                      <StatCard
                        icon={MessageSquare}
                        label="Replied"
                        value={stats?.replied ?? 0}
                      />
                      <StatCard
                        icon={UserCheck}
                        label="Connected"
                        value={stats?.connected ?? 0}
                      />
                      <StatCard
                        icon={TrendingUp}
                        label="Reply Rate"
                        value={stats != null ? `${Math.round((stats.replyRate ?? 0) * 100)}%` : "—"}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Avg. Response: {stats?.avgResponseTimeDays != null ? `${stats.avgResponseTimeDays} days` : "—"}
                      </span>
                      <span className="text-muted-foreground/60">·</span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Sent this week: {stats?.thisWeekSent ?? 0}
                      </span>
                      <span className="text-muted-foreground/60">·</span>
                      <span className="flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5" />
                        Replies this week: {stats?.thisWeekReplied ?? 0}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-6">
                    {/* LEFT: Thread list */}
                    <div className="w-1/2 space-y-4">
                      <div className="flex justify-between items-center gap-2">
                        <div className="flex items-center gap-2 border-b border-transparent min-h-[36px] overflow-x-auto whitespace-nowrap">
                          {tabs.map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setActiveTab(tab.id)}
                              className={`px-2 py-1.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                                activeTab === tab.id
                                  ? "font-semibold text-foreground border-blue-500"
                                  : "text-muted-foreground border-transparent hover:text-foreground"
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {batchSyncing && (
                            <span className="text-xs text-muted-foreground">Syncing…</span>
                          )}
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => refetchThreads()}
                            className="border-0 shadow-sm hover:shadow-md bg-white"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
                          <Input
                            className="pl-9 bg-white shadow-sm hover:shadow-md border-0 focus:ring-2 focus:ring-purple-500/20"
                            placeholder="Search by name, firm, subject…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortId)}>
                          <SelectTrigger className="w-[140px] bg-white shadow-sm border-0 focus:ring-2 focus:ring-purple-500/20">
                            <SelectValue placeholder="Sort" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="recent_activity">Recent activity</SelectItem>
                            <SelectItem value="oldest_first">Oldest first</SelectItem>
                            <SelectItem value="recently_sent">Recently sent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                        {loading && (
                          <div className="py-10 text-center text-muted-foreground text-sm space-y-3">
                            <p>Loading…</p>
                            <div className="w-48 mx-auto">
                              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full w-[30%] bg-blue-500 rounded-full animate-pulse" />
                              </div>
                            </div>
                          </div>
                        )}

                        {!loading && threadsError && (
                          <div className="text-center py-12">
                            <p className="text-destructive mb-2">Failed to load</p>
                            <Button size="sm" variant="outline" onClick={() => refetchThreads()}>
                              Retry
                            </Button>
                          </div>
                        )}

                        {!loading && !threadsError && displayedThreads.length === 0 && threads.length === 0 && (
                          <div className="text-center py-12">
                            <Inbox className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-foreground mb-2">No drafts yet</h3>
                            <p className="text-muted-foreground mb-4">
                              Find contacts and start building your network
                            </p>
                            <Button onClick={() => navigate("/contact-search")}>Find Contacts</Button>
                          </div>
                        )}

                        {!loading && !threadsError && displayedThreads.length === 0 && threads.length > 0 && (
                          <div className="text-center py-12">
                            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-foreground mb-2">No results found</h3>
                            <p className="text-muted-foreground">Try adjusting search or filter</p>
                          </div>
                        )}

                        {!loading && !threadsError && displayedThreads.length > 0 &&
                          displayedThreads.map((t) => (
                            <div
                              key={t.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleThreadClick(t)}
                              onKeyDown={(e) => e.key === "Enter" && handleThreadClick(t)}
                              className={`group w-full text-left p-4 rounded-xl transition-all duration-200 cursor-pointer ${
                                selectedThread?.id === t.id
                                  ? "bg-gray-50 shadow-sm"
                                  : "bg-white shadow-sm hover:bg-gray-50/50"
                              }`}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 font-semibold text-sm">
                                    {(t.hasUnreadReply || t.status === "new_reply") && (
                                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                    )}
                                    <span className="truncate">{t.contactName}</span>
                                    {t.lastSyncError && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="shrink-0">
                                            <AlertCircle className="w-3 h-3 text-amber-500" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">{t.lastSyncError.message}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {t.jobTitle} · {t.company}
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                    {t.lastMessageSnippet}
                                  </p>
                                  {t.emailSentAt && (
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                      {formatSentAt(t.emailSentAt)}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-8 w-8"
                                          aria-label="More actions"
                                        >
                                          <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                        {t.pipelineStage === "draft_created" && (
                                          <DropdownMenuItem onClick={() => handleStageChange(t.id, "email_sent", "Sent")}>
                                            Mark as Sent
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem onClick={() => handleStageChange(t.id, "replied", "Replied")}>
                                          Mark as Replied
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStageChange(t.id, "meeting_scheduled", "Meeting Scheduled")}>
                                          Mark as Meeting Scheduled
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStageChange(t.id, "connected", "Connected")}>
                                          Mark as Connected
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStageChange(t.id, "no_response", "No Response")}>
                                          Mark as No Response
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStageChange(t.id, "closed", "Closed")}>
                                          Mark as Closed
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const draftId = t.gmailDraftId;
                                            if (draftId) {
                                              let url = t.gmailDraftUrl;
                                              if (url?.includes("#drafts/")) url = url.replace("#drafts/", "#draft/");
                                              if (!url?.includes("#draft/")) url = `https://mail.google.com/mail/u/0/#draft/${draftId}`;
                                              window.open(url, "_blank");
                                            }
                                          }}
                                        >
                                          <ExternalLink className="h-3.5 w-3.5 mr-2" />
                                          Open in Gmail
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                  <span className="text-[11px] text-muted-foreground">
                                    {formatLastActivity(t.lastActivityAt)}
                                  </span>
                                  <Badge className={`border text-[9px] px-1.5 py-0.5 font-normal ${getPipelineBadgeClass(getDisplayStage(t))}`}>
                                    {getPipelineLabel(getDisplayStage(t))}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* RIGHT: Thread detail (unchanged) */}
                    <div className="w-1/2">
                      {!selectedThread ? (
                        <div className="h-full rounded-2xl p-6 text-center text-muted-foreground text-sm bg-gray-50/30">
                          <div className="flex flex-col items-center justify-center h-full">
                            <Inbox className="w-16 h-16 text-muted-foreground/20 mb-4" />
                            <p className="text-xs">Select a conversation to view details</p>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full rounded-2xl p-6 bg-white shadow-lg flex flex-col">
                          <div className="mb-3">
                            <p className="font-semibold text-sm text-foreground">{selectedThread.contactName}</p>
                            <p className="text-xs text-muted-foreground">
                              {selectedThread.jobTitle} · {selectedThread.company}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">{selectedThread.email}</p>
                          </div>
                          <div className="rounded-xl border border-gray-100 bg-white p-3 mb-4">
                            <p className="text-[11px] font-medium text-foreground mb-2">
                              {selectedThread.status === "no_reply_yet" ? "Draft content" : "Latest message"}
                            </p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
                              {selectedThread.lastMessageSnippet ||
                                (selectedThread.status === "no_reply_yet"
                                  ? "Draft is ready to send in Gmail"
                                  : "No message content available.")}
                            </p>
                          </div>
                          <div className="border border-gray-100 rounded-xl p-4 bg-white flex flex-col flex-1">
                            <div className="flex justify-between items-center mb-2">
                              <h3 className="text-sm font-semibold text-foreground">Suggested reply</h3>
                              {selectedThread.hasDraft && selectedThread.suggestedReply && (
                                <Badge variant="outline" className="border-blue-500/60 bg-blue-500/10 text-[10px] text-blue-700">
                                  Draft saved in Gmail
                                </Badge>
                              )}
                            </div>
                            {selectedThread.suggestedReply ? (
                              <>
                                <p className="text-[11px] text-muted-foreground mb-3">
                                  We drafted this response based on their message. Review and edit before sending.
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
                                  Generate an AI-powered reply based on their message.
                                </p>
                                <div className="flex-1 flex items-center justify-center border border-dashed border-gray-100 rounded-xl p-6 bg-white">
                                  <div className="text-center">
                                    <p className="text-xs text-muted-foreground">No suggested reply yet</p>
                                    <p className="text-[10px] text-muted-foreground mt-1">Click "Regenerate" to create one</p>
                                  </div>
                                </div>
                              </>
                            )}
                            <div className="mt-3 flex gap-2 flex-wrap">
                              <Button size="sm" onClick={handleOpenDraft} disabled={!selectedThread.hasDraft} className="flex items-center gap-1">
                                <ExternalLink className="h-4 w-4" /> Open Gmail draft
                              </Button>
                              <Button size="sm" variant="outline" onClick={handleCopy} disabled={!selectedThread.suggestedReply} className="flex items-center gap-1 border-input">
                                <Mail className="h-4 w-4" /> Copy reply text
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleRegenerate}
                                disabled={generating}
                                className="flex items-center gap-1 text-foreground"
                              >
                                <RefreshCw className="h-4 w-4" />
                                Regenerate
                                {generating && (
                                  <span className="inline-block w-4 h-0.5 bg-gray-200 overflow-hidden">
                                    <span className="block h-full w-[30%] bg-blue-500 animate-pulse" />
                                  </span>
                                )}
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
    </TooltipProvider>
  );
}
