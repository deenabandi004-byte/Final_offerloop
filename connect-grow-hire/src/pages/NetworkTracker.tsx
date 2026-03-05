import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search, Loader2, AlertCircle } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { apiService, type OutboxThread, type OutboxStats } from "@/services/api";
import { TrackerBuckets } from "@/components/tracker/TrackerBuckets";
import { ConversationPanel } from "@/components/tracker/ConversationPanel";

// --- bucket sorting helpers ---

const DONE_STAGES = new Set([
  "connected", "meeting_scheduled", "no_response", "bounced", "closed",
]);

function daysBetween(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function isNeedsAttention(c: OutboxThread): boolean {
  if (c.hasUnreadReply) return true;
  if (c.pipelineStage === "draft_created" && daysBetween(c.draftCreatedAt) >= 3) return true;
  if (c.nextFollowUpAt && new Date(c.nextFollowUpAt) <= new Date()) return true;
  return false;
}

function isDone(c: OutboxThread): boolean {
  if (c.archivedAt) return true;
  return DONE_STAGES.has(c.pipelineStage || "");
}

// --- component ---

export default function NetworkTracker() {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { notifications } = useNotifications();

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  // --- queries ---

  const {
    data: threadsData,
    isLoading: threadsLoading,
    isError: threadsError,
    refetch: refetchThreads,
  } = useQuery({
    queryKey: ["trackerContacts"],
    queryFn: async () => {
      const res = await apiService.getOutboxThreads();
      if ("error" in res) throw new Error(res.error);
      return res.threads;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["trackerStats"],
    queryFn: async () => {
      const res = await apiService.getOutboxStats();
      if ("error" in res) throw new Error(res.error);
      return res as OutboxStats;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // --- mutations ---

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["trackerContacts"] });
    queryClient.invalidateQueries({ queryKey: ["trackerStats"] });
  };

  const stageChangeMutation = useMutation({
    mutationFn: ({ contactId, stage }: { contactId: string; stage: string }) =>
      apiService.patchOutboxStage(contactId, stage as any),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Stage updated" });
    },
    onError: () => toast({ title: "Failed to update stage", variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: (contactId: string) => apiService.archiveOutboxThread(contactId),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Contact archived" });
    },
    onError: () => toast({ title: "Failed to archive", variant: "destructive" }),
  });

  const unarchiveMutation = useMutation({
    mutationFn: (contactId: string) => apiService.unarchiveOutboxThread(contactId),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Contact restored" });
    },
    onError: () => toast({ title: "Failed to restore", variant: "destructive" }),
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ contactId, until }: { contactId: string; until: string }) =>
      apiService.snoozeOutboxThread(contactId, until),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Contact snoozed" });
    },
    onError: () => toast({ title: "Failed to snooze", variant: "destructive" }),
  });

  const wonMutation = useMutation({
    mutationFn: (contactId: string) => apiService.markOutboxThreadWon(contactId),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Marked as won!" });
    },
    onError: () => toast({ title: "Failed to mark as won", variant: "destructive" }),
  });

  const markReadMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiService.patchOutboxStage(contactId, "replied"),
    onSuccess: () => {
      invalidateAll();
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (contactId: string) => {
      setSyncingIds((prev) => new Set(prev).add(contactId));
      try {
        const res = await apiService.syncOutboxThread(contactId);
        return res;
      } finally {
        setSyncingIds((prev) => {
          const next = new Set(prev);
          next.delete(contactId);
          return next;
        });
      }
    },
    onSuccess: () => invalidateAll(),
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  // --- bucket computation ---

  const contacts = threadsData || [];

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q)
    );
  }, [contacts, searchQuery]);

  const { needsAttention, waiting, done } = useMemo(() => {
    const na: OutboxThread[] = [];
    const w: OutboxThread[] = [];
    const d: OutboxThread[] = [];
    for (const c of filtered) {
      if (isDone(c)) d.push(c);
      else if (isNeedsAttention(c)) na.push(c);
      else w.push(c);
    }
    // Sort each bucket by lastActivityAt descending
    const byActivity = (a: OutboxThread, b: OutboxThread) =>
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    na.sort(byActivity);
    w.sort(byActivity);
    d.sort(byActivity);
    return { needsAttention: na, waiting: w, done: d };
  }, [filtered]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || null,
    [contacts, selectedContactId]
  );

  // --- handlers ---

  const handleRefreshAll = () => {
    refetchThreads();
    queryClient.invalidateQueries({ queryKey: ["trackerStats"] });
  };

  // --- render ---

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 overflow-hidden flex flex-col">
            {/* Page header */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 bg-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                    Network Tracker
                  </h1>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Stay on top of every conversation
                  </p>
                </div>
                <button
                  onClick={handleRefreshAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>

              {/* Stats row */}
              {statsData && (
                <div className="flex items-center gap-4 mt-3 text-sm">
                  <span className={`font-semibold ${(statsData.needsAttentionCount || 0) > 0 ? "text-orange-600" : "text-gray-500"}`}>
                    {statsData.needsAttentionCount || 0} Needs Attention
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-blue-600 font-medium">
                    {statsData.waitingCount || 0} Waiting
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-green-600 font-medium">
                    {statsData.doneCount || 0} Done
                  </span>
                  {notifications.unreadReplyCount > 0 && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span className="text-red-600 font-semibold">
                        {notifications.unreadReplyCount} new {notifications.unreadReplyCount === 1 ? "reply" : "replies"}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Main content */}
            {threadsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : threadsError ? (
              <div className="flex-1 flex items-center justify-center text-sm text-red-500">
                <AlertCircle className="w-4 h-4 mr-2" />
                Failed to load contacts. Please try again.
              </div>
            ) : contacts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <Search className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-700">No contacts in your tracker yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Generate emails for contacts from the search page to start tracking them here.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                {/* Left panel: bucket list */}
                <div
                  className={`border-r border-gray-100 bg-white overflow-y-auto flex-shrink-0 ${
                    selectedContact ? "hidden md:block" : "w-full md:w-auto"
                  }`}
                  style={{ width: selectedContact ? 380 : undefined, minWidth: selectedContact ? 320 : undefined }}
                >
                  {/* Search */}
                  <div className="p-3 border-b border-gray-50">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search contacts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-100 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-200"
                      />
                    </div>
                  </div>

                  <div className="p-2">
                    <TrackerBuckets
                      needsAttention={needsAttention}
                      waiting={waiting}
                      done={done}
                      selectedContactId={selectedContactId}
                      onSelectContact={setSelectedContactId}
                    />
                  </div>
                </div>

                {/* Right panel: detail */}
                <div className="flex-1 min-w-0 bg-white">
                  {selectedContact ? (
                    <>
                      {/* Mobile back button */}
                      <button
                        onClick={() => setSelectedContactId(null)}
                        className="md:hidden px-4 py-2 text-sm text-blue-600 font-medium border-b border-gray-100 w-full text-left"
                      >
                        &larr; Back to list
                      </button>
                      <ConversationPanel
                        contact={selectedContact}
                        onStageChange={(id, stage) =>
                          stageChangeMutation.mutate({ contactId: id, stage })
                        }
                        onArchive={(id) => archiveMutation.mutate(id)}
                        onUnarchive={(id) => unarchiveMutation.mutate(id)}
                        onSnooze={(id, until) =>
                          snoozeMutation.mutate({ contactId: id, until })
                        }
                        onMarkWon={(id) => wonMutation.mutate(id)}
                        onMarkRead={(id) => markReadMutation.mutate(id)}
                        onRefresh={(id) => syncMutation.mutate(id)}
                        isSyncing={syncingIds.has(selectedContact.id)}
                      />
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-gray-400">
                      Select a contact to view details
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
