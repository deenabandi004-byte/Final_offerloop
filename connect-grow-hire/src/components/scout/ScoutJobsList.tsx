/**
 * ScoutJobsList — structured job-match cards rendered in the Scout chat
 * thread. When find_jobs returns matches, the backend attaches them to the
 * assistant message as msg.jobs, and this component renders one card per
 * job with two actions:
 *   - Auto Apply (only when auto_apply_eligible) — fires a synthetic user
 *     turn like "auto-apply to <title> at <company>" so Scout runs
 *     auto_apply_to_job with consent.
 *   - Job Posting — opens the apply_url in a new tab; disabled if missing.
 *
 * Visual language matches the rest of the app: white card, border-line,
 * rounded-st-xl, ink/muted text, accent for primary action.
 */
import { ExternalLink, Zap } from "lucide-react";
import type { ScoutJobMatch } from "@/hooks/useScoutChat";

interface Props {
  jobs: ScoutJobMatch[];
  onAutoApply: (job: ScoutJobMatch) => void;
}

export function ScoutJobsList({ jobs, onAutoApply }: Props) {
  if (!jobs || jobs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {jobs.map((job) => {
        const hasUrl = Boolean(job.apply_url);
        const subtitle = [job.company, job.location].filter(Boolean).join(" · ");
        return (
          <div
            key={job.job_id}
            className="rounded-st-xl border border-line bg-white p-3.5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold leading-snug text-[#0F172A]">
                  {job.title || "Untitled role"}
                </div>
                {subtitle && (
                  <div className="mt-0.5 text-[12px] leading-snug text-[#64748B]">
                    {subtitle}
                  </div>
                )}
              </div>
              {job.auto_apply_eligible && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                  <Zap className="h-2.5 w-2.5" />
                  Auto
                </span>
              )}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {job.auto_apply_eligible && (
                <button
                  type="button"
                  onClick={() => onAutoApply(job)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Zap className="h-3 w-3" />
                  Auto Apply
                </button>
              )}
              <a
                href={hasUrl ? job.apply_url : undefined}
                target={hasUrl ? "_blank" : undefined}
                rel={hasUrl ? "noopener noreferrer" : undefined}
                aria-disabled={!hasUrl}
                className={
                  "inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-[12px] font-semibold transition-colors " +
                  (hasUrl
                    ? "text-[#0F172A] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                    : "cursor-not-allowed text-[#94A3B8]")
                }
                onClick={(e) => {
                  if (!hasUrl) e.preventDefault();
                }}
              >
                <ExternalLink className="h-3 w-3" />
                Job Posting
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
