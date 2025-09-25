import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const TermsOfService = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-6 py-16 max-w-4xl">
        <button
          onClick={() => navigate("/home")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft size={20} />
          Back to Home
        </button>

        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">
          <strong>Last Updated:</strong> 09.24.25
        </p>

        <div className="prose prose-lg max-w-none text-foreground">
          <p>
            These Terms of Service (“Terms”) are a binding agreement between you (“you,” “User”) and
            Offerloop.ai (“Offerloop.ai,” “we,” “us,” or “our”) governing your use of our website,
            application, APIs, and related services (collectively, the “Services”). By creating an
            account, accessing, or using the Services, you agree to these Terms and our Privacy
            Policy (incorporated by reference). If you do not agree, you must not use the Services.
          </p>

          <h2>1. Eligibility</h2>
          <p>
            You confirm that you are at least 18 years old (or the age of majority in your
            jurisdiction), legally capable of entering this agreement, not on any restricted party
            list, and permitted under applicable law to access the Services. The Services are not
            directed to children under 13 (or 16 where a higher threshold applies).
          </p>

          <h2>2. Account Registration &amp; Security</h2>
          <p>
            You must provide accurate, up-to-date information when creating an account and maintain
            it. You are responsible for keeping your login credentials secure and for all activity
            on your account. Notify us immediately at <a href="mailto:support@offerloop.ai">support@offerloop.ai</a> if you suspect
            unauthorized access. We may refuse, reclaim, or remove usernames at our discretion.
          </p>

          <h2>3. Subscriptions &amp; Payments</h2>
          <p><strong>Plans &amp; Fees:</strong> Some features require a paid subscription (“Paid Plan”). Plan prices, features, and billing cycles are shown at purchase.</p>
          <p><strong>Billing Authorization:</strong> By providing payment details, you authorize Stripe to charge applicable fees, taxes, and adjustments.</p>
          <p><strong>Auto-Renewal:</strong> Paid Plans renew automatically unless you cancel in-app before the renewal date.</p>
          <p><strong>Changes:</strong> We may adjust plan pricing or features prospectively with notice (email or in-app). Continuing to use the Services after changes take effect means you accept them.</p>
          <p><strong>Upgrades/Downgrades:</strong> Upgrades may bill immediately on a prorated basis; downgrades apply at the next renewal.</p>
          <p><strong>Refunds:</strong> Except where required by law, payments are non-refundable.</p>
          <p><strong>Taxes:</strong> You are responsible for applicable taxes, though we may collect and remit when legally required.</p>
          <p><strong>Chargebacks:</strong> Fraudulent or unwarranted chargebacks may result in suspension or termination.</p>

          <h2>4. License &amp; Access</h2>
          <p>
            Subject to these Terms and payment of applicable fees, Offerloop.ai grants you a
            limited, revocable, non-exclusive, non-transferable license to use the Services for
            personal or internal professional purposes (such as networking, recruiting outreach, and
            related learning). All other rights are reserved by Offerloop.ai.
          </p>

          <h2>5. User Content</h2>
          <p>
            “User Content” includes resumes, text, email templates, contact notes, performance
            metrics, and other material you provide or generate through the Services. You retain
            ownership of your content. By using the Services, you grant Offerloop.ai a worldwide,
            royalty-free, non-exclusive license to host, store, process, reproduce, transmit, and
            display User Content only as necessary to (i) operate and improve the Services, (ii)
            comply with legal obligations, and (iii) enforce these Terms. You represent that you
            have the necessary rights to your User Content and that it does not infringe any laws or
            third-party rights.
          </p>

          <h2>6. Email &amp; Outreach Responsibilities</h2>
          <ul>
            <li>Send emails without appropriate consent or legal basis.</li>
            <li>Mislead recipients with false headers, deceptive subject lines, or impersonation.</li>
            <li>Send bulk spam or messages unrelated to legitimate professional networking.</li>
            <li>
              Misuse analytics (open/click tracking) in ways that violate law or fail to provide
              necessary notice.
            </li>
          </ul>
          <p>
            We reserve the right to throttle, filter, suspend, or terminate accounts that appear
            abusive.
          </p>

          <h2>7. AI &amp; Automated Features</h2>
          <p>
            The Services may incorporate AI (e.g., OpenAI) to generate personalized content,
            analytics, or explanations. Outputs may be inaccurate, incomplete, or non-compliant. You
            are responsible for reviewing AI-generated suggestions before using them. Offerloop.ai
            disclaims liability for actions you take based on AI outputs.
          </p>

          <h2>8. Integrations &amp; Third-Party Services</h2>
          <p>
            The Services may integrate with Google, Microsoft, Stripe, LinkedIn, OpenAI, Firebase,
            hosting providers, analytics partners, and other third-party platforms. Each integration
            is governed by its own terms. Offerloop.ai is not responsible for the availability,
            performance, or data practices of third-party services outside our reasonable control.
          </p>

          <h2>9. Third-Party Data Providers</h2>
          <p>
            In addition to integrations, Offerloop.ai may obtain professional or publicly available
            information from trusted data providers, such as People Data Labs (PDL). Such
            information may include names, job titles, company details, and professional contact
            information. Use of this data is limited to enabling networking, recruiting automation,
            and related services. Users may request removal of such third-party data as described in
            our Privacy Policy.
          </p>

          <h2>10. Google API Services; Limited Use</h2>
          <ul>
            <li>We access Google data only with your explicit OAuth consent.</li>
            <li>We request only the minimum scopes necessary (e.g., draft creation, scheduling emails, contact syncing).</li>
            <li>We never sell Google data or use it for advertising.</li>
            <li>
              Human access is strictly limited to narrow cases (e.g., security investigations, abuse
              prevention, compliance with law, or with your explicit consent).
            </li>
            <li>We do not use Google data to train generalized AI/ML models.</li>
            <li>
              You may revoke our access at any time via your Google Account Security Settings.
            </li>
            <li>
              Upon account deletion or revocation, associated Google data is promptly deleted from
              our systems, except where retention is legally required.
            </li>
          </ul>

          <h2>11. Prohibited Uses</h2>
          <ul>
            <li>Violate any law, regulation, or third-party right.</li>
            <li>Reverse engineer, decompile, or attempt to extract source code.</li>
            <li>Introduce malware or impose excessive load on our systems.</li>
            <li>Bypass or probe system security without authorization.</li>
            <li>Harvest personal data without a lawful basis.</li>
            <li>Upload or distribute unlawful, defamatory, or infringing content.</li>
            <li>
              Upload sensitive personal data categories (such as health, financial account numbers,
              government identifiers, or children’s data) unless explicitly permitted.
            </li>
          </ul>

          <h2>12. Intellectual Property</h2>
          <p>
            The Services (including software, interfaces, design, branding, and trademarks) are
            owned by Offerloop.ai or its licensors. Except for the limited license in Section 4, you
            gain no rights in the Services. Third-party marks remain the property of their
            respective owners.
          </p>

          <h2>13. Feedback</h2>
          <p>
            If you provide feedback or suggestions, you grant Offerloop.ai a perpetual, worldwide,
            royalty-free license to use and incorporate them without restriction or obligation.
          </p>

          <h2>14. Beta / Experimental Features</h2>
          <p>
            Beta or trial features may change or be removed at any time and are provided “as is,”
            without warranties.
          </p>

          <h2>15. Privacy &amp; Data Protection</h2>
          <p>
            Your use of the Services is subject to our Privacy Policy. Unless a separate data
            processing agreement is in place, each party acts as an independent controller of the
            personal data it provides. You are responsible for ensuring you have appropriate
            consents for any professional contact information you upload.
          </p>

          <h2>16. Analytics &amp; Tracking</h2>
          <p>
            The Services may track email opens, link clicks, replies, and usage data to deliver
            functionality and insights. You are responsible for disclosing such tracking to
            recipients when legally required.
          </p>

          <h2>17. Security Practices</h2>
          <p>
            Offerloop.ai uses industry-standard security measures, including encryption in transit
            and at rest, access logging, and administrative controls, to protect user data.
          </p>

          <h2>18. Data Deletion &amp; Retention</h2>
          <p>
            Users may request deletion of their account and associated personal data by contacting{" "}
            <a href="mailto:privacy@offerloop.ai">privacy@offerloop.ai</a>. Upon such request, Offerloop.ai will delete user
            data within 30 days, except as necessary to comply with legal obligations or enforce
            these Terms. Unless otherwise required by law, we retain personal data only as long as
            necessary to provide the Services.
          </p>

          <h2>19. Compliance With Privacy &amp; Anti-Spam Laws</h2>
          <p>
            You are responsible for ensuring that your use of the Services complies with all
            applicable laws, including but not limited to GDPR, CCPA, CAN-SPAM, and other data
            protection and anti-spam regulations.
          </p>

          <h2>20. Suspension &amp; Termination</h2>
          <p>
            We may suspend or terminate your access immediately for breach of these Terms, suspected
            abuse, non-payment, or legal reasons. You may cancel your account at any time in-app;
            cancellation takes effect at the end of the current billing period. Sections 5–8 and
            10–24 survive termination.
          </p>

          <h2>21. Disclaimers</h2>
          <p>
            THE SERVICES, INCLUDING AI FEATURES AND BETA FUNCTIONALITY, ARE PROVIDED “AS IS” AND “AS
            AVAILABLE.” WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY,
            FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND THAT SERVICES WILL BE ERROR-FREE
            OR UNINTERRUPTED.
          </p>

          <h2>22. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW: (a) OFFERLOOP.AI SHALL NOT BE LIABLE FOR
            INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES (INCLUDING LOST
            PROFITS, LOST DATA, OR BUSINESS INTERRUPTION), EVEN IF ADVISED OF POSSIBILITY; (b) OUR
            TOTAL LIABILITY FOR ALL CLAIMS SHALL NOT EXCEED THE GREATER OF (i) THE FEES PAID BY YOU
            IN THE PRIOR 12 MONTHS OR (ii) US $100 IF NO PAID PLAN APPLIED.
          </p>

          <h2>23. Indemnification</h2>
          <p>
            You agree to defend, indemnify, and hold harmless Offerloop.ai and its affiliates,
            officers, and employees against any claims, damages, or expenses arising from your User
            Content, your use of the Services, or your violation of these Terms or applicable law.
          </p>

          <h2>24. Modifications</h2>
          <p>
            We may modify these Terms or the Services at any time. Material changes will be
            communicated via email or in-app notice and take effect as of the “Last Updated” date.
            Continued use after changes constitutes acceptance.
          </p>

          <h2>25. Governing Law &amp; Dispute Resolution</h2>
          <p>These Terms are governed by the laws of Delaware (excluding conflict rules).</p>
          <p><strong>Arbitration:</strong> Any dispute will be resolved by binding arbitration through the AAA in Wilmington, Delaware (or virtually) before a single arbitrator.</p>
          <p><strong>Exceptions:</strong> Either party may seek injunctive relief in court to protect intellectual property or bring individual claims in small claims court.</p>
          <p><strong>Class Action Waiver:</strong> Claims must proceed individually. No class or representative actions are permitted. If unenforceable, such claims default to court.</p>
          <p><strong>Opt-Out:</strong> You may opt out of arbitration (but not the class waiver) by emailing <a href="mailto:support@offerloop.ai">support@offerloop.ai</a> within 30 days of first acceptance, stating your name and account email.</p>

          <h2>26. Export &amp; Sanctions Compliance</h2>
          <p>
            You represent you are not located in or a resident of a country under U.S. embargo and
            are not on any restricted party list. You agree not to export or re-export the Services
            in violation of applicable laws.
          </p>

          <h2>27. Force Majeure</h2>
          <p>
            We are not responsible for delays or failures caused by circumstances beyond our control,
            including natural disasters, government actions, labor disputes, or third-party outages.
          </p>

          <h2>28. Assignment</h2>
          <p>
            You may not assign these Terms without our prior written consent. We may assign them
            freely (e.g., through merger, acquisition, or reorganization).
          </p>

          <h2>29. Severability</h2>
          <p>
            If any provision is held invalid, the rest remain in effect. A valid term will replace
            the invalid one to best reflect original intent.
          </p>

          <h2>30. Waiver</h2>
          <p>
            Failure to enforce any provision is not a waiver of future enforcement. No waiver is
            valid unless in writing.
          </p>

          <h2>31. Entire Agreement</h2>
          <p>
            These Terms, our Privacy Policy, and any subscription details constitute the full
            agreement between you and Offerloop.ai, replacing all prior agreements.
          </p>

          <h2>32. Notices</h2>
          <p>
            We may notify you via email (to your registered address) or in-app messaging. You are
            responsible for keeping your contact information current. Legal notices to Offerloop.ai
            may be sent to: <a href="mailto:support@offerloop.ai">support@offerloop.ai</a> or <a href="mailto:privacy@offerloop.ai">privacy@offerloop.ai</a> (Subject: “Legal Notice”).
          </p>

          <h2>33. Contact</h2>
          <p>
            Questions about these Terms? Contact us at:<br />
            <a href="mailto:support@offerloop.ai">support@offerloop.ai</a> (general support)<br />
            <a href="mailto:privacy@offerloop.ai">privacy@offerloop.ai</a> (privacy and data protection inquiries)
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default TermsOfService;
