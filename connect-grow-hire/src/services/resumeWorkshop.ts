/**
 * Resume Workshop Service - Frontend service for Resume Workshop API
 */
import { auth } from '@/lib/firebase';

const BACKEND_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5001'
  : 'https://www.offerloop.ai';

// Types for section-by-section suggestions
export interface SuggestionItem {
  current: string;
  suggested: string;
  why: string;
}

export interface ExperienceSuggestion {
  role: string;
  company: string;
  bullets: SuggestionItem[];
}

export interface SkillsSuggestion {
  add: Array<{ skill: string; reason: string }>;
  remove: Array<{ skill: string; reason: string }>;
}

export interface KeywordSuggestion {
  keyword: string;
  where_to_add: string;
}

export interface TailorResult {
  status: 'ok' | 'error';
  score: number;
  score_label: string;
  sections: {
    summary?: SuggestionItem;
    experience?: ExperienceSuggestion[];
    skills?: SkillsSuggestion;
    keywords?: KeywordSuggestion[];
  };
  job_context: {
    job_title: string;
    company: string;
    location: string;
    job_description: string;
  };
  credits_remaining: number;
  url_parse_warning?: string;
  message?: string;
  error_code?: string;
}

// Legacy types (kept for backwards compatibility if needed)
export interface ScoreCategory {
  name: string;
  score: number;
  explanation: string;
  suggestions?: string[];
}

export interface Recommendation {
  id: string;
  title: string;
  explanation: string;
  section: string;
  current_text?: string;
  suggested_text?: string;
  impact: 'high' | 'medium' | 'low';
}

export interface JobContext {
  job_title: string;
  company: string;
  location: string;
}

export interface FixResponse {
  status: 'ok' | 'error';
  improved_resume_text?: string;
  pdf_base64?: string;
  credits_remaining?: number;
  message?: string;
  error_code?: string;
}

export interface ScoreResponse {
  status: 'ok' | 'error';
  score?: number;
  score_label?: string;
  categories?: ScoreCategory[];
  summary?: string;
  credits_remaining?: number;
  message?: string;
  error_code?: string;
  cached?: boolean;
}

export interface TailorResponse {
  status: 'ok' | 'error';
  score?: number;
  score_label?: string;
  categories?: ScoreCategory[];
  recommendations?: Recommendation[];
  keywords_found?: string[];
  keywords_missing?: string[];
  summary?: string;
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

// Legacy alias for backwards compatibility
export type AnalyzeResponse = TailorResponse;

export interface ApplyResponse {
  status: 'ok' | 'error';
  updated_resume_pdf_base64?: string;
  updated_resume_text?: string;
  library_entry_id?: string;
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
  score?: number;
  pdf_base64?: string;
}

export interface LibraryResponse {
  status: 'ok' | 'error';
  entries?: LibraryEntry[];
  message?: string;
}

/**
 * Fix resume without job context - improves formatting, clarity, bullets, impact
 * Costs 5 credits
 */
export async function fixResume(): Promise<FixResponse> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/resume-workshop/fix`, {
      method: 'POST',
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        status: 'error',
        message: data.message || `HTTP ${response.status}`,
        error_code: data.error_code,
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
 * Score resume and provide improvement suggestions (without job tailoring)
 * Costs 5 credits
 */
export async function scoreResume(): Promise<ScoreResponse> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/resume-workshop/score`, {
      method: 'POST',
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        status: 'error',
        message: data.message || `HTTP ${response.status}`,
        error_code: data.error_code,
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
 * Apply improvement suggestions from scoring to generate an improved resume
 * Costs 5 credits
 */
export async function applyImprovements(suggestions: string[]): Promise<FixResponse> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/resume-workshop/apply-improvements`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ suggestions }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        status: 'error',
        message: data.message || `HTTP ${response.status}`,
        error_code: data.error_code,
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
 * Replace the user's main resume in account settings
 */
export async function replaceMainResume(params: {
  pdf_base64: string;
  resume_text: string;
}): Promise<{ status: 'ok' | 'error'; message?: string; new_resume_url?: string }> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/resume-workshop/replace-main`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
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
 * Tailor resume for a specific job and get section-by-section suggestions
 * Costs 5 credits
 */
export async function tailorResume(params: {
  job_url?: string;
  job_title?: string;
  company?: string;
  location?: string;
  job_description?: string;
}): Promise<TailorResult> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/resume-workshop/analyze`, {
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
        score: 0,
        score_label: '',
        sections: {},
        job_context: {
          job_title: params.job_title || '',
          company: params.company || '',
          location: params.location || '',
          job_description: params.job_description || '',
        },
        credits_remaining: 0,
        message: data.error || data.message || `HTTP ${response.status}`,
        error_code: data.error_code,
      };
    }
    
    // Map response to TailorResult format
    return {
      status: 'ok',
      score: data.score || 0,
      score_label: data.score_label || '',
      sections: data.sections || {},
      job_context: data.job_context || {
        job_title: params.job_title || '',
        company: params.company || '',
        location: params.location || '',
        job_description: params.job_description || '',
      },
      credits_remaining: data.credits_remaining || 0,
      url_parse_warning: data.url_parse_warning,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return {
        status: 'error',
        score: 0,
        score_label: '',
        sections: {},
        job_context: {
          job_title: params.job_title || '',
          company: params.company || '',
          location: params.location || '',
          job_description: params.job_description || '',
        },
        credits_remaining: 0,
        message: 'Request timed out. Please try again.',
      };
    }
    return {
      status: 'error',
      score: 0,
      score_label: '',
      sections: {},
      job_context: {
        job_title: params.job_title || '',
        company: params.company || '',
        location: params.location || '',
        job_description: params.job_description || '',
      },
      credits_remaining: 0,
      message: error.message || 'Network error',
    };
  }
}

/**
 * Apply a single recommendation to the resume
 * DEPRECATED: This endpoint is deprecated. The frontend now uses copy/paste instead.
 * This function is kept for backward compatibility but will return an error.
 */
export async function applyRecommendation(params: {
  recommendation: Recommendation;
  job_context: JobContext;
  current_working_resume_text?: string;
  score?: number;
}): Promise<ApplyResponse> {
  // Return deprecation message immediately without making API call
  return {
    status: 'error',
    message: 'This endpoint is deprecated. Please use the copy/paste feature in the UI instead.',
    error_code: 'DEPRECATED_ENDPOINT',
  };
  
  // Original implementation below (commented out)
  /*
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/resume-workshop/apply`, {
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
  */
}

/**
 * Get user's Resume Library entries
 */
export async function getResumeLibrary(): Promise<LibraryResponse> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/resume-workshop/library`, {
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
 * Get a specific Resume Library entry with full PDF
 */
export async function getLibraryEntry(entryId: string): Promise<{ status: 'ok' | 'error'; entry?: LibraryEntry; message?: string }> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/resume-workshop/library/${entryId}`, {
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
 * Delete a Resume Library entry
 */
export async function deleteLibraryEntry(entryId: string): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/resume-workshop/library/${entryId}`, {
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
