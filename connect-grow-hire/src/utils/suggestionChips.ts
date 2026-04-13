import { industries } from '@/data/industries';

export interface SuggestionChip {
  id: string;
  label: string;
  prompt: string;
  category: 'alumni' | 'industry' | 'location' | 'dream';
}

export interface UserContext {
  firstName: string;
  university: string;
  graduationYear: string;
  targetIndustries: string[];
  preferredLocations: string[];
  dreamCompanies: string[];
  careerTrack: string;
}

const EMPTY_CONTEXT: UserContext = {
  firstName: '', university: '', graduationYear: '',
  targetIndustries: [], preferredLocations: [], dreamCompanies: [], careerTrack: '',
};

function getCompaniesForIndustry(interest: string): string[] {
  const slug = interest.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
  const match = industries.find(i =>
    i.name.toLowerCase() === interest.toLowerCase() ||
    i.slug === slug ||
    i.name.toLowerCase().includes(interest.toLowerCase()) ||
    interest.toLowerCase().includes(i.name.toLowerCase())
  );
  return match?.top_companies?.slice(0, 4) || [];
}

function getSeniorityLabel(gradYear: string): string {
  if (!gradYear) return '';
  const now = new Date().getFullYear();
  const grad = parseInt(gradYear, 10);
  if (isNaN(grad)) return '';
  const delta = grad - now;
  if (delta >= 0) return 'Analyst';
  if (delta >= -3) return 'Associate';
  return 'VP';
}

export function shortUniversity(uni: string): string {
  const abbrevs: Record<string, string> = {
    'University of Southern California': 'USC',
    'University of California, Los Angeles': 'UCLA',
    'University of Michigan': 'UMich',
    'University of Pennsylvania': 'UPenn',
    'New York University': 'NYU',
    'Georgetown University': 'Georgetown',
    'University of California, Berkeley': 'UC Berkeley',
    'Massachusetts Institute of Technology': 'MIT',
    'Stanford University': 'Stanford',
    'Columbia University': 'Columbia',
    'Harvard University': 'Harvard',
    'Yale University': 'Yale',
    'Princeton University': 'Princeton',
    'Cornell University': 'Cornell',
    'Duke University': 'Duke',
    'Northwestern University': 'Northwestern',
    'University of Chicago': 'UChicago',
    'University of Virginia': 'UVA',
    'University of Texas at Austin': 'UT Austin',
  };
  return abbrevs[uni] || uni;
}

export function generatePeopleChips(ctx: UserContext): SuggestionChip[] {
  const chips: SuggestionChip[] = [];
  const seen = new Set<string>();
  const uni = shortUniversity(ctx.university);
  const seniority = getSeniorityLabel(ctx.graduationYear);

  const addChip = (category: SuggestionChip['category'], label: string, prompt: string) => {
    const key = prompt.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    chips.push({ id: `${category}-${chips.length}`, label, prompt, category });
  };

  // Alumni chips
  if (ctx.university) {
    const allCompanies = ctx.targetIndustries.flatMap(i => getCompaniesForIndustry(i));
    const alumniCompanies = [...new Set(allCompanies)].slice(0, 4);
    for (const company of alumniCompanies) {
      addChip('alumni', `${uni} alumni at ${company}`, `${ctx.university} alumni at ${company}`);
    }
    if (ctx.graduationYear && seniority) {
      const gradYear = parseInt(ctx.graduationYear, 10);
      const recentGrad = gradYear - 1;
      const topCompany = alumniCompanies[0] || 'top firms';
      addChip('alumni',
        `${uni} '${String(recentGrad).slice(-2)} grads at ${topCompany}`,
        `${ctx.university} ${recentGrad} graduates working as ${seniority} at ${topCompany}`
      );
    }
    if (alumniCompanies.length === 0) {
      addChip('alumni', `${uni} alumni in finance`, `${ctx.university} alumni in finance`);
      addChip('alumni', `${uni} alumni in consulting`, `${ctx.university} alumni in consulting`);
    }
  }

  // Industry chips
  for (const industry of ctx.targetIndustries.slice(0, 3)) {
    const companies = getCompaniesForIndustry(industry);
    for (const company of companies.slice(0, 2)) {
      const location = ctx.preferredLocations[0] || '';
      const locationSuffix = location ? ` in ${location}` : '';
      const seniorityPrefix = seniority || 'Professionals';
      addChip('industry',
        `${seniorityPrefix} at ${company}${locationSuffix}`,
        `${seniorityPrefix} at ${company}${locationSuffix}`
      );
    }
  }

  // Location chips
  for (const location of ctx.preferredLocations.slice(0, 3)) {
    const industry = ctx.targetIndustries[0] || 'Finance';
    addChip('location',
      `${industry} professionals in ${location}`,
      `${industry} professionals in ${location}`
    );
  }

  // Dream company chips (no-op until Goals step is wired)
  for (const company of ctx.dreamCompanies.slice(0, 3)) {
    addChip('dream', `People at ${company}`, `Professionals at ${company}`);
  }

  return chips;
}

export function generateFirmChips(ctx: UserContext): SuggestionChip[] {
  const chips: SuggestionChip[] = [];
  const seen = new Set<string>();

  const addChip = (category: SuggestionChip['category'], label: string, prompt: string) => {
    const key = prompt.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    chips.push({ id: `firm-${category}-${chips.length}`, label, prompt, category });
  };

  // Industry + location chips
  for (const industry of ctx.targetIndustries.slice(0, 3)) {
    for (const location of ctx.preferredLocations.slice(0, 2)) {
      addChip('industry', `${industry} firms in ${location}`, `${industry} firms in ${location}`);
    }
    if (ctx.preferredLocations.length === 0) {
      addChip('industry', `Top ${industry} firms`, `Leading ${industry} firms hiring entry-level`);
    }
  }

  // Location-only chips
  for (const location of ctx.preferredLocations.slice(0, 2)) {
    const industry = ctx.targetIndustries[0] || 'Finance';
    addChip('location', `${industry} companies in ${location}`, `${industry} companies in ${location}`);
  }

  // Dream company chips (no-op until Goals step)
  for (const company of ctx.dreamCompanies.slice(0, 3)) {
    addChip('dream', `Companies like ${company}`, `Firms similar to ${company}`);
  }

  return chips;
}

// Fisher-Yates shuffle seeded by a numeric value
export function rotateChips(all: SuggestionChip[], count: number, seed?: number): SuggestionChip[] {
  if (all.length <= count) return [...all];
  const arr = [...all];
  let s = seed ?? Date.now();
  // Simple seeded PRNG (mulberry32)
  const rand = () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

// Default fallback chips (matches current hardcoded chips)
export const DEFAULT_PEOPLE_CHIPS: SuggestionChip[] = [
  { id: 'default-1', label: 'Software engineers at FAANG in SF', prompt: 'Software engineers at FAANG in SF', category: 'industry' },
  { id: 'default-2', label: 'USC alumni in investment banking', prompt: 'USC alumni in investment banking', category: 'alumni' },
  { id: 'default-3', label: 'Marketing managers at startups in LA', prompt: 'Marketing managers at startups in LA', category: 'industry' },
];

export const DEFAULT_FIRM_CHIPS: SuggestionChip[] = [
  { id: 'firm-default-1', label: 'Tech startups in SF', prompt: 'Early-stage tech startups in San Francisco focused on AI/ML', category: 'industry' },
  { id: 'firm-default-2', label: 'Healthcare M&A banks', prompt: 'Mid-sized investment banks in New York focused on healthcare M&A', category: 'industry' },
  { id: 'firm-default-3', label: 'Consulting in Chicago', prompt: 'Management consulting firms in Chicago with 100-500 employees', category: 'industry' },
  { id: 'firm-default-4', label: 'Fintech in London', prompt: 'Series B+ fintech companies in London focused on payments', category: 'industry' },
];

export function isContextEmpty(ctx: UserContext): boolean {
  return !ctx.university && ctx.targetIndustries.length === 0 && ctx.preferredLocations.length === 0;
}

// ── Recommendation engine ──────────────────────────────────────────

export interface RecommendedCompany {
  company: string;
  industry: string;
  score: number;
  reason: string;
}

const INDUSTRY_COMPANIES: Record<string, string[]> = {
  'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Citi', 'Barclays', 'Deutsche Bank'],
  'Consulting': ['McKinsey', 'BCG', 'Bain', 'Deloitte', 'Oliver Wyman'],
  'Tech': ['Google', 'Meta', 'Apple', 'Microsoft', 'Stripe', 'Airbnb'],
  'Finance': ['BlackRock', 'Fidelity', 'Citadel', 'Two Sigma', 'Point72'],
  'Marketing': ['WPP', 'Omnicom', 'Publicis', 'Ogilvy'],
  'Healthcare': ['Johnson & Johnson', 'Pfizer', 'McKinsey Health', 'CVS Health'],
};

// Map various user-entered industry names to our canonical keys
const INDUSTRY_ALIASES: Record<string, string> = {
  'investment banking': 'Investment Banking',
  'ib': 'Investment Banking',
  'banking': 'Investment Banking',
  'management consulting': 'Consulting',
  'consulting': 'Consulting',
  'strategy consulting': 'Consulting',
  'technology': 'Tech',
  'tech': 'Tech',
  'software': 'Tech',
  'product management': 'Tech',
  'finance': 'Finance',
  'asset management': 'Finance',
  'hedge funds': 'Finance',
  'private equity': 'Finance',
  'marketing': 'Marketing',
  'marketing and advertising': 'Marketing',
  'advertising': 'Marketing',
  'healthcare': 'Healthcare',
  'health': 'Healthcare',
};

const INDUSTRY_COLORS: Record<string, string> = {
  'Investment Banking': '#10B981',
  'Consulting': '#6366F1',
  'Tech': '#3B82F6',
  'Finance': '#F59E0B',
  'Marketing': '#EC4899',
  'Healthcare': '#14B8A6',
};

// IB-heavy locations as a rough location→industry signal
const LOCATION_INDUSTRY_HINTS: Record<string, string[]> = {
  'new york': ['Investment Banking', 'Finance'],
  'san francisco': ['Tech'],
  'chicago': ['Consulting', 'Finance'],
  'los angeles': ['Tech', 'Marketing'],
  'boston': ['Consulting', 'Healthcare'],
  'dallas': ['Finance'],
  'houston': ['Finance'],
  'seattle': ['Tech'],
};

function resolveIndustry(raw: string): string | undefined {
  return INDUSTRY_ALIASES[raw.toLowerCase()] || INDUSTRY_ALIASES[raw.toLowerCase().replace(/[^a-z ]/g, '')];
}

export function getIndustryColor(industry: string): string {
  return INDUSTRY_COLORS[industry] || '#94A3B8';
}

export function getRecommendedCompanies(ctx: UserContext): RecommendedCompany[] {
  const uni = shortUniversity(ctx.university);
  const resolvedIndustries = ctx.targetIndustries
    .map(resolveIndustry)
    .filter((x): x is string => !!x);

  // Collect all candidate companies with their industry
  const candidates: { company: string; industry: string }[] = [];
  const seen = new Set<string>();

  for (const [industry, companies] of Object.entries(INDUSTRY_COMPANIES)) {
    for (const company of companies) {
      if (!seen.has(company)) {
        seen.add(company);
        candidates.push({ company, industry });
      }
    }
  }

  // Score each candidate
  const scored = candidates.map(({ company, industry }) => {
    let score = 0;
    const reasons: string[] = [];

    // +2 for industry match
    if (resolvedIndustries.includes(industry)) {
      score += 2;
      reasons.push(`Matches your ${industry} interest`);
    }

    // +1 for location match (if user's location maps to this industry)
    for (const loc of ctx.preferredLocations) {
      const locLower = loc.toLowerCase();
      const hintIndustries = Object.entries(LOCATION_INDUSTRY_HINTS)
        .filter(([k]) => locLower.includes(k))
        .flatMap(([, v]) => v);
      if (hintIndustries.includes(industry)) {
        score += 1;
        reasons.push(`Strong in ${loc}`);
        break;
      }
    }

    // +1 for career track match
    if (ctx.careerTrack) {
      const trackIndustry = resolveIndustry(ctx.careerTrack);
      if (trackIndustry === industry) {
        score += 1;
        reasons.push(`Aligns with your career track`);
      }
    }

    // Build the reason string
    let reason = reasons.length > 0
      ? reasons[0]
      : `Top ${industry} employer`;
    if (uni && resolvedIndustries.includes(industry)) {
      reason = `Popular with ${uni} students`;
    }

    return { company, industry, score, reason };
  });

  // Sort by score desc, then alphabetically
  scored.sort((a, b) => b.score - a.score || a.company.localeCompare(b.company));

  return scored.slice(0, 5);
}

export { EMPTY_CONTEXT };
