// LoopsCommandBar — fleet-wide proof + live ticker, sits above the grid.
//
// Variation D from the design handoff (loops/project/Loops Setup - Redesign.html).
// The bar argues "your Loops are working" in one card:
//   • Found this week (large serif number + 7-day sparkline)
//   • Drafts waiting on you
//   • Weekly-goal ring (sum of every Loop's weeklyTarget — see plan doc)
// Plus a live activity ticker along the bottom that rotates through recent finds.

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  useFleetFeed,
  useFleetWeeklySummary,
} from "@/hooks/useLoops";
import type { FleetFeedItem } from "@/services/loops";

const TICKER_INTERVAL_MS = 3200;

export function LoopsCommandBar() {
  const summaryQuery = useFleetWeeklySummary();
  const feedQuery = useFleetFeed(20);

  // Render the bar immediately with zeros, even while the API is loading or
  // failing. The bar is the visual centerpiece of the redesign — bailing out
  // to null would make the page look unchanged. Defaults degrade cleanly: a
  // brand-new account legitimately has 0 found / 0 drafts / 0 goal.
  const summary = summaryQuery.data ?? {
    foundThisWeek: 0,
    weeklySparkline: [0, 0, 0, 0, 0, 0, 0],
    draftsWaiting: 0,
    weeklyGoal: 0,
    weeklyProgressPct: 0,
    activeLoopsCount: 0,
    weekStartedAt: "",
  };
  const items = feedQuery.data?.items ?? [];

  const goalPct = summary.weeklyGoal > 0 ? summary.weeklyProgressPct : 0;

  return (
    <div
      className="mb-[22px] rounded-2xl border bg-white overflow-hidden"
      style={{
        borderColor: "var(--line)",
        boxShadow: "0 1px 2px rgba(17,19,24,.04)",
      }}
    >
      <div className="flex items-stretch flex-wrap">
        {/* ── Found this week ── */}
        <div className="flex-1 min-w-[260px] flex items-center gap-[18px] px-6 py-5">
          <div>
            <div
              className="text-[10.5px] uppercase tracking-[0.08em] font-mono"
              style={{ color: "var(--ink-3)" }}
            >
              Found this week
            </div>
            <div className="flex items-end gap-3 mt-1">
              <span
                className="font-serif leading-[0.9] tracking-[-0.01em]"
                style={{ fontSize: 44, color: "var(--ink)" }}
              >
                {summary.foundThisWeek}
              </span>
              <span
                className="text-[13px] pb-1.5"
                style={{ color: "var(--ink-3)" }}
              >
                {summary.foundThisWeek === 1 ? "person" : "people"}
                {summary.activeLoopsCount > 0
                  ? ` · across ${summary.activeLoopsCount} ${
                      summary.activeLoopsCount === 1 ? "Loop" : "Loops"
                    }`
                  : ""}
              </span>
            </div>
          </div>
          <div className="ml-auto">
            <Sparkline data={summary.weeklySparkline} />
          </div>
        </div>

        <Divider />

        {/* ── Drafts waiting ── */}
        <div className="flex items-center gap-[13px] px-6 py-5 shrink-0">
          <div>
            <div className="text-[20px] font-semibold leading-none tracking-[-0.01em]">
              {summary.draftsWaiting}
            </div>
            <div
              className="text-[11.5px] mt-1"
              style={{ color: "var(--ink-3)" }}
            >
              drafts waiting on you
            </div>
          </div>
        </div>

        <Divider />

        {/* ── Weekly goal ring ── */}
        <div className="flex items-center gap-3 px-6 py-5 shrink-0">
          <Ring pct={goalPct} />
          <div>
            <div className="text-[20px] font-semibold leading-none tracking-[-0.01em] tabular-nums">
              {summary.foundThisWeek}
              <span
                className="font-normal text-[15px]"
                style={{ color: "var(--ink-3)" }}
              >
                /{summary.weeklyGoal || 0}
              </span>
            </div>
            <div
              className="text-[11.5px] mt-1"
              style={{ color: "var(--ink-3)" }}
            >
              weekly goal
            </div>
          </div>
        </div>
      </div>

      {/* ── Live activity ticker ── */}
      <Ticker items={items} />
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, background: "var(--line-2)" }} />;
}

// ── Sparkline ──────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  const w = 150;
  const h = 44;
  if (!data || data.length < 2) {
    return <div style={{ width: w, height: h }} />;
  }
  const max = Math.max(1, ...data);
  const step = w / (data.length - 1);
  const pts = data.map((d, i) => [i * step, h - (d / max) * (h - 4) - 2]);
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <path d={area} fill="var(--accent)" opacity="0.08" />
      <path
        d={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r={2.4}
        fill="var(--accent)"
      />
    </svg>
  );
}

// ── Goal ring ──────────────────────────────────────────────────────────────

function Ring({ pct }: { pct: number }) {
  const size = 42;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Animate the dash so the ring fills in on mount.
  const [dash, setDash] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDash(pct), 120);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (dash / 100) * c}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span
          className="font-mono font-bold"
          style={{ fontSize: 10, color: "var(--ink)" }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}

// ── Live activity ticker ──────────────────────────────────────────────────

const KIND_COLOR: Record<FleetFeedItem["kind"], string> = {
  found: "#22c55e",
  draft: "#E0852C",
  job: "var(--ink)",
  company: "var(--ink)",
};

const KIND_LABEL: Record<FleetFeedItem["kind"], string> = {
  found: "Just found",
  draft: "Drafted",
  job: "Surfaced",
  company: "Spotted",
};

function Ticker({ items }: { items: FleetFeedItem[] }) {
  const [idx, setIdx] = useState(0);
  // Rotate locally — server returns a snapshot and refetches every 30s.
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % items.length),
      TICKER_INTERVAL_MS
    );
    return () => clearInterval(t);
  }, [items.length]);

  const current = items[idx];

  return (
    <div
      className="flex items-center gap-[11px] px-6 py-[11px] border-t"
      style={{
        borderColor: "var(--line-2)",
        background: "var(--paper-2)",
      }}
    >
      <span className="relative inline-flex" style={{ width: 7, height: 7 }}>
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: "#22c55e",
            animation: "om-pulse 1.6s ease-out infinite",
          }}
        />
      </span>
      <span
        className="font-mono uppercase tracking-[0.08em] shrink-0"
        style={{ fontSize: 10, color: "var(--ink-3)" }}
      >
        Live
      </span>
      <div
        className="flex-1 min-w-0 text-[12.5px] truncate"
        style={{ color: "var(--ink-2)" }}
      >
        {current ? (
          <TickerLine item={current} />
        ) : (
          <span style={{ color: "var(--ink-3)" }}>
            Your Loops will start filling this in as they run.
          </span>
        )}
      </div>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[12px] font-medium shrink-0"
        style={{ color: "var(--ink-2)" }}
        onClick={() => {
          /* TODO: deep-link into a full activity timeline once it exists */
        }}
      >
        View all
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

function TickerLine({ item }: { item: FleetFeedItem }) {
  // For "you sent N" / "Draft ready" style rows the role field is the
  // contextual line itself, so we don't repeat the dash separator.
  const hideRole = /sent|draft/i.test(item.who);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block rounded-full shrink-0"
        style={{ width: 6, height: 6, background: KIND_COLOR[item.kind] }}
      />
      <span className="truncate">
        <b className="font-semibold" style={{ color: "var(--ink)" }}>
          {KIND_LABEL[item.kind]}
        </b>{" "}
        {item.who}
        {hideRole || !item.role ? "" : ` — ${item.role}`}{" "}
        <span style={{ color: "var(--ink-3)" }}>· {item.when}</span>
      </span>
    </span>
  );
}
