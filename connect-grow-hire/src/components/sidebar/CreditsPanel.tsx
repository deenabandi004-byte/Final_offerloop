import { Zap } from "lucide-react";

import {
  CREDITS_CRITICAL_PCT,
  CREDITS_LOW_PCT,
  CREDITS_TIER_AMPLE,
  CREDITS_TIER_CRITICAL,
  CREDITS_TIER_LOW,
  type CreditsTier,
} from "@/lib/constants";

export type CreditsPanelProps = {
  used: number;
  total: number;
  onUpgrade: () => void;
};

type TierTheme = {
  wrap: string;
  label: string;
  pill: string;
  bar: string;
  btn: string;
  bolt: string;
  cta: string;
};

const THEMES: Record<CreditsTier, TierTheme> = {
  ample: {
    wrap: "bg-white/[0.035] border-white/[0.06]",
    label: "text-slate-400",
    pill: "text-indigo-300 bg-indigo-500/15",
    bar: "from-indigo-500 to-violet-500",
    btn: "from-indigo-500 to-violet-600 shadow-[0_4px_14px_rgba(99,102,241,0.32)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.45)]",
    bolt: "text-amber-200",
    cta: "Upgrade Plan",
  },
  low: {
    wrap: "bg-amber-500/[0.07] border-amber-500/25",
    label: "text-amber-300",
    pill: "text-amber-300 bg-amber-500/15",
    bar: "from-amber-400 to-orange-500",
    btn: "from-amber-500 to-orange-600 shadow-[0_4px_16px_rgba(245,158,11,0.4)] hover:shadow-[0_6px_22px_rgba(245,158,11,0.55)]",
    bolt: "text-amber-950",
    cta: "Get more credits",
  },
  critical: {
    wrap: "bg-rose-500/[0.08] border-rose-500/30",
    label: "text-rose-300",
    pill: "text-rose-200 bg-rose-500/15",
    bar: "from-rose-500 to-red-600",
    btn: "from-rose-500 to-red-600 shadow-[0_4px_16px_rgba(244,63,94,0.45)] hover:shadow-[0_6px_22px_rgba(244,63,94,0.6)]",
    bolt: "text-rose-950",
    cta: "Get more credits",
  },
};

function tierFor(pct: number): CreditsTier {
  if (pct > CREDITS_LOW_PCT) return CREDITS_TIER_AMPLE;
  if (pct > CREDITS_CRITICAL_PCT) return CREDITS_TIER_LOW;
  return CREDITS_TIER_CRITICAL;
}

export function CreditsPanel({ used, total, onUpgrade }: CreditsPanelProps) {
  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? (remaining / total) * 100 : 0;
  const theme = THEMES[tierFor(pct)];

  return (
    <div className={`rounded-xl border p-3.5 ${theme.wrap}`}>
      <div className="mb-2.5 flex items-center justify-between">
        <span className={`text-[10px] font-medium uppercase tracking-wider ${theme.label}`}>
          Credits left
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${theme.pill}`}>
          {Math.round(pct)}%
        </span>
      </div>

      <div className="mb-2.5 flex items-baseline gap-1.5">
        <span className="text-[19px] font-medium tracking-tight text-slate-50">
          {remaining.toLocaleString()}
        </span>
        <span className="text-[11px] text-slate-500">of {total.toLocaleString()}</span>
      </div>

      <div className="mb-3.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${theme.bar}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>

      <button
        type="button"
        onClick={onUpgrade}
        className={`flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-br py-2.5 text-[13px] font-medium text-white transition-transform duration-150 hover:-translate-y-px active:translate-y-0 ${theme.btn}`}
      >
        <Zap className={`h-3.5 w-3.5 ${theme.bolt}`} />
        {theme.cta}
      </button>
    </div>
  );
}
