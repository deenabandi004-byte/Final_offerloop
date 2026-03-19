import React from "react";
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

  return (
    <div className="flex items-end">
      <button
        onClick={openPanel}
        aria-label={isPanelOpen ? "Close Scout" : "Ask Scout questions to navigate Offerloop"}
        className={`
          inline-flex items-center gap-2
          rounded-[3px]
          px-3 py-1.5
          text-sm font-medium
          transition-all duration-150
          cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20 focus:ring-offset-1
          ${isPanelOpen
            ? 'bg-[rgba(59,130,246,0.10)] border border-[#3B82F6]/30 text-[#0F172A]'
            : 'bg-transparent border border-[#E2E8F0] text-[#0F172A] hover:bg-[rgba(59,130,246,0.05)] hover:border-[#94A3B8]'
          }
        `}
      >
        {/* Scout Icon with subtle conversational cue (small accent dot) */}
        <div className="relative flex items-center justify-center h-5 w-5 flex-shrink-0">
          <img
            src={ScoutIconImage}
            alt=""
            className="w-4 h-4 object-contain opacity-90"
            style={{
              filter: 'brightness(0) saturate(100%) invert(70%) sepia(30%) saturate(600%) hue-rotate(10deg) brightness(90%) contrast(90%)',
            }}
          />
          {/* Subtle conversational cue - small dot */}
          <span
            className={`
              absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full
              ${isPanelOpen ? 'bg-[#3B82F6]' : 'bg-[#2563EB]'}
            `}
          />
        </div>

        {/* Button label */}
        <span className="whitespace-nowrap hidden sm:inline">
          Ask Scout for Help
        </span>
      </button>
    </div>
  );
};

export default ScoutHeaderButton;
