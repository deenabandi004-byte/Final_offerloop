/**
 * Public Find Hiring Manager lead magnet - no auth, no credits, no library.
 *
 * Endpoints live at /api/tools/find-hiring-manager on the backend. Flow:
 *   1) captureEmail(email, source?)         -> logs the lead immediately
 *   2) searchHiringManagers({ jobUrl, ... }) -> sync, returns 1-2 candidates
 *
 * Both are public (no Firebase token sent). The search endpoint is
 * IP-rate-limited to 1 successful search per 24h.
 */
import { BACKEND_URL } from './api';

const BASE = `${BACKEND_URL}/api/tools/find-hiring-manager`;

export interface CaptureEmailResponse {
  ok: boolean;
  error?: string;
  message?: string;
}

export interface SearchHiringManagersRequest {
  jobUrl: string;
  email?: string;
  source?: string;
}

export interface HiringManager {
  fullName: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  company: string;
  location: string;
  linkedinUrl: string;
  reasoning: string;
}

export type SearchStatus = 'ok' | 'extraction_failed' | 'no_candidates' | 'rate_limited';

export interface SearchHiringManagersResponse {
  ok: boolean;
  status?: SearchStatus;
  searchId?: string;
  job?: { company: string; jobTitle: string; location: string };
  hiringManagers?: HiringManager[];
  message?: string;
  error?: string;
  retryAfterSeconds?: number;
}

export async function captureEmail(
  email: string,
  source = 'find-hiring-manager-email-gate',
): Promise<CaptureEmailResponse> {
  try {
    const res = await fetch(`${BASE}/capture-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error, message: data.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: (err as Error).message || 'Network error' };
  }
}

export async function searchHiringManagers(
  req: SearchHiringManagersRequest,
): Promise<SearchHiringManagersResponse> {
  // PDL tier search + Firecrawl extraction can take ~10-25s. Give it a
  // 90s ceiling so we surface a clean error instead of a hanging spinner.
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        job_url: req.jobUrl,
        email: req.email || '',
        source: req.source || 'find-hiring-manager-widget',
      }),
    });
    window.clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (res.status === 429) {
      return {
        ok: false,
        status: 'rate_limited',
        error: data.error || 'rate_limited',
        message: data.message,
        retryAfterSeconds: data.retry_after_seconds,
      };
    }

    if (!res.ok && !data.status) {
      return {
        ok: false,
        error: data.error,
        message: data.message || `Request failed (${res.status})`,
      };
    }

    // 200 ok | 422 extraction_failed | 200 no_candidates all use the
    // shared body shape with a "status" field.
    return {
      ok: data.status === 'ok',
      status: data.status as SearchStatus,
      searchId: data.search_id,
      job: data.job,
      hiringManagers: data.hiringManagers || [],
      message: data.message || undefined,
    };
  } catch (err) {
    window.clearTimeout(timeoutId);
    const e = err as Error;
    if (e.name === 'AbortError') {
      return {
        ok: false,
        message: 'Search took longer than expected. Try a different job URL or retry.',
      };
    }
    return { ok: false, message: e.message || 'Network error' };
  }
}

// CSV "formula injection" sanitizer. Spreadsheets (Excel, Google Sheets,
// LibreOffice) execute any cell that starts with `=`, `+`, `-`, `@`, tab,
// CR, or LF as a formula. PDL data can contain any of those (e.g. a name
// starting with "@" or a title with "=" in it). Prefix-quote so the cell
// renders as plain text instead. https://owasp.org/www-community/attacks/CSV_Injection
const _FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

function _csvCell(cell: unknown): string {
  let s = cell == null ? '' : String(cell);
  if (_FORMULA_PREFIX_RE.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(managers: HiringManager[], filename = 'hiring-managers.csv'): void {
  const header = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Why they likely hire'];
  const rows = managers.map((m) => [
    m.fullName,
    m.jobTitle,
    m.company,
    m.location,
    m.linkedinUrl,
    m.reasoning,
  ]);
  const csv = [header, ...rows].map((r) => r.map(_csvCell).join(',')).join('\r\n');
  // BOM so Excel opens UTF-8 with non-ASCII characters intact.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
