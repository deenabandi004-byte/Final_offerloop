export const COFFEE_CHAT_CREDITS = 15;
export const INTERVIEW_PREP_CREDITS = 25;

export const TIER_CONFIGS = {
  free: {
    maxContacts: 3,
    minContacts: 1,
    name: "Search Free Plan Tier",
    credits: 150,
    description: "Try out platform risk free - up to 3 contacts + Email drafts",
    coffeeChat: true,
    interviewPrep: false,
    timeSavedMinutes: 200,
    usesResume: false,
  },
  pro: {
    maxContacts: 8,
    minContacts: 1,
    name: "Search Pro Plan Tier",
    credits: 1800,
    description: "Everything in free plus advanced features - up to 8 contacts + Resume matching",
    coffeeChat: true,
    interviewPrep: true,
    timeSavedMinutes: 1200,
    usesResume: true,
  },
  elite: {
    maxContacts: 15,
    minContacts: 1,
    name: "Search Elite Plan Tier",
    credits: 3000,
    description: "Full access - up to 15 contacts + All premium features",
    coffeeChat: true,
    interviewPrep: true,
    timeSavedMinutes: 5000,
    usesResume: true,
  },
} as const;

export type CoffeeChatHistoryItem = {
  id: string;
  contactName: string;
  company: string;
  jobTitle: string;
  status: string;
  createdAt: string;
  pdfUrl?: string;
  error?: string;
};

