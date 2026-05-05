/**
 * ScoutContext - Global state for Scout side panel
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

// Types for search help
export interface SearchHelpContext {
  searchType: 'contact' | 'firm';
  failedSearchParams: Record<string, any>;
  errorType: 'no_results' | 'error';
}

/** A refined natural-language prompt the user can re-run with one click,
 *  paired with a one-sentence rationale ("Bocconi pipeline at Mediobanca"). */
export interface RefinedPrompt {
  prompt: string;
  rationale: string;
}

export interface SearchHelpResponse {
  message: string;
  suggestions: string[];
  /** Present when the backend used the prompt-refinement path (failed
   *  contact search with the full natural-language prompt + retry context).
   *  Each entry is a clickable card in the side panel that fills the search
   *  bar and auto-submits. Empty/absent for the legacy structured path. */
  refined_prompts?: RefinedPrompt[];
  auto_populate: Record<string, any>;
  search_type: 'contact' | 'firm';
  action: string;
}

interface ScoutContextType {
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  // Search help specific
  searchHelpContext: SearchHelpContext | null;
  searchHelpResponse: SearchHelpResponse | null;
  openPanelWithSearchHelp: (context: SearchHelpContext) => void;
  setSearchHelpResponse: (response: SearchHelpResponse | null) => void;
  clearSearchHelp: () => void;
  // Auto-send a question when the panel opens (used by the briefing's "Ask
  // Scout" prompt chips). Setter exposed so the side panel can clear it after
  // dispatching, which prevents the same prompt from firing on subsequent
  // panel opens.
  pendingMessage: string | null;
  openPanelWithMessage: (message: string) => void;
  clearPendingMessage: () => void;
}

const ScoutContext = createContext<ScoutContextType | undefined>(undefined);

export function useScout() {
  const context = useContext(ScoutContext);
  if (!context) {
    throw new Error('useScout must be used within a ScoutProvider');
  }
  return context;
}

interface ScoutProviderProps {
  children: React.ReactNode;
}

export function ScoutProvider({ children }: ScoutProviderProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [searchHelpContext, setSearchHelpContext] = useState<SearchHelpContext | null>(null);
  const [searchHelpResponse, setSearchHelpResponseState] = useState<SearchHelpResponse | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const openPanel = useCallback(() => {
    setIsPanelOpen(true);
  }, []);

  const openPanelWithMessage = useCallback((message: string) => {
    const trimmed = (message || '').trim();
    if (!trimmed) return;
    setPendingMessage(trimmed);
    setIsPanelOpen(true);
  }, []);

  const clearPendingMessage = useCallback(() => {
    setPendingMessage(null);
  }, []);
  
  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
  }, []);
  
  const togglePanel = useCallback(() => {
    setIsPanelOpen(prev => !prev);
  }, []);
  
  const openPanelWithSearchHelp = useCallback((context: SearchHelpContext) => {
    setSearchHelpContext(context);
    setIsPanelOpen(true);
  }, []);
  
  const setSearchHelpResponse = useCallback((response: SearchHelpResponse | null) => {
    setSearchHelpResponseState(response);
  }, []);
  
  const clearSearchHelp = useCallback(() => {
    setSearchHelpContext(null);
    setSearchHelpResponseState(null);
  }, []);
  
  return (
    <ScoutContext.Provider value={{ 
      isPanelOpen, 
      openPanel, 
      closePanel, 
      togglePanel,
      searchHelpContext,
      searchHelpResponse,
      openPanelWithSearchHelp,
      setSearchHelpResponse,
      clearSearchHelp,
      pendingMessage,
      openPanelWithMessage,
      clearPendingMessage,
    }}>
      {children}
    </ScoutContext.Provider>
  );
}
