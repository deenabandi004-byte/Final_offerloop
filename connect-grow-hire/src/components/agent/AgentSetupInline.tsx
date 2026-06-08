// Inline agent setup wizard — 3-step flow with editorial headlines,
// step rail, tag inputs, and a live preview rail sidebar.
//
// PR1 update: Step 01 is textarea-first. The student types their goal in
// natural language; the parser turns it into mode + chips below. Chips
// stay editable so the parser is a starting point, not a black box.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronDown, ChevronRight } from "lucide-react";
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
import useDebounce from "@/hooks/use-debounce";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useProposedBrief, type UseProposedBriefState } from "@/hooks/useProposedBrief";
import { loopCopy, type LoopModeForCopy } from "@/lib/loopCopy";
import offerloopIcon from "@/assets/offerloopiconlogo.png";

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
  // Originally a mono-uppercase label. Restyled to the site's quieter Inter
  // small-caps recipe: still distinguishes meta from body, but doesn't read
  // like a terminal.
  return (
    <span
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.04em",
        color: color || "var(--ink-3)",
      }}
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
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 3,
        border: `1px solid ${hover ? "#4A60A8" : "var(--line)"}`,
        background: hover ? "rgba(74, 96, 168, 0.06)" : "#FFFFFF",
        color: hover ? "#4A60A8" : "var(--ink)",
        fontFamily: "'Inter', sans-serif",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.12s ease",
      }}
      title="Click to remove"
    >
      {label}
      <span style={{ fontSize: 11, opacity: hover ? 1 : 0.5, lineHeight: 1 }}>×</span>
    </span>
  );
}

function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 13,
        fontWeight: 500,
        padding: "4px 10px",
        borderRadius: 3,
        border: "1px solid var(--line)",
        background: "#FFFFFF",
        color: "var(--ink-2)",
        cursor: "pointer",
        transition: "border-color 0.12s, color 0.12s, background 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#4A60A8";
        e.currentTarget.style.color = "#4A60A8";
        e.currentTarget.style.background = "rgba(74, 96, 168, 0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--line)";
        e.currentTarget.style.color = "var(--ink-2)";
        e.currentTarget.style.background = "#FFFFFF";
      }}
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
        style={{
          borderRadius: 3,
          border: `1px solid ${focused ? "#4A60A8" : "var(--line)"}`,
          background: focused ? "#FFFFFF" : "var(--paper-2)",
          boxShadow: focused ? "0 0 0 3px rgba(74, 96, 168, 0.15)" : "none",
          padding: list.length > 0 ? "10px 12px 6px 12px" : "6px 12px",
          transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
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
            className="flex-1 border-none focus:outline-none placeholder:text-ink-3"
            style={{
              padding: 6,
              background: "transparent",
              color: "var(--ink)",
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
            }}
          />
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 500,
              color: "var(--ink-3)",
              opacity: val ? 1 : 0.6,
              flexShrink: 0,
              transition: "opacity 0.12s",
            }}
          >
            {val ? "press \u21b5" : `${list.length} added`}
          </span>
        </div>
      </div>

      {remaining.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
          <MonoTag>Suggested</MonoTag>
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
      <div className="flex items-baseline gap-2 mb-2">
        <Label
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          {label}
        </Label>
        {hint && (
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              color: "var(--ink-3)",
            }}
          >
            · {hint}
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
  badgeCount = 0,
  children,
}: {
  label: string;
  hint?: string;
  /** Items count shown as a small pill on the chevron row. Does NOT
   *  auto-expand — these rows stay collapsed until the user opens them.
   *  Their purpose is for inspecting what the parser extracted, not for
   *  surfacing chip-by-chip. */
  badgeCount?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: open ? "var(--paper-2)" : "#FFFFFF",
          border: "1px solid var(--line)",
          borderRadius: 3,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "'Inter', sans-serif",
          transition: "background 0.12s ease",
        }}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown style={{ width: 14, height: 14, color: "var(--ink-3)", flexShrink: 0 }} />
        ) : (
          <ChevronRight style={{ width: 14, height: 14, color: "var(--ink-3)", flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{label}</span>
        {badgeCount > 0 && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#4A60A8",
              background: "rgba(74, 96, 168, 0.10)",
              padding: "1px 7px",
              borderRadius: 100,
            }}
          >
            {badgeCount}
          </span>
        )}
        {hint && !open && (
          <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: "auto" }}>{hint}</span>
        )}
      </button>
      {open && (
        <div style={{ paddingTop: 10 }}>
          {hint && (
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: "var(--ink-3)",
                marginBottom: 8,
              }}
            >
              {hint}
            </div>
          )}
          {children}
        </div>
      )}
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
}: {
  index: number;
  onJump: (i: number) => void;
}) {
  return (
    <div
      className="grid grid-cols-3"
      style={{
        background: "var(--paper-2)",
        border: "1px solid var(--line)",
        borderRadius: 3,
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {STEPS.map((s, i) => {
        const active = i === index;
        const done = i < index;
        return (
          <button
            key={s.id}
            onClick={() => onJump(i)}
            className="relative text-left py-3.5 px-4 cursor-pointer border-0"
            style={{
              background: active ? "#FFFFFF" : "transparent",
              borderRight: i < STEPS.length - 1 ? "1px solid var(--line)" : "none",
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
                {done ? "\u2713" : s.num}
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

// ── Preview rail (right sidebar) ───────────────────────────────────────

function PreviewRail({ form, litTo }: { form: FormState; litTo: number }) {
  const traces = useMemo(() => buildPreviewTraces(form), [form]);

  return (
    <aside
      className="w-[300px] shrink-0 flex-col gap-4 hidden lg:flex"
      style={{
        borderLeft: "1px solid var(--line)",
        background: "var(--paper-2)",
        // Top padding pushes content below the floating "Ask Scout" pill that
        // anchors to the top-right of the app shell. Side/bottom kept tighter.
        padding: "84px 22px 28px 22px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div>
        <div className="flex items-center gap-2 mb-2">
          <PulseDot color="#4A60A8" />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#4A60A8",
            }}
          >
            Preview · not running
          </span>
        </div>
        <p
          style={{
            fontFamily: "'Libre Baskerville', Georgia, serif",
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            lineHeight: 1.25,
            color: "var(--heading, var(--ink))",
          }}
        >
          What your loop will do once deployed.
        </p>
      </div>

      <div
        className="relative overflow-hidden"
        style={{
          border: "1px solid var(--line)",
          borderRadius: 3,
          background: "#FFFFFF",
        }}
      >
        <span
          className="absolute left-0 right-0 top-0 h-[1.5px]"
          style={{
            background: "linear-gradient(90deg, transparent, #4A60A8, transparent)",
            animation: "om-scan 2.4s ease-in-out infinite",
          }}
        />
        <div
          className="flex items-center justify-between"
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--line-2)",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            Simulated trace
          </span>
          <ActivityBars />
        </div>
        {traces.map((t, i) => {
          const meta = KIND_META[t.kind];
          const on = i < litTo;
          return (
            <div
              key={i}
              className="transition-opacity duration-300"
              style={{
                padding: "10px 14px",
                borderBottom: i < traces.length - 1 ? "1px solid var(--line-2)" : "none",
                opacity: on ? 1 : 0.45,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-[6px] h-[6px] rounded-full"
                  style={{ background: meta.color }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "capitalize",
                    color: meta.color,
                  }}
                >
                  {meta.label}
                </span>
              </div>
              <div
                style={{
                  paddingLeft: 14,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: "var(--ink-2)",
                }}
              >
                {t.text}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="mt-auto"
        style={{
          borderTop: "1px solid var(--line)",
          paddingTop: 14,
          fontSize: 12,
          lineHeight: 1.5,
          color: "var(--ink-3)",
        }}
      >
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
  v2Enabled = false,
  briefLen = 0,
  extractCounts,
}: {
  phase: ParsePhase;
  detectedMode: LoopModeForCopy | null;
  v2Enabled?: boolean;
  briefLen?: number;
  extractCounts?: {
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
  // V2 status badge — design spec calls for an explicit "Found: X · Y · Z"
  // readout when the parse lands. Falls back to the V1 line when the flag
  // is off so existing tests + behavior don't shift on the control cohort.
  if (v2Enabled) {
    // Hide entirely below 10 chars — design spec: don't shame users who
    // just opened the page.
    if (briefLen < 10 && phase !== "parsing") {
      return null;
    }
    if (phase === "parsing") {
      return (
        <div className="flex items-center gap-2" style={baseStyle}>
          <PulseDot color="#4A60A8" />
          <span>Reading…</span>
        </div>
      );
    }
    const totalEntities = extractCounts
      ? extractCounts.companies +
        extractCounts.roles +
        extractCounts.industries +
        extractCounts.locations
      : 0;
    if ((phase === "ok" || phase === "empty") && totalEntities === 0) {
      return (
        <div style={{ ...baseStyle, color: "#b91c1c" }}>
          We didn't catch specific targets — try naming a company, role, or industry.
        </div>
      );
    }
    if (phase === "ok" && extractCounts) {
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
  if (phase === "parsing") {
    return (
      <div className="flex items-center gap-2" style={baseStyle}>
        <PulseDot color="#4A60A8" />
        <span>Reading your goal…</span>
      </div>
    );
  }
  if (phase === "failed") {
    return (
      <div style={{ ...baseStyle, color: "#b91c1c" }}>
        Couldn't read that — chips left blank. You can add them by hand or rephrase.
      </div>
    );
  }
  if (phase === "ok" && detectedMode) {
    const summary = loopCopy(detectedMode).modeSummary;
    return (
      <div style={baseStyle}>
        Read as <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>{summary}</span> · chips below are the parsed targets.
      </div>
    );
  }
  if (phase === "ok") {
    return (
      <div style={baseStyle}>
        Mode looks ambiguous — pick one below, or add more detail above.
      </div>
    );
  }
  if (phase === "empty" || phase === "idle") {
    return (
      <div style={baseStyle}>
        Type a sentence or two above — parser fills in the chips. Or skip and edit chips directly.
      </div>
    );
  }
  return null;
}

// ── Mode indicator with manual override ────────────────────────────────
// Foundation showed mode as a two-card radio. PR1 makes mode a parser
// outcome with a small inline override link so the chip rows stay the
// star of Step 01.

function ModeIndicator({
  mode,
  onChange,
}: {
  mode: LoopModeForCopy;
  onChange: (m: LoopModeForCopy) => void;
}) {
  const opts: { key: LoopModeForCopy; label: string }[] = [
    { key: "people", label: "people" },
    { key: "roles", label: "roles" },
    { key: "both", label: "both" },
  ];
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-2">
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          Mode
        </span>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: "var(--ink-3)",
          }}
        >
          · what's this Loop chasing?
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label="Loop mode"
        className="inline-flex overflow-hidden"
        style={{ border: "1px solid var(--line)", borderRadius: 3, background: "#FFFFFF" }}
      >
        {opts.map((o, i) => {
          const active = mode === o.key;
          return (
            <button
              key={o.key}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.key)}
              className="transition-colors"
              style={{
                padding: "6px 14px",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                textTransform: "capitalize",
                background: active ? "#4A60A8" : "transparent",
                color: active ? "#FFFFFF" : "var(--ink-2)",
                borderLeft: i > 0 ? "1px solid var(--line)" : "none",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
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
  v2Enabled = false,
  proposedBrief,
  showAiDraftLabel = false,
  onManualChipEdit,
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
  v2Enabled?: boolean;
  proposedBrief?: UseProposedBriefState;
  showAiDraftLabel?: boolean;
  onManualChipEdit?: (
    cat: "companies" | "roles" | "industries" | "locations",
  ) => void;
}) {
  // V2 sync rule: explicit edits to a chip row mark that category dirty so
  // subsequent textarea parses don't clobber the user's choice. No-op when
  // the flag is off (the prop is undefined on V1 cohort).
  const editChips = (
    cat: "companies" | "roles" | "industries" | "locations",
    next: string[],
  ) => {
    set({ [cat]: next } as Partial<FormState>);
    if (v2Enabled) onManualChipEdit?.(cat);
  };
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

  // V2: "Suggest from my profile" header row (above the textarea card).
  // Only renders when LOOPS_SETUP_V2 is on AND the user has either a
  // landed proposal or a pending fetch. Falls back gracefully when the
  // proposer returns "failed" — the button text becomes a retry.
  const v2HasProposal = !!proposedBrief?.data && proposedBrief.data.status === "ok";
  const v2ProposalLoading = !!proposedBrief?.loading;
  const v2ProposalFailed = !!proposedBrief?.error
    || proposedBrief?.data?.status === "failed";
  const v2SuggestLabel = v2ProposalLoading
    ? "Suggesting…"
    : v2ProposalFailed
      ? "Try again"
      : v2HasProposal
        ? "✨ Re-suggest"
        : "✨ Suggest from my profile";

  return (
    <div>
      {/* V2: Suggest-from-profile button — sits above the textarea per the
          design specs. Hidden entirely when the flag is off. */}
      {v2Enabled && proposedBrief && (
        <div
          className="mb-2 flex items-center justify-end"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          <button
            type="button"
            onClick={() => {
              void proposedBrief.refetch();
            }}
            disabled={v2ProposalLoading}
            aria-label="Suggest a brief from my profile"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: v2ProposalLoading ? "var(--ink-3)" : "var(--ink-2)",
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: 999,
              padding: "5px 12px",
              cursor: v2ProposalLoading ? "default" : "pointer",
              transition: "color 0.15s ease, border-color 0.15s ease",
            }}
          >
            {v2SuggestLabel}
          </button>
        </div>
      )}

      {/* V2: small "AI draft" label, visible only while the textarea still
          holds the AI-proposed sentence (drops to false on first user
          keystroke via the parent's wrapped setBriefText). */}
      {v2Enabled && showAiDraftLabel && (
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
              detectedMode={parsePhase === "ok" ? form.loopMode : null}
              v2Enabled={v2Enabled}
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

      {/* Mode (parser outcome with manual override) */}
      <ModeIndicator mode={form.loopMode} onChange={(m) => set({ loopMode: m })} />

      {/* Collapsible chip rows. The textarea + parser are the primary input;
          these rows are advanced/manual overrides. Each row auto-expands when
          the parser fills it so the user sees what was extracted. */}
      <div style={{ marginTop: 18, marginBottom: 18 }}>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            marginBottom: 10,
          }}
        >
          Manual targeting (optional)
        </div>
        <EditorialField label="Companies" hint="Press Enter to add" badgeCount={form.companies.length}>
          <TagInput
            placeholder="e.g. Stripe, Linear, Vercel"
            list={form.companies}
            setList={(v) => editChips("companies", v)}
            suggestions={COMPANY_SUGGESTIONS}
          />
        </EditorialField>

        <EditorialField label="Roles" hint="Press Enter to add" badgeCount={form.roles.length}>
          <TagInput
            placeholder="e.g. Product Designer, Analyst"
            list={form.roles}
            setList={(v) => editChips("roles", v)}
            suggestions={ROLE_SUGGESTIONS}
          />
        </EditorialField>

        <EditorialField
          label="Industries"
          hint="Optional — fills in when no company is named"
          badgeCount={form.industries.length}
        >
          <TagInput
            placeholder="e.g. Fintech, AI / ML, Consulting"
            list={form.industries}
            setList={(v) => editChips("industries", v)}
            suggestions={INDUSTRY_SUGGESTIONS}
          />
        </EditorialField>

        <EditorialField label="Locations" hint="Optional" badgeCount={form.locations.length}>
          <TagInput
            placeholder="e.g. NYC, SF Bay Area, Remote"
            list={form.locations}
            setList={(v) => editChips("locations", v)}
            suggestions={LOCATION_SUGGESTIONS}
          />
        </EditorialField>
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
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1,
            color: "#4A60A8",
          }}
        >
          {value}
        </span>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: "var(--ink-3)",
          }}
        >
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
        className="flex justify-between mt-2"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 500,
          color: "var(--ink-3)",
        }}
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
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <div
        className="overflow-hidden mb-4"
        style={{
          border: "1px solid var(--line)",
          borderRadius: 3,
          background: "#FFFFFF",
        }}
      >
        {rows.map((r, i) => (
          <div
            key={r.k}
            className="grid grid-cols-[150px_1fr]"
            style={{
              padding: "12px 18px",
              fontSize: 13,
              borderBottom: i < rows.length - 1 ? "1px solid var(--line-2)" : "none",
            }}
          >
            <span style={{ color: "var(--ink-3)" }}>{r.k}</span>
            <span style={{ color: "var(--ink)", fontWeight: 500 }}>
              {r.v}
            </span>
          </div>
        ))}
      </div>

      <div
        className="flex gap-3 items-start"
        style={{
          border: "1px solid rgba(74, 96, 168, 0.18)",
          background: "rgba(74, 96, 168, 0.04)",
          borderRadius: 3,
          padding: 16,
        }}
      >
        <span
          className="w-7 h-7 shrink-0 inline-flex items-center justify-center"
          style={{ background: "transparent" }}
        >
          <img
            src={offerloopIcon}
            alt="Offerloop"
            className="w-full h-full object-contain"
          />
        </span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: "var(--ink)" }}>
            Loop will find contacts, watch for replies, and draft outreach.
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-2)" }}>
            New drafts show up here for review. Pause or reconfigure any time — settings save automatically.
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
    weeklyTarget: 5,
    creditBudget: 100,
    approvalMode: "review_first",
    // Default to "people" (today's networking behavior) for new users. When
    // we later derive the default from the user's most recent Loop, swap this
    // initializer for an effect that fetches the latest Loop's mode.
    loopMode: "people",
  });
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // ── V2 wizard: AI-proposed starting brief (LOOPS_SETUP_V2) ──────────────
  // Flagged off by default. When on, fetch a Claude-drafted brief on mount
  // and pre-fill the textarea + chips ONCE so students never face a blank
  // page. User edits beat AI; we never overwrite anything the user typed.
  const loopsSetupV2 = useFeatureFlag("LOOPS_SETUP_V2");
  const proposedBrief = useProposedBrief({ enabled: loopsSetupV2 });
  const aiDraftAppliedRef = useRef(false);

  // V2 sync rule (carried over from the plan's locked architecture decision):
  // chips are derived from the textarea while typing; once a chip is manually
  // added or removed, that category becomes source of truth and subsequent
  // parses no longer touch it. Tracked per-category so editing Companies
  // doesn't freeze Roles too. AI propose (step 3) does NOT mark categories
  // dirty — only explicit user edits do.
  type ChipCategory = "companies" | "roles" | "industries" | "locations";
  const [chipDirty, setChipDirty] = useState<Record<ChipCategory, boolean>>({
    companies: false,
    roles: false,
    industries: false,
    locations: false,
  });
  const markChipDirty = useCallback((cat: ChipCategory) => {
    setChipDirty((d) => (d[cat] ? d : { ...d, [cat]: true }));
  }, []);
  // Mirror chipDirty into a ref so the parse-effect can read the freshest
  // value even when its closure was set up before a category went dirty.
  // Without this, a parse in flight when the user adds a chip would still
  // overwrite that category on its return.
  const chipDirtyRef = useRef(chipDirty);
  useEffect(() => {
    chipDirtyRef.current = chipDirty;
  }, [chipDirty]);

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
        //
        // V2 sync rule: any chip category the user manually edited stays
        // sticky — the parse cannot overwrite it. V1 (flag off) keeps
        // today's "parser always wins on chip categories" behavior.
        const dirty = chipDirtyRef.current;
        setForm((f) => {
          const next: Partial<FormState> = {
            companies:
              loopsSetupV2 && dirty.companies
                ? f.companies
                : parsed?.companies ?? f.companies,
            industries:
              loopsSetupV2 && dirty.industries
                ? f.industries
                : parsed?.industries ?? f.industries,
            roles:
              loopsSetupV2 && dirty.roles ? f.roles : parsed?.roles ?? f.roles,
            locations:
              loopsSetupV2 && dirty.locations
                ? f.locations
                : parsed?.locations ?? f.locations,
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

  // V2: apply the AI-proposed brief once, only if the user hasn't already
  // started typing or picking chips. Prevents the proposal from clobbering
  // an in-progress edit if Claude lands a slow response.
  const [aiDraftActive, setAiDraftActive] = useState(false);
  useEffect(() => {
    if (!loopsSetupV2) return;
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
    loopsSetupV2,
    proposedBrief.data,
    briefText,
    form.companies.length,
    form.roles.length,
    form.industries.length,
    form.locations.length,
  ]);

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
                  Set the <span style={{ fontStyle: "italic", color: "#4A60A8" }}>pace</span> and the rules.
                </>
              )}
              {stepIdx === 2 && (
                <>
                  Look it over, then{" "}
                  <span style={{ fontStyle: "italic", color: "#4A60A8" }}>deploy.</span>
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
                setBriefText={(v) => {
                  if (aiDraftActive && v !== briefText) setAiDraftActive(false);
                  setBriefText(v);
                }}
                parsePhase={parsePhase}
                hasUniversity={hasUniversity}
                university={university || ""}
                profileFacts={profileFacts}
                v2Enabled={loopsSetupV2}
                proposedBrief={proposedBrief}
                showAiDraftLabel={aiDraftActive}
                onManualChipEdit={markChipDirty}
              />
            )}
            {stepIdx === 1 && <StepCadence form={form} set={set} />}
            {stepIdx === 2 && <StepReview form={form} university={university || ""} />}
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
                {stepIdx + 1} / {STEPS.length}
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
                      Deploying…
                    </>
                  ) : (
                    <>Deploy agent →</>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStepIdx(stepIdx + 1)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#FFFFFF",
                    background: "#4A60A8",
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#3A4F8E")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#4A60A8")}
                >
                  Continue →
                </button>
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
