// Scout Enhanced Fit Analysis Types

// Requirement Matching
export interface ResumeMatch {
  section: string;
  company_or_context: string;
  bullet: string;
  relevance: 'direct' | 'partial' | 'transferable';
}

export interface RequirementMatch {
  requirement: string;
  requirement_type: 'required' | 'preferred' | 'nice_to_have';
  importance: 'critical' | 'high' | 'medium' | 'low';
  is_matched: boolean;
  match_strength: 'strong' | 'partial' | 'weak' | 'none';
  resume_matches: ResumeMatch[];
  explanation: string;
  suggestion_if_missing?: string;
}

// Resume Edits
export interface ResumeEdit {
  id: string;
  section: string;
  subsection?: string;
  edit_type: 'add' | 'modify' | 'reorder' | 'emphasize' | 'add_keywords' | 'quantify';
  priority: 'high' | 'medium' | 'low';
  impact: string;
  current_content?: string;
  suggested_content: string;
  rationale: string;
  requirements_addressed: string[];
  keywords_added: string[];
  before_after_preview?: {
    before: string;
    after: string;
  };
}

// Cover Letter
export interface CoverLetterParagraph {
  paragraph_type: 'opening' | 'experience_highlight' | 'skills_bridge' | 'culture_fit' | 'closing';
  content: string;
  requirements_addressed: string[];
  resume_points_used: string[];
}

export interface CoverLetter {
  full_text: string;
  paragraphs: CoverLetterParagraph[];
  tone: 'formal' | 'conversational' | 'enthusiastic';
  word_count: number;
  key_requirements_addressed: string[];
  key_resume_points_used: string[];
  customization_summary: string;
  alternate_openings: string[];
  alternate_closings: string[];
}

// Enhanced Analysis
export interface EnhancedFitAnalysis {
  // Existing
  score: number;
  match_level: 'strong' | 'good' | 'moderate' | 'stretch';
  strengths: Array<{ point: string; evidence: string }>;
  gaps: Array<{ gap: string; mitigation: string }>;
  pitch: string;
  talking_points: Array<{
    topic: string;
    angle: string;
    example: string;
    potential_question: string;
  }>;
  keywords_to_use: string[];
  
  // New: Requirements
  job_requirements: RequirementMatch[];
  requirements_summary: {
    total: number;
    matched: number;
    partial: number;
    missing: number;
  };
  match_breakdown: {
    required: { matched: number; total: number };
    preferred: { matched: number; total: number };
    nice_to_have: { matched: number; total: number };
  };
  
  // New: Resume Edits
  resume_edits: ResumeEdit[];
  edits_summary: {
    high_priority: number;
    medium: number;
    low: number;
  };
  potential_score_after_edits: number;
  
  // New: Cover Letter (optional)
  cover_letter?: CoverLetter;
  
  // New: Score Breakdown (optional)
  score_breakdown?: {
    overall_score: number;
    match_level: string;
    components: {
      critical_requirements: {
        score: number;
        weight: string;
        matched: number;
        total: number;
        description: string;
      };
      preferred_requirements: {
        score: number;
        weight: string;
        matched: number;
        total: number;
        description: string;
      };
      skills: {
        score: number;
        weight: string;
        matched: number;
        total: number;
        description: string;
      };
      experience: {
        score: number;
        weight: string;
        matched: number;
        total: number;
        description: string;
      };
    };
    penalty_applied: boolean;
    explanation: string;
  };
}

