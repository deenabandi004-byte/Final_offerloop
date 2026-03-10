export function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysBetween(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Decode HTML entities (e.g. &#39; &amp; &quot;) to plain text */
let _textarea: HTMLTextAreaElement | null = null;
export function decodeHtmlEntities(text: string | null | undefined): string {
  if (!text) return "";
  // Fast path: skip if no entities present
  if (!text.includes("&")) return text;
  if (!_textarea) _textarea = document.createElement("textarea");
  _textarea.innerHTML = text;
  return _textarea.value;
}
