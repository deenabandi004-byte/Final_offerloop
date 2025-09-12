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
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        
        <div className="prose prose-lg max-w-none space-y-6 text-foreground">
          <p className="text-muted-foreground">
            <strong>Effective Date:</strong> [Insert Date]
          </p>
          
          <p>
            Welcome to Offerloop.ai ("Offerloop.ai", "we", "us", or "our"). These Terms of Service ("Terms") govern your access to and use of our website, platform, and related services (the "Service"). By creating an account, accessing, or using the Service, you agree to these Terms. If you do not agree, do not use the Service.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">1. Eligibility and Registration</h2>
          <p>
            <strong>Eligibility:</strong> The Service is available to anyone age 16 or older. By using Offerloop.ai, you represent that you are at least 16 years of age.
          </p>
          <p>
            <strong>Registration:</strong> To use certain features, you must create an account using Google OAuth. You agree to provide accurate and complete information and to keep your account information up to date.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">2. The Offerloop.ai Service</h2>
          <p>
            <strong>Core Offerings:</strong> Offerloop.ai provides a platform for users (primarily students and professionals) to automate recruiting outreach, match with recruiters, draft emails, generate and populate Google Sheets with contact information, and save documents to Google Drive.
          </p>
          <p>
            <strong>Resume Upload:</strong> Users may upload their resume (in supported formats). This is used for advanced features such as finding similarities with professionals in our network, available on Pro memberships.
          </p>
          <p>
            <strong>Credit System:</strong> Access to certain services is managed via credits. Each use of the Service (e.g., generating a contact list) deducts credits from your account based on our costs for providing information. The current credit pricing structure is displayed within your account.
          </p>
          <p>
            <strong>Payment:</strong> Payments for credits or Pro memberships are processed securely through Stripe. We do not store your payment card details.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">3. Account Security</h2>
          <p>
            <strong>Google Authentication:</strong> You must log in using a valid Google account. Keep your login credentials secure and do not share your account.
          </p>
          <p>
            <strong>Account Responsibility:</strong> You are responsible for all activity that occurs under your account. Notify us immediately of any unauthorized use.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">4. Acceptable Use</h2>
          <p>
            <strong>Intended Use:</strong> Offerloop.ai is intended for individual job/internship seekers and professionals to enhance their recruiting process. Recruiters and employers may create accounts, but the platform is not primarily designed for their use.
          </p>
          <p>
            <strong>Prohibited Conduct:</strong> You may not:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Use the Service for unlawful purposes;</li>
            <li>Attempt to reverse engineer or disrupt the Service;</li>
            <li>Misuse or attempt to gain unauthorized access to any account or data;</li>
            <li>Use automated scripts to collect information or interact with the Service beyond intended features.</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">5. User Content</h2>
          <p>
            <strong>Resume Upload:</strong> You may upload your resume. By doing so, you grant Offerloop.ai a non-exclusive, royalty-free license to use, store, and process your resume for the purpose of providing the Service, including similarity analysis for matching.
          </p>
          <p>
            <strong>No Other Uploads:</strong> Users may not upload any other content.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">6. Professional Data and Third-Party Integrations</h2>
          <p>
            <strong>People Data Labs:</strong> We supplement our Service with professional data provided by People Data Labs to facilitate connections and networking opportunities. All data use complies with applicable law and our Privacy Policy.
          </p>
          <p>
            <strong>Google Integrations:</strong> With your permission, we access your Gmail (for drafting/saving outreach emails), Google Drive (to store and let you download spreadsheets/documents), and account details. We access only the minimum data necessary to provide our Service.
          </p>
          <p>
            <strong>Stripe:</strong> All payments are processed via Stripe. Please review Stripe's privacy policy for information on how your payment data is handled.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">7. Credit System and Payments</h2>
          <p>
            <strong>Credits:</strong> Certain actions or features require credits, which you can purchase through the Service. Each use will deduct the specified number of credits as displayed at the time of the transaction.
          </p>
          <p>
            <strong>No Refunds:</strong> Credit purchases and subscriptions are generally non-refundable except as required by law.
          </p>
          <p>
            <strong>Pricing Changes:</strong> Offerloop.ai reserves the right to change pricing or credit requirements at any time, with notice provided via the Service.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">8. Intellectual Property</h2>
          <p>
            All content, software, and technology provided by Offerloop.ai remain our exclusive property, except for user-uploaded resumes.
          </p>
          <p>
            You may not copy, reproduce, modify, distribute, sell, or lease any part of our Service except as expressly permitted.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">9. Disclaimers</h2>
          <p>
            <strong>No Guarantee of Outcomes:</strong> Offerloop.ai provides tools to facilitate job searching, outreach, and connections. We do not guarantee any particular employment result, job offer, or response.
          </p>
          <p>
            <strong>Service Availability:</strong> We aim for continuous Service but do not guarantee uninterrupted access. Features may change, and we reserve the right to suspend or discontinue the Service at any time.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">10. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, Offerloop.ai and its affiliates, officers, employees, or agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses, resulting from:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Your use of or inability to use the Service;</li>
            <li>Any unauthorized access, use, or alteration of your transmissions or data;</li>
            <li>Any conduct or content of any third party on the Service.</li>
          </ul>
          <p>
            Our total liability in any matter arising out of or related to these Terms or the Service will not exceed the amount you have paid us in the past twelve months for the Service.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">11. Indemnification</h2>
          <p>
            You agree to defend, indemnify, and hold harmless Offerloop.ai and its affiliates from and against any claims, liabilities, damages, losses, and expenses (including legal fees) arising out of or in any way connected with your use of the Service or violation of these Terms.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">12. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your access to the Service at any time, without notice, if we believe you have violated these Terms or applicable law.
          </p>
          <p>
            You may terminate your account at any time by contacting us.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">13. Governing Law and Dispute Resolution</h2>
          <p>
            These Terms are governed by the laws of the State of Delaware, without regard to conflict of law principles.
          </p>
          <p>
            Any disputes arising from these Terms or the Service shall be resolved exclusively in the state or federal courts located in Delaware, USA, and you consent to their jurisdiction.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">14. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of material changes via email or through the Service. Your continued use of Offerloop.ai after changes become effective constitutes your acceptance of the revised Terms.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">15. Contact Information</h2>
          <p>
            If you have questions or concerns regarding these Terms, please contact us at:
          </p>
          <p>
            <strong>Email:</strong> [contact@pipelinepath.io]<br/>
            <strong>Address:</strong> [Insert Company Address]
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default TermsOfService;