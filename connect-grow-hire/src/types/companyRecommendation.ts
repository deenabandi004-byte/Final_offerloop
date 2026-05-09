// contract: keep in sync with backend/app/models/company_recommendation.py

export interface ScoutSentence {
  rung: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  headline: string;
  detail: string;
  short: string;
  stat_value: string;
  stat_label: string;
  facts_used: string[];
}

export interface CompanyMark {
  letters: string;
  color: string;
}

export interface CompanyRecommendation {
  rank: number;
  id: string;
  name: string;
  mark: CompanyMark;
  sector: string;
  city: string;
  scout: ScoutSentence;
}

export interface CompanyRecommendationsResponse {
  user: {
    name: string;
    school: string;
    seal: string;
    sealColor: string;
    major: string;
    location: string;
    demonym: string | null;
    demonymConfidence: string;
  };
  stats: {
    alumni_tracked: number;
    jobs_indexed: number;
    last_updated: string;
  };
  companies: CompanyRecommendation[];
}
