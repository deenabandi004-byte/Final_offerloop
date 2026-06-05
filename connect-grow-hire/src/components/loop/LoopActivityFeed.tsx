// LoopActivityFeed — what this Loop found, in order.
//
// H carve-out: mode-aware feed with a tiered hierarchy in roles mode.
// Posting rows are the primary output; founder-draft sub-cards render
// inline below the job they were paired with (via the backend's
// sourceJobId foreign key, surfaced here as groupKey).
//
// Pulls live as the cycle runs (useLoopActivity polls every 10s).

import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  User,
  Mail,
  UserCheck,
  Briefcase,
  Building2,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import type {
  LoopActivityItem,
  LoopActivityType,
  LoopCadence,
  LoopMode,
} from "@/services/loops";
import { useLoopActivity } from "@/hooks/useLoops";
import { loopCopy, type LoopModeForCopy } from "@/lib/loopCopy";

// Phase 8.5 — credit costs mirrored from backend/app/services/loop_budget.py.
const CREDIT_COST_BY_TYPE: Record<LoopActivityType, number> = {
  contact: 9,
  draft: 0,
  hm: 13,
  job: 1,
  company: 1,
};

const TYPE_META: Record<
  LoopActivityType,
  { Icon: typeof User; label: string }
> = {
  contact: { Icon: User, label: "Person" },
  draft: { Icon: Mail, label: "Email draft" },
  hm: { Icon: UserCheck, label: "Hiring manager" },
  job: { Icon: Briefcase, label: "Job" },
  company: { Icon: Building2, label: "Company" },
};

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Day-bucket helper. Anything older than yesterday lumps into EARLIER —
// the feed doesn't need finer resolution beyond two days; the time on
// each row tells the rest of the story.
type Bucket = "today" | "yesterday" | "earlier";
function bucketFor(iso: string, now: Date): Bucket {
  if (!iso) return "earlier";
  const then = new Date(iso);
  if (isNaN(+then)) return "earlier";
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = new Date(then);
  day.setHours(0, 0, 0, 0);
  if (+day === +start) return "today";
  const yesterday = new Date(start);
  yesterday.setDate(yesterday.getDate() - 1);
  if (+day === +yesterday) return "yesterday";
  return "earlier";
}

const BUCKET_LABEL: Record<Bucket, string> = {
  today: "TODAY",
  yesterday: "YESTERDAY",
  earlier: "EARLIER",
};

// One renderable group in the feed: a primary item (job, contact, hm,
// company, draft) and zero or one paired secondary item. Today's data
// model only pairs a roles-mode job with its founder-draft sub-card; the
// shape leaves room for future paired surfaces.
interface ItemGroup {
  primary: LoopActivityItem;
  secondary?: LoopActivityItem;
  /** ISO timestamp used to sort the group within its day-bucket. */
  sortAt: string;
}

function buildGroups(items: LoopActivityItem[]): ItemGroup[] {
  // Bucket items by groupKey. Items without a groupKey become solo groups
  // (today's flat-row behavior). Items WITH a groupKey collect into a
  // bucket keyed by that string — typically a job item joined with its
  // founder draft.
  const grouped = new Map<string, LoopActivityItem[]>();
  const solo: LoopActivityItem[] = [];
  for (const item of items) {
    if (item.groupKey) {
      const arr = grouped.get(item.groupKey) ?? [];
      arr.push(item);
      grouped.set(item.groupKey, arr);
    } else {
      solo.push(item);
    }
  }

  const groups: ItemGroup[] = [];

  // For paired groups, the job anchors the primary slot. If a group has
  // no job (degenerate state — e.g. backend wrote sourceJobId but the
  // find_jobs action never ran), the first item becomes primary.
  for (const arr of grouped.values()) {
    const job = arr.find((it) => it.type === "job");
    const draft = arr.find((it) => it.type === "draft");
    if (job && draft) {
      groups.push({
        primary: job,
        secondary: draft,
        // Group sorts by the newer of the pair so a freshly-drafted
        // founder note bumps its (potentially older) source posting up
        // the feed.
        sortAt:
          (draft.createdAt || job.createdAt) > (job.createdAt || "")
            ? draft.createdAt || job.createdAt
            : job.createdAt,
      });
    } else if (job) {
      // Group only has the job — draft pending or never written.
      groups.push({ primary: job, sortAt: job.createdAt });
    } else {
      // Group only has the contact/draft — job vanished, render the
      // remaining items as solo rows in createdAt order.
      for (const it of arr) {
        groups.push({ primary: it, sortAt: it.createdAt });
      }
    }
  }

  for (const it of solo) {
    groups.push({ primary: it, sortAt: it.createdAt });
  }

  // Sort BY GROUP newest-first. Items inside a group ignore createdAt —
  // the job always renders before its draft (eng D3).
  groups.sort((a, b) => (b.sortAt || "").localeCompare(a.sortAt || ""));
  return groups;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LoopActivityFeed({
  loopId,
  loopMode = "people",
  cadence,
  lastReviewedAt,
}: {
  loopId: string;
  loopMode?: LoopMode;
  cadence?: LoopCadence;
  /** Snapshot of loop.lastReviewedAt taken on mount, BEFORE markLoopReviewed
   *  fires. Items with createdAt > this string light up the eyebrow. Pass
   *  null for "never visited" — in that case the eyebrow stays hidden so
   *  first-visit users aren't yelled at. */
  lastReviewedAt?: string | null;
}) {
  const query = useLoopActivity(loopId);
  const items = query.data?.items ?? [];
  const copy = loopCopy(loopMode as LoopModeForCopy, { cadence });

  const newCount = useMemo(() => {
    if (!lastReviewedAt) return 0;
    return items.reduce(
      (n, it) =>
        it.createdAt && it.createdAt > lastReviewedAt ? n + 1 : n,
      0,
    );
  }, [items, lastReviewedAt]);

  // ── Loading: mode-shaped skeletons ────────────────────────────────
  if (query.isLoading) {
    return <FeedSkeleton mode={loopMode} eyebrow={copy.feed.loading.eyebrow} />;
  }

  // ── Error branch ──────────────────────────────────────────────────
  if (query.isError) {
    return (
      <div
        className="rounded-xl border p-6 text-center"
        style={{
          borderColor: "var(--line)",
          background: "var(--paper-2)",
        }}
        role="alert"
      >
        <p
          className="text-[13.5px] leading-snug"
          style={{ color: "var(--ink-2)" }}
        >
          {copy.feed.error}
        </p>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-center"
        style={{
          borderColor: "var(--line)",
          background: "var(--paper-2)",
        }}
      >
        <p
          className="text-[13.5px] leading-snug"
          style={{ color: "var(--ink-3)" }}
        >
          {copy.feed.empty}
        </p>
      </div>
    );
  }

  // ── Populated feed ───────────────────────────────────────────────
  const groups = buildGroups(items);
  const now = new Date();

  // Walk groups, emit a bucket eyebrow each time the bucket flips.
  const sections: Array<{ bucket: Bucket; groups: ItemGroup[] }> = [];
  for (const group of groups) {
    const b = bucketFor(group.primary.createdAt, now);
    const last = sections[sections.length - 1];
    if (last && last.bucket === b) {
      last.groups.push(group);
    } else {
      sections.push({ bucket: b, groups: [group] });
    }
  }

  return (
    <div
      role="feed"
      aria-label="Loop activity"
      className="flex flex-col gap-6"
    >
      {/* "N NEW SINCE YOU LAST CHECKED" eyebrow */}
      {newCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="font-mono uppercase"
          style={{
            fontSize: 10.5,
            color: "var(--ink-3)",
            letterSpacing: "0.08em",
          }}
        >
          {copy.feed.newSinceLastVisit(newCount)}
        </div>
      )}

      {sections.map((section, si) => (
        <Section
          key={`${section.bucket}-${si}`}
          bucket={section.bucket}
          groups={section.groups}
        />
      ))}
    </div>
  );
}

// ─── Sections ───────────────────────────────────────────────────────────────

function Section({ bucket, groups }: { bucket: Bucket; groups: ItemGroup[] }) {
  return (
    <div>
      <div
        className="font-mono uppercase mb-2.5"
        style={{
          fontSize: 10.5,
          color: "var(--ink-3)",
          letterSpacing: "0.08em",
        }}
      >
        {BUCKET_LABEL[bucket]} · {groups.length}
        {" "}
        {groups.length === 1 ? "ITEM" : "ITEMS"}
      </div>
      <div
        className="rounded-xl border bg-white overflow-hidden"
        style={{ borderColor: "var(--line)" }}
      >
        {groups.map((g, i) => (
          <Group key={g.primary.id} group={g} last={i === groups.length - 1} />
        ))}
      </div>
    </div>
  );
}

function Group({ group, last }: { group: ItemGroup; last: boolean }) {
  // Paired: job primary with founder-draft secondary indented below.
  if (group.secondary && group.primary.type === "job") {
    return (
      <div
        style={{
          borderBottom: last ? "none" : "1px solid var(--line-2)",
        }}
      >
        <JobRow item={group.primary} bordered={false} primary />
        <FounderDraftSubRow item={group.secondary} />
      </div>
    );
  }
  // Solo: emit the primary at the default weight.
  return (
    <ActivityRow item={group.primary} last={last} />
  );
}

// ─── Rows ───────────────────────────────────────────────────────────────────

function ActivityRow({
  item,
  last,
}: {
  item: LoopActivityItem;
  last: boolean;
}) {
  if (item.type === "job") {
    return <JobRow item={item} bordered={!last} />;
  }

  const meta = TYPE_META[item.type];
  const Icon = meta.Icon;

  const rowClass =
    "group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--paper-2)]";
  const rowStyle = {
    borderBottom: last ? "none" : "1px solid var(--line-2)",
  } as const;

  const content = (
    <>
      <span
        className="inline-flex items-center justify-center rounded-md shrink-0"
        style={{
          width: 32,
          height: 32,
          background: "var(--paper-2)",
          color: "var(--ink-2)",
        }}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-mono uppercase rounded"
            style={{
              fontSize: 10,
              padding: "1.5px 6px",
              letterSpacing: "0.06em",
              background: "var(--paper-2)",
              color: "var(--ink-3)",
            }}
          >
            {meta.label}
          </span>
          <span
            className="text-[10.5px]"
            style={{ color: "var(--ink-3)" }}
          >
            {relativeTime(item.createdAt)}
          </span>
          {CREDIT_COST_BY_TYPE[item.type] > 0 && (
            <span
              className="font-mono text-[10px] tabular-nums"
              style={{ color: "var(--ink-3)" }}
              title={`Cost: ${CREDIT_COST_BY_TYPE[item.type]} credits`}
            >
              · {CREDIT_COST_BY_TYPE[item.type]} cr
            </span>
          )}
        </div>
        <div
          className="text-[13.5px] font-medium tracking-[-0.01em] truncate mt-1"
          style={{ color: "var(--ink)" }}
        >
          {item.title}
        </div>
        {item.subtitle && (
          <div
            className="text-[12px] truncate mt-0.5"
            style={{ color: "var(--ink-3)" }}
          >
            {item.subtitle}
          </div>
        )}
      </div>

      <span
        className="inline-flex items-center gap-1 text-[12px] shrink-0 mt-1 transition-transform group-hover:translate-x-0.5"
        style={{ color: "var(--ink-2)" }}
      >
        {item.external ? "Open" : "View"}
        <ArrowRight className="h-3 w-3" />
      </span>
    </>
  );

  if (item.external) {
    return (
      <a
        href={item.linkTo}
        target="_blank"
        rel="noopener noreferrer"
        className={rowClass}
        style={rowStyle}
        role="article"
        aria-labelledby={`item-${item.id}-title`}
      >
        {content}
      </a>
    );
  }
  return (
    <Link
      to={item.linkTo}
      className={rowClass}
      style={rowStyle}
      role="article"
      aria-labelledby={`item-${item.id}-title`}
    >
      {content}
    </Link>
  );
}

function JobRow({
  item,
  bordered,
  primary = false,
}: {
  item: LoopActivityItem;
  bordered: boolean;
  /** True when this is the tier-1 job in a paired group. Bumps the row
   *  height + title size per the H plan information-architecture spec. */
  primary?: boolean;
}) {
  const isExternal = item.external;
  const rowClass = `group flex items-start gap-3 sm:items-center px-4 sm:px-5 transition-colors hover:bg-[var(--paper-2)] ${primary ? "py-4" : "py-3.5"}`;
  const rowStyle = {
    borderBottom: bordered ? "1px solid var(--line-2)" : "none",
  } as const;
  const titleId = `job-${item.id}-title`;

  const titleSize = primary ? 15 : 13.5;

  const content = (
    <>
      <span
        className="inline-flex items-center justify-center rounded-md shrink-0"
        style={{
          width: primary ? 40 : 32,
          height: primary ? 40 : 32,
          background: "var(--paper-2)",
          color: "var(--ink-2)",
        }}
      >
        <Briefcase className={primary ? "h-5 w-5" : "h-4 w-4"} />
      </span>

      <div className="flex-1 min-w-0">
        <div
          id={titleId}
          className="font-medium tracking-[-0.01em] truncate"
          style={{
            color: "var(--ink)",
            fontSize: titleSize,
          }}
        >
          {item.title}
        </div>
        {item.subtitle && (
          <div
            className="text-[13px] truncate mt-0.5"
            style={{ color: "var(--ink-2)" }}
          >
            {item.subtitle} {item.createdAt && `· ${relativeTime(item.createdAt)}`}
          </div>
        )}
      </div>

      {/* Apply / View pill on the right. White bg, 1px var(--line),
          12px medium, ExternalLink at 12px. Match the Cancel-button
          vocabulary at StartLoopHero — explicitly NOT a colored pill
          (Pattern #8 on the AI-slop blacklist). */}
      <span
        className="inline-flex items-center gap-1 rounded-md border bg-white shrink-0 self-start sm:self-center"
        style={{
          padding: "6px 10px",
          minWidth: 72,
          height: 32,
          borderColor: "var(--line)",
          color: "var(--ink-2)",
          fontSize: 12,
          fontWeight: 500,
        }}
        aria-label={
          isExternal
            ? `Apply for ${item.title} — opens in new tab`
            : `View ${item.title}`
        }
      >
        {isExternal ? "Apply" : "View"}
        {isExternal ? (
          <ExternalLink className="h-3 w-3" />
        ) : (
          <ArrowRight className="h-3 w-3" />
        )}
      </span>
    </>
  );

  if (isExternal) {
    return (
      <a
        href={item.linkTo}
        target="_blank"
        rel="noopener noreferrer"
        className={rowClass}
        style={rowStyle}
        role="article"
        aria-labelledby={titleId}
      >
        {content}
      </a>
    );
  }
  return (
    <Link
      to={item.linkTo}
      className={rowClass}
      style={rowStyle}
      role="article"
      aria-labelledby={titleId}
    >
      {content}
    </Link>
  );
}

function FounderDraftSubRow({ item }: { item: LoopActivityItem }) {
  const subjectId = `draft-${item.id}-subject`;
  // Desktop: pl-12 indent. Mobile: no indent, 1px var(--ink-3) thread bar
  // down the left edge (D5). Encoded with Tailwind's sm: breakpoint.
  const rowClass =
    "group flex items-start gap-3 transition-colors hover:bg-[var(--paper-2)] " +
    "pl-4 sm:pl-12 pr-4 sm:pr-5 py-3 " +
    "border-l sm:border-l-0";
  const rowStyle = {
    background: "var(--paper-2)",
    borderColor: "var(--ink-3)",
  } as const;

  const content = (
    <div
      className="rounded-lg border w-full"
      style={{
        background: "var(--paper-2)",
        borderColor: "var(--line-2)",
        padding: "10px 12px",
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span
          className="font-mono uppercase"
          style={{
            fontSize: 10,
            color: "var(--ink-3)",
            letterSpacing: "0.08em",
          }}
        >
          DRAFT · for the founder
        </span>
        <span
          className="text-[11px] shrink-0"
          style={{ color: "var(--ink-3)" }}
        >
          {relativeTime(item.createdAt)}
        </span>
      </div>
      <div
        id={subjectId}
        className="font-medium tracking-[-0.01em] mt-1.5 truncate"
        style={{ fontSize: 12.5, color: "var(--ink-2)" }}
      >
        {item.title}
      </div>
      {item.subtitle && (
        <div
          className="italic line-clamp-2 mt-0.5"
          style={{ fontSize: 11.5, color: "var(--ink-3)" }}
        >
          {item.subtitle}
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <span
          className="inline-flex items-center gap-1"
          style={{ fontSize: 11.5, color: "var(--ink-2)", fontWeight: 500 }}
        >
          Open draft
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );

  if (item.external) {
    return (
      <a
        href={item.linkTo}
        target="_blank"
        rel="noopener noreferrer"
        className={rowClass}
        style={rowStyle}
        role="article"
        aria-labelledby={subjectId}
      >
        {content}
      </a>
    );
  }
  return (
    <Link
      to={item.linkTo}
      className={rowClass}
      style={rowStyle}
      role="article"
      aria-labelledby={subjectId}
    >
      {content}
    </Link>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function FeedSkeleton({ mode, eyebrow }: { mode: LoopMode; eyebrow: string }) {
  // Roles → job-shape skeletons (briefcase + Apply pill).
  // People → contact-shape skeletons (user icon + bigger subtitle).
  // Both  → mixed (one of each, then one of either).
  const shapes: Array<"job" | "contact"> =
    mode === "roles"
      ? ["job", "job", "job"]
      : mode === "both"
        ? ["job", "contact", "job"]
        : ["contact", "contact", "contact"];

  return (
    <div
      aria-busy="true"
      aria-label={`Loading ${mode} feed`}
      className="flex flex-col gap-3"
    >
      <div
        className="font-mono uppercase"
        style={{
          fontSize: 10.5,
          color: "var(--ink-3)",
          letterSpacing: "0.08em",
        }}
      >
        {eyebrow}
      </div>
      <div
        className="rounded-xl border bg-white overflow-hidden"
        style={{ borderColor: "var(--line)" }}
      >
        {shapes.map((shape, i) => (
          <SkeletonRow key={i} shape={shape} last={i === shapes.length - 1} />
        ))}
      </div>
    </div>
  );
}

function SkeletonRow({
  shape,
  last,
}: {
  shape: "job" | "contact";
  last: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 sm:px-5 py-4"
      style={{
        borderBottom: last ? "none" : "1px solid var(--line-2)",
      }}
    >
      <span
        className="inline-flex items-center justify-center rounded-md shrink-0"
        style={{
          width: shape === "job" ? 40 : 32,
          height: shape === "job" ? 40 : 32,
          background: "var(--paper-2)",
          color: "var(--ink-3)",
        }}
      >
        {shape === "job" ? (
          <Briefcase className="h-4 w-4 opacity-40" />
        ) : (
          <User className="h-4 w-4 opacity-40" />
        )}
      </span>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div
          className="h-3 rounded animate-pulse"
          style={{
            width: shape === "job" ? "70%" : "55%",
            background: "var(--paper-2)",
          }}
        />
        <div
          className="h-2.5 rounded animate-pulse"
          style={{
            width: shape === "job" ? "45%" : "65%",
            background: "var(--paper-2)",
          }}
        />
      </div>
      {shape === "job" && (
        <span
          className="rounded-md border shrink-0"
          style={{
            width: 72,
            height: 32,
            borderColor: "var(--line)",
            background: "var(--paper-2)",
          }}
        />
      )}
    </div>
  );
}
