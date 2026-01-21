/**
 * ScoutSidePanel - ChatGPT-style slide-out side panel for Scout AI Assistant
 * 
 * Modern, clean interface with:
 * - Simplified text-only header
 * - Subtle Scout animation in content area
 * - Chat-style message bubbles
 * - Suggestion chips for recommended questions
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Send, Loader2, Trash2 } from 'lucide-react';
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
  
  // Prevent body scrolling when panel is open
  useEffect(() => {
    if (isPanelOpen) {
      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore body scroll when panel closes
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isPanelOpen]);

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
  
  // Check if we're in search help mode
  const isSearchHelpMode = !!searchHelpContext;
  
  if (!isPanelOpen) return null;
  
  return (
    <>
      {/* Semi-transparent overlay - closes panel on click */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200"
        onClick={closePanel}
        aria-hidden="true"
      />
      
      {/* Side Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 z-50 h-full w-full sm:w-[420px] bg-white shadow-xl flex flex-col transform transition-transform duration-300 ease-out rounded-l-2xl"
        style={{
          animation: 'slideIn 0.3s ease-out forwards',
        }}
        onClick={(e) => e.stopPropagation()}
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
        
        {/* Header - Simplified, ChatGPT-style */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h1 className="text-base font-medium text-gray-900">Ask Scout</h1>
          
          <div className="flex items-center gap-1">
            {/* Clear chat button - only show in normal mode with messages */}
            {!isSearchHelpMode && messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            
            {/* Close button - subtle gray, no animation */}
            <button
              onClick={closePanel}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Help Mode */}
          {isSearchHelpMode && (
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isLoadingSearchHelp ? (
                <div className="flex flex-col items-center justify-center min-h-[300px]">
                  {/* Smaller Scout animation while loading */}
                  <div className="w-12 h-12 rounded-full bg-[#FFF7EA] flex items-center justify-center mb-4 overflow-hidden">
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
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Analyzing your search...</span>
                  </div>
                </div>
              ) : searchHelpResponse ? (
                <div className="space-y-4">
                  {/* Scout message as chat bubble */}
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
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
                    <div className="flex-1 max-w-[85%]">
                      <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
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
                              className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl border border-blue-100"
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
                          className="px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
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
                <div className="px-5 py-4">
                  {/* Empty state - Scout animation + first message + suggestions */}
                  {messages.length === 0 && (
                    <div className="flex flex-col">
                      {/* Scout animation - centered, smaller, decorative */}
                      <div className="flex justify-center mb-6 pt-4">
                        <div className="w-14 h-14 rounded-full bg-[#FFF7EA] flex items-center justify-center overflow-hidden">
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
                      </div>
                      
                      {/* Initial Scout message as chat bubble */}
                      <div className="flex gap-3 mb-5">
                        <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
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
                        <div className="max-w-[85%]">
                          <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
                            <p className="text-sm text-gray-900 leading-relaxed">
                              Ask me anything about Offerloop.
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Suggested questions - 2 column grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-10">
                        {SUGGESTED_QUESTIONS.map((question, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSuggestionClick(question)}
                            className="text-left px-3 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 text-sm text-gray-700 transition-colors"
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
                          {message.role === 'assistant' ? (
                            // Assistant message with avatar
                            <div className="flex gap-3 max-w-[85%]">
                              <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
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
                              <div className="flex flex-col gap-2">
                                <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
                                  <div
                                    className="text-sm text-gray-900 leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                                  />
                                </div>
                                
                                {/* Take me there button */}
                                {message.navigate_to && (
                                  <button
                                    onClick={() => handleNavigate(message.navigate_to!, message.auto_populate)}
                                    className="self-start px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
                                  >
                                    Take me there
                                  </button>
                                )}
                                
                                {/* Additional action buttons */}
                                {message.action_buttons && message.action_buttons.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {message.action_buttons.map((btn, idx) => (
                                      <button
                                        key={idx}
                                        onClick={() => handleNavigate(btn.route)}
                                        className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-sm hover:bg-gray-200 transition-colors"
                                      >
                                        {btn.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            // User message - no avatar, right aligned
                            <div className="max-w-[85%]">
                              <div className="bg-blue-500 text-white rounded-2xl rounded-tr-md px-4 py-3">
                                <p className="text-sm leading-relaxed">
                                  {message.content}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {/* Loading indicator */}
                      {isLoading && (
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
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
                          <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
                            <div className="flex items-center gap-2 text-gray-500">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">Thinking...</span>
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
              
              {/* Input area - ChatGPT style */}
              <div className="px-5 py-4 flex-shrink-0">
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Scout anything..."
                    className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-white bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    aria-label="Send message"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
                
                {/* Credits text - de-emphasized */}
                <p className="text-xs text-gray-400 text-center mt-2">
                  No credits used
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
