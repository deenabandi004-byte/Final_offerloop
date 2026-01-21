/**
 * ScoutPage - Full-page Scout AI Assistant
 * 
 * A clean, ChatGPT-style chat interface for helping users navigate and use Offerloop.
 * Modern, minimal design with:
 * - Subtle Scout animation as decorative element
 * - Chat-style message bubbles
 * - Suggestion chips for recommended questions
 */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, Trash2 } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppHeader } from '@/components/AppHeader';
import { useScoutChat, formatMessage, type ChatMessage } from '@/hooks/useScoutChat';
import { SUGGESTED_QUESTIONS } from '@/data/scout-knowledge';
import ScoutWavingWhite from '@/assets/ScoutWavingWhite.mp4';

export default function ScoutPage() {
  const navigate = useNavigate();
  
  // Use the shared chat hook
  const {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    clearChat,
    messagesEndRef,
    inputRef,
  } = useScoutChat();
  
  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);
  
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
  
  // Handle navigation
  const handleNavigate = (route: string, autoPopulate?: ChatMessage['auto_populate']) => {
    // Store auto-populate data if present
    if (autoPopulate) {
      sessionStorage.setItem('scout_auto_populate', JSON.stringify(autoPopulate));
    }
    navigate(route);
  };
  
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-white">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col min-h-screen">
          <AppHeader title="Ask Scout" />
          
          {/* Chat container */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-4 py-6">
                {/* Empty state - Scout animation + first message + suggestions */}
                {messages.length === 0 && (
                  <div className="flex flex-col">
                    {/* Scout animation - centered, smaller, decorative */}
                    <div className="flex justify-center mb-8 pt-8">
                      <div className="w-16 h-16 rounded-full bg-[#FFF7EA] flex items-center justify-center overflow-hidden">
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
                    <div className="flex gap-3 mb-6">
                      <div className="w-8 h-8 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
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
                          <p className="text-[15px] text-gray-900 leading-relaxed">
                            Ask me anything about Offerloop.
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Suggested questions - 2 column grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 ml-11">
                      {SUGGESTED_QUESTIONS.map((question, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSuggestionClick(question)}
                          className="text-left px-4 py-3 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 text-sm text-gray-700 transition-colors"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Messages */}
                {messages.length > 0 && (
                  <div className="space-y-5">
                    {/* Clear chat button */}
                    <div className="flex justify-end">
                      <button
                        onClick={clearChat}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear
                      </button>
                    </div>
                    
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {message.role === 'assistant' ? (
                          // Assistant message with avatar
                          <div className="flex gap-3 max-w-[85%]">
                            <div className="w-8 h-8 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
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
                                  className="text-[15px] text-gray-900 leading-relaxed"
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
                              <p className="text-[15px] leading-relaxed">
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
                        <div className="w-8 h-8 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
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
            <div className="border-t border-gray-100 bg-white px-4 py-4">
              <div className="max-w-2xl mx-auto">
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Scout anything..."
                    className="w-full pl-4 pr-14 py-3.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-lg text-white bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    aria-label="Send message"
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </button>
                </div>
                
                {/* Credits text - de-emphasized */}
                <p className="text-xs text-gray-400 text-center mt-3">
                  No credits used
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
