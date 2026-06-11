export interface AgentData {
  outreachType: string;
  slug: string;
  steps: string[];
  timeSaved: string;
  exampleGoal: string;
  exampleResult: string;
}

export const automateData: AgentData[] = [
  {
    outreachType: "Cold Email Outreach",
    slug: "cold-email-outreach",
    steps: [
      "Identify target professionals by company, role, and seniority level",
      "Find verified email addresses using multi-source validation",
      "Research each person's background, recent activity, and shared connections",
      "Generate personalized email drafts with relevant hooks and clear asks",
      "Schedule sends at optimal times based on industry response patterns",
      "Track opens, replies, and follow-up automatically if no response in 5 days"
    ],
    timeSaved: "4 hours of research and writing per 10 emails reduced to 5 minutes of review",
    exampleGoal: "Reach out to 15 Goldman Sachs analysts who graduated from USC in the last 3 years",
    exampleResult: "15 personalized emails sent with school-specific hooks, 7 opened within 24 hours, 4 replies offering 15-minute calls"
  },
  {
    outreachType: "Coffee Chat Requests",
    slug: "coffee-chat-requests",
    steps: [
      "Search alumni networks and LinkedIn for professionals in your target industry",
      "Filter by graduation year, current role, and geographic proximity",
      "Craft warm outreach emails referencing shared school, clubs, or interests",
      "Propose specific times and keep the ask lightweight (15-20 minute virtual chat)",
      "Send calendar invite upon acceptance with prepared talking points"
    ],
    timeSaved: "3 hours of alumni research and email drafting per 5 requests reduced to 3 minutes",
    exampleGoal: "Set up coffee chats with 5 McKinsey consultants who are USC Marshall alumni",
    exampleResult: "5 personalized requests sent referencing Marshall and consulting club, 3 accepted within a week, calendar invites sent automatically"
  },
  {
    outreachType: "Alumni Networking",
    slug: "alumni-networking",
    steps: [
      "Scan school alumni directory and LinkedIn for relevant professionals",
      "Identify warm connection paths (shared clubs, professors, classes, dorms)",
      "Generate outreach that leads with shared experience, not an ask",
      "Personalize based on their career trajectory and your specific interests",
      "Suggest low-friction next steps (quick call, campus visit, event attendance)"
    ],
    timeSaved: "6 hours of manual alumni directory searching and message writing reduced to 10 minutes",
    exampleGoal: "Connect with Wharton alumni working in private equity across 5 different firms",
    exampleResult: "20 alumni identified across Blackstone, KKR, Apollo, Carlyle, and Warburg Pincus. Personalized messages sent referencing specific Wharton experiences, 8 responses received"
  },
  {
    outreachType: "Interview Follow-ups",
    slug: "interview-follow-ups",
    steps: [
      "Capture key discussion points and interviewer details immediately post-interview",
      "Generate personalized thank-you emails referencing specific conversation topics",
      "Add unique value (relevant article, follow-up on a question they asked, additional example)",
      "Send within 2 hours of interview completion for maximum impact"
    ],
    timeSaved: "45 minutes of careful thank-you email writing reduced to 2 minutes of review",
    exampleGoal: "Send follow-up thank-you notes to 4 interviewers after a BCG Superday",
    exampleResult: "4 unique thank-you emails sent within 90 minutes, each referencing a specific case discussion point and adding a relevant insight the interviewer mentioned wanting to explore"
  },
  {
    outreachType: "Recruiter Outreach",
    slug: "recruiter-outreach",
    steps: [
      "Identify internal recruiters and campus recruiting leads at target companies",
      "Find their direct email addresses (bypass generic careers@ inboxes)",
      "Craft messages that demonstrate specific interest in their firm and role",
      "Reference relevant qualifications and attach a tailored resume",
      "Follow up strategically if no response within 1 week",
      "Track recruiter relationships across your entire target list"
    ],
    timeSaved: "5 hours of recruiter research and personalized outreach per 10 companies reduced to 15 minutes",
    exampleGoal: "Reach recruiters at all 9 bulge bracket banks for summer analyst positions",
    exampleResult: "9 recruiter emails identified and verified, personalized messages sent highlighting relevant banking experience, 5 recruiters confirmed receipt and added to interview pipeline"
  },
  {
    outreachType: "LinkedIn Connection Requests",
    slug: "linkedin-connection-requests",
    steps: [
      "Search for professionals matching your target criteria on LinkedIn",
      "Identify mutual connections, shared groups, or common background",
      "Generate concise connection notes (300 char limit) with a clear reason to connect",
      "Prioritize targets by likelihood of acceptance and relevance to your goals",
      "Queue follow-up messages for after connection is accepted"
    ],
    timeSaved: "2 hours of LinkedIn browsing and note-writing per 20 requests reduced to 5 minutes",
    exampleGoal: "Connect with 25 product managers at Stripe who were previously in consulting",
    exampleResult: "25 targeted connection requests sent with notes referencing their consulting-to-PM transition, 15 accepted, follow-up messages queued asking about their career switch experience"
  },
  {
    outreachType: "Thank You Notes",
    slug: "thank-you-notes",
    steps: [
      "Log details from networking conversations (topics discussed, advice given, referrals made)",
      "Generate thoughtful thank-you messages that reference specific points from the conversation",
      "Include a concrete next step or commitment you're making based on their advice",
      "Send within 24 hours while the conversation is still fresh"
    ],
    timeSaved: "30 minutes per thank-you note reduced to 1 minute of review and send",
    exampleGoal: "Thank 6 professionals met at a JPMorgan networking event for their time and advice",
    exampleResult: "6 personalized thank-you emails sent same evening, each referencing unique advice given and committing to a specific follow-up action they suggested"
  },
  {
    outreachType: "Job Application Follow-ups",
    slug: "job-application-follow-ups",
    steps: [
      "Track application status across all target companies and roles",
      "Identify the hiring manager or recruiter for each application",
      "Generate polite follow-up emails that restate interest and add new value",
      "Time follow-ups appropriately (1 week after application, 1 week after interview)",
      "Escalate to alternate contacts if primary contact is unresponsive"
    ],
    timeSaved: "3 hours of tracking and follow-up writing per 10 applications reduced to 5 minutes",
    exampleGoal: "Follow up on 8 consulting applications submitted 10 days ago with no response",
    exampleResult: "8 follow-up emails sent to identified recruiters, referencing application dates and adding a recent relevant accomplishment. 3 recruiters confirmed applications are in review, 1 scheduled a first-round interview"
  },
  {
    outreachType: "Referral Requests",
    slug: "referral-requests",
    steps: [
      "Identify contacts at target companies who can provide employee referrals",
      "Research the specific role and team to demonstrate genuine interest",
      "Craft a referral request that makes it easy for your contact to say yes",
      "Provide a pre-written blurb they can forward to the hiring manager",
      "Attach your tailored resume and relevant context about your fit",
      "Follow up with gratitude and status updates regardless of outcome"
    ],
    timeSaved: "2 hours of relationship-building and request-crafting per referral reduced to 5 minutes",
    exampleGoal: "Request referrals from 4 contacts at Google for a specific PM role on the Ads team",
    exampleResult: "4 referral requests sent with role-specific context and pre-written forwarding blurbs. 2 contacts submitted referrals within 48 hours, application moved to recruiter review within 3 days"
  },
  {
    outreachType: "Conference Networking",
    slug: "conference-networking",
    steps: [
      "Research attendee and speaker lists before the event",
      "Identify high-priority contacts and prepare personalized conversation starters",
      "Generate pre-event outreach to schedule meetings during the conference",
      "Create post-event follow-up emails referencing specific conversations",
      "Connect on LinkedIn with personalized notes within 24 hours of meeting"
    ],
    timeSaved: "8 hours of pre/post conference networking prep reduced to 20 minutes",
    exampleGoal: "Network with 10 VCs attending a fintech conference and follow up within 24 hours",
    exampleResult: "Pre-event emails sent to 10 VCs, 4 agreed to scheduled 1:1s during the event. Post-conference follow-ups sent to all 10 within 12 hours, referencing specific panel discussions and shared interests"
  }
];
