import { useState } from "react";
import { ChevronDown, ChevronRight, Bell, X, Send, Clock } from "lucide-react";
import type { Nudge } from "@/services/api";

interface NudgePanelProps {
  nudges: Nudge[];
  onActOnNudge: (nudge: Nudge) => void;
  onDismissNudge: (nudgeId: string) => void;
  onSelectContact: (contactId: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NudgePanel({
  nudges,
  onActOnNudge,
  onDismissNudge,
  onSelectContact,
}: NudgePanelProps) {
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (nudges.length === 0) return null;

  return (
    <div data-testid="nudge-panel" className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-gray-50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        )}
        <Bell className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <span className="text-xs font-semibold tracking-wide uppercase text-amber-600">
          Follow-up Suggestions
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
          {nudges.length}
        </span>
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-1.5">
          {nudges.map((nudge) => {
            const isExpanded = expandedId === nudge.id;
            return (
              <div
                key={nudge.id}
                className="bg-amber-50/60 border border-amber-200/60 rounded-md px-3 py-2"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => onSelectContact(nudge.contactId)}
                      className="text-sm font-medium text-gray-900 hover:text-[#3B82F6] truncate block text-left"
                    >
                      {nudge.contactName}
                    </button>
                    {nudge.company && (
                      <p className="text-xs text-gray-500 truncate">{nudge.company}</p>
                    )}
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      {nudge.generatedMessage}
                    </p>
                  </div>
                  <button
                    onClick={() => onDismissNudge(nudge.id)}
                    className="flex-shrink-0 p-1 rounded hover:bg-amber-200/40 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Expandable follow-up draft */}
                {nudge.followUpDraft && (
                  <div className="mt-2">
                    {!isExpanded ? (
                      <button
                        onClick={() => setExpandedId(nudge.id)}
                        className="text-[11px] text-amber-700 hover:text-amber-800 font-medium"
                      >
                        View suggested follow-up email →
                      </button>
                    ) : (
                      <div className="mt-1">
                        <div className="bg-white border border-amber-200/50 rounded px-3 py-2 text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                          {nudge.followUpDraft}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => onActOnNudge(nudge)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors"
                          >
                            <Send className="w-3 h-3" />
                            Use this draft
                          </button>
                          <button
                            onClick={() => setExpandedId(null)}
                            className="text-[11px] text-gray-500 hover:text-gray-700"
                          >
                            Collapse
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!nudge.followUpDraft && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => onActOnNudge(nudge)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors"
                    >
                      <Send className="w-3 h-3" />
                      Follow up
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  {timeAgo(nudge.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
