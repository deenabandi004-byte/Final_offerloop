import React from 'react';

interface SearchPromptBoxProps {
  /** Input region rendered inside the white type-area (textarea + any overlays). */
  children: React.ReactNode;
  /** Circular send button handler. */
  onSubmit: () => void;
  submitDisabled?: boolean;
  /** Content inside the circular send button (e.g. <ArrowUp/> or <Loader2/>). */
  submitIcon: React.ReactNode;
  submitAriaLabel?: string;
  /** Muted helper line above the type-area. Defaults to the People-tab copy. */
  helper?: React.ReactNode;
  /** Content inside the grey container, below the white type-area (chips, etc.). */
  footer?: React.ReactNode;
  /** Min height of the white type-area. Defaults to 120, matching the People tab. */
  typeAreaMinHeight?: number;
}

/** Small helper to render an underlined keyword inside a helper line. */
const underline = (label: string) => (
  <span style={{ textDecoration: 'underline', textUnderlineOffset: 2, textDecorationColor: 'var(--ink-3, #8A8F9A)' }}>
    {label}
  </span>
);

/** Default helper line, Find People copy. Reflects Draft mode (the default). */
export const PEOPLE_SEARCH_HELPER = (
  <>
    For best results include {underline('company')}, {underline('role')}, and {underline('location')}{' '}
    to get personalized email drafts
  </>
);

/** Find People helper, Send mode: outreach is sent, not just drafted. */
export const PEOPLE_SEARCH_HELPER_SEND = (
  <>
    For best results include {underline('company')}, {underline('role')}, and {underline('location')}{' '}
    to send personalized outreach emails
  </>
);

/** Find People helper, Preview mode: contact info only, no email is written. */
export const PEOPLE_SEARCH_HELPER_PREVIEW = (
  <>
    For best results include {underline('company')}, {underline('role')}, and {underline('location')}{' '}
    to find the best matching contacts
  </>
);

/** Find Companies helper line — tailored to company discovery. */
export const COMPANIES_SEARCH_HELPER = (
  <>
    For best results include {underline('industry')}, {underline('location')}, and {underline('role')}{' '}
    to discover companies that fit you
  </>
);

/**
 * The grey search-box shell shared by the Find People and Find Companies tabs.
 * Owns the container, helper line, white type-area, and circular send button.
 * Tab-specific input + recommendations are passed via `children` / `footer`.
 */
export const SearchPromptBox: React.FC<SearchPromptBoxProps> = ({
  children, onSubmit, submitDisabled, submitIcon, submitAriaLabel = 'Search',
  helper = PEOPLE_SEARCH_HELPER, footer, typeAreaMinHeight = 120,
}) => (
  <div
    style={{
      display: 'flex', flexDirection: 'column', position: 'relative',
      background: 'var(--surface, #F5F6F8)',
      border: '1px solid var(--line, #E5E5E0)',
      borderRadius: 16, padding: 24,
    }}
  >
    {/* Helper line */}
    {helper && (
      <div style={{ fontSize: 13, color: 'var(--ink-3, #8A8F9A)', marginBottom: 12, marginLeft: 2 }}>
        {helper}
      </div>
    )}

    {/* White type-area */}
    <div
      style={{
        position: 'relative', width: '100%',
        background: 'var(--paper, #FFFFFF)',
        border: '1px solid var(--line, #E5E5E0)',
        borderRadius: 12, padding: '14px 16px',
        minHeight: typeAreaMinHeight,
      }}
    >
      {children}
      {/* Circular send button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        aria-label={submitAriaLabel}
        style={{
          position: 'absolute', right: 12, bottom: 12,
          width: 34, height: 34, borderRadius: '50%',
          background: 'var(--accent, #4A60A8)', color: '#fff', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: submitDisabled ? 'not-allowed' : 'pointer',
          opacity: submitDisabled ? 0.55 : 1,
          transition: 'opacity .15s, background .15s', zIndex: 2,
        }}
      >
        {submitIcon}
      </button>
    </div>

    {footer}
  </div>
);

export default SearchPromptBox;
