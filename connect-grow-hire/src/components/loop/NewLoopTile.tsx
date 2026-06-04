// NewLoopTile — the dashed "+ Start another Loop" card at the end of the grid.
//
// Two states:
//   - canCreate=true  → primary CTA routes to /agent/setup. Inline two
//                       one-tap quickstart chips that open the setup page
//                       pre-seeded with a brief (so the user can launch a
//                       second Loop in one click).
//   - canCreate=false → muted state pushing the upgrade flow.

import { Link, useNavigate } from "react-router-dom";
import { Plus, Lock, ArrowUpRight, Zap, ArrowRight } from "lucide-react";
import { LOOP_COPY } from "@/lib/loopCopy";
import type { LoopLimits, SuggestedLoop } from "@/services/loops";
import { useSuggestedLoops } from "@/hooks/useLoops";

const SETUP_ROUTE = "/agent/setup";

export function NewLoopTile({
  limits,
  onCreate,
}: {
  limits: LoopLimits;
  // Kept for API compatibility with LoopGrid — the inline composer flow
  // is being replaced by the dedicated setup page, so callers no longer
  // need to wire this up. Optional; if present, called when the user taps
  // the primary CTA (and we still route to the setup page).
  onCreate?: () => void;
}) {
  const canCreate = limits.canCreate;
  const navigate = useNavigate();
  const suggested = useSuggestedLoops();
  const items = suggested.data?.items ?? [];

  if (!canCreate) {
    return (
      <div
        className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border p-5"
        style={{
          borderColor: "var(--line)",
          background: "var(--paper-2)",
          color: "var(--ink-3)",
          minHeight: 200,
        }}
      >
        <span
          className="inline-flex items-center justify-center rounded-full w-10 h-10"
          style={{ background: "white", color: "var(--ink-3)" }}
        >
          <Lock className="h-4 w-4" />
        </span>
        <div className="text-center px-2">
          <div
            className="text-[14px] font-semibold tracking-[-0.01em]"
            style={{ color: "var(--ink)" }}
          >
            {LOOP_COPY.newTile.titleAtCap}
          </div>
          <div className="text-[12.5px] mt-1 leading-snug">
            {LOOP_COPY.newTile.bodyAtCap(limits.cap)}
          </div>
        </div>
        <Link
          to="/pricing"
          className="inline-flex items-center gap-1 mt-1 rounded-md border bg-white px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--paper-2)]"
          style={{ borderColor: "var(--line)", color: "var(--ink)" }}
        >
          {LOOP_COPY.newTile.upgradeCta}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  const handlePrimary = () => {
    onCreate?.();
    navigate(SETUP_ROUTE);
  };

  // Show two quickstart suggestions when we have them; the tile gracefully
  // falls back to the original CTA-only layout while the templates load.
  const quickstarts = items.slice(0, 2);

  return (
    <div
      className="group flex flex-col border-2 border-dashed transition-colors hover:bg-[var(--paper-2)] overflow-hidden"
      style={{
        borderColor: "var(--line)",
        borderRadius: 18,
        background: "white",
        minHeight: 200,
      }}
    >
      <button
        onClick={handlePrimary}
        className="flex flex-col items-center justify-center gap-[11px] px-5 pt-[26px] pb-[18px] cursor-pointer w-full"
        style={{ color: "var(--ink-3)" }}
      >
        <span
          className="inline-flex items-center justify-center rounded-full transition-all group-hover:scale-105 group-hover:bg-white group-hover:shadow-sm"
          style={{
            width: 46,
            height: 46,
            background: "var(--accent-tint)",
            color: "var(--accent)",
          }}
        >
          <Plus className="h-[22px] w-[22px]" strokeWidth={2} />
        </span>
        <div className="text-center">
          <div
            className="text-[14px] font-semibold tracking-[-0.01em]"
            style={{ color: "var(--ink)" }}
          >
            {LOOP_COPY.newTile.titleAvailable}
          </div>
          <div className="text-[12.5px] mt-1">
            Tell it who to chase — takes a minute.
          </div>
        </div>
      </button>

      {quickstarts.length > 0 && (
        <div className="px-4 pb-4">
          <div
            className="text-center font-mono uppercase tracking-[0.08em] mb-2"
            style={{ fontSize: 9.5, color: "var(--ink-3)" }}
          >
            Or jump in with
          </div>
          <div className="flex flex-col gap-1.5">
            {quickstarts.map((s) => (
              <QuickStartChip key={s.id} suggestion={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuickStartChip({ suggestion }: { suggestion: SuggestedLoop }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        // Pass the suggestion through location.state — /agent/setup reads it
        // to pre-fill the brief composer (out of scope for this pass; the
        // setup page can adopt this when it's ready). Falling through to the
        // empty setup page is a fine baseline until then.
        navigate(SETUP_ROUTE, {
          state: {
            seed: {
              id: suggestion.id,
              brief: suggestion.brief,
              loopMode: suggestion.loopMode,
              title: suggestion.title,
            },
          },
        });
      }}
      className="flex items-center gap-2 rounded-md border bg-white px-2.5 py-2 text-left transition-colors hover:border-[var(--ink-3)]"
      style={{ borderColor: "var(--line)" }}
    >
      <Zap className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} />
      <span
        className="flex-1 text-[12px] leading-snug line-clamp-2"
        style={{ color: "var(--ink-2)" }}
      >
        {suggestion.title}
      </span>
      <ArrowRight
        className="h-3 w-3 shrink-0"
        style={{ color: "var(--ink-3)" }}
      />
    </button>
  );
}
