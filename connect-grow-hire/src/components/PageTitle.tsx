import React from "react";
import { ScribbleUnderline } from "./ScribbleUnderline";

interface PageTitleProps {
  /** Primary text. If `lead` is provided, this is ignored. */
  children?: React.ReactNode;
  /** Italic accent word(s) with scribble underline. */
  accent?: React.ReactNode;
  /** Optional subtitle below the heading. */
  subtitle?: string;
  /** Explicit lead text — takes precedence over `children`. */
  lead?: string;
}

export const PageTitle = ({ children, accent, subtitle, lead }: PageTitleProps) => (
  <div>
    <h1 className="font-serif text-[44px] leading-[1.05] text-ink tracking-[-0.015em]">
      {lead ?? children}{' '}
      {accent && (
        <em className="font-serif relative inline-block" style={{ fontStyle: 'italic', fontWeight: 400 }}>
          {accent}
          <ScribbleUnderline />
        </em>
      )}
    </h1>
    {subtitle && (
      <p className="mt-2 text-ink-2 text-[15px]">{subtitle}</p>
    )}
  </div>
);
