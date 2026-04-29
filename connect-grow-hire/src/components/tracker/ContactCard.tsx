import type { OutboxThread } from "@/services/api";
import type { AlumniCountData } from "@/types/user";
import { formatTimeAgo, daysBetween } from "@/lib/formatters";
import { AlumniCountBadge } from "@/components/AlumniCountBadge";
import { useEventLogger } from "@/hooks/useEventLogger";

// --- helpers ---

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

// --- status line ---

export type BucketType = "needsAttention" | "waiting" | "done";

function statusLine(c: OutboxThread): string {
  // Replied / unread reply — highest priority display
  if (c.hasUnreadReply || c.pipelineStage === "replied") {
    const ago = formatTimeAgo(c.replyReceivedAt || c.lastActivityAt);
    return ago ? `Replied ${ago} — action needed` : "Replied — action needed";
  }
  // Draft states
  if (c.pipelineStage === "draft_deleted") {
    return "Draft deleted — recreate it";
  }
  if (c.pipelineStage === "draft_created") {
    const d = daysBetween(c.draftCreatedAt);
    if (d >= 1) return `Draft unsent for ${d} day${d !== 1 ? "s" : ""} — send it!`;
    return "Draft ready to send";
  }
  // Overdue follow-up
  if (c.nextFollowUpAt && new Date(c.nextFollowUpAt) <= new Date()) return "Follow-up overdue";
  // Sent / waiting
  if (c.pipelineStage === "waiting_on_reply") {
    if (c.emailSentAt) return `Sent ${formatTimeAgo(c.emailSentAt)} — waiting for reply`;
    return "Sent — waiting for reply";
  }
  if (c.pipelineStage === "email_sent") {
    if (c.emailSentAt) return `Sent ${formatTimeAgo(c.emailSentAt)} — waiting for reply`;
    return "Sent — waiting for reply";
  }
  // Done states
  if (c.pipelineStage === "meeting_scheduled") return "Meeting scheduled";
  if (c.pipelineStage === "connected") return "Connected";
  if (c.pipelineStage === "no_response" || c.resolution === "ghosted") return "No response after follow-ups";
  if (c.pipelineStage === "bounced") return "Email bounced";
  if (c.pipelineStage === "closed") return "Closed";
  if (c.pipelineStage === "new") return "Ready to draft an email";
  if (c.archivedAt) return "Archived";
  // Fallback for any future stages
  const stage: string = c.pipelineStage || "";
  return stage.replace(/_/g, " ");
}

// --- stage-based border color ---

function stageBorderColor(c: OutboxThread, isSelected: boolean): string {
  if (isSelected) return "border-l-[#3B82F6] bg-[#FAFBFF]";
  if (c.hasUnreadReply || c.pipelineStage === "replied") return "border-l-red-400 hover:bg-red-50/40";
  if (c.pipelineStage === "new") return "border-l-gray-300 hover:bg-gray-50";
  if (c.pipelineStage === "draft_deleted") return "border-l-red-300 hover:bg-red-50/30";
  if (c.pipelineStage === "draft_created") return "border-l-amber-400 hover:bg-amber-50/30";
  if (c.pipelineStage === "email_sent" || c.pipelineStage === "waiting_on_reply") return "border-l-[#3B82F6]/50 hover:bg-[#FAFBFF]";
  if (c.pipelineStage === "meeting_scheduled" || c.pipelineStage === "connected") return "border-l-green-400 hover:bg-green-50/30";
  return "border-l-transparent hover:bg-gray-50";
}

// --- action chip ---

interface Chip {
  label: string;
  className: string;
}

function actionChip(c: OutboxThread, bucket: BucketType): Chip | null {
  if (bucket === "done") return null;
  // Replied
  if (c.hasUnreadReply || c.pipelineStage === "replied") {
    return { label: "View Reply", className: "bg-[rgba(59,130,246,0.10)] text-[#2563EB]" };
  }
  // Draft
  if (c.pipelineStage === "draft_deleted") {
    return { label: "Recreate Draft", className: "bg-red-100 text-red-700" };
  }
  if (c.pipelineStage === "draft_created") {
    return { label: "Send Draft", className: "bg-orange-100 text-orange-700" };
  }
  // Overdue follow-up
  if (c.nextFollowUpAt && new Date(c.nextFollowUpAt) <= new Date()) {
    return { label: "Follow Up", className: "bg-orange-100 text-orange-700" };
  }
  // Sent / waiting — open thread
  if (c.pipelineStage === "email_sent" || c.pipelineStage === "waiting_on_reply") {
    if (c.gmailThreadId) return { label: "Open Thread", className: "bg-gray-100 text-gray-600" };
  }
  // Fallback
  if (c.gmailDraftUrl || c.gmailThreadId) {
    return { label: "Open Gmail", className: "bg-gray-100 text-gray-600" };
  }
  return null;
}

// --- component ---

interface ContactCardProps {
  contact: OutboxThread;
  bucket: BucketType;
  isSelected: boolean;
  onClick: () => void;
  /** Phase 1: alumni count cache lookup. When provided, renders a brand-blue badge
   *  in the top-right of the card. Clicking the badge invokes onAlumniBadgeClick
   *  (typically navigates to /find filtered by school × company). */
  alumniCount?: AlumniCountData | null;
  onAlumniBadgeClick?: () => void;
}

export function ContactCard({
  contact,
  bucket,
  isSelected,
  onClick,
  alumniCount,
  onAlumniBadgeClick,
}: ContactCardProps) {
  const name = contact.name || contact.email || "Unknown";
  const subtitle = [contact.title, contact.company].filter(Boolean).join(" at ");
  const chip = actionChip(contact, bucket);
  const isReplied = contact.hasUnreadReply || contact.pipelineStage === "replied";
  const { logEvent } = useEventLogger();

  const handleCardClick = () => {
    if (contact.contactId || (contact as { id?: string }).id) {
      logEvent("contact_card_viewed", {
        contactId: contact.contactId || (contact as { id?: string }).id || "",
        surface: "tracker",
        alumniCount: alumniCount?.count ?? undefined,
      });
    }
    onClick();
  };

  return (
    <button
      onClick={handleCardClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[3px] transition-all border-l-[3px] ${stageBorderColor(contact, isSelected)}`}
    >
      {/* avatar */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white"
        style={{ backgroundColor: avatarColor(name) }}
      >
        {initialsFor(name)}
      </div>

      {/* text */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate text-gray-900">{name}</p>
        {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
        <p className={`text-xs mt-0.5 truncate ${isReplied ? "text-red-500 font-medium" : "text-gray-400"}`}>
          {statusLine(contact)}
        </p>
        {(contact as any).personalizationLabel && (
          <span
            className="inline-block mt-0.5 text-[10px] font-medium px-1.5 py-px rounded"
            style={{
              background: (contact as any).personalizationType === 'university' ? 'rgba(59,130,246,0.08)' :
                         (contact as any).personalizationType === 'hometown' ? 'rgba(34,197,94,0.08)' :
                         (contact as any).personalizationType === 'company' ? 'rgba(124,58,237,0.08)' :
                         'rgba(107,114,128,0.08)',
              color: (contact as any).personalizationType === 'university' ? '#2563EB' :
                     (contact as any).personalizationType === 'hometown' ? '#16A34A' :
                     (contact as any).personalizationType === 'company' ? '#7C3AED' :
                     '#6B7280',
            }}
          >
            {(contact as any).personalizationLabel}
          </span>
        )}
      </div>

      {/* alumni count badge (Phase 1) — positioned next to the action chip
          so it doesn't fight the avatar/name on narrow widths. */}
      {alumniCount && alumniCount.count != null && alumniCount.count > 0 && (
        <AlumniCountBadge
          data={alumniCount}
          onClick={onAlumniBadgeClick}
          compact
        />
      )}

      {/* chip */}
      {chip && (
        <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${chip.className}`}>
          {chip.label}
        </span>
      )}
    </button>
  );
}
