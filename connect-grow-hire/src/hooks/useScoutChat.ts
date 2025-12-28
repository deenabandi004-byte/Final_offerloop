/**
 * useScoutChat - Custom hook for Scout chat functionality
 * 
 * Shared logic between ScoutPage and ScoutSidePanel
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';

// Backend URL configuration
const BACKEND_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5001'
  : 'https://www.offerloop.ai';

// Session storage key
const SESSION_STORAGE_KEY = 'scout_chat_messages';

// Types
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
  timestamp: Date;
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
  
  // Save messages to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(messages));
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
  
  // Send message
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
      // Get Firebase token
      const { auth } = await import('@/lib/firebase');
      const firebaseUser = auth.currentUser;
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;
      
      // Build conversation history from current messages
      const currentMessages = [...messages, userMessage];
      const conversationHistory = currentMessages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Make API request
      const response = await fetch(`${BACKEND_URL}/api/scout-assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          conversation_history: conversationHistory,
          current_page: currentPage,
          user_info: {
            name: user?.name || 'there',
            tier: user?.tier || 'free',
            credits: user?.credits || 0,
            max_credits: user?.maxCredits || 300,
          },
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message || "I'm not sure how to help with that. Could you rephrase?",
        navigate_to: data.navigate_to,
        action_buttons: data.action_buttons || [],
        auto_populate: data.auto_populate || null,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error('[Scout] Error:', error);
      
      // Add error message
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
 * Format message content (handle markdown-like formatting)
 */
export function formatMessage(content: string): string {
  return content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');
}

