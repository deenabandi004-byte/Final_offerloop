import { Check } from "lucide-react";

const STEPS = [
  { number: 1, label: "Welcome" },
  { number: 2, label: "Profile" },
  { number: 3, label: "Academics" },
  { number: 4, label: "Preferences" },
];

interface OnboardingShellProps {
  currentStep: number; // 0-indexed (0 = Welcome, 4 = Preferences)
  children: React.ReactNode;
}

export const OnboardingShell = ({ currentStep, children }: OnboardingShellProps) => {
  const completedCount = currentStep; // steps before the current one are completed

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#FFFFFF" }}>
      {/* Left panel */}
      <div
        style={{
          width: 256,
          flexShrink: 0,
          background: "#060D1A",
          borderRight: "0.5px solid rgba(255,255,255,.06)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
        className="hidden md:flex"
      >
        {/* Logo */}
        <div style={{ padding: "20px 16px 16px" }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#FFFFFF",
              letterSpacing: "-0.02em",
              fontFamily: "var(--font-body)",
            }}
          >
            Offerloop
          </span>
        </div>

        {/* Step list */}
        <div style={{ padding: "0 8px", flex: 1 }}>
          {STEPS.map((step) => {
            const stepIndex = step.number - 1;
            const isCompleted = stepIndex < currentStep;
            const isActive = stepIndex === currentStep;

            return (
              <div
                key={step.number}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 10px",
                  borderRadius: 8,
                  background: isActive
                    ? "rgba(59,130,246,.18)"
                    : "transparent",
                  opacity: !isActive && !isCompleted ? 0.35 : 1,
                }}
              >
                {/* Dot */}
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    ...(isCompleted
                      ? {
                          background: "rgba(59,130,246,.18)",
                          border: "1px solid rgba(59,130,246,.3)",
                        }
                      : isActive
                        ? { background: "#3B82F6" }
                        : { border: "1px solid rgba(255,255,255,.15)" }),
                  }}
                >
                  {isCompleted ? (
                    <Check size={10} color="#93C5FD" />
                  ) : (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive
                          ? "#FFFFFF"
                          : "rgba(255,255,255,.4)",
                      }}
                    >
                      {step.number}
                    </span>
                  )}
                </div>

                {/* Label */}
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive
                      ? "#93C5FD"
                      : "rgba(255,255,255,.40)",
                  }}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div style={{ padding: "0 16px 24px", marginTop: "auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "rgba(255,255,255,.35)",
              marginBottom: 6,
            }}
          >
            <span>Progress</span>
            <span>{completedCount} of 4</span>
          </div>
          <div
            style={{
              height: 2,
              background: "rgba(255,255,255,.08)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: "#3B82F6",
                borderRadius: 2,
                width: `${(completedCount / 4) * 100}%`,
                transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div
        style={{
          flex: 1,
          background: "#FFFFFF",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            margin: "0 auto",
            padding: "48px 40px",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
