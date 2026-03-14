export interface Industry {
  name: string;
  slug: string;
  top_companies: string[];
  typical_roles: string[];
  culture_notes: string;
}

export const industries: Industry[] = [
  { name: "Management Consulting", slug: "management-consulting", top_companies: ["McKinsey", "BCG", "Bain", "Deloitte", "Accenture"], typical_roles: ["Analyst", "Associate", "Consultant"], culture_notes: "Case interviews, structured thinking, travel-heavy" },
  { name: "Investment Banking", slug: "investment-banking", top_companies: ["Goldman Sachs", "JPMorgan", "Morgan Stanley", "Evercore", "Lazard"], typical_roles: ["Analyst", "Associate", "VP"], culture_notes: "Long hours, deal-driven, prestige-focused" },
  { name: "Private Equity", slug: "private-equity", top_companies: ["Blackstone", "KKR", "Apollo", "Carlyle", "Warburg Pincus"], typical_roles: ["Analyst", "Associate", "VP"], culture_notes: "Highly selective, IB recruiting path, deal execution" },
  { name: "Tech", slug: "tech", top_companies: ["Google", "Meta", "Amazon", "Apple", "Microsoft"], typical_roles: ["SWE Intern", "PM Intern", "Data Science Intern"], culture_notes: "Leetcode interviews, internship-to-return-offer pipeline" },
  { name: "Venture Capital", slug: "venture-capital", top_companies: ["Sequoia", "a16z", "Benchmark", "Accel", "Kleiner Perkins"], typical_roles: ["Analyst", "Associate", "Principal"], culture_notes: "Relationship-driven, sourcing-focused, startup exposure" },
  { name: "Hedge Funds", slug: "hedge-funds", top_companies: ["Citadel", "Two Sigma", "Bridgewater", "Point72", "Jane Street"], typical_roles: ["Quantitative Analyst", "Trader", "Researcher"], culture_notes: "Quantitative focus, meritocratic, high compensation" },
  { name: "Corporate Finance", slug: "corporate-finance", top_companies: ["Goldman Sachs", "JPMorgan", "Deloitte", "EY", "PwC"], typical_roles: ["Analyst", "Associate", "Manager"], culture_notes: "Financial modeling, reporting, strategic planning" },
  { name: "Product Management", slug: "product-management", top_companies: ["Google", "Meta", "Amazon", "Microsoft", "Stripe"], typical_roles: ["APM", "PM Intern", "Associate PM"], culture_notes: "Product sense, data-driven, cross-functional" },
  { name: "Real Estate", slug: "real-estate", top_companies: ["Blackstone Real Estate", "CBRE", "JLL", "Brookfield", "Prologis"], typical_roles: ["Analyst", "Associate", "Asset Manager"], culture_notes: "Deal-driven, relationship-focused, market knowledge critical" },
  { name: "Healthcare", slug: "healthcare", top_companies: ["McKinsey Health", "Deloitte Health", "Johnson and Johnson", "UnitedHealth", "CVS Health"], typical_roles: ["Analyst", "Consultant", "Strategy Associate"], culture_notes: "Mission-driven, regulatory-heavy, cross-functional" },
  { name: "Marketing and Advertising", slug: "marketing", top_companies: ["Google", "Meta", "WPP", "Omnicom", "Publicis"], typical_roles: ["Marketing Analyst", "Brand Manager", "Growth Manager"], culture_notes: "Creative, data-driven, fast-paced" },
  { name: "Fintech", slug: "fintech", top_companies: ["Stripe", "Robinhood", "Plaid", "Chime", "Affirm"], typical_roles: ["Product Manager", "Software Engineer", "Business Analyst"], culture_notes: "Fast-paced, mission-driven, regulatory awareness needed" },
  { name: "Government and Policy", slug: "government-policy", top_companies: ["US Treasury", "Federal Reserve", "World Bank", "IMF", "Congressional Budget Office"], typical_roles: ["Policy Analyst", "Research Associate", "Program Manager"], culture_notes: "Mission-driven, structured, public service oriented" },
  { name: "Consumer Goods", slug: "consumer-goods", top_companies: ["Procter and Gamble", "Unilever", "PepsiCo", "Coca-Cola", "Nike"], typical_roles: ["Brand Manager", "Marketing Analyst", "Strategy Associate"], culture_notes: "Brand management, marketing-heavy, rotational programs" },
  { name: "Media and Entertainment", slug: "media-entertainment", top_companies: ["Disney", "NBCUniversal", "Netflix", "Warner Bros", "Spotify"], typical_roles: ["Business Analyst", "Content Strategy", "Finance Analyst"], culture_notes: "Creative, deal-driven, relationship-focused" },
  { name: "Defense and Aerospace", slug: "defense", top_companies: ["Lockheed Martin", "Raytheon", "Northrop Grumman", "Boeing", "General Dynamics"], typical_roles: ["Engineer", "Program Analyst", "Business Development"], culture_notes: "Mission-driven, clearance often needed, structured" },
  { name: "Energy and Utilities", slug: "energy", top_companies: ["ExxonMobil", "Chevron", "Shell", "BP", "NextEra Energy"], typical_roles: ["Analyst", "Engineer", "Strategy Associate"], culture_notes: "Technical, global, transitioning to renewables" },
  { name: "Industrial and Manufacturing", slug: "industrials", top_companies: ["GE", "Honeywell", "3M", "Caterpillar", "Deere"], typical_roles: ["Engineer", "Operations Analyst", "Finance Analyst"], culture_notes: "Engineering-heavy, operational, global" },
  { name: "Real Estate", slug: "real-estate-industry", top_companies: ["Blackstone Real Estate", "CBRE", "JLL", "Brookfield", "Hines"], typical_roles: ["Analyst", "Associate", "Asset Manager"], culture_notes: "Deal-driven, relationship-focused, market knowledge" },
  { name: "Insurance", slug: "insurance", top_companies: ["Travelers", "Hartford", "Progressive", "Allstate", "Cigna"], typical_roles: ["Actuary", "Analyst", "Underwriter"], culture_notes: "Risk-focused, data-driven, structured" },
  { name: "Economic Consulting", slug: "economic-consulting", top_companies: ["Analysis Group", "Cornerstone Research", "NERA", "Compass Lexecon", "Charles River Associates"], typical_roles: ["Research Associate", "Analyst", "Consultant"], culture_notes: "Academic, PhD-heavy, litigation-focused" },
  { name: "Nonprofit and Social Impact", slug: "nonprofit", top_companies: ["Gates Foundation", "Bridgespan Group", "FSG", "McKinsey Social", "Teach for America"], typical_roles: ["Program Analyst", "Strategy Associate", "Research Analyst"], culture_notes: "Mission-driven, collaborative, policy-focused" },
  { name: "Sports Business", slug: "sports-business-industry", top_companies: ["Nike", "Adidas", "IMG", "Wasserman", "Endeavor"], typical_roles: ["Business Analyst", "Marketing Analyst", "Operations Analyst"], culture_notes: "Passion-driven, competitive entry, relationship-focused" },
];
