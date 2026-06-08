import { useEffect, useState } from "react";

import { isFeatureEnabled, type FeatureFlag } from "@/lib/featureFlags";
import { getLoopsSetupV2Cohort } from "@/services/agent";

// Cached per session. Step 9's backend cohort assignment is sticky so
// the value won't change after first read — caching here avoids a
// network call every time a different component asks for the flag.
const cohortCache: Partial<Record<FeatureFlag, boolean>> = {};

// Which flags are backed by a backend cohort. localStorage override
// still wins for dev / dogfood — see featureFlags.ts.
const BACKEND_COHORT_FLAGS: Record<FeatureFlag, boolean> = {
  LOOPS_SETUP_V2: true,
};

async function fetchBackendCohort(name: FeatureFlag): Promise<boolean | null> {
  if (!BACKEND_COHORT_FLAGS[name]) return null;
  try {
    if (name === "LOOPS_SETUP_V2") {
      const { flagEnabled } = await getLoopsSetupV2Cohort();
      return flagEnabled;
    }
  } catch {
    // Network / auth failure: fall back to localStorage default. We
    // never want a backend hiccup to flip a user out of their cohort.
    return null;
  }
  return null;
}

// React hook for reading a client-side feature flag. Re-renders when the
// underlying localStorage value changes in another tab (storage event)
// or when the backend cohort assignment resolves on first mount.
export function useFeatureFlag(name: FeatureFlag): boolean {
  const [on, setOn] = useState<boolean>(() => {
    // LocalStorage override OR cached backend result wins. Default to
    // false while the backend fetch is in flight so non-treatment users
    // never see a flash of treatment UI.
    const lsOverride = readLocalStorageOverride(name);
    if (lsOverride !== null) return lsOverride;
    if (cohortCache[name] !== undefined) return cohortCache[name]!;
    return isFeatureEnabled(name);
  });

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === null || e.key === `ff_${name}`) {
        setOn(isFeatureEnabled(name));
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [name]);

  useEffect(() => {
    // LocalStorage override short-circuits the backend fetch entirely
    // so devs flipping the flag in DevTools don't pay a round-trip.
    const lsOverride = readLocalStorageOverride(name);
    if (lsOverride !== null) return;
    if (cohortCache[name] !== undefined) {
      setOn(cohortCache[name]!);
      return;
    }
    let cancelled = false;
    void fetchBackendCohort(name).then((result) => {
      if (cancelled || result === null) return;
      cohortCache[name] = result;
      setOn(result);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return on;
}

function readLocalStorageOverride(name: FeatureFlag): boolean | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(`ff_${name}`);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
    // ignore
  }
  return null;
}
