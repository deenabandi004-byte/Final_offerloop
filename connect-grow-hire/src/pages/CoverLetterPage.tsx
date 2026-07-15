// Standalone home for cover letters: generate one from a job posting (URL or
// pasted description) against the user's stored resume, edit it inline, copy
// it, or download it as a PDF. Hits the same job-board endpoints the Chrome
// extension already uses (generate-cover-letter, cover-letter-pdf) — see
// api.ts's generateCoverLetter / downloadCoverLetterPdf.
//
// Presentation redesigned 2026-07-10 from the Claude Design handoff
// (eyebrow / PageTitle / lead / 2-col grid with yeti + how-it-works rail).
// Flow, handlers, and PDF preview logic unchanged.
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { readScoutPrefill, SCOUT_PREFILL_EVENT } from "@/lib/scoutBridge";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Copy, Download, FileText, Link2 } from "lucide-react";
import { PageTitle } from "@/components/PageTitle";
import yetiPrepUrl from "@/assets/scouts/yeti-prep.png";
import { apiService } from "@/services/api";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { toast } from "@/hooks/use-toast";

// Backend minimum for a usable pasted job description when no URL is given.
const MIN_JD_LENGTH = 30;

const CoverLetterPage = () => {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();

  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");

  // Scout handoff: the "Open the Cover Letter workshop" chip after an
  // in-chat cover letter carries the job context (posting URL, title,
  // company) AND the generated letter itself through the bridge. Setting
  // `letter` here makes the finished letter and its PDF preview render on
  // arrival — no empty form, no paying credits to regenerate.
  const location = useLocation();
  useEffect(() => {
    const applyHandoff = () => {
      const prefill = readScoutPrefill(location.pathname + location.search);
      if (!prefill) return;
      if (prefill.job_url) setJobUrl(prefill.job_url);
      if (prefill.job_title) setJobTitle(prefill.job_title);
      if (prefill.company) setCompany(prefill.company);
      if (prefill.letter) setLetter(prefill.letter);
    };
    applyHandoff();
    window.addEventListener(SCOUT_PREFILL_EVENT, applyHandoff);
    return () => window.removeEventListener(SCOUT_PREFILL_EVENT, applyHandoff);
  }, [location.pathname, location.search]);

  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [letter, setLetter] = useState<string | null>(null);
  const [needsResume, setNeedsResume] = useState(false);

  const canGenerate =
    !generating && (!!jobUrl.trim() || jobDescription.trim().length >= MIN_JD_LENGTH);

  const handleGenerate = async () => {
    if (!user?.uid) return;
    setGenerating(true);
    setNeedsResume(false);
    try {
      const res = await apiService.generateCoverLetter({
        userId: user.uid,
        jobUrl: jobUrl.trim() || undefined,
        jobDescription: jobDescription.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
      });
      setLetter(res.coverLetter.content);
      // Backfill fields the server resolved from the URL/pasted text so the
      // PDF filename and the form reflect the real target company/role.
      if (!company.trim() && res.company) setCompany(res.company);
      if (!jobTitle.trim() && res.jobTitle) setJobTitle(res.jobTitle);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate cover letter";
      if (msg.includes("No resume")) {
        setNeedsResume(true);
      } else {
        toast({ title: "Generation failed", description: msg, variant: "destructive" });
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!letter) return;
    await navigator.clipboard.writeText(letter);
    toast({ title: "Copied", description: "Cover letter copied to clipboard" });
  };

  const handleDownload = async () => {
    if (!letter) return;
    setDownloading(true);
    try {
      const blob = await apiService.downloadCoverLetterPdf(letter, company.trim() || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(company.trim() || "cover").replace(/\s+/g, "_")}_cover_letter.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to download PDF";
      toast({ title: "Download failed", description: msg, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-paper font-sans text-ink">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Cover Letter" />
          <div className="flex-1 overflow-y-auto">
            <div
              className="max-w-[1240px] mx-auto"
              style={{ padding: "30px 34px 52px" }}
            >
              {/* Eyebrow + PageTitle + lead */}
              <div className="mb-[26px]">
                <div
                  className="mb-[10px]"
                  style={{
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: "#4A60A8",
                    textTransform: "uppercase",
                  }}
                >
                  Cover Letter
                </div>
                <div style={{ maxWidth: "640px" }}>
                  <PageTitle
                    lead="Generate a cover letter that"
                    accent="reads like you"
                    size="lg"
                  />
                </div>
                <p
                  className="mt-[14px]"
                  style={{
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontSize: "15px",
                    lineHeight: 1.65,
                    color: "#64748B",
                    maxWidth: "560px",
                  }}
                >
                  Paste a job — Scout drafts a tailored letter from your stored resume,
                  in your voice. Edit any line, then download the exact PDF.
                </p>
              </div>

              {/* 2-column grid: form (left) + rail (right). Matches Resume's
                  1.35fr 1fr proportions so both pages feel like siblings. */}
              <div
                className="grid gap-6 items-start"
                style={{ gridTemplateColumns: "1.35fr 1fr" }}
              >
                {/* Left: form card */}
                <div
                  className="bg-white border border-line rounded-xl"
                  style={{ padding: "26px", boxShadow: "0 1px 2px rgba(26,26,26,0.05)" }}
                >
                  <div
                    style={{
                      fontFamily: "Inter, system-ui, sans-serif",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#1E2D4D",
                    }}
                  >
                    Point Scout at the job
                  </div>

                  {/* URL input with Link2 leading icon */}
                  <div className="relative mt-3">
                    <Link2
                      className="absolute pointer-events-none"
                      style={{
                        left: "13px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: "16px",
                        height: "16px",
                        color: "#94A3B8",
                      }}
                    />
                    <Input
                      value={jobUrl}
                      onChange={(e) => setJobUrl(e.target.value)}
                      placeholder="Paste a job posting URL"
                      style={{ paddingLeft: "38px" }}
                    />
                  </div>

                  {/* "or paste it" divider */}
                  <div
                    className="flex items-center"
                    style={{ gap: "12px", margin: "16px 0" }}
                  >
                    <div style={{ flex: 1, height: "1px", background: "#E5E7EC" }} />
                    <span
                      style={{
                        fontFamily: "Inter, system-ui, sans-serif",
                        fontSize: "11px",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        color: "#94A3B8",
                        textTransform: "uppercase",
                      }}
                    >
                      Or paste it
                    </span>
                    <div style={{ flex: 1, height: "1px", background: "#E5E7EC" }} />
                  </div>

                  {/* Textarea + character counter */}
                  <div className="relative">
                    <Textarea
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Paste the full job description here — the more detail, the sharper the match."
                      className="min-h-[140px]"
                      style={{ paddingBottom: "30px" }}
                    />
                    <span
                      className="absolute"
                      style={{
                        right: "12px",
                        bottom: "10px",
                        fontFamily: "Inter, system-ui, sans-serif",
                        fontSize: "11px",
                        fontWeight: 500,
                        background: "#fff",
                        padding: "1px 4px",
                        borderRadius: "6px",
                        color:
                          jobDescription.length >= MIN_JD_LENGTH
                            ? "#4A60A8"
                            : "#94A3B8",
                      }}
                    >
                      {jobDescription.length >= MIN_JD_LENGTH
                        ? `${jobDescription.length} chars`
                        : `${jobDescription.length} / ${MIN_JD_LENGTH}`}
                    </span>
                  </div>

                  {/* Primary button with credits pill */}
                  <button
                    disabled={!canGenerate}
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
                      cursor: !canGenerate ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (canGenerate) e.currentTarget.style.background = "#3C4F8E";
                    }}
                    onMouseLeave={(e) => {
                      if (canGenerate) e.currentTarget.style.background = "#4A60A8";
                    }}
                    onMouseDown={(e) => {
                      if (canGenerate) e.currentTarget.style.background = "#34457A";
                    }}
                    onMouseUp={(e) => {
                      if (canGenerate) e.currentTarget.style.background = "#3C4F8E";
                    }}
                  >
                    {generating ? "Generating..." : "Generate cover letter"}
                    {!generating && (
                      <span
                        style={{
                          background: "rgba(255,255,255,0.18)",
                          borderRadius: "99px",
                          padding: "2px 9px",
                          fontSize: "12px",
                          fontWeight: 600,
                          marginLeft: "6px",
                        }}
                      >
                        5 credits
                      </span>
                    )}
                  </button>

                  {needsResume && (
                    <div className="mt-4 rounded-lg border border-line bg-paper p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="text-[13px] text-ink">Upload your resume first</p>
                      </div>
                      <Button size="sm" onClick={() => navigate("/resume")}>
                        Go to Resume
                      </Button>
                    </div>
                  )}

                  {letter !== null && (
                    <div className="mt-5 pt-5 border-t border-line">
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                        <div
                          style={{
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#1E2D4D",
                          }}
                        >
                          Your cover letter
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={handleCopy}
                            className="inline-flex items-center transition-colors"
                            style={{
                              background: "#fff",
                              color: "#1E2D4D",
                              border: "1px solid #D6DEF3",
                              borderRadius: "8px",
                              padding: "7px 12px",
                              fontFamily: "Inter, system-ui, sans-serif",
                              fontSize: "13px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#EEF1FB";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#fff";
                            }}
                          >
                            <Copy className="w-3.5 h-3.5 mr-1.5" />
                            Copy
                          </button>
                          <button
                            type="button"
                            disabled={downloading}
                            onClick={handleDownload}
                            className="inline-flex items-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              background: "#4A60A8",
                              color: "#fff",
                              border: "none",
                              borderRadius: "8px",
                              padding: "7px 14px",
                              fontFamily: "Inter, system-ui, sans-serif",
                              fontSize: "13px",
                              fontWeight: 600,
                              boxShadow: "0 3px 10px rgba(74,96,168,0.22)",
                              cursor: downloading ? "not-allowed" : "pointer",
                            }}
                            onMouseEnter={(e) => {
                              if (!downloading) e.currentTarget.style.background = "#3C4F8E";
                            }}
                            onMouseLeave={(e) => {
                              if (!downloading) e.currentTarget.style.background = "#4A60A8";
                            }}
                            onMouseDown={(e) => {
                              if (!downloading) e.currentTarget.style.background = "#34457A";
                            }}
                            onMouseUp={(e) => {
                              if (!downloading) e.currentTarget.style.background = "#3C4F8E";
                            }}
                          >
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            {downloading ? "Preparing..." : "Download PDF"}
                          </button>
                        </div>
                      </div>
                      <Textarea
                        value={letter}
                        onChange={(e) => setLetter(e.target.value)}
                        className="min-h-[180px] max-h-[320px] font-mono text-[12.5px] leading-relaxed"
                      />
                      <p
                        className="mt-2"
                        style={{
                          fontFamily: "Inter, system-ui, sans-serif",
                          fontSize: "11.5px",
                          color: "#64748B",
                        }}
                      >
                        Edit inline if you want — the PDF matches what you see.
                      </p>
                    </div>
                  )}
                </div>

                {/* Right rail: yeti + how it works */}
                <div className="lg:sticky lg:top-6 self-start space-y-4">
                  {/* Yeti card */}
                  <div
                    style={{
                      border: "1px solid #D6DEF3",
                      borderRadius: "16px",
                      background: "linear-gradient(180deg, #EEF1FB, #F7F8FD)",
                      padding: "20px",
                      textAlign: "center",
                    }}
                  >
                    <img
                      src={yetiPrepUrl}
                      alt=""
                      style={{
                        width: "88px",
                        height: "auto",
                        margin: "0 auto 12px",
                        filter: "drop-shadow(0 6px 12px rgba(74,96,168,0.2))",
                      }}
                    />
                    <h3
                      style={{
                        fontFamily: "'Libre Baskerville', Georgia, serif",
                        fontSize: "18px",
                        fontWeight: 600,
                        color: "#1E2D4D",
                        marginBottom: "6px",
                      }}
                    >
                      Scout writes it for you
                    </h3>
                    <p
                      style={{
                        fontFamily: "Inter, system-ui, sans-serif",
                        fontSize: "12.5px",
                        lineHeight: 1.55,
                        color: "#64748B",
                      }}
                    >
                      Trained on your resume and the posting — so it sounds like you,
                      not a template.
                    </p>
                  </div>

                  {/* How it works card */}
                  <div
                    className="bg-white border border-line rounded-xl"
                    style={{ padding: "20px", boxShadow: "0 1px 2px rgba(26,26,26,0.05)" }}
                  >
                    <div
                      className="mb-3"
                      style={{
                        fontFamily: "Inter, system-ui, sans-serif",
                        fontSize: "11px",
                        fontWeight: 600,
                        letterSpacing: "0.09em",
                        color: "#94A3B8",
                        textTransform: "uppercase",
                      }}
                    >
                      How it works
                    </div>
                    <div className="flex flex-col" style={{ gap: "14px" }}>
                      {[
                        {
                          n: 1,
                          title: "Reads the posting",
                          desc: "Pulls the role, team, and what they're really after.",
                        },
                        {
                          n: 2,
                          title: "Mines your resume",
                          desc: "Matches your real wins to what the job needs.",
                        },
                        {
                          n: 3,
                          title: "Writes in your voice",
                          desc: "A tight, specific draft you can edit and ship.",
                        },
                      ].map((step) => (
                        <div key={step.n} className="flex" style={{ gap: "12px" }}>
                          <div
                            style={{
                              width: "22px",
                              flexShrink: 0,
                              fontFamily: "'Libre Baskerville', Georgia, serif",
                              fontSize: "22px",
                              fontWeight: 600,
                              color: "#4A60A8",
                              lineHeight: 1,
                            }}
                          >
                            {step.n}
                          </div>
                          <div>
                            <div
                              style={{
                                fontFamily: "Inter, system-ui, sans-serif",
                                fontSize: "13.5px",
                                fontWeight: 600,
                                color: "#0A0A0A",
                                marginBottom: "2px",
                              }}
                            >
                              {step.title}
                            </div>
                            <div
                              style={{
                                fontFamily: "Inter, system-ui, sans-serif",
                                fontSize: "12.5px",
                                lineHeight: 1.5,
                                color: "#64748B",
                              }}
                            >
                              {step.desc}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default CoverLetterPage;
