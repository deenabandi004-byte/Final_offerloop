import React, { useEffect, useMemo, useState } from "react";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useToast } from "@/hooks/use-toast";
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
  Sparkles,
  Inbox,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const statusLabel: Record<OutboxStatus, string> = {
  no_reply_yet: "Draft (not sent)",
  new_reply: "New reply",
  waiting_on_them: "Sent - waiting for reply",
  waiting_on_you: "Waiting on you",
  closed: "Closed",
};

const statusColor: Record<OutboxStatus, string> = {
  no_reply_yet: "bg-muted text-muted-foreground border-border",
  new_reply: "bg-blue-500/10 text-blue-300 border-blue-500/40",
  waiting_on_them: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  waiting_on_you: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  closed: "bg-muted text-muted-foreground border-border",
};

export function OutboxEmbedded() {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [threads, setThreads] = useState<OutboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<OutboxThread | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [generating, setGenerating] = useState(false);

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

  return (
    <div className="w-full h-full p-0 m-0">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Your Conversations</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage your email threads and replies</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={loadThreads}
          className="border-0 shadow-sm hover:shadow-md bg-card"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6 w-full h-full">
        {/* LEFT: Thread list */}
        <div className="col-span-4 space-y-4 h-full">
          {/* Search */}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
            <Input
              className="pl-9 bg-card shadow-sm hover:shadow-md transition-shadow border-0 focus:ring-2 focus:ring-purple-500/20"
              placeholder="Search by name, firm, subject…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Thread list */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {loading && (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mb-2 mx-auto" />
                Loading conversations…
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
                  className={`w-full text-left p-4 rounded-none transition-all duration-200 ${
                    selectedThread?.id === t.id
                      ? "bg-gradient-to-r from-purple-50 to-indigo-50"
                      : "bg-card hover:bg-muted/50"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground">{t.contactName}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.jobTitle} · {t.company}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {t.lastMessageSnippet}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 ml-2">
                      <span className="text-[11px] text-muted-foreground">
                        {formatLastActivity(t.lastActivityAt)}
                      </span>
                      <Badge className={`border-0 ${statusColor[t.status]} text-[10px] shadow-sm`}>
                        {statusLabel[t.status]}
                      </Badge>
                      {t.hasDraft && (
                        <span className="text-[10px] text-blue-600 flex items-center gap-1">
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
        <div className="col-span-8 h-full">
          {!selectedThread ? (
            <div className="h-full rounded-none p-12 text-center text-muted-foreground text-sm bg-card">
              <div className="flex flex-col items-center justify-center h-full">
                <Inbox className="w-16 h-16 text-muted-foreground mb-4" />
                <p>Select a conversation to view the reply and your AI-generated response draft.</p>
              </div>
            </div>
          ) : (
            <div className="h-full rounded-none p-6 bg-card flex flex-col">
              {/* Header */}
              <div className="mb-4 pb-4 border-b border-border">
                <p className="font-semibold text-base text-foreground">{selectedThread.contactName}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedThread.jobTitle} · {selectedThread.company}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{selectedThread.email}</p>
              </div>

              {/* Latest message snippet */}
              <div className="rounded-none bg-gradient-to-br from-blue-50/50 to-purple-50/30 p-4 mb-4">
                <p className="text-xs font-medium text-foreground mb-2">
                  {selectedThread.status === "no_reply_yet" 
                    ? "Draft content" 
                    : "Latest message"}
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                  {selectedThread.lastMessageSnippet || 
                   (selectedThread.status === "no_reply_yet" 
                     ? "Draft is ready to send in Gmail" 
                     : "No message content available.")}
                </p>
              </div>

              {/* Suggested Reply */}
              <div className="rounded-none p-4 bg-card flex flex-col flex-1">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    <h3 className="text-sm font-semibold text-foreground">Suggested reply</h3>
                  </div>
                  {selectedThread.hasDraft && selectedThread.suggestedReply && (
                    <Badge
                      variant="outline"
                      className="border-0 bg-blue-50 text-[10px] text-blue-700 shadow-sm"
                    >
                      Draft saved in Gmail
                    </Badge>
                  )}
                </div>

                {selectedThread.suggestedReply ? (
                  <>
                    <p className="text-xs text-muted-foreground mb-3">
                      We drafted this response based on their message. Review and edit before
                      sending — you're always in control.
                    </p>
                    <textarea
                      readOnly
                      value={selectedThread.suggestedReply}
                      className="flex-1 w-full text-sm bg-card rounded-none p-3 resize-none text-foreground whitespace-pre-wrap focus:ring-2 focus:ring-purple-500/20"
                    />
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-3">
                      Generate an AI-powered reply based on their message. We'll analyze their
                      tone and content to craft an appropriate response.
                    </p>
                    <div className="flex-1 flex items-center justify-center rounded-none p-6 bg-card">
                      <div className="text-center">
                        <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No suggested reply yet
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Click "Regenerate" to create one
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="mt-4 flex gap-2 flex-wrap">
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
                    className="flex items-center gap-1"
                  >
                    <Mail className="h-4 w-4" /> Copy reply text
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRegenerate}
                    disabled={generating}
                    className="flex items-center gap-1"
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Regenerate
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground mt-3">
                  Tip: personalize your first line — it's the one they read carefully.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
