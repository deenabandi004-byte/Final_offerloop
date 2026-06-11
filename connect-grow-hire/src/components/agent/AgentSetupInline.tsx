// Inline agent setup wizard. 2-screen flow: Configure (brief, mode,
// alumni, cadence, approval mode) then Review.
//
// The textarea is the primary input. The parser turns it into mode +
// targeting under the hood. Manual chip editing and the live preview
// rail were removed; targeting comes entirely from the parser.

import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateAgentConfig, deployAgent, parseBrief, type ParsedBrief } from "@/services/agent";
import { firebaseApi } from "@/services/firebaseApi";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useCreateLoop } from "@/hooks/useLoops";
import useDebounce from "@/hooks/use-debounce";
import { loopCopy, type LoopModeForCopy } from "@/lib/loopCopy";

// ── Constants ──────────────────────────────────────────────────────────

// Soft cap on the textarea. Backend MAX_BRIEF_CHARS is 2000; we soft-warn
// at the same number so users see the cap before the parser truncates.
const MAX_BRIEF_CHARS = 2000;
// 600ms debounce on the textarea parse (PR1 plan D10 spec).
const BRIEF_PARSE_DEBOUNCE_MS = 600;
// Below this length the textarea is too thin to be worth parsing, saves
// OpenAI calls on the user's first few keystrokes.
const MIN_BRIEF_CHARS_TO_PARSE = 8;

// Derive a human-readable Loop name from the parsed brief. Mirrors how the
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

// ── Step bodies ────────────────────────────────────────────────────────

interface FormState {
  companies: string[];
  industries: string[];
  roles: string[];
  locations: string[];
  // Defaults to false. Yes/no question, university-gated.
  preferAlumni: boolean;
  // Cadence: turn the schedule on/off, pick daily vs weekly, and how
  // many contacts and/or roles per cycle. The unit (per day vs per
  // week) on the sliders follows cadenceFrequency.
  cadenceEnabled: boolean;
  cadenceFrequency: "weekly" | "daily";
  contactsTarget: number;
  rolesTarget: number;
  approvalMode: "review_first" | "autopilot";
  loopMode: LoopModeForCopy;
}

// Pricing: 5 credits per contact found + drafted, 2 credits per role
// surfaced. Used by the live projected cost line in StepCadence and by
// the deploy payload (creditBudgetPerWeek = projected weekly spend).
const CREDIT_COST_PER_CONTACT = 5;
const CREDIT_COST_PER_ROLE = 2;

type ParsePhase = "idle" | "parsing" | "ok" | "empty" | "failed";

// ── Parse status line (below the textarea) ─────────────────────────────

function ParseStatusLine({
  phase,
  detectedMode,
}: {
  phase: ParsePhase;
  detectedMode: LoopModeForCopy | null;
}) {
  const baseStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: "var(--ink-3)",
    marginTop: 8,
  };
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
        Couldn't read that. You can rephrase or add more detail.
      </div>
    );
  }
  if (phase === "ok" && detectedMode) {
    const summary = loopCopy(detectedMode).modeSummary;
    return (
      <div style={baseStyle}>
        Read as <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>{summary}</span>.
      </div>
    );
  }
  if (phase === "ok") {
    return (
      <div style={baseStyle}>
        Mode looks ambiguous. Pick one below, or add more detail above.
      </div>
    );
  }
  if (phase === "empty" || phase === "idle") {
    return (
      <div style={baseStyle}>
        Type a sentence or two above. The parser fills in the rest.
      </div>
    );
  }
  return null;
}

// ── Mode indicator with manual override ────────────────────────────────
// Mode is the parser's classification of the brief, with a manual override
// so the user can correct it without re-typing.

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
}) {
  const overLimit = briefText.length > MAX_BRIEF_CHARS;
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Goal-oriented prompts. Loops are persistent, so the textarea reads more
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

  return (
    <div>
      {/* Brief textarea: Find-page-style hero prompt with typewriter
          placeholder. */}
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
        <div
          style={{
            textAlign: "center",
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: "var(--ink-3)",
            marginTop: 8,
          }}
        >
          The more detailed the better.
        </div>
      </div>

      {/* Mode (parser outcome with manual override) */}
      <ModeIndicator mode={form.loopMode} onChange={(m) => set({ loopMode: m })} />

      {/* Alumni: yes/no question, defaults OFF. University-gated:
          disabled and gray when the user has no school on file. The old
          mode-aware label ("Prefer alumni" / "Prefer warm angles") is
          gone; the question is now fixed. */}
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
            Do you want us to target alumni?
          </div>
          <div style={{ fontSize: 12.5, marginTop: 2, color: "var(--ink-3)" }}>
            {hasUniversity
              ? `We'll prioritize alumni from ${university}.`
              : "Set your university in Account Settings to use this."}
          </div>
        </div>
        <Switch
          checked={hasUniversity && form.preferAlumni}
          disabled={!hasUniversity}
          onCheckedChange={(v) => set({ preferAlumni: v })}
          aria-label="Target alumni"
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

// Cadence: "Cadence?" header + explainer + on/off Switch. When on,
// reveals a Weekly/Daily segmented control and mode-driven sliders
// (contacts for people, roles for roles, both in both mode). The slider
// unit and the projected cost line both follow the picked frequency.
// Pricing is fixed: 5 credits per contact, 2 credits per role.
function StepCadence({
  form,
  set,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
}) {
  const unit = form.cadenceFrequency === "daily" ? "day" : "week";
  const showContacts = form.loopMode === "people" || form.loopMode === "both";
  const showRoles = form.loopMode === "roles" || form.loopMode === "both";
  const contactsCost = showContacts ? form.contactsTarget * CREDIT_COST_PER_CONTACT : 0;
  const rolesCost = showRoles ? form.rolesTarget * CREDIT_COST_PER_ROLE : 0;
  const projectedCost = contactsCost + rolesCost;

  return (
    <div className="mb-7">
      <h3
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 32,
          fontWeight: 400,
          letterSpacing: "-0.01em",
          color: "#0f2545",
          marginBottom: 6,
        }}
      >
        Cadence?
      </h3>
      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--ink-3)",
          marginBottom: 14,
          maxWidth: 520,
        }}
      >
        Cadence wakes your Loop up so it works for you on a schedule, daily or weekly.
      </p>
      <div className="flex items-center gap-3 mb-2" style={{ fontFamily: "'Inter', sans-serif" }}>
        <Switch
          checked={form.cadenceEnabled}
          onCheckedChange={(v) => set({ cadenceEnabled: v })}
          aria-label="Run on a cadence"
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: form.cadenceEnabled ? "var(--ink)" : "var(--ink-3)",
          }}
        >
          {form.cadenceEnabled ? "On" : "Off"}
        </span>
      </div>

      {form.cadenceEnabled && (
        <div
          style={{
            marginTop: 18,
            padding: "18px 18px 20px 18px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "var(--paper-2)",
          }}
        >
          {/* Frequency: Weekly | Daily segmented control. Default Weekly. */}
          <div className="mb-5">
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ink)",
                marginBottom: 8,
              }}
            >
              Frequency
            </div>
            <div
              role="radiogroup"
              aria-label="Cadence frequency"
              className="inline-flex overflow-hidden"
              style={{
                border: "1px solid var(--line)",
                borderRadius: 3,
                background: "#FFFFFF",
              }}
            >
              {(["weekly", "daily"] as const).map((freq, i) => {
                const active = form.cadenceFrequency === freq;
                return (
                  <button
                    key={freq}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set({ cadenceFrequency: freq })}
                    className="transition-colors"
                    style={{
                      padding: "6px 16px",
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      fontWeight: 500,
                      background: active ? "#4A60A8" : "transparent",
                      color: active ? "#FFFFFF" : "var(--ink-2)",
                      borderLeft: i > 0 ? "1px solid var(--line)" : "none",
                      cursor: "pointer",
                    }}
                  >
                    {freq === "weekly" ? "Weekly" : "Daily"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sliders. Mode-driven: people = contacts only, roles =
              roles only, both = both, each with its own count. Unit
              text on each slider follows the selected frequency. */}
          {showContacts && (
            <div className="mb-5">
              <BigSlider
                value={form.contactsTarget}
                unit={`contacts per ${unit}`}
                min={1}
                max={15}
                step={1}
                onChange={(v) => set({ contactsTarget: v })}
                ariaLabel={`Contacts per ${unit}`}
              />
            </div>
          )}
          {showRoles && (
            <div className="mb-5">
              <BigSlider
                value={form.rolesTarget}
                unit={`roles per ${unit}`}
                min={1}
                max={10}
                step={1}
                onChange={(v) => set({ rolesTarget: v })}
                ariaLabel={`Roles per ${unit}`}
              />
            </div>
          )}

          {/* Live projected cost line. Computed from the new pricing
              (5 per contact, 2 per role), in the unit of the chosen
              cadence frequency. No budget input, no cap: this is the
              actual spend the user is committing to per cycle. */}
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: "var(--ink-2)",
              lineHeight: 1.5,
            }}
          >
            {form.loopMode === "people" && (
              <>
                {form.contactsTarget} contacts × {CREDIT_COST_PER_CONTACT} ={" "}
              </>
            )}
            {form.loopMode === "roles" && (
              <>
                {form.rolesTarget} roles × {CREDIT_COST_PER_ROLE} ={" "}
              </>
            )}
            {form.loopMode === "both" && (
              <>
                ({form.contactsTarget} × {CREDIT_COST_PER_CONTACT}) + ({form.rolesTarget} × {CREDIT_COST_PER_ROLE}) ={" "}
              </>
            )}
            <strong style={{ color: "var(--ink)" }}>
              {projectedCost} credits per {unit}
            </strong>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
              {CREDIT_COST_PER_CONTACT} credits per person, {CREDIT_COST_PER_ROLE} credits per role.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Review mode: two side-by-side buttons that pick how drafts go out.
// Sits directly under the cadence section in the main render. Active
// state uses the same dark blue (#1e3a8a) as the "Loop" word and the
// Continue button below, so the page reads as one color hierarchy:
// brand blue for accents (squiggle, mode pills), dark blue for the
// primary identity (hero word, primary choices, primary CTA).
function ApprovalButton({
  active,
  title,
  desc,
  recommended,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  recommended?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "16px 18px",
        borderRadius: 12,
        border: `1px solid ${active ? "#1e3a8a" : hovered ? "#1e3a8a" : "var(--line)"}`,
        background: active
          ? "#1e3a8a"
          : hovered
            ? "rgba(30, 58, 138, 0.04)"
            : "#FFFFFF",
        color: active ? "#FFFFFF" : "var(--ink)",
        textAlign: "left",
        fontFamily: "'Inter', sans-serif",
        cursor: "pointer",
        transition: "all 0.15s ease",
        boxShadow: active ? "0 0 0 3px rgba(30, 58, 138, 0.12)" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
        {recommended && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: active ? "#FFFFFF" : "#1e3a8a",
              background: active
                ? "rgba(255, 255, 255, 0.18)"
                : "rgba(30, 58, 138, 0.10)",
              padding: "2px 8px",
              borderRadius: 100,
            }}
          >
            recommended
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: active ? "rgba(255, 255, 255, 0.88)" : "var(--ink-2)",
        }}
      >
        {desc}
      </div>
    </button>
  );
}

function StepReviewMode({
  form,
  set,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
}) {
  return (
    <div className="mb-7">
      <div className="grid grid-cols-2 gap-3">
        <ApprovalButton
          active={form.approvalMode === "review_first"}
          title="Review first"
          recommended
          desc="We draft everything. Nothing sends until you approve."
          onClick={() => set({ approvalMode: "review_first" })}
        />
        <ApprovalButton
          active={form.approvalMode === "autopilot"}
          title="Autopilot"
          desc="We send drafts automatically as the Loop finds matches."
          onClick={() => set({ approvalMode: "autopilot" })}
        />
      </div>
    </div>
  );
}

// Wide, bold-white-on-dark-blue, pill-rounded primary CTA. Used by
// Continue on screen 1 and (in Chunk 5) Run Loop on screen 2. Disabled
// state desaturates to the muted ink color and disables hover.
function WidePillButton({
  label,
  onClick,
  disabled = false,
  loading = false,
  loadingLabel,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}) {
  const isInactive = disabled || loading;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isInactive}
      style={{
        width: "100%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "16px 24px",
        fontFamily: "'Inter', sans-serif",
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: "0.01em",
        color: "#FFFFFF",
        background: isInactive ? "var(--ink-3)" : "#1e3a8a",
        border: "none",
        borderRadius: 999,
        cursor: isInactive ? "not-allowed" : "pointer",
        transition: "background 0.15s ease",
      }}
      onMouseEnter={(e) => {
        if (!isInactive) e.currentTarget.style.background = "#15306b";
      }}
      onMouseLeave={(e) => {
        if (!isInactive) e.currentTarget.style.background = "#1e3a8a";
      }}
    >
      {loading ? (
        <>
          <span
            className="w-1.5 h-1.5 rounded-full bg-white"
            style={{ animation: "om-blink 1s ease-in-out infinite" }}
          />
          {loadingLabel || `${label}…`}
        </>
      ) : (
        label
      )}
    </button>
  );
}

// Screen 2: review and deploy. StepReview owns the entire screen (back
// link, hero, brief block, settings recap, static preview table, Run
// Loop CTA). No fresh search runs here. The preview table is sourced
// from the cached parser output (form.companies/roles/industries/
// locations populated by parseBrief on screen 1). The first paid PDL +
// LLM cycle is queued only when Run Loop is clicked.
function StepReview({
  form,
  university,
  briefText,
  canDeploy,
  deploying,
  onBack,
  onDeploy,
}: {
  form: FormState;
  university: string;
  briefText: string;
  canDeploy: boolean;
  deploying: boolean;
  onBack: () => void;
  onDeploy: () => void;
}) {
  const unit = form.cadenceFrequency === "daily" ? "day" : "week";
  const showContacts = form.loopMode === "people" || form.loopMode === "both";
  const showRoles = form.loopMode === "roles" || form.loopMode === "both";
  const perCycleContacts = showContacts ? form.contactsTarget : 0;
  const perCycleRoles = showRoles ? form.rolesTarget : 0;
  const perCycleCost =
    perCycleContacts * CREDIT_COST_PER_CONTACT +
    perCycleRoles * CREDIT_COST_PER_ROLE;

  const cadenceStr = form.cadenceEnabled
    ? form.cadenceFrequency === "daily" ? "Daily" : "Weekly"
    : "Manual (off)";

  const targetBits: string[] = [];
  if (showContacts) targetBits.push(`${form.contactsTarget} contacts per ${unit}`);
  if (showRoles) targetBits.push(`${form.rolesTarget} roles per ${unit}`);
  const targetStr = targetBits.length ? targetBits.join(", ") : "-";

  const modeLabel =
    form.loopMode === "people" ? "People" : form.loopMode === "roles" ? "Roles" : "Both";

  const rows: Array<{ k: string; v: string }> = [
    { k: "Mode", v: modeLabel },
    { k: "Schedule", v: cadenceStr },
    { k: "Target", v: targetStr },
    {
      k: "Review mode",
      v: form.approvalMode === "review_first" ? "Review first" : "Autopilot",
    },
    {
      k: "Alumni",
      v: form.preferAlumni ? (university ? `On (${university})` : "On") : "Off",
    },
    {
      k: "Projected cost",
      v: form.cadenceEnabled
        ? `${perCycleCost} credits per ${unit}`
        : `${perCycleCost} credits per manual run`,
    },
  ];

  // Static preview: one row per parsed target. Purely a read of state
  // populated by the parseBrief call on screen 1. If the parser found
  // nothing (all four arrays empty), the whole table is omitted, per
  // the Chunk 0 resolution.
  type PreviewRow = { type: string; value: string };
  const previewRows: PreviewRow[] = [
    ...form.companies.map<PreviewRow>((c) => ({ type: "Company", value: c })),
    ...form.roles.map<PreviewRow>((r) => ({ type: "Role", value: r })),
    ...form.industries.map<PreviewRow>((i) => ({ type: "Industry", value: i })),
    ...form.locations.map<PreviewRow>((l) => ({ type: "Location", value: l })),
  ];
  const hasPreview = previewRows.length > 0;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Small back link at the top. Kept inline (not in a bottom nav
          row) so the wide Run Loop CTA at the bottom has the page to
          itself. */}
      <div style={{ paddingTop: 24, marginBottom: 4 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ink-2)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-2)")}
        >
          <ChevronLeft style={{ width: 14, height: 14 }} />
          Back to setup
        </button>
      </div>

      {/* Hero */}
      <div className="mb-8" style={{ paddingTop: 8 }}>
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
          Look it over, then{" "}
          <span style={{ fontStyle: "italic", color: "#1e3a8a" }}>deploy.</span>
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
          Deploying starts the first discovery cycle right away. The first paid
          search runs on Run Loop, not on this screen.
        </p>
      </div>

      {/* Brief block */}
      <div
        className="mb-4"
        style={{
          border: "1px solid var(--line)",
          borderRadius: 8,
          background: "#FFFFFF",
          padding: "14px 18px",
        }}
      >
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            marginBottom: 6,
          }}
        >
          Your brief
        </div>
        <div
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: "italic",
            fontSize: 17,
            lineHeight: 1.5,
            color: "var(--ink)",
            whiteSpace: "pre-wrap",
          }}
        >
          {briefText.trim() || "(none)"}
        </div>
      </div>

      {/* Settings recap (key/value rows). Targeting fields are not in
          this table to avoid duplication with the preview table below. */}
      <div
        className="mb-5 overflow-hidden"
        style={{
          border: "1px solid var(--line)",
          borderRadius: 8,
          background: "#FFFFFF",
        }}
      >
        {rows.map((r, i) => (
          <div
            key={r.k}
            className="grid grid-cols-[160px_1fr]"
            style={{
              padding: "12px 18px",
              fontSize: 13,
              borderBottom: i < rows.length - 1 ? "1px solid var(--line-2)" : "none",
            }}
          >
            <span style={{ color: "var(--ink-3)" }}>{r.k}</span>
            <span style={{ color: "var(--ink)", fontWeight: 500 }}>{r.v}</span>
          </div>
        ))}
      </div>

      {/* Static preview table from the parsed targeting buckets. NOT a
          live search: no PDL hit, no credit spend. The first paid run
          happens when the user clicks Run Loop. */}
      {hasPreview && (
        <div className="mb-6">
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              marginBottom: 6,
            }}
          >
            What this Loop will search
          </div>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "var(--ink-3)",
              marginBottom: 10,
            }}
          >
            Targeting buckets parsed from your brief. Real names appear once the
            Loop runs.
          </p>
          <div
            className="overflow-hidden"
            style={{
              border: "1px solid var(--line)",
              borderRadius: 8,
              background: "#FFFFFF",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: "var(--paper-2)" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 18px",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "var(--ink-3)",
                      borderBottom: "1px solid var(--line-2)",
                      width: 140,
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 18px",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "var(--ink-3)",
                      borderBottom: "1px solid var(--line-2)",
                    }}
                  >
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={`${r.type}-${r.value}-${i}`}>
                    <td
                      style={{
                        padding: "10px 18px",
                        color: "var(--ink-2)",
                        borderBottom:
                          i < previewRows.length - 1
                            ? "1px solid var(--line-2)"
                            : "none",
                      }}
                    >
                      {r.type}
                    </td>
                    <td
                      style={{
                        padding: "10px 18px",
                        color: "var(--ink)",
                        fontWeight: 500,
                        borderBottom:
                          i < previewRows.length - 1
                            ? "1px solid var(--line-2)"
                            : "none",
                      }}
                    >
                      {r.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Wide pill Run Loop button. Same primitive as Continue on
          screen 1. This is where the first paid cycle is queued. */}
      <div style={{ marginTop: hasPreview ? 8 : 16 }}>
        <WidePillButton
          label="Run Loop"
          disabled={!canDeploy}
          loading={deploying}
          loadingLabel="Starting Loop…"
          onClick={onDeploy}
        />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function AgentSetupInline({ onDeployed }: { onDeployed: () => void }) {
  const { toast } = useToast();
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const createLoopMut = useCreateLoop();
  const [stepIdx, setStepIdx] = useState(0);
  const [deploying, setDeploying] = useState(false);
  // null = still loading, "" = onboarded but no school, "USC" = set.
  const [university, setUniversity] = useState<string | null>(null);
  const hasUniversity = !!(university && university.trim());
  // Profile facts powering the rotating placeholder examples in the brief
  // textarea. Mirrors what ContactSearchPage feeds the Find prompt.
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
    // Alumni: default OFF. User has to opt in by answering the yes/no
    // question. Was true under the old "Prefer alumni" framing.
    preferAlumni: false,
    // Cadence: default ON, weekly. Most users want automation; they can
    // flip the toggle off for a one-shot manual run.
    cadenceEnabled: true,
    cadenceFrequency: "weekly",
    contactsTarget: 5,
    rolesTarget: 3,
    approvalMode: "review_first",
    // Default to "people" (today's networking behavior) for new users.
    loopMode: "people",
  });
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // ── Prompt-first brief state ─────────────────────────────────────────
  // The textarea is the primary input. Its value debounces into a parser
  // call (parseBrief) that fills mode + targeting (companies, industries,
  // roles, locations) on the form. Those parsed fields are not user-
  // editable in the new flow; they flow straight into the createLoop call
  // on deploy.
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
        // ok: populate targeting + mode from parser output. These fields
        // are not user-editable in the wizard (chip editors were removed),
        // so they always reflect the latest parser result.
        setForm((f) => {
          const next: Partial<FormState> = {
            companies: parsed?.companies ?? f.companies,
            industries: parsed?.industries ?? f.industries,
            roles: parsed?.roles ?? f.roles,
            locations: parsed?.locations ?? f.locations,
          };
          // Mode only auto-updates when the parser actually committed to
          // one. null = ambiguous, leave the user's current pick (or
          // default).
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

  const isReview = stepIdx === 1;
  // Deploy requires the user to have written a real brief. Chip-only
  // deploy (used by the removed manual targeting section) is gone.
  const hasBrief = briefText.trim().length >= MIN_BRIEF_CHARS_TO_PARSE;
  const canDeploy = hasBrief;

  const handleDeploy = async () => {
    if (!hasBrief) {
      toast({
        title: "Add a goal",
        description: "Type your goal in the textbox above.",
        variant: "destructive",
      });
      return;
    }
    setDeploying(true);
    try {
      const finalBriefText = briefText.trim();

      // Derive backend payload from the new cadence + pricing state.
      // Pricing: 5 credits per contact, 2 credits per role. Per-cycle
      // counts and cost are what the user sees in the cadence section;
      // the backend's *PerWeek fields want weekly equivalents, so daily
      // cadence multiplies by 7. When cadence is OFF, or when the mode
      // excludes a target type, the corresponding fields are OMITTED
      // from both payloads instead of sent as 0. The backend treats
      // missing fields as "no change" rather than 400ing them.
      const showContacts = form.loopMode === "people" || form.loopMode === "both";
      const showRoles = form.loopMode === "roles" || form.loopMode === "both";
      const perCycleContacts = showContacts ? form.contactsTarget : 0;
      const perCycleRoles = showRoles ? form.rolesTarget : 0;
      const perCycleCost =
        perCycleContacts * CREDIT_COST_PER_CONTACT +
        perCycleRoles * CREDIT_COST_PER_ROLE;
      const cyclesPerWeek =
        form.cadenceEnabled && form.cadenceFrequency === "daily" ? 7 : 1;
      const weeklyContacts = perCycleContacts * cyclesPerWeek;
      const weeklyRoles = perCycleRoles * cyclesPerWeek;
      const weeklyBudget = perCycleCost * cyclesPerWeek;
      const cadenceStr: "weekly" | "daily" | "manual" = form.cadenceEnabled
        ? form.cadenceFrequency
        : "manual";

      // briefParsed.targetCount: a per-cycle "find this many" hint to
      // the planner. Use the primary count for the mode (contacts in
      // people/both, roles in roles). Null when neither applies.
      const perCyclePrimaryTarget = showContacts
        ? form.contactsTarget
        : showRoles
          ? form.rolesTarget
          : null;

      // briefParsed reflects the parser's latest output (populated by the
      // parseBrief effect above). With chip editing gone, the parser is
      // the single source of truth for targeting.
      const finalBriefParsed: ParsedBrief = {
        companies: form.companies,
        industries: form.industries,
        roles: form.roles,
        locations: form.locations,
        emailPurpose: null,
        constraints: [],
        targetCount: perCyclePrimaryTarget,
        mode: form.loopMode,
      };

      // Legacy /api/agent/config payload. Cadence targets and budget are
      // included only when cadence is enabled AND the mode includes the
      // relevant target type. Backend (AgentConfigUpdate) now accepts
      // these fields as omitted/null.
      const configPayload: Partial<Parameters<typeof updateAgentConfig>[0]> = {
        targetCompanies: form.companies,
        targetIndustries: form.industries,
        targetRoles: form.roles,
        // Don't send preferAlumni=true if the user has no university on
        // file. It would silently boost nothing. Gate to actual school
        // presence.
        preferAlumni: hasUniversity && form.preferAlumni,
        approvalMode: form.approvalMode,
      };
      if (form.cadenceEnabled && showContacts && weeklyContacts > 0) {
        configPayload.weeklyContactTarget = weeklyContacts;
      }
      if (form.cadenceEnabled && weeklyBudget > 0) {
        configPayload.creditBudgetPerWeek = weeklyBudget;
      }
      await updateAgentConfig(configPayload);
      await deployAgent();

      // The Loops fleet view at /agent reads from a different collection
      // (users/{uid}/loops/*) than the legacy single-agent config above
      // (users/{uid}/settings/agent_config). Without this createLoop the
      // wizard "deploys" but no card ever shows up in the fleet view.
      // useCreateLoop invalidates the list query so /agent refetches.
      //
      // Loop.weeklyTarget is mode-agnostic throughput. In people/both
      // mode we send the weekly contact count; in roles-only mode we
      // send the weekly role count. When cadence is off, omit it; the
      // backend default in loop_service handles the rest. cadence:
      // "manual" already signals "no scheduled runs" on this side.
      const weeklyTargetForLoop = showContacts ? weeklyContacts : weeklyRoles;
      type LoopCreateInput = Parameters<typeof createLoopMut.mutateAsync>[0];
      const loopPayload: LoopCreateInput = {
        briefText: finalBriefText,
        briefParsed: finalBriefParsed,
        name: deriveLoopName(form),
        reviewBeforeSend: form.approvalMode === "review_first",
        cadence: cadenceStr,
        automationEnabled: form.approvalMode === "autopilot",
        loopMode: form.loopMode,
      };
      if (form.cadenceEnabled && weeklyTargetForLoop > 0) {
        loopPayload.weeklyTarget = weeklyTargetForLoop;
      }
      if (form.cadenceEnabled && weeklyBudget > 0) {
        loopPayload.creditBudgetPerWeek = weeklyBudget;
      }
      await createLoopMut.mutateAsync(loopPayload);

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
    <div className="min-h-0">
      {/* Top-left bail-out. Lives outside the centered 640px column so it
          anchors to the page edge, not the hero. Renders on both steps. */}
      <div className="px-4 sm:px-8 pt-6">
        <button
          type="button"
          onClick={() => navigate("/agent")}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
          style={{
            background: "#1e3a8a",
            border: "none",
            cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Loops
        </button>
      </div>

      <div className="max-w-[640px] mx-auto px-4 sm:px-8 pb-20">
        {/* Hero. Screen 0 (config) gets the centered "Start a Loop"
            treatment: Inter sans for "Start a", Instrument Serif italic
            dark blue for "Loop", with a hand-drawn squiggle SVG in the
            lighter brand blue underneath the word. Screen 1 (review)
            keeps a serif heading for now; Chunk 5 will rework it. */}
        {!isReview && (
          <div className="mb-8" style={{ paddingTop: 32, textAlign: "center" }}>
            <h1
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 72,
                fontWeight: 600,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                color: "#0f2545",
                marginBottom: 24,
              }}
            >
              Start a{" "}
              <span
                style={{
                  position: "relative",
                  display: "inline-block",
                  paddingBottom: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontStyle: "italic",
                    fontWeight: 400,
                    color: "#1e3a8a",
                  }}
                >
                  Loop
                </span>
                <svg
                  aria-hidden="true"
                  width="100%"
                  height="12"
                  viewBox="0 0 130 10"
                  preserveAspectRatio="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: -2,
                    pointerEvents: "none",
                  }}
                >
                  <path
                    d="M 4 5 Q 19 1 34 5 T 64 5 T 94 5 T 124 5"
                    stroke="#4A60A8"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </h1>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 21,
                lineHeight: 1.5,
                color: "#475569",
                maxWidth: 620,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Tell it what you want, walk away, get a text when the work is done. It works for you 24/7.
            </p>
          </div>
        )}

        {/* Step body. Screen 1 (config) renders the three stacked
            sections plus a wide pill Continue CTA below them. Screen 2
            (review) is owned entirely by StepReview, including its own
            back link, hero, recap, optional preview table, and Run Loop
            CTA. */}
        <div className="pt-7">
          {!isReview && (
            <>
              <StepGoals
                form={form}
                set={set}
                briefText={briefText}
                setBriefText={setBriefText}
                parsePhase={parsePhase}
                hasUniversity={hasUniversity}
                university={university || ""}
                profileFacts={profileFacts}
              />
              <StepCadence form={form} set={set} />
              <StepReviewMode form={form} set={set} />
            </>
          )}
          {isReview && (
            <StepReview
              form={form}
              university={university || ""}
              briefText={briefText}
              canDeploy={canDeploy}
              deploying={deploying}
              onBack={() => setStepIdx(0)}
              onDeploy={handleDeploy}
            />
          )}
        </div>

        {/* Bottom nav only exists on screen 1; on screen 2 the CTA and
            back link live inside StepReview, so the page can end after
            the Run Loop button. */}
        {!isReview && (
          <div className="mt-8 pt-5" style={{ borderTop: "1px solid var(--line-2)" }}>
            <WidePillButton
              label="Continue"
              disabled={!hasBrief}
              onClick={() => setStepIdx(1)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
