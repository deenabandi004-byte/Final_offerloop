import { useEffect, useRef, useState } from "react";

import {
  previewTargets,
  type ParsedBrief,
  type PreviewContact,
} from "@/services/agent";

const PREVIEW_DEBOUNCE_MS = 1000;

interface PreviewState {
  contacts: PreviewContact[];
  loading: boolean;
  error: Error | null;
  hasSignal: boolean;
}

function _hasSignal(parsed: ParsedBrief | null): boolean {
  if (!parsed) return false;
  return (
    (parsed.companies?.length ?? 0) > 0 ||
    (parsed.industries?.length ?? 0) > 0 ||
    (parsed.roles?.length ?? 0) > 0
  );
}

function _cacheKey(parsed: ParsedBrief | null): string {
  if (!parsed) return "";
  const norm = (xs: string[] | undefined) =>
    [...new Set((xs ?? []).map((x) => x.trim().toLowerCase()))].sort().join("|");
  return [
    norm(parsed.companies),
    norm(parsed.industries),
    norm(parsed.roles),
    norm(parsed.locations),
  ].join("§");
}

/**
 * Debounced fetcher for the V2 InlinePreview side panel.
 *
 * - Gated by `enabled` so non-treatment cohort doesn't fire the network call.
 * - Debounces 1s after the parsed brief settles so chip-edit storms don't
 *   thrash PDL even with the backend's 30-day cache.
 * - Skips the call entirely when the brief has no concrete targets — the
 *   wizard renders the "Add a company or role" empty state from `hasSignal`.
 * - Session-cached client-side by hash(briefParsed) so a parse that lands
 *   on the same shape twice returns instantly.
 * - Race-safe via a request-id ref: stale responses are dropped.
 */
export function usePreviewTargets({
  enabled,
  briefParsed,
}: {
  enabled: boolean;
  briefParsed: ParsedBrief | null;
}): PreviewState {
  const [contacts, setContacts] = useState<PreviewContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cacheRef = useRef<Map<string, PreviewContact[]>>(new Map());
  const requestId = useRef(0);

  const hasSignal = _hasSignal(briefParsed);

  useEffect(() => {
    if (!enabled) {
      setContacts([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!hasSignal) {
      setContacts([]);
      setLoading(false);
      setError(null);
      return;
    }

    const key = _cacheKey(briefParsed);
    const cached = cacheRef.current.get(key);
    if (cached) {
      setContacts(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const myId = ++requestId.current;
    setLoading(true);
    setError(null);
    const t = window.setTimeout(async () => {
      try {
        const { contacts: fresh } = await previewTargets(briefParsed);
        if (myId !== requestId.current) return;
        cacheRef.current.set(key, fresh);
        setContacts(fresh);
      } catch (e) {
        if (myId !== requestId.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (myId === requestId.current) setLoading(false);
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasSignal, _cacheKey(briefParsed)]);

  return { contacts, loading, error, hasSignal };
}
