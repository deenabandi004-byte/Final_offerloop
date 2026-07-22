import { useState } from "react";
import { Loader2, Sparkles, FileText } from "lucide-react";
import { generateResumeBuilder, finalizeResumeBuilder } from "@/services/api";
import { ResumePrefill, resumePrefillFromParse } from "@/utils/onboardingPrefill";
import { OB, obPrimaryButton } from "./onboardingTheme";

// Empty Harvard outline shown before the first generation.
const GHOST_SECTIONS = ["Education", "Experience", "Projects", "Leadership", "Skills"];

interface OnboardingBuilderProps {
  onComplete: (prefill: ResumePrefill) => void;
  submitting: boolean;
}

export const OnboardingBuilder = ({ onComplete, submitting }: OnboardingBuilderProps) => {
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [resume, setResume] = useState<unknown | null>(null);
  const [html, setHtml] = useState("");
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    const p = prompt.trim();
    if (!p || generating) return;
    setError("");
    setGenerating(true);
    try {
      const res = await generateResumeBuilder(p, resume);
      setResume(res.resume);
      setHtml(res.html);
      setHistory((h) => [...h, p]);
      setPrompt("");
    } catch (e) {
      setError(
        e instanceof Error && e.message === "generation_limit_reached"
          ? "You've used all free generations. Upload a resume instead, or edit this one after onboarding."
          : "Couldn't generate right now. Your description is saved, try again."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleUse = async () => {
    if (!resume || finalizing) return;
    setError("");
    setFinalizing(true);
    try {
      const res = await finalizeResumeBuilder(resume);
      onComplete(resumePrefillFromParse(res.parsed));
    } catch {
      setError("Couldn't save your resume. Try again.");
      setFinalizing(false);
    }
  };

  const busy = generating || finalizing || submitting;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 380px) minmax(0, 1fr)", gap: 28 }}>
      {/* Left: prompt box + history */}
      <div>
        <label
          style={{ fontWeight: 600, fontSize: 14, color: OB.heading, display: "block", marginBottom: 8 }}
        >
          {resume ? "Refine it" : "Tell us what you've done"}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            resume
              ? "Example: add my SQL project from last summer, and make the club bullets stronger."
              : "Plain words are fine. School and year, jobs or internships, clubs, projects, anything you're proud of."
          }
          rows={7}
          style={{
            width: "100%",
            border: `1px solid ${OB.border}`,
            borderRadius: 10,
            padding: "12px 14px",
            fontFamily: OB.fontBody,
            fontSize: 15,
            color: OB.ink,
            resize: "vertical",
            outline: "none",
          }}
        />
        {history.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {history.map((h, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12.5,
                  color: OB.ink4,
                  background: OB.primary50,
                  borderRadius: 8,
                  padding: "7px 10px",
                }}
              >
                {h}
              </div>
            ))}
          </div>
        )}
        {error && <p style={{ fontSize: 13, color: "#DC2626", margin: "10px 0 0" }}>{error}</p>}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!prompt.trim() || busy}
          style={{
            ...obPrimaryButton,
            marginTop: 14,
            opacity: prompt.trim() && !busy ? 1 : 0.5,
            cursor: prompt.trim() && !busy ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {generating ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <Sparkles size={16} strokeWidth={1.7} />
          )}
          {generating ? "Writing your resume…" : resume ? "Refine resume" : "Generate my resume"}
        </button>
        {resume && (
          <button
            type="button"
            onClick={handleUse}
            disabled={busy}
            style={{
              ...obPrimaryButton,
              marginTop: 10,
              background: "#fff",
              color: OB.primary,
              border: `1.5px solid ${OB.primary}`,
              boxShadow: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: busy ? 0.5 : 1,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {finalizing || submitting ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <FileText size={16} strokeWidth={1.7} />
            )}
            Use this resume
          </button>
        )}
      </div>

      {/* Right: live Harvard outline / preview */}
      <div
        style={{
          border: `1px solid ${OB.border}`,
          borderRadius: 14,
          background: "#fff",
          minHeight: 480,
          boxShadow: OB.shadowLg,
          overflow: "hidden",
        }}
      >
        {html ? (
          <iframe
            title="Resume preview"
            srcDoc={html}
            sandbox=""
            style={{ width: "100%", height: 620, border: "none" }}
          />
        ) : (
          <div style={{ padding: "36px 40px" }}>
            <div style={{ height: 22, width: 180, borderRadius: 6, background: OB.primary100, marginBottom: 6 }} />
            <div style={{ height: 12, width: 260, borderRadius: 6, background: OB.primary50, marginBottom: 28 }} />
            {GHOST_SECTIONS.map((s) => (
              <div key={s} style={{ marginBottom: 26 }}>
                <div
                  style={{
                    fontFamily: OB.fontDisplay,
                    fontSize: 13,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: OB.ink4,
                    borderBottom: `1px solid ${OB.border}`,
                    paddingBottom: 5,
                    marginBottom: 12,
                  }}
                >
                  {s}
                </div>
                <div style={{ height: 10, width: "82%", borderRadius: 5, background: OB.primary50, marginBottom: 8 }} />
                <div style={{ height: 10, width: "64%", borderRadius: 5, background: OB.primary50 }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
