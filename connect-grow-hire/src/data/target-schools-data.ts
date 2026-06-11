export interface TargetSchoolData {
  name: string;
  slug: string;
  industry: string;
  targetSchools: string[];
  gpaExpectation: string;
  nonTargetAdvice: string;
}

export const targetSchoolsData: TargetSchoolData[] = [
  {
    name: "Goldman Sachs",
    slug: "goldman-sachs",
    industry: "investment-banking",
    targetSchools: ["Harvard", "Wharton", "Princeton", "Yale", "Columbia", "Stanford", "MIT", "NYU Stern", "Duke", "Georgetown", "Dartmouth", "Chicago Booth", "Cornell", "Michigan Ross"],
    gpaExpectation: "3.5+ GPA from target schools, 3.7+ from semi-targets",
    nonTargetAdvice: "Break in through the diversity programs (Possibilities Summit, LAUNCH), network aggressively with alumni in your region, and get a strong spring week or off-cycle internship first."
  },
  {
    name: "McKinsey",
    slug: "mckinsey",
    industry: "management-consulting",
    targetSchools: ["Harvard", "Stanford", "Wharton", "Yale", "Princeton", "MIT", "Columbia", "Chicago", "Duke", "Northwestern", "Dartmouth", "Oxford", "Cambridge"],
    gpaExpectation: "3.5+ GPA strongly preferred, top 10% of class from non-targets",
    nonTargetAdvice: "McKinsey runs Insight programs for non-target students. Apply early, get case competition wins on your resume, and leverage any McKinsey alumni at your school regardless of office location."
  },
  {
    name: "BCG",
    slug: "bcg",
    industry: "management-consulting",
    targetSchools: ["Harvard", "Stanford", "Wharton", "MIT", "Yale", "Columbia", "Duke", "Northwestern", "Chicago", "Dartmouth", "Berkeley", "Michigan"],
    gpaExpectation: "3.4+ GPA from targets, 3.6+ from non-targets",
    nonTargetAdvice: "BCG's Bridge to Consulting program is your best entry point. They also recruit from strong regional schools for local offices. Demonstrate structured thinking through case competitions and leadership roles."
  },
  {
    name: "JPMorgan",
    slug: "jpmorgan",
    industry: "investment-banking",
    targetSchools: ["Wharton", "Harvard", "Columbia", "NYU Stern", "Georgetown", "Michigan Ross", "Duke", "Cornell", "Stanford", "Chicago Booth", "Dartmouth", "UVA McIntire", "Northwestern"],
    gpaExpectation: "3.5+ GPA from targets, 3.7+ from semi-targets",
    nonTargetAdvice: "JPMorgan has the broadest recruiting of any bulge bracket bank. Apply to their Advancing Black Pathways, Launching Leaders, or freshman/sophomore programs. Their regional offices also recruit from strong state schools."
  },
  {
    name: "Morgan Stanley",
    slug: "morgan-stanley",
    industry: "investment-banking",
    targetSchools: ["Wharton", "Harvard", "Columbia", "NYU Stern", "Princeton", "Georgetown", "Duke", "Cornell", "Michigan Ross", "Dartmouth", "UVA McIntire", "Chicago Booth"],
    gpaExpectation: "3.5+ GPA from target schools, 3.7+ from semi-targets",
    nonTargetAdvice: "Morgan Stanley's Early Insights and Richard B. Fisher Scholarship programs are strong entry points. Network with campus ambassadors and apply to their sophomore programs for early conversion opportunities."
  },
  {
    name: "Blackstone",
    slug: "blackstone",
    industry: "private-equity",
    targetSchools: ["Wharton", "Harvard", "Stanford", "Princeton", "Yale", "Columbia", "MIT", "Dartmouth", "Duke", "Chicago Booth"],
    gpaExpectation: "3.7+ GPA from top targets, prior IB experience essentially required",
    nonTargetAdvice: "Blackstone hires almost exclusively from bulge bracket IB analyst classes. The path is: get into a top bank first, then lateral after 2 years. Their diversity programs (Future Women Leaders, Blackstone LaunchPad) offer earlier access."
  },
  {
    name: "Citadel",
    slug: "citadel",
    industry: "hedge-funds",
    targetSchools: ["MIT", "Stanford", "Harvard", "Princeton", "Caltech", "CMU", "Berkeley", "Chicago", "Columbia", "Wharton", "Georgia Tech", "Waterloo"],
    gpaExpectation: "3.7+ GPA in quantitative fields, strong math/CS competition background preferred",
    nonTargetAdvice: "Citadel cares more about raw quantitative ability than school name. Compete in math olympiads, build quantitative projects, or publish research. Their Datathon and trading competitions are open to all schools."
  },
  {
    name: "Google",
    slug: "google",
    industry: "big-tech",
    targetSchools: ["Stanford", "MIT", "CMU", "Berkeley", "Caltech", "Georgia Tech", "Illinois", "Michigan", "Waterloo", "Harvard", "Princeton", "Cornell", "UT Austin", "UCLA"],
    gpaExpectation: "3.0+ GPA minimum, no strict cutoff but 3.5+ preferred for competitive teams",
    nonTargetAdvice: "Google recruits broadly based on technical skill. Focus on LeetCode, open source contributions, and personal projects. Apply through their STEP program as a sophomore, or get referrals from any Google employee."
  },
  {
    name: "Meta",
    slug: "meta",
    industry: "big-tech",
    targetSchools: ["Stanford", "MIT", "CMU", "Berkeley", "Caltech", "Georgia Tech", "Illinois", "Michigan", "Waterloo", "Harvard", "Cornell", "UT Austin", "UCLA", "UW"],
    gpaExpectation: "No strict GPA cutoff, technical interviews are the primary filter",
    nonTargetAdvice: "Meta's hiring is almost entirely interview-performance based. Grind LeetCode, get referrals through LinkedIn connections, and apply to their University Grad and internship programs which are open to all accredited schools."
  },
  {
    name: "Bain",
    slug: "bain",
    industry: "management-consulting",
    targetSchools: ["Harvard", "Stanford", "Wharton", "Yale", "Princeton", "Duke", "Dartmouth", "Northwestern", "MIT", "Columbia", "Chicago", "Michigan", "UVA"],
    gpaExpectation: "3.4+ GPA from targets, top of class from non-targets",
    nonTargetAdvice: "Bain's Building Entrepreneurial Leaders program targets non-traditional candidates. They also recruit from strong liberal arts colleges. Focus on leadership experience and case prep rather than just GPA."
  },
  {
    name: "Evercore",
    slug: "evercore",
    industry: "investment-banking",
    targetSchools: ["Wharton", "Harvard", "Princeton", "Yale", "Columbia", "NYU Stern", "Georgetown", "Duke", "Dartmouth", "Stanford", "Michigan Ross"],
    gpaExpectation: "3.6+ GPA from targets, 3.8+ from semi-targets",
    nonTargetAdvice: "Evercore is extremely selective and recruits from a narrow set of schools. Your best path is networking directly with analysts and associates, getting a boutique IB internship first, then lateraling in as a full-time analyst."
  },
  {
    name: "KKR",
    slug: "kkr",
    industry: "private-equity",
    targetSchools: ["Wharton", "Harvard", "Stanford", "Princeton", "Yale", "Columbia", "MIT", "Dartmouth", "Duke", "Chicago Booth"],
    gpaExpectation: "3.7+ GPA, prior IB or consulting experience strongly preferred",
    nonTargetAdvice: "Like most mega-fund PE firms, KKR recruits almost entirely from top-performing IB analyst classes at Goldman, Morgan Stanley, and JPMorgan. Get into a top bank first, perform in the top quartile, and recruit during on-cycle."
  },
  {
    name: "Two Sigma",
    slug: "two-sigma",
    industry: "hedge-funds",
    targetSchools: ["MIT", "Stanford", "CMU", "Princeton", "Harvard", "Caltech", "Berkeley", "Columbia", "Cornell", "Chicago", "Georgia Tech", "Waterloo"],
    gpaExpectation: "3.5+ GPA in CS, Math, Physics, or Engineering; strong quantitative background required",
    nonTargetAdvice: "Two Sigma values intellectual curiosity and quantitative skills over school name. Compete in Kaggle competitions, publish research, contribute to open source, and apply through their fellowship programs which are school-agnostic."
  },
  {
    name: "Deloitte",
    slug: "deloitte",
    industry: "management-consulting",
    targetSchools: ["Michigan", "Illinois", "Indiana", "Notre Dame", "Georgetown", "NYU", "UVA", "Texas", "Ohio State", "Penn State", "USC", "Emory", "Wake Forest", "Vanderbilt", "BYU"],
    gpaExpectation: "3.2+ GPA from most schools, 3.5+ for strategy consulting roles",
    nonTargetAdvice: "Deloitte recruits from the widest range of schools among the Big 4. They have campus presence at 200+ universities. Attend their on-campus events, apply to their Discovery programs, and leverage Meet the Firms events."
  },
  {
    name: "Amazon",
    slug: "amazon",
    industry: "big-tech",
    targetSchools: ["Stanford", "MIT", "CMU", "Berkeley", "Georgia Tech", "Waterloo", "Illinois", "Michigan", "UT Austin", "Purdue", "UW", "UCLA", "Cornell", "Columbia"],
    gpaExpectation: "No strict GPA cutoff, behavioral (Leadership Principles) and technical interviews matter most",
    nonTargetAdvice: "Amazon hires from virtually every school. Master their 16 Leadership Principles, prepare STAR-format behavioral stories, and practice system design. Their Propel Program and internship pipeline are broadly accessible."
  },
  {
    name: "Microsoft",
    slug: "microsoft",
    industry: "big-tech",
    targetSchools: ["Stanford", "MIT", "CMU", "Berkeley", "Georgia Tech", "Waterloo", "Illinois", "Michigan", "UW", "Purdue", "Cornell", "UCLA", "UT Austin", "Harvey Mudd"],
    gpaExpectation: "3.0+ GPA minimum, no hard cutoff for strong candidates",
    nonTargetAdvice: "Microsoft recruits broadly and has one of the largest intern classes in tech. Apply through their Explore program (freshman/sophomore), attend Grace Hopper or NSBE for recruiting events, and get referrals through LinkedIn alumni."
  },
  {
    name: "Apple",
    slug: "apple",
    industry: "big-tech",
    targetSchools: ["Stanford", "MIT", "CMU", "Berkeley", "Caltech", "Georgia Tech", "Michigan", "Illinois", "UCLA", "UCSB", "Harvey Mudd", "Waterloo"],
    gpaExpectation: "3.0+ GPA, emphasis on projects and relevant experience over grades",
    nonTargetAdvice: "Apple values domain expertise and passion for their products. Build impressive personal projects, contribute to relevant open source, and apply through their university internship portal. Referrals from current employees significantly boost your chances."
  },
  {
    name: "Stripe",
    slug: "stripe",
    industry: "big-tech",
    targetSchools: ["Stanford", "MIT", "CMU", "Harvard", "Berkeley", "Caltech", "Waterloo", "Princeton", "Columbia", "Georgia Tech"],
    gpaExpectation: "No formal GPA requirement, extremely high technical bar in interviews",
    nonTargetAdvice: "Stripe is one of the most technically selective companies. They care deeply about code quality and systems thinking. Build production-grade side projects, contribute to open source payments/fintech projects, and apply directly with a strong portfolio."
  },
  {
    name: "Jane Street",
    slug: "jane-street",
    industry: "hedge-funds",
    targetSchools: ["MIT", "Harvard", "Princeton", "Stanford", "Caltech", "CMU", "Chicago", "Waterloo", "Cambridge", "Oxford", "Columbia", "Cornell"],
    gpaExpectation: "3.7+ GPA in Math, CS, or Physics; olympiad/competition background highly valued",
    nonTargetAdvice: "Jane Street runs open puzzle competitions and trading games that anyone can enter. Strong performance there matters more than school name. Focus on probability theory, functional programming (OCaml), and market-making concepts."
  },
  {
    name: "Apollo",
    slug: "apollo",
    industry: "private-equity",
    targetSchools: ["Wharton", "Harvard", "Princeton", "Columbia", "Stanford", "Yale", "NYU Stern", "Dartmouth", "Duke", "Chicago Booth", "MIT"],
    gpaExpectation: "3.6+ GPA, prior IB experience at a top bank essentially required",
    nonTargetAdvice: "Apollo recruits primarily from elite IB analyst programs. The standard path is 2 years at a bulge bracket or elite boutique, then recruit during on-cycle PE recruiting. Build strong LBO modeling skills and network with Apollo associates early in your banking stint."
  }
];
