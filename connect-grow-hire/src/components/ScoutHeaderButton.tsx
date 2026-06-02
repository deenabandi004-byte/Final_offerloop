import React, { useState } from "react";
import { useScout } from "@/contexts/ScoutContext";
import ScoutIconImage from "@/assets/Scout_icon.png";

interface ScoutHeaderButtonProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

/**
 * ScoutHeaderButton - Clear call-to-action for asking questions and getting help
 */
const ScoutHeaderButton: React.FC<ScoutHeaderButtonProps> = () => {
  const { openPanel, isPanelOpen } = useScout();
  const [hover, setHover] = useState(false);

  // Brand primary-action blue — same token as the search/send buttons.
  const fill = hover || isPanelOpen ? 'var(--primary-600, #4C62A8)' : 'var(--accent, #4A60A8)';

  return (
    <div className="flex items-end">
      <button
        onClick={openPanel}
        aria-label={isPanelOpen ? "Close Scout" : "Ask Scout questions to navigate Offerloop"}
        className="relative inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 cursor-pointer focus:outline-none"
        style={{ background: fill, border: 'none' }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* Chat-bubble tail (bottom-left corner) */}
        <span
          aria-hidden
          className="absolute -bottom-1 left-3 h-3 w-3 rotate-45 rounded-[2px]"
          style={{ background: fill }}
        />

        {/* Scout Icon — white version for the blue fill */}
        <div className="relative z-10 flex items-center justify-center h-5 w-5 flex-shrink-0">
          <img
            src={ScoutIconImage}
            alt=""
            className="w-4 h-4 object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </div>

        {/* Button label */}
        <span className="relative z-10 whitespace-nowrap hidden sm:inline">
          Ask Scout
        </span>
      </button>
    </div>
  );
};

export default ScoutHeaderButton;
