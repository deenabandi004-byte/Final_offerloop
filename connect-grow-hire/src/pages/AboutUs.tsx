import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AppHeader } from "@/components/AppHeader";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Lightbulb, Heart } from "lucide-react";

const AboutUs = () => {
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
              <h1 className="text-[28px] font-semibold text-gray-900 mb-8">
                About Offerloop
              </h1>

              {/* Mission Section */}
              <section className="mb-10">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
                  Our Mission
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  To make it easier for students and young professionals to connect, stand out and land better opportunities. By cutting down the time to send emails and prep for calls by <strong className="text-gray-900">90%</strong>, we save our users hundreds of hours of work and stress, giving them back time to focus on what matters: learning, growing and enjoying your best years.
                </p>
              </section>

              {/* Values Grid */}
              <section className="mb-10">
                <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-200">
                  Our Values
                </h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {/* High-Impact Connections */}
                  <div className="text-center p-6 border border-gray-200 rounded-lg">
                    <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Users className="h-6 w-6 text-blue-500" strokeWidth={2} />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">High-Impact Connections</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      We make it easier to reach the people that can move you forward.
                    </p>
                  </div>

                  {/* Innovation First */}
                  <div className="text-center p-6 border border-gray-200 rounded-lg">
                    <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Lightbulb className="h-6 w-6 text-blue-500" strokeWidth={2} />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Innovation First</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      We're constantly building and refining Offerloop with feedback from students and recruiters to make networking faster, smarter, and more personal.
                    </p>
                  </div>

                  {/* Human Connection */}
                  <div className="text-center p-6 border border-gray-200 rounded-lg">
                    <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Heart className="h-6 w-6 text-indigo-500" strokeWidth={2} />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Human Connection</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      AI makes things easier, but people make them meaningful. We keep human connection at the center of everything we create.
                    </p>
                  </div>
                </div>
              </section>

              {/* Story Section */}
              <section className="mb-10">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
                  Our Story
                </h2>
                <div className="space-y-4 text-gray-600 leading-relaxed">
                  <p>
                    Offerloop is a platform built by students, for students and young professionals with one goal: to make it easier to connect with professionals, stand out, and land great opportunities.
                  </p>
                  <p>
                    At USC, we saw countless students spending hours filling out spreadsheets and sending emails, and we went through the same thing ourselves. With so many applicants for every competitive role, networking is essential but the process is slow, stressful, and exhausting. Worst of all it takes away from what's supposed to be the most exciting time of your life.
                  </p>
                  <p>
                    We built Offerloop to fix that. Our platform automates the outreach process, helping students spend less time on tedious work and more time building real connections and preparing for what truly matters in their careers.
                  </p>
                </div>
              </section>

              {/* CTA Section */}
              <section className="text-center py-8 border-t border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Ready to Transform Your Recruiting Journey?
                </h2>
                <p className="text-gray-500 text-sm">
                  Join thousands of aspiring professionals in discovering their dream opportunities through Offerloop.
                </p>
              </section>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default AboutUs;
