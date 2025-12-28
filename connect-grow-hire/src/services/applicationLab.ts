/**
 * Application Lab Service - Frontend service for Application Lab API
 */
import { auth } from '@/lib/firebase';
import { EnhancedFitAnalysis, CoverLetter, ResumeEdit } from '@/types/scout';

const BACKEND_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5001'
  : 'https://www.offerloop.ai';

export interface JobInput {
  title: string;
  company: string;
  location?: string;
  url?: string;
  snippet?: string;
  job_description_override?: string; // For pasted job descriptions
}

export interface AnalysisResponse {
  status: 'ok' | 'error';
  analysis?: EnhancedFitAnalysis;
  analysis_id?: string;
  message?: string;
  error_code?: string; // For specific error types like JOB_DESCRIPTION_EMPTY
  _from_cache?: boolean;
}

export interface GetAnalysisResponse {
  status: 'ok' | 'error';
  analysis?: EnhancedFitAnalysis;
  job_snapshot?: JobInput;
  message?: string;
}

export interface CoverLetterResponse {
  status: 'ok' | 'error';
  cover_letter?: CoverLetter;
  message?: string;
}

export interface EditedResumeResponse {
  status: 'ok' | 'error';
  edited_resume?: {
    formatted_text?: string;
    pdf_base64?: string;
    structured?: any;
    format: string;
  };
  message?: string;
}

/**
 * Analyze a job application fit
 */
export async function analyzeApplication(
  job: JobInput,
  userResume: any
): Promise<AnalysisResponse> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // FIX 7: Add AbortController with 150 second timeout (backend allows up to 120s, add buffer for network)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150000); // 150 seconds = 2.5 minutes
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/application-lab/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        job,
        user_resume: userResume,
      }),
      signal: controller.signal,
    });
  
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        return {
          status: 'error',
          message: errorData.message || 'Analysis failed',
        };
      } catch {
        return {
          status: 'error',
          message: errorText || `HTTP ${response.status}`,
        };
      }
    }
    
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return {
        status: 'error',
        message: 'Request timed out. Please try again.',
      };
    }
    throw error;
  }
}

/**
 * Get a saved analysis by ID
 */
export async function getAnalysis(analysisId: string): Promise<GetAnalysisResponse> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // FIX 7: Add AbortController with 30 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/application-lab/analysis/${analysisId}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        return {
          status: 'error',
          message: errorData.message || 'Failed to retrieve analysis',
        };
      } catch {
        return {
          status: 'error',
          message: errorText || `HTTP ${response.status}`,
        };
      }
    }
    
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return {
        status: 'error',
        message: 'Request timed out. Please try again.',
      };
    }
    throw error;
  }
}

/**
 * Generate a cover letter
 */
export async function generateCoverLetter(
  job: JobInput,
  userResume: any,
  fitAnalysis?: EnhancedFitAnalysis,
  options?: {
    tone?: 'formal' | 'conversational' | 'enthusiastic';
    length?: 'short' | 'medium' | 'long';
    emphasis?: string[];
  }
): Promise<CoverLetterResponse> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // FIX 7: Add AbortController with 30 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/application-lab/generate-cover-letter`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        job,
        user_resume: userResume,
        fit_analysis: fitAnalysis,
        options: options || {},
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        return {
          status: 'error',
          message: errorData.message || 'Cover letter generation failed',
        };
      } catch {
        return {
          status: 'error',
          message: errorText || `HTTP ${response.status}`,
        };
      }
    }
    
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return {
        status: 'error',
        message: 'Request timed out. Please try again.',
      };
    }
    throw error;
  }
}

/**
 * Generate an edited resume with all edits applied
 */
export async function generateEditedResume(
  userResume: any,
  resumeEdits: ResumeEdit[],
  format: 'plain' | 'markdown' | 'pdf' = 'plain'
): Promise<EditedResumeResponse> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // FIX 7: Add AbortController with 30 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/application-lab/generate-edited-resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_resume: userResume,
        resume_edits: resumeEdits,
        format,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        return {
          status: 'error',
          message: errorData.message || 'Resume generation failed',
        };
      } catch {
        return {
          status: 'error',
          message: errorText || `HTTP ${response.status}`,
        };
      }
    }
    
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return {
        status: 'error',
        message: 'Request timed out. Please try again.',
      };
    }
    throw error;
  }
}

/**
 * Repair resume by backfilling resumeText from resumeUrl
 */
export async function repairResume(): Promise<{ status: 'ok' | 'error'; message?: string; resume_text_len?: number }> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken() : null;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // FIX 7: Add AbortController with 30 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/application-lab/repair-resume`, {
      method: 'POST',
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        return {
          status: 'error',
          message: errorData.message || 'Resume repair failed',
        };
      } catch {
        return {
          status: 'error',
          message: errorText || `HTTP ${response.status}`,
        };
      }
    }
    
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return {
        status: 'error',
        message: 'Request timed out. Please try again.',
      };
    }
    throw error;
  }
}
