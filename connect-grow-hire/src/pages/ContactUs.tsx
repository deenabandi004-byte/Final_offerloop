import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { PageWrapper } from "@/components/PageWrapper";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Phone, Linkedin, Instagram, Clock } from "lucide-react";

const ContactUs = () => {
  return (
    <PageWrapper>
      <Header />
      
      <main className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Back Button */}
          <div className="flex justify-start">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard" className="flex items-center gap-2 text-gray-300 text-slate-700 hover:text-blue-400">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Link>
            </Button>
          </div>

          {/* Hero Section */}
          <div className="text-center space-y-6">
            <h1 className="text-display-lg text-white text-slate-900">
              Contact <span className="gradient-text-teal">Us</span>
            </h1>
            <p className="text-xl text-gray-400 text-slate-600 leading-relaxed max-w-3xl mx-auto">
              Have questions about Offerloop.ai? We'd love to hear from you. Send us a message and we'll respond within 1 business day.
            </p>
          </div>

          <div className="max-w-2xl mx-auto space-y-6">
              {/* Direct Contact Info */}
              <GlassCard className="p-6 rounded-2xl">
                <h2 className="text-xl font-semibold mb-4 text-white text-slate-900">Get in touch</h2>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-blue-400" />
                    <div>
                      <p className="font-medium text-gray-300 text-slate-700">Support</p>
                      <a 
                        href="mailto:support@pipelinepath.io"
                        className="text-sm text-gray-400 text-slate-600 hover:text-blue-400 transition-colors"
                      >
                        support@pipelinepath.io
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-blue-400" />
                    <div>
                      <p className="font-medium text-gray-300 text-slate-700">Phone</p>
                      <p className="text-sm text-gray-400 text-slate-600">(503) 616-1981</p>
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Response Time */}
              <GlassCard className="p-6 rounded-2xl">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-blue-400" />
                  <div>
                    <p className="font-medium text-gray-300 text-slate-700">Response Time</p>
                    <p className="text-sm text-gray-400 text-slate-600">We typically reply within 1 business day</p>
                  </div>
                </div>
              </GlassCard>

              {/* Social Links */}
              <GlassCard className="p-6 rounded-2xl">
                <h2 className="text-xl font-semibold mb-4 text-white text-slate-900">Connect with us</h2>
                <div className="flex gap-4">
                  <Button variant="outline" size="icon" className="border-white/10 hover:border-blue-400/50 hover:bg-white/5" asChild>
                    <a href="https://linkedin.com/company/offerloop-ai" target="_blank" rel="noopener noreferrer">
                      <Linkedin className="h-4 w-4 text-gray-400 hover:text-blue-400" />
                    </a>
                  </Button>
                  <Button variant="outline" size="icon" className="border-white/10 hover:border-blue-400/50 hover:bg-white/5" asChild>
                    <a href="https://instagram.com/offerloop.ai" target="_blank" rel="noopener noreferrer">
                      <Instagram className="h-4 w-4 text-gray-400 hover:text-blue-400" />
                    </a>
                  </Button>
                </div>
                <p className="text-sm text-gray-400 text-slate-600 mt-4">
                  Follow us for updates and insights about recruiting and career development.
                </p>
              </GlassCard>
            </div>
        </div>
      </main>

      <Footer />
    </PageWrapper>
  );
};

export default ContactUs;