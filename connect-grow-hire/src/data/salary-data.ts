export interface SalaryLevel {
  title: string;
  baseSalary: string;
  bonus: string;
  totalComp: string;
}

export interface SalaryData {
  company: string;
  slug: string;
  industry: string;
  levels: SalaryLevel[];
  bonusNotes: string;
}

export const salaryData: SalaryData[] = [
  {
    company: "Goldman Sachs",
    slug: "goldman-sachs",
    industry: "investment-banking",
    levels: [
      { title: "Analyst (1st Year)", baseSalary: "$110k", bonus: "$50k-$80k", totalComp: "$160k-$190k" },
      { title: "Analyst (3rd Year)", baseSalary: "$110k", bonus: "$80k-$130k", totalComp: "$190k-$240k" },
      { title: "Associate", baseSalary: "$175k", bonus: "$100k-$200k", totalComp: "$275k-$375k" },
      { title: "Vice President", baseSalary: "$250k", bonus: "$200k-$400k", totalComp: "$450k-$650k" },
      { title: "Managing Director", baseSalary: "$400k", bonus: "$500k-$3M+", totalComp: "$900k-$3.5M+" }
    ],
    bonusNotes: "Bonuses are highly variable based on group performance and deal flow. Stub bonuses for first-year analysts typically paid in August. Annual bonus cycle is in January."
  },
  {
    company: "McKinsey",
    slug: "mckinsey",
    industry: "management-consulting",
    levels: [
      { title: "Business Analyst", baseSalary: "$112k", bonus: "$35k-$45k", totalComp: "$147k-$157k" },
      { title: "Associate", baseSalary: "$190k", bonus: "$50k-$70k", totalComp: "$240k-$260k" },
      { title: "Engagement Manager", baseSalary: "$250k", bonus: "$80k-$120k", totalComp: "$330k-$370k" },
      { title: "Associate Partner", baseSalary: "$350k", bonus: "$150k-$300k", totalComp: "$500k-$650k" },
      { title: "Senior Partner", baseSalary: "$500k", bonus: "$500k-$2M+", totalComp: "$1M-$2.5M+" }
    ],
    bonusNotes: "Performance bonuses paid annually. Signing bonus of $25k for Business Analysts. Relocation assistance and MBA sponsorship available at Associate level."
  },
  {
    company: "BCG",
    slug: "bcg",
    industry: "management-consulting",
    levels: [
      { title: "Associate/Consultant", baseSalary: "$110k", bonus: "$30k-$45k", totalComp: "$140k-$155k" },
      { title: "Consultant (Post-MBA)", baseSalary: "$190k", bonus: "$45k-$65k", totalComp: "$235k-$255k" },
      { title: "Project Leader", baseSalary: "$245k", bonus: "$70k-$110k", totalComp: "$315k-$355k" },
      { title: "Principal", baseSalary: "$340k", bonus: "$150k-$280k", totalComp: "$490k-$620k" },
      { title: "Managing Director & Partner", baseSalary: "$480k", bonus: "$400k-$1.5M+", totalComp: "$880k-$2M+" }
    ],
    bonusNotes: "Annual performance bonus plus signing bonus of $25k for undergrad hires. BCG also offers profit-sharing at senior levels and MBA sponsorship."
  },
  {
    company: "JPMorgan",
    slug: "jpmorgan",
    industry: "investment-banking",
    levels: [
      { title: "Analyst (1st Year)", baseSalary: "$110k", bonus: "$45k-$75k", totalComp: "$155k-$185k" },
      { title: "Analyst (3rd Year)", baseSalary: "$110k", bonus: "$70k-$120k", totalComp: "$180k-$230k" },
      { title: "Associate", baseSalary: "$175k", bonus: "$90k-$180k", totalComp: "$265k-$355k" },
      { title: "Vice President", baseSalary: "$250k", bonus: "$175k-$350k", totalComp: "$425k-$600k" },
      { title: "Managing Director", baseSalary: "$400k", bonus: "$400k-$2.5M+", totalComp: "$800k-$3M+" }
    ],
    bonusNotes: "Bonuses follow Wall Street compensation cycles. JPM is typically in-line with Goldman and Morgan Stanley. Sign-on bonuses for lateral hires are common at VP+ level."
  },
  {
    company: "Morgan Stanley",
    slug: "morgan-stanley",
    industry: "investment-banking",
    levels: [
      { title: "Analyst (1st Year)", baseSalary: "$110k", bonus: "$45k-$75k", totalComp: "$155k-$185k" },
      { title: "Analyst (3rd Year)", baseSalary: "$110k", bonus: "$75k-$125k", totalComp: "$185k-$235k" },
      { title: "Associate", baseSalary: "$175k", bonus: "$90k-$175k", totalComp: "$265k-$350k" },
      { title: "Vice President", baseSalary: "$250k", bonus: "$180k-$350k", totalComp: "$430k-$600k" },
      { title: "Managing Director", baseSalary: "$400k", bonus: "$400k-$2.5M+", totalComp: "$800k-$3M+" }
    ],
    bonusNotes: "Compensation in-line with Goldman and JPMorgan at junior levels. Wealth Management division pays differently than IBD. Deferred comp begins at VP level."
  },
  {
    company: "Blackstone",
    slug: "blackstone",
    industry: "private-equity",
    levels: [
      { title: "Analyst", baseSalary: "$120k", bonus: "$80k-$120k", totalComp: "$200k-$240k" },
      { title: "Associate", baseSalary: "$150k", bonus: "$150k-$250k", totalComp: "$300k-$400k" },
      { title: "Vice President", baseSalary: "$250k", bonus: "$300k-$600k", totalComp: "$550k-$850k" },
      { title: "Principal", baseSalary: "$350k", bonus: "$500k-$1.5M", totalComp: "$850k-$1.9M" },
      { title: "Managing Director", baseSalary: "$500k", bonus: "$1M-$5M+", totalComp: "$1.5M-$5.5M+" }
    ],
    bonusNotes: "Carry (carried interest) kicks in at VP level and is the primary wealth-building mechanism. Deal bonuses paid on top of annual comp for successful exits. Total comp at senior levels heavily dependent on fund performance."
  },
  {
    company: "Citadel",
    slug: "citadel",
    industry: "hedge-funds",
    levels: [
      { title: "Analyst/Researcher", baseSalary: "$150k-$200k", bonus: "$100k-$300k", totalComp: "$250k-$500k" },
      { title: "Senior Analyst", baseSalary: "$200k-$300k", bonus: "$200k-$600k", totalComp: "$400k-$900k" },
      { title: "Portfolio Manager (Junior)", baseSalary: "$300k-$500k", bonus: "$500k-$2M", totalComp: "$800k-$2.5M" },
      { title: "Portfolio Manager (Senior)", baseSalary: "$500k-$1M", bonus: "$2M-$10M+", totalComp: "$2.5M-$11M+" }
    ],
    bonusNotes: "Compensation is P&L-based for PMs. Analysts and researchers receive discretionary bonuses tied to team performance. Citadel Securities (market-making) pays separately and typically higher at junior levels."
  },
  {
    company: "Google",
    slug: "google",
    industry: "big-tech",
    levels: [
      { title: "L3 (Entry)", baseSalary: "$135k-$155k", bonus: "$15k-$25k", totalComp: "$180k-$220k" },
      { title: "L4 (Mid)", baseSalary: "$155k-$185k", bonus: "$20k-$35k", totalComp: "$250k-$320k" },
      { title: "L5 (Senior)", baseSalary: "$185k-$230k", bonus: "$30k-$50k", totalComp: "$350k-$450k" },
      { title: "L6 (Staff)", baseSalary: "$230k-$290k", bonus: "$45k-$70k", totalComp: "$500k-$700k" },
      { title: "L7 (Senior Staff)", baseSalary: "$280k-$360k", bonus: "$60k-$100k", totalComp: "$700k-$1.1M" }
    ],
    bonusNotes: "RSU grants vest over 4 years and make up the majority of total comp above L4. Annual refreshers based on performance ratings. Target bonus is 15% of base at L3-L4, 20% at L5+."
  },
  {
    company: "Meta",
    slug: "meta",
    industry: "big-tech",
    levels: [
      { title: "E3 (Entry)", baseSalary: "$130k-$150k", bonus: "$15k-$20k", totalComp: "$180k-$220k" },
      { title: "E4 (Mid)", baseSalary: "$155k-$190k", bonus: "$20k-$35k", totalComp: "$270k-$350k" },
      { title: "E5 (Senior)", baseSalary: "$190k-$240k", bonus: "$30k-$55k", totalComp: "$380k-$500k" },
      { title: "E6 (Staff)", baseSalary: "$240k-$310k", bonus: "$50k-$80k", totalComp: "$550k-$800k" },
      { title: "E7 (Senior Staff)", baseSalary: "$310k-$400k", bonus: "$70k-$110k", totalComp: "$800k-$1.3M" }
    ],
    bonusNotes: "Meta pays among the highest in tech. RSUs vest quarterly over 4 years. Annual refreshers are generous for top performers. Sign-on bonuses of $50k-$100k+ common for experienced hires."
  },
  {
    company: "Bain",
    slug: "bain",
    industry: "management-consulting",
    levels: [
      { title: "Associate Consultant", baseSalary: "$108k", bonus: "$30k-$42k", totalComp: "$138k-$150k" },
      { title: "Consultant (Post-MBA)", baseSalary: "$190k", bonus: "$45k-$60k", totalComp: "$235k-$250k" },
      { title: "Case Team Leader", baseSalary: "$240k", bonus: "$65k-$100k", totalComp: "$305k-$340k" },
      { title: "Principal", baseSalary: "$340k", bonus: "$140k-$260k", totalComp: "$480k-$600k" },
      { title: "Partner", baseSalary: "$480k", bonus: "$400k-$1.5M+", totalComp: "$880k-$2M+" }
    ],
    bonusNotes: "Bain offers profit-sharing at partnership level. Signing bonuses of $25k for undergrad AC hires. Known for best work-life balance among MBB, with slightly lower hours but competitive total comp."
  },
  {
    company: "Evercore",
    slug: "evercore",
    industry: "investment-banking",
    levels: [
      { title: "Analyst (1st Year)", baseSalary: "$110k", bonus: "$80k-$120k", totalComp: "$190k-$230k" },
      { title: "Analyst (3rd Year)", baseSalary: "$110k", bonus: "$100k-$160k", totalComp: "$210k-$270k" },
      { title: "Associate", baseSalary: "$175k", bonus: "$120k-$225k", totalComp: "$295k-$400k" },
      { title: "Vice President", baseSalary: "$250k", bonus: "$250k-$450k", totalComp: "$500k-$700k" },
      { title: "Managing Director", baseSalary: "$400k", bonus: "$600k-$4M+", totalComp: "$1M-$4.5M+" }
    ],
    bonusNotes: "Evercore consistently pays at the top of the Street for analysts and associates. Elite boutiques compete aggressively on compensation to attract top talent from bulge brackets. Deal bonuses on top of standard comp."
  },
  {
    company: "KKR",
    slug: "kkr",
    industry: "private-equity",
    levels: [
      { title: "Associate", baseSalary: "$150k", bonus: "$150k-$250k", totalComp: "$300k-$400k" },
      { title: "Vice President", baseSalary: "$250k", bonus: "$250k-$500k", totalComp: "$500k-$750k" },
      { title: "Director", baseSalary: "$350k", bonus: "$500k-$1.5M", totalComp: "$850k-$1.9M" },
      { title: "Managing Director", baseSalary: "$500k", bonus: "$1M-$5M+", totalComp: "$1.5M-$5.5M+" }
    ],
    bonusNotes: "Carry allocation begins at VP level and grows significantly with seniority. KKR went public, so senior employees also receive equity in the management company. Co-investment opportunities available at Director+."
  },
  {
    company: "Two Sigma",
    slug: "two-sigma",
    industry: "hedge-funds",
    levels: [
      { title: "Quantitative Researcher (Entry)", baseSalary: "$150k-$200k", bonus: "$75k-$200k", totalComp: "$225k-$400k" },
      { title: "Senior Researcher", baseSalary: "$200k-$300k", bonus: "$150k-$500k", totalComp: "$350k-$800k" },
      { title: "Vice President", baseSalary: "$250k-$400k", bonus: "$300k-$1M", totalComp: "$550k-$1.4M" },
      { title: "Principal", baseSalary: "$350k-$500k", bonus: "$500k-$3M+", totalComp: "$850k-$3.5M+" }
    ],
    bonusNotes: "Two Sigma pays top-of-market for quant talent. Bonuses tied to fund performance and individual alpha generation. Software engineers paid comparably to researchers. Strong benefits including 401k match and wellness programs."
  },
  {
    company: "Deloitte",
    slug: "deloitte",
    industry: "management-consulting",
    levels: [
      { title: "Analyst", baseSalary: "$83k-$95k", bonus: "$5k-$12k", totalComp: "$88k-$107k" },
      { title: "Consultant", baseSalary: "$105k-$130k", bonus: "$10k-$20k", totalComp: "$115k-$150k" },
      { title: "Senior Consultant", baseSalary: "$130k-$160k", bonus: "$15k-$30k", totalComp: "$145k-$190k" },
      { title: "Manager", baseSalary: "$165k-$210k", bonus: "$25k-$50k", totalComp: "$190k-$260k" },
      { title: "Senior Manager/Director", baseSalary: "$220k-$320k", bonus: "$50k-$120k", totalComp: "$270k-$440k" }
    ],
    bonusNotes: "Strategy & Operations (S&O/Monitor) pays significantly more than core consulting. Signing bonuses of $10k-$15k for analysts. Deloitte offers strong benefits and 401k match. Partner comp ranges $500k-$2M+."
  },
  {
    company: "Amazon",
    slug: "amazon",
    industry: "big-tech",
    levels: [
      { title: "SDE I (L4)", baseSalary: "$130k-$155k", bonus: "$15k-$25k sign-on", totalComp: "$170k-$230k" },
      { title: "SDE II (L5)", baseSalary: "$150k-$185k", bonus: "$20k-$30k sign-on", totalComp: "$250k-$350k" },
      { title: "SDE III (L6)", baseSalary: "$175k-$220k", bonus: "$25k-$40k sign-on", totalComp: "$350k-$500k" },
      { title: "Principal (L7)", baseSalary: "$210k-$260k", bonus: "$30k-$50k sign-on", totalComp: "$500k-$750k" },
      { title: "Senior Principal (L8)", baseSalary: "$260k-$350k", bonus: "Variable", totalComp: "$750k-$1.2M" }
    ],
    bonusNotes: "Amazon caps base salary at ~$185k (sometimes extended to $220k for senior). Majority of comp above L5 comes from RSUs vesting on a back-loaded schedule (5/15/40/40 over 4 years). Sign-on bonuses offset the back-loading."
  },
  {
    company: "Microsoft",
    slug: "microsoft",
    industry: "big-tech",
    levels: [
      { title: "SDE (Level 59-60)", baseSalary: "$120k-$145k", bonus: "$10k-$20k", totalComp: "$155k-$200k" },
      { title: "SDE II (Level 61-62)", baseSalary: "$145k-$175k", bonus: "$15k-$30k", totalComp: "$220k-$300k" },
      { title: "Senior SDE (Level 63-64)", baseSalary: "$175k-$220k", bonus: "$25k-$45k", totalComp: "$300k-$430k" },
      { title: "Principal (Level 65-66)", baseSalary: "$215k-$280k", bonus: "$40k-$65k", totalComp: "$430k-$650k" },
      { title: "Partner (Level 67-68)", baseSalary: "$280k-$380k", bonus: "$60k-$100k", totalComp: "$650k-$1M+" }
    ],
    bonusNotes: "Microsoft stock vests evenly over 4 years. Annual refreshers based on performance. Bonus target is 10-20% of base depending on level. Microsoft tends to pay below Google/Meta at senior levels but offers better work-life balance."
  },
  {
    company: "Apple",
    slug: "apple",
    industry: "big-tech",
    levels: [
      { title: "ICT2 (Entry)", baseSalary: "$130k-$150k", bonus: "$15k-$25k", totalComp: "$170k-$220k" },
      { title: "ICT3 (Mid)", baseSalary: "$155k-$190k", bonus: "$20k-$35k", totalComp: "$250k-$330k" },
      { title: "ICT4 (Senior)", baseSalary: "$190k-$240k", bonus: "$30k-$50k", totalComp: "$340k-$460k" },
      { title: "ICT5 (Staff)", baseSalary: "$235k-$300k", bonus: "$45k-$70k", totalComp: "$480k-$680k" },
      { title: "ICT6 (Principal)", baseSalary: "$290k-$370k", bonus: "$60k-$100k", totalComp: "$650k-$950k" }
    ],
    bonusNotes: "Apple RSUs vest over 4 years with annual refreshers. Apple is known for being slightly below Google/Meta on total comp but offers strong work culture and product impact. Hardware engineers may receive different comp bands."
  },
  {
    company: "Stripe",
    slug: "stripe",
    industry: "big-tech",
    levels: [
      { title: "L2 (New Grad)", baseSalary: "$140k-$160k", bonus: "$10k-$20k", totalComp: "$200k-$260k" },
      { title: "L3 (Mid)", baseSalary: "$170k-$200k", bonus: "$20k-$35k", totalComp: "$290k-$380k" },
      { title: "L4 (Senior)", baseSalary: "$210k-$255k", bonus: "$35k-$55k", totalComp: "$400k-$550k" },
      { title: "L5 (Staff)", baseSalary: "$260k-$320k", bonus: "$50k-$80k", totalComp: "$550k-$800k" }
    ],
    bonusNotes: "Stripe's equity has become liquid since their 2025 direct listing. Comp is competitive with FAANG at senior levels. Strong benefits including $10k annual learning/development budget and premium healthcare."
  },
  {
    company: "Jane Street",
    slug: "jane-street",
    industry: "hedge-funds",
    levels: [
      { title: "Trader/Researcher (Entry)", baseSalary: "$200k-$250k", bonus: "$100k-$300k", totalComp: "$300k-$550k" },
      { title: "Trader/Researcher (3-5 years)", baseSalary: "$250k-$400k", bonus: "$300k-$1M", totalComp: "$550k-$1.4M" },
      { title: "Senior Trader/Researcher", baseSalary: "$350k-$500k", bonus: "$500k-$3M+", totalComp: "$850k-$3.5M+" }
    ],
    bonusNotes: "Jane Street is known for the highest entry-level compensation in finance. Bonuses are P&L-based and can be multiples of base salary in strong years. No carried interest structure since it's prop trading."
  },
  {
    company: "Apollo",
    slug: "apollo",
    industry: "private-equity",
    levels: [
      { title: "Associate", baseSalary: "$150k", bonus: "$130k-$225k", totalComp: "$280k-$375k" },
      { title: "Vice President", baseSalary: "$250k", bonus: "$250k-$500k", totalComp: "$500k-$750k" },
      { title: "Principal", baseSalary: "$350k", bonus: "$500k-$1.5M", totalComp: "$850k-$1.9M" },
      { title: "Partner", baseSalary: "$500k", bonus: "$1M-$5M+", totalComp: "$1.5M-$5.5M+" }
    ],
    bonusNotes: "Apollo is known for a more aggressive, performance-driven culture with compensation to match. Carry begins at VP level. Apollo's credit and insurance businesses offer additional comp opportunities beyond traditional PE."
  }
];
