// Inline agent setup wizard — 3-step flow with editorial headlines,
// step rail, tag inputs, and a live preview rail sidebar.
//
// PR1 update: Step 01 is textarea-first. The student types their goal in
// natural language; the parser turns it into mode + chips below. Chips
// stay editable so the parser is a starting point, not a black box.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateAgentConfig, deployAgent, parseBrief, type ParsedBrief } from "@/services/agent";
import { firebaseApi } from "@/services/firebaseApi";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useCreateLoop } from "@/hooks/useLoops";
import useDebounce from "@/hooks/use-debounce";
import { useProposedBrief, type UseProposedBriefState } from "@/hooks/useProposedBrief";
import { usePreviewTargets } from "@/hooks/usePreviewTargets";
import { useSubscription } from "@/hooks/useSubscription";
import { InlinePreview } from "@/components/agent/InlinePreview";
import {
  estimatedWeeklyCreditsPeople,
  weeklyTargetForTier,
} from "@/lib/tierDefaults";
import { loopCopy, type LoopModeForCopy } from "@/lib/loopCopy";

// ── Constants ──────────────────────────────────────────────────────────

const STEPS = [
  { id: "goals", num: "01", label: "Goals", sub: "Who and where" },
  { id: "launch", num: "02", label: "Review & launch", sub: "Pick approval and start" },
] as const;

type StepDescriptor = (typeof STEPS)[number];

// Soft cap on the textarea. Backend MAX_BRIEF_CHARS is 2000; we soft-warn
// at the same number so users see the cap before the parser truncates.
const MAX_BRIEF_CHARS = 2000;
// 600ms debounce on the textarea parse (PR1 plan D10 spec).
const BRIEF_PARSE_DEBOUNCE_MS = 600;
// Below this length the textarea is too thin to be worth parsing — saves
// OpenAI calls on the user's first few keystrokes.
const MIN_BRIEF_CHARS_TO_PARSE = 8;

// Compose a one-paragraph brief from the chip wizard so the same backend
// pipeline (POST /api/agent/brief → briefText + briefParsed) is the single
// source of truth as the freeform Loop composer.
function buildSyntheticBrief(form: {
  companies: string[];
  industries: string[];
  roles: string[];
  weeklyTarget: number;
  preferAlumni: boolean;
}): string {
  const parts: string[] = [];
  const whoBits: string[] = [];
  if (form.roles.length) whoBits.push(form.roles.join(", "));
  if (form.companies.length) whoBits.push(`at ${form.companies.join(", ")}`);
  else if (form.industries.length) whoBits.push(`in ${form.industries.join(", ")}`);
  parts.push(
    `Find ${form.weeklyTarget} ${whoBits.join(" ") || "professionals"} per week.`
  );
  if (form.preferAlumni) parts.push("Prefer alumni from my university.");
  return parts.join(" ");
}

// Derive a human-readable Loop name from the wizard form. Mirrors how the
// design's LoopCard subtitle reads ("Stripe · Linear · Vercel · Product
// Designer") so the new card slots right in next to existing ones.
function deriveLoopName(form: {
  companies: string[];
  industries: string[];
  roles: string[];
}): string {
  const role = form.roles[0]?.trim();
  const cos = form.companies.filter(Boolean).slice(0, 2).join(" · ");
  const inds = form.industries.filter(Boolean).slice(0, 2).join(" · ");
  const target = cos || inds;
  if (target && role) return `${target} · ${role}`;
  if (target) return target;
  if (role) return `${role} loop`;
  return "Outreach loop";
}

// ── Primitives ─────────────────────────────────────────────────────────


function PulseDot({ color = "#22c55e" }: { color?: string }) {
  return (
    <span className="relative inline-block w-[7px] h-[7px]">
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: color, animation: "om-pulse 1.6s ease-out infinite" }}
      />
    </span>
  );
}



// ── Approval-mode card ─────────────────────────────────────────────────

function ModeCard({
  active,
  title,
  desc,
  tag,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  tag?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left transition-all cursor-pointer"
      style={{
        padding: 14,
        borderRadius: 3,
        border: `1px solid ${active ? "#4A60A8" : "var(--line)"}`,
        background: active ? "rgba(74, 96, 168, 0.06)" : "#FFFFFF",
        boxShadow: active ? "0 0 0 3px rgba(74, 96, 168, 0.10)" : "none",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{
            border: `${active ? 3 : 1.5}px solid ${active ? "#4A60A8" : "var(--ink-3)"}`,
            background: active ? "#FFFFFF" : "transparent",
          }}
        />
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
          {title}
        </span>
        {tag && (
          <span className="ml-auto">
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#4A60A8",
                background: "rgba(74, 96, 168, 0.10)",
                padding: "2px 8px",
                borderRadius: 100,
              }}
            >
              {tag}
            </span>
          </span>
        )}
      </div>
      <div className="text-xs leading-relaxed pl-[18px]" style={{ color: "var(--ink-2)" }}>
        {desc}
      </div>
    </button>
  );
}

// ── Step rail ──────────────────────────────────────────────────────────

function StepRail({
  index,
  onJump,
  steps,
}: {
  index: number;
  onJump: (i: number) => void;
  steps: ReadonlyArray<StepDescriptor>;
}) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        background: "var(--paper-2)",
        border: "1px solid var(--line)",
        borderRadius: 3,
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {steps.map((s, i) => {
        const active = i === index;
        const done = i < index;
        return (
          <button
            key={s.id}
            onClick={() => onJump(i)}
            className="relative text-left py-3.5 px-4 cursor-pointer border-0"
            style={{
              background: active ? "#FFFFFF" : "transparent",
              borderRight: i < steps.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            {active && (
              <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: "#4A60A8" }} />
            )}
            <div className="flex items-center gap-2.5">
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  color: done ? "var(--signal-pos)" : active ? "#4A60A8" : "var(--ink-3)",
                  minWidth: 18,
                }}
              >
                {done ? "✓" : s.num}
              </span>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    color: active ? "var(--ink)" : done ? "var(--ink-2)" : "var(--ink-3)",
                  }}
                >
                  {s.label}
                </div>
                <div style={{ fontSize: 11, marginTop: 2, color: "var(--ink-3)" }}>
                  {s.sub}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Step bodies ────────────────────────────────────────────────────────

interface FormState {
  companies: string[];
  industries: string[];
  roles: string[];
  locations: string[];
  preferAlumni: boolean;
  approvalMode: "review_first" | "autopilot";
  loopMode: LoopModeForCopy;
}

type ParsePhase = "idle" | "parsing" | "ok" | "empty" | "failed";

// ── Parse status line (below the textarea) ─────────────────────────────

function ParseStatusLine({
  phase,
  briefLen,
  extractCounts,
}: {
  phase: ParsePhase;
  briefLen: number;
  extractCounts: {
    companies: number;
    roles: number;
    industries: number;
    locations: number;
  };
}) {
  const baseStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: "var(--ink-3)",
    marginTop: 8,
  };
  // Hide entirely below 10 chars — don't shame users who just opened the
  // page. Once they've typed enough to be meaningful, show the parser's
  // readout so they can see what was extracted.
  if (briefLen < 10 && phase !== "parsing") return null;

  if (phase === "parsing") {
    return (
      <div className="flex items-center gap-2" style={baseStyle}>
        <PulseDot color="#4A60A8" />
        <span>Reading…</span>
      </div>
    );
  }
  const totalEntities =
    extractCounts.companies +
    extractCounts.roles +
    extractCounts.industries +
    extractCounts.locations;
  if ((phase === "ok" || phase === "empty") && totalEntities === 0) {
    return (
      <div style={{ ...baseStyle, color: "#b91c1c" }}>
        We didn't catch specific targets — try naming a company, role, or industry.
      </div>
    );
  }
  if (phase === "ok") {
    return (
      <div style={baseStyle}>
        Found: {extractCounts.companies}{" "}
        {extractCounts.companies === 1 ? "company" : "companies"} ·{" "}
        {extractCounts.roles} {extractCounts.roles === 1 ? "role" : "roles"} ·{" "}
        {extractCounts.industries}{" "}
        {extractCounts.industries === 1 ? "industry" : "industries"}
      </div>
    );
  }
  if (phase === "failed") {
    return (
      <div style={{ ...baseStyle, color: "#b91c1c" }}>
        Couldn't read that — chips left as-is. Edit them by hand or rephrase.
      </div>
    );
  }
  return null;
}


function StepGoals({
  form,
  set,
  briefText,
  setBriefText,
  parsePhase,
  hasUniversity,
  university,
  profileFacts,
  proposedBrief,
  showAiDraftLabel,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
  briefText: string;
  setBriefText: (v: string) => void;
  parsePhase: ParsePhase;
  hasUniversity: boolean;
  university: string;
  profileFacts: {
    targetFirms: string[];
    targetIndustries: string[];
    preferredLocations: string[];
    extractedRoles: string[];
  };
  proposedBrief: UseProposedBriefState;
  showAiDraftLabel: boolean;
}) {
  const copy = loopCopy(form.loopMode, { school: university });
  const overLimit = briefText.length > MAX_BRIEF_CHARS;
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Goal-oriented prompts — Loops are persistent, so the textarea reads more
  // like "what am I trying to accomplish?" than a single-shot search query.
  // Profile facts (university, target industry/firm) fill in when present so
  // the rotating examples sound like the user's own goals.
  const typewriterExamples = useMemo(() => {
    const uni = university && university.length <= 10 ? university : "USC";
    const firm = profileFacts.targetFirms[0] || "Stripe";
    const ind = profileFacts.targetIndustries[0] || "fintech";
    const role = profileFacts.extractedRoles[0] || "growth analyst";
    return [
      `I want a ${role} role.`,
      `I want people to chat with about breaking into ${ind}.`,
      `I want a summer internship at a ${ind} startup.`,
      `I want ${uni} alumni at ${firm} to network with.`,
      `I want to talk to product managers about their career path.`,
    ];
  }, [university, profileFacts]);

  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  useEffect(() => {
    if (briefText || focused) {
      setTypedPlaceholder("");
      return;
    }
    if (typewriterExamples.length === 0) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idx = 0;
    let charIdx = 0;
    let mode: "typing" | "hold" | "erasing" | "pause" = "typing";

    const tick = () => {
      if (cancelled) return;
      const target = typewriterExamples[idx];
      if (mode === "typing") {
        if (charIdx < target.length) {
          charIdx++;
          setTypedPlaceholder(target.slice(0, charIdx));
          timeoutId = setTimeout(tick, 38 + Math.random() * 32);
        } else {
          mode = "hold";
          timeoutId = setTimeout(tick, 1900);
        }
      } else if (mode === "hold") {
        mode = "erasing";
        timeoutId = setTimeout(tick, 30);
      } else if (mode === "erasing") {
        if (charIdx > 0) {
          charIdx--;
          setTypedPlaceholder(target.slice(0, charIdx));
          timeoutId = setTimeout(tick, 16);
        } else {
          mode = "pause";
          idx = (idx + 1) % typewriterExamples.length;
          timeoutId = setTimeout(tick, 380);
        }
      } else if (mode === "pause") {
        mode = "typing";
        tick();
      }
    };
    timeoutId = setTimeout(tick, 400);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [briefText, focused, typewriterExamples]);

  // "Suggest from my profile" button label varies with the proposal's
  // current state — loading, failed, fresh-data, or never-fetched.
  const proposalHasData =
    !!proposedBrief.data && proposedBrief.data.status === "ok";
  const proposalLoading = proposedBrief.loading;
  const proposalFailed =
    !!proposedBrief.error || proposedBrief.data?.status === "failed";
  const suggestLabel = proposalLoading
    ? "Suggesting…"
    : proposalFailed
      ? "Try again"
      : proposalHasData
        ? "✨ Re-suggest"
        : "✨ Suggest from my profile";

  return (
    <div>
      {/* Suggest-from-profile button — sits above the textarea per the
          design spec so the AI assist is always visible without taking
          the textarea's prominence. */}
      <div
        className="mb-2 flex items-center justify-end"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <button
          type="button"
          onClick={() => {
            void proposedBrief.refetch();
          }}
          disabled={proposalLoading}
          aria-label="Suggest a brief from my profile"
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: proposalLoading ? "var(--ink-3)" : "var(--ink-2)",
            background: "transparent",
            border: "1px solid var(--line)",
            borderRadius: 999,
            padding: "5px 12px",
            cursor: proposalLoading ? "default" : "pointer",
            transition: "color 0.15s ease, border-color 0.15s ease",
          }}
        >
          {suggestLabel}
        </button>
      </div>

      {/* Small "AI draft" label, visible only while the textarea still
          holds the AI-proposed sentence (drops to false on first user
          keystroke via the parent's wrapped setBriefText). */}
      {showAiDraftLabel && (
        <div
          aria-live="polite"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: "var(--ink-3)",
            marginBottom: 6,
          }}
        >
          ✨ AI draft — edit anything
        </div>
      )}

      {/* Brief textarea — Find-page-style hero prompt with typewriter
          placeholder and profile-aware QuickStarters underneath. */}
      <div className="mb-5">
        <div
          style={{
            position: "relative",
            background: "#FFFFFF",
            borderRadius: 12,
            border: `1.5px solid ${overLimit ? "#b91c1c" : focused ? "#4A60A8" : "rgba(15, 37, 69, 0.08)"}`,
            boxShadow: focused
              ? "0 0 0 6px rgba(74, 96, 168, 0.12), 0 16px 48px rgba(74, 96, 168, 0.10)"
              : "0 2px 10px rgba(15, 37, 69, 0.04), 0 22px 52px rgba(15, 37, 69, 0.06)",
            transition: "all 0.18s ease",
            padding: "18px 18px 14px 18px",
          }}
        >
          <Textarea
            ref={textareaRef}
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={typedPlaceholder || (focused ? "Describe the Loop you want to deploy…" : "")}
            rows={4}
            aria-label="Your goal in your own words"
            className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            style={{
              color: "var(--ink)",
              background: "transparent",
              padding: 0,
              fontFamily: "'Inter', sans-serif",
              fontSize: 16,
              lineHeight: 1.5,
              minHeight: 96,
              outline: "none",
            }}
          />
          <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
            <ParseStatusLine
              phase={parsePhase}
              briefLen={briefText.length}
              extractCounts={{
                companies: form.companies.length,
                roles: form.roles.length,
                industries: form.industries.length,
                locations: form.locations.length,
              }}
            />
            <span
              className="ml-3 shrink-0"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                fontWeight: 500,
                color: overLimit ? "#b91c1c" : "var(--ink-3)",
              }}
            >
              {briefText.length} / {MAX_BRIEF_CHARS}
            </span>
          </div>
        </div>

      </div>

      <div
        className="flex items-center justify-between"
        style={{
          paddingTop: 18,
          borderTop: "1px solid var(--line-2)",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
            {copy.preferAlumniLabel}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 2, color: "var(--ink-3)" }}>
            {hasUniversity
              ? copy.preferAlumniHint
              : "Set your university in Account Settings to use this."}
          </div>
        </div>
        <Switch
          checked={hasUniversity && form.preferAlumni}
          disabled={!hasUniversity}
          onCheckedChange={(v) => set({ preferAlumni: v })}
        />
      </div>
    </div>
  );
}


function StepReview({
  form,
  set,
  university,
  weeklyTarget,
  lowBalance,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
  university: string;
  weeklyTarget: number;
  lowBalance: boolean;
}) {
  const summary: Array<{ k: string; v: string }> = [
    { k: "Companies", v: form.companies.length ? form.companies.join(", ") : "—" },
    { k: "Roles", v: form.roles.length ? form.roles.join(", ") : "—" },
    {
      k: "Industries",
      v: form.industries.length ? form.industries.join(", ") : "—",
    },
    {
      k: "Alumni priority",
      v: form.preferAlumni ? (university ? `On — ${university}` : "On") : "Off",
    },
  ];

  const cadenceSentence =
    form.approvalMode === "autopilot"
      ? "We'll send your approved templates automatically — manage them in Settings."
      : `We'll find ~${weeklyTarget} ${weeklyTarget === 1 ? "person" : "people"} per week. You can pause anytime in the fleet view.`;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Compact summary */}
      <div
        className="overflow-hidden mb-5"
        style={{
          border: "1px solid var(--line)",
          borderRadius: 3,
          background: "#FFFFFF",
        }}
      >
        {summary.map((r, i) => (
          <div
            key={r.k}
            className="grid grid-cols-[150px_1fr]"
            style={{
              padding: "12px 18px",
              fontSize: 13,
              borderBottom: i < summary.length - 1 ? "1px solid var(--line-2)" : "none",
            }}
          >
            <span style={{ color: "var(--ink-3)" }}>{r.k}</span>
            <span style={{ color: "var(--ink)", fontWeight: 500 }}>{r.v}</span>
          </div>
        ))}
      </div>

      {/* Approval mode picker — the focus of V2 step 2 */}
      <div className="mb-5">
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--ink)",
            marginBottom: 4,
          }}
        >
          Should we send drafts automatically once you approve a template?
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--ink-3)",
            marginBottom: 12,
          }}
        >
          The most important decision in setup — you can change it later in Settings.
        </div>
        <div
          role="radiogroup"
          aria-label="Approval mode"
          className="grid grid-cols-1 md:grid-cols-2 gap-2.5"
        >
          <ModeCard
            active={form.approvalMode === "review_first"}
            title="Review first"
            tag="recommended"
            desc="We draft every email — nothing sends until you approve it."
            onClick={() => set({ approvalMode: "review_first" })}
          />
          <ModeCard
            active={form.approvalMode === "autopilot"}
            title="Autopilot"
            desc="We send your approved templates automatically."
            onClick={() => set({ approvalMode: "autopilot" })}
          />
        </div>
      </div>

      {/* Low-balance warning — only when the user actually is low */}
      {lowBalance && (
        <div
          className="mb-5"
          style={{
            border: "1px solid rgba(180, 100, 30, 0.25)",
            background: "rgba(180, 100, 30, 0.04)",
            borderRadius: 3,
            padding: 14,
            fontSize: 13,
            color: "var(--ink-2)",
            lineHeight: 1.5,
          }}
        >
          You're low on credits this month — your Loop may pause early.
        </div>
      )}

      {/* Cadence sentence — plain English, no numbers other than the count */}
      <div
        style={{
          fontSize: 12.5,
          color: "var(--ink-3)",
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        {cadenceSentence}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function AgentSetupInline({ onDeployed }: { onDeployed: () => void }) {
  const { toast } = useToast();
  const { user } = useFirebaseAuth();
  const createLoopMut = useCreateLoop();
  const [stepIdx, setStepIdx] = useState(0);
  const [deploying, setDeploying] = useState(false);
  // null = still loading, "" = onboarded but no school, "USC" = set.
  const [university, setUniversity] = useState<string | null>(null);
  const hasUniversity = !!(university && university.trim());
  // Profile facts powering the QuickStarters chips under the brief textarea —
  // mirrors what ContactSearchPage feeds the Find prompt.
  const [profileFacts, setProfileFacts] = useState<{
    targetFirms: string[];
    targetIndustries: string[];
    preferredLocations: string[];
    extractedRoles: string[];
  }>({ targetFirms: [], targetIndustries: [], preferredLocations: [], extractedRoles: [] });

  useEffect(() => {
    if (!user?.uid) return;
    firebaseApi
      .getUserOnboardingData(user.uid)
      .then((d) => {
        setUniversity(d.university || "");
        setProfileFacts({
          targetFirms: d.targetFirms || [],
          targetIndustries: d.targetIndustries || [],
          preferredLocations: d.preferredLocations || [],
          extractedRoles: d.extractedRoles || [],
        });
      })
      .catch(() => setUniversity(""));
  }, [user?.uid]);

  const [form, setForm] = useState<FormState>({
    companies: [],
    industries: [],
    roles: [],
    locations: [],
    preferAlumni: true,
    approvalMode: "review_first",
    // Every Loop pursues both networking + job-search against one budget.
    // The picker is gone from the wizard; loopMode stays on the doc for
    // AgentSettingsModal's Advanced escape valve.
    loopMode: "both",
  });
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // AI-proposed starting brief — Claude drafts a sentence from the user's
  // resume + profile on mount so students never face a blank page. User
  // edits beat AI; we never overwrite anything the user typed.
  const proposedBrief = useProposedBrief({ enabled: true });
  const aiDraftAppliedRef = useRef(false);

  // Read the user's tier so the wizard can derive cadence + low-balance
  // hint without exposing credit math in the UI. Subscription is fetched
  // lazily; treat null as "free" while it loads — the worst case is a
  // briefly-shown lower cadence number that updates on hydrate.
  const { subscription } = useSubscription();
  const tier: string = subscription?.tier ?? "free";
  const weeklyTarget = weeklyTargetForTier(tier);
  const lowBalance = (() => {
    const credits = subscription?.credits ?? 0;
    return credits > 0 && credits < estimatedWeeklyCreditsPeople(weeklyTarget);
  })();
  const steps: ReadonlyArray<StepDescriptor> = STEPS;

  // Inline preview: feeds the right-side "Who you'd reach" panel. Only
  // enabled on Step 01 (Goals) — the hook short-circuits when off so we
  // don't refetch as the user navigates to Step 02. Brief is built from
  // the form so chip-only flows still show a preview.
  const briefForPreview: ParsedBrief = {
    companies: form.companies,
    industries: form.industries,
    roles: form.roles,
    locations: form.locations,
    emailPurpose: null,
    constraints: [],
    targetCount: null,
    mode: "both",
  };
  const previewState = usePreviewTargets({
    enabled: stepIdx === 0,
    briefParsed: briefForPreview,
  });

  // ── Prompt-first brief state ─────────────────────────────────────────
  // The textarea is the only input on Step 01. Its value debounces into a
  // parser call (parseBrief) that populates the four extracted-entity
  // lists on the form; those drive the InlinePreview side panel. No
  // chip rows means no manual-edit sticky tracking — the parser always
  // wins.
  const [briefText, setBriefText] = useState("");
  const [parsePhase, setParsePhase] = useState<ParsePhase>("idle");
  // Guard against stale parses overwriting fresh results (user types fast).
  const lastParseTokenRef = useRef(0);
  const debouncedBriefText = useDebounce(briefText.trim(), BRIEF_PARSE_DEBOUNCE_MS);

  useEffect(() => {
    const text = debouncedBriefText;
    if (!text) {
      setParsePhase("idle");
      return;
    }
    if (text.length < MIN_BRIEF_CHARS_TO_PARSE) {
      setParsePhase("idle");
      return;
    }
    const token = ++lastParseTokenRef.current;
    setParsePhase("parsing");
    parseBrief(text)
      .then((res) => {
        if (token !== lastParseTokenRef.current) return; // a newer parse fired
        const parsed = res.briefParsed || null;
        if (res.parseStatus === "failed") {
          setParsePhase("failed");
          return;
        }
        if (res.parseStatus === "empty") {
          setParsePhase("empty");
          return;
        }
        // ok — populate the extracted-entity lists from parser output.
        // Mode is locked to "both"; the parser's mode classification is
        // ignored. These four lists are never user-visible chips — they
        // exist only to feed InlinePreview + the deploy payload.
        setForm((f) => ({
          ...f,
          companies: parsed?.companies ?? f.companies,
          industries: parsed?.industries ?? f.industries,
          roles: parsed?.roles ?? f.roles,
          locations: parsed?.locations ?? f.locations,
        }));
        setParsePhase("ok");
      })
      .catch(() => {
        if (token !== lastParseTokenRef.current) return;
        setParsePhase("failed");
      });
  }, [debouncedBriefText]);

  // Apply the AI-proposed brief once, only if the user hasn't already
  // started typing or picking chips. Prevents the proposal from clobbering
  // an in-progress edit if Claude lands a slow response.
  const [aiDraftActive, setAiDraftActive] = useState(false);
  useEffect(() => {
    if (aiDraftAppliedRef.current) return;
    const data = proposedBrief.data;
    if (!data || data.status !== "ok") return;
    if (briefText.trim().length > 0) return;
    const formClean =
      form.companies.length === 0 &&
      form.roles.length === 0 &&
      form.industries.length === 0 &&
      form.locations.length === 0;
    if (!formClean) return;

    aiDraftAppliedRef.current = true;
    setBriefText(data.sentence);
    setForm((f) => ({
      ...f,
      companies: data.companies,
      roles: data.roles,
      industries: data.industries,
      locations: data.locations,
    }));
    setAiDraftActive(data.sentence.length > 0);
  }, [
    proposedBrief.data,
    briefText,
    form.companies.length,
    form.roles.length,
    form.industries.length,
    form.locations.length,
  ]);

  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;
  // Mode-aware copy for the Goals headline (and subtitle). school is the
  // user's actual university when known so the alumni toggle shows
  // concrete language.
  const goalsCopy = loopCopy(form.loopMode, { school: university || "" });
  // Deploy when EITHER the textarea has real content OR the user filled in
  // chips manually. buildSyntheticBrief covers the chip-only case.
  const hasBrief = briefText.trim().length >= MIN_BRIEF_CHARS_TO_PARSE;
  const hasChipTargets = form.companies.length > 0 || form.industries.length > 0;
  const canDeploy = hasBrief || hasChipTargets;
  // Gate the Continue button while the parser is actively reading the
  // brief. Without this, a fast click after typing lands the user on
  // Step 02 with empty extraction fields and a stale preview.
  const parseInFlight = stepIdx === 0 && parsePhase === "parsing";

  const handleDeploy = async () => {
    if (!hasBrief && !hasChipTargets) {
      toast({
        title: "Add a goal",
        description: "Type your goal in the textbox or add at least one company / industry.",
        variant: "destructive",
      });
      return;
    }
    setDeploying(true);
    try {
      // Prompt-first (textarea filled, parser fired) and chip-only paths
      // converge here. When the textarea is empty we synthesize a brief
      // from chips so the planner still gets a <user_brief> block.
      const finalBriefText = hasBrief
        ? briefText.trim()
        : buildSyntheticBrief({
            companies: form.companies,
            industries: form.industries,
            roles: form.roles,
            weeklyTarget,
            preferAlumni: form.preferAlumni,
          });

      // briefParsed reflects the user's CURRENT chip state (post-edits),
      // not the parser's raw output — chips are the source of truth at
      // deploy. Mode is always "both" — every Loop pursues networking +
      // job-search against one budget.
      const finalBriefParsed: ParsedBrief = {
        companies: form.companies,
        industries: form.industries,
        roles: form.roles,
        locations: form.locations,
        emailPurpose: null,
        constraints: [],
        targetCount: weeklyTarget,
        mode: "both",
      };

      // Derive weeklyTarget + creditBudgetPerWeek from the user's tier so
      // the agent_config audit doc reads sensibly and matches what the
      // backend's tier-default fallback would compute.
      const persistedCreditBudget = estimatedWeeklyCreditsPeople(weeklyTarget);

      await updateAgentConfig({
        targetCompanies: form.companies,
        targetIndustries: form.industries,
        targetRoles: form.roles,
        // Don't send preferAlumni=true if the user has no university on file —
        // it would silently boost nothing. Gate to actual school presence.
        preferAlumni: hasUniversity && form.preferAlumni,
        weeklyContactTarget: weeklyTarget,
        creditBudgetPerWeek: persistedCreditBudget,
        approvalMode: form.approvalMode,
      });
      await deployAgent();

      // The Loops fleet view at /agent reads from a different collection
      // (users/{uid}/loops/*) than the legacy single-agent config above
      // (users/{uid}/settings/agent_config). Without this createLoop the
      // wizard "deploys" but no card ever shows up in the fleet view —
      // useCreateLoop invalidates the list query so /agent refetches.
      // creditBudgetPerWeek is omitted so the backend's create_loop
      // tier-default derivation runs.
      await createLoopMut.mutateAsync({
        briefText: finalBriefText,
        briefParsed: finalBriefParsed,
        name: deriveLoopName(form),
        reviewBeforeSend: form.approvalMode === "review_first",
        weeklyTarget,
        cadence: "weekly",
        automationEnabled: form.approvalMode === "autopilot",
        loopMode: "both",
      });

      toast({
        title: "Loop deployed!",
        description: "Your loop is chasing roles AND networking together.",
      });
      onDeployed();
    } catch (e: unknown) {
      toast({
        title: "Deploy failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="flex min-h-0">
      {/* Main form column */}
      <div className="flex-1 min-w-0">
        <div className="max-w-[640px] mx-auto px-4 sm:px-8 py-8 pb-20">
          {/* Hero — mirrors the Find page's serif headline treatment:
              parallel phrases, italic emphasis, navy ink. */}
          <div className="mb-8" style={{ paddingTop: 32 }}>
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "#4A60A8",
                marginBottom: 16,
              }}
            >
              Step {step.num} · {step.label}
            </div>
            <h1
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: 48,
                fontWeight: 400,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color: "#0f2545",
                marginBottom: 16,
              }}
            >
              {stepIdx === 0 && (
                <>
                  Tell your Loop{" "}
                  <span style={{ fontStyle: "italic", color: "#4A60A8" }}>
                    {goalsCopy.goalsTitleAccent}
                  </span>{" "}
                  to chase.
                </>
              )}
              {stepIdx === 1 && (
                <>
                  Review and{" "}
                  <span style={{ fontStyle: "italic", color: "#4A60A8" }}>launch.</span>
                </>
              )}
            </h1>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 17,
                lineHeight: 1.55,
                color: "#475569",
                maxWidth: 560,
              }}
            >
              {stepIdx === 0 && goalsCopy.goalsSubtitle}
              {stepIdx === 1 &&
                "Pick how drafts go out, then start the Loop. First batch lands within 24 hours."}
            </p>
          </div>

          {/* Step rail */}
          <StepRail index={stepIdx} onJump={setStepIdx} steps={steps} />

          {/* Step body */}
          <div className="pt-7">
            {stepIdx === 0 && (
              <StepGoals
                form={form}
                set={set}
                briefText={briefText}
                setBriefText={(v) => {
                  if (aiDraftActive && v !== briefText) setAiDraftActive(false);
                  setBriefText(v);
                }}
                parsePhase={parsePhase}
                hasUniversity={hasUniversity}
                university={university || ""}
                profileFacts={profileFacts}
                proposedBrief={proposedBrief}
                showAiDraftLabel={aiDraftActive}
              />
            )}
            {stepIdx === 1 && (
              <StepReview
                form={form}
                set={set}
                university={university || ""}
                weeklyTarget={weeklyTarget}
                lowBalance={lowBalance}
              />
            )}
          </div>

          {/* Navigation */}
          <div
            className="flex justify-between items-center mt-7 pt-5"
            style={{ borderTop: "1px solid var(--line-2)" }}
          >
            <button
              type="button"
              onClick={() => stepIdx > 0 && setStepIdx(stepIdx - 1)}
              disabled={stepIdx === 0}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 500,
                color: stepIdx === 0 ? "var(--ink-3)" : "var(--ink-2)",
                background: "#FFFFFF",
                border: "1px solid var(--line)",
                borderRadius: 3,
                cursor: stepIdx === 0 ? "not-allowed" : "pointer",
                opacity: stepIdx === 0 ? 0.6 : 1,
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>

            <div className="flex items-center gap-3">
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--ink-3)",
                }}
              >
                {stepIdx + 1} / {steps.length}
              </span>
              {isLast ? (
                <button
                  type="button"
                  onClick={handleDeploy}
                  disabled={!canDeploy || deploying}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#FFFFFF",
                    background: (!canDeploy || deploying) ? "var(--ink-3)" : "#4A60A8",
                    border: "none",
                    borderRadius: 3,
                    cursor: (!canDeploy || deploying) ? "not-allowed" : "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (canDeploy && !deploying) e.currentTarget.style.background = "#3A4F8E";
                  }}
                  onMouseLeave={(e) => {
                    if (canDeploy && !deploying) e.currentTarget.style.background = "#4A60A8";
                  }}
                >
                  {deploying ? (
                    <>
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-white"
                        style={{ animation: "om-blink 1s ease-in-out infinite" }}
                      />
                      Starting your Loop…
                    </>
                  ) : (
                    <>Start Loop</>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => !parseInFlight && setStepIdx(stepIdx + 1)}
                  disabled={parseInFlight}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#FFFFFF",
                    background: parseInFlight ? "var(--ink-3)" : "#4A60A8",
                    border: "none",
                    borderRadius: 3,
                    cursor: parseInFlight ? "not-allowed" : "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!parseInFlight) e.currentTarget.style.background = "#3A4F8E";
                  }}
                  onMouseLeave={(e) => {
                    if (!parseInFlight) e.currentTarget.style.background = "#4A60A8";
                  }}
                >
                  {parseInFlight ? "Reading…" : "Continue →"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right rail: real PDL samples on Step 01; nothing on Step 02
          (the review surface is the focus there). */}
      {stepIdx === 0 && (
        <div style={{ width: 320, flexShrink: 0 }}>
          <InlinePreview
            contacts={previewState.contacts}
            loading={previewState.loading}
            error={previewState.error}
            hasSignal={previewState.hasSignal}
          />
        </div>
      )}
    </div>
  );
}
