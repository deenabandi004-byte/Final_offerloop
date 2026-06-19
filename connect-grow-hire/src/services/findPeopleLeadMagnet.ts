/**
 * Public Find People lead magnet - no auth, no credits, no library.
 *
 * Endpoints live at /api/tools/find-people on the backend. Flow:
 *   1) captureEmail(email, source?)  -> logs the lead immediately
 *   2) searchPeople({ company, role, email, source? }) -> sync, returns up to 5
 *
 * Both are public (no Firebase token sent). The search endpoint is
 * IP-rate-limited to 1 successful search per 24h.
 */
import { BACKEND_URL } from './api';

const BASE = `${BACKEND_URL}/api/tools/find-people`;

export interface CaptureEmailResponse {
  ok: boolean;
  error?: string;
  message?: string;
}

export interface SearchPeopleRequest {
  company: string;
  role: string;
  email: string;
  source?: string;
}

export interface PublicPerson {
  name: string;
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  school: string;
  linkedin: string;
}

export type SearchStatus = 'ok' | 'no_candidates' | 'rate_limited' | 'failed';

export interface SearchPeopleResponse {
  ok: boolean;
  status?: SearchStatus;
  searchId?: string;
  company?: string;
  role?: string;
  results: PublicPerson[];
  message?: string;
  error?: string;
  retryAfterSeconds?: number;
}

export async function captureEmail(
  email: string,
  source = 'find-people-email-gate',
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

export async function searchPeople(req: SearchPeopleRequest): Promise<SearchPeopleResponse> {
  // PDL /person/search is typically 1-3s; 30s ceiling is generous insurance.
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        company: req.company,
        role: req.role,
        email: req.email,
        source: req.source || 'find-people-widget',
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
        retryAfterSeconds: data.retry_after_sec,
        results: [],
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: 'failed',
        error: data.error,
        message: data.message || `Request failed (${res.status})`,
        results: [],
      };
    }

    const results: PublicPerson[] = Array.isArray(data.results) ? data.results : [];
    return {
      ok: results.length > 0,
      status: results.length > 0 ? 'ok' : 'no_candidates',
      searchId: data.request_id,
      company: data.company,
      role: data.role,
      results,
    };
  } catch (err) {
    window.clearTimeout(timeoutId);
    const e = err as Error;
    if (e.name === 'AbortError') {
      return {
        ok: false,
        status: 'failed',
        message: 'Search took longer than expected. Try again.',
        results: [],
      };
    }
    return { ok: false, status: 'failed', message: e.message || 'Network error', results: [] };
  }
}

export function downloadPeopleCsv(
  people: PublicPerson[],
  filename = 'find-people.csv',
): void {
  const header = ['Name', 'Title', 'Company', 'School', 'LinkedIn URL'];
  const rows = people.map((p) => [p.name, p.title, p.company, p.school, p.linkedin]);
  const escape = (cell: string) => {
    const s = (cell ?? '').toString();
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
