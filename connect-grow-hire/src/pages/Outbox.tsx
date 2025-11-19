import React, { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useToast } from "@/hooks/use-toast";
import { CreditPill } from "@/components/credits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiService, OutboxThread, OutboxStatus } from "@/services/api";
import {
  Mail,
  Loader2,
  Search,
  ExternalLink,
  RefreshCw,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

/* ---------- Status UI ---------- */

const statusLabel: Record<OutboxStatus, string> = {
  no_reply_yet: "No reply yet",
  new_reply: "New reply",
  waiting_on_them: "Waiting on them",
  waiting_on_you: "Waiting on you",
  closed: "Closed",
};

const statusColor: Record<OutboxStatus, string> = {
  no_reply_yet: "bg-gray-800 text-gray-300 border-gray-700",
  new_reply: "bg-blue-500/10 text-blue-300 border-blue-500/40",
  waiting_on_them: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  waiting_on_you: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  closed: "bg-gray-800 text-gray-400 border-gray-700",
};

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
    if (!selectedThread?.gmailDraftUrl) {
      toast({
        title: "No Gmail draft found",
        description: "Generate or regenerate a reply draft first.",
        variant: "destructive",
      });
      return;
    }
    window.open(selectedThread.gmailDraftUrl, "_blank");
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
        title: "Draft updated",
        description: "Your new suggested reply has been saved in Gmail.",
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
      <div className="flex min-h-screen w-full bg-gray-900 text-white">
        <AppSidebar />

        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="h-16 flex items-center justify-between border-b border-gray-800 px-6 bg-gray-900/80 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-white hover:bg-gray-800/50" />
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-400" />
                <h1 className="text-xl font-semibold">Outbox</h1>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <CreditPill credits={user?.credits ?? 0} max={user?.maxCredits ?? 120} />

              <Button
                size="sm"
                variant="outline"
                className="border-gray-600"
                onClick={() => navigate("/home")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 p-8">
            <div className="max-w-6xl mx-auto flex gap-6">

              {/* LEFT: Thread list */}
              <div className="w-1/2 space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold">Conversations</h2>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={loadThreads}
                    className="border-gray-600"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-9 bg-gray-900 border-gray-700"
                    placeholder="Search by name, firm, subject…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Thread list */}
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {loading && (
                    <div className="py-10 text-center text-gray-400 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin mb-2" />
                      Loading conversations…
                    </div>
                  )}

                  {!loading &&
                    filteredThreads.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedThread(t)}
                        className={`w-full text-left p-4 rounded-xl border transition ${
                          selectedThread?.id === t.id
                            ? "border-blue-500/70 bg-blue-500/10"
                            : "border-gray-800 hover:border-gray-700 hover:bg-gray-900"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-sm">{t.contactName}</div>
                            <div className="text-xs text-gray-400">
                              {t.jobTitle} · {t.company}
                            </div>
                            <p className="mt-1 text-xs text-gray-400 line-clamp-2">
                              {t.lastMessageSnippet}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[11px] text-gray-500">
                              {formatLastActivity(t.lastActivityAt)}
                            </span>
                            <Badge className={`border ${statusColor[t.status]} text-[10px]`}>
                              {statusLabel[t.status]}
                            </Badge>
                            {t.hasDraft && (
                              <span className="text-[10px] text-blue-300 flex items-center gap-1">
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
                  <div className="h-full border border-dashed border-gray-700 rounded-xl p-6 text-center text-gray-400 text-sm">
                    Select a conversation to view the reply and your AI-generated response draft.
                  </div>
                ) : (
                  <div className="h-full border border-gray-800 rounded-xl p-6 bg-gray-950/60 flex flex-col">
                    {/* Header */}
                    <div className="mb-3">
                      <p className="font-semibold text-sm">{selectedThread.contactName}</p>
                      <p className="text-xs text-gray-400">
                        {selectedThread.jobTitle} · {selectedThread.company}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{selectedThread.email}</p>
                    </div>

                    {/* Latest reply snippet */}
                    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 mb-4">
                      <p className="text-[11px] font-medium text-gray-300 mb-1">Latest reply</p>
                      <p className="text-xs text-gray-400 whitespace-pre-wrap">
                        {selectedThread.lastMessageSnippet}
                      </p>
                    </div>

                    {/* Suggested Reply */}
                    <div className="border border-gray-800 rounded-xl p-4 bg-gray-900/80 flex flex-col flex-1">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-blue-400" />
                          <h3 className="text-sm font-semibold">Suggested reply</h3>
                        </div>
                        {selectedThread.hasDraft && (
                          <Badge
                            variant="outline"
                            className="border-blue-500/60 bg-blue-500/10 text-[10px] text-blue-200"
                          >
                            Draft saved in Gmail
                          </Badge>
                        )}
                      </div>

                      <p className="text-[11px] text-gray-400 mb-3">
                        We drafted this response based on their message. Review and edit before
                        sending — you're always in control.
                      </p>

                      <textarea
                        readOnly
                        value={
                          selectedThread.suggestedReply ||
                          "No suggested reply yet. Click “Regenerate” to create one."
                        }
                        className="flex-1 w-full text-xs bg-gray-950 border border-gray-800 rounded-xl p-3 resize-none text-gray-100"
                      />

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
                          className="flex items-center gap-1 border-gray-700"
                        >
                          <Mail className="h-4 w-4" /> Copy reply text
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleRegenerate}
                          disabled={generating}
                          className="flex items-center gap-1 text-gray-300"
                        >
                          {generating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Regenerate
                        </Button>
                      </div>

                      <p className="text-[10px] text-gray-500 mt-3">
                        Tip: personalize your first line — it's the one they read carefully.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}