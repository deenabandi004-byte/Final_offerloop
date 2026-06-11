export interface TimelineMilestone {
  month: string;
  event: string;
  details: string;
}

export interface TimelineData {
  industry: string;
  slug: string;
  milestones: TimelineMilestone[];
}

export const recruitingTimelineData: TimelineData[] = [
  {
    industry: "Investment Banking",
    slug: "investment-banking",
    milestones: [
      { month: "January-February", event: "Sophomore Networking Begins", details: "Start reaching out to analysts and associates at target banks. Attend bank-sponsored diversity programs and info sessions. Build your target list of 30-50 contacts." },
      { month: "March-April", event: "Sophomore Programs & Spring Weeks", details: "Apply to freshman/sophomore insight programs (Goldman Sachs Possibilities Summit, JPMorgan Launching Leaders, Morgan Stanley Early Insights). These are the highest-converting pipelines to summer analyst offers." },
      { month: "May-June", event: "Resume & Technical Prep", details: "Perfect your resume with deal experience or relevant internships. Begin technical prep: accounting, valuation (DCF, comps, precedent transactions), and LBO modeling. Join Wall Street Prep or Breaking Into Wall Street." },
      { month: "July", event: "Applications Open", details: "Most bulge bracket and elite boutique applications open in early-to-mid July. Apply within the first 48 hours — many banks review on a rolling basis. Have your cover letters pre-written for each bank." },
      { month: "August-September", event: "First Round Interviews", details: "HireVue video interviews and first-round phone screens begin. Expect technical questions (walk me through a DCF, tell me about a recent deal) and behavioral questions. Some banks do Superdays as early as late August." },
      { month: "September-October", event: "Superdays & Offers", details: "Final round interviews (Superdays) are typically 4-5 back-to-back interviews at the bank's office. Offers come within 24-48 hours. Decision deadlines are usually 2-3 weeks. Exploding offers are common." },
      { month: "October-December", event: "Off-Cycle & Boutique Recruiting", details: "Middle market and boutique banks recruit later. Off-cycle internship applications open for January/February starts. This is also when rejected candidates can network into smaller firms." },
      { month: "Following Summer", event: "Internship (10 weeks)", details: "Summer analyst internships run 10 weeks (June-August). Convert rate is 80-90% at bulge brackets. Performance reviews happen at weeks 5 and 8. Return offers typically come on the last day." }
    ]
  },
  {
    industry: "Management Consulting",
    slug: "management-consulting",
    milestones: [
      { month: "January-March", event: "Case Prep & Networking Begins", details: "Start practicing cases with partners. Attend consulting club meetings. Begin informational interviews with consultants at target firms. Most students need 50-80 practice cases before interviews." },
      { month: "April-June", event: "Consulting Workshops & Conferences", details: "Attend firm-sponsored events (McKinsey Insight, BCG Bridge, Bain Building Entrepreneurial Leaders). These are key for non-target students. Begin written applications prep." },
      { month: "July-August", event: "Resume Prep & Leadership Stories", details: "Polish resume with quantified impact stories. Prepare 15-20 behavioral stories using the STAR format. Focus on leadership, teamwork, and analytical thinking examples." },
      { month: "September", event: "Applications Open", details: "MBB and Big 4 consulting applications open in September. Apply to all firms simultaneously. Online assessments (McKinsey Solve, BCG Casey, Bain SOVA) are sent within 1-2 weeks of application." },
      { month: "October", event: "Online Assessments & First Rounds", details: "Complete digital assessments. First-round interviews begin (typically 1 behavioral + 1 case). McKinsey does interviewer-led cases; BCG and Bain do interviewee-led cases." },
      { month: "November", event: "Final Round Interviews", details: "Second-round interviews are 2-3 cases plus behavioral. These are harder and more ambiguous than first rounds. Partners or principals conduct final rounds." },
      { month: "December-January", event: "Offers & Decisions", details: "Offers extended in November-December. Decision deadlines typically 2-4 weeks. Some firms allow extensions. Deloitte and Accenture Strategy may recruit into January." },
      { month: "Following Summer", event: "Internship (8-10 weeks)", details: "Summer internships are 8-10 weeks. You'll work on 1-2 client projects. Mid-point and final reviews determine return offers. Conversion rate is 85-95% at MBB." }
    ]
  },
  {
    industry: "Private Equity",
    slug: "private-equity",
    milestones: [
      { month: "Year 1 in Banking", event: "Build PE-Relevant Skills", details: "During your first year as an IB analyst, focus on LBO modeling, industry expertise, and deal execution. Top PE funds care most about your deal experience and modeling ability." },
      { month: "March-May (Year 1)", event: "Begin Networking with PE Firms", details: "Start having coffee chats with PE associates and VPs. Focus on mega-funds (Blackstone, KKR, Apollo, Carlyle) and upper-middle-market firms. Attend industry conferences." },
      { month: "June-August (Year 1)", event: "On-Cycle Recruiting Begins", details: "On-cycle PE recruiting has accelerated dramatically. Some mega-funds now recruit analysts just 6-8 months into their banking programs. Headhunters (HSP, CPI, Ratio) will reach out if you're at a top bank." },
      { month: "Headhunter Outreach", event: "Process Kickoff (72 hours)", details: "When headhunters call, the process moves in 72 hours. You'll have a first-round within 24 hours, a case study within 48 hours, and a final round within 72 hours. Prepare LBO models and industry deep-dives in advance." },
      { month: "September-October", event: "Off-Cycle Supplement", details: "If you miss on-cycle, many upper-middle-market and growth equity firms recruit off-cycle. These processes are less compressed and allow more time for interviews and case studies." },
      { month: "Year 2 in Banking", event: "Start Date Planning", details: "Most PE associate positions start after completing 2 full years in banking (sometimes 2.5). Negotiate your start date, complete your banking analyst program, and begin transitioning." }
    ]
  },
  {
    industry: "Hedge Funds",
    slug: "hedge-funds",
    milestones: [
      { month: "Sophomore Year", event: "Build Quantitative Foundation", details: "Take advanced math, statistics, and CS courses. Start building a track record through paper trading or personal portfolio. Participate in math competitions and quant challenges." },
      { month: "January-March", event: "Quant Competitions & Challenges", details: "Participate in trading competitions (Jane Street BAMO, Citadel Datathon, SIG trading game). These serve as direct recruiting pipelines. Strong performance gets you fast-tracked." },
      { month: "April-June", event: "Apply to Summer Programs", details: "Apply to quant firm internships (Jane Street, Two Sigma, Citadel, DE Shaw, HRT). Also apply to fundamental fund internships (Point72 Academy, Bridgewater). Applications close earlier than other industries." },
      { month: "July-September", event: "Interview Process", details: "Quant interviews involve probability puzzles, brain teasers, mental math, and coding challenges. Fundamental fund interviews focus on stock pitches and investment frameworks. Expect 3-5 round processes." },
      { month: "September-November", event: "Offers for Summer", details: "Summer internship offers for quant firms come in fall. Offers are competitive with IB and consulting. Programs are typically 10-12 weeks with real P&L responsibility." },
      { month: "Post-Graduation", event: "Full-Time Paths", details: "Direct-from-undergrad hiring is common at quant firms (unlike traditional hedge funds that recruit from IB). Fundamental funds like Point72 have analyst academies for fresh graduates." },
      { month: "Year 1-2 Post-Grad", event: "Performance-Based Advancement", details: "Advancement is purely performance-based. Strong performers can manage capital within 2-3 years. Unlike banking, there's no standard promotion timeline — it's based on P&L." }
    ]
  },
  {
    industry: "Venture Capital",
    slug: "venture-capital",
    milestones: [
      { month: "Freshman-Sophomore", event: "Build Startup Ecosystem Knowledge", details: "Join startup clubs, attend demo days, read VC blogs (a16z, First Round Review, Lenny's Newsletter). Build a portfolio of startup investments through AngelList or scout programs." },
      { month: "January-March", event: "Apply to VC Fellowship Programs", details: "Apply to Dorm Room Fund, Contrary Capital, Rough Draft Ventures, and other student VC programs. These are the primary entry point into VC for undergrads and provide real deal experience." },
      { month: "April-June", event: "Network with VCs & Founders", details: "Cold email partners and associates at target firms. Attend startup conferences. Write investment memos on companies you find interesting and share them as conversation starters." },
      { month: "July-August", event: "Summer Internship Applications", details: "VC internship recruiting is highly informal. Most positions aren't posted publicly. They come through referrals, Twitter DMs, and direct outreach. Some larger firms (a16z, Sequoia) have formal programs." },
      { month: "September-December", event: "Build Your Brand", details: "Start a blog or newsletter analyzing startups. Build a Twitter/X following in tech. Source deals for your student fund. All of this creates a track record that VCs value." },
      { month: "Post-Graduation", event: "Entry Paths", details: "VC hiring is non-standard. Common paths: 2 years at a startup or consulting firm, then join a fund; direct from student VC programs; or operator-to-investor transition after 3-5 years." }
    ]
  },
  {
    industry: "Big Tech",
    slug: "big-tech",
    milestones: [
      { month: "Freshman Year", event: "Build Technical Skills", details: "Take CS fundamentals (data structures, algorithms). Start LeetCode practice early. Build personal projects and contribute to open source. Apply to freshman programs (Google STEP, Microsoft Explore)." },
      { month: "January-March", event: "Sophomore Internship Prep", details: "Apply to sophomore-specific programs. Continue building portfolio projects. Attend hackathons for resume material and networking. Start mock interviews with peers." },
      { month: "June-August", event: "Summer Internship (Soph)", details: "Complete your sophomore internship. Focus on impact and learning. Get a strong review to convert to a return offer for the following summer." },
      { month: "August-October", event: "Junior Year Applications Open", details: "Major tech companies open summer internship applications for juniors in August-September. Apply broadly (15-25 companies). Applications reviewed on a rolling basis at most companies." },
      { month: "October-December", event: "Interview Season", details: "Phone screens and on-site interviews. Expect 2-3 coding rounds (LeetCode medium-hard), 1 system design (for senior roles), and 1-2 behavioral rounds. Some companies do virtual on-sites." },
      { month: "December-February", event: "Offers & Decisions", details: "Offers come in waves through winter. Use competing offers for negotiation. Most companies give 2-4 week decision windows. Team matching happens after accepting at some companies." },
      { month: "March-May", event: "Late-Cycle Recruiting", details: "Startups and mid-size companies recruit later. This is also when companies with unfilled slots do second-round recruiting. Don't give up if you don't have an offer by December." },
      { month: "Following Summer", event: "Internship & Conversion", details: "Summer internships are 12-16 weeks. Focus on delivering a complete project and getting positive peer reviews. Return offer rates are 70-85% at FAANG companies." }
    ]
  },
  {
    industry: "Startups",
    slug: "startups",
    milestones: [
      { month: "Anytime", event: "Build & Ship", details: "Startups hire year-round and value builders. Ship side projects, contribute to open source, build in public on Twitter/X. Your portfolio matters more than your resume." },
      { month: "January-March", event: "YC & Accelerator Hiring Wave", details: "Y Combinator winter batch companies begin hiring as they scale. Check Work at a Startup, AngelList, and Wellfound for new postings. These companies move fast — expect to interview within days." },
      { month: "April-June", event: "Series A/B Hiring Push", details: "Companies that raised in Q1 begin spending on headcount. This is peak hiring season for Series A-C startups. Roles are often unstructured and require generalists." },
      { month: "June-August", event: "YC Summer Batch + Intern Season", details: "YC summer batch companies start hiring. Many startups offer informal internships. Reach out directly to founders on Twitter or at demo days." },
      { month: "September-October", event: "Fall Recruiting Wave", details: "Another hiring wave as companies plan for next year's growth. Series B+ companies begin building more structured recruiting processes. This is when startup career fairs happen." },
      { month: "November-December", event: "Planning & Off-Season", details: "Hiring slows during holidays but doesn't stop. This is a good time to network with founders planning their next year. January offers often come from November conversations." }
    ]
  },
  {
    industry: "Corporate Finance",
    slug: "corporate-finance",
    milestones: [
      { month: "August-September", event: "Fall Recruiting Opens", details: "F500 companies open their summer internship applications for corporate finance (FP&A, treasury, corporate development). These are posted on company career pages and Handshake." },
      { month: "September-October", event: "Career Fairs & Info Sessions", details: "Attend on-campus career fairs where corporate recruiters are present. F500 companies like P&G, J&J, GE, and Disney recruit heavily at career fairs. Submit applications same week." },
      { month: "October-November", event: "First Round Interviews", details: "Phone screens with HR followed by technical interviews. Expect questions about financial statements, budgeting, variance analysis, and FP&A concepts. Behavioral questions focus on teamwork." },
      { month: "November-January", event: "Final Rounds & Offers", details: "On-site or virtual final rounds with hiring managers. Case studies may involve building a simple financial model or analyzing a business unit's performance. Offers typically come 1-2 weeks after." },
      { month: "February-March", event: "Second Wave Recruiting", details: "Companies with unfilled positions recruit in spring. This is also when corporate development and strategy rotational programs open. Less competition than fall cycle." },
      { month: "April-May", event: "Summer Leadership Programs", details: "Programs like GE's Financial Management Program, Microsoft Finance rotation, and similar structured programs have April deadlines. These are highly competitive 2-3 year rotational tracks." },
      { month: "Summer", event: "Internship (10-12 weeks)", details: "Corporate finance internships are structured with project work and exposure to leadership. Conversion rates are high (70-85%) for strong performers." }
    ]
  },
  {
    industry: "Real Estate",
    slug: "real-estate",
    milestones: [
      { month: "August-September", event: "REIT & Fund Applications Open", details: "Large REITs (Blackstone Real Estate, Brookfield, Starwood) and real estate PE funds open applications. Smaller shops recruit through networking and referrals year-round." },
      { month: "September-October", event: "Networking Events & Conferences", details: "Attend ULI (Urban Land Institute) events, school real estate club treks to NYC, and firm info sessions. Real estate is highly relationship-driven — personal connections matter enormously." },
      { month: "October-November", event: "Interview Process", details: "Interviews focus on real estate financial modeling (proformas, cap rates, IRR), market knowledge, and deal analysis. Expect to walk through a real estate case study or model test." },
      { month: "November-January", event: "Offers & Decisions", details: "Offers from larger institutions come in this window. Boutique developers and smaller funds may recruit later. Real estate brokerage (CBRE, JLL, Cushman) has slightly different timelines." },
      { month: "January-March", event: "Development & Brokerage Recruiting", details: "Development companies and brokerage firms recruit in spring for summer positions. These roles emphasize market research, financial modeling, and client-facing skills." },
      { month: "Year-Round", event: "Boutique & Off-Cycle", details: "Smaller real estate firms, family offices, and developers hire on an as-needed basis. Network consistently through real estate clubs, alumni, and LinkedIn." }
    ]
  },
  {
    industry: "Data Science",
    slug: "data-science",
    milestones: [
      { month: "August-September", event: "Applications Open at Major Companies", details: "FAANG and large tech companies open data science internship and new grad applications. These require strong stats, ML, and coding skills. Apply within the first 2 weeks for best chances." },
      { month: "September-October", event: "Online Assessments", details: "Expect coding challenges (Python/R), statistics questions, and SQL assessments. Some companies use take-home projects. HackerRank and Coderpad are common platforms." },
      { month: "October-November", event: "Phone Screens & Technical Rounds", details: "First rounds test probability, statistics, SQL, and basic ML concepts. Be prepared to explain A/B testing, bias-variance tradeoff, and common algorithms. Expect to code in real-time." },
      { month: "November-January", event: "On-Site/Virtual Final Rounds", details: "Final rounds include a presentation (explain a past project to a non-technical audience), technical deep-dives, and behavioral interviews. Some companies include a case study component." },
      { month: "January-March", event: "Offers & Negotiation", details: "Offers come in waves. Data science roles at FAANG pay $130k-$170k base for new grads plus equity. Use competing offers to negotiate. Team matching may happen post-offer." },
      { month: "March-May", event: "Late Cycle & Startup DS Roles", details: "Startups and mid-size companies recruit data scientists later. These roles often have more ownership and breadth. Applied ML roles at smaller companies may value projects over pedigree." },
      { month: "Year-Round", event: "Portfolio Building", details: "Kaggle competitions, personal projects, published notebooks, and open source contributions matter year-round. Build a GitHub portfolio that demonstrates end-to-end data science skills." }
    ]
  }
];
