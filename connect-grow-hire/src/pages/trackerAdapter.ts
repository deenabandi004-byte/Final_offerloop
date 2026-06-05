// Adapter at the edge: translate OutboxThread (real backend shape) into the
// prototype's ProtoContact shape. Components in tracker/redesign/ consume the
// proto shape only — they never touch OutboxThread directly. If the backend
// response evolves, the components do not budge: we update the adapter.

import type { OutboxThread, PipelineStage } from "@/services/api";
import { daysBetween } from "@/lib/formatters";

// ── Prototype's domain model (from network-tracker.html) ─────────────────────

export const PROTO_STAGES = ["saved", "contacted", "connected", "interviewing", "offer"] as const;
export type ProtoStage = (typeof PROTO_STAGES)[number];

export const PROTO_STAGE_LABELS: Record<ProtoStage, string> = {
  saved: "Saved",
  contacted: "Contacted",
  connected: "Connected",
  interviewing: "Interviewing",
  offer: "Offer",
};

export type ProtoSegment = "people" | "companies" | "hiringManagers" | "archived";

// Display-only chip rendered on each card. Derived from real state but does
// not drive any behavior in PR1.
export type ProtoStatus = "Action" | "Reply" | "Draft" | "Sent" | "View" | "Done";

export interface ProtoContact {
  id: string;
  name: string;
  role: string;
  company: string;
  daysAgo: number;
  status: ProtoStatus;
  email: string;
  // Local-only in PR1: no backend field exists, seeded false per load.
  bookmarked: boolean;
  linkedinUrl: string | null;
  // Bucket assignment for the staged default view.
  // null = terminal state (no_response / bounced / closed): excluded from the
  // accordion, still visible in the spreadsheet.
  stage: ProtoStage | null;
  // Pre-computed label for the spreadsheet's Pipeline column. Mirrors the
  // proto stage when staged; carries the real backend status when terminal,
  // so the complete table never shows a blank pipeline cell.
  pipelineLabel: string;
  // Clearbit URL built from this contact's own email domain when the domain
  // is non-personal. Consumed by the people-card inline logo. Null when the
  // contact uses gmail / yahoo / etc. — the inline logo hides in that case.
  companyLogoFallbackUrl: string | null;
  // ISO timestamp from the contact's `archivedAt` field, or null when not
  // archived. Drives Archive ↔ Unarchive in the detail header and gates which
  // segment a contact appears under.
  archivedAt: string | null;
}

// ── 11-stage backend → 5-stage prototype (read-side bucketing only) ──────────
// PR1 is visual-only: nothing writes back through this mapping. The labels
// "Interviewing" and "Offer" are job-search vocabulary borrowed by the
// prototype — for a networking product, a booked meeting is often the win.
// Kept as-is for prototype fidelity.

// Inverse of stageOnlyMap for write-back. The forward map is many-to-one
// (multiple backend stages collapse into one proto bucket), so the inverse
// picks the canonical backend stage that best matches a user's intent when
// they click a dot in the pipeline UI.
//
// Special case: "offer" is recognised by the adapter via resolution=
// meeting_booked, not via a pipelineStage value. Callers should route
// "offer" clicks through markOutboxThreadWon() instead of this map, and
// treat the meeting_scheduled stage returned here as a safe fallback if
// the won-call ever fails.
export function protoStageToBackend(stage: ProtoStage): PipelineStage {
  switch (stage) {
    case "saved":
      return "new";
    case "contacted":
      return "email_sent";
    case "connected":
      return "connected";
    case "interviewing":
      return "meeting_scheduled";
    case "offer":
      return "meeting_scheduled";
  }
}

function stageOnlyMap(s: PipelineStage | null | undefined): ProtoStage | null {
  switch (s) {
    case "new":
      return "saved";
    case "draft_created":
    case "draft_deleted":
    case "email_sent":
    case "waiting_on_reply":
      return "contacted";
    case "replied":
    case "connected":
      return "connected";
    case "meeting_scheduled":
      return "interviewing";
    // Terminal states have no home in the 5-stage prototype. Hiding them
    // here is more faithful than salting Contacted with bounced/closed
    // contacts. They still appear in the spreadsheet view.
    case "no_response":
    case "bounced":
    case "closed":
      return null;
    default:
      return "saved";
  }
}

// deriveStage consults the whole thread. The resolution check runs first so
// a contact that was marked won and later closed still lands in Offer
// instead of being dropped by stageOnlyMap's terminal-null short-circuit.
// mark_contact_won and mark_contact_resolution("meeting_booked") both write
// this resolution alongside pipelineStage updates.
function deriveStage(t: OutboxThread): ProtoStage | null {
  if (t.resolution === "meeting_booked") return "offer";
  return stageOnlyMap(t.pipelineStage);
}

const TERMINAL_LABELS: Record<string, string> = {
  no_response: "No Response",
  bounced: "Bounced",
  closed: "Closed",
};

function deriveStatus(t: OutboxThread): ProtoStatus {
  if (t.hasUnreadReply) return "Reply";
  if (t.pipelineStage === "draft_created" || t.pipelineStage === "draft_deleted") return "Draft";
  if (t.pipelineStage === "email_sent" || t.pipelineStage === "waiting_on_reply") return "Sent";
  if (t.pipelineStage === "meeting_scheduled" || t.pipelineStage === "connected") return "Done";
  if (t.pipelineStage === "replied") return "View";
  return "Action";
}

function deriveRole(title: string, company: string): string {
  // The prototype card and table split role on "@" / "·". Only emit the
  // "Title @Company" form when both parts exist — a bare "@Innovatech"
  // would render as " · Innovatech" with a dangling middot.
  if (title && company) return `${title} @${company}`;
  return title || company || "";
}

// ── Single-thread translation ────────────────────────────────────────────────

// Per-contact Clearbit URL derived from this contact's own email. Used by
// the people-card inline logo. Null when the contact uses a personal email
// (gmail / yahoo / etc.) — we never ship a personal domain to Clearbit.
//
// This is intentionally narrower than the company-tab's group-level
// pickCompanyDomain. A contact on personal email shows no inline logo on
// their people card even when a colleague's work-domain email gives the
// company tab a real logo. Logged as a follow-up to make consistent if the
// divergence reads as buggy in practice.
function buildContactLogoFallbackUrl(email: string): string | null {
  const d = emailDomain(email);
  if (!d || PERSONAL_EMAIL_DOMAINS.has(d)) return null;
  return `https://logo.clearbit.com/${d}`;
}

export function outboxThreadToProto(t: OutboxThread): ProtoContact {
  const company = t.company || "";
  const title = t.title || "";
  const stage = deriveStage(t);
  return {
    id: t.id,
    name: t.name || t.email || "Unknown",
    role: deriveRole(title, company),
    company,
    daysAgo: daysBetween(t.lastActivityAt),
    status: deriveStatus(t),
    email: t.email || "",
    bookmarked: false,
    linkedinUrl: t.linkedinUrl ?? null,
    stage,
    // pipelineLabel uses the raw backend stage for terminal contacts so the
    // spreadsheet shows an honest "Bounced" / "No Response" / "Closed"
    // instead of an em-dash placeholder.
    pipelineLabel: stage
      ? PROTO_STAGE_LABELS[stage]
      : TERMINAL_LABELS[t.pipelineStage ?? ""] ?? "—",
    companyLogoFallbackUrl: buildContactLogoFallbackUrl(t.email || ""),
    archivedAt: t.archivedAt ?? null,
  };
}

// ── Group helpers ────────────────────────────────────────────────────────────

export type GroupedByStage = Record<ProtoStage, ProtoContact[]>;

function emptyByStage(): GroupedByStage {
  return { saved: [], contacted: [], connected: [], interviewing: [], offer: [] };
}

// Default-view accordion source. Terminal contacts (stage=null) are excluded.
export function groupedByStage(contacts: ProtoContact[]): GroupedByStage {
  const out = emptyByStage();
  for (const c of contacts) {
    if (c.stage) out[c.stage].push(c);
  }
  return out;
}

// Personal-email providers. We never ship these to Clearbit as a company
// domain: a "gmail.com" lookup returns Gmail's own logo, which would be
// wrong for an "Acme Corp" group made entirely of contacts using personal
// accounts. The CompanyLogo component falls through to the name-guess chain
// instead.
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
  "live.com",
  "me.com",
]);

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain || !domain.includes(".")) return null;
  return domain;
}

// Pick the best work-email domain across a company's contacts. Returns null
// when every contact uses a personal email so the logo component can fall
// through to name-guess Clearbit instead of leaking a personal domain.
function pickCompanyDomain(contacts: ProtoContact[]): string | null {
  for (const c of contacts) {
    const d = emailDomain(c.email);
    if (d && !PERSONAL_EMAIL_DOMAINS.has(d)) return d;
  }
  return null;
}

export interface CompanyGroup {
  company: string;
  contacts: ProtoContact[];
  // Best work-domain available across the group's contacts, derived from
  // their email addresses. Null when no contact has a work-domain email.
  // Consumed by CompanyLogo as the email-derived Clearbit URL source.
  domain: string | null;
}

// Companies view re-groups the same staged dataset by company. Terminal
// contacts are excluded for the same reason as groupedByStage.
export function groupedByCompany(contacts: ProtoContact[]): CompanyGroup[] {
  const byCompany = new Map<string, ProtoContact[]>();
  for (const c of contacts) {
    if (!c.stage) continue;
    const key = (c.company || "Unknown").trim();
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(c);
  }
  return Array.from(byCompany.entries())
    .map(([company, list]) => ({
      company,
      contacts: list,
      domain: pickCompanyDomain(list),
    }))
    .sort((a, b) => a.company.localeCompare(b.company));
}
