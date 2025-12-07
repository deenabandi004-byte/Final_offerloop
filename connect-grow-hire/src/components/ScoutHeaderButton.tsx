import React, { useState, useEffect } from "react";
import ScoutChatbot from "./ScoutChatbot";
import { Button } from "@/components/ui/button";

interface ScoutHeaderButtonProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

const ScoutHeaderButton: React.FC<ScoutHeaderButtonProps> = ({ onJobTitleSuggestion }) => {
  const [isScoutChatOpen, setIsScoutChatOpen] = useState(false);

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

  return (
    <>
      {isScoutChatOpen && (
        <div className="fixed right-4 top-4 z-40 w-[370px] h-[600px] flex flex-col rounded-2xl border border-[#E3E8F0] bg-white shadow-lg overflow-hidden">
          {/* Minimal Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E3E8F0] bg-white">
            <div className="flex items-center space-x-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: "#fff6e2" }}
              >
                <img src="/scout-mascot.png" alt="Scout AI" className="w-6 h-6 object-contain" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Scout AI</h3>
              </div>
            </div>
            <button
              onClick={() => setIsScoutChatOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScoutChatbot onJobTitleSuggestion={onJobTitleSuggestion} />
          </div>
        </div>
      )}
      
      {/* Header Button */}
      <button
        onClick={() => setIsScoutChatOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 bg-[#ECF4FF] border-[#C7D8FF] text-sm font-medium text-[#111827] shadow-sm hover:shadow-md hover:scale-105 hover:bg-gradient-to-r hover:from-[#ECF4FF] hover:to-white cursor-pointer transition-all duration-150"
      >
        <div className="relative flex items-center justify-center h-6 w-6 rounded-full bg-[#FFF7EA] flex-shrink-0">
          <img
            src="/scout-mascot.png"
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
        <span className="whitespace-nowrap hidden sm:inline">Ask Scout</span>
      </button>
    </>
  );
};

export default ScoutHeaderButton;

