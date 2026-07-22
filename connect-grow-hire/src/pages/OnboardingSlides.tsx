import { useEffect, useState } from "react";
import { OB } from "./onboardingTheme";
import OfferloopLogo from "@/assets/offerloop_logo2_trimmed.png";
import GmailLogo from "@/assets/Gmaillogopng.png";
import OutlookLogo from "@/assets/outlook_logo.png";
import AppleMailLogo from "@/assets/applemail.png";

// Five click-through intro slides shown before the resume page. Each slide
// runs a blurred product recording behind it (public/onboarding-bg/*.mp4,
// generated from the ad-studio screen captures). Click anywhere, the Continue
// button, or ArrowRight/Enter/Space advances.
const SLIDES = [
  {
    key: "find-people",
    video: "/onboarding-bg/find-people.mp4",
    headline: "Find the right people",
    body: "Search 2.2 billion professionals: alumni from your school, people at your target firms.",
  },
  {
    key: "job-board",
    video: "/onboarding-bg/job-board.mp4",
    headline: "A job board built around you",
    body: "Openings matched and scored against your resume, not a generic feed.",
  },
  {
    key: "auto-apply",
    video: "/onboarding-bg/auto-apply.mp4",
    headline: "Apply on autopilot",
    body: "Auto-apply fills out and submits applications for you, so you never miss a posting.",
  },
  {
    key: "outreach",
    video: "/onboarding-bg/outreach.mp4",
    headline: "Hyper personalized outreach",
    body: "Drafted straight into your email account.",
  },
  {
    key: "track",
    video: "/onboarding-bg/track.mp4",
    headline: "Never miss a response",
    body: "Contacts, applications, and follow-ups tracked in one pipeline, with Scout nudging your next move.",
  },
];

// Floating provider chips on the outreach slide, positioned inside the
// center column and drifting gently over the blurred video.
const OUTREACH_CHIPS: { src: string; alt: string; style: React.CSSProperties; delay: string }[] = [
  { src: GmailLogo, alt: "Gmail", style: { left: "14%", top: "16%" }, delay: "0s" },
  { src: OutlookLogo, alt: "Outlook", style: { right: "15%", top: "28%" }, delay: "1.3s" },
  { src: AppleMailLogo, alt: "Apple Mail", style: { left: "19%", bottom: "14%" }, delay: "2.2s" },
];

interface OnboardingSlidesProps {
  onDone: (skipped: boolean) => void;
  onViewSlide: (index: number) => void;
}

export const OnboardingSlides = ({ onDone, onViewSlide }: OnboardingSlidesProps) => {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];

  useEffect(() => onViewSlide(index), [index, onViewSlide]);

  const advance = () => (index < SLIDES.length - 1 ? setIndex(index + 1) : onDone(false));
  const back = () => index > 0 && setIndex(index - 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") advance();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={advance}
      className="min-h-screen flex flex-col"
      style={{
        background: OB.pageBg,
        color: OB.heading,
        cursor: "pointer",
        fontFamily: OB.fontBody,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes obSlideIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .ob-slide-anim { animation: obSlideIn .45s cubic-bezier(0.16,1,0.3,1); }
        @keyframes obVideoIn { from { opacity: 0; } to { opacity: 1; } }
        .ob-slide-video { animation: obVideoIn .8s ease forwards; }
        @keyframes obFloat { from { transform: translateY(-9px); } to { transform: translateY(9px); } }
        .ob-float-chip { animation: obFloat 4.5s ease-in-out infinite alternate; }
        @media (max-width: 640px) { .ob-float-chip { display: none; } }
        @media (prefers-reduced-motion: reduce) {
          .ob-slide-anim, .ob-float-chip { animation: none; }
          .ob-slide-video { animation: none; opacity: 1; }
        }
      `}</style>

      {/* Lightly blurred product recording behind everything, shown natural
          (no overlay) with a subtle blue cast baked into the encode; keyed so
          each slide crossfades its own clip in. */}
      <video
        key={slide.key}
        className="ob-slide-video"
        src={slide.video}
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "28px 36px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <img src={OfferloopLogo} alt="Offerloop" style={{ height: 34 }} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDone(true);
          }}
          style={{
            background: "rgba(255,255,255,.65)",
            border: `1px solid ${OB.border}`,
            color: OB.heading,
            borderRadius: 8,
            padding: "8px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: OB.fontBody,
          }}
        >
          Skip
        </button>
      </div>

      <div
        key={index}
        className="ob-slide-anim"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Floating email providers over the outreach slide */}
        {slide.key === "outreach" &&
          OUTREACH_CHIPS.map((chip) => (
            <span
              key={chip.alt}
              className="ob-float-chip"
              style={{
                position: "absolute",
                width: 64,
                height: 64,
                borderRadius: 18,
                background: "rgba(255,255,255,.94)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 12px 32px rgba(0,0,0,.35)",
                animationDelay: chip.delay,
                ...chip.style,
              }}
            >
              <img src={chip.src} alt={chip.alt} style={{ width: 34, maxHeight: 34, objectFit: "contain" }} />
            </span>
          ))}

        <h1
          style={{
            fontFamily: OB.fontDisplay,
            fontWeight: 600,
            fontSize: "clamp(32px, 5vw, 52px)",
            letterSpacing: "-0.02em",
            margin: "0 0 18px",
            maxWidth: 640,
            color: OB.heading,
          }}
        >
          {slide.headline}
        </h1>
        <p
          style={{
            fontSize: "clamp(16px, 2vw, 19px)",
            lineHeight: 1.65,
            color: OB.ink2,
            maxWidth: 480,
            margin: 0,
          }}
        >
          {slide.body}
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            advance();
          }}
          style={{
            marginTop: 40,
            height: 58,
            padding: "0 64px",
            borderRadius: 14,
            border: "none",
            background: OB.primary,
            color: "#fff",
            fontFamily: OB.fontBody,
            fontWeight: 600,
            fontSize: 17,
            cursor: "pointer",
            boxShadow: OB.shadowBlue,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = OB.primaryDark)}
          onMouseLeave={(e) => (e.currentTarget.style.background = OB.primary)}
        >
          Continue
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "0 0 44px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {SLIDES.map((s, i) => (
            <span
              key={s.key}
              style={{
                width: i === index ? 22 : 8,
                height: 8,
                borderRadius: 99,
                transition: "all .3s",
                background: i === index ? OB.primary : OB.primary200,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
