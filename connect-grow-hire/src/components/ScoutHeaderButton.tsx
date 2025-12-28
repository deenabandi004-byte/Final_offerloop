import React, { useEffect } from "react";
import { useScout } from "@/contexts/ScoutContext";
import ScoutIconImage from "@/assets/Scout_icon.png";

interface ScoutHeaderButtonProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

const ScoutHeaderButton: React.FC<ScoutHeaderButtonProps> = ({ onJobTitleSuggestion }) => {
  const { openPanel } = useScout();

  // Add wave animation keyframes
  useEffect(() => {
    const waveKeyframes = `
      @keyframes wave {
        0%, 100% { transform: rotate(-8deg); }
        50% { transform: rotate(8deg); }
      }
      @keyframes ping-soft {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.25); opacity: 0.4; }
        100% { transform: scale(1); opacity: 1; }
      }
    `;
    const style = document.createElement("style");
    style.textContent = waveKeyframes;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, []);

  const handleClick = () => {
    // Open the Scout side panel
    openPanel();
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 bg-[#ECF4FF] border-[#C7D8FF] text-sm font-medium text-[#111827] shadow-sm hover:shadow-md hover:scale-105 hover:bg-gradient-to-r hover:from-[#ECF4FF] hover:to-white cursor-pointer transition-all duration-150"
    >
      <div className="relative flex items-center justify-center h-6 w-6 flex-shrink-0">
        <img
          src={ScoutIconImage}
          alt="Scout AI"
          className="w-4 h-4 object-contain"
          style={{
            animation: "wave 2.5s ease-in-out infinite",
            transformOrigin: "center bottom",
          }}
        />
        {/* Small pulsing notification dot */}
        <span
          className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#3B82F6]"
          style={{
            animation: "ping-soft 1.2s ease-in-out infinite",
          }}
        />
      </div>
      <span className="whitespace-nowrap hidden sm:inline">Ask Scout!</span>
    </button>
  );
};

export default ScoutHeaderButton;
