import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

// Tries to render a real company logo for jobs whose feed entry has no
// employer_logo. Strategy:
//   1) explicit fallbackUrl from the backend (employer_logo), if any
//   2) Clearbit's free logo endpoint with a guessed domain (no API key)
//   3) Google s2/favicons with the same guessed domain (almost always 200s)
//   4) monogram (first letter)
// On <img> error we advance through the chain. No backend involved.
//
// The img is wrapped in a div that takes `className`. The wrapper is what
// gets sized by the existing CSS rules (.jb-logo / .jb-detail-logo /
// .jb-banner-watermark). The img inside is constrained to 100% of the
// wrapper via inline style so callers do not need to ship an extra rule.

interface CompanyLogoProps {
  company: string;
  monogram: string;
  fallbackUrl?: string | null;
  className?: string;
  size?: number;
  style?: CSSProperties;
  fit?: "contain" | "cover";
  // Background applied to the wrapper while the img is showing. Tiles want
  // white so contained logos do not sit on the dark monogram background;
  // the banner watermark wants transparent.
  imageBg?: string;
}

function guessDomain(company: string): string | null {
  const cleaned = company
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
  if (!cleaned) return null;
  return `${cleaned}.com`;
}

function buildSources(company: string, fallbackUrl?: string | null, size = 128): string[] {
  const sources: string[] = [];
  if (fallbackUrl) sources.push(fallbackUrl);
  const domain = guessDomain(company);
  if (domain) {
    sources.push(`https://logo.clearbit.com/${domain}`);
    sources.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`);
  }
  return sources;
}

export function CompanyLogo({
  company,
  monogram,
  fallbackUrl,
  className,
  size = 128,
  style,
  fit = "contain",
  imageBg = "white",
}: CompanyLogoProps) {
  const sources = buildSources(company, fallbackUrl, size);
  const [sourceIdx, setSourceIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSourceIdx(0);
    setFailed(false);
  }, [company, fallbackUrl]);

  const showMonogram = failed || sources.length === 0;

  const wrapperStyle: CSSProperties = showMonogram
    ? { ...style }
    : { background: imageBg, ...style };

  return (
    <div className={className} style={wrapperStyle}>
      {showMonogram ? (
        monogram
      ) : (
        <img
          src={sources[sourceIdx]}
          alt={`${company} logo`}
          loading="lazy"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: fit,
          }}
          onError={() => {
            if (sourceIdx + 1 < sources.length) {
              setSourceIdx(sourceIdx + 1);
            } else {
              setFailed(true);
            }
          }}
        />
      )}
    </div>
  );
}
