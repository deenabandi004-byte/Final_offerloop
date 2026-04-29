/**
 * ProfileConfirmModal — Phase 1 of the Personalization Data Layer.
 *
 * Fires on next login after `phase1_backfill.py` populates the user's
 * structured fields. Shows the extracted values side-by-side with edit
 * fields, lets the user confirm / edit / skip, and writes the
 * confirmation with `source: 'explicit'` so future generations stop
 * using inferred values.
 *
 * Per §15 design decisions:
 *   - Reframed from "confirm your data" → "this is what your future
 *     emails will know about you."
 *   - Inline-editable per field with provenance text (e.g. "from your
 *     resume").
 *   - Asymmetric CTA: "Confirm" dominant, "Skip" text-link.
 *   - Includes targetIndustries[] and targetCompanies[] (schema-only in
 *     the spec; required by the design decisions).
 *   - Drops after 2 dismissals — caller controls open/close based on
 *     dismissal count from Firestore.
 */
import { useEffect, useMemo, useState } from 'react';

import { API_BASE_URL } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TARGET_INDUSTRIES,
  TARGET_ROLE_TYPES,
} from '@/lib/constants';
import { useEventLogger } from '@/hooks/useEventLogger';
import type {
  GraduationStatus,
  ProfileConfirmReadResponse,
  ProfileConfirmWriteRequest,
  TonePreference,
  LengthPreference,
} from '@/types/user';
import { getAuth } from 'firebase/auth';

interface ProfileConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful confirm — typically a no-op or a refetch trigger. */
  onConfirmed?: () => void;
  /** Called when user clicks Skip. Parent should track dismissal count. */
  onSkip?: () => void;
}

interface FormState {
  school: string;
  major: string;
  graduationYear: string;
  graduationStatus: GraduationStatus | '';
  currentRole: string;
  currentCompany: string;
  targetIndustries: string[];
  targetCompanies: string[];
  targetRoleTypes: string[];
  tonePreference: TonePreference | '';
  lengthPreference: LengthPreference | '';
  location: string;
}

const EMPTY_FORM: FormState = {
  school: '',
  major: '',
  graduationYear: '',
  graduationStatus: '',
  currentRole: '',
  currentCompany: '',
  targetIndustries: [],
  targetCompanies: [],
  targetRoleTypes: [],
  tonePreference: '',
  lengthPreference: '',
  location: '',
};

async function authedFetch(path: string, init?: RequestInit) {
  const user = getAuth().currentUser;
  if (!user) throw new Error('not signed in');
  const token = await user.getIdToken();
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
}

function provenanceLabel(
  provenance: ProfileConfirmReadResponse['_backfillProvenance'] | undefined,
  field: string,
): string | null {
  const source = provenance?.[field];
  if (!source || source === 'explicit') return null;
  if (source === 'inferred_from_resume_backfill' || source === 'inferred_from_resume') {
    return 'from your resume';
  }
  if (source === 'inferred_from_behavior') return 'from your activity';
  return null;
}

export function ProfileConfirmModal({
  open,
  onOpenChange,
  onConfirmed,
  onSkip,
}: ProfileConfirmModalProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [provenance, setProvenance] = useState<
    ProfileConfirmReadResponse['_backfillProvenance']
  >(undefined);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const { logEvent } = useEventLogger();

  // Fetch current values when the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const resp = await authedFetch('/users/profile-confirm');
        if (!resp.ok) {
          throw new Error(`server returned ${resp.status}`);
        }
        const data = (await resp.json()) as ProfileConfirmReadResponse;
        if (cancelled) return;
        setProvenance(data._backfillProvenance);
        setForm({
          school: data.school ?? '',
          major: data.major ?? '',
          graduationYear: data.graduationYear?.toString() ?? '',
          graduationStatus: (data.graduationStatus ?? '') as GraduationStatus | '',
          currentRole: data.currentRole ?? '',
          currentCompany: data.currentCompany ?? '',
          targetIndustries: data.targetIndustries ?? [],
          targetCompanies: data.targetCompanies ?? [],
          targetRoleTypes: data.targetRoleTypes ?? [],
          tonePreference: (data.tonePreference ?? '') as TonePreference | '',
          lengthPreference: (data.lengthPreference ?? '') as LengthPreference | '',
          location: data.location ?? '',
        });
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => {
      if (prev.has(field as string)) return prev;
      const next = new Set(prev);
      next.add(field as string);
      return next;
    });
    logEvent('profile_field_edited', {
      field: field as string,
      hadPriorValue: Boolean(form[field]),
    });
  }

  const fieldsToWrite = useMemo<ProfileConfirmWriteRequest>(() => {
    const out: ProfileConfirmWriteRequest = {};
    out.school = form.school.trim() || null;
    out.major = form.major.trim() || null;
    const yearNum = form.graduationYear.trim() ? Number(form.graduationYear) : null;
    out.graduationYear = Number.isFinite(yearNum) ? (yearNum as number) : null;
    out.graduationStatus = form.graduationStatus || null;
    out.currentRole = form.currentRole.trim() || null;
    out.currentCompany = form.currentCompany.trim() || null;
    out.targetIndustries = form.targetIndustries;
    out.targetCompanies = form.targetCompanies
      .map((c) => c.trim())
      .filter(Boolean);
    out.targetRoleTypes = form.targetRoleTypes;
    out.tonePreference = form.tonePreference || null;
    out.lengthPreference = form.lengthPreference || null;
    out.location = form.location.trim() || null;
    return out;
  }, [form]);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const resp = await authedFetch('/users/profile-confirm', {
        method: 'POST',
        body: JSON.stringify(fieldsToWrite),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(text || `server returned ${resp.status}`);
      }
      logEvent('profile_confirmed', {
        fieldsConfirmed: Array.from(touched),
      });
      onConfirmed?.();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    onSkip?.();
    onOpenChange(false);
  }

  function toggleArrayValue(field: 'targetIndustries' | 'targetRoleTypes', value: string) {
    setForm((prev) => {
      const set = new Set(prev[field]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, [field]: Array.from(set) };
    });
    setTouched((prev) => new Set(prev).add(field));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>This is what your future emails will know about you</DialogTitle>
          <DialogDescription>
            We pulled the highlights from your resume. Take 30 seconds to
            confirm — every email you send from here on out gets it right.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading your profile…
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* === School + Major === */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="pc-school">
                  School{' '}
                  {provenanceLabel(provenance, 'school') && (
                    <span className="text-xs font-normal text-muted-foreground">
                      ({provenanceLabel(provenance, 'school')})
                    </span>
                  )}
                </Label>
                <Input
                  id="pc-school"
                  value={form.school}
                  onChange={(e) => setField('school', e.target.value)}
                  placeholder="University of Southern California"
                />
              </div>
              <div>
                <Label htmlFor="pc-major">
                  Major{' '}
                  {provenanceLabel(provenance, 'major') && (
                    <span className="text-xs font-normal text-muted-foreground">
                      ({provenanceLabel(provenance, 'major')})
                    </span>
                  )}
                </Label>
                <Input
                  id="pc-major"
                  value={form.major}
                  onChange={(e) => setField('major', e.target.value)}
                  placeholder="Business Administration"
                />
              </div>
            </div>

            {/* === Graduation === */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="pc-grad-year">Graduation year</Label>
                <Input
                  id="pc-grad-year"
                  type="number"
                  inputMode="numeric"
                  value={form.graduationYear}
                  onChange={(e) => setField('graduationYear', e.target.value)}
                  placeholder="2026"
                />
              </div>
              <div>
                <Label htmlFor="pc-grad-status">Status</Label>
                <Select
                  value={form.graduationStatus}
                  onValueChange={(v) =>
                    setField('graduationStatus', v as GraduationStatus | '')
                  }
                >
                  <SelectTrigger id="pc-grad-status">
                    <SelectValue placeholder="Pick one" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="recent_grad">Recent grad</SelectItem>
                    <SelectItem value="experienced">Experienced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* === Current role === */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="pc-current-role">
                  Current role{' '}
                  {provenanceLabel(provenance, 'currentRole') && (
                    <span className="text-xs font-normal text-muted-foreground">
                      ({provenanceLabel(provenance, 'currentRole')})
                    </span>
                  )}
                </Label>
                <Input
                  id="pc-current-role"
                  value={form.currentRole}
                  onChange={(e) => setField('currentRole', e.target.value)}
                  placeholder="Investment Banking Summer Analyst"
                />
              </div>
              <div>
                <Label htmlFor="pc-current-company">
                  Current company{' '}
                  {provenanceLabel(provenance, 'currentCompany') && (
                    <span className="text-xs font-normal text-muted-foreground">
                      ({provenanceLabel(provenance, 'currentCompany')})
                    </span>
                  )}
                </Label>
                <Input
                  id="pc-current-company"
                  value={form.currentCompany}
                  onChange={(e) => setField('currentCompany', e.target.value)}
                  placeholder="Goldman Sachs"
                />
              </div>
            </div>

            {/* === Target industries === */}
            <div>
              <Label>Target industries</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TARGET_INDUSTRIES.map((ind) => {
                  const active = form.targetIndustries.includes(ind.value);
                  return (
                    <button
                      key={ind.value}
                      type="button"
                      onClick={() => toggleArrayValue('targetIndustries', ind.value)}
                      className={
                        'rounded-full border px-3 py-1 text-xs transition-colors ' +
                        (active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted')
                      }
                    >
                      {ind.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* === Target role types === */}
            <div>
              <Label>Target role types</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TARGET_ROLE_TYPES.map((role) => {
                  const active = form.targetRoleTypes.includes(role.value);
                  return (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => toggleArrayValue('targetRoleTypes', role.value)}
                      className={
                        'rounded-full border px-3 py-1 text-xs transition-colors ' +
                        (active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted')
                      }
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* === Target companies (free-form, comma separated) === */}
            <div>
              <Label htmlFor="pc-target-companies">Target companies</Label>
              <Input
                id="pc-target-companies"
                value={form.targetCompanies.join(', ')}
                onChange={(e) =>
                  setField(
                    'targetCompanies',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  )
                }
                placeholder="Goldman Sachs, JPMorgan, Morgan Stanley"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Comma-separated. We'll match aliases (Goldman / GS / Goldman Sachs).
              </p>
            </div>

            {/* === Location === */}
            <div>
              <Label htmlFor="pc-location">Location</Label>
              <Input
                id="pc-location"
                value={form.location}
                onChange={(e) => setField('location', e.target.value)}
                placeholder="New York, NY"
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Skip for now
          </button>
          <Button onClick={handleConfirm} disabled={loading || submitting}>
            {submitting ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
