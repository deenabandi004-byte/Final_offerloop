/**
 * ReferralDraftModal — Phase 5 inline preview/edit for referral emails.
 *
 * Click flow:
 *   1. User clicks "↗ Reach out to Sarah" on a job row.
 *   2. Backend generates subject + body from rich context (coffee-chat prep,
 *      JD/resume overlap, recent activity). Returns text only — no Gmail
 *      draft yet.
 *   3. This modal opens with the text in editable textareas. User reads,
 *      tweaks, optionally clicks "Regenerate" for a fresh attempt.
 *   4. User clicks "Open in Gmail" → backend creates the Gmail draft from
 *      whatever text the user submitted → new tab opens to that draft.
 *
 * Why preview/edit (not auto-open):
 *   Even with a research-backed prompt, the LLM produces 70%-quality emails.
 *   The remaining 30% is the student's voice. Forcing them to read the draft
 *   first means they catch the "I enjoyed your recent post" filler before
 *   it lands in someone's inbox.
 */
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Send, Copy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiService, type FeedJob } from "@/services/api";
import { toast } from "@/hooks/use-toast";

interface ReferralDraftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: FeedJob | null;
}

type ModalState = "loading" | "ready" | "committing" | "error";

const RELATIONSHIP_LABEL: Record<string, string> = {
  strong: "You've interacted before",
  moderate: "Shared school / alumni",
  weak: "Saved contact",
};

export function ReferralDraftModal({ open, onOpenChange, job }: ReferralDraftModalProps) {
  const [state, setState] = useState<ModalState>("loading");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contextUsed, setContextUsed] = useState<any>(null);

  const generate = async () => {
    if (!job || !job.referral_contact) return;
    setState("loading");
    setError(null);
    try {
      const result = await apiService.draftReferralEmail({
        contact_id: job.referral_contact.contact_id,
        job: {
          job_id: job.job_id,
          title: job.title,
          company: job.company,
          location: typeof job.location === "string" ? job.location : undefined,
          apply_url: job.apply_url,
          structured: job.structured,
        },
      });
      if (!result.ok || !result.subject || !result.body) {
        setError(result.error || "Couldn't draft an email. Try again.");
        setState("error");
        return;
      }
      setSubject(result.subject);
      setBody(result.body);
      setContextUsed(result.context_used || null);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
      setState("error");
    }
  };

  // Generate on first open; reset on close.
  useEffect(() => {
    if (open) {
      generate();
    } else {
      setSubject("");
      setBody("");
      setError(null);
      setContextUsed(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.job_id, job?.referral_contact?.contact_id]);

  const commitAndOpen = async () => {
    if (!job?.referral_contact || !subject.trim() || !body.trim()) return;
    setState("committing");
    try {
      const result = await apiService.commitReferralDraft({
        contact_id: job.referral_contact.contact_id,
        subject: subject.trim(),
        body: body.trim(),
      });
      if (result.ok && result.gmailUrl) {
        window.open(result.gmailUrl, "_blank", "noopener,noreferrer");
        onOpenChange(false);
        return;
      }
      if (result.error === "gmail_not_connected") {
        toast({
          title: "Gmail isn't connected",
          description:
            "Connect Gmail in Account Settings to create drafts automatically. " +
            "Your draft text has been kept here so you can copy it.",
          variant: "destructive",
        });
        setState("ready");
        return;
      }
      toast({
        title: "Couldn't create the Gmail draft",
        description: result.error || "Try again or copy the text below.",
        variant: "destructive",
      });
      setState("ready");
    } catch (e) {
      toast({
        title: "Couldn't create the Gmail draft",
        description: e instanceof Error ? e.message : "Network error.",
        variant: "destructive",
      });
      setState("ready");
    }
  };

  const copyEmail = async () => {
    const text = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Select the text manually and copy.",
        variant: "destructive",
      });
    }
  };

  const contactName = job?.referral_contact?.name || "your contact";
  const company = job?.company || "the company";
  const relationship = contextUsed?.relationship as string | undefined;
  const qualityIssues = (contextUsed?.quality_issues as string[]) || [];
  const overlapCount = (contextUsed?.overlap_count as number) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Reach out to {contactName.split(/\s+/)[0]} at {company}
          </DialogTitle>
          <DialogDescription>
            Review and edit before sending. Hit "Open in Gmail" to create the draft.
          </DialogDescription>
        </DialogHeader>

        {state === "loading" && (
          <div className="flex items-center gap-3 py-12 justify-center text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">
              Pulling your coffee-chat prep, the JD requirements, and recent
              activity to draft a referral…
            </span>
          </div>
        )}

        {state === "error" && (
          <div className="py-8 space-y-3">
            <div className="flex items-start gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <div className="text-sm">{error || "Something went wrong."}</div>
            </div>
            <Button variant="outline" onClick={generate}>
              <RefreshCw className="w-4 h-4 mr-2" /> Try again
            </Button>
          </div>
        )}

        {(state === "ready" || state === "committing") && (
          <div className="space-y-4">
            {/* Context strip — tells user what the LLM had to work with */}
            <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
              {relationship && (
                <span>
                  <strong>Relationship:</strong>{" "}
                  {RELATIONSHIP_LABEL[relationship] || relationship}
                </span>
              )}
              {contextUsed?.has_coffee_chat_prep && (
                <span>· Used your coffee-chat prep</span>
              )}
              {contextUsed?.has_recent_activity && (
                <span>· Cited recent activity</span>
              )}
              {overlapCount > 0 && (
                <span>· {overlapCount} JD/resume match{overlapCount > 1 ? "es" : ""}</span>
              )}
              {!contextUsed?.has_coffee_chat_prep &&
                !contextUsed?.has_recent_activity &&
                overlapCount === 0 && (
                  <span className="text-amber-600">
                    · No prep / overlap signal — consider adding a coffee-chat prep first
                  </span>
                )}
            </div>

            {qualityIssues.length > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Heads up — the draft tripped these quality checks: {qualityIssues.join(", ")}.
                Worth re-reading before you send.
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                disabled={state === "committing"}
                maxLength={120}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Body
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-serif leading-relaxed focus:border-slate-500 focus:outline-none resize-y"
                rows={9}
                disabled={state === "committing"}
                maxLength={4000}
              />
              <div className="text-xs text-slate-400 text-right">
                {body.split(/\s+/).filter(Boolean).length} words
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <Button
                onClick={commitAndOpen}
                disabled={state === "committing" || !subject.trim() || !body.trim()}
              >
                {state === "committing" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating draft…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" /> Open in Gmail
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={generate}
                disabled={state === "committing"}
                title="Discard edits and ask the model for a fresh draft"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
              </Button>
              <Button variant="outline" onClick={copyEmail}>
                <Copy className="w-4 h-4 mr-2" /> Copy
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
