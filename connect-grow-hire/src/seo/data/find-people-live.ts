/*
 * First-batch live find-people pages. Flipped 2026-06-15 with explicit approval.
 *
 * ONLY these slugs render index,follow and appear in the production sitemap.
 * Every other find-people page (the rest of the 100-cell pilot and the
 * hand-authored seeds) stays noindex. This is the single source of truth for
 * the flip: the template reads it for the robots meta, and the sitemap lists
 * exactly these URLs. Twelve cells, spread across banking, consulting, and tech
 * so the 2 to 3 week index watch reads cleanly across types.
 */
export const LIVE_FIND_PEOPLE_SLUGS = new Set<string>([
  // banking
  'columbia-alumni-at-goldman-sachs',
  'nyu-alumni-at-morgan-stanley',
  'cornell-alumni-at-jpmorgan',
  'michigan-alumni-at-goldman-sachs',
  // consulting
  'harvard-alumni-at-mckinsey',
  'berkeley-alumni-at-mckinsey',
  'harvard-alumni-at-bcg',
  'upenn-alumni-at-mckinsey',
  // tech
  'berkeley-alumni-at-google',
  'usc-alumni-at-amazon',
  'berkeley-alumni-at-meta',
  'usc-alumni-at-apple',
]);
