/**
 * ScoutPage - Full-page Scout AI Assistant
 * 
 * A clean, minimal chat interface for helping users navigate and use Offerloop.
 * Similar to ChatGPT/Claude interface.
 */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, Trash2 } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
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
          {/* Header */}
          <header className="h-16 flex items-center justify-between border-b border-gray-100 px-6 bg-white flex-shrink-0">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-foreground hover:bg-secondary" />
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
                <h1 className="text-xl font-semibold text-gray-900">Scout</h1>
              </div>
            </div>
            
            {/* Clear chat button */}
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
                className="text-gray-500 hover:text-gray-700"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear chat
              </Button>
            )}
          </header>
          
          {/* Chat container */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 py-6">
                {/* Empty state with welcome message and suggestions */}
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
                    {/* Scout avatar */}
                    <div className="w-16 h-16 rounded-full bg-[#FFF7EA] flex items-center justify-center mb-6 overflow-hidden">
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
                    
                    {/* Welcome message */}
                    <h2 className="text-2xl font-semibold text-gray-900 mb-2 text-center">
                      Hi! I'm Scout, your Offerloop assistant.
                    </h2>
                    <p className="text-gray-600 mb-8 text-center">
                      Ask me anything about the platform!
                    </p>
                    
                    {/* Suggestion chips */}
                    <div className="flex flex-wrap justify-center gap-3 max-w-xl">
                      {SUGGESTED_QUESTIONS.map((question, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSuggestionClick(question)}
                          className="px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 font-medium transition-colors"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Messages */}
                {messages.length > 0 && (
                  <div className="space-y-6">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex gap-3 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                          <div className="flex flex-col gap-2">
                            {/* Message bubble */}
                            <div
                              className={`rounded-2xl px-4 py-3 ${
                                message.role === 'user'
                                  ? 'text-white'
                                  : 'bg-gray-100 text-gray-900'
                              }`}
                              style={message.role === 'user' ? { 
                                background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' 
                              } : undefined}
                            >
                              <div
                                className="text-[15px] leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                              />
                            </div>
                            
                            {/* Take me there button */}
                            {message.role === 'assistant' && message.navigate_to && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleNavigate(message.navigate_to!, message.auto_populate)}
                                  className="inline-flex items-center px-4 py-2 rounded-full bg-white border border-gray-200 text-blue-600 text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                                >
                                  Take me there
                                </button>
                              </div>
                            )}
                            
                            {/* Additional action buttons */}
                            {message.role === 'assistant' && message.action_buttons && message.action_buttons.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {message.action_buttons.map((btn, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleNavigate(btn.route)}
                                    className="inline-flex items-center px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-sm hover:bg-gray-200 transition-colors"
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
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center">
                            <img 
                              src="/scout-mascot.png" 
                              alt="Scout" 
                              className="w-6 h-6 object-contain"
                            />
                          </div>
                          <div className="bg-gray-100 rounded-2xl px-4 py-3">
                            <div className="flex items-center gap-2 text-gray-600">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">Scout is thinking...</span>
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
            <div className="border-t border-gray-100 bg-white px-4 py-4">
              <div className="max-w-3xl mx-auto">
                <div className="flex gap-3">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything about Offerloop..."
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                  <Button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || isLoading}
                    className="px-4 py-3 rounded-xl"
                    style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </Button>
                </div>
                
                {/* Footer hint */}
                <p className="text-xs text-gray-400 text-center mt-3">
                  Scout helps you navigate Offerloop. No credits used.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
