import { ExternalLink, Linkedin, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { OutboxThread, PipelineStage } from "@/services/api";
import { ActionBar } from "./ActionBar";

// --- helpers ---

function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STAGE_OPTIONS: { value: PipelineStage; label: string }[] = [
  { value: "draft_created", label: "Draft Created" },
  { value: "email_sent", label: "Email Sent" },
  { value: "waiting_on_reply", label: "Waiting on Reply" },
  { value: "replied", label: "They Replied" },
  { value: "meeting_scheduled", label: "Meeting Scheduled" },
  { value: "connected", label: "Connected" },
  { value: "no_response", label: "No Response" },
  { value: "bounced", label: "Bounced" },
  { value: "closed", label: "Closed" },
];

// --- component ---

interface ConversationPanelProps {
  contact: OutboxThread;
  onStageChange: (contactId: string, stage: string) => void;
  onArchive: (contactId: string) => void;
  onUnarchive: (contactId: string) => void;
  onSnooze: (contactId: string, until: string) => void;
  onMarkWon: (contactId: string) => void;
  onMarkRead: (contactId: string) => void;
  onRefresh: (contactId: string) => void;
  isSyncing: boolean;
}

export function ConversationPanel({
  contact,
  onStageChange,
  onArchive,
  onUnarchive,
  onSnooze,
  onMarkWon,
  onMarkRead,
  onRefresh,
  isSyncing,
}: ConversationPanelProps) {
  const [emailCopied, setEmailCopied] = useState(false);

  const copyEmail = () => {
    navigator.clipboard.writeText(contact.email);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const gmailThreadUrl = contact.gmailThreadId
    ? `https://mail.google.com/mail/u/0/#inbox/${contact.gmailThreadId}`
    : null;

  const followUpOverdue =
    contact.nextFollowUpAt && new Date(contact.nextFollowUpAt) <= new Date();

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-5">
        {/* 1. Contact header */}
        <div>
          <h2 className="text-lg font-bold text-gray-900">{contact.name || contact.email}</h2>
          {(contact.title || contact.company) && (
            <p className="text-sm text-gray-500 mt-0.5">
              {[contact.title, contact.company].filter(Boolean).join(" at ")}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {/* email */}
            <button
              onClick={copyEmail}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              {emailCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              {contact.email}
            </button>

            {/* linkedin */}
            {contact.linkedinUrl && (
              <a
                href={contact.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <Linkedin className="w-3 h-3" />
                LinkedIn
              </a>
            )}

            {/* gmail thread */}
            {gmailThreadUrl && (
              <a
                href={gmailThreadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                <ExternalLink className="w-3 h-3" />
                View in Gmail
              </a>
            )}
          </div>
        </div>

        {/* 1b. Sent timestamp */}
        {contact.emailSentAt && (
          <p className="text-xs text-gray-500">
            Sent on {formatDate(contact.emailSentAt)}
          </p>
        )}

        {/* 2. AI Summary */}
        {contact.conversationSummary && (
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              AI Summary
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{contact.conversationSummary}</p>
          </div>
        )}

        {/* 3. Message preview */}
        {contact.lastMessageSnippet && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                Last message
              </p>
              <span className="text-[10px] text-gray-400">
                {formatTimeAgo(contact.lastActivityAt)}
              </span>
              {contact.lastMessageFrom === "contact" && (
                <span className="text-[10px] font-medium text-blue-600">They replied</span>
              )}
              {contact.lastMessageFrom === "user" && (
                <span className="text-[10px] font-medium text-gray-500">You sent</span>
              )}
            </div>
            <blockquote className="border-l-2 border-gray-200 pl-3 py-1 text-sm text-gray-600 italic">
              {contact.lastMessageSnippet}
            </blockquote>
          </div>
        )}

        {/* 4. Follow-up info */}
        {contact.nextFollowUpAt && (
          <div className={`text-sm ${followUpOverdue ? "text-red-600" : "text-gray-600"}`}>
            {followUpOverdue
              ? `Follow-up overdue since ${formatDate(contact.nextFollowUpAt)}`
              : `Follow-up scheduled for ${formatDate(contact.nextFollowUpAt)}`}
            {contact.followUpCount > 0 && (
              <span className="text-gray-400 ml-2">
                ({contact.followUpCount} follow-up{contact.followUpCount !== 1 ? "s" : ""} sent)
              </span>
            )}
          </div>
        )}

        {/* Sync error */}
        {contact.lastSyncError && (
          <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {contact.lastSyncError.message}
          </div>
        )}

        {/* 5. Action bar */}
        <ActionBar
          contact={contact}
          onMarkRead={() => onMarkRead(contact.id)}
          onMarkWon={() => onMarkWon(contact.id)}
          onArchive={() => onArchive(contact.id)}
          onUnarchive={() => onUnarchive(contact.id)}
          onSnooze={(until) => onSnooze(contact.id, until)}
          onRefresh={() => onRefresh(contact.id)}
          isSyncing={isSyncing}
        />

        {/* 6. Stage selector */}
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
            Pipeline Stage
          </label>
          <select
            value={contact.pipelineStage || ""}
            onChange={(e) => {
              if (e.target.value) onStageChange(contact.id, e.target.value);
            }}
            className="w-full max-w-[220px] text-sm bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="" disabled>Select stage...</option>
            {STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
