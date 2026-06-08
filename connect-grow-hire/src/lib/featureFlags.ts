// Client-side feature flags. Single source of truth for now — step 9 of the
// Loops Setup V2 rollout will swap the hardcoded defaults for a Firestore-
// backed cohort assignment.
//
// Per-flag override from DevTools (handy for dogfooding without flipping
// the default for everyone):
//   localStorage.setItem('ff_LOOPS_SETUP_V2', '1')  // force on
//   localStorage.setItem('ff_LOOPS_SETUP_V2', '0')  // force off
//   localStorage.removeItem('ff_LOOPS_SETUP_V2')    // back to default

export type FeatureFlag = "LOOPS_SETUP_V2";

const DEFAULTS: Record<FeatureFlag, boolean> = {
  LOOPS_SETUP_V2: false,
};

function lsKey(name: FeatureFlag): string {
  return `ff_${name}`;
}

export function isFeatureEnabled(name: FeatureFlag): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULTS[name];
  }
  try {
    const raw = window.localStorage.getItem(lsKey(name));
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
    // Safari private mode etc. — fall through to default.
  }
  return DEFAULTS[name];
}
