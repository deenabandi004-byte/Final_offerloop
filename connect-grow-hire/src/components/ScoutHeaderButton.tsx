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
          rounded-lg 
          px-3 py-1.5 
          text-sm font-medium 
          transition-all duration-150
          cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-1
          ${isPanelOpen 
            ? 'bg-blue-500/10 border border-blue-400/30 text-gray-900' 
            : 'bg-transparent border border-gray-300 text-gray-700 hover:bg-blue-50/50 hover:border-gray-400'
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
              filter: 'brightness(0) saturate(100%) invert(37%) sepia(97%) saturate(1415%) hue-rotate(201deg) brightness(98%) contrast(96%)',
            }}
          />
          {/* Subtle conversational cue - small dot */}
          <span 
            className={`
              absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full 
              ${isPanelOpen ? 'bg-blue-500' : 'bg-blue-400'}
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
