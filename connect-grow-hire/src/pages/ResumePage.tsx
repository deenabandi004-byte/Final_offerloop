// Resume home, two tabs:
//   1. "Edit resume"    — the live real-PDF preview (dominant element) + a
//                         score rail: score the resume against a Harvard
//                         rubric, review path-targeted recommendations,
//                         approve a subset, apply them, and watch the PDF +
//                         score update. The structured field-by-field form
//                         editor that used to live here is gone (see git
//                         history) — approving a recommendation is now the
//                         only way to edit resume text on this page.
//   2. "Tailor to a job" — the same score-and-approve loop in job-fit mode:
//                         paste a job URL (parsed via /job-board/parse-job-url)
//                         or a >=50-char description, "Score for this job"
//                         returns a fit score + tailoring recommendations,
//                         approved changes apply to the same resumeParsed and
//                         show on the shared PDF preview. Free (no credits);
//                         the old 20-credit ResumeOptimizationModal flow was
//                         removed from this page (git history keeps it).
//
// Load path: users/{uid}.resumeParsed -> normalizeParsedResumeFromFirestore.
// Also loads resumeScore/resumeScoreLabel/resumeScoredAt so the last score
// persists across visits.
// Upload path: POST /api/parse-resume (server parses AND stores the full
// resumeParsed) -> persist the file to Storage + resumeUrl/resumeFileName/
// resumeUpdatedAt -> re-read the user doc so the preview repopulates.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { readScoutPrefill, SCOUT_PREFILL_EVENT } from "@/lib/scoutBridge";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import RecommendedChangesPanel from "@/components/resume/RecommendedChangesPanel";
import {
  Upload,
  Download,
  RefreshCw,
  Sparkles,
  Loader2,
  Wand2,
  ArrowUp,
  ArrowDown,
  Link2,
  Briefcase,
  Building2,
} from "lucide-react";
import { PageTitle } from "@/components/PageTitle";
import yetiFindUrl from "@/assets/scouts/yeti-find.png";
import { db, storage, auth } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { apiService, BACKEND_URL } from "@/services/api";
import type { ResumeScoreRecommendation, ResumeScoreResponse } from "@/services/api";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import { toast } from "@/hooks/use-toast";
import type { ParsedResume } from "@/types/resume";
import { emptyParsedResume, normalizeParsedResumeFromFirestore } from "@/types/resume";
import { generateResumePDF } from "@/utils/resumePDFGenerator";

// Backend minimum jobDescription length for /api/resume/score job-fit mode.
const TAILOR_MIN_JD_LENGTH = 50;

// Tab strip removed 2026-07-10 as part of the design handoff. The Edit-tab
// render path is retained for now but unreachable; delete in follow-up.
type ResumeTab = "edit" | "tailor";

// Rail state machine for the score-and-approve loop. Two independent
// instances run on this page: the general (Edit tab) machine and the job-fit
// (Tailor tab) machine. They share resumeData, so a single busy lock keeps
// them from interleaving.
type ScoreState = "idle" | "scoring" | "scored" | "applying" | "rescoring";

function machineBusy(s: ScoreState): boolean {
  return s === "scoring" || s === "applying" || s === "rescoring";
}

// Job context sent to /api/resume/score in job-fit mode; remembered per
// scoring run so the post-apply auto-rescore uses the exact same posting.
type JobContext = { jobDescription: string; jobTitle?: string; company?: string };

function isPlausibleUrl(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

function normalizeWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

// Verify-then-replace: apply every APPROVED recommendation to `data`,
// building one new object immutably. A recommendation is skipped (not
// applied) if the live text at its target no longer matches `current`
// (whitespace-normalized) — e.g. the resume changed since scoring.
function applyRecommendations(
  data: ParsedResume,
  recs: ResumeScoreRecommendation[]
): { next: ParsedResume; applied: number; skipped: number } {
  let next = data;
  let applied = 0;
  let skipped = 0;

  for (const rec of recs) {
    const target = rec.target;
    if (target.section === "experience") {
      const exp = next.experience?.[target.index];
      const current = exp?.bullets?.[target.bullet];
      if (
        exp &&
        typeof current === "string" &&
        normalizeWhitespace(current) === normalizeWhitespace(rec.current)
      ) {
        const bullets = [...exp.bullets];
        bullets[target.bullet] = rec.proposed;
        const experience = [...next.experience];
        experience[target.index] = { ...exp, bullets };
        next = { ...next, experience };
        applied += 1;
      } else {
        skipped += 1;
      }
    } else if (target.section === "projects") {
      const proj = next.projects?.[target.index];
      if (
        proj &&
        normalizeWhitespace(proj.description || "") === normalizeWhitespace(rec.current)
      ) {
        const projects = [...next.projects];
        projects[target.index] = { ...proj, description: rec.proposed };
        next = { ...next, projects };
        applied += 1;
      } else {
        skipped += 1;
      }
    } else {
      skipped += 1;
    }
  }

  return { next, applied, skipped };
}

function scoreColor(score: number): string {
  if (score >= 90) return "#16A34A";
  if (score >= 75) return "#3B82F6";
  if (score >= 60) return "#D97706";
  return "#DC2626";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ResumePage = () => {
  const { user } = useFirebaseAuth();
  const uid = user?.uid;

  const [activeTab, setActiveTab] = useState<ResumeTab>("tailor");

  // Resume state (source of truth for the preview + PDF download).
  const [resumeData, setResumeData] = useState<ParsedResume>(() => emptyParsedResume());
  const [loading, setLoading] = useState(true);
  const [hasStoredResume, setHasStoredResume] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeUpdatedAt, setResumeUpdatedAt] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tailor (job-fit) inputs
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");

  // Scout handoff: a ?tab=tailor arrival selects the Tailor tab, and a
  // bridge prefill (Scout's "Open your resume" chip after a job-specific
  // tailoring) pastes the job posting URL into the Tailor input. Re-runs on
  // URL changes and on the in-place prefill event so an already-mounted page
  // picks it up too.
  const location = useLocation();
  useEffect(() => {
    const applyHandoff = () => {
      const tab = new URLSearchParams(location.search).get("tab");
      if (tab === "tailor") setActiveTab("tailor");
      const prefill = readScoutPrefill(location.pathname + location.search);
      if (prefill?.job_url) {
        setActiveTab("tailor");
        setJobUrl(prefill.job_url);
      }
    };
    applyHandoff();
    window.addEventListener(SCOUT_PREFILL_EVENT, applyHandoff);
    return () => window.removeEventListener(SCOUT_PREFILL_EVENT, applyHandoff);
  }, [location.pathname, location.search]);

  // ---- Score-and-approve state ---------------------------------------------
  const [scoreState, setScoreState] = useState<ScoreState>("idle");
  const [scoreResult, setScoreResult] = useState<ResumeScoreResponse | null>(null);
  // Bumped on every fresh scoring run; keys the RecommendedChangesPanel so
  // approve/reject decisions never leak across runs (rec ids repeat: rec_1…).
  const [scoreRunId, setScoreRunId] = useState(0);
  // Persisted last-score chip, read from the user doc and updated after every
  // successful score.
  const [resumeScore, setResumeScore] = useState<number | null>(null);
  const [resumeScoreLabel, setResumeScoreLabel] = useState<string | null>(null);
  const [resumeScoredAt, setResumeScoredAt] = useState<string | null>(null);
  // Shown once, right after an apply+rescore cycle completes.
  const [scoreDelta, setScoreDelta] = useState<{ prev: number; next: number } | null>(null);
  // ---- Job-fit (Tailor tab) score state — SEPARATE machine from the general
  // score above. Job-fit results are in-memory only: they are never written
  // to resumeScore/resumeScoreLabel/resumeScoredAt (those stay general-mode).
  const [fitState, setFitState] = useState<ScoreState>("idle");
  const [fitResult, setFitResult] = useState<ResumeScoreResponse | null>(null);
  const [fitRunId, setFitRunId] = useState(0);
  const [fitDelta, setFitDelta] = useState<{ prev: number; next: number } | null>(null);
  // The job context of the last fit scoring, so the post-apply auto-rescore
  // scores against the exact same posting (not re-resolved inputs).
  const fitContextRef = useRef<JobContext | null>(null);

  // Synchronous re-entrancy lock shared by ALL score/apply handlers (both the
  // general and the job-fit machine — they mutate the same resumeData). The
  // state-machine guards below read closure state, so two invocations landing
  // before React re-renders (e.g. a double-click) could both pass them; this
  // ref flips immediately and is released in each handler's finally.
  const busyLockRef = useRef(false);

  // ---- Single-shot Claude tailor (restored 2026-07-10) ----------------------
  // Wires the Tailor button to POST /api/resume/tailor (Anthropic Opus 4.7),
  // which reads resumeParsed, normalizes to CanonicalResume, applies Firecrawl
  // to a URL if given, and returns a tailored canonical PDF. The tailored URL
  // opens in a new tab and also replaces the live preview.
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorResult, setTailorResult] = useState<{
    pdfUrl: string;
    jobTitle: string | null;
    company: string | null;
    updatedAt: string;
  } | null>(null);

  const loadResume = useCallback(async (userId: string) => {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      const parsed = data?.resumeParsed
        ? normalizeParsedResumeFromFirestore(data.resumeParsed)
        : null;
      const next = parsed || emptyParsedResume();
      setResumeData(next);
      setHasStoredResume(!!parsed);
      setResumeFileName((data?.resumeFileName as string) || null);
      setResumeUpdatedAt((data?.resumeUpdatedAt as string) || null);
      setResumeScore(typeof data?.resumeScore === "number" ? (data.resumeScore as number) : null);
      setResumeScoreLabel((data?.resumeScoreLabel as string) || null);
      setResumeScoredAt((data?.resumeScoredAt as string) || null);
    } catch (e) {
      console.error("Failed to load resume from Firestore", e);
      toast({ title: "Failed to load resume", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (uid) loadResume(uid);
  }, [uid, loadResume]);

  // Real-PDF live preview: regenerate the ACTUAL ResumePDF document (the same
  // one Download saves) shortly after resumeData changes (e.g. once approved
  // edits are applied), and display it in the browser's PDF viewer so it
  // reads as a true paginated sheet of paper. The previous blob stays on
  // screen while the next renders — no blank flash.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewRendering, setPreviewRendering] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreviewRendering(true);
    const timer = setTimeout(async () => {
      try {
        const blob = await generateResumePDF(resumeData);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      } catch {
        // Keep the last good preview; the next edit retries.
      } finally {
        if (!cancelled) setPreviewRendering(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [resumeData]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    []
  );

  // ---- Actions --------------------------------------------------------------

  // Minimal internal save used only by the apply flow (no manual field
  // editing exists anymore, so there's no separate dirty-tracked Save button).
  const persistResumeParsed = useCallback(
    async (next: ParsedResume) => {
      if (!uid) return;
      const updatedAt = new Date().toISOString();
      await updateDoc(doc(db, "users", uid), {
        resumeParsed: next,
        resumeUpdatedAt: updatedAt,
      });
      setResumeUpdatedAt(updatedAt);
      setHasStoredResume(true);
    },
    [uid]
  );

  const persistScore = useCallback(
    async (result: ResumeScoreResponse) => {
      if (!uid) return;
      const scoredAt = new Date().toISOString();
      await updateDoc(doc(db, "users", uid), {
        resumeScore: result.score,
        resumeScoreLabel: result.score_label,
        resumeScoredAt: scoredAt,
      });
      setResumeScore(result.score);
      setResumeScoreLabel(result.score_label);
      setResumeScoredAt(scoredAt);
    },
    [uid]
  );

  const handleScore = useCallback(async () => {
    if (busyLockRef.current) return;
    if (!hasStoredResume || uploading || machineBusy(scoreState) || machineBusy(fitState)) {
      return;
    }
    busyLockRef.current = true;
    try {
      setScoreState("scoring");
      setScoreDelta(null);
      try {
        const result = await apiService.scoreResume(resumeData);
        setScoreResult(result);
        setScoreRunId((n) => n + 1);
        await persistScore(result);
        setScoreState("scored");
      } catch (e) {
        console.error("Resume scoring failed", e);
        toast({
          title: "Couldn't score your resume",
          description: e instanceof Error ? e.message : undefined,
          variant: "destructive",
        });
        setScoreState("idle");
      }
    } finally {
      busyLockRef.current = false;
    }
  }, [hasStoredResume, uploading, resumeData, scoreState, fitState, persistScore]);

  // Commits the APPROVED recommendation ids handed up by the review panel,
  // then auto-rescores.
  const handleApplyApproved = useCallback(async (ids: string[]) => {
    if (busyLockRef.current) return;
    if (!scoreResult || scoreState !== "scored" || uploading || machineBusy(fitState)) return;
    busyLockRef.current = true;
    try {
      const selected = scoreResult.recommendations.filter((r) => ids.includes(r.id));
      if (selected.length === 0) {
        toast({ title: "Approve at least one change to apply" });
        return;
      }

      setScoreState("applying");
      const { next, applied, skipped } = applyRecommendations(resumeData, selected);

      if (applied === 0) {
        toast({
          title: "Nothing applied",
          description: "Your resume changed since scoring — try re-scoring first.",
          variant: "destructive",
        });
        setScoreState("scored");
        return;
      }

      try {
        // One atomic state update, then one save. The existing debounced
        // preview effect picks up the resumeData change automatically.
        setResumeData(next);
        await persistResumeParsed(next);

        toast({
          title: skipped > 0 ? `${applied} applied, ${skipped} skipped` : `${applied} applied`,
          description:
            skipped > 0 ? "Some changes no longer matched your resume and were skipped." : undefined,
        });

        const prevScore = scoreResult.score;
        setScoreState("rescoring");
        try {
          // Pass the freshly-computed resume directly rather than relying on
          // resumeData state having settled.
          const rescored = await apiService.scoreResume(next);
          setScoreResult(rescored);
          setScoreRunId((n) => n + 1);
          await persistScore(rescored);
          setScoreDelta({ prev: prevScore, next: rescored.score });
          setScoreState("scored");
        } catch (e) {
          console.error("Auto-rescore failed", e);
          toast({
            title: "Changes applied, but rescoring failed",
            description: e instanceof Error ? e.message : "Click Score my resume to try again.",
            variant: "destructive",
          });
          setScoreState("idle");
        }
      } catch (e) {
        console.error("Failed to save applied changes", e);
        toast({
          title: "Failed to save your resume",
          description: e instanceof Error ? e.message : undefined,
          variant: "destructive",
        });
        setScoreState("scored");
      }
    } finally {
      busyLockRef.current = false;
    }
  }, [scoreResult, scoreState, fitState, uploading, resumeData, persistResumeParsed, persistScore]);

  // ---- Job-fit (Tailor tab) handlers ---------------------------------------

  const handleFitScore = useCallback(async () => {
    if (busyLockRef.current) return;
    if (!hasStoredResume || uploading || machineBusy(scoreState) || machineBusy(fitState)) {
      return;
    }
    busyLockRef.current = true;
    try {
      const prevState: ScoreState = fitState;
      setFitState("scoring");
      setFitDelta(null);

      let description = jobDescription.trim();
      let title = jobTitle.trim();
      let companyName = company.trim();

      // If a URL is present, read the posting and backfill EMPTY fields only
      // (typed values win). Mirrors RecruiterSpreadsheetPage's parse handling.
      if (jobUrl.trim()) {
        try {
          const parseResponse = await apiService.parseJobUrl({ url: jobUrl.trim() });
          if (parseResponse.job) {
            if (parseResponse.job.description && !description) {
              description = parseResponse.job.description.trim();
              setJobDescription(description);
            }
            if (parseResponse.job.title && !title) {
              title = parseResponse.job.title.trim();
              setJobTitle(title);
            }
            if (parseResponse.job.company && !companyName) {
              companyName = parseResponse.job.company.trim();
              setCompany(companyName);
            }
          } else {
            console.warn("Failed to parse job URL:", parseResponse.error);
            toast({
              title: "Could not read that URL — paste the description instead",
            });
          }
        } catch (error) {
          console.error("Error parsing job URL:", error);
          toast({
            title: "Could not read that URL — paste the description instead",
          });
        }
      }

      if (description.length < TAILOR_MIN_JD_LENGTH) {
        toast({
          title: "Job description required",
          description: `Paste at least ${TAILOR_MIN_JD_LENGTH} characters of the job description, or use a link we can read.`,
          variant: "destructive",
        });
        setFitState(prevState);
        return;
      }

      const jobContext: JobContext = {
        jobDescription: description,
        ...(title ? { jobTitle: title } : {}),
        ...(companyName ? { company: companyName } : {}),
      };
      fitContextRef.current = jobContext;

      try {
        const result = await apiService.scoreResume(resumeData, jobContext);
        setFitResult(result);
        setFitRunId((n) => n + 1);
        setFitState("scored");
      } catch (e) {
        console.error("Job-fit scoring failed", e);
        toast({
          title: "Couldn't score your resume for this job",
          description: e instanceof Error ? e.message : undefined,
          variant: "destructive",
        });
        setFitState(prevState);
      }
    } finally {
      busyLockRef.current = false;
    }
  }, [
    hasStoredResume,
    uploading,
    scoreState,
    fitState,
    jobUrl,
    jobDescription,
    jobTitle,
    company,
    resumeData,
  ]);

  const handleFitApplyApproved = useCallback(async (ids: string[]) => {
    if (busyLockRef.current) return;
    if (!fitResult || fitState !== "scored" || uploading || machineBusy(scoreState)) return;
    busyLockRef.current = true;
    try {
      const selected = fitResult.recommendations.filter((r) => ids.includes(r.id));
      if (selected.length === 0) {
        toast({ title: "Approve at least one change to apply" });
        return;
      }

      setFitState("applying");
      const { next, applied, skipped } = applyRecommendations(resumeData, selected);

      if (applied === 0) {
        toast({
          title: "Nothing applied",
          description: "Your resume changed since scoring — try re-scoring first.",
          variant: "destructive",
        });
        setFitState("scored");
        return;
      }

      try {
        // Same apply engine as the Edit tab: one atomic state update, one
        // save; the shared debounced preview effect picks up the change.
        setResumeData(next);
        await persistResumeParsed(next);

        toast({
          title: skipped > 0 ? `${applied} applied, ${skipped} skipped` : `${applied} applied`,
          description:
            skipped > 0 ? "Some changes no longer matched your resume and were skipped." : undefined,
        });

        const prevScore = fitResult.score;
        setFitState("rescoring");
        try {
          // Auto-rescore with the SAME job context as the last fit scoring,
          // passing the freshly-computed resume directly. Job-fit results are
          // NOT persisted to the user doc's resumeScore fields.
          const rescored = await apiService.scoreResume(
            next,
            fitContextRef.current ?? undefined
          );
          setFitResult(rescored);
          setFitRunId((n) => n + 1);
          setFitDelta({ prev: prevScore, next: rescored.score });
          setFitState("scored");
        } catch (e) {
          console.error("Job-fit auto-rescore failed", e);
          toast({
            title: "Changes applied, but rescoring failed",
            description:
              e instanceof Error ? e.message : "Click Score for this job to try again.",
            variant: "destructive",
          });
          setFitState("idle");
        }
      } catch (e) {
        console.error("Failed to save applied changes", e);
        toast({
          title: "Failed to save your resume",
          description: e instanceof Error ? e.message : undefined,
          variant: "destructive",
        });
        setFitState("scored");
      }
    } finally {
      busyLockRef.current = false;
    }
  }, [fitResult, fitState, scoreState, uploading, resumeData, persistResumeParsed]);

  const handleTailorWithClaude = useCallback(async () => {
    if (isTailoring) return;
    if (!hasStoredResume) {
      toast({
        title: "Upload your resume first",
        description: "Add a resume in Account Settings, then come back here to tailor it.",
        variant: "destructive",
      });
      return;
    }
    const url = jobUrl.trim();
    const desc = jobDescription.trim();
    if (!url && desc.length < TAILOR_MIN_JD_LENGTH) {
      toast({
        title: "Job description required",
        description: `Paste at least ${TAILOR_MIN_JD_LENGTH} characters or provide a job posting URL.`,
        variant: "destructive",
      });
      return;
    }
    setIsTailoring(true);
    setTailorResult(null);
    try {
      const res = await apiService.tailorResume({
        jobUrl: url || undefined,
        jobDescription: desc || undefined,
        jobTitle: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
      });
      setTailorResult({
        pdfUrl: res.pdfUrl,
        jobTitle: res.jobTitle,
        company: res.company,
        updatedAt: res.updatedAt,
      });
      window.open(res.pdfUrl, "_blank");
      toast({
        title: "Tailored resume ready",
        description:
          res.company || res.jobTitle
            ? `Tailored for ${[res.jobTitle, res.company].filter(Boolean).join(" at ")}.`
            : "Your tailored PDF is open in a new tab.",
      });
    } catch (err) {
      console.error("Tailor failed", err);
      const message = err instanceof Error ? err.message : "Try again in a moment.";
      toast({
        title: "Tailor failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsTailoring(false);
    }
  }, [isTailoring, hasStoredResume, jobUrl, jobDescription, jobTitle, company]);

  const handleDownloadPdf = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const blob = await generateResumePDF(resumeData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = resumeData.name.trim().replace(/[\\/:*?"<>|]+/g, "").trim();
      a.href = url;
      a.download = `${base || "resume"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF downloaded" });
    } catch (e) {
      console.error("PDF generation failed", e);
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Cross-gate against BOTH score machines: an upload mid-apply/rescore
    // would interleave a second resumeParsed write path (parse endpoint +
    // loadResume) with the apply flow's updateDoc and clobber one or the
    // other. The trigger buttons are disabled while busy, but the file dialog
    // may have been opened before scoring started — so re-check here.
    if (machineBusy(scoreState) || machineBusy(fitState)) {
      toast({
        title: "Hold on — scoring in progress",
        description: "Wait for the current scoring/apply step to finish before replacing your resume.",
      });
      event.target.value = "";
      return;
    }

    if (!isValidResumeFile(file)) {
      setUploadError("Please upload a PDF, DOCX, or DOC file");
      event.target.value = "";
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error("Not signed in");
      const token = await auth.currentUser?.getIdToken();

      // The authed parse endpoint stores the full resumeParsed server-side.
      const formData = new FormData();
      formData.append("resume", file);
      const response = await fetch(`${BACKEND_URL}/api/parse-resume`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to parse resume");

      // Persist the original file + metadata (NO resumeParsed stub — the
      // server already stored the full parse; a stub would clobber it).
      const ts = Date.now();
      const storageRef = ref(storage, `resumes/${userId}/${ts}-${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "users", userId), {
        resumeUrl: downloadUrl,
        resumeFileName: file.name,
        resumeUpdatedAt: new Date().toISOString(),
      });

      // Re-read the user doc so the preview + score chip repopulate from the
      // fresh parse. A new upload invalidates any prior score/recommendations
      // on BOTH machines (rec targets point into the old parse).
      setScoreResult(null);
      setScoreState("idle");
      setScoreDelta(null);
      setFitResult(null);
      setFitState("idle");
      setFitDelta(null);
      fitContextRef.current = null;
      await loadResume(userId);

      toast({ title: "Resume uploaded", description: "We filled in the preview from your file." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setUploadError(msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const canTailor =
    isPlausibleUrl(jobUrl) || jobDescription.trim().length >= TAILOR_MIN_JD_LENGTH;

  // Busy if EITHER machine is mid-flight — gates uploads and both rails.
  const isBusy = machineBusy(scoreState) || machineBusy(fitState);

  // ---- Render -------------------------------------------------------------

  // Shared preview card: the live PDF preview (same page-level preview state
  // on both tabs, so approved tailoring is visible on the paper either way).
  // Rendered inside each tab's left column, with the recommendations list
  // directly underneath — the left column is NOT sticky since it now scrolls
  // past the fold when recommendations are present.
  // Preview shows the tailored PDF once a tailor completes; otherwise the
  // live browser-rendered preview of the currently-parsed resume.
  const activePreviewUrl = tailorResult?.pdfUrl ?? previewUrl;
  const activePreviewLabel = tailorResult
    ? tailorResult.company || tailorResult.jobTitle
      ? `Tailored for ${[tailorResult.jobTitle, tailorResult.company].filter(Boolean).join(" at ")}`
      : "Tailored resume"
    : "Live preview";
  const activePreviewSub = tailorResult
    ? "Open in a new tab or download from the top-right of the PDF"
    : previewRendering
      ? "Updating…"
      : "This is the exact PDF you'll download";

  const previewPanel = (
    <div>
      <div className="rounded-xl border border-line bg-white overflow-hidden">
        <div className="px-4 py-2 border-b border-line bg-paper-2 flex items-center justify-between">
          <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
            {activePreviewLabel}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {activePreviewSub}
          </span>
        </div>
        {activePreviewUrl ? (
          <iframe
            src={`${activePreviewUrl}#toolbar=0&navpanes=0&view=FitH`}
            title="Resume PDF preview"
            style={{
              width: "100%",
              height: "calc(100vh - 200px)",
              border: "none",
              display: "block",
            }}
          />
        ) : (
          <div
            className="flex items-center justify-center text-[13px] text-muted-foreground"
            style={{ height: "calc(100vh - 200px)" }}
          >
            {isTailoring ? "Tailoring your resume…" : "Rendering preview…"}
          </div>
        )}
      </div>
    </div>
  );

  // Shared scored-state renderers for both machines; the callers pass their
  // own state/handlers. The score card lives in the right rail; the
  // recommendations render as a RecommendedChangesPanel in the left column
  // directly under the PDF preview (keeping it in the rail pushed it below
  // the fold).
  type ScoredRailOpts = {
    result: ResumeScoreResponse;
    delta: { prev: number; next: number } | null;
    state: ScoreState;
    onRescore: () => void;
  };

  const renderScoreCard = (opts: ScoredRailOpts) => (
      <div className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <span
              className="text-[32px] font-bold leading-none"
              style={{ color: scoreColor(opts.result.score) }}
            >
              {opts.result.score}
            </span>
            <span className="text-[13px] font-medium text-muted-foreground">
              {opts.result.score_label}
            </span>
          </div>
          <Button variant="outline" size="sm" disabled={isBusy} onClick={opts.onRescore}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Re-score
          </Button>
        </div>

        {opts.delta && (
          <div
            className="flex items-center gap-1.5 text-[12.5px] font-medium mb-3 rounded-md px-2.5 py-1.5"
            style={{
              color: opts.delta.next >= opts.delta.prev ? "#16A34A" : "#DC2626",
              background: opts.delta.next >= opts.delta.prev ? "#F0FDF4" : "#FEF2F2",
            }}
          >
            {opts.delta.next >= opts.delta.prev ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )}
            {opts.delta.prev} → {opts.delta.next} (
            {opts.delta.next >= opts.delta.prev ? "+" : ""}
            {opts.delta.next - opts.delta.prev})
          </div>
        )}

        <p className="text-[12.5px] text-ink-2 mb-4">{opts.result.summary}</p>

        <div className="space-y-2.5">
          {opts.result.categories.map((cat) => (
            <div key={cat.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-medium text-ink">{cat.name}</span>
                <span
                  className="text-[12px] font-semibold"
                  style={{ color: scoreColor(cat.score) }}
                >
                  {cat.score}
                </span>
              </div>
              <Progress value={cat.score} className="h-1.5" />
              <p className="text-[11px] text-muted-foreground mt-1">{cat.explanation}</p>
            </div>
          ))}
        </div>
      </div>
  );

  // Apply-bar busy label while a machine commits (panel shows a spinner).
  const busyLabelFor = (state: ScoreState): string | null =>
    state === "applying" ? "Applying…" : state === "rescoring" ? "Rescoring…" : null;

  // Per-machine opts for the score card (right rail).
  const editScored =
    scoreState === "scored" || scoreState === "applying" || scoreState === "rescoring";
  const editRail: ScoredRailOpts | null = scoreResult
    ? {
        result: scoreResult,
        delta: scoreDelta,
        state: scoreState,
        onRescore: handleScore,
      }
    : null;
  const fitScored =
    fitState === "scored" || fitState === "applying" || fitState === "rescoring";
  const fitRail: ScoredRailOpts | null = fitResult
    ? {
        result: fitResult,
        delta: fitDelta,
        state: fitState,
        onRescore: handleFitScore,
      }
    : null;

  // Tab-specific subtitle for the Recommended Changes panel.
  const fitCompany = fitContextRef.current?.company?.trim();
  const fitSubtitle = fitCompany
    ? `Approve or reject each edit tailored to the ${fitCompany} posting, one at a time.`
    : "Approve or reject each edit tailored to this job posting, one at a time.";
  const editSubtitle =
    "Approve or reject each edit from your Harvard-rubric review, one at a time.";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-paper font-sans text-ink">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Resume" />
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[1240px] mx-auto" style={{ padding: "30px 34px 52px" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_RESUME_TYPES.accept}
                className="hidden"
                onChange={handleFileSelected}
              />

              {/* Eyebrow + PageTitle + lead (design handoff 2026-07-10) */}
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
                  Resume Workshop
                </div>
                <div style={{ maxWidth: "640px" }}>
                  <PageTitle
                    lead="Tailor your resume to any job"
                    accent="and stand out"
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
                  Keep the live preview open while Scout scores your resume against the
                  posting and suggests rewrites — approve them one by one, then download
                  the exact PDF.
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : activeTab === "edit" ? (
                <>
                  {/* Upload CTA banner when there's no stored parse yet */}
                  {!hasStoredResume && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 mb-5">
                      <p className="text-[13px] text-ink">
                        Upload your resume to get started — we&apos;ll score it against a Harvard
                        rubric.
                      </p>
                      <Button
                        size="sm"
                        disabled={uploading || isBusy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploading ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-1.5" />
                        )}
                        {uploading ? "Uploading..." : "Upload resume"}
                      </Button>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div className="min-w-0">
                      {resumeFileName && (
                        <p className="text-[13px] font-medium text-ink truncate max-w-[320px]">
                          {resumeFileName}
                        </p>
                      )}
                      {resumeUpdatedAt && (
                        <p className="text-[12px] text-muted-foreground">
                          Updated {new Date(resumeUpdatedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploading || isBusy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <RefreshCw className="w-4 h-4 mr-1.5" />
                        {uploading ? "Uploading..." : hasStoredResume ? "Replace file" : "Upload file"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDownloading}
                        onClick={handleDownloadPdf}
                      >
                        {isDownloading ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-1.5" />
                        )}
                        Download PDF
                      </Button>
                    </div>
                  </div>
                  {uploadError && (
                    <p className="text-[12px] text-destructive -mt-3 mb-4">{uploadError}</p>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {/* Left/main: live PDF preview — the real document,
                        rendered by the browser's PDF viewer so it looks like
                        the paper page you'd actually submit — with the
                        recommendation cards directly underneath it. */}
                    <div className="lg:col-span-2 space-y-6">
                      {previewPanel}
                      {editScored && scoreResult && (
                        <RecommendedChangesPanel
                          key={`edit-run-${scoreRunId}`}
                          recommendations={scoreResult.recommendations}
                          subtitle={editSubtitle}
                          disabled={isBusy}
                          busyLabel={busyLabelFor(scoreState)}
                          onApply={handleApplyApproved}
                        />
                      )}
                    </div>

                    {/* Right: score rail */}
                    <div className="lg:sticky lg:top-4 self-start space-y-4">
                      {scoreState === "idle" && (
                        <div className="rounded-xl border border-line bg-white p-5">
                          <div className="flex items-center gap-2 mb-1">
                            <Wand2 className="h-4 w-4 text-[#3B82F6]" />
                            <h2 className="text-[15px] font-semibold text-ink">Score my resume</h2>
                          </div>
                          <p className="text-[12.5px] text-muted-foreground mb-4">
                            We&apos;ll grade it against a Harvard resume rubric and suggest exact
                            bullet rewrites you can approve one by one.
                          </p>
                          {resumeScore !== null && (
                            <div className="flex items-center justify-between rounded-lg bg-paper-2 px-3 py-2 mb-4">
                              <div>
                                <span
                                  className="text-[18px] font-bold"
                                  style={{ color: scoreColor(resumeScore) }}
                                >
                                  {resumeScore}
                                </span>
                                <span className="text-[12px] text-muted-foreground ml-1.5">
                                  {resumeScoreLabel}
                                </span>
                              </div>
                              {resumeScoredAt && (
                                <span className="text-[11px] text-muted-foreground">
                                  {new Date(resumeScoredAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          )}
                          <Button
                            className="w-full"
                            disabled={!hasStoredResume}
                            onClick={handleScore}
                          >
                            <Sparkles className="w-4 h-4 mr-1.5" />
                            Score my resume
                          </Button>
                          {!hasStoredResume && (
                            <p className="text-[11px] text-muted-foreground mt-2">
                              Upload a resume first to enable scoring.
                            </p>
                          )}
                        </div>
                      )}

                      {scoreState === "scoring" && (
                        <div className="rounded-xl border border-line bg-white p-8 flex flex-col items-center justify-center text-center">
                          <Loader2 className="h-6 w-6 animate-spin text-[#3B82F6] mb-3" />
                          <p className="text-[13px] text-ink font-medium">
                            Scoring against Harvard resume standards…
                          </p>
                        </div>
                      )}

                      {editScored && editRail && renderScoreCard(editRail)}
                    </div>
                  </div>
                </>
              ) : (
                /* Tailor tab — design handoff redesign 2026-07-10.
                   Left: live PDF preview (unchanged in function).
                   Right: tailor card + yeti card + how-it-works. */
                <div
                  className="grid gap-6 items-start"
                  style={{ gridTemplateColumns: "1.35fr 1fr" }}
                >
                  <div className="space-y-6">
                    {previewPanel}
                    {fitScored && fitResult && (
                      <RecommendedChangesPanel
                        key={`fit-run-${fitRunId}`}
                        recommendations={fitResult.recommendations}
                        subtitle={fitSubtitle}
                        disabled={isBusy}
                        busyLabel={busyLabelFor(fitState)}
                        onApply={handleFitApplyApproved}
                      />
                    )}
                  </div>

                  {/* Right rail: tailor card → yeti → how it works */}
                  <div className="lg:sticky lg:top-4 self-start space-y-4">
                    {/* Tailor-to-a-job card */}
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
                        Tailor to a job
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
                        Paste a link or the description — Claude rewrites your bullets,
                        reorders your skills, and drops what doesn't fit. One shot,
                        canonical PDF.
                      </p>

                      {/* Step 1 */}
                      <div
                        className="mt-5 flex items-center"
                        style={{ gap: "8px" }}
                      >
                        <span
                          className="inline-flex items-center justify-center"
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "99px",
                            background: "#EEF1FB",
                            color: "#4A60A8",
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          1
                        </span>
                        <span
                          style={{
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontSize: "12.5px",
                            fontWeight: 600,
                            color: "#1E2D4D",
                          }}
                        >
                          Point Scout at the job
                        </span>
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
                          placeholder="Paste the full job description here — the more detail, the sharper the score."
                          className="min-h-[120px]"
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
                              jobDescription.length >= TAILOR_MIN_JD_LENGTH
                                ? "#4A60A8"
                                : "#94A3B8",
                          }}
                        >
                          {jobDescription.length >= TAILOR_MIN_JD_LENGTH
                            ? `${jobDescription.length} chars`
                            : `${jobDescription.length} / ${TAILOR_MIN_JD_LENGTH}`}
                        </span>
                      </div>

                      {/* Step 2 */}
                      <div
                        className="mt-5 flex items-center"
                        style={{ gap: "8px" }}
                      >
                        <span
                          className="inline-flex items-center justify-center"
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "99px",
                            background: "#EEF1FB",
                            color: "#4A60A8",
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          2
                        </span>
                        <span
                          style={{
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontSize: "12.5px",
                            fontWeight: 600,
                            color: "#1E2D4D",
                          }}
                        >
                          Confirm the target — optional
                        </span>
                      </div>

                      {/* Job title + Company grid */}
                      <div
                        className="mt-3 grid gap-3"
                        style={{ gridTemplateColumns: "1fr 1fr" }}
                      >
                        <div className="relative">
                          <Briefcase
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
                            value={jobTitle}
                            onChange={(e) => setJobTitle(e.target.value)}
                            placeholder="Job title"
                            style={{ paddingLeft: "38px" }}
                          />
                        </div>
                        <div className="relative">
                          <Building2
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
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            placeholder="Company"
                            style={{ paddingLeft: "38px" }}
                          />
                        </div>
                      </div>

                      {/* Primary button — single-shot Claude tailor */}
                      <button
                        disabled={
                          !canTailor || !hasStoredResume || uploading || isTailoring
                        }
                        onClick={handleTailorWithClaude}
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
                          cursor:
                            !canTailor || !hasStoredResume || uploading || isTailoring
                              ? "not-allowed"
                              : "pointer",
                        }}
                        onMouseEnter={(e) => {
                          if (
                            !(!canTailor || !hasStoredResume || uploading || isTailoring)
                          ) {
                            e.currentTarget.style.background = "#3C4F8E";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (
                            !(!canTailor || !hasStoredResume || uploading || isTailoring)
                          ) {
                            e.currentTarget.style.background = "#4A60A8";
                          }
                        }}
                        onMouseDown={(e) => {
                          if (
                            !(!canTailor || !hasStoredResume || uploading || isTailoring)
                          ) {
                            e.currentTarget.style.background = "#34457A";
                          }
                        }}
                        onMouseUp={(e) => {
                          if (
                            !(!canTailor || !hasStoredResume || uploading || isTailoring)
                          ) {
                            e.currentTarget.style.background = "#3C4F8E";
                          }
                        }}
                      >
                        {isTailoring ? "Tailoring…" : "Tailor to this job"}
                      </button>
                      {!canTailor && (
                        <p
                          className="mt-3"
                          style={{
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontSize: "12px",
                            color: "#64748B",
                          }}
                        >
                          Add a job URL or paste at least {TAILOR_MIN_JD_LENGTH} characters
                          of the description to enable scoring.
                        </p>
                      )}
                      {!hasStoredResume && (
                        <p
                          className="mt-3"
                          style={{
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontSize: "12px",
                            color: "#64748B",
                          }}
                        >
                          No resume on file yet — upload one from Account Settings first.
                        </p>
                      )}
                    </div>

                    {fitState === "scoring" && (
                      <div className="rounded-xl border border-line bg-white p-8 flex flex-col items-center justify-center text-center">
                        <Loader2 className="h-6 w-6 animate-spin mb-3" style={{ color: "#4A60A8" }} />
                        <p className="text-[13px] text-ink font-medium">
                          Scoring your resume against this job…
                        </p>
                      </div>
                    )}

                    {fitScored && fitRail && renderScoreCard(fitRail)}

                    {/* Yeti card — Scout scores your resume */}
                    {!fitScored && (
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
                          src={yetiFindUrl}
                          alt=""
                          style={{
                            width: "96px",
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
                          Scout tailors your resume
                        </h3>
                        <p
                          style={{
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontSize: "12.5px",
                            lineHeight: 1.55,
                            color: "#64748B",
                          }}
                        >
                          Claude reads the posting, rewrites your bullets truthfully, and
                          renders a clean, ATS-safe PDF.
                        </p>
                      </div>
                    )}

                    {/* How it works card */}
                    {!fitScored && (
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
                              desc: "Pulls the skills and keywords the role is really after.",
                            },
                            {
                              n: 2,
                              title: "Rewrites your bullets",
                              desc: "XYZ pattern using JD keywords — no invented facts.",
                            },
                            {
                              n: 3,
                              title: "Renders a canonical PDF",
                              desc: "ATS-safe, one page, ready to send.",
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
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default ResumePage;
