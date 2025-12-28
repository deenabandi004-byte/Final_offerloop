/**
 * ScoutSidePanel - Slide-out side panel for Scout AI Assistant
 * 
 * Opens from the right side of the screen while keeping user on their current page.
 * Also handles search help mode for failed contact/firm searches.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Send, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScout, SearchHelpResponse } from '@/contexts/ScoutContext';
import { useScoutChat, formatMessage } from '@/hooks/useScoutChat';
import { SUGGESTED_QUESTIONS } from '@/data/scout-knowledge';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import ScoutWavingWhite from '@/assets/ScoutWavingWhite.mp4';

// Backend URL configuration
const BACKEND_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5001'
  : 'https://www.offerloop.ai';

// Session storage key for auto-populate
const AUTO_POPULATE_KEY = 'scout_auto_populate';

export function ScoutSidePanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useFirebaseAuth();
  const { 
    isPanelOpen, 
    closePanel, 
    searchHelpContext, 
    searchHelpResponse, 
    setSearchHelpResponse,
    clearSearchHelp 
  } = useScout();
  const panelRef = useRef<HTMLDivElement>(null);
  const [isLoadingSearchHelp, setIsLoadingSearchHelp] = useState(false);
  
  // Use the shared chat hook with current page context
  const {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    clearChat,
    messagesEndRef,
    inputRef,
  } = useScoutChat(location.pathname);
  
  // Fetch search help when context is provided
  useEffect(() => {
    if (isPanelOpen && searchHelpContext && !searchHelpResponse) {
      fetchSearchHelp();
    }
  }, [isPanelOpen, searchHelpContext, searchHelpResponse]);
  
  // Clean up search help context when panel closes
  useEffect(() => {
    if (!isPanelOpen) {
      // Clear search help after a delay to allow for animations
      const timer = setTimeout(() => {
        clearSearchHelp();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isPanelOpen, clearSearchHelp]);
  
  const fetchSearchHelp = async () => {
    if (!searchHelpContext) return;
    
    setIsLoadingSearchHelp(true);
    
    try {
      // Get Firebase token
      const { auth } = await import('@/lib/firebase');
      const firebaseUser = auth.currentUser;
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;
      
      const response = await fetch(`${BACKEND_URL}/api/scout-assistant/search-help`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          search_type: searchHelpContext.searchType,
          failed_search_params: searchHelpContext.failedSearchParams,
          error_type: searchHelpContext.errorType,
          user_info: {
            name: user?.name || 'there',
          },
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data: SearchHelpResponse = await response.json();
      setSearchHelpResponse(data);
      
    } catch (error) {
      console.error('[Scout] Search help error:', error);
      // Set a fallback response
      setSearchHelpResponse({
        message: searchHelpContext.searchType === 'contact'
          ? "I couldn't find contacts matching your search. Try using different job titles or a broader location."
          : "I couldn't find firms matching your search. Try using different industry terms or a broader location.",
        suggestions: [],
        auto_populate: searchHelpContext.failedSearchParams,
        search_type: searchHelpContext.searchType,
        action: 'retry_search',
      });
    } finally {
      setIsLoadingSearchHelp(false);
    }
  };
  
  // Handle "Continue" button click for search help
  const handleContinue = () => {
    if (!searchHelpResponse) return;
    
    // Store auto-populate data in sessionStorage
    sessionStorage.setItem(AUTO_POPULATE_KEY, JSON.stringify({
      search_type: searchHelpResponse.search_type,
      auto_populate: searchHelpResponse.auto_populate,
    }));
    
    // Navigate to appropriate page
    const targetRoute = searchHelpResponse.search_type === 'contact' 
      ? '/contact-search' 
      : '/firm-search';
    
    // Close panel and clear search help
    closePanel();
    
    // Navigate (if not already on the page)
    if (location.pathname !== targetRoute) {
      navigate(targetRoute);
    } else {
      // If already on the page, trigger a re-mount or event
      window.dispatchEvent(new CustomEvent('scout-auto-populate'));
    }
  };
  
  // Handle Escape key to close panel
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPanelOpen) {
        closePanel();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isPanelOpen, closePanel]);
  
  // Focus input when panel opens (only if not in search help mode)
  useEffect(() => {
    if (isPanelOpen && !searchHelpContext) {
      // Small delay to allow animation to start
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isPanelOpen, inputRef, searchHelpContext]);
  
  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isPanelOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isPanelOpen]);
  
  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  
  // Handle suggestion click
  const handleSuggestionClick = (question: string) => {
    sendMessage(question);
  };
  
  // Handle navigation - navigate AND close panel
  const handleNavigate = (route: string, autoPopulate?: any) => {
    // Store auto-populate data if present
    if (autoPopulate) {
      sessionStorage.setItem('scout_auto_populate', JSON.stringify(autoPopulate));
    }
    navigate(route);
    closePanel();
  };
  
  // Handle clear chat
  const handleClearChat = () => {
    clearChat();
  };
  
  // Handle overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closePanel();
    }
  };
  
  // Check if we're in search help mode
  const isSearchHelpMode = !!searchHelpContext;
  
  if (!isPanelOpen) return null;
  
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />
      
      {/* Side Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 z-50 h-full w-full sm:w-[400px] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-out"
        style={{
          animation: 'slideIn 0.3s ease-out forwards',
        }}
      >
        {/* Add keyframes for slide animation */}
        <style>{`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
            }
            to {
              transform: translateX(0);
            }
          }
        `}</style>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#FFF7EA] flex items-center justify-center overflow-hidden">
              <video 
                src={ScoutWavingWhite}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{ transform: 'scale(1.05)' }}
              />
            </div>
            <span className="text-lg font-semibold text-gray-900">Scout</span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Clear chat button - only show in normal mode with messages */}
            {!isSearchHelpMode && messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearChat}
                className="text-gray-500 hover:text-gray-700 h-8 px-2"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            
            {/* Close button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={closePanel}
              className="text-gray-500 hover:text-gray-700 h-8 w-8 p-0"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Help Mode */}
          {isSearchHelpMode && (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {isLoadingSearchHelp ? (
                <div className="flex flex-col items-center justify-center min-h-[300px]">
                  <div className="w-14 h-14 rounded-full bg-[#FFF7EA] flex items-center justify-center mb-4">
                    <img 
                      src="/scout-mascot.png" 
                      alt="Scout" 
                      className="w-10 h-10 object-contain"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Analyzing your search...</span>
                  </div>
                </div>
              ) : searchHelpResponse ? (
                <div className="space-y-4">
                  {/* Scout message */}
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center">
                      <img 
                        src="/scout-mascot.png" 
                        alt="Scout" 
                        className="w-5 h-5 object-contain"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="bg-gray-100 rounded-2xl px-3 py-2">
                        <p className="text-sm text-gray-900 leading-relaxed">
                          {searchHelpResponse.message}
                        </p>
                      </div>
                      
                      {/* Suggestions list */}
                      {searchHelpResponse.suggestions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {searchHelpResponse.suggestions.map((suggestion, idx) => (
                            <div 
                              key={idx}
                              className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100"
                            >
                              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-medium flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <span className="text-sm text-gray-800">{suggestion}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Continue button */}
                      <div className="mt-4">
                        <button
                          onClick={handleContinue}
                          className="inline-flex items-center px-4 py-2 rounded-full bg-white border border-gray-200 text-blue-600 text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          
          {/* Normal Chat Mode */}
          {!isSearchHelpMode && (
            <>
              {/* Messages area */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 py-4">
                  {/* Empty state with welcome message and suggestions */}
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center min-h-[300px]">
                      {/* Scout avatar */}
                      <div className="w-14 h-14 rounded-full bg-[#FFF7EA] flex items-center justify-center mb-4">
                        <img 
                          src="/scout-mascot.png" 
                          alt="Scout" 
                          className="w-10 h-10 object-contain"
                        />
                      </div>
                      
                      {/* Welcome message */}
                      <h2 className="text-lg font-semibold text-gray-900 mb-1 text-center">
                        Hi! I'm Scout
                      </h2>
                      <p className="text-sm text-gray-600 mb-6 text-center">
                        Ask me anything about Offerloop!
                      </p>
                      
                      {/* Suggestion chips */}
                      <div className="flex flex-wrap justify-center gap-2 max-w-full">
                        {SUGGESTED_QUESTIONS.map((question, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSuggestionClick(question)}
                            className="px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-xs text-gray-700 font-medium transition-colors"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Messages */}
                  {messages.length > 0 && (
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`flex gap-2 max-w-[90%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className="flex flex-col gap-2">
                              {/* Message bubble */}
                              <div
                                className={`rounded-2xl px-3 py-2 ${
                                  message.role === 'user'
                                    ? 'text-white'
                                    : 'bg-gray-100 text-gray-900'
                                }`}
                                style={message.role === 'user' ? { 
                                  background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' 
                                } : undefined}
                              >
                                <div
                                  className="text-sm leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                                />
                              </div>
                              
                              {/* Take me there button */}
                              {message.role === 'assistant' && message.navigate_to && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleNavigate(message.navigate_to!, message.auto_populate)}
                                    className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-gray-200 text-blue-600 text-xs font-medium hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                                  >
                                    Take me there
                                  </button>
                                </div>
                              )}
                              
                              {/* Additional action buttons */}
                              {message.role === 'assistant' && message.action_buttons && message.action_buttons.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {message.action_buttons.map((btn, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => handleNavigate(btn.route)}
                                      className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs hover:bg-gray-200 transition-colors"
                                    >
                                      {btn.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* Loading indicator */}
                      {isLoading && (
                        <div className="flex justify-start">
                          <div className="flex gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center">
                              <img 
                                src="/scout-mascot.png" 
                                alt="Scout" 
                                className="w-5 h-5 object-contain"
                              />
                            </div>
                            <div className="bg-gray-100 rounded-2xl px-3 py-2">
                              <div className="flex items-center gap-2 text-gray-600">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span className="text-xs">Thinking...</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Scroll anchor */}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Input area */}
              <div className="border-t border-gray-100 bg-white px-4 py-3 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything..."
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                  <Button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || isLoading}
                    className="px-3 py-2 rounded-xl h-auto"
                    style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                
                {/* Footer hint */}
                <p className="text-[10px] text-gray-400 text-center mt-2">
                  No credits used • Press Esc to close
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default ScoutSidePanel;
