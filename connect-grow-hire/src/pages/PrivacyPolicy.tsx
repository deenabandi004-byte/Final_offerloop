import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link to="/home">
              <Button variant="ghost" className="mb-6">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
            
            <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
            <p className="text-muted-foreground">Effective Date: [Insert Date]</p>
          </div>

          <div className="prose prose-gray max-w-none">
            <p className="text-lg leading-relaxed mb-6">
              Offerloop.ai ("Offerloop.ai," "we," "us," or "our") is committed to protecting your privacy. This Privacy Policy describes how we collect, use, disclose, and safeguard your personal information in accordance with applicable U.S. privacy laws, including the California Consumer Privacy Act (CCPA/CPRA), as well as best practices for transparency and user rights.
            </p>
            
            <p className="mb-8">
              By accessing or using Offerloop.ai ("the Service"), you agree to the practices described in this Privacy Policy.
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>
              
              <h3 className="text-xl font-medium mb-3">a. Information You Provide</h3>
              <p className="mb-4">When you create an account or use our Service, we collect:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Personal Information:</strong> First and last name, university, email address (Google sign-in), graduation year, degree type, field(s) of study, industry/role preferences, location preferences, and other details you provide for your profile or applications.</li>
                <li><strong>Account Credentials:</strong> Google authentication data; we do not collect your Google password.</li>
              </ul>

              <h3 className="text-xl font-medium mb-3">b. Google Integration</h3>
              <p className="mb-2">With your explicit consent via Google OAuth:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Gmail:</strong> We may draft and save outreach emails in your Gmail, on your behalf.</li>
                <li><strong>Google Drive:</strong> We may generate spreadsheets/documents you request and allow you to save them to your Google Drive.</li>
              </ul>
              <p className="mb-4"><strong>Data Minimization:</strong> We only access the minimum data required to provide our Service; we do not access your full inbox, drive contents, or personal communications.</p>

              <h3 className="text-xl font-medium mb-3">c. Professional Data From Third Parties</h3>
              <p className="mb-2"><strong>People Data Labs:</strong></p>
              <p className="mb-4">We supplement our Service with verified, up-to-date professional data on working professionals across the United States, as provided by our data partner People Data Labs. This may include publicly available professional and academic data to improve recruiter matching and networking features.</p>

              <h3 className="text-xl font-medium mb-3">d. Payment Information</h3>
              <p className="mb-2"><strong>Stripe:</strong></p>
              <p className="mb-4">Payments are processed securely by Stripe. Offerloop.ai does not store your full payment card details. Stripe collects and processes payment data per their privacy policy.</p>

              <h3 className="text-xl font-medium mb-3">e. Automatically Collected Information</h3>
              <p className="mb-4">Device and browser information, IP address, referring URLs, activity on the platform, and usage analytics (collected via cookies or similar technologies).</p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. How We Use Your Information</h2>
              <p className="mb-4">We use your information to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Operate, maintain, and improve the Service</li>
                <li>Authenticate and manage your account</li>
                <li>Facilitate drafting/sending outreach emails and saving documents to your Google account (with your permission)</li>
                <li>Match you with relevant recruiters and job opportunities</li>
                <li>Share profile information (as authorized) with employers/recruiters seeking talent</li>
                <li>Process payments and manage subscriptions</li>
                <li>Provide customer support and respond to your requests</li>
                <li>Monitor usage, detect fraud, and ensure security</li>
                <li>Comply with legal and regulatory obligations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. How We Share Your Information</h2>
              <p className="mb-4">We may share your information with:</p>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Recruiters/Employers:</h4>
                  <p>With your consent, your profile and relevant data may be shared with recruiters and employers for job matching purposes.</p>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Service Providers:</h4>
                  <p>Including Google (for login, Gmail, Drive), Stripe (payments), People Data Labs (professional data enrichment), cloud hosting, analytics, and support tools. Providers are contractually required to protect your data.</p>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Legal/Regulatory Authorities:</h4>
                  <p>If required by law, subpoena, or government request, or to protect our rights, users, or service integrity.</p>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Business Transfers:</h4>
                  <p>If Offerloop.ai is involved in a merger, acquisition, restructuring, or asset sale, user information may be transferred as part of the transaction.</p>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">No Sale of Personal Data:</h4>
                  <p>We do not sell your personal information, as defined under the CCPA/CPRA.</p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Your Privacy Rights</h2>
              
              <h3 className="text-xl font-medium mb-3">a. California Residents (CCPA/CPRA Rights)</h3>
              <p className="mb-2">If you are a California resident, you have the right to:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Know what categories of personal information we collect and how we use/share it</li>
                <li>Request access to or deletion of your personal information</li>
                <li>Request correction of inaccurate information</li>
                <li>Opt out of sharing personal information for "cross-context behavioral advertising" (we do not do this)</li>
                <li>Non-discrimination for exercising your privacy rights</li>
              </ul>
              <p className="mb-4">To exercise these rights, please contact us at [privacy@pipelinepath.io] with your request. We may verify your identity before processing certain requests.</p>

              <h3 className="text-xl font-medium mb-3">b. All U.S. Users</h3>
              <p className="mb-2">You may:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access and update your profile at any time</li>
                <li>Request deletion of your account/data (contact us at privacy@pipelinepath.io)</li>
                <li>Withdraw consent for Google account integrations via your Google security settings</li>
                <li>Opt out of marketing communications via email settings or contact</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
              <p>We use industry-standard technical and organizational measures to protect your data. This includes encryption, secure authentication, limited data access, and routine security reviews. However, no system is 100% secure; please use strong passwords and keep your login credentials confidential.</p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>
              <p>We retain personal data as long as necessary to provide the Service and fulfill legal obligations. You may request deletion of your account and information at any time.</p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Children's Privacy</h2>
              <p>Offerloop.ai is not intended for use by children under 16. We do not knowingly collect personal data from children under 16. If you believe we have inadvertently collected such data, contact us and we will delete it promptly.</p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. International Users</h2>
              <p>Offerloop.ai is operated in the United States. If you use the Service from outside the U.S., you consent to the transfer and processing of your data in the U.S. and understand that privacy laws in your jurisdiction may differ.</p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Changes to This Policy</h2>
              <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated effective date. Significant changes will be communicated by email or through the Service.</p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. Contact Us</h2>
              <p className="mb-4">For questions, concerns, or privacy requests, please contact us at:</p>
              <ul className="space-y-2">
                <li><strong>Email:</strong> privacy@pipelinepath.io</li>
                <li><strong>Mailing Address:</strong> [Insert address, if applicable]</li>
                <li><strong>Website:</strong> www.pipelinepath.io</li>
              </ul>
              <p className="mt-6">This Privacy Policy is effective as of [Insert Date].</p>
              <p><strong>Last updated:</strong> [Insert Date].</p>
            </section>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;