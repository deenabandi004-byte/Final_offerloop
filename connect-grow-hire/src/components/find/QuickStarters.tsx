/**
 * QuickStarters — quiet floating examples below the search input.
 *
 * Goal: eliminate cold-start fog without crowding the page. Renders as a single
 * line of comma/middot-separated clickable text examples in muted ink. No pill
 * chrome, no border, no header banner. Reads as "here are some you could try"
 * rather than a prominent UI block. Disappears the moment the user types.
 *
 * Each example is profile-aware — built from the user's school, target firms,
 * target industries, extracted roles, and preferred locations.
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { industries } from '@/data/industries';

/**
 * Cheap sanity check: is this firm a known player in this industry?
 * Prevents nonsense chips like "Investment Banking roles at IBM" —
 * the user's targetIndustries and targetFirms can be independent inputs
 * and blindly crossing them produces garbage suggestions.
 *
 * Strict on purpose: only matches against the industry's top_companies
 * list (data/industries.ts). Firms that legit belong to the industry but
 * aren't in the top-5 list won't pair — that's an acceptable false negative
 * because slots 1/3/4 of buildStarters still cover the firm via other
 * intents (alumni, hiring managers, grads in field).
 */
function firmMatchesIndustry(firm: string, industry: string): boolean {
  if (!firm || !industry) return false;
  const industryLower = industry.toLowerCase();
  const match = industries.find((i) =>
    i.name.toLowerCase() === industryLower ||
    i.name.toLowerCase().includes(industryLower) ||
    industryLower.includes(i.name.toLowerCase())
  );
  if (!match) return false;
  const firmLower = firm.toLowerCase().trim();
  return (match.top_companies || []).some((c) => {
    const cLower = c.toLowerCase().trim();
    return cLower === firmLower || cLower.includes(firmLower) || firmLower.includes(cLower);
  });
}

interface QuickStartersProps {
  visible: boolean;
  onPick: (prompt: string) => void;
  schoolShort?: string;
  schoolFull?: string;
  targetFirms?: string[];
  targetIndustries?: string[];
  preferredLocations?: string[];
  extractedRoles?: string[];
}

const EASE = [0.16, 1, 0.3, 1] as const;

export function buildStarters({
  schoolShort,
  schoolFull,
  targetFirms = [],
  targetIndustries = [],
  preferredLocations = [],
  extractedRoles = [],
}: Omit<QuickStartersProps, 'visible' | 'onPick'>): string[] {
  const school = schoolShort || schoolFull || '';
  const role = extractedRoles[0];
  const loc = preferredLocations[0];
  const industry = targetIndustries[0];
  const industry2 = targetIndustries[1];

  // Hand out each target company at most once, so no company repeats across chips.
  const firmQueue = [...targetFirms];
  const usedFirms = new Set<string>();
  const nextFirm = (): string | null => {
    while (firmQueue.length) {
      const f = firmQueue.shift();
      if (f && !usedFirms.has(f.toLowerCase())) {
        usedFirms.add(f.toLowerCase());
        return f;
      }
    }
    return null;
  };

  const starters: string[] = [];

  // Each slot uses a DIFFERENT intent (and a different company) to avoid clustering.
  // 1) alumni at a company
  const f1 = nextFirm();
  if (school && f1) starters.push(`${school} alumni at ${f1}`);
  else if (f1) starters.push(`People at ${f1}`);

  // 2) role at a second company
  // Only cross industry × firm when the firm is actually in that industry
  // (see firmMatchesIndustry above). Falls through to a company-only chip
  // when the pairing would be nonsense — e.g., IBM × Investment Banking.
  const f2 = nextFirm();
  if (f2 && role) starters.push(`${role}s at ${f2}`);
  else if (f2 && industry && firmMatchesIndustry(f2, industry)) starters.push(`${industry} roles at ${f2}`);
  else if (f2) starters.push(`People at ${f2}`);
  else if (school && industry) starters.push(`${school} grads in ${industry}`);

  // 3) hiring managers at a third company (or in a field)
  const f3 = nextFirm();
  if (f3) starters.push(`Hiring managers at ${f3}`);
  else if (industry) starters.push(`Hiring managers in ${industry}`);
  else if (role) starters.push(`Hiring managers for ${role}s`);

  // 4) grads in a field — no company
  if (school && (industry2 || industry)) starters.push(`${school} grads in ${industry2 || industry}`);
  else if (role && loc) starters.push(`${role}s in ${loc}`);

  // Guarantee at least 3 varied chips for thin profiles.
  const fallbacks = [
    school ? `${school} alumni in finance` : 'Investment banking analysts in New York, NY',
    'Product managers at Stripe',
    'Hiring managers in tech',
  ];
  for (const fb of fallbacks) {
    if (starters.length >= 3) break;
    starters.push(fb);
  }

  // Dedupe identical strings + cap at 4 (company-level dedup handled above).
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const s of starters) {
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(s);
    }
    if (unique.length >= 4) break;
  }
  return unique;
}

export const QuickStarters: React.FC<QuickStartersProps> = ({
  visible,
  onPick,
  schoolShort,
  schoolFull,
  targetFirms,
  targetIndustries,
  preferredLocations,
  extractedRoles,
}) => {
  const starters = useMemo(
    () =>
      buildStarters({
        schoolShort,
        schoolFull,
        targetFirms,
        targetIndustries,
        preferredLocations,
        extractedRoles,
      }),
    [
      schoolShort,
      schoolFull,
      targetFirms,
      targetIndustries,
      preferredLocations,
      extractedRoles,
    ],
  );

  return (
    <AnimatePresence initial={false}>
      {visible && starters.length > 0 && (
        <motion.div
          key="quick-starters"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE }}
          style={{
            marginTop: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {starters.map((s) => (
            <button
              key={s}
              type="button"
              // Prevent focus from leaving the search input when clicked — the click
              // should feel like the user typed the seed in; the rest of the pipeline
              // (chips, sidebar, ghost) needs the input to stay focused.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(s)}
              style={{
                background: 'var(--paper, #FFFFFF)',
                border: '1px solid var(--line, #E5E5E0)',
                borderRadius: 999,
                padding: '7px 14px',
                fontFamily: 'inherit',
                fontSize: 12.5,
                color: 'var(--ink-2, #4A4F5B)',
                cursor: 'pointer',
                transition: 'background .12s ease, border-color .12s ease',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = 'var(--surface, #F5F6F8)';
                el.style.borderColor = 'var(--primary-200, #B6C3E8)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = 'var(--paper, #FFFFFF)';
                el.style.borderColor = 'var(--line, #E5E5E0)';
              }}
            >
              {s}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default QuickStarters;
