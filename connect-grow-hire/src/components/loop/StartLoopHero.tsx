// StartLoopHero — the empty-state and inline composer for creating a Loop.
//
// Shown when the user has zero Loops, AND when the "+ Start another Loop" tile
// is clicked from the fleet view. Same component, two contexts. Renders the
// hero copy, the textarea, the primary CTA, and the four marketing cards from
// the design.

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { LOOP_COPY } from "@/lib/loopCopy";
import {
  useCreateLoop,
  useEstimateCycleCost,
  useStartLoop,
} from "@/hooks/useLoops";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { parseBrief } from "@/services/agent";
import type { LoopCadence } from "@/services/loops";
import type { ParsedBrief } from "@/services/agent";

const CADENCE_ORDER: LoopCadence[] = [
  "every_other_day",
  "daily",
  "weekly",
  "manual",
];

interface StartLoopHeroProps {
  /** True when shown as the page's empty state (extra top padding). */
  variant?: "page" | "inline";
  /** Called after the Loop is created. Defaults to navigating to its detail page. */
  onCreated?: (loopId: string) => void;
  /** Called when the user cancels the inline composer (no-op in page variant). */
  onCancel?: () => void;
}

export function StartLoopHero({
  variant = "page",
  onCreated,
  onCancel,
}: StartLoopHeroProps) {
  const [brief, setBrief] = useState("");
  const [cadence, setCadence] = useState<LoopCadence>("every_other_day");
  // Debounced parsed-brief snapshot used to drive the cost estimate. We don't
  // re-parse on every keystroke — only after the textarea quiets for 600ms.
  const [parsedPreview, setParsedPreview] = useState<ParsedBrief | null>(null);
  const create = useCreateLoop();
  const start = useStartLoop();
  const navigate = useNavigate();
  const { toast } = useToast();

  const trimmed = brief.trim();
  const submitting = create.isPending || start.isPending;
  const canSubmit = trimmed.length > 0 && !submitting;

  // Debounce: parse the brief client-side via the existing /agent/brief endpoint
  // so the estimate strip can show real numbers without a per-keystroke call.
  useEffect(() => {
    if (trimmed.length < 20) {
      setParsedPreview(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const result = await parseBrief(trimmed);
        setParsedPreview(result.briefParsed);
      } catch {
        // Best-effort — if parse fails, just don't show the estimate.
        setParsedPreview(null);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [trimmed]);

  const estimateQuery = useEstimateCycleCost(
    parsedPreview,
    cadence,
    !!parsedPreview && cadence !== "manual",
  );

  const handleStart = async () => {
    if (!canSubmit) {
      toast({
        title: LOOP_COPY.toasts.briefRequired,
        variant: "destructive",
      });
      return;
    }
    try {
      const loop = await create.mutateAsync({ briefText: trimmed, cadence });
      // The button says "Start the Loop" — actually start it. If start fails
      // (e.g. brief_required), the Loop still got created, so the user can
      // retry from the detail page.
      try {
        await start.mutateAsync(loop.id);
      } catch (startErr) {
        // Non-fatal: surface but don't block navigation.
        console.warn("Loop created but failed to start:", startErr);
      }
      toast({ title: LOOP_COPY.toasts.loopStarted });
      if (onCreated) onCreated(loop.id);
      else navigate(`/agent/${loop.id}`);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "tier_cap_reached") {
        toast({
          title: "You're at your plan's limit",
          description: e.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: LOOP_COPY.toasts.somethingBroke,
          description: e.message,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div
      className={
        variant === "page"
          ? "max-w-[860px] mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-20"
          : "max-w-[720px] mx-auto px-4 sm:px-6 py-6"
      }
    >
      {/* ── Hero ── */}
      <div className="text-center">
        <h1
          className="font-serif text-[44px] sm:text-[56px] leading-[1.05] tracking-[-0.02em]"
          style={{ color: "var(--ink, #0F172A)" }}
        >
          Start a{" "}
          <em className="font-serif" style={{ fontWeight: 400 }}>
            Loop.
          </em>
        </h1>
        <p
          className="mt-4 text-[15px] leading-snug max-w-[520px] mx-auto"
          style={{ color: "var(--ink-2)" }}
        >
          {LOOP_COPY.hero.subtitle}
        </p>
      </div>

      {/* ── Composer ── */}
      <div className="mt-9 max-w-[640px] mx-auto">
        <div
          className="rounded-2xl border bg-white p-4 transition-shadow focus-within:shadow-md"
          style={{ borderColor: "var(--line)" }}
        >
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={LOOP_COPY.hero.placeholder}
            className="w-full resize-none border-0 bg-transparent text-[14.5px] leading-relaxed focus:outline-none placeholder:text-[var(--ink-3)]"
            style={{ color: "var(--ink)", minHeight: 110 }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleStart();
              }
            }}
          />
          <div
            className="flex items-center justify-between mt-3 pt-3 border-t"
            style={{ borderColor: "var(--line-2)" }}
          >
            <span
              className="text-[11.5px]"
              style={{ color: "var(--ink-3)" }}
            >
              {trimmed.length > 0
                ? `${trimmed.length} character${trimmed.length === 1 ? "" : "s"}`
                : "Cmd/Ctrl + Enter to start"}
            </span>
            <div className="flex items-center gap-2">
              {variant === "inline" && onCancel && (
                <button
                  onClick={onCancel}
                  className="rounded-md border bg-white px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-[var(--paper-2)]"
                  style={{
                    borderColor: "var(--line)",
                    color: "var(--ink-2)",
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleStart}
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13.5px] font-medium transition-opacity disabled:opacity-40"
                style={{
                  background: "var(--ink)",
                  color: "white",
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Starting…
                  </>
                ) : (
                  <>{LOOP_COPY.hero.primaryCta} →</>
                )}
              </button>
            </div>
          </div>
        </div>
        <p
          className="mt-3 text-center text-[12px]"
          style={{ color: "var(--ink-3)" }}
        >
          {LOOP_COPY.hero.primaryCtaHint}
        </p>

        {/* ── Cadence picker (Phase 8) ── */}
        <div className="mt-6">
          <div
            className="text-[11px] uppercase tracking-[0.06em] font-medium text-center mb-2.5"
            style={{ color: "var(--ink-3)" }}
          >
            {LOOP_COPY.cadence.label}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CADENCE_ORDER.map((opt) => {
              const meta = LOOP_COPY.cadence.options[opt];
              const active = cadence === opt;
              const isRecommended = opt === "every_other_day";
              return (
                <button
                  key={opt}
                  onClick={() => setCadence(opt)}
                  className="text-left rounded-lg border p-3 transition-colors"
                  style={{
                    borderColor: active ? "var(--ink)" : "var(--line)",
                    background: active ? "var(--paper-2)" : "white",
                  }}
                >
                  <div
                    className="text-[12.5px] font-semibold tracking-[-0.01em]"
                    style={{ color: "var(--ink)" }}
                  >
                    {meta.title}
                    {isRecommended && (
                      <span
                        className="ml-1.5 font-mono text-[9px] uppercase tracking-wider"
                        style={{ color: "var(--ink-3)" }}
                      >
                        · {LOOP_COPY.cadence.recommendedTag}
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] mt-1" style={{ color: "var(--ink-3)" }}>
                    {meta.body}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Cost estimate strip (Phase 8) ── */}
        {parsedPreview && cadence !== "manual" && (
          <div
            className="mt-4 inline-flex items-center gap-2 text-[12px] mx-auto"
            style={{ color: "var(--ink-2)" }}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
            {estimateQuery.isLoading || !estimateQuery.data ? (
              <span style={{ color: "var(--ink-3)" }}>
                {LOOP_COPY.estimate.loading}
              </span>
            ) : (
              <span>
                {LOOP_COPY.estimate.perCycle(estimateQuery.data.per_cycle_credits)}
                {" · "}
                {LOOP_COPY.estimate.monthlyFit(estimateQuery.data.cycles_per_month)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── 4 marketing cards ── */}
      {variant === "page" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-16">
          {LOOP_COPY.cards.map((c) => (
            <div
              key={c.n}
              className="rounded-xl border bg-white p-5"
              style={{ borderColor: "var(--line)" }}
            >
              <div
                className="font-mono text-[11px] tracking-wider mb-3"
                style={{ color: "var(--ink-3)" }}
              >
                {c.n}
              </div>
              <div
                className="font-serif text-[18px] leading-tight tracking-[-0.01em] mb-2"
                style={{ color: "var(--ink)" }}
              >
                <em style={{ fontWeight: 400 }}>{c.title}</em>
              </div>
              <p
                className="text-[12.5px] leading-relaxed"
                style={{ color: "var(--ink-2)" }}
              >
                {c.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
