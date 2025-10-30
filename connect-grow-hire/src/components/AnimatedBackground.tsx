import React from "react";

type Props = {
  gridOpacity?: number;
  glowOpacity?: number;
  noiseOpacity?: number;
  showVignette?: boolean;
};

export default function AnimatedBackground({
  gridOpacity = 0.14,
  glowOpacity = 0.28,
  noiseOpacity = 0.06,
  showVignette = true,
}: Props) {
  return (
    <>
      {/* Fixed, sits under content but above the body's base color */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        {/* base tint so we can remove bg color from the page wrapper */}
        <div className="absolute inset-0 bg-[#0b1220]" />
        <div className="absolute inset-0 bg-anim-grid" style={{ opacity: gridOpacity }} />
        <div className="absolute inset-0 bg-anim-glow mix-blend-screen" style={{ opacity: glowOpacity }} />
        <div className="absolute inset-0 bg-anim-noise" style={{ opacity: noiseOpacity }} />
      </div>

      {showVignette && (
        <div className="pointer-events-none fixed inset-0 z-0 bg-dim" aria-hidden />
      )}
    </>
  );
}
