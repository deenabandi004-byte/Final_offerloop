import React, { useState, useEffect } from "react";
import { useScout } from "@/contexts/ScoutContext";
import ScoutIconImage from "@/assets/Scout_icon.png";

interface ScoutHeaderButtonProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

// LocalStorage key for tracking first Scout interaction
const SCOUT_FIRST_USE_KEY = 'scout_first_use_completed';

/**
 * ScoutHeaderButton - Clear call-to-action for asking questions and getting help
 * 
 * Design principles:
 * - Immediately communicates "Ask questions for help"
 * - Professional, not playful
 * - Subtle conversational cues
 * - Helper text on first use that disappears after interaction
 */
const ScoutHeaderButton: React.FC<ScoutHeaderButtonProps> = () => {
  const { openPanel, isPanelOpen } = useScout();
  const [showHelperText, setShowHelperText] = useState(false);

  // Check if user has used Scout before
  useEffect(() => {
    const hasUsedScout = localStorage.getItem(SCOUT_FIRST_USE_KEY);
    if (!hasUsedScout) {
      setShowHelperText(true);
    }
  }, []);

  const handleClick = () => {
    // Mark Scout as used for the first time
    if (!localStorage.getItem(SCOUT_FIRST_USE_KEY)) {
      localStorage.setItem(SCOUT_FIRST_USE_KEY, 'true');
      setShowHelperText(false);
    }
    
    // Open the Scout side panel
    openPanel();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {/* Helper text - shows on first use until Scout is clicked */}
      {showHelperText && (
        <span className="text-xs text-gray-500 whitespace-nowrap hidden md:block">
          Questions? Ask Scout
        </span>
      )}
      
      {/* Scout Button */}
      <button
        onClick={handleClick}
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
