// Mirror of backend/app/services/tier_defaults.py — same WEEKLY_TARGET_BY_TIER
// values. Used by the V2 Loops wizard to show "We'll find ~N people per week"
// without round-tripping to the backend. Keep in sync.
//
// The backend is the source of truth: loop_service.create_loop substitutes
// the tier default when the client omits weeklyTarget. If you bump these
// numbers, update both files in the same commit.

export const WEEKLY_TARGET_BY_TIER: Record<string, number> = {
  free: 2,
  pro: 5,
  elite: 10,
};

const FALLBACK_WEEKLY_TARGET = WEEKLY_TARGET_BY_TIER.free;

export function weeklyTargetForTier(tier: string | null | undefined): number {
  if (!tier) return FALLBACK_WEEKLY_TARGET;
  return WEEKLY_TARGET_BY_TIER[tier.toLowerCase()] ?? FALLBACK_WEEKLY_TARGET;
}

// Mirror of backend BUNDLED_COST_PER_PERSON["people"] (loop_budget.py) —
// the typical per-person credit cost for a networking Loop. Multiplied by
// weeklyTarget × 1.15 buffer to estimate weekly spend in the low-balance
// guard. Roles / both modes have different costs but step 5 of the V2
// rewrite only uses this for the people-mode default; if we surface a
// per-mode warning later, mirror the full dict.
export const BUNDLED_COST_PER_PERSON_PEOPLE = 12;
export const BUNDLED_BUDGET_BUFFER = 1.15;

export function estimatedWeeklyCreditsPeople(weeklyTarget: number): number {
  return Math.ceil(
    weeklyTarget * BUNDLED_COST_PER_PERSON_PEOPLE * BUNDLED_BUDGET_BUFFER,
  );
}
