import { useEffect, useState } from "react";

import { isFeatureEnabled, type FeatureFlag } from "@/lib/featureFlags";

// React hook for reading a client-side feature flag. Re-renders when the
// underlying localStorage value changes in another tab so flipping a flag
// in DevTools propagates without a hard refresh.
export function useFeatureFlag(name: FeatureFlag): boolean {
  const [on, setOn] = useState<boolean>(() => isFeatureEnabled(name));

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === null || e.key === `ff_${name}`) {
        setOn(isFeatureEnabled(name));
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [name]);

  return on;
}
