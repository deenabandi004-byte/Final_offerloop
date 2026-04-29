/**
 * useEventLogger — Phase 2 batched event-logging hook.
 *
 * Behavior:
 *   - logEvent(type, payload) is fire-and-forget; the event is validated
 *     against its zod schema and pushed onto an in-memory queue.
 *   - The queue is flushed every 5 seconds, on visibilitychange via
 *     navigator.sendBeacon, and on explicit flush() calls.
 *   - When the rollout flag (EVENTS_LOGGING_ENABLED) is false, logEvent
 *     becomes a no-op so we can ship code paths and flip the switch
 *     separately.
 *
 * Failure modes (per §12 critical gap):
 *   - sendBeacon backed by localStorage retry queue. If the page is
 *     closing and beacon fires, the events are stamped with their
 *     idempotency-safe eventIds, so a re-send on the next session is
 *     safe (the backend dedupes via the eventId doc-key).
 *   - Network failures during the periodic flush put the batch back on
 *     the front of the queue and re-flush on next interval.
 *
 * The hook is a singleton-style module — multiple consumers share a
 * single queue. React just re-exposes the same `logEvent` reference.
 */
import { useCallback, useEffect, useRef } from 'react';
import { getAuth } from 'firebase/auth';

import { API_BASE_URL } from '@/services/api';
import { EVENTS_LOGGING_ENABLED } from '@/lib/constants';
import {
  AppEvent,
  EventType,
  PayloadFor,
  buildEvent,
} from '@/lib/events';

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH_SIZE = 25;
const RETRY_QUEUE_KEY = 'offerloop_event_retry_queue';

let queue: AppEvent[] = [];
let flushing = false;

function logQueueDrop(reason: string) {
  // eslint-disable-next-line no-console
  console.warn('[useEventLogger] dropping event batch:', reason);
}

function readRetryQueue(): AppEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RETRY_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRetryQueue(events: AppEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (!events.length) {
      window.localStorage.removeItem(RETRY_QUEUE_KEY);
      return;
    }
    window.localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(events));
  } catch {
    // localStorage full or disabled — silently drop. The events that were
    // about to retry will be lost; new events keep flowing.
  }
}

function appendToRetryQueue(events: AppEvent[]): void {
  if (!events.length) return;
  const existing = readRetryQueue();
  // Cap the retry queue at 200 to bound localStorage usage.
  const merged = [...existing, ...events].slice(-200);
  writeRetryQueue(merged);
}

async function getAuthHeader(): Promise<HeadersInit | null> {
  try {
    const user = getAuth().currentUser;
    if (!user) return null;
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return null;
  }
}

async function flushQueue(): Promise<void> {
  if (flushing || queue.length === 0) return;
  if (!EVENTS_LOGGING_ENABLED) {
    queue.length = 0;
    return;
  }

  flushing = true;
  const batch = queue.splice(0, MAX_BATCH_SIZE);
  // Pull anything from the retry queue along with the live batch.
  const retried = readRetryQueue();
  const allEvents = [...retried, ...batch].slice(0, MAX_BATCH_SIZE);
  writeRetryQueue(retried.slice(MAX_BATCH_SIZE));

  try {
    const headers = await getAuthHeader();
    if (!headers) {
      // No user signed in → put the batch on the retry queue so we can
      // re-flush after they auth.
      appendToRetryQueue(allEvents);
      return;
    }
    const resp = await fetch(`${API_BASE_URL}/events/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ events: allEvents }),
      keepalive: true,
    });
    if (!resp.ok) {
      // Server-side failure → put the batch back on the retry queue.
      appendToRetryQueue(allEvents);
      logQueueDrop(`server returned ${resp.status}`);
    }
  } catch (err) {
    appendToRetryQueue(allEvents);
    logQueueDrop(`fetch error: ${(err as Error).message}`);
  } finally {
    flushing = false;
  }
}

function flushViaBeacon(): void {
  if (!EVENTS_LOGGING_ENABLED) return;
  const retried = readRetryQueue();
  const all = [...retried, ...queue];
  if (!all.length) return;
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
    appendToRetryQueue(all);
    queue.length = 0;
    return;
  }

  // We can't await getIdToken() during pagehide — best effort: post
  // unauth'd, the backend will reject with 401, AND we fall through to
  // localStorage retry on next session as well. Keep both for safety.
  appendToRetryQueue(all);

  try {
    const blob = new Blob(
      [JSON.stringify({ events: all })],
      { type: 'application/json' },
    );
    navigator.sendBeacon(`${API_BASE_URL}/events/batch`, blob);
  } catch {
    // sendBeacon may throw quota-style errors — already on retry queue.
  } finally {
    queue.length = 0;
  }
}

/**
 * Public API. Returns a stable `logEvent` callback usable across renders.
 * Callers can also call `flush()` directly, e.g. before navigating away
 * from a critical screen.
 */
export function useEventLogger() {
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (intervalRef.current !== null) return;
    if (typeof window === 'undefined') return;

    intervalRef.current = window.setInterval(() => {
      void flushQueue();
    }, FLUSH_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushViaBeacon();
      }
    };

    window.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushViaBeacon);
    window.addEventListener('beforeunload', flushViaBeacon);

    // Drain the retry queue from previous sessions on mount.
    void flushQueue();

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      window.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushViaBeacon);
      window.removeEventListener('beforeunload', flushViaBeacon);
    };
  }, []);

  const logEvent = useCallback(<T extends EventType>(
    type: T,
    payload: PayloadFor<T>,
  ): void => {
    if (!EVENTS_LOGGING_ENABLED) return;
    const result = buildEvent(type, payload);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[logEvent] validation failed for ${type}:`, result.error);
      return;
    }
    queue.push(result.event);
    if (queue.length >= MAX_BATCH_SIZE) {
      void flushQueue();
    }
  }, []);

  const flush = useCallback(() => flushQueue(), []);

  return { logEvent, flush };
}
