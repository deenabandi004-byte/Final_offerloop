import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Phone, Linkedin, Instagram, Clock } from "lucide-react";

const ContactUs = () => {
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          
          <main className="bg-white min-h-screen">
            <div className="max-w-3xl mx-auto px-8 pt-10 pb-8">
              {/* Back button - neutral styling */}
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 text-gray-600 text-sm mb-6 hover:scale-105 transition-transform"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </button>

              {/* Page Title */}
              <h1 className="text-[28px] font-semibold text-gray-900 mb-2">
                Contact Us
              </h1>
              <p className="text-gray-500 text-sm mb-8">
                Have questions about Offerloop? We'd love to hear from you. Send us a message and we'll respond within 1 business day.
              </p>

              {/* Get in Touch Section */}
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
                  Get in Touch
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 py-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                      <Mail className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Support</p>
                      <a 
                        href="mailto:support@pipelinepath.io"
                        className="text-sm text-gray-500 hover:text-blue-600 transition-colors"
                      >
                        support@pipelinepath.io
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 py-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                      <Phone className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Phone</p>
                      <p className="text-sm text-gray-500">(503) 616-1981</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 py-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                      <Clock className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Response Time</p>
                      <p className="text-sm text-gray-500">We typically reply within 1 business day</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Connect with Us Section */}
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
                  Connect with Us
                </h2>
                <div className="flex gap-3 mb-4">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="border-gray-300 hover:border-blue-400 hover:bg-blue-50" 
                    asChild
                  >
                    <a href="https://linkedin.com/company/offerloop-ai" target="_blank" rel="noopener noreferrer">
                      <Linkedin className="h-4 w-4 text-gray-600" />
                    </a>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="border-gray-300 hover:border-blue-400 hover:bg-blue-50" 
                    asChild
                  >
                    <a href="https://instagram.com/offerloop.ai" target="_blank" rel="noopener noreferrer">
                      <Instagram className="h-4 w-4 text-gray-600" />
                    </a>
                  </Button>
                </div>
                <p className="text-sm text-gray-500">
                  Follow us for updates and insights about recruiting and career development.
                </p>
              </section>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default ContactUs;
