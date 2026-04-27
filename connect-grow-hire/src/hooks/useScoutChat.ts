/**
 * useScoutChat - Custom hook for Scout chat functionality
 *
 * Shared logic between ScoutPage and ScoutSidePanel.
 * Supports streaming (SSE via POST) with fallback to non-streaming.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { BACKEND_URL } from '@/services/api';

// Session storage key
const SESSION_STORAGE_KEY = 'scout_chat_messages';

// Types
export interface ContactResult {
  name: string;
  job_title: string;
  company: string;
  email: string;
  linkedin_url: string;
  status: string;
}

export interface EmailPreview {
  subject: string;
  body: string;
  recipient_name: string;
  recipient_company: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  navigate_to?: string | null;
  action_buttons?: Array<{ label: string; route: string }>;
  auto_populate?: {
    search_type: 'contact' | 'firm';
    job_title?: string;
    company?: string;
    location?: string;
    industry?: string;
    size?: string;
  } | null;
  contacts_results?: ContactResult[] | null;
  email_preview?: EmailPreview | null;
  tool_used?: string | null;
  timestamp: Date;
  isStreaming?: boolean;
  intent?: string | null;
}

export interface UseScoutChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  sendMessage: (messageText?: string) => Promise<void>;
  clearChat: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
}

/**
 * Custom hook for Scout chat functionality
 * @param currentPageOverride - Optional override for current page (useful for side panel)
 */
export function useScoutChat(currentPageOverride?: string): UseScoutChatReturn {
  const location = useLocation();
  const { user } = useFirebaseAuth();

  // Determine current page - use override if provided, otherwise use location
  const currentPage = currentPageOverride || location.pathname;

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // Load from sessionStorage on mount
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      }
    } catch (e) {
      console.error('[Scout] Failed to load messages from session:', e);
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Save messages to sessionStorage whenever they change (skip streaming state)
  useEffect(() => {
    try {
      const toSave = messages.map(({ isStreaming, intent, ...rest }) => rest);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error('[Scout] Failed to save messages to session:', e);
    }
  }, [messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear chat
  const clearChat = useCallback(() => {
    setMessages([]);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    inputRef.current?.focus();
  }, []);

  // Get Firebase token helper
  const getToken = async (): Promise<string | null> => {
    const { auth } = await import('@/lib/firebase');
    const firebaseUser = auth.currentUser;
    return firebaseUser ? await firebaseUser.getIdToken() : null;
  };

  // Build request payload
  const buildPayload = (text: string, currentMessages: ChatMessage[]) => {
    const conversationHistory = currentMessages.slice(-6).map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    return {
      message: text,
      conversation_history: conversationHistory,
      current_page: currentPage,
      user_info: {
        name: user?.name || 'there',
        tier: user?.tier || 'free',
        credits: user?.credits || 0,
        max_credits: user?.maxCredits || 300,
      },
    };
  };

  // Streaming send via SSE POST
  const sendMessageStreaming = async (text: string, _userMessage: ChatMessage, currentMessages: ChatMessage[]): Promise<boolean> => {
    const token = await getToken();
    const payload = buildPayload(text, currentMessages);

    const assistantId = `assistant-${Date.now()}`;

    // Create placeholder assistant message
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    }]);

    try {
      const response = await fetch(`${BACKEND_URL}/api/scout-assistant/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        // Remove placeholder and signal fallback
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        return false;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (eventType === 'intent') {
                // Update the placeholder with intent for contextual loading
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, intent: data.intent } : m
                ));
              } else if (eventType === 'token') {
                accumulatedText += data.text;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: accumulatedText, isStreaming: true } : m
                ));
              } else if (eventType === 'done') {
                // Final update with all metadata
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? {
                    ...m,
                    content: data.message || accumulatedText,
                    navigate_to: data.navigate_to || null,
                    action_buttons: data.action_buttons || [],
                    auto_populate: data.auto_populate || null,
                    contacts_results: data.contacts_results || null,
                    email_preview: data.email_preview || null,
                    tool_used: data.tool_used || null,
                    isStreaming: false,
                    intent: null,
                  } : m
                ));
              } else if (eventType === 'error') {
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? {
                    ...m,
                    content: data.message || "Something went wrong. Try again!",
                    isStreaming: false,
                    intent: null,
                  } : m
                ));
              }
            } catch {
              // Ignore malformed JSON
            }
            eventType = ''; // Reset for next event
          }
        }
      }

      // Ensure streaming flag is cleared
      setMessages(prev => prev.map(m =>
        m.id === assistantId && m.isStreaming ? { ...m, isStreaming: false, intent: null } : m
      ));

      return true;
    } catch (error) {
      console.error('[Scout] Streaming error:', error);
      // Remove placeholder and signal fallback
      setMessages(prev => prev.filter(m => m.id !== assistantId));
      return false;
    }
  };

  // Non-streaming fallback
  const sendMessageFallback = async (text: string, currentMessages: ChatMessage[]) => {
    const token = await getToken();
    const payload = buildPayload(text, currentMessages);

    const response = await fetch(`${BACKEND_URL}/api/scout-assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: data.message || "I'm not sure how to help with that. Could you rephrase?",
      navigate_to: data.navigate_to,
      action_buttons: data.action_buttons || [],
      auto_populate: data.auto_populate || null,
      contacts_results: data.contacts_results || null,
      email_preview: data.email_preview || null,
      tool_used: data.tool_used || null,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);
  };

  // Send message — tries streaming first, falls back to non-streaming
  const sendMessage = useCallback(async (messageText?: string) => {
    const text = (messageText || input).trim();
    if (!text || isLoading) return;

    // Clear input immediately
    setInput('');

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const currentMessages = [...messages, userMessage];

      // Try streaming first
      const streamSuccess = await sendMessageStreaming(text, userMessage, currentMessages);

      if (!streamSuccess) {
        // Fall back to non-streaming
        console.log('[Scout] Streaming failed, falling back to non-streaming');
        await sendMessageFallback(text, currentMessages);
      }
    } catch (error) {
      console.error('[Scout] Error:', error);

      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I ran into an issue, but I'm here to help! What would you like to know about Offerloop?",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, messages, currentPage, user]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    clearChat,
    messagesEndRef,
    inputRef,
  };
}

/**
 * Format message content (handle markdown-like formatting).
 * HTML-escapes first to prevent XSS, then applies safe formatting.
 */
export function formatMessage(content: string): string {
  // Escape HTML entities BEFORE inserting any HTML tags
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');
}
