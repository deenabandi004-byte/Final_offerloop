export interface Role {
  name: string;
  slug: string;
  industry: string;
  top_employers: string[];
  timeline: string;
  interview_type: string;
}

export const roles: Role[] = [
  { name: "Investment Banking Analyst", slug: "investment-banking-analyst", industry: "investment-banking", top_employers: ["Goldman Sachs", "JPMorgan", "Morgan Stanley", "Evercore", "Lazard"], timeline: "Applications open June-August for summer analysts", interview_type: "Technical + behavioral, superday format" },
  { name: "Management Consulting Intern", slug: "management-consulting-intern", industry: "consulting", top_employers: ["McKinsey", "BCG", "Bain", "Deloitte", "Accenture"], timeline: "Applications open August-October", interview_type: "Case interviews + fit interviews" },
  { name: "Software Engineering Intern", slug: "software-engineering-intern", industry: "tech", top_employers: ["Google", "Meta", "Amazon", "Apple", "Microsoft"], timeline: "Applications open August-November", interview_type: "Leetcode-style technical interviews" },
  { name: "Product Manager Intern", slug: "product-manager-intern", industry: "tech", top_employers: ["Google", "Meta", "Amazon", "Microsoft", "Stripe"], timeline: "Applications open September-December", interview_type: "Product sense + analytical + behavioral" },
  { name: "Private Equity Analyst", slug: "private-equity-analyst", industry: "private-equity", top_employers: ["Blackstone", "KKR", "Apollo", "Carlyle", "Warburg Pincus"], timeline: "Off-cycle recruiting, usually post-IB", interview_type: "LBO modeling + case studies" },
  { name: "Data Science Intern", slug: "data-science-intern", industry: "tech", top_employers: ["Google", "Meta", "Amazon", "Two Sigma", "Citadel"], timeline: "Applications open September-December", interview_type: "Statistics + SQL + Python + case studies" },
  { name: "Venture Capital Analyst", slug: "venture-capital-analyst", industry: "venture-capital", top_employers: ["Sequoia", "a16z", "Benchmark", "Accel", "Kleiner Perkins"], timeline: "Off-cycle, relationship-driven recruiting", interview_type: "Investment thesis + deal sourcing + market analysis" },
  { name: "Corporate Finance Analyst", slug: "corporate-finance-analyst", industry: "finance", top_employers: ["Goldman Sachs", "JPMorgan", "Deloitte", "EY", "PwC"], timeline: "Applications open August-October", interview_type: "Technical finance + behavioral" },
];
