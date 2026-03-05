import { useState } from "react";
import {
  ExternalLink,
  RefreshCw,
  Archive,
  ArchiveRestore,
  Trophy,
  Clock,
  Eye,
} from "lucide-react";
import type { OutboxThread } from "@/services/api";

interface ActionBarProps {
  contact: OutboxThread;
  onMarkRead: () => void;
  onMarkWon: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onSnooze: (until: string) => void;
  onRefresh: () => void;
  isSyncing: boolean;
}

const DONE_STAGES = new Set([
  "connected",
  "meeting_scheduled",
  "no_response",
  "bounced",
  "closed",
]);

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function ActionBar({
  contact,
  onMarkRead,
  onMarkWon,
  onArchive,
  onUnarchive,
  onSnooze,
  onRefresh,
  isSyncing,
}: ActionBarProps) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const gmailUrl =
    contact.gmailDraftUrl ||
    (contact.gmailThreadId
      ? `https://mail.google.com/mail/u/0/#inbox/${contact.gmailThreadId}`
      : null);

  const isActive = !DONE_STAGES.has(contact.pipelineStage || "") && !contact.archivedAt;

  return (
    <div className="flex flex-wrap gap-2">
      {/* Gmail */}
      {gmailUrl && (
        <a
          href={gmailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open in Gmail
        </a>
      )}

      {/* Refresh */}
      <button
        onClick={onRefresh}
        disabled={isSyncing}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
        Refresh
      </button>

      {/* Mark as Read */}
      {contact.hasUnreadReply && (
        <button
          onClick={onMarkRead}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          Mark as Read
        </button>
      )}

      {/* Active-only actions */}
      {isActive && (
        <>
          <button
            onClick={onMarkWon}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition-colors"
          >
            <Trophy className="w-3.5 h-3.5" />
            Mark as Won
          </button>

          <button
            onClick={onArchive}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
            Archive
          </button>

          {/* Snooze */}
          <div className="relative">
            <button
              onClick={() => setSnoozeOpen(!snoozeOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" />
              Snooze
            </button>
            {snoozeOpen && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                {[
                  { label: "3 days", days: 3 },
                  { label: "1 week", days: 7 },
                  { label: "2 weeks", days: 14 },
                ].map(({ label, days }) => (
                  <button
                    key={days}
                    onClick={() => {
                      onSnooze(addDays(days));
                      setSnoozeOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Unarchive */}
      {contact.archivedAt && (
        <button
          onClick={onUnarchive}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ArchiveRestore className="w-3.5 h-3.5" />
          Unarchive
        </button>
      )}
    </div>
  );
}
