/**
 * Video tutorial data for the Documentation page.
 * Each entry gets videoId and thumbnailUrl derived from youtubeUrl.
 */

function extractVideoId(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^?&/]+)/);
  return match?.[1] ?? "";
}

export interface VideoTutorial {
  title: string;
  description: string;
  youtubeUrl: string;
  videoId: string;
  thumbnailUrl: string;
}

function toVideoTutorial(raw: { title: string; description: string; youtubeUrl: string }): VideoTutorial {
  const videoId = extractVideoId(raw.youtubeUrl);
  return {
    ...raw,
    videoId,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}

const featuresRaw = [
  {
    title: "Contact Search — Find people and emails",
    description: "Search by company, role, or school. Get verified contact info and draft personalized outreach in one place.",
    youtubeUrl: "https://youtu.be/OTd5LOOpgvQ",
  },
  {
    title: "Outbox — Track your outreach",
    description: "See who you've emailed, who replied, and who needs a follow-up. Keep your pipeline organized without spreadsheets.",
    youtubeUrl: "https://youtu.be/n_AYHEJSXrE",
  },
  {
    title: "Coffee Chat Prep — Walk in prepared",
    description: "Paste a LinkedIn URL and get AI-generated talking points, background research, and conversation starters for every call.",
    youtubeUrl: "https://youtu.be/TIERqtjc1tk",
  },
  {
    title: "Interview Prep — Company-specific guides",
    description: "Get behavioral questions, company research, and role-specific prep so you show up ready for every interview.",
    youtubeUrl: "https://youtu.be/D1--4aVisho",
  },
  {
    title: "Feature overview",
    description: "Learn how Offerloop helps you find contacts, send outreach, and prepare for conversations.",
    youtubeUrl: "https://youtu.be/q5ZPtmnZciE",
  },
  {
    title: "Getting started",
    description: "Set up your account and get the most out of Offerloop's workflows.",
    youtubeUrl: "https://youtu.be/UJSlHiBRSyY",
  },
  {
    title: "Tips and workflows",
    description: "Best practices for recruiting with Offerloop.",
    youtubeUrl: "https://youtu.be/VlHvxH44HCU",
  },
];

const chromeExtensionRaw = [
  {
    title: "Install the Chrome extension",
    description: "Add the Offerloop extension to Chrome and connect your account. You'll see an Offerloop button on LinkedIn profiles and job postings.",
    youtubeUrl: "https://youtu.be/3gZFhA8reRs",
  },
  {
    title: "Find email from a LinkedIn profile",
    description: "Open any LinkedIn profile, click the Offerloop button, and get the contact's verified email without leaving the page.",
    youtubeUrl: "https://youtu.be/cZ_bR-nCd6w",
  },
  {
    title: "Draft outreach from LinkedIn",
    description: "Generate a personalized cold email or follow-up based on the profile and send it from your connected Gmail.",
    youtubeUrl: "https://youtu.be/FY6YDWdxIAI",
  },
  {
    title: "Chrome extension overview",
    description: "See how the extension works on LinkedIn and Gmail.",
    youtubeUrl: "https://youtu.be/TpXA4x8Cq0I",
  },
  {
    title: "Extension tips",
    description: "Get the most out of the Offerloop Chrome extension.",
    youtubeUrl: "https://youtu.be/cZ1IQnqfvNQ",
  },
];

export const videoTutorials: VideoTutorial[] = featuresRaw.map(toVideoTutorial);
export const chromeExtensionVideos: VideoTutorial[] = chromeExtensionRaw.map(toVideoTutorial);
