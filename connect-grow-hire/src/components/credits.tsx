// src/components/Credits.tsx
import { Zap } from "lucide-react";

export function CreditPill({
  credits,
  max,
}: {
  credits: number;
  max: number;
}) {
  const low = credits === 0 ? "red" : credits < 30 ? "amber" : "blue";

  const tone =
    low === "red"
      ? "bg-red-500/15 text-red-700 ring-red-400/30"
      : low === "amber"
      ? "bg-amber-500/15 text-amber-700 ring-amber-400/30"
      : "bg-blue-500/15 text-blue-700 ring-blue-400/30";

  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full ring-1 ${tone}`}>
      <Zap className="h-4 w-4" />
      <span className="tabular-nums">{credits}</span>
      <span className="opacity-70">/ {max}</span>
    </span>
  );
}

export function CreditMeter({
  credits,
  max,
}: {
  credits: number;
  max: number;
}) {
  const pct = Math.max(0, Math.min(100, (credits / Math.max(1, max)) * 100));
  const bar =
    credits === 0 ? "bg-red-500" : credits < 30 ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="space-y-1">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-white/60">
        <span className="tabular-nums">
          {credits} / {max} credits
        </span>
        <span className="tabular-nums">
          {Math.floor(credits / 15)} searches remaining
        </span>
      </div>
    </div>
  );
}
