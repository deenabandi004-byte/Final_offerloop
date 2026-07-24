// Every deploy replaces all content-hashed chunk files in dist/, so a tab
// opened before the deploy fails to lazy-load routes afterwards: the server
// SPA-fallbacks the missing .js to index.html and the import throws
// ("Failed to fetch dynamically imported module" / bad MIME type). The
// recovery is always the same — reload once so the tab picks up the new
// index.html with the new chunk names. The sessionStorage guard stops a
// reload loop if the failure is something else (offline, adblock).

const KEY = "offerloop-chunk-reload-at";
const MIN_INTERVAL_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /not a valid JavaScript MIME type/i.test(msg)
  );
}

/** Reload to pick up a fresh deploy. Returns false if we reloaded recently
 * (likely not a deploy problem — let normal error handling take over). */
export function reloadForNewDeploy(): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY) || 0);
  } catch {
    // sessionStorage unavailable (private mode); still reload once per page
    // life via the in-memory flag below.
  }
  if (Date.now() - last < MIN_INTERVAL_MS) return false;
  if (reloadedThisPageLoad) return false;
  reloadedThisPageLoad = true;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // ignore
  }
  window.location.reload();
  return true;
}

let reloadedThisPageLoad = false;
