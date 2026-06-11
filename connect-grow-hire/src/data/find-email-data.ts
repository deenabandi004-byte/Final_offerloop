export interface FindEmailData {
  personType: string;
  slug: string;
  industry: string;
  emailFormats: string[];
  difficulty: string;
}

export const findEmailData: FindEmailData[] = [
  {
    personType: "Investment Banking Analyst",
    slug: "investment-banking-analyst",
    industry: "investment-banking",
    emailFormats: ["first.last@bank.com", "flast@bank.com", "firstlast@bank.com"],
    difficulty: "Banks use consistent corporate formats but analysts rotate frequently between groups. Verify they haven't moved to PE or another bank since LinkedIn was last updated."
  },
  {
    personType: "Management Consultant",
    slug: "management-consultant",
    industry: "management-consulting",
    emailFormats: ["first.last@firm.com", "first_last@firm.com", "flast@firm.com"],
    difficulty: "Consultants travel constantly and rarely check cold emails. Their corporate directories are locked down, and many use project-specific aliases that don't accept external mail."
  },
  {
    personType: "Private Equity Associate",
    slug: "private-equity-associate",
    industry: "private-equity",
    emailFormats: ["first.last@firm.com", "first@firm.com", "flast@firm.com"],
    difficulty: "PE firms are small and secretive. Many don't have public-facing email formats, and associates guard their inboxes aggressively. You often need a warm intro or catch them at a conference."
  },
  {
    personType: "Hedge Fund Trader",
    slug: "hedge-fund-trader",
    industry: "hedge-funds",
    emailFormats: ["first.last@fund.com", "first@fund.com", "firstl@fund.com"],
    difficulty: "Hedge funds are the hardest industry to find emails for. Most have no public-facing website, traders don't use LinkedIn actively, and firms actively prevent unsolicited contact."
  },
  {
    personType: "Venture Capital Analyst",
    slug: "venture-capital-analyst",
    industry: "venture-capital",
    emailFormats: ["first@firm.com", "first.last@firm.com", "first@vc.com"],
    difficulty: "VC analysts are more accessible than most finance roles since VCs want deal flow. Many list their emails on firm websites or Twitter bios. The challenge is standing out in a flooded inbox."
  },
  {
    personType: "Software Engineer",
    slug: "software-engineer",
    industry: "big-tech",
    emailFormats: ["first.last@company.com", "firstl@company.com", "first@company.com"],
    difficulty: "Engineers at big tech companies have corporate emails but rarely respond to cold outreach there. They're more reachable via GitHub, Twitter/X, or personal blogs. Corporate email formats vary by company size."
  },
  {
    personType: "Product Manager",
    slug: "product-manager",
    industry: "big-tech",
    emailFormats: ["first.last@company.com", "first@company.com", "flast@company.com"],
    difficulty: "PMs are active on LinkedIn and relatively responsive to thoughtful outreach. The main challenge is identifying the right PM for a specific product area, as titles don't always map to team ownership."
  },
  {
    personType: "Data Scientist",
    slug: "data-scientist",
    industry: "big-tech",
    emailFormats: ["first.last@company.com", "firstlast@company.com", "first@company.com"],
    difficulty: "Data scientists often publish research and have academic profiles with listed emails. The challenge is that many work on internal tools and aren't public-facing, making it hard to find the right person for your area of interest."
  },
  {
    personType: "Corporate Finance Analyst",
    slug: "corporate-finance-analyst",
    industry: "corporate-finance",
    emailFormats: ["first.last@company.com", "flast@company.com", "first_last@company.com"],
    difficulty: "Corporate finance professionals at F500 companies use standard formats but are buried in large organizations. Finding the right person in FP&A vs Treasury vs Corp Dev requires LinkedIn research and org chart mapping."
  },
  {
    personType: "Real Estate Analyst",
    slug: "real-estate-analyst",
    industry: "real-estate",
    emailFormats: ["first.last@firm.com", "first@firm.com", "flast@firm.com"],
    difficulty: "Real estate firms range from massive REITs to small shops. Larger firms have predictable formats, but smaller developers and funds often have inconsistent or personal email setups that are hard to guess."
  },
  {
    personType: "Marketing Manager",
    slug: "marketing-manager",
    industry: "marketing",
    emailFormats: ["first.last@company.com", "first@company.com", "firstlast@company.com"],
    difficulty: "Marketing managers are generally the most accessible professionals to email since they understand outreach. Many have public-facing profiles with contact info. The challenge is reaching the decision-maker vs. a coordinator."
  },
  {
    personType: "HR Recruiter",
    slug: "hr-recruiter",
    industry: "human-resources",
    emailFormats: ["first.last@company.com", "recruiting@company.com", "careers@company.com"],
    difficulty: "Recruiters want to hear from candidates but are overwhelmed with volume. Their personal emails are findable, but generic recruiting@ addresses often go to ATS black holes. Direct recruiter emails get 3x the response rate."
  },
  {
    personType: "CEO",
    slug: "ceo",
    industry: "executive",
    emailFormats: ["first@company.com", "first.last@company.com", "ceo@company.com"],
    difficulty: "CEO emails are heavily gatekept by executive assistants. Even if you find the right address, most have filters that route unknown senders to assistants. Best reached through board members, investors, or warm intros."
  },
  {
    personType: "CFO",
    slug: "cfo",
    industry: "executive",
    emailFormats: ["first.last@company.com", "first@company.com", "flast@company.com"],
    difficulty: "CFOs are slightly more accessible than CEOs for finance-related outreach but still heavily filtered. They're most responsive during earnings season prep or when evaluating new tools/services that impact their function."
  },
  {
    personType: "CTO",
    slug: "cto",
    industry: "executive",
    emailFormats: ["first@company.com", "first.last@company.com", "cto@company.com"],
    difficulty: "CTOs at startups are often reachable via Twitter/X or personal email listed on their GitHub. At larger companies, they're gatekept like other C-suite. Technical credibility in your outreach is essential."
  },
  {
    personType: "Startup Founder",
    slug: "startup-founder",
    industry: "startups",
    emailFormats: ["first@company.com", "founder@company.com", "first.last@company.com"],
    difficulty: "Startup founders are often the most accessible executives because they're still building their network. Many list emails on their personal sites, AngelList, or Twitter bios. The challenge is standing out among the volume of pitch emails they receive."
  },
  {
    personType: "Research Analyst",
    slug: "research-analyst",
    industry: "investment-banking",
    emailFormats: ["first.last@bank.com", "flast@bank.com", "first.last@research.com"],
    difficulty: "Sell-side research analysts are relatively public-facing since they publish reports. Their emails are often on research portals. Buy-side research analysts at hedge funds are much harder to reach and rarely respond to cold outreach."
  },
  {
    personType: "Operations Manager",
    slug: "operations-manager",
    industry: "operations",
    emailFormats: ["first.last@company.com", "flast@company.com", "first_last@company.com"],
    difficulty: "Operations managers at large companies use standard corporate formats but are often in fulfillment centers or distribution hubs with limited email responsiveness. Best reached during business hours with a clear value proposition."
  },
  {
    personType: "Supply Chain Analyst",
    slug: "supply-chain-analyst",
    industry: "operations",
    emailFormats: ["first.last@company.com", "flast@company.com", "first.last@logistics.com"],
    difficulty: "Supply chain professionals are increasingly in-demand but not traditionally networked online. Many work for manufacturers or logistics companies with outdated web presences, making email verification harder."
  },
  {
    personType: "UX Designer",
    slug: "ux-designer",
    industry: "big-tech",
    emailFormats: ["first.last@company.com", "first@company.com", "firstlast@company.com"],
    difficulty: "UX designers are active on portfolio sites (Dribbble, Behance) and often list personal emails there. Corporate emails follow standard formats. They respond well to outreach that shows you've studied their portfolio work."
  }
];
