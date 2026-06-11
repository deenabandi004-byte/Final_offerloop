export interface RecruiterData {
  university: string;
  slug: string;
  topFirms: string[];
  recruitingCalendar: string;
  studentClubs: string[];
}

export const recruiterData: RecruiterData[] = [
  {
    university: "University of Southern California",
    slug: "usc",
    topFirms: ["Goldman Sachs", "JPMorgan", "Deloitte", "PwC", "EY", "Disney", "Amazon", "Google"],
    recruitingCalendar: "Fall recruiting kicks off in September with Meet the Firms week. IB summer analyst applications open in August for juniors. Consulting apps due October-November. Tech recruiting runs September through March with on-campus interviews. Spring career fair in February brings 200+ employers.",
    studentClubs: ["Troy Capital Group", "Marshall Consulting Club", "Women in Business", "Trojan Investments", "USC Venture Fund", "Marshall Marketing Association", "Real Estate Association", "Sigma Eta Pi"]
  },
  {
    university: "Harvard University",
    slug: "harvard",
    topFirms: ["McKinsey", "Goldman Sachs", "BCG", "Bain", "Morgan Stanley", "Blackstone", "Google", "Jane Street"],
    recruitingCalendar: "On-campus recruiting begins in September with company presentations at OCS. IB and consulting timelines have accelerated to July-August for junior summer positions. Harvard's brand opens doors for off-cycle applications year-round. January recruiting for buy-side roles.",
    studentClubs: ["Harvard Business Club", "Harvard College Investment Group", "Consulting Club", "Harvard Venture Capital & Private Equity Club", "Harvard Women in Business", "Black Business Association", "Harvard Financial Analysts Club", "Tech@Harvard"]
  },
  {
    university: "Stanford University",
    slug: "stanford",
    topFirms: ["Google", "Meta", "Apple", "McKinsey", "Goldman Sachs", "Sequoia Capital", "a16z", "Stripe"],
    recruitingCalendar: "Tech dominates the recruiting calendar with applications opening August-October. Finance and consulting recruit heavily in fall quarter. Stanford's startup ecosystem means year-round recruiting for early-stage companies. BEAM career fairs in October and January.",
    studentClubs: ["Stanford Venture Capital Club", "Stanford Women in Business", "Entrepreneurship Club", "Stanford Investment Group", "Management Consulting Club", "Stanford Financial Group", "Stanford Marketing", "Sigma Alpha Pi"]
  },
  {
    university: "MIT",
    slug: "mit",
    topFirms: ["Jane Street", "Citadel", "Two Sigma", "Google", "McKinsey", "Goldman Sachs", "Apple", "DE Shaw"],
    recruitingCalendar: "Quant firms recruit aggressively starting September with puzzle challenges and trading competitions. Tech recruiting peaks October-December. Finance info sessions run through MIT Sloan connections. Career fair in September is the largest on campus with 400+ companies.",
    studentClubs: ["MIT Trading Club", "MIT Sloan Finance Club", "MIT Consulting Club", "MIT Venture Capital Club", "MIT Quantitative Finance Club", "HackMIT", "MIT Entrepreneurship Club", "Women in Finance"]
  },
  {
    university: "University of Pennsylvania (Wharton)",
    slug: "wharton",
    topFirms: ["Goldman Sachs", "Morgan Stanley", "Blackstone", "KKR", "Apollo", "McKinsey", "Evercore", "Citadel"],
    recruitingCalendar: "IB recruiting is the earliest of any school with applications in July and superdays in August-September. PE/HF on-cycle recruiting happens simultaneously. Consulting recruits September-November. Wharton's finance placement is unmatched with 40%+ of the class going into finance.",
    studentClubs: ["Wharton Investment & Trading Group", "Wharton Finance Club", "Private Equity & Venture Capital Club", "Management Consulting Club", "Wharton Women in Finance", "Wharton Real Estate Club", "WITG Fixed Income", "Wharton Hedge Fund Club"]
  },
  {
    university: "Columbia University",
    slug: "columbia",
    topFirms: ["Goldman Sachs", "JPMorgan", "Morgan Stanley", "Blackstone", "McKinsey", "Evercore", "Lazard", "Google"],
    recruitingCalendar: "NYC location gives Columbia students direct access to Wall Street firms. IB recruiting aligns with other targets (July-September). Banks host info sessions on campus weekly in fall. Consulting recruiting runs October-January. Spring semester brings boutique banks and hedge funds.",
    studentClubs: ["Columbia Investment Banking Club", "Columbia Consulting Club", "Women in Business", "Columbia Venture Partners", "Real Estate Association", "Private Equity Club", "Columbia Quant Group", "Tech@Columbia"]
  },
  {
    university: "New York University (Stern)",
    slug: "nyu",
    topFirms: ["JPMorgan", "Goldman Sachs", "Morgan Stanley", "Deloitte", "PwC", "Lazard", "Houlihan Lokey", "Citi"],
    recruitingCalendar: "Stern's IB placement rivals Ivy League schools. Recruiting starts in August with applications and networking events. Proximity to Midtown means daily coffee chats with professionals. Stern's January intersession is prime time for informational interviews.",
    studentClubs: ["Finance Society", "Management Consulting Group", "Stern Women in Business", "Real Estate Club", "Private Equity & Venture Capital Club", "Business Analytics Club", "Stern Tech Association", "Stern Investment Banking Association"]
  },
  {
    university: "University of Michigan (Ross)",
    slug: "michigan",
    topFirms: ["McKinsey", "BCG", "Goldman Sachs", "JPMorgan", "Deloitte", "Amazon", "Google", "Ford"],
    recruitingCalendar: "Ross runs an aggressive fall recruiting season starting in September. IB and consulting recruit heavily from Michigan with dedicated pipelines. Career fair week in September brings 300+ companies. Winter term is peak for tech recruiting. Summer applications typically due October-January.",
    studentClubs: ["Michigan Investment Group", "Consulting Club", "Women in Business", "Finance Club", "Real Estate Club", "Entrepreneurship Club", "Marketing Club", "Michigan Interactive Investments"]
  },
  {
    university: "Duke University",
    slug: "duke",
    topFirms: ["Goldman Sachs", "McKinsey", "BCG", "JPMorgan", "Morgan Stanley", "Bain", "Google", "Evercore"],
    recruitingCalendar: "Fall recruiting begins with Career Center kickoff in early September. IB applications due August-September for juniors. Consulting case prep season runs September-January. Duke's strong alumni network in Charlotte banking and DC policy creates unique pipelines.",
    studentClubs: ["Duke Investment Club", "Fuqua Finance Club", "Consulting Club", "Women in Business", "Duke Private Equity Club", "Bull City Venture Partners", "Duke Real Estate Club", "Duke Marketing Club"]
  },
  {
    university: "Georgetown University",
    slug: "georgetown",
    topFirms: ["Goldman Sachs", "JPMorgan", "Morgan Stanley", "Deloitte", "BCG", "Evercore", "Carlyle Group", "McKinsey"],
    recruitingCalendar: "Georgetown's DC location and McDonough School dominate policy and finance recruiting. IB apps open August-September. Consulting and government recruiting peaks in fall. Georgetown Alumni Career Network events run monthly. Strong Carlyle/DC PE pipeline.",
    studentClubs: ["Georgetown Investment Society", "Consulting Society", "Women in Banking & Finance", "McDonough Business Association", "Private Equity & Venture Capital Club", "Real Estate Society", "Georgetown Fintech Club", "Marketing & Strategy Club"]
  },
  {
    university: "Yale University",
    slug: "yale",
    topFirms: ["McKinsey", "Goldman Sachs", "BCG", "Bain", "Morgan Stanley", "Bridgewater", "Blackstone", "Google"],
    recruitingCalendar: "Yale's liberal arts focus means recruiting timelines catch some students off-guard. IB and consulting recruit in the standard August-November window. OCS hosts company presentations in fall. Yale's brand carries significant weight for off-cycle and non-traditional applications.",
    studentClubs: ["Yale Undergraduate Consulting Group", "Yale Investment Club", "Women in Business", "Entrepreneurial Society", "Yale Private Equity Club", "Yale Venture Capital Club", "Finance Club", "Smart Woman Securities"]
  },
  {
    university: "Princeton University",
    slug: "princeton",
    topFirms: ["Jane Street", "Citadel", "Goldman Sachs", "McKinsey", "Two Sigma", "DE Shaw", "Morgan Stanley", "Google"],
    recruitingCalendar: "Princeton's quant placement is among the best in the country. Trading firms and quant funds recruit starting September with math challenges and competitions. IB and consulting follow standard timelines. Career Services hosts 150+ employers at fall fair.",
    studentClubs: ["Princeton Quant Trading Club", "Investment Club", "Entrepreneurship Club", "Consulting Club", "Finance Club", "Women in Finance", "Princeton Hedge Fund Club", "PAVE (Princeton Association of Venture in Entrepreneurship)"]
  },
  {
    university: "UC Berkeley",
    slug: "berkeley",
    topFirms: ["Google", "Meta", "Apple", "Amazon", "Goldman Sachs", "McKinsey", "Stripe", "Two Sigma"],
    recruitingCalendar: "Tech recruiting dominates Berkeley's calendar with applications from August through January. Haas School runs separate finance and consulting pipelines. Fall career fair is one of the largest on the West Coast. Berkeley's startup ecosystem creates year-round opportunities.",
    studentClubs: ["Berkeley Consulting", "Finance Club at Berkeley", "Blockchain at Berkeley", "CSBA (Computer Science Business Association)", "Women in Business", "Haas Investment Club", "Product Development at Berkeley", "Data Science Society"]
  },
  {
    university: "UCLA",
    slug: "ucla",
    topFirms: ["Goldman Sachs", "JPMorgan", "Google", "Disney", "Deloitte", "Amazon", "BCG", "CBRE"],
    recruitingCalendar: "UCLA Anderson and undergraduate business programs feed heavily into entertainment, tech, and finance. Fall career fair in October brings 250+ employers. IB recruiting runs August-October. Consulting and tech recruit through winter quarter. Entertainment recruiting peaks in spring.",
    studentClubs: ["Bruin Capital Partners", "UCLA Consulting", "Women in Business", "Finance Society", "Real Estate Association", "Entertainment & Media Club", "Anderson Venture Capital", "Startup UCLA"]
  },
  {
    university: "Cornell University",
    slug: "cornell",
    topFirms: ["Goldman Sachs", "JPMorgan", "Citi", "McKinsey", "Deloitte", "Google", "Amazon", "Barclays"],
    recruitingCalendar: "Dyson School and Cornell overall place well into IB and consulting. Fall recruiting starts in September with company info sessions. IB apps due August-September. Cornell's hotel school creates unique paths into real estate and hospitality finance. Spring is strong for tech.",
    studentClubs: ["Cornell Investment Banking Club", "Consulting Club", "Cornell Venture Capital", "Women in Business", "Finance Club", "Real Estate Club", "Quant Fund", "Cornell Fintech Club"]
  },
  {
    university: "University of Chicago",
    slug: "uchicago",
    topFirms: ["Citadel", "McKinsey", "Goldman Sachs", "BCG", "Two Sigma", "Jane Street", "JPMorgan", "Bain"],
    recruitingCalendar: "Chicago's quantitative rigor attracts quant firms and consulting firms heavily. Trading firm recruiting starts early fall with math tests and competitions. IB and consulting follow standard timelines through Booth connections. Career Advancement hosts major events in October.",
    studentClubs: ["Chicago Booth Finance Club", "Consulting Club", "Private Equity Club", "Quant Club", "Women in Business", "Real Estate Group", "Chicago Ventures", "Booth Investment Group"]
  },
  {
    university: "Northwestern University (Kellogg)",
    slug: "northwestern",
    topFirms: ["McKinsey", "BCG", "Bain", "Goldman Sachs", "JPMorgan", "Google", "Amazon", "Deloitte"],
    recruitingCalendar: "Northwestern is a consulting powerhouse. MBB firms recruit heavily from Kellogg and undergrad. Fall quarter is peak with company presentations and application deadlines. IB recruiting follows standard August-November timeline. Tech recruiting runs throughout the year.",
    studentClubs: ["Northwestern Consulting Group", "Finance Club", "Women in Business", "Real Estate Club", "Private Equity Club", "Kellogg Venture Capital", "Marketing Club", "Analytics Club"]
  },
  {
    university: "University of Virginia (McIntire)",
    slug: "uva",
    topFirms: ["Goldman Sachs", "JPMorgan", "Deloitte", "EY", "BCG", "Morgan Stanley", "Capital One", "Booz Allen"],
    recruitingCalendar: "McIntire's Commerce School is a top IB and consulting feeder. Fall recruiting begins with McIntire Career Services events in September. IB apps open August-September. Strong DC-area recruiting pipeline for consulting and government-adjacent roles. Spring career fair focuses on tech.",
    studentClubs: ["McIntire Investment Institute", "Consulting Club", "Women in Finance", "Real Estate Club", "Darden Capital Management", "Venture Fund", "Marketing Club", "Business Ethics Society"]
  },
  {
    university: "Dartmouth College",
    slug: "dartmouth",
    topFirms: ["Goldman Sachs", "McKinsey", "Bain", "BCG", "Morgan Stanley", "Evercore", "Blackstone", "Google"],
    recruitingCalendar: "Dartmouth punches well above its size in finance and consulting placement. Tuck connections give undergrads access to MBA-level recruiting events. Fall term is compressed and intense for IB/consulting. Small class size means strong alumni networks at every major firm.",
    studentClubs: ["Dartmouth Investment Banking Club", "Consulting Association", "Women in Business", "Dartmouth Capital Partners", "Private Equity Club", "Entrepreneurship Society", "Finance Society", "Real Estate Club"]
  },
  {
    university: "University of Texas at Austin",
    slug: "ut-austin",
    topFirms: ["Goldman Sachs", "JPMorgan", "Deloitte", "EY", "Amazon", "Google", "Dell", "BCG"],
    recruitingCalendar: "McCombs School feeds heavily into Texas-based finance (Houston IB, Dallas PE) and Austin tech. Fall recruiting starts with career fair week in September. IB applications due August-October. Texas recruiting is slightly behind East Coast timelines. Strong energy finance pipeline.",
    studentClubs: ["Texas Investment Management Company", "Consulting Association", "Women in Finance", "Real Estate Center", "Longhorn Entrepreneurship Agency", "Finance Association", "Texas Venture Labs", "Analytics Club"]
  }
];
