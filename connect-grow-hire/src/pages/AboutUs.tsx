import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { PageWrapper } from "@/components/PageWrapper";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Users, Lightbulb, Heart } from "lucide-react";

const AboutUs = () => {
  return (
    <PageWrapper>
      <Header />
      
      <main className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Back Button */}
          <div className="flex justify-start">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/home" className="flex items-center gap-2 text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 hover:text-blue-400">
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Link>
            </Button>
          </div>
          {/* Hero Section */}
          <div className="text-center space-y-6">
            <h1 className="text-display-lg text-white dark:text-white text-slate-900 dark:text-white">
              About <span className="gradient-text-teal">Offerloop</span>
            </h1>
          </div>

          {/* Mission Section */}
          <GlassCard className="p-8 rounded-2xl">
            <h2 className="text-2xl font-semibold mb-4 text-center text-white dark:text-white text-slate-900 dark:text-white">Our Mission</h2>
            <p className="text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 leading-relaxed text-center">
              To make it easier for students and young professionals to connect, stand out and land better opportunities. By cutting down the time to send emails and prep for calls by <strong>90%</strong>, we save our users hundreds of hours of work and stress, giving them back time to focus on what matters: learning, growing and enjoying your best years.
            </p>
          </GlassCard>

          {/* Values Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* High-Impact Connections */}
            <GlassCard className="text-center p-8 rounded-2xl hover:glow-teal transition-all duration-300">
              <div className="w-14 h-14 bg-blue-500/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-500/30">
                <Users className="h-7 w-7 text-blue-400" strokeWidth={2} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-white dark:text-white text-slate-900 dark:text-white">High-Impact Connections</h3>
              <p className="text-sm text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 leading-relaxed">
                We make it easier to reach the people that can move you forward.
              </p>
            </GlassCard>

            {/* Innovation First */}
            <GlassCard className="text-center p-8 rounded-2xl hover:glow-teal transition-all duration-300">
              <div className="w-14 h-14 bg-blue-500/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-500/30">
                <Lightbulb className="h-7 w-7 text-blue-500" strokeWidth={2} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-white dark:text-white text-slate-900 dark:text-white">Innovation First</h3>
              <p className="text-sm text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 leading-relaxed">
                We're constantly building and refining Offerloop with feedback from students and recruiters to make networking faster, smarter, and more personal.
              </p>
            </GlassCard>

            {/* Human Connection */}
            <GlassCard className="text-center p-8 rounded-2xl hover:glow-teal transition-all duration-300">
              <div className="w-14 h-14 bg-indigo-500/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-6 border border-indigo-500/30">
                <Heart className="h-7 w-7 text-indigo-500" strokeWidth={2} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-white dark:text-white text-slate-900 dark:text-white">Human Connection</h3>
              <p className="text-sm text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 leading-relaxed">
                AI makes things easier, but people make them meaningful. We keep human connection at the center of everything we create.
              </p>
            </GlassCard>
          </div>

          {/* Story Section */}
          <GlassCard className="p-8 rounded-2xl space-y-4">
              <h2 className="text-2xl font-semibold text-center mb-6 text-white dark:text-white text-slate-900 dark:text-white">Our Story</h2>
              <p className="text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 leading-relaxed">
                Offerloop is a platform built by students, for students and young professionals with one goal: to make it easier to connect with professionals, stand out, and land great opportunities.
              </p>
              <p className="text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 leading-relaxed">
                At USC, we saw countless students spending hours filling out spreadsheets and sending emails, and we went through the same thing ourselves. With so many applicants for every competitive role, networking is essential but the process is slow, stressful, and exhausting. Worst of all it takes away from what’s supposed to be the most exciting time of your life.
              </p>
              <p className="text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 leading-relaxed">
                We built Offerloop to fix that. Our platform automates the outreach process, helping students spend less time on tedious work and more time building real connections and preparing for what truly matters in their careers.
              </p>
          </GlassCard>

          {/* CTA Section */}
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold text-white dark:text-white text-slate-900 dark:text-white">Ready to Transform Your Recruiting Journey?</h2>
            <p className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400">
              Join thousands of aspiring professionals in discovering their dream opportunities through Offerloop.ai
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </PageWrapper>
  );
};

export default AboutUs;