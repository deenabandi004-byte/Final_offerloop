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
  onJobTitleSuggestion: (title: string, company?: string, location?: string) => void;
}

const ScoutChatbot: React.FC<ScoutChatbotProps> = ({ onJobTitleSuggestion }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'greeting',
        role: 'assistant',
        content: "Hey! I'm Scout 🐕 Ready to help you find professionals to network with!\n\n" +
                 "You can:\n" +
                 "• **Paste a job posting URL** and I'll fill in the search for you\n" +
                 "• **Tell me what you're looking for** (e.g., 'data analyst jobs in SF')\n" +
                 "• **Ask me anything** about companies or roles\n\n" +
                 "What would you like to do?",
        timestamp: new Date(),
      }]);
    }
  }, []);

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

      setMessages(prev => [...prev, assistantMessage]);

      // Auto-populate fields if returned
      if (data.fields) {
        const { job_title, company, location } = data.fields;
        if (job_title || company || location) {
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
    onJobTitleSuggestion(job.title, job.company, job.location || undefined);
  };

  const formatMessage = (content: string) => {
    // Convert markdown-like formatting to HTML
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br />');
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Messages Area */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
                className={`max-w-[85%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                    : 'bg-gray-800 text-gray-100 border border-gray-700'
                }`}
              >
                {/* Message content */}
                <div
                  className="text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                />

                {/* Fields badge */}
                {message.fields && Object.keys(message.fields).length > 0 && (
                  <div className="mt-3 p-2 bg-green-500/20 border border-green-500/40 rounded-md">
                    <div className="flex items-center gap-1 text-green-400 text-xs font-medium mb-1">
                      <Sparkles className="h-3 w-3" />
                      Search fields updated!
                    </div>
                    <div className="text-xs text-green-300/80">
                      {message.fields.job_title && <span>Title: {message.fields.job_title}</span>}
                      {message.fields.company && <span> • Company: {message.fields.company}</span>}
                      {message.fields.location && <span> • Location: {message.fields.location}</span>}
                    </div>
                  </div>
                )}

                {/* Job listings */}
                {message.jobListings && message.jobListings.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-gray-400 font-medium">Click to use:</div>
                    {message.jobListings.slice(0, 5).map((job, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleJobClick(job)}
                        className="w-full text-left p-2 bg-gray-700/50 hover:bg-gray-700 rounded border border-gray-600 hover:border-purple-500 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm font-medium text-white">{job.title}</div>
                            <div className="text-xs text-gray-400">
                              {job.company}
                              {job.location && ` • ${job.location}`}
                            </div>
                          </div>
                          {job.url && (
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-400 hover:text-blue-300"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </button>
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
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Scout is thinking...</span>
                </div>
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-700 bg-gray-900/95">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Paste a job URL or describe what you're looking for..."
            className="flex-1 bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500"
            disabled={isLoading}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="mt-2 text-xs text-gray-500 text-center">
          Try: "data analyst jobs in NYC" or paste a LinkedIn/Greenhouse job URL
        </div>
      </div>
    </div>
  );
};

export default ScoutChatbot;
