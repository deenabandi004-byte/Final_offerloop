import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { PageWrapper } from "@/components/PageWrapper";
import { GlassCard } from "@/components/GlassCard";

const PrivacyPolicy = () => {
  return (
    <PageWrapper>
      <Header />

      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link to="/">
              <Button variant="ghost" className="mb-6 text-gray-300 text-slate-700 hover:text-blue-400">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>

            <h1 className="text-display-lg mb-2 text-white text-slate-900">
              Privacy <span className="gradient-text-teal">Policy</span>
            </h1>
            <p className="text-gray-400 text-slate-600">
              <strong>Last Updated:</strong> 09.24.25
            </p>
          </div>

          <GlassCard className="p-8 rounded-2xl">
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-300 text-slate-700">
              Welcome to Offerloop.ai ("Offerloop.ai," "we," "us," or "our"). This Privacy Policy
              explains how we collect, use, disclose, and protect your information when you use our
              application and services (collectively, the "Services"). Please read this Privacy
              Policy carefully. If you do not agree with the terms, please do not use the Services.
            </p>
            <p>
              We may update this Privacy Policy at any time. If we do, we will update the "Last
              Updated" date at the top of this page. We encourage you to review this Privacy Policy
              periodically to remain informed.
            </p>

            <h2 className="text-white text-slate-900">1. Information We Collect</h2>
            <p>We may collect information about you in the following ways, depending on how you use the Services:</p>

            <h3 className="text-white text-slate-900">a. Personal Data You Provide to Us</h3>
            <p>
              <strong>Account Information:</strong> When you register for an account, we collect your name, email
              address, and authentication information from your chosen provider (e.g., Google ID or Microsoft ID,
              via Firebase).
            </p>
            <p>
              <strong>Profile Information:</strong> To enhance your networking and outreach experience, you may
              provide details such as your university, class year, major, work experience, organizations,
              extracurricular activities, personal interests, target job roles, target locations, and resumes. You
              may also choose to sync your LinkedIn profile.
            </p>
            <p>
              <strong>User-Generated Content:</strong> Email templates you create or customize, notes you take on
              contacts, and any content you generate within our performance-tracking modules.
            </p>

            <h3>b. Data Related to Your Use of the Services</h3>
            <p>
              <strong>Contact and Professional Information:</strong> Information about professionals you connect
              with through Offerloop.ai, including names, positions, companies, contact details, and any notes or
              status updates you log. Some of this data may also be provided by trusted third-party data providers
              such as People Data Labs (PDL) to help you discover relevant professionals and enrich connections.
            </p>
            <p>
              <strong>Email Data (Content &amp; Metadata):</strong> If you connect your Gmail or Outlook account, we
              process:
            </p>
            <ul>
              <li>Email drafts saved via Gmail API (when you use our service to prepare outreach emails).</li>
              <li>
                Draft, sent, and received email data (subjects, bodies, recipients, timestamps, thread IDs,
                conversation IDs, Message-IDs) that you choose to manage through Offerloop.ai.
              </li>
            </ul>
            <p>
              <strong>Tracking Information:</strong> We may include tracking pixels and tracked links in emails to
              measure open rates, clicks, IP addresses, approximate locations, devices, and timestamps of activity.
            </p>
            <p>
              <strong>Performance Data:</strong> Outreach performance metrics, such as emails sent, open rates,
              response rates, meeting conversions, template effectiveness, and connection growth.
            </p>

            <h3>c. Information from Third-Party Services</h3>
            <p>
              <strong>Authentication (Firebase with Google/Microsoft):</strong> When registering or logging in, we
              receive your name, email, profile picture, and authentication token. Encrypted access/refresh tokens
              are stored to connect to your email provider.
            </p>
            <p>
              <strong>AI Services (OpenAI/ChatGPT):</strong> When using AI-powered personalization or explanations,
              relevant data may be securely sent to AI providers to generate responses.
            </p>
            <p>
              <strong>Payment Processors (Stripe):</strong> Stripe processes all payments. We only receive
              subscription details and a Stripe Customer ID—not full payment card details.
            </p>
            <p>
              <strong>Hosting Providers (Render, Firebase Hosting):</strong> Used for backend infrastructure and
              secure data storage.
            </p>
            <p>
              <strong>Analytics Tools:</strong> Used to monitor performance and improve our Services.
            </p>
            <p>
              <strong>Data Partners:</strong> External data labs such as People Data Labs may provide professional
              contact information to supplement your searches and improve connection opportunities.
            </p>

            <h3>d. Technical &amp; Usage Data</h3>
            <p>
              <strong>Device &amp; Connection Info:</strong> IP address, browser type, device type, OS, and related
              metadata.
            </p>
            <p>
              <strong>Usage Data:</strong> Features accessed, time spent, click paths, and other interactions within
              the Services.
            </p>

            <h2>2. How We Use Your Information</h2>
            <ul>
              <li>Create and manage your account.</li>
              <li>
                Provide, operate, and maintain the Services (e.g., connecting to email providers, saving drafts in
                Gmail, sending emails, managing contacts, generating analytics).
              </li>
              <li>Personalize emails and generate AI-powered content suggestions.</li>
              <li>Process subscriptions and payments securely through Stripe.</li>
              <li>Deliver analytics, dashboards, and outreach performance insights.</li>
              <li>Communicate updates, support responses, and account notices.</li>
              <li>Detect, investigate, and prevent fraud, misuse, or security issues.</li>
              <li>Comply with legal obligations.</li>
              <li>Ensure compliance with privacy and anti-spam laws such as GDPR, CCPA, and CAN-SPAM.</li>
            </ul>

            <h2>3. Legal Bases for Processing (GDPR)</h2>
            <ul>
              <li>
                <strong>Consent:</strong> When you provide explicit consent (e.g., connecting your Google account).
              </li>
              <li>
                <strong>Contract:</strong> When processing is necessary to provide the Services under our Terms of
                Service.
              </li>
              <li>
                <strong>Legal Obligation:</strong> When processing is required to comply with applicable laws or
                regulations.
              </li>
              <li>
                <strong>Legitimate Interests:</strong> When processing is necessary for our legitimate business
                interests, such as improving the Services, preventing abuse, or analyzing usage, provided those
                interests are not overridden by your rights.
              </li>
            </ul>

            <h2>4. Security Measures</h2>
            <ul>
              <li>
                <strong>Encryption in Transit &amp; At Rest:</strong> TLS (HTTPS) for data in motion; AES-256 for
                sensitive data like OAuth tokens.
              </li>
              <li>
                <strong>Access Controls:</strong> Restricted to authorized personnel/systems.
              </li>
              <li>
                <strong>Monitoring &amp; Auditing:</strong> Logging and vulnerability audits.
              </li>
              <li>
                <strong>Compliance:</strong> Best practices aligned with the Google API Services User Data Policy.
              </li>
            </ul>

            <h2>5. Disclosure of Your Information</h2>
            <ul>
              <li>
                <strong>By Law / Protection of Rights:</strong> As required to comply with law, legal process, or
                enforce our rights.
              </li>
              <li>
                <strong>Third-Party Providers:</strong> For authentication (Firebase), email (Gmail API, Microsoft
                Graph API), AI processing (OpenAI), payments (Stripe), hosting (Render, Firebase Hosting), and
                analytics. All are bound by contractual obligations to protect your data.
              </li>
              <li>
                <strong>Third-Party Data Sources:</strong> Data from People Data Labs (PDL) and similar providers is
                used only for professional networking/recruiting functionality.
              </li>
              <li>
                <strong>Business Transfers:</strong> If we undergo a merger, acquisition, or sale.
              </li>
              <li>
                <strong>No Sale of Data:</strong> We do not sell, rent, or trade personal data.
              </li>
              <li>
                <strong>No Advertising Use:</strong> We do not use Google user data or third-party data for
                advertising or unrelated marketing.
              </li>
              <li>
                <strong>With Your Consent:</strong> We share data only for purposes you explicitly approve.
              </li>
            </ul>

            <h2>6. Google API Services User Data Policy</h2>
            <p>
              Offerloop.ai’s use and transfer of information received from Google APIs strictly adheres to the
              Google API Services User Data Policy, including the Limited Use requirements. Specifically:
            </p>
            <ul>
              <li>We only access Gmail data with your explicit consent through Google OAuth.</li>
              <li>
                Requested scopes (e.g., gmail.readonly, gmail.compose, gmail.modify, gmail.metadata, gmail.insert, gmail.send, openid, userinfo.email, userinfo.profile)
                are used to:
                <ul>
                  <li>Save outreach emails into your Gmail Drafts folder at your request.</li>
                  <li>Schedule and send emails on your behalf.</li>
                  <li>Detect replies and update email status.</li>
                </ul>
              </li>
              <li>We never sell Gmail data or use it for advertising.</li>
              <li>
                Humans cannot access Gmail content except with your explicit consent, for abuse/security
                investigations, to comply with law, or after anonymization/aggregation for service operations.
              </li>
              <li>We do not use Gmail or Google Workspace data to train general AI/ML models.</li>
              <li>You may revoke access at any time via your Google Account Security Settings.</li>
              <li>
                Upon account deletion or revocation, associated Google data is promptly deleted from our systems,
                except where retention is legally required.
              </li>
            </ul>

            <h2>7. Data Retention</h2>
            <ul>
              <li>
                <strong>Account Data:</strong> Stored as long as your account is active.
              </li>
              <li>
                <strong>Drafts &amp; Emails:</strong> Retained only as long as needed to fulfill Service functions
                (draft storage, scheduling, reply detection).
              </li>
              <li>
                <strong>Analytics Data:</strong> May be anonymized/aggregated for long-term storage.
              </li>
              <li>
                <strong>Deletion Requests:</strong> Honored within 30 days, except where retention is legally
                required.
              </li>
              <li>
                <strong>Export Rights:</strong> Users may request an export of their personal data in a
                machine-readable format (e.g., CSV or JSON) before deletion.
              </li>
            </ul>

            <h2>8. Your Rights &amp; Choices</h2>
            <p>Depending on your jurisdiction, you may request:</p>
            <ul>
              <li>Access to personal data we hold.</li>
              <li>Correction of inaccuracies.</li>
              <li>Deletion of personal data (with some legal/operational exceptions).</li>
              <li>Restriction or objection to processing.</li>
              <li>Data portability in machine-readable format.</li>
              <li>Revocation of consent (e.g., disconnecting Google/Microsoft accounts).</li>
              <li>Email tracking opt-out by disabling image loading in your client.</li>
              <li>
                The right to lodge a complaint with a supervisory authority if you believe our processing violates
                applicable law.
              </li>
            </ul>
            <p>
              Requests may be made via <a href="mailto:privacy@offerloop.ai">privacy@offerloop.ai</a> or{" "}
              <a href="mailto:support@offerloop.ai">support@offerloop.ai</a>.
            </p>

            <h2>9. Children’s Privacy</h2>
            <p>
              The Services are not intended for children under 13 (or 16 in certain regions). We do not knowingly
              collect data from children under these ages. If such data is discovered, it will be deleted promptly.
            </p>

            <h2>10. International Data Transfers</h2>
            <p>
              Your information may be stored on servers located outside your home country (e.g., via Render and
              Firebase Hosting). By using the Services, you consent to international transfers as permitted by law.
            </p>

            <h2>11. Third-Party Websites &amp; Services</h2>
            <p>
              Our Services may link to third-party sites (LinkedIn, Stripe, AI providers, etc.). We are not
              responsible for their practices; please review their privacy policies separately.
            </p>

            <h2>12. Cookies &amp; Tracking Technologies</h2>
            <p>We use:</p>
            <ul>
              <li><strong>Session Cookies</strong> for secure navigation.</li>
              <li><strong>Preference Cookies</strong> for saved settings.</li>
              <li><strong>Analytics Cookies</strong> for performance insights.</li>
              <li><strong>Tracking Pixels &amp; Links</strong> for email activity monitoring.</li>
            </ul>
            <p>You may disable cookies in browser settings, though this may impact functionality.</p>

            <h2>13. Service Availability Disclaimer</h2>
            <p>
              The Services may rely on third-party infrastructure providers (e.g., Firebase, Render, OpenAI). While
              we use industry-standard practices to maintain availability, we cannot guarantee uninterrupted or
              error-free operation, and availability may depend on those providers.
            </p>

            <h2>14. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy periodically. Updates are effective immediately once posted with a
              new "Last Updated" date.
            </p>

            <h2>15. Contact Us</h2>
            <p>If you have questions or concerns about this Privacy Policy, please contact us:</p>
            <ul>
              <li>📧 <a href="mailto:support@offerloop.ai">support@offerloop.ai</a> (general inquiries)</li>
              <li>📧 <a href="mailto:privacy@offerloop.ai">privacy@offerloop.ai</a> (privacy and data protection inquiries)</li>
            </ul>
          </div>
          </GlassCard>
        </div>
      </main>

      <Footer />
    </PageWrapper>
  );
};

export default PrivacyPolicy;
