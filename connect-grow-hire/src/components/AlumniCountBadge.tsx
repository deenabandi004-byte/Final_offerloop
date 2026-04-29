/**
 * AlumniCountBadge — Phase 1 contact-card surface.
 *
 * Top-right brand-blue badge that shows "{N} alumni" for a user's school
 * at the contact's company. Clicking the badge filters the live contact
 * search to "alumni at this company" (handled by the parent via
 * `onClick`). Per §15 design decisions:
 *   - Brand-blue tokens (no purple gradients).
 *   - Clickable from Phase 1 — surfaces the directory before it ships.
 *   - Variance under 10% across sources is invisible; we just show the
 *     number.
 *
 * Renders nothing when `data?.count` is null/undefined so a cache miss
 * doesn't leave dead space on the card.
 */
import type { AlumniCountData } from '@/types/user';
import { cn } from '@/lib/utils';

interface AlumniCountBadgeProps {
  data?: AlumniCountData | null;
  /** Click handler — typically navigates to /find?tab=people&school=…&company=… */
  onClick?: () => void;
  className?: string;
  /** When true, render a smaller variant for dense list rows. */
  compact?: boolean;
}

export function AlumniCountBadge({
  data,
  onClick,
  className,
  compact = false,
}: AlumniCountBadgeProps) {
  if (!data || data.count == null || data.count <= 0) return null;

  const label = `${data.count} alum${data.count === 1 ? '' : 'ni'}`;
  const sizeClasses = compact
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-xs px-2 py-1';

  const baseClasses = cn(
    'inline-flex items-center gap-1 rounded-full font-semibold',
    'bg-primary/10 text-primary',
    'transition-colors',
    onClick ? 'cursor-pointer hover:bg-primary/15 active:bg-primary/20' : '',
    sizeClasses,
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={baseClasses}
        aria-label={`${label} at this company — show alumni`}
        title={data.isStale ? `${label} (cache may be stale)` : label}
      >
        {label}
      </button>
    );
  }

  return (
    <span className={baseClasses} title={data.isStale ? `${label} (cache may be stale)` : label}>
      {label}
    </span>
  );
}
