// Inline agent setup wizard — 3-step flow with editorial headlines,
// step rail, tag inputs, and a live preview rail sidebar.
//
// PR1 update: Step 01 is textarea-first. The student types their goal in
// natural language; the parser turns it into mode + chips below. Chips
// stay editable so the parser is a starting point, not a black box.

import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateAgentConfig, deployAgent, parseBrief, type ParsedBrief } from "@/services/agent";
import { firebaseApi } from "@/services/firebaseApi";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useCreateLoop } from "@/hooks/useLoops";
import { listLoops } from "@/services/loops";
import useDebounce from "@/hooks/use-debounce";
import { loopCopy, type LoopModeForCopy } from "@/lib/loopCopy";
import { ModeIndicator } from "@/components/loop/ModeIndicator";

// ── Constants ──────────────────────────────────────────────────────────

const STEPS = [
  { id: "goals", num: "01", label: "Goals", sub: "Who and where" },
  { id: "volume", num: "02", label: "Cadence", sub: "Pace and budget" },
  { id: "review", num: "03", label: "Review", sub: "Deploy" },
] as const;

const COMPANY_SUGGESTIONS = ["Stripe", "Linear", "Vercel", "Notion", "Ramp", "Arc", "Anthropic"];
const ROLE_SUGGESTIONS = ["Product Designer", "Design Engineer", "Analyst", "Associate", "Software Engineer"];
const LOCATION_SUGGESTIONS = ["NYC", "SF Bay Area", "Remote", "Boston", "LA", "Chicago"];
const INDUSTRY_SUGGESTIONS = ["Fintech", "AI / ML", "Consulting", "Investment Banking", "Healthcare", "Climate"];

// Soft cap on the textarea. Backend MAX_BRIEF_CHARS is 2000; we soft-warn
// at the same number so users see the cap before the parser truncates.
const MAX_BRIEF_CHARS = 2000;
// 600ms debounce on the textarea parse (PR1 plan D10 spec).
const BRIEF_PARSE_DEBOUNCE_MS = 600;
// Below this length the textarea is too thin to be worth parsing — saves
// OpenAI calls on the user's first few keystrokes.
const MIN_BRIEF_CHARS_TO_PARSE = 8;

// Mirror of backend CREDIT_COSTS.contact in app/services/loop_budget.py
// (find + draft per contact). Keep in sync with LoopActivityFeed.tsx.
const CREDIT_COST_PER_CONTACT = 9;

const KIND_META: Record<string, { color: string; label: string }> = {
  scan:     { color: "#7d8ba6", label: "scan" },
  research: { color: "#7d8ba6", label: "research" },
  match:    { color: "#16a34a", label: "match" },
  draft:    { color: "#d4a017", label: "draft" },
  verify:   { color: "#16a34a", label: "verify" },
  queue:    { color: "#7d8ba6", label: "queue" },
};

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
//
// Mode branch (plan §"Loop Fleet View"): roles Loops append "openings" so
// the auto-name reads as a job search at a glance ("Stripe · Linear · SWE
// openings"); both-mode and people-mode keep the existing pattern. Fallback
// names diverge so an empty roles-mode Loop reads "Job search loop" rather
// than "Outreach loop".
function deriveLoopName(form: {
  companies: string[];
  industries: string[];
  roles: string[];
  loopMode?: LoopModeForCopy;
}): string {
  const role = form.roles[0]?.trim();
  const cos = form.companies.filter(Boolean).slice(0, 2).join(" · ");
  const inds = form.industries.filter(Boolean).slice(0, 2).join(" · ");
  const target = cos || inds;
  const isRoles = form.loopMode === "roles";
  const isBoth = form.loopMode === "both";
  if (target && role) return isRoles ? `${target} · ${role} openings` : `${target} · ${role}`;
  if (target) return target;
  if (role) return isRoles ? `${role} openings` : `${role} loop`;
  if (isRoles) return "Job search loop";
  if (isBoth) return "Networking + jobs loop";
  return "Outreach loop";
}

function buildPreviewTraces(form: {
  companies: string[];
  industries: string[];
  roles: string[];
  weeklyTarget: number;
}) {
  const co = form.companies[0] || form.industries[0] || "your targets";
  const role = form.roles[0] || "matching roles";
  return [
    { kind: "scan", text: `Scanning the web for ${role} at ${co}` },
    { kind: "research", text: "Reading recent posts to find talking points" },
    { kind: "match", text: `Re-ranking candidates \u00b7 target ${form.weeklyTarget}/week` },
    { kind: "draft", text: "Drafting personalized opener" },
    { kind: "verify", text: "Verifying email deliverability" },
    { kind: "queue", text: "Queuing for your review" },
  ];
}

// ── Primitives ─────────────────────────────────────────────────────────

function MonoTag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="font-mono uppercase"
      style={{ fontSize: 10, letterSpacing: 0.6, fontWeight: 500, color: color || "var(--ink-3)" }}
    >
      {children}
    </span>
  );
}

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

function ActivityBars() {
  return (
    <span className="inline-flex items-end gap-[2px] h-[10px]">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[2px] h-[10px] rounded-[1px]"
          style={{
            background: "var(--ink-3)",
            animation: `om-bars ${1.2 + i * 0.1}s ease-in-out ${i * 0.13}s infinite`,
            transformOrigin: "bottom",
          }}
        />
      ))}
    </span>
  );
}

// ── Tag Input ──────────────────────────────────────────────────────────
// Chips live inside the input box with numbered mono labels.
// Hover a chip -> strikethrough; click to remove. No x buttons.

function TagChip({
  label,
  index,
  onRemove,
}: {
  label: string;
  index: number;
  onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      onClick={onRemove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded border font-mono text-[12.5px] cursor-pointer transition-all duration-100"
      style={{
        background: hover ? "transparent" : "var(--paper)",
        borderColor: hover ? "var(--ink-3)" : "var(--line)",
        color: hover ? "var(--ink-3)" : "var(--ink)",
        textDecoration: hover ? "line-through" : "none",
      }}
      title="Click to remove"
    >
      <span className="text-[9.5px] tracking-wide" style={{ color: "var(--ink-3)" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      {label}
    </span>
  );
}

function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="font-mono text-[12px] px-2.5 py-1 rounded border border-dashed transition-colors duration-100 hover:border-solid hover:bg-paper-2"
      style={{ borderColor: "var(--ink-3)", color: "var(--ink-3)" }}
    >
      + {label}
    </button>
  );
}

function TagInput({
  placeholder,
  list,
  setList,
  suggestions = [],
}: {
  placeholder: string;
  list: string[];
  setList: (v: string[]) => void;
  suggestions?: string[];
}) {
  const [val, setVal] = useState("");
  const [focused, setFocused] = useState(false);

  // Case-insensitive dedup keeps the first insertion's casing while preventing
  // "Stripe" / "stripe" / "STRIPE" from accreting as three separate targets.
  const add = (v?: string) => {
    const t = (v || val).trim();
    if (t && !list.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setList([...list, t]);
    }
    setVal("");
  };
  const rem = (t: string) => setList(list.filter((x) => x !== t));
  const remaining = suggestions.filter(
    (s) => !list.some((x) => x.toLowerCase() === s.toLowerCase())
  );

  return (
    <div>
      <div
        className="rounded-[var(--radius)] border bg-elev transition-all duration-100"
        style={{
          borderColor: focused ? "var(--ink)" : "var(--line)",
          boxShadow: focused ? "0 0 0 3px rgba(17,19,24,.06)" : "none",
          padding: list.length > 0 ? "10px 10px 4px 12px" : "4px 12px",
        }}
      >
        {list.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {list.map((t, i) => (
              <TagChip key={t} label={t} index={i} onRemove={() => rem(t)} />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              } else if (e.key === "Backspace" && val === "" && list.length > 0) {
                rem(list[list.length - 1]);
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={list.length === 0 ? placeholder : "and one more\u2026"}
            className="flex-1 border-none p-2 text-sm bg-transparent focus:outline-none placeholder:text-ink-3"
            style={{ color: "var(--ink)" }}
          />
          <span
            className="font-mono text-[9.5px] uppercase tracking-wide shrink-0 transition-opacity"
            style={{ color: "var(--ink-3)", opacity: val ? 1 : 0.5 }}
          >
            {val ? "press \u21b5" : `${list.length} added`}
          </span>
        </div>
      </div>

      {remaining.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
          <MonoTag>suggested</MonoTag>
          {remaining.slice(0, 6).map((s) => (
            <SuggestionChip key={s} label={s} onClick={() => add(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Field wrapper ──────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <div className="flex items-baseline gap-2.5 mb-2">
        <Label className="font-mono text-[10px] font-medium tracking-wider uppercase" style={{ color: "var(--ink-3)" }}>
          {label}
        </Label>
        {hint && (
          <span className="text-xs italic" style={{ color: "var(--ink-3)" }}>
            &mdash; {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Editorial field (D11) ──────────────────────────────────────────────
// Per-field italic serif label + hairline left-rail. Used by the stacked
// chip rows in the prompt-first wizard. Foundation Field stays mono-cap
// so non-D11 surfaces (cadence, review) keep their existing voice.

function EditorialField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mb-6 pl-4"
      style={{ borderLeft: "1px solid var(--line-2)" }}
    >
      <div className="flex items-baseline gap-2 mb-1.5 -ml-[1px]">
        <span
          className="font-serif italic text-[14px]"
          style={{ color: "var(--ink-2)", fontWeight: 400 }}
        >
          {label}
        </span>
        {hint && (
          <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            &middot; {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Mode card (radio) ──────────────────────────────────────────────────

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
      className="text-left p-3.5 rounded-lg border transition-colors cursor-pointer"
      style={{
        borderColor: active ? "var(--brand)" : "var(--line)",
        background: active ? "var(--paper-2)" : "var(--paper)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="w-2.5 h-2.5 rounded-full border-2"
          style={{
            borderColor: active ? "var(--brand)" : "var(--ink-3)",
            borderWidth: active ? 3 : 1.5,
            background: active ? "var(--paper)" : "transparent",
          }}
        />
        <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
          {title}
        </span>
        {tag && (
          <span className="ml-auto">
            <MonoTag>{tag}</MonoTag>
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
}: {
  index: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 border-y border-line" style={{ background: "var(--paper-2)" }}>
      {STEPS.map((s, i) => {
        const active = i === index;
        const done = i < index;
        return (
          <button
            key={s.id}
            onClick={() => onJump(i)}
            className="relative text-left py-3.5 px-4 cursor-pointer border-0"
            style={{
              background: active ? "var(--paper)" : "transparent",
              borderRight: i < STEPS.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            {active && (
              <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: "var(--brand)" }} />
            )}
            <div className="flex items-center gap-2.5">
              <span
                className="font-mono text-[11px] font-medium tracking-wide"
                style={{
                  color: done ? "var(--signal-pos)" : active ? "var(--ink)" : "var(--ink-3)",
                }}
              >
                {done ? "\u2713" : s.num}
              </span>
              <div>
                <div
                  className="text-[13px]"
                  style={{
                    fontWeight: active ? 600 : 500,
                    color: active ? "var(--ink)" : done ? "var(--ink-2)" : "var(--ink-3)",
                  }}
                >
                  {s.label}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--ink-3)" }}>
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

// ── Preview rail (right sidebar) ───────────────────────────────────────

function PreviewRail({ form, litTo }: { form: FormState; litTo: number }) {
  const traces = useMemo(() => buildPreviewTraces(form), [form]);

  return (
    <aside
      className="w-[300px] shrink-0 border-l border-line flex-col gap-4 hidden lg:flex"
      style={{ background: "var(--paper-2)", padding: "28px 20px" }}
    >
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <PulseDot color="#d4a017" />
          <MonoTag color="var(--signal-wait)">preview &middot; not running</MonoTag>
        </div>
        <p
          className="font-medium leading-[1.25]"
          style={{ color: "var(--ink)", fontSize: 17 }}
        >
          What your loop{" "}
          <em className="italic" style={{ fontWeight: 500 }}>will do</em> once deployed.
        </p>
      </div>

      <div className="border border-line rounded-[10px] bg-paper relative overflow-hidden">
        <span
          className="absolute left-0 right-0 top-0 h-[1.5px]"
          style={{
            background: "linear-gradient(90deg, transparent, var(--brand), transparent)",
            animation: "om-scan 2.4s ease-in-out infinite",
          }}
        />
        <div className="px-3.5 py-2.5 border-b border-line-2 flex items-center justify-between">
          <MonoTag>simulated trace</MonoTag>
          <ActivityBars />
        </div>
        {traces.map((t, i) => {
          const meta = KIND_META[t.kind];
          const on = i < litTo;
          return (
            <div
              key={i}
              className="px-3.5 py-2.5 transition-opacity duration-300"
              style={{
                borderBottom: i < traces.length - 1 ? "1px solid var(--line-2)" : "none",
                opacity: on ? 1 : 0.4,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-[5px] h-[5px] rounded-full"
                  style={{ background: meta.color }}
                />
                <MonoTag color={meta.color}>{meta.label}</MonoTag>
              </div>
              <div className="text-xs leading-relaxed pl-[13px]" style={{ color: "var(--ink-2)" }}>
                {t.text}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line pt-3.5 mt-auto text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
        Nothing sends without your approval. Pause the loop any time.
      </div>
    </aside>
  );
}

// ── Step bodies ────────────────────────────────────────────────────────

interface FormState {
  companies: string[];
  industries: string[];
  roles: string[];
  locations: string[];
  preferAlumni: boolean;
  weeklyTarget: number;
  creditBudget: number;
  approvalMode: "review_first" | "autopilot";
  loopMode: LoopModeForCopy;
}

type ParsePhase = "idle" | "parsing" | "ok" | "empty" | "failed";

// ── Parse status line (below the textarea) ─────────────────────────────

function ParseStatusLine({
  phase,
  detectedMode,
}: {
  phase: ParsePhase;
  detectedMode: LoopModeForCopy | null;
}) {
  if (phase === "parsing") {
    return (
      <div className="flex items-center gap-2 mt-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        <PulseDot color="var(--ink-3)" />
        <span className="font-mono uppercase tracking-wide">reading your goal…</span>
      </div>
    );
  }
  if (phase === "failed") {
    return (
      <div className="mt-2 text-[11.5px]" style={{ color: "#b91c1c" }}>
        Couldn't read that — chips left blank. You can add them by hand or rephrase.
      </div>
    );
  }
  if (phase === "ok" && detectedMode) {
    const summary = loopCopy(detectedMode).modeSummary;
    return (
      <div className="mt-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        Read as <span className="font-mono uppercase tracking-wide" style={{ color: "var(--ink-2)" }}>{summary}</span> &middot; chips below are the parsed targets.
      </div>
    );
  }
  if (phase === "ok") {
    return (
      <div className="mt-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        Mode looks ambiguous — pick one below, or add more detail above.
      </div>
    );
  }
  if (phase === "empty" || phase === "idle") {
    return (
      <div className="mt-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        Type a sentence or two above — parser fills in the chips. Or skip and edit chips directly.
      </div>
    );
  }
  return null;
}

// ModeIndicator moved to @/components/loop/ModeIndicator so StartLoopHero
// can reuse the exact shape (H carve-out, eng D5).

function StepGoals({
  form,
  set,
  briefText,
  setBriefText,
  parsePhase,
  hasUniversity,
  university,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
  briefText: string;
  setBriefText: (v: string) => void;
  parsePhase: ParsePhase;
  hasUniversity: boolean;
  university: string;
}) {
  const copy = loopCopy(form.loopMode, { school: university });
  const overLimit = briefText.length > MAX_BRIEF_CHARS;

  return (
    <div>
      {/* D10 — Textarea on top, the primary input */}
      <div className="mb-5">
        <Textarea
          value={briefText}
          onChange={(e) => setBriefText(e.target.value)}
          placeholder="e.g. I want summer SWE internships at fintech startups in NYC plus people to coffee chat with."
          rows={5}
          aria-label="Your goal in your own words"
          className="font-serif italic text-[16px] leading-[1.45] resize-none"
          style={{
            color: "var(--ink)",
            background: "var(--paper)",
            borderColor: overLimit ? "#b91c1c" : "var(--line)",
            padding: "14px 16px",
          }}
        />
        <div className="flex items-center justify-between mt-1">
          <ParseStatusLine
            phase={parsePhase}
            detectedMode={parsePhase === "ok" ? form.loopMode : null}
          />
          <span
            className="font-mono text-[10px] tracking-wide ml-3 shrink-0"
            style={{ color: overLimit ? "#b91c1c" : "var(--ink-3)" }}
          >
            {briefText.length} / {MAX_BRIEF_CHARS}
          </span>
        </div>
      </div>

      {/* Mode (parser outcome with manual override) */}
      <ModeIndicator mode={form.loopMode} onChange={(m) => set({ loopMode: m })} />

      {/* D11 — Per-field italic serif label + hairline left-rail */}
      <EditorialField label="Companies" hint="Press Enter to add">
        <TagInput
          placeholder="e.g. Stripe, Linear, Vercel"
          list={form.companies}
          setList={(v) => set({ companies: v })}
          suggestions={COMPANY_SUGGESTIONS}
        />
      </EditorialField>

      <EditorialField label="Roles" hint="Press Enter to add">
        <TagInput
          placeholder="e.g. Product Designer, Analyst"
          list={form.roles}
          setList={(v) => set({ roles: v })}
          suggestions={ROLE_SUGGESTIONS}
        />
      </EditorialField>

      <EditorialField label="Industries" hint="Optional — fills in when no company is named">
        <TagInput
          placeholder="e.g. Fintech, AI / ML, Consulting"
          list={form.industries}
          setList={(v) => set({ industries: v })}
          suggestions={INDUSTRY_SUGGESTIONS}
        />
      </EditorialField>

      <EditorialField label="Locations" hint="Optional">
        <TagInput
          placeholder="e.g. NYC, SF Bay Area, Remote"
          list={form.locations}
          setList={(v) => set({ locations: v })}
          suggestions={LOCATION_SUGGESTIONS}
        />
      </EditorialField>

      <div className="flex items-center justify-between pt-4 border-t border-line-2">
        <div>
          <div className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
            {copy.preferAlumniLabel}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--ink-3)" }}>
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

function BigSlider({
  value,
  unit,
  min,
  max,
  step,
  onChange,
  ariaLabel,
}: {
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span
          className="text-[28px] leading-none"
          style={{ color: "var(--ink)", fontWeight: 500 }}
        >
          {value}
        </span>
        <span className="text-xs" style={{ color: "var(--ink-3)" }}>
          {unit}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-label={ariaLabel}
      />
      <div
        className="flex justify-between mt-1.5 font-mono text-[10.5px]"
        style={{ color: "var(--ink-3)" }}
      >
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function StepCadence({
  form,
  set,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
}) {
  return (
    <div>
      <Field label="Weekly contact target" hint="New contacts per week">
        <BigSlider
          value={form.weeklyTarget}
          unit="contacts / week"
          min={1}
          max={15}
          step={1}
          onChange={(v) => set({ weeklyTarget: v })}
          ariaLabel="Weekly contact target"
        />
      </Field>

      <Field label="Credit budget" hint="Max credits per week">
        <BigSlider
          value={form.creditBudget}
          unit="credits / week"
          min={10}
          max={150}
          step={10}
          onChange={(v) => set({ creditBudget: v })}
          ariaLabel="Credit budget per week"
        />
        {(() => {
          const estimated = form.weeklyTarget * CREDIT_COST_PER_CONTACT;
          const underfunded = form.creditBudget < estimated;
          return (
            <div
              className="text-xs mt-2"
              style={{ color: underfunded ? "#b91c1c" : "var(--ink-3)" }}
            >
              {underfunded
                ? `Budget too low: ${form.weeklyTarget} contacts/week needs ~${estimated} credits. Raise the budget or lower the target.`
                : `${form.weeklyTarget} contacts/week ≈ ${estimated} credits (each find + draft costs ${CREDIT_COST_PER_CONTACT}).`}
            </div>
          );
        })()}
      </Field>

      <Field label="Approval mode">
        <div className="grid grid-cols-2 gap-2.5">
          <ModeCard
            active={form.approvalMode === "review_first"}
            title="Review first"
            tag="recommended"
            desc="Agent drafts everything; nothing sends until you approve."
            onClick={() => set({ approvalMode: "review_first" })}
          />
          <ModeCard
            active={form.approvalMode === "autopilot"}
            title="Autopilot"
            desc="Agent sends approved templates automatically within your budget."
            onClick={() => set({ approvalMode: "autopilot" })}
          />
        </div>
      </Field>
    </div>
  );
}

function StepReview({ form, university }: { form: FormState; university: string }) {
  const rows: Array<{ k: string; v: string }> = [
    { k: "Companies", v: form.companies.length ? form.companies.join(", ") : "\u2014" },
    { k: "Roles", v: form.roles.length ? form.roles.join(", ") : "\u2014" },
    { k: "Weekly target", v: `${form.weeklyTarget} contacts / week` },
    { k: "Credit budget", v: `${form.creditBudget} credits / week` },
    { k: "Approval mode", v: form.approvalMode === "review_first" ? "Review first" : "Autopilot" },
    {
      k: "Alumni priority",
      v: form.preferAlumni ? (university ? `On \u2014 ${university}` : "On") : "Off",
    },
  ];

  return (
    <div>
      <div className="border border-line rounded-[10px] overflow-hidden bg-paper mb-4">
        {rows.map((r, i) => (
          <div
            key={r.k}
            className="grid grid-cols-[150px_1fr] text-[12.5px]"
            style={{
              padding: "11px 16px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--line-2)" : "none",
            }}
          >
            <span style={{ color: "var(--ink-3)" }}>{r.k}</span>
            <span className="font-medium" style={{ color: "var(--ink)" }}>
              {r.v}
            </span>
          </div>
        ))}
      </div>

      <div
        className="rounded-[10px] border border-line flex gap-3 items-start"
        style={{ background: "var(--paper-2)", padding: 14 }}
      >
        <span
          className="w-7 h-7 rounded-[9px] shrink-0 inline-flex items-center justify-center text-white text-[13px] font-semibold"
          style={{ background: "linear-gradient(135deg, #f5b945, #e08a2a)" }}
        >
          S
        </span>
        <div>
          <div className="text-[13px] font-semibold mb-0.5" style={{ color: "var(--ink)" }}>
            Scout will find contacts, watch for replies, and draft outreach.
          </div>
          <div className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
            New drafts show up here for review. Pause or reconfigure any time &mdash; settings save
            automatically.
          </div>
        </div>
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

  useEffect(() => {
    if (!user?.uid) return;
    firebaseApi
      .getUserOnboardingData(user.uid)
      .then((d) => setUniversity(d.university || ""))
      .catch(() => setUniversity(""));
  }, [user?.uid]);

  const [form, setForm] = useState<FormState>({
    companies: [],
    industries: [],
    roles: [],
    locations: [],
    preferAlumni: true,
    weeklyTarget: 5,
    creditBudget: 100,
    approvalMode: "review_first",
    // Default to "people" (today's networking behavior). For returning users,
    // the effect below queries their most recent Loop and re-defaults to that
    // Loop's mode — so a student whose last Loop was "roles" doesn't have to
    // re-pick every time. The parser still wins once the brief is typed.
    loopMode: "people",
  });
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // Default loopMode to the user's most recent Loop's mode. Fires once on
  // mount. If the user has no past Loops, the listLoops promise resolves
  // empty and the "people" default stands. Network or auth failures are
  // silently swallowed — better to keep the default than block the wizard.
  useEffect(() => {
    let cancelled = false;
    listLoops()
      .then(({ loops }) => {
        if (cancelled || !loops?.length) return;
        const mostRecent = [...loops].sort(
          (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
        )[0];
        const m = mostRecent?.loopMode;
        if (m === "people" || m === "roles" || m === "both") {
          setForm((f) => ({ ...f, loopMode: m }));
        }
      })
      .catch(() => { /* keep "people" default */ });
    return () => { cancelled = true; };
  }, []);

  // ── Prompt-first brief state ─────────────────────────────────────────
  // The textarea is the primary input on Step 01. Its value debounces into
  // a parser call (parseBrief) that fills mode + chip groups below. Chip
  // groups are editable — they reflect the latest parser result, but the
  // user can override. Subsequent textarea edits trigger re-parses that
  // overwrite chip groups (the wizard's chip behavior is "parser output
  // you can fine-tune, until you re-type the prompt").
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
        // ok — populate chips + mode from parser output. User edits made
        // after this point stick until the next parse fires.
        setForm((f) => {
          const next: Partial<FormState> = {
            companies: parsed?.companies ?? f.companies,
            industries: parsed?.industries ?? f.industries,
            roles: parsed?.roles ?? f.roles,
            locations: parsed?.locations ?? f.locations,
          };
          // Mode only auto-updates when the parser actually committed to one.
          // null = ambiguous → leave the user's current pick (or default).
          if (parsed?.mode === "people" || parsed?.mode === "roles" || parsed?.mode === "both") {
            next.loopMode = parsed.mode;
          }
          return { ...f, ...next };
        });
        setParsePhase("ok");
      })
      .catch(() => {
        if (token !== lastParseTokenRef.current) return;
        setParsePhase("failed");
      });
  }, [debouncedBriefText]);

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const estimatedWeeklyCredits = form.weeklyTarget * CREDIT_COST_PER_CONTACT;
  const budgetUnderfunded = form.creditBudget < estimatedWeeklyCredits;
  // Mode-aware copy for the Goals headline (and subtitle). Other steps stay
  // shared. school is the user's actual university when known so the alumni
  // toggle shows concrete language.
  const goalsCopy = loopCopy(form.loopMode, { school: university || "" });
  // Deploy when EITHER the textarea has real content OR the user filled in
  // chips manually. The two paths converge — buildSyntheticBrief covers the
  // chip-only case.
  const hasBrief = briefText.trim().length >= MIN_BRIEF_CHARS_TO_PARSE;
  const hasChipTargets = form.companies.length > 0 || form.industries.length > 0;
  const canDeploy = (hasBrief || hasChipTargets) && !budgetUnderfunded;

  const handleDeploy = async () => {
    if (!hasBrief && !hasChipTargets) {
      toast({
        title: "Add a goal",
        description: "Type your goal in the textbox or add at least one company / industry.",
        variant: "destructive",
      });
      return;
    }
    if (budgetUnderfunded) {
      toast({
        title: "Budget too low",
        description: `${form.weeklyTarget} contacts/week needs ~${estimatedWeeklyCredits} credits. Raise the budget or lower the target.`,
        variant: "destructive",
      });
      return;
    }
    setDeploying(true);
    try {
      // Two paths converge here: prompt-first (textarea filled, parser fired)
      // and chip-only (textarea empty, user added chips by hand). When the
      // textarea is empty we fall back to buildSyntheticBrief so the planner
      // still gets a <user_brief> block to anchor against.
      const finalBriefText = hasBrief
        ? briefText.trim()
        : buildSyntheticBrief({
            companies: form.companies,
            industries: form.industries,
            roles: form.roles,
            weeklyTarget: form.weeklyTarget,
            preferAlumni: form.preferAlumni,
          });

      // briefParsed reflects the user's CURRENT chip state (post-edits), not
      // the parser's raw output — chips are the source of truth at deploy.
      const finalBriefParsed: ParsedBrief = {
        companies: form.companies,
        industries: form.industries,
        roles: form.roles,
        locations: form.locations,
        emailPurpose: null,
        constraints: [],
        targetCount: form.weeklyTarget,
        mode: form.loopMode,
      };

      await updateAgentConfig({
        targetCompanies: form.companies,
        targetIndustries: form.industries,
        targetRoles: form.roles,
        // Don't send preferAlumni=true if the user has no university on file —
        // it would silently boost nothing. Gate to actual school presence.
        preferAlumni: hasUniversity && form.preferAlumni,
        weeklyContactTarget: form.weeklyTarget,
        creditBudgetPerWeek: form.creditBudget,
        approvalMode: form.approvalMode,
      });
      await deployAgent();

      // The Loops fleet view at /agent reads from a different collection
      // (users/{uid}/loops/*) than the legacy single-agent config above
      // (users/{uid}/settings/agent_config). Without this createLoop the
      // wizard "deploys" but no card ever shows up in the fleet view —
      // useCreateLoop invalidates the list query so /agent refetches.
      await createLoopMut.mutateAsync({
        briefText: finalBriefText,
        briefParsed: finalBriefParsed,
        name: deriveLoopName(form),
        reviewBeforeSend: form.approvalMode === "review_first",
        weeklyTarget: form.weeklyTarget,
        cadence: "weekly",
        creditBudgetPerWeek: form.creditBudget,
        automationEnabled: form.approvalMode === "autopilot",
        loopMode: form.loopMode,
      });

      toast({
        title: "Loop deployed!",
        description:
          form.loopMode === "both"
            ? "Your loop is chasing roles AND networking together."
            : form.loopMode === "roles"
              ? "Your job-search loop is now active."
              : "Your networking loop is now active.",
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
          {/* Hero */}
          <div className="mb-7">
            <MonoTag>&middot; step {step.num}</MonoTag>
            <h1
              className="font-serif mt-2.5 mb-2 text-[28px] sm:text-[32px] leading-[1.1] tracking-[-0.02em]"
              style={{ color: "var(--ink)", fontWeight: 400 }}
            >
              {stepIdx === 0 && (
                <>
                  Tell your Loop <em className="italic" style={{ fontWeight: 400 }}>{goalsCopy.goalsTitleAccent}</em> to chase.
                </>
              )}
              {stepIdx === 1 && (
                <>
                  Set the <em className="italic" style={{ fontWeight: 400 }}>pace</em> and the rules.
                </>
              )}
              {stepIdx === 2 && (
                <>
                  Look it over, then <em className="italic" style={{ fontWeight: 400 }}>deploy.</em>
                </>
              )}
            </h1>
            <p className="text-[13.5px] max-w-[470px]" style={{ color: "var(--ink-2)" }}>
              {stepIdx === 0 && goalsCopy.goalsSubtitle}
              {stepIdx === 1 &&
                "Caps the loop so it doesn't over-reach. We recommend Review First to start."}
              {stepIdx === 2 && "Deploying starts the first discovery cycle right away."}
            </p>
          </div>

          {/* Step rail */}
          <StepRail index={stepIdx} onJump={setStepIdx} />

          {/* Step body */}
          <div className="pt-7">
            {stepIdx === 0 && (
              <StepGoals
                form={form}
                set={set}
                briefText={briefText}
                setBriefText={setBriefText}
                parsePhase={parsePhase}
                hasUniversity={hasUniversity}
                university={university || ""}
              />
            )}
            {stepIdx === 1 && <StepCadence form={form} set={set} />}
            {stepIdx === 2 && <StepReview form={form} university={university || ""} />}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-7 pt-5 border-t border-line-2">
            <Button
              variant="outline"
              onClick={() => stepIdx > 0 && setStepIdx(stepIdx - 1)}
              disabled={stepIdx === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>

            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[11px] tracking-wide" style={{ color: "var(--ink-3)" }}>
                {stepIdx + 1} / {STEPS.length}
              </span>
              {isLast ? (
                <Button
                  onClick={handleDeploy}
                  disabled={!canDeploy || deploying}
                  className="bg-brand hover:bg-brand-2"
                >
                  {deploying ? (
                    <>
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-white"
                        style={{ animation: "om-blink 1s ease-in-out infinite" }}
                      />
                      Deploying...
                    </>
                  ) : (
                    <>Deploy agent &rarr;</>
                  )}
                </Button>
              ) : (
                <Button onClick={() => setStepIdx(stepIdx + 1)} className="bg-brand hover:bg-brand-2">
                  Continue &rarr;
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview rail */}
      <PreviewRail form={form} litTo={stepIdx === 0 ? 1 : stepIdx === 1 ? 3 : 6} />
    </div>
  );
}
