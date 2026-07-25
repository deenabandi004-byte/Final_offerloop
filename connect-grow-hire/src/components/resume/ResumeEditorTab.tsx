// Edit tab of the Resume page: the onboarding builder's prompt-to-edit loop,
// pointed at the user's stored resume.
//
// Load: GET /api/resume-builder/current converts users/{uid}.resumeParsed into
// the builder's canonical form + an HTML preview. Each prompt calls
// /api/resume-builder/generate with context:"editor" (free, daily cap,
// separate from the onboarding lifetime cap) and swaps in the updated draft.
// Nothing touches the stored resume until Save, which runs the builder
// finalize (one-page PDF to Storage + resumeParsed to Firestore) and hands
// control back to the parent via onSaved so the Tailor tab picks up the
// change. Users with no stored resume get the onboarding sectioned inputs.
import { useEffect, useState } from "react";
import { Loader2, Sparkles, Save, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  generateResumeBuilder,
  finalizeResumeBuilder,
  downloadResumeBuilderPdf,
  downloadPdfBlob,
  getResumeBuilderCurrent,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";

// Same guided sections as onboarding: labeled inputs beat one empty box.
const BUILDER_SECTIONS = [
  {
    key: "education",
    label: "Education",
    placeholder: "USC, Business Administration, Class of 2027. Add your GPA if you want it shown.",
  },
  {
    key: "experience",
    label: "Work experience",
    placeholder: "Sales associate at Men's Wearhouse, summer 2024. List each job, even part time.",
  },
  {
    key: "projects",
    label: "Projects",
    placeholder: "Case competitions, class projects, a personal site.",
  },
  {
    key: "leadership",
    label: "Leadership and activities",
    placeholder: "Clubs, teams, volunteering.",
  },
  {
    key: "skills",
    label: "Skills and interests",
    placeholder: "Excel, SQL, Spanish, Figma. Interests are welcome too.",
  },
] as const;

type SectionKey = (typeof BUILDER_SECTIONS)[number]["key"];

interface ResumeEditorTabProps {
  // Parent re-reads the user doc after a save so the shared resume state
  // (Tailor tab preview, filename row) reflects the new resume.
  onSaved: () => void;
}

const ResumeEditorTab = ({ onSaved }: ResumeEditorTabProps) => {
  const [sections, setSections] = useState<Record<SectionKey, string>>({
    education: "",
    experience: "",
    projects: "",
    leadership: "",
    skills: "",
  });
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [draft, setDraft] = useState<unknown | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // True once a prompt edit landed that hasn't been saved yet.
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getResumeBuilderCurrent();
        if (cancelled) return;
        setDraft(res.resume);
        setHtml(res.html);
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load resume for editing", e);
          setError("Couldn't load your resume. Refresh to try again.");
        }
      } finally {
        if (!cancelled) setLoadingCurrent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sectionsValid = Object.values(sections).some((v) => v.trim());

  const composePrompt = () =>
    BUILDER_SECTIONS.filter((s) => sections[s.key].trim())
      .map((s) => `${s.label.toUpperCase()}:\n${sections[s.key].trim()}`)
      .join("\n\n");

  const busy = generating || saving;
  const canGenerate = draft ? !!prompt.trim() : sectionsValid;

  const handleGenerate = async () => {
    const p = draft ? prompt.trim() : composePrompt();
    if (!p || busy) return;
    setError("");
    setGenerating(true);
    try {
      const res = await generateResumeBuilder(p, draft, "editor");
      setDraft(res.resume);
      setHtml(res.html);
      setDirty(true);
      if (draft) {
        setHistory((h) => [...h, prompt.trim()]);
        setPrompt("");
      }
    } catch (e) {
      setError(
        e instanceof Error && e.message === "editor_limit_reached"
          ? "You have hit the daily edit limit. It resets tomorrow."
          : "Couldn't apply that edit right now. Try again."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!draft || busy) return;
    setError("");
    setSaving(true);
    try {
      await finalizeResumeBuilder(draft);
      setDirty(false);
      toast({ title: "Resume saved", description: "Saved to your account as a PDF." });
      onSaved();
    } catch {
      setError("Couldn't save your resume. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!draft || downloading || generating) return;
    setError("");
    setDownloading(true);
    try {
      const blob = await downloadResumeBuilderPdf(draft);
      downloadPdfBlob(blob, "Offerloop_Resume.pdf");
    } catch {
      setError("Couldn't download the PDF. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (loadingCurrent) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 items-start" style={{ gridTemplateColumns: "1.35fr 1fr" }}>
      {/* Left: live preview of the draft (backend-rendered, same document the
          PDF download and Save produce). */}
      <div className="rounded-xl border border-line bg-white overflow-hidden">
        <div className="px-4 py-2 border-b border-line bg-paper-2 flex items-center justify-between">
          <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
            {dirty ? "Draft preview" : "Your resume"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {generating ? "Updating…" : dirty ? "Unsaved changes. Save to make this your resume." : ""}
          </span>
        </div>
        {html ? (
          <iframe
            title="Resume preview"
            srcDoc={html}
            sandbox=""
            style={{ width: "100%", height: "calc(100vh - 200px)", border: "none", display: "block" }}
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center text-center px-8"
            style={{ height: "calc(100vh - 200px)" }}
          >
            <p
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: "18px",
                fontWeight: 600,
                color: "#1E2D4D",
                marginBottom: "6px",
              }}
            >
              No resume yet
            </p>
            <p className="text-[13px] text-muted-foreground max-w-[360px]">
              Fill in what you have on the right and we write a Harvard-style one pager for you.
              You can also upload a file with the button above.
            </p>
          </div>
        )}
      </div>

      {/* Right rail: prompt card (or sectioned builder inputs), then save. */}
      <div className="lg:sticky lg:top-4 self-start space-y-4">
        <div
          className="bg-white border border-line rounded-xl"
          style={{ padding: "26px", boxShadow: "0 1px 2px rgba(26,26,26,0.05)" }}
        >
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: "22px",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "#1E2D4D",
            }}
          >
            {draft ? "Edit with a prompt" : "Make a resume"}
          </h2>
          <p
            className="mt-1"
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: "13.5px",
              lineHeight: 1.6,
              color: "#64748B",
            }}
          >
            {draft
              ? "Say what to change in plain words. The preview updates, and nothing is saved until you hit Save."
              : "Plain words are fine, fill in what you have. We research the places you mention and write the bullet points for you."}
          </p>

          {draft ? (
            <>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: add my SQL project from last summer, and make the club bullets stronger."
                className="min-h-[110px] mt-5"
              />
              {history.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {history.map((h, i) => (
                    <div
                      key={i}
                      className="text-[12.5px] rounded-lg px-2.5 py-1.5"
                      style={{ color: "#64748B", background: "#F7F8FD" }}
                    >
                      {h}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="mt-5 flex flex-col gap-3.5">
              {BUILDER_SECTIONS.map((s) => (
                <div key={s.key}>
                  <label
                    htmlFor={`editor-${s.key}`}
                    className="block text-[12.5px] font-semibold mb-1"
                    style={{ color: "#1E2D4D", fontFamily: "Inter, system-ui, sans-serif" }}
                  >
                    {s.label}
                  </label>
                  <Textarea
                    id={`editor-${s.key}`}
                    value={sections[s.key]}
                    onChange={(e) =>
                      setSections((prev) => ({ ...prev, [s.key]: e.target.value }))
                    }
                    placeholder={s.placeholder}
                    className="min-h-[56px]"
                  />
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-[13px] text-destructive mt-3">{error}</p>}

          <button
            disabled={!canGenerate || busy}
            onClick={handleGenerate}
            className="w-full mt-5 inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:shadow-none"
            style={{
              background: "#4A60A8",
              color: "#fff",
              borderRadius: "10px",
              padding: "14px",
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: "15px",
              fontWeight: 600,
              boxShadow: "0 6px 20px rgba(74,96,168,0.24)",
              border: "none",
              cursor: !canGenerate || busy ? "not-allowed" : "pointer",
            }}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generating
              ? draft
                ? "Applying your edit…"
                : "Writing your resume…"
              : draft
                ? "Apply edit"
                : "Generate my resume"}
          </button>
        </div>

        {!!draft && (
          <div
            className="bg-white border border-line rounded-xl"
            style={{ padding: "20px", boxShadow: "0 1px 2px rgba(26,26,26,0.05)" }}
          >
            <Button className="w-full" disabled={busy || !dirty} onClick={handleSave}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1.5" />
              )}
              {saving ? "Saving…" : dirty ? "Save as my resume" : "Saved"}
            </Button>
            <Button
              variant="outline"
              className="w-full mt-2"
              disabled={downloading || generating}
              onClick={handleDownload}
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1.5" />
              )}
              {downloading ? "Preparing PDF…" : "Download PDF"}
            </Button>
            <p className="text-[11.5px] text-muted-foreground mt-2 text-center">
              Save updates the resume Offerloop uses across the app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumeEditorTab;
