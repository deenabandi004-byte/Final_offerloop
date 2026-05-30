// loopCopy.ts — every string the Loop UI shows the user lives here.
//
// Rule: no jargon. Words like "agent", "cycle", "deploy", "approval mode",
// "OTP", "credits", "configure" do NOT appear in this file. If you find
// yourself reaching for one, rewrite the sentence to talk about the user's
// outcome instead.

export const LOOP_COPY = {
  // ── Page chrome ────────────────────────────────────────────────────────
  pageTitle: "Loops",
  fleetHeader: "Your Loops",
  fleetSubtitle: "Walk away. We'll text you when there's something to look at.",

  // ── Empty state hero (zero Loops yet) ─────────────────────────────────
  hero: {
    title: "Start a Loop.",
    titleAccent: "Loop.",
    subtitle: "Tell it what you want. Walk away. Get a text when the work's done.",
    placeholder:
      'Say it like you\'d tell a friend. Try: "10 AI analysts at Goldman, JPMorgan, and Morgan Stanley. Reach out about summer internships."',
    primaryCta: "Start the Loop",
    primaryCtaHint: "We'll text you when it's done. Nothing sends without you tapping yes.",
  },

  // ── The four marketing cards (verbatim from the design) ───────────────
  cards: [
    {
      n: "01",
      title: "Tell it what you're after",
      body:
        "Say it in plain words. \"10 AI analysts at Goldman, JPM, and Morgan Stanley.\" Or \"5 specific companies, this kind of person.\" Plain English.",
    },
    {
      n: "02",
      title: "Hit Run",
      body:
        "Your Loop runs in the background. Walk away. Close the tab. Go to class.",
    },
    {
      n: "03",
      title: "It finds everything",
      body:
        "Companies, hiring managers, the right people, perfect emails — anything that matters.",
    },
    {
      n: "04",
      title: "You get a text",
      body:
        "You wake up to your phone pinging. One tap to send the emails to the Loop.",
    },
  ],

  // ── Loop cards (the fleet grid) ────────────────────────────────────────
  card: {
    statusRunning: "Running",
    statusDone: "Done",
    statusPaused: "Paused",
    statusIdle: "Not started",
    openCta: "Open",
    readEmailsCta: "Read the emails",
    wakeCta: "Wake it up",
    startCta: "Start it",
    foundLabel: (found: number, target: number) =>
      `${found} of ${target} found this week`,
    nextRunIn: (when: string) => `Looking again ${when}`,
    smsSentAt: (when: string) => `You got the text ${when}`,
    pausedHint: "Tap to wake it up",
    idleHint: "Hit start when you're ready.",
  },

  // ── "+ New Loop" tile ─────────────────────────────────────────────────
  newTile: {
    titleAvailable: "Start another Loop",
    bodyAvailable: "Different brief, same magic.",
    titleAtCap: "You're at your limit",
    bodyAtCap: (cap: number) =>
      `Your plan allows ${cap} Loop${cap === 1 ? "" : "s"}. Upgrade to add more.`,
    upgradeCta: "See plans",
  },

  // ── Confirmations & errors ────────────────────────────────────────────
  toasts: {
    loopStarted: "Loop started. We'll text you when there's news.",
    loopPaused: "Paused.",
    loopResumed: "Back at it.",
    loopDeleted: "Loop removed.",
    briefRequired: "Tell it what you're after first.",
    somethingBroke: "Something went sideways. Try again in a sec.",
  },

  // ── Phase 8 — automation cadence picker ──────────────────────────────
  cadence: {
    label: "How often?",
    options: {
      daily: { title: "Daily", body: "A run every day. Best for recruiting season." },
      every_other_day: { title: "Every other day", body: "Steady drip. Good default." },
      weekly: { title: "Weekly", body: "Easy on credits. One run per week." },
      manual: { title: "Just when I ask", body: "No schedule. You hit Run." },
    },
    recommendedTag: "recommended",
  },

  // ── Phase 8 — cost estimate strip under the textarea ────────────────
  estimate: {
    loading: "Working out the cost…",
    perCycle: (n: number) => `About ${n} credits per cycle`,
    monthlyFit: (cycles: number) =>
      `~${cycles} cycle${cycles === 1 ? "" : "s"} fit in your monthly budget`,
  },

  // ── Phase 8 — budget bar on the Loop card ───────────────────────────
  budget: {
    label: (spent: number, cap: number) => `${spent} / ${cap} credits this week`,
    tooltip:
      "9 credits per contact, 13 per hiring manager, 1 per job, 1 per company.",
  },

  // ── Phase 8 — pause reasons (chip on the card, banner on detail) ────
  pauseReason: {
    budget_capped: "Paused — used this week's credits. Resumes Monday.",
    credits_capped: "Paused — out of credits this month.",
    inactivity: "Paused — drafts waiting. Open them so it can keep going.",
    quiet_hours: "Quiet hours — picking back up in the morning.",
    paused: "Paused.",
  },

  // ── Phase 8 — Account Settings usage breakdown ──────────────────────
  usageBreakdown: {
    title: "Where my credits went",
    subtitle: "This month, broken down by what you used them on.",
    labels: {
      contacts: "Contacts found",
      hiring_managers: "Hiring managers",
      jobs: "Jobs matched",
      companies: "Companies discovered",
      manual: "Manual searches",
      coffee_chat_preps: "Coffee chat preps",
      interview_preps: "Interview preps",
      scout: "Scout chats",
      other: "Other",
    },
  },
} as const;

// ── Mode-aware copy helper ────────────────────────────────────────────
//
// Loops have three modes:
//   "people" — autonomous networking (find professionals, draft cold outreach)
//   "roles"  — autonomous job-search (find postings, optionally draft outreach
//              about specific roles)
//   "both"   — pursue BOTH pipelines in one Loop, balanced against one credit
//              budget. The wizard surfaces "both" as a parser outcome (when
//              the student's prompt explicitly asks for both networking and
//              job-search) rather than as a third mode card.
//
// Most strings are the same across modes. The helper layers mode-specific
// overrides on top of LOOP_COPY so existing call sites that don't care about
// mode keep working unchanged. Only the wizard and other mode-aware screens
// need to import this helper.
//
// School-name substitution: pass the user's school in opts.school. When known,
// the alumni-preference label reads "Push USC alumni to the top" instead of
// the generic "Push people from my school to the top".

export type LoopModeForCopy = "people" | "roles" | "both";

export function loopCopy(
  mode: LoopModeForCopy,
  opts: { school?: string } = {}
) {
  const school = opts.school?.trim();
  const isRoles = mode === "roles";
  const isBoth = mode === "both";

  return {
    ...LOOP_COPY,

    // ── Wizard headlines and mode picker ─────────────────────────────
    // The prompt-first wizard uses ONE headline regardless of mode (the
    // textarea is the focus). Mode-specific copy lives on the chip
    // section + the mode-picker fallback below.
    goalsTitle: isBoth
      ? "Tell your Loop what to chase — and who."
      : isRoles
        ? "Tell your Loop what to chase."
        : "Tell your Loop who to chase.",
    goalsTitleAccent: isBoth ? "what" : (isRoles ? "what" : "who"),
    goalsSubtitle: isBoth
      ? "The loop scans for open postings AND surfaces people to network with. Edit anytime."
      : isRoles
        ? "The loop scans for open postings matching the companies and roles you list here. Edit anytime."
        : "The loop only considers companies, industries, and roles you list here. Edit anytime.",
    modeSectionLabel: "Mode",
    modeSectionHint: "What's this Loop chasing?",
    modePeopleBtn: "Find people",
    modePeopleDesc: "Reach professionals at target companies for coffee chats and referrals.",
    modeRolesBtn: "Find roles",
    modeRolesDesc: "Surface open postings matching your target roles. Optional outreach to founders at small companies.",
    modeBothBtn: "Both",
    modeBothDesc: "Network with people AND surface open postings, balanced against one credit budget.",

    // Summary chip rendered next to the parser-detected mode. Lets the
    // wizard say "We read this as: BOTH (job-search + networking)"
    // without re-deriving the phrasing at every call site.
    modeSummary: isBoth
      ? "job-search + networking"
      : isRoles
        ? "job-search"
        : "networking",

    // ── "Prefer alumni" toggle (label flips, field name stays preferAlumni) ─
    preferAlumniLabel: isRoles
      ? "Prefer warm angles"
      : "Prefer alumni",
    preferAlumniHint: isRoles
      ? (school
          ? `Push companies hiring ${school} alumni to the top.`
          : "Push companies my school feeds to the top.")
      : (school
          ? `Push ${school} alumni to the top.`
          : "Push people from my school to the top."),
  };
}
