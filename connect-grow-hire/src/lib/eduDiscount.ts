/**
 * .edu 50% discount — frontend mirror of the server-side gate.
 *
 * The backend (`user_is_student_eligible` in stripe_client.py) is the actual
 * bar: it rejects 'student'-audience checkouts that don't clear it. This
 * helper exists so the UI shows the right price and sends the right audience,
 * matching the same three signals the server checks.
 */

export const EDU_DISCOUNT_PERCENT = 50;

export interface EduSignals {
  email?: string | null;
  isStudent?: boolean;
  eduEmail?: string | null;
}

const endsInEdu = (e?: string | null) => (e ?? '').toLowerCase().trim().endsWith('.edu');

/** True iff this user qualifies for the 50% .edu price. */
export function isEduEligible(user?: EduSignals | null): boolean {
  if (!user) return false;
  return Boolean(user.isStudent) || endsInEdu(user.email) || endsInEdu(user.eduEmail);
}

/** Checkout audience string for this user ('student' = .edu price, 'list' = full). */
export function audienceForUser(user?: EduSignals | null): 'student' | 'list' {
  return isEduEligible(user) ? 'student' : 'list';
}
