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
// Vibrant blue gradient for the primary CTA and active progress dot.
const CTA_GRADIENT = "linear-gradient(135deg, #7C97FF 0%, #5B7BF7 55%, #4863E8 100%)";
const CTA_GRADIENT_HOVER = "linear-gradient(135deg, #6B88F5 0%, #4A69E8 55%, #3A53D6 100%)";

// Blue emphasis for the load-bearing words in each slide's body.
const Em = ({ children }: { children: React.ReactNode }) => (
  <strong style={{ color: "#3D5BE0", fontWeight: 700 }}>{children}</strong>
);

const SLIDES: { key: string; video: string; headline: string; body: React.ReactNode }[] = [
  {
    key: "find-people",
    video: "/onboarding-bg/find-people.mp4",
    headline: "Find the right people",
    body: (
      <>
        Search <Em>2.2 billion professionals</Em>, from alumni at your school to people at your
        target firms, and instantly get their <Em>emails, LinkedIns, etc.</Em>
      </>
    ),
  },
  {
    key: "job-board",
    video: "/onboarding-bg/job-board.mp4",
    headline: "A job board built around you",
    body: (
      <>
        Every opening matched and scored against your resume. <Em>Nobody else</Em> sees this exact
        feed: it&apos;s hand picked for you from <Em>500,000+ live jobs</Em>.
      </>
    ),
  },
  {
    key: "auto-apply",
    video: "/onboarding-bg/auto-apply.mp4",
    headline: "Apply on autopilot",
    body: (
      <>
        Submits applications for you <Em>instantly</Em>, with custom cover letters and a resume
        tuned to get past AI screeners to a <Em>real person</Em>.
      </>
    ),
  },
  {
    key: "outreach",
    video: "/onboarding-bg/outreach.mp4",
    headline: "Hyper personalized outreach",
    body: (
      <>
        Drafted straight into <Em>your email account</Em>.
      </>
    ),
  },
  {
    key: "track",
    video: "/onboarding-bg/track.mp4",
    headline: "Never miss a response",
    body: (
      <>
        Contacts, applications, and follow-ups tracked in <Em>one pipeline</Em>, with Scout nudging
        your next move.
      </>
    ),
  },
];

// Floating provider chips on the outreach slide, clustered near the subtext
// and gently drifting; each sits at a slight angle. The Outlook PNG has more
// padding than the others, so its logo renders larger to match visually.
const OUTREACH_CHIPS: {
  src: string;
  alt: string;
  style: React.CSSProperties;
  delay: string;
  tilt: number;
  imgSize: number;
}[] = [
  { src: GmailLogo, alt: "Gmail", style: { left: "29%", top: "48%" }, delay: "0s", tilt: -8, imgSize: 34 },
  { src: OutlookLogo, alt: "Outlook", style: { right: "28%", top: "44%" }, delay: "1.3s", tilt: 7, imgSize: 48 },
  { src: AppleMailLogo, alt: "Apple Mail", style: { left: "35%", bottom: "18%" }, delay: "2.2s", tilt: -5, imgSize: 34 },
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

      {/* Frosted white header bar: mostly opaque, colored lockup */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 36px",
          position: "relative",
          zIndex: 1,
          background: "rgba(255,255,255,.82)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        {/* Fade skirt: the bar dissolves into the video over the next 100px */}
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            height: 100,
            background: "linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0))",
            pointerEvents: "none",
          }}
        />
        <img src={OfferloopLogo} alt="Offerloop" style={{ height: 34 }} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDone(true);
          }}
          style={{
            background: "transparent",
            border: `1px solid ${OB.primary200}`,
            color: OB.primary,
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
              style={{ position: "absolute", animationDelay: chip.delay, ...chip.style }}
            >
              <span
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  background: "rgba(255,255,255,.94)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 12px 32px rgba(0,0,0,.35)",
                  transform: `rotate(${chip.tilt}deg)`,
                  overflow: "hidden",
                }}
              >
                <img
                  src={chip.src}
                  alt={chip.alt}
                  style={{ width: chip.imgSize, maxHeight: chip.imgSize, objectFit: "contain" }}
                />
              </span>
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
            color: "#000",
          }}
        >
          {slide.headline}
        </h1>
        <p
          style={{
            fontSize: "clamp(17px, 2.1vw, 21px)",
            lineHeight: 1.6,
            fontWeight: 600,
            color: "#000",
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
            background: CTA_GRADIENT,
            color: "#fff",
            fontFamily: OB.fontBody,
            fontWeight: 600,
            fontSize: 17,
            cursor: "pointer",
            boxShadow: "0 10px 30px rgba(91,123,247,.4)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = CTA_GRADIENT_HOVER)}
          onMouseLeave={(e) => (e.currentTarget.style.background = CTA_GRADIENT)}
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
                background: i === index ? CTA_GRADIENT : OB.primary200,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
