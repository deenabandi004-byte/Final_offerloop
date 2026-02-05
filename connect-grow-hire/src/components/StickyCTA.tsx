import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

interface StickyCTAProps {
  /** Reference to the original inline button element that this sticky CTA aligns with */
  originalButtonRef: React.RefObject<HTMLButtonElement | null>;
  /** Click handler for the CTA - should match the original button's onClick */
  onClick: () => void;
  /** Whether the action is in progress - should match the original button's loading state */
  isLoading?: boolean;
  /** Whether the button is disabled - should match the original button's disabled state */
  disabled?: boolean;
  /** Button label text - displayed inside the button */
  children: React.ReactNode;
  /** Additional className for the button - useful for shape customization (e.g., rounded-full) */
  buttonClassName?: string;
}

interface ButtonPosition {
  left: number;
  width: number;
}

/**
 * StickyAlignedCTA - A reusable sticky bottom CTA that appears when the original button scrolls out of view.
 * Uses IntersectionObserver to detect when the original button is visible.
 * Positions itself to align perfectly with the original button's position and width.
 * 
 * Features:
 * - Automatically measures and aligns with the inline button using getBoundingClientRect()
 * - Updates position on window resize and scroll
 * - Hides when inline button is visible (completely in viewport)
 * - Shows when inline button is completely out of view
 * - Maintains perfect horizontal alignment (same left position and width)
 * 
 * @example
 * ```tsx
 * const buttonRef = useRef<HTMLButtonElement>(null);
 * 
 * <button ref={buttonRef} onClick={handleAction}>
 *   Action Button
 * </button>
 * 
 * <StickyAlignedCTA
 *   originalButtonRef={buttonRef}
 *   onClick={handleAction}
 *   isLoading={isLoading}
 *   buttonClassName="rounded-full"
 * >
 *   Action Button
 * </StickyAlignedCTA>
 * ```
 */
export const StickyAlignedCTA: React.FC<StickyCTAProps> = ({
  originalButtonRef,
  onClick,
  isLoading = false,
  disabled = false,
  children,
  buttonClassName = '',
}) => {
  const [isOriginalVisible, setIsOriginalVisible] = useState(true);
  const [buttonPosition, setButtonPosition] = useState<ButtonPosition | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Measure and update button position
  const updateButtonPosition = useRef(() => {
    const element = originalButtonRef.current;
    if (!element) {
      setButtonPosition(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    setButtonPosition({
      left: rect.left,
      width: rect.width,
    });
  });

  // Set up IntersectionObserver and position tracking
  useEffect(() => {
    const element = originalButtonRef.current;
    if (!element) {
      setButtonPosition(null);
      setIsOriginalVisible(true);
      return;
    }

    // Initial position measurement
    const measurePosition = () => {
      const rect = element.getBoundingClientRect();
      setButtonPosition({
        left: rect.left,
        width: rect.width,
      });
    };

    // Measure position initially
    measurePosition();

    // Create IntersectionObserver to track when original button is visible
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Button is visible only if it's fully intersecting (completely in view)
        const isVisible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
        setIsOriginalVisible(isVisible);
        
        // Always update position when visibility changes
        measurePosition();
      },
      {
        // Only trigger when button is completely out of view
        threshold: 0,
        // No margin - trigger only when fully scrolled past
        rootMargin: '0px',
      }
    );

    observerRef.current.observe(element);

    // Update position on scroll and resize
    const handleUpdate = () => {
      measurePosition();
    };

    window.addEventListener('scroll', handleUpdate, { passive: true });
    window.addEventListener('resize', handleUpdate);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      window.removeEventListener('scroll', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [originalButtonRef]);

  // Don't render if original button is visible or position not measured
  if (isOriginalVisible || !buttonPosition) {
    return null;
  }

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        bottom: '1rem',
        left: `${buttonPosition.left}px`,
        width: `${buttonPosition.width}px`,
        // Support for mobile safe areas (notch, home indicator)
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <button
        onClick={onClick}
        disabled={isLoading || disabled}
        className={`
          pointer-events-auto w-full h-11 px-6 rounded-full text-sm font-medium shadow-sm
          transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500
          ${isLoading || disabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
            : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]'
          }
          ${buttonClassName}
        `}
        aria-label={typeof children === 'string' ? children : 'Action button'}
        role="button"
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            <span>Searching...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            {children}
            <ArrowRight className="w-4 h-4" />
          </div>
        )}
      </button>
    </div>
  );
};

// Export as StickyCTA for backward compatibility
export const StickyCTA = StickyAlignedCTA;
