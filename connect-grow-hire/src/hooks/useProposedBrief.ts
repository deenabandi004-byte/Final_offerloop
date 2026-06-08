import { useCallback, useEffect, useRef, useState } from "react";

import { proposeBrief, type ProposedBrief } from "@/services/agent";

export interface UseProposedBriefState {
  data: ProposedBrief | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetch an AI-drafted starting brief for the V2 Loops setup wizard.
 *
 * Gated by `enabled` so the hook is a no-op when the LOOPS_SETUP_V2
 * feature flag is off — the network call only fires for the treatment
 * cohort. `refetch` powers the "Re-suggest" button.
 *
 * Race-safe via a request-id ref: if the user clicks "Re-suggest" before
 * the first fetch lands, the stale response is dropped.
 */
export function useProposedBrief({
  enabled,
}: {
  enabled: boolean;
}): UseProposedBriefState {
  const [data, setData] = useState<ProposedBrief | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    const myId = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await proposeBrief();
      if (myId !== requestId.current) return;
      setData(result);
    } catch (e) {
      if (myId !== requestId.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (myId === requestId.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    refetch();
  }, [enabled, refetch]);

  return { data, loading, error, refetch };
}
