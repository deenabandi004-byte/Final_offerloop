import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

// Tracker-local logo with an onError fallback chain. Self-contained in the
// redesign folder so the tracker lane stays severable from jobs/: a refactor
// to the Job Board's CompanyLogo cannot break the tracker, and vice versa.
//
// Source chain (in order, advanced by <img onError> AND by a naturalWidth
// guard in onLoad). Matches the Job Board's CompanyLogo chain, minus the
// backend-provided employer_logo URL that the jobs feed has and the
// contacts feed does not.
//   1) fallbackUrl  — email-derived Clearbit URL, supplied by the page when
//                     the company has at least one contact on a non-personal
//                     email domain. Null when every contact is on personal
//                     email (gmail/yahoo/etc.), so we never ship a personal
//                     domain to Clearbit.
//   2) Clearbit with a domain guessed from the company name
//   3) Google s2/favicons with the same guessed domain — usually 200s for
//      known domains with the real favicon, 200s for unknown with a generic
//      16px globe. The naturalWidth guard below catches the globe by its
//      tiny intrinsic width and advances to the monogram. Without this
//      guard s2 would stick the chain on the globe; with it, s2 acts as a
//      legitimate third hit source for companies Clearbit doesn't index.
//   4) Monogram — branded single-letter tile rendered via CSS, OR null when
//      hideWhenMonogram is set (people cards prefer no logo over an inline
//      monogram letter sitting next to a body of text).
//
// The img is unmounted before any browser-default broken-image icon can
// paint, in both failure modes:
//   - sources.length === 0  (no fallbackUrl AND name-guess returned null)
//   - failed === true       (every source errored or returned a tiny image)

const MIN_LEGITIMATE_LOGO_WIDTH = 32;

interface CompanyLogoProps {
  company: string;
  monogram: string;
  fallbackUrl?: string | null;
  className?: string;
  style?: CSSProperties;
  // When true and the chain falls through to monogram, render null instead
  // of the branded letter tile. Used by people cards, where an inline
  // monogram next to body text looks weird.
  hideWhenMonogram?: boolean;
}

function guessDomain(company: string): string | null {
  const cleaned = company
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
  if (!cleaned) return null;
  return `${cleaned}.com`;
}

function buildSources(company: string, fallbackUrl?: string | null): string[] {
  const sources: string[] = [];
  if (fallbackUrl) sources.push(fallbackUrl);
  const domain = guessDomain(company);
  if (domain) {
    sources.push(`https://logo.clearbit.com/${domain}`);
    sources.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  }
  return sources;
}

export function CompanyLogo({
  company,
  monogram,
  fallbackUrl,
  className,
  style,
  hideWhenMonogram = false,
}: CompanyLogoProps) {
  const sources = buildSources(company, fallbackUrl);
  const [sourceIdx, setSourceIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  // Reset the chain when the row identity changes (different company or a
  // different work-email domain selected). Without this, an exhausted chain
  // state would persist across remounts of the same component instance.
  useEffect(() => {
    setSourceIdx(0);
    setFailed(false);
  }, [company, fallbackUrl]);

  const showMonogram = failed || sources.length === 0;

  // People cards opt out of the monogram fallback so an absent logo
  // collapses cleanly inline rather than rendering a letter tile next to
  // the company name text.
  if (showMonogram && hideWhenMonogram) return null;

  // Shared advance helper used by both onError and the naturalWidth guard
  // in onLoad. Captured by closure on the current sourceIdx, which is
  // correct for the img element that fired the event.
  const advance = () => {
    if (sourceIdx + 1 < sources.length) {
      setSourceIdx(sourceIdx + 1);
    } else {
      setFailed(true);
    }
  };

  // The tile's resting background (set by .company-logo-tile in CSS) is
  // brand-tinted for the monogram case. While an img is showing, swap to
  // white inline so logos with light-on-light artwork stay legible.
  const wrapperStyle: CSSProperties = showMonogram
    ? { ...style }
    : { background: "#fff", ...style };

  return (
    <div className={className} style={wrapperStyle}>
      {showMonogram ? (
        monogram
      ) : (
        <img
          src={sources[sourceIdx]}
          alt={`${company} logo`}
          onError={advance}
          onLoad={(e) => {
            // Defense against any source that returns HTTP 200 with a
            // placeholder/garbage image. Clearbit logos are 128px+; ANY
            // smaller response advances the chain as if onError had fired.
            //
            // Crucially this includes naturalWidth === 0, which happens
            // when Clearbit returns a 200 with a no-dimension SVG, or when
            // an ad-blocker intercepts the request with an empty response.
            // The earlier `w > 0 &&` guard excluded that case, leaving the
            // img mounted with a 0x0 source and the browser painting its
            // broken-image glyph. Drop the >0 check; treat any sub-32px
            // load as failure.
            const w = (e.currentTarget as HTMLImageElement).naturalWidth;
            if (w < MIN_LEGITIMATE_LOGO_WIDTH) advance();
          }}
        />
      )}
    </div>
  );
}
