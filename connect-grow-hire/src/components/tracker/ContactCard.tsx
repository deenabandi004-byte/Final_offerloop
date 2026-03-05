import type { OutboxThread } from "@/services/api";

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

function daysBetween(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

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

function statusLine(c: OutboxThread, _bucket: BucketType): string {
  if (c.hasUnreadReply) return `Replied ${formatTimeAgo(c.replyReceivedAt || c.lastActivityAt)}`;
  if (c.pipelineStage === "draft_created") {
    const d = daysBetween(c.draftCreatedAt);
    return d >= 3 ? `Draft unsent for ${d} days` : "Draft ready to send";
  }
  if (c.nextFollowUpAt && new Date(c.nextFollowUpAt) <= new Date()) return "Follow-up overdue";
  if (c.pipelineStage === "waiting_on_reply") return `Waiting ${formatTimeAgo(c.emailSentAt || c.lastActivityAt)}`;
  if (c.pipelineStage === "email_sent") return `Sent ${formatTimeAgo(c.emailSentAt || c.lastActivityAt)}`;
  if (c.pipelineStage === "meeting_scheduled") return "Meeting scheduled";
  if (c.pipelineStage === "connected") return "Connected";
  if (c.pipelineStage === "no_response" || c.resolution === "ghosted") return "No response";
  if (c.pipelineStage === "bounced") return "Bounced";
  if (c.pipelineStage === "closed") return "Closed";
  if (c.archivedAt) return "Archived";
  return c.pipelineStage?.replace(/_/g, " ") || "";
}

// --- action chip ---

interface Chip {
  label: string;
  className: string;
}

function actionChip(c: OutboxThread, bucket: BucketType): Chip | null {
  if (bucket === "done") return null;
  if (bucket === "needsAttention") {
    if (c.hasUnreadReply) return { label: "Review Reply", className: "bg-blue-100 text-blue-700" };
    if (c.pipelineStage === "draft_created" && daysBetween(c.draftCreatedAt) >= 3)
      return { label: "Send Draft", className: "bg-orange-100 text-orange-700" };
    if (c.nextFollowUpAt && new Date(c.nextFollowUpAt) <= new Date())
      return { label: "Follow Up", className: "bg-orange-100 text-orange-700" };
  }
  if (bucket === "waiting" && (c.gmailDraftUrl || c.gmailThreadId))
    return { label: "Open Gmail", className: "bg-gray-100 text-gray-600" };
  return null;
}

// --- component ---

interface ContactCardProps {
  contact: OutboxThread;
  bucket: BucketType;
  isSelected: boolean;
  onClick: () => void;
}

export function ContactCard({ contact, bucket, isSelected, onClick }: ContactCardProps) {
  const name = contact.name || contact.email || "Unknown";
  const subtitle = [contact.title, contact.company].filter(Boolean).join(" at ");
  const chip = actionChip(contact, bucket);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all border-l-[3px] ${
        isSelected
          ? "border-l-blue-500 bg-blue-50/60"
          : "border-l-transparent hover:bg-gray-50"
      }`}
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
        <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
        {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
        <p className="text-xs text-gray-400 mt-0.5 truncate">{statusLine(contact, bucket)}</p>
      </div>

      {/* chip */}
      {chip && (
        <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${chip.className}`}>
          {chip.label}
        </span>
      )}
    </button>
  );
}
