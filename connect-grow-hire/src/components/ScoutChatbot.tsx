import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const BACKEND_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5001'
  : 'https://www.offerloop.ai';

interface SearchFields {
  job_title?: string;
  company?: string;
  location?: string;
  experience_level?: string;
}

interface JobListing {
  title: string;
  company: string;
  location?: string;
  url?: string;
  snippet?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fields?: SearchFields;
  jobListings?: JobListing[];
  timestamp: Date;
}

interface ScoutChatbotProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

const ScoutChatbot: React.FC<ScoutChatbotProps> = ({ onJobTitleSuggestion }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // No initial greeting message - using static bubble instead

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/scout/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          context,
        }),
      });

      const data = await response.json();

      // Update context for next message
      if (data.context) {
        setContext(data.context);
      }

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        fields: data.fields,
        jobListings: data.job_listings,
        timestamp: new Date(),
      };

      // Debug: Log job listings to check if URLs are present
      if (data.job_listings && data.job_listings.length > 0) {
        console.log('[Scout] Job listings received:', data.job_listings.map((j: JobListing) => ({
          title: j.title,
          company: j.company,
          url: j.url,
          hasUrl: !!j.url
        })));
      }

      setMessages(prev => [...prev, assistantMessage]);

      // Auto-populate fields if returned
      if (data.fields) {
        const { job_title, company, location } = data.fields;
        if ((job_title || company || location) && onJobTitleSuggestion) {
          onJobTitleSuggestion(
            job_title || '',
            company || undefined,
            location || undefined
          );
        }
      }

    } catch (error) {
      console.error('[Scout] Error:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "Oops! I ran into an issue. Please try again or rephrase your message.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleJobClick = (job: JobListing) => {
    if (onJobTitleSuggestion) {
      onJobTitleSuggestion(job.title, job.company, job.location || undefined);
    }
  };

  const formatMessage = (content: string) => {
    // Convert markdown-like formatting to HTML
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br />');
  };

  const handleQuickAction = (action: string) => {
    if (action === 'paste-url') {
      setInput('Paste job URL here...');
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (action === 'describe-role') {
      setInput('Describe the role you\'re looking for...');
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (action === 'ask-company') {
      setInput('Ask about a company...');
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Static Scout Message Bubble */}
        {messages.length === 0 && (
          <div className="mt-3 mx-4 p-3 rounded-2xl bg-[#F5F7FF]">
            <p className="text-sm text-slate-800">
              Hey! I'm Scout. Paste a job posting URL or describe a role and I'll fill in your search filters for you.
            </p>
          </div>
        )}

        {/* Quick Action Chips */}
        {messages.length === 0 && (
          <div className="mt-3 flex flex-wrap gap-2 px-4">
            <button
              onClick={() => handleQuickAction('paste-url')}
              className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Paste job URL
            </button>
            <button
              onClick={() => handleQuickAction('describe-role')}
              className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Describe a role
            </button>
            <button
              onClick={() => handleQuickAction('ask-company')}
              className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Ask about a company
            </button>
          </div>
        )}

        {/* Chat Messages */}
        <div className="px-4 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
                className={`max-w-[85%] rounded-2xl p-3 ${
                  message.role === 'user'
                    ? 'text-white'
                    : 'bg-[#F5F7FF] text-slate-800'
                }`}
                style={message.role === 'user' ? { background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' } : undefined}
              >
                {/* Message content */}
                <div
                  className="text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                />

                {/* Fields badge */}
                {message.fields && Object.keys(message.fields).length > 0 && (
                  <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-1 text-blue-700 text-xs font-medium mb-1">
                      <Sparkles className="h-3 w-3" />
                      Search fields updated!
                    </div>
                    <div className="text-xs text-blue-600">
                      {message.fields.job_title && <span>Title: {message.fields.job_title}</span>}
                      {message.fields.company && <span> • Company: {message.fields.company}</span>}
                      {message.fields.location && <span> • Location: {message.fields.location}</span>}
                    </div>
                  </div>
                )}

                {/* Job listings */}
                {message.jobListings && message.jobListings.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-slate-600 font-medium">Click to use for search:</div>
                    {message.jobListings.slice(0, 5).map((job, idx) => (
                      <div
                        key={idx}
                        className="w-full p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-400 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            onClick={() => handleJobClick(job)}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="text-sm font-medium text-slate-900">{job.title}</div>
                            <div className="text-xs text-slate-500">
                              {job.company}
                              {job.location && ` • ${job.location}`}
                            </div>
                          </button>
                          {job.url && job.url.trim() && job.url.startsWith('http') ? (
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-white rounded transition-all shadow-sm hover:shadow-md hover:opacity-90 flex items-center gap-1.5 whitespace-nowrap"
                              style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
                              title="View job posting"
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('[Scout] Opening job URL:', job.url);
                              }}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>View</span>
                            </a>
                          ) : (
                            <button
                              disabled
                              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-400 rounded cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                              title="Job URL not available"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>View</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        ))}
        
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />

          {/* Loading indicator */}
          {isLoading && (
          <div className="flex justify-start">
              <div className="bg-slate-100 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Scout is thinking...</span>
                </div>
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="px-4 py-3 border-t border-[#E3E8F0] bg-white">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Paste a job URL or describe what you're looking for..."
            className="flex-1 bg-white border-[#E3E8F0] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20 rounded-md"
            disabled={isLoading}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="hover:opacity-90 rounded-md"
            style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScoutChatbot;
