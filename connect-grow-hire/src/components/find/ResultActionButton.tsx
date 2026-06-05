import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared button for the Find results action rows (footer trio, in-draft
 * actions, the View-draft pill, and the small mail glyph). One designed
 * system so these stop looking like a grab bag of one-off rectangles.
 *
 * Styling only. It renders a real <a> when `href` is passed (so existing
 * links keep their destinations) and a <button> otherwise. It does not own
 * any behavior: handlers, hrefs, and targets are passed through unchanged.
 *
 * Colors come from existing tokens only:
 *   primary   = slate-blue accent fill (st-accent, var(--accent)), white text
 *   secondary = faint paper-2 fill with a defined line border and ink-2 text
 * Depth and motion (soft shadow, slight lift, press) carry the hover and
 * active states, so no new brand shades are invented.
 */

type Variant = "primary" | "secondary";
type Size = "default" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap no-underline " +
  "transition-all duration-150 cursor-pointer select-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-st-accent focus-visible:ring-offset-2 " +
  "disabled:opacity-50 disabled:pointer-events-none";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-st-accent text-white border-none shadow-sm " +
    "hover:shadow-md hover:-translate-y-px active:translate-y-0 active:shadow-sm",
  secondary:
    "bg-paper-2 text-ink-2 border border-line " +
    "hover:bg-surface hover:text-ink hover:shadow-sm active:bg-surface active:shadow-none",
};

const SIZES: Record<Size, string> = {
  default: "h-9 px-3.5 text-[12px]",
  sm: "h-8 px-3 text-[12px]",
};

const ICON_ONLY_SIZES: Record<Size, string> = {
  default: "h-9 w-9 px-0",
  sm: "h-8 w-8 px-0",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  iconOnly?: boolean;
  className?: string;
  children: React.ReactNode;
};

type AsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined;
  };

type AsAnchor = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & {
    href: string;
  };

export type ResultActionButtonProps = AsButton | AsAnchor;

export function ResultActionButton(props: ResultActionButtonProps) {
  const {
    variant = "secondary",
    size = "default",
    iconOnly = false,
    className,
    children,
    ...rest
  } = props;

  const classes = cn(
    BASE,
    VARIANTS[variant],
    iconOnly ? ICON_ONLY_SIZES[size] : SIZES[size],
    className,
  );

  if ("href" in props && props.href !== undefined) {
    const anchorRest = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a className={classes} {...anchorRest}>
        {children}
      </a>
    );
  }

  const buttonRest = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" className={classes} {...buttonRest}>
      {children}
    </button>
  );
}

export default ResultActionButton;
