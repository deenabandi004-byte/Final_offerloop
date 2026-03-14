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
];
