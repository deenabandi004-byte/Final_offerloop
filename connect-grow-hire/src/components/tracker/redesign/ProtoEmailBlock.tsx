import { type ReactNode } from "react";
import { type ProtoContact } from "@/pages/trackerAdapter";

// Email block scroll content: three template tiles (Networking / Referral /
// Follow Up), To/From/Subject fields, body, word count. The Save Draft /
// Edit Template / Send via Gmail footer lives in the page so it can sit
// outside .detail-scroll as a pinned sibling, matching the prototype layout.
//
// Templates ported from network-tracker.html (line 2311-2357). The proto's
// em-dashes are replaced with commas per the project's no-em-dash rule.

export type TemplateKey = "networking" | "referral" | "followup";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function buildTemplates(contact: ProtoContact, userName: string): Record<TemplateKey, { subject: string; body: string }> {
  const first = contact.name.split(/\s+/)[0] || contact.name;
  const company = contact.company || "your team";
  const signature = userName || "Your Name";
  return {
    networking: {
      subject: `Would love to connect, ${first}`,
      body:
`Hi ${first},

I've been following ${company}'s work and really admire what you're building. I'm currently exploring this space and would love to learn from your experience.

Would you be open to a quick 15-minute chat over the next couple of weeks? I'd genuinely value your perspective and any advice you might have.

Thanks so much for your time, looking forward to connecting.

Best,
${signature}`,
    },
    referral: {
      subject: `Referral request, ${company}`,
      body:
`Hi ${first},

I hope you're doing well! I'm reaching out because I'm very interested in opportunities at ${company}, and I thought you'd have great insight into the team.

Would you be open to referring me, or pointing me toward the right person to speak with? I'm happy to send over my resume and a short summary of my background to make it easy.

I really appreciate any help you can offer, thank you!

Best,
${signature}`,
    },
    followup: {
      subject: `Following up, ${first}`,
      body:
`Hi ${first},

I wanted to follow up on my previous note, I know things get busy! I'm still very interested in connecting and learning more about your work at ${company}.

If you have a few minutes in the coming days, I'd love to find a time that works for you. No worries at all if now isn't the right moment.

Thanks again, and looking forward to hearing from you.

Best,
${signature}`,
    },
  };
}

interface TemplateTileProps {
  title: string;
  caption: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}

function TemplateTile({ title, caption, icon, active, onClick }: TemplateTileProps) {
  return (
    <button type="button" className={`template-tile${active ? " active" : ""}`} onClick={onClick}>
      <div className="template-tile-title-row">
        <span className="template-tile-icon">{icon}</span>
        <span className="template-tile-title">{title}</span>
      </div>
      <p className="template-tile-caption">{caption}</p>
    </button>
  );
}

const NetworkingIcon = (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="4.5" r="1.83" stroke="currentColor" strokeWidth="1.33" />
    <path d="M11.83 13.5c0-2.11-1.71-3.83-3.83-3.83-2.11 0-3.83 1.71-3.83 3.83" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" />
    <circle cx="3" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.33" />
    <path d="M5.5 12C5.5 10.34 4.34 9 3 9c-1.34 0-2.5 1.34-2.5 3" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" />
    <circle cx="13" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.33" />
    <path d="M10.5 12c0-1.66 1.16-3 2.5-3 1.34 0 2.5 1.34 2.5 3" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" />
  </svg>
);

const ReferralIcon = (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="6" cy="5.33" r="2.33" stroke="currentColor" strokeWidth="1.33" />
    <path d="M1.5 14c0-2.49 2.01-4.5 4.5-4.5 1.05 0 2.02.36 2.78.97" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" />
    <path d="M10.5 12.5L12 14L15 11" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FollowUpIcon = (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 8a6 6 0 1 1-1.76-4.24" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 2v3.5h-3.5" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface ProtoEmailBlockProps {
  contact: ProtoContact;
  userName: string;
  userEmail: string;
  activeTemplate: TemplateKey;
  onChangeTemplate: (t: TemplateKey) => void;
}

export function ProtoEmailBlock({
  contact,
  userName,
  userEmail,
  activeTemplate,
  onChangeTemplate,
}: ProtoEmailBlockProps) {
  const tpl = buildTemplates(contact, userName)[activeTemplate];
  const wordCount = tpl.body.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="email-header-row">
        <span className="email-label">Email Template</span>
        <span className="email-pick">- pick one</span>
      </div>

      <div className="template-tiles">
        <TemplateTile
          title="Networking"
          caption="Warm intro to start a conversation"
          icon={NetworkingIcon}
          active={activeTemplate === "networking"}
          onClick={() => onChangeTemplate("networking")}
        />
        <TemplateTile
          title="Referral Request"
          caption="Ask for an intro or referral"
          icon={ReferralIcon}
          active={activeTemplate === "referral"}
          onClick={() => onChangeTemplate("referral")}
        />
        <TemplateTile
          title="Follow Up"
          caption="Gentle nudge after a prior note"
          icon={FollowUpIcon}
          active={activeTemplate === "followup"}
          onClick={() => onChangeTemplate("followup")}
        />
      </div>

      <div className="email-fields">
        <div className="email-field-row">
          <span className="email-field-label">To</span>
          <div className="email-to-chip">
            <div className="chip-avatar">{initials(contact.name)}</div>
            <span className="chip-name">{contact.name}</span>
          </div>
        </div>
        <div className="email-field-row">
          <span className="email-field-label">From</span>
          <span className="email-field-value">{userEmail}</span>
        </div>
        <div className="email-field-row">
          <span className="email-field-label">Subject</span>
          <span className="email-field-value">{tpl.subject}</span>
        </div>
      </div>

      <div className="email-body-wrap">
        <div className="email-body-text">{tpl.body}</div>
      </div>
      <div className="email-word-count" aria-live="polite">
        {wordCount} word{wordCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}
