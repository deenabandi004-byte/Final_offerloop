import { useEffect, useState } from "react";
import { Users, Mail, Briefcase, Send, KanbanSquare } from "lucide-react";
import { OB } from "./onboardingTheme";
import OfferloopLogo from "@/assets/offerloop_logo2_allwhite.png";

// Five click-through intro slides shown before the resume page. Full-bleed on
// the rail gradient; click anywhere (or ArrowRight/Enter/Space) advances.
const SLIDES = [
  {
    icon: Users,
    headline: "Find the right people",
    body: "Search 2.2 billion professionals: alumni from your school, people at your target firms.",
  },
  {
    icon: Mail,
    headline: "Reach out like you mean it",
    body: "AI-personalized emails written from your actual background, drafted straight into Gmail.",
  },
  {
    icon: Briefcase,
    headline: "A job board built around you",
    body: "Openings matched and scored against your resume, not a generic feed.",
  },
  {
    icon: Send,
    headline: "Apply on autopilot",
    body: "Auto-apply fills out and submits applications for you, so you never miss a posting.",
  },
  {
    icon: KanbanSquare,
    headline: "Never drop a thread",
    body: "Contacts, applications, and follow-ups tracked in one pipeline, with Scout nudging your next move.",
  },
];

interface OnboardingSlidesProps {
  onDone: (skipped: boolean) => void;
  onViewSlide: (index: number) => void;
}

export const OnboardingSlides = ({ onDone, onViewSlide }: OnboardingSlidesProps) => {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const Icon = slide.icon;

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
        background: OB.railGradient,
        color: "#fff",
        cursor: "pointer",
        fontFamily: OB.fontBody,
        position: "relative",
      }}
    >
      <style>{`
        @keyframes obSlideIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .ob-slide-anim { animation: obSlideIn .45s cubic-bezier(0.16,1,0.3,1); }
        @media (prefers-reduced-motion: reduce) { .ob-slide-anim { animation: none; } }
      `}</style>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "28px 36px",
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
            background: "rgba(255,255,255,.08)",
            border: "1px solid rgba(255,255,255,.18)",
            color: "#fff",
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
        }}
      >
        <span
          style={{
            display: "inline-flex",
            width: 74,
            height: 74,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(123,143,201,.18)",
            color: OB.railPeriwinkle,
            marginBottom: 34,
          }}
        >
          <Icon size={34} strokeWidth={1.5} />
        </span>
        <h1
          style={{
            fontFamily: OB.fontDisplay,
            fontWeight: 600,
            fontSize: "clamp(32px, 5vw, 52px)",
            letterSpacing: "-0.02em",
            margin: "0 0 18px",
            maxWidth: 640,
            color: "#fff",
          }}
        >
          {slide.headline}
        </h1>
        <p
          style={{
            fontSize: "clamp(16px, 2vw, 19px)",
            lineHeight: 1.65,
            color: OB.railHintText,
            maxWidth: 480,
            margin: 0,
          }}
        >
          {slide.body}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          padding: "0 0 44px",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {SLIDES.map((s, i) => (
            <span
              key={s.headline}
              style={{
                width: i === index ? 22 : 8,
                height: 8,
                borderRadius: 99,
                transition: "all .3s",
                background: i === index ? "#fff" : "rgba(255,255,255,.3)",
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,.5)" }}>Click anywhere to continue</span>
      </div>
    </div>
  );
};
