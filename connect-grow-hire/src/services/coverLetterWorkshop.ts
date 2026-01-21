/**
 * Cover Letter Workshop Service - Frontend service for Cover Letter API
 */
import { auth } from '@/lib/firebase';

const BACKEND_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5001'
  : 'https://www.offerloop.ai';

// Types
export interface JobContext {
  job_title: string;
  company: string;
  location: string;
}

export interface GenerateResponse {
  status: 'ok' | 'error';
  cover_letter_text?: string;
  pdf_base64?: string;
  library_entry_id?: string;
  parsed_job?: {
    job_title?: string;
    company?: string;
    location?: string;
    job_description?: string;
  };
  job_context?: JobContext;
  credits_remaining?: number;
  message?: string;
  error_code?: string;
}

export interface LibraryEntry {
  id: string;
  display_name: string;
  job_title: string;
  company: string;
  location: string;
  created_at: string;
  cover_letter_text?: string;
  pdf_base64?: string;
}

export interface LibraryResponse {
  status: 'ok' | 'error';
  entries?: LibraryEntry[];
  message?: string;
}

/**
 * Generate a cover letter
 * Costs 5 credits
 */
export async function generateCoverLetter(params: {
  job_url?: string;
  job_title?: string;
  company?: string;
  location?: string;
  job_description?: string;
}): Promise<GenerateResponse> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/cover-letter/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        status: 'error',
        message: data.message || `HTTP ${response.status}`,
        error_code: data.error_code,
        parsed_job: data.parsed_job,
      };
    }
    
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return {
        status: 'error',
        message: 'Request timed out. Please try again.',
      };
    }
    return {
      status: 'error',
      message: error.message || 'Network error',
    };
  }
}

/**
 * Get user's Cover Letter Library entries
 */
export async function getCoverLetterLibrary(): Promise<LibraryResponse> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/cover-letter/library`, {
      method: 'GET',
      headers,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        status: 'error',
        message: data.message || `HTTP ${response.status}`,
      };
    }
    
    return data;
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message || 'Network error',
    };
  }
}

/**
 * Get a specific Cover Letter Library entry with full PDF
 */
export async function getLibraryEntry(entryId: string): Promise<{ status: 'ok' | 'error'; entry?: LibraryEntry; message?: string }> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/cover-letter/library/${entryId}`, {
      method: 'GET',
      headers,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        status: 'error',
        message: data.message || `HTTP ${response.status}`,
      };
    }
    
    return data;
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message || 'Network error',
    };
  }
}

/**
 * Delete a Cover Letter Library entry
 */
export async function deleteLibraryEntry(entryId: string): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/cover-letter/library/${entryId}`, {
      method: 'DELETE',
      headers,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        status: 'error',
        message: data.message || `HTTP ${response.status}`,
      };
    }
    
    return data;
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message || 'Network error',
    };
  }
}
