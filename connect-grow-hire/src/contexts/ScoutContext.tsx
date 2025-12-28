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

export interface SearchHelpResponse {
  message: string;
  suggestions: string[];
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
  
  const openPanel = useCallback(() => {
    setIsPanelOpen(true);
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
    }}>
      {children}
    </ScoutContext.Provider>
  );
}
