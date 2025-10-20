// src/pages/Index.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Check, Send, Calendar, Handshake, BarChart, Users, Target, MessageSquare, TrendingUp, Zap, ArrowRight } from 'lucide-react';
import twoBillionImage from '@/assets/twobillion.jpeg';
import aiPersonalImage from '@/assets/Ai_Personal.jpeg';
import smartMatchingImage from '@/assets/SmartMatching.jpeg';
import topTierImage from '@/assets/TopTier.jpeg';
import analyticsImage from '@/assets/Analytics.jpeg';
import lockImg from "@/assets/lock.png";
import { Sparkles } from 'lucide-react';
import { BetaBadge } from '@/components/BetaBadges';

/** Reusable, professional CTA buttons for header + hero */
const CtaButtons: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const navigate = useNavigate();
  const pad = compact ? "px-4 py-2 text-sm" : "px-6 py-3 text-base";
  const radius = "rounded-2xl";
  const base =
    `inline-flex items-center justify-center ${pad} ${radius} font-semibold ` +
    `transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ` +
    `focus-visible:ring-blue-400 focus-visible:ring-offset-gray-900`;

  return (
    <div className={`flex items-center ${compact ? "gap-3" : "gap-4"}`}>
      {/* Secondary / Sign in */}
      <button
        onClick={() => navigate("/signin?mode=signin")}
        className={`${base} bg-gray-800/70 text-gray-100 hover:bg-gray-700/80 active:scale-[0.98] border border-gray-700/70 shadow-sm`}
      >
        Sign in
      </button>

      {/* Primary / Sign up */}
      <button
        onClick={() => navigate("/signin?mode=signup")}
        className={`${base} bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg shadow-blue-900/30 active:scale-[0.98]`}
      >
        Sign up with Google
        <ArrowRight className="ml-2 h-4 w-4" />
      </button>
    </div>
  );
};
// --- Closed Beta Section (compact) ---
const ClosedBetaStrip: React.FC = () => {
  return (
    <section
      id="beta"
      className="mt-8 px-6"  // REMOVED mx-auto and max-w-7xl
    >
      {/* Outer gradient border wrapper */}
      <div className="relative rounded-3xl p-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500">
        {/* Inner content with glass effect */}
        <div className="relative rounded-3xl bg-gray-800/60 backdrop-blur-xl border border-white/10">
          
          {/* wide glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-28 mx-auto h-80 w-full"  // Changed to w-full
            style={{
              background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2), rgba(217, 70, 239, 0.2), transparent)'
            }}
          />

          {/* USC emphasis row */}
          <div className="relative mb-5 flex flex-wrap items-center justify-center gap-2 pt-8">
            <span className="inline-flex items-center rounded-full bg-white text-gray-900 px-3 py-1 text-xs font-semibold">
              Closed Beta
            </span>
            <span className="text-xs text-slate-300">100 seats • 5 weeks</span>
            <span className="inline-flex items-center rounded-full border border-fuchsia-300/40 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold text-fuchsia-200">
              USC students prioritized
            </span>
          </div>

          {/* Headline + subhead */}
          <div className="relative mx-auto max-w-5xl text-center px-6">
            <h3 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-50">
              USC Closed Beta is live
            </h3>
            <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed">
              Validate Gmail-powered networking outreach and turn more conversations into offers—starting at USC.
              Small weekly admit batches to protect deliverability.
            </p>
          </div>

          {/* Primary actions */}
          <div className="relative mt-7 flex flex-wrap items-center justify-center gap-4 px-6">
            <button
              onClick={() => window.location.assign('/signin?mode=signup')}
              className="
                inline-flex items-center justify-center
                rounded-2xl px-7 py-3.5 text-base font-semibold text-white
                bg-gradient-to-r from-indigo-500 to-violet-500
                hover:from-indigo-600 hover:to-violet-600
                shadow-lg shadow-indigo-900/30 transition
              "
            >
              Join the USC Beta
            </button>
            <button
              onClick={() => window.location.assign('/signin?mode=signin')}
              className="
                inline-flex items-center justify-center
                rounded-2xl px-6 py-3.5 text-base font-semibold
                text-slate-100 border border-white/12
                bg-white/[0.03] hover:bg-white/[0.06] transition
              "
            >
              I have an invite code
            </button>
          </div>

          {/* Divider */}
          <div className="relative mx-auto my-12 h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />

          {/* --- How it works --- */}
          <div className="relative w-full px-6">  
            <h4 className="text-center text-[28px] md:text-3xl font-extrabold tracking-tight text-slate-50">
              How it works
            </h4>

            <ol className="mt-8 space-y-6 max-w-7xl mx-auto">  
              {[
                {
                  title: "Request Access",
                  sub: "Tell us your use case (USC admitted first).",
                  grad: "from-indigo-500 via-violet-500 to-fuchsia-500",
                  chip: "bg-indigo-500",
                },
                {
                  title: "Get an Invite",
                  sub: "We admit in small weekly batches.",
                  grad: "from-violet-500 via-fuchsia-500 to-indigo-500",
                  chip: "bg-violet-500",
                },
                {
                  title: "Start Sending",
                  sub: "Guided setup with a safe Gmail cap during beta.",
                  grad: "from-fuchsia-500 via-indigo-500 to-violet-500",
                  chip: "bg-fuchsia-500",
                },
              ].map(({ title, sub, grad, chip }, i) => (
                <li key={title} className="relative">
                  <div className={`rounded-2xl p-[1.5px] bg-gradient-to-r ${grad} shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]`}>
                    <div className="rounded-2xl bg-slate-900/70 backdrop-blur border border-white/10 px-7 py-6">
                      <div className="flex items-start gap-5">
                        <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-white text-sm font-bold">
                          <span className={`absolute inset-0 ${chip} blur-md opacity-70`} aria-hidden />
                          <span className="relative z-[1] rounded-full bg-white/10 h-10 w-10 grid place-items-center">
                            {i + 1}
                          </span>
                        </span>

                        <div className="min-w-0">
                          <h5 className="text-[18px] font-semibold tracking-tight text-slate-100">
                            {title}
                          </h5>
                          <p className="mt-1 text-sm text-slate-400 leading-relaxed">{sub}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* --- Benefits --- */}
          <div className="relative mt-12 grid w-full gap-8 px-6 max-w-7xl mx-auto">   
            {/* What you'll get */}
            <div className="rounded-3xl p-[1.5px] bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500">
              <div className="rounded-3xl bg-slate-900/70 backdrop-blur border border-white/10 p-7 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
                <h5 className="text-center text-sm font-semibold text-slate-100 mb-3 tracking-wide">
                  What you'll get
                </h5>
                <ul className="mx-auto max-w-[70ch] text-sm text-slate-300 leading-relaxed list-disc list-inside space-y-1.5">
                  <li>Guided onboarding tailored for USC workflows</li>
                  <li>Working Gmail outreach flow (no spray-and-pray)</li>
                  <li>Fast support + quick fixes from the core team</li>
                </ul>
              </div>
            </div>

            {/* What we ask */}
            <div className="rounded-3xl p-[1.5px] bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-violet-500">
              <div className="rounded-3xl bg-slate-900/70 backdrop-blur border border-white/10 p-7 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
                <h5 className="text-center text-sm font-semibold text-slate-100 mb-3 tracking-wide">
                  What we ask
                </h5>
                <ul className="mx-auto max-w-[70ch] text-sm text-slate-300 leading-relaxed list-disc list-inside space-y-1.5">
                  <li>Run a real outreach use case</li>
                  <li>Share quick feedback at key moments (1–2 min)</li>
                  <li>Be patient with small rough edges — we ship weekly</li>
                </ul>
              </div>
            </div>
          </div>

          {/* --- Micro FAQ + footnote --- */}
          <div className="relative mt-10 mb-8 text-center px-6 max-w-7xl mx-auto">
            <details className="text-sm text-slate-300 inline-block">
              <summary className="cursor-pointer text-slate-100/90 font-medium">Why a closed beta?</summary>
              <p className="mt-1 text-slate-400">
                We're validating reliability & deliverability in real student workflows before scaling beyond USC.
              </p>
            </details>
            <p className="mt-3 text-[12px] text-slate-400/90">
              Sending is available to Closed Beta users (100 seats). Request access to join a weekly batch.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
const Index = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const navigate = useNavigate();

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-900/90 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span 
                className="text-2xl font-bold text-white cursor-pointer"
                onClick={() => navigate("/")}
              >
                Offer<span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">loop</span>.ai
              </span>
               
              <span className="bg-white text-gray-900 text-xs font-semibold px-2 py-1 rounded-md">
                BETA
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
              <a 
                href="#about" 
                className="text-gray-300 hover:text-white transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                About
              </a>
            </nav>
          </div>
          {/* Header CTAs (compact) */}
          <div className="hidden md:flex items-center">
            <CtaButtons compact />
          </div>
        </div>
      </header>
 
      {/* Hero Section */}
      <section className="pt-32 pb-8 px-6" style={{ fontFamily: 'Nunito, sans-serif' }}>
        <div className="max-w-7xl mx-auto text-center">
          <div className="max-w-4xl mx-auto mb-8">
            <h1 className="text-6xl lg:text-8xl font-bold tracking-tight mb-12">
              Offerloop <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Fundamentally</span> changes how you recruit
              
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-10 leading-relaxed max-w-4xl mx-auto">
              We take the tedious, repetitive work out of recruiting. Spend less time stuck behind a screen and more time connecting with professionals and living your life.
            </p>

            {/* Hero CTAs */}
            <div className="flex items-center justify-center">
              <CtaButtons />
            </div>
            <ClosedBetaStrip />
          </div>
        </div>
      </section>

      {/* Smart Filter Section */}
      <section className="pt-8 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div>
              <h3 className="text-3xl font-bold mb-6 text-blue-400 flex items-center gap-3">
                2 Billion+ Professionals
                <BetaBadge size="xs" variant="outline" />
              </h3>
              <p className="text-xl text-gray-300 mb-8">
                Access the world's largest database of professional contacts with advanced filtering capabilities to find exactly who you're looking for.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-gray-300">Advanced search filters</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-gray-300">Real-time data updates</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-gray-300">Global coverage</span>
                </div>
              </div>
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-blue-500/30 bg-gradient-to-br from-gray-900 to-gray-800" style={{ height: '500px' }}>
              <img 
                src={twoBillionImage} 
                alt="Global professional network visualization" 
                className="w-full h-full object-contain p-4"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-transparent to-transparent flex items-end justify-center pb-8">
                <div className="text-center">
                  <div className="text-5xl font-bold text-white mb-2 drop-shadow-lg">2B+</div>
                  <div className="text-xl text-gray-200 drop-shadow-lg">Professional Contacts</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="relative rounded-2xl overflow-hidden border border-purple-500/30 bg-gradient-to-br from-gray-900 to-gray-800" style={{ height: '500px' }}>
              <img 
                src={aiPersonalImage} 
                alt="AI-powered personalization engine visualization" 
                className="w-full h-full object-contain p-4"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-transparent to-transparent flex items-end justify-center pb-8">
                <div className="text-center">
                  <div className="text-5xl font-bold text-white mb-2 drop-shadow-lg">AI Powered</div>
                  <div className="text-xl text-gray-200 drop-shadow-lg">Personalization Engine</div>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-3xl font-bold mb-6 text-purple-400 flex items-center gap-3">
                AI Personalizations
                <BetaBadge size="xs" variant="outline" />
              </h3>

              <p className="text-xl text-gray-300 mb-8">
                Maximize your response rate and recruitment success with hyper personalized emails curated to capture attention.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <span className="text-gray-300">Personalized email generation</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <span className="text-gray-300">Context-aware messaging</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <span className="text-gray-300">Higher response rates</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section id="features" className="py-20 px-6 bg-gray-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 flex items-center justify-center gap-3 flex-wrap">
              <span>Why Choose Offerloop.ai?</span>
              <BetaBadge size="sm" variant="subtle" />
            </h2>
            <p className="text-xl text-gray-300">
              Everything you need to streamline your recruiting process and land the best opportunities — in less time.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div>
              <h3 className="text-3xl font-bold mb-6 text-blue-400">Smart Matching</h3>
              <p className="text-xl text-gray-300 mb-8">
                Our AI-powered algorithm connects the right talent with the right opportunities based on skills, experience, and culture fit.
              </p>
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-gray-300">Skills-based matching</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    <span className="text-gray-300">Culture fit analysis</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-pink-500 rounded-full"></div>
                    <span className="text-gray-300">Experience alignment</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl p-8 backdrop-blur-sm border border-gray-700">
              <img 
                src={smartMatchingImage} 
                alt="Smart Matching visualization" 
                className="w-full h-64 object-contain rounded-xl"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl p-8 backdrop-blur-sm border border-gray-700 md:order-1">
              <img 
                src={topTierImage} 
                alt="Top-tier Mentorship visualization" 
                className="w-full h-64 object-contain rounded-xl"
              />
            </div>
            <div className="md:order-2">
              <h3 className="text-3xl font-bold mb-6 text-purple-400">Top-tier Mentorship</h3>
              <p className="text-xl text-gray-300 mb-8">
                Get counseling from top talent and professionals across multiple industries to maximize your opportunity at landing your dream job.
              </p>
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
                <p className="text-gray-300 italic">
                  "Connect with industry professionals who can guide you through the recruiting process and help you prepare for success."
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h3 className="text-3xl font-bold mb-6 text-green-400">Analytics & Insights</h3>
              <p className="text-xl text-gray-300 mb-8">
                Track your hiring metrics, measure success rates, and optimize your recruitment process with detailed analytics.
              </p>
              <div className="space-y-4">
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                  <span className="text-gray-300">Applications Sent</span>
                  <span className="text-green-400 text-lg font-bold">247</span>
                </div>
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                  <span className="text-gray-300">Response Rate</span>
                  <span className="text-blue-400 text-lg font-bold">34%</span>
                </div>
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                  <span className="text-gray-300">Interviews Scheduled</span>
                  <span className="text-purple-400 text-lg font-bold">12</span>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-500/20 to-blue-500/20 rounded-2xl p-8 backdrop-blur-sm border border-gray-700">
              <img 
                src={analyticsImage} 
                alt="Analytics & Insights visualization" 
                className="w-full h-64 object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">What Our Users Say</h2>
            <p className="text-xl text-gray-300">Join thousands of successful recruiters and job seekers</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-5 h-5 bg-yellow-400 rounded-full"></div>
                ))}
              </div>
              <p className="text-gray-300 mb-6 italic">
                "Offerloop.ai completely transformed our recruiting process. We're finding better candidates faster than ever before."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
                <div>
                  <div className="font-semibold">Sarah Johnson</div>
                  <div className="text-gray-400 text-sm">HR Director, TechCorp</div>
                </div>
              </div>
            </div>
            
            <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-5 h-5 bg-yellow-400 rounded-full"></div>
                ))}
              </div>
              <p className="text-gray-300 mb-6 italic">
                "The AI personalizations are incredible. Our response rates have increased by 300% since we started using Offerloop."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-500 rounded-full"></div>
                <div>
                  <div className="font-semibold">Michael Chen</div>
                  <div className="text-gray-400 text-sm">Talent Acquisition Lead</div>
                </div>
              </div>
            </div>
            
            <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-5 h-5 bg-yellow-400 rounded-full"></div>
                ))}
              </div>
              <p className="text-gray-300 mb-6 italic">
                "The mentorship program helped me land my dream job. The personalized guidance was invaluable."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                <div>
                  <div className="font-semibold">Emily Rodriguez</div>
                  <div className="text-gray-400 text-sm">Software Engineer</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Data Privacy Section */}
      <section className="relative py-28 bg-gradient-to-r from-[#0f0f1a] to-[#111827]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center md:space-x-16 px-6">
    
         {/* Icon without heavy gradient */}
         <div className="flex-shrink-0 mb-10 md:mb-0">
          <div className="w-40 h-40 flex items-center justify-center rounded-2xl bg-transparent shadow-lg">
            <img 
              src={lockImg} 
              alt="Data Privacy Lock Icon" 
              className="w-24 h-24 object-contain drop-shadow-[0_4px_12px_rgba(99,102,241,0.6)]" 
            />
         </div>
        </div>

    {/* Text */}
        <div className="text-center md:text-left">
          <h2 className="text-4xl font-extrabold mb-6 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            Your Privacy, Our Priority
          </h2>
          <p className="text-gray-300 leading-relaxed max-w-2xl text-lg">
            At Offerloop.ai, your data is yours — always. We never sell or share your information. 
            Authentication is handled securely through Google sign-in, and all data is encrypted 
            in transit and at rest. You can export or delete your information at any time, giving 
            you complete control and peace of mind.
          </p>
        </div>
      </div>
    </section>



      {/* About Us Section */}
      <section id="about" className="py-20 px-6 bg-gray-800/30">
        <div className="max-w-7xl mx-auto">
          {/* Our Mission */}
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-bold mb-8">
              About <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Offerloop.ai</span>
            </h2>
            
            <div className="mb-16">
              <h3 className="text-3xl font-bold mb-8 text-white">Our Mission</h3>
              <p className="text-xl text-gray-300 leading-relaxed max-w-5xl mx-auto">
                To give students a competitive edge in recruiting—helping them land the best opportunities while saving time for 
                what matters most. By combining advanced technology with human insight, we make it easy to cut through the 
                noise, focus on real connections, and build a career you're excited about.
              </p>
            </div>
          </div>

          {/* Value Proposition Cards */}
          <div className="grid md:grid-cols-3 gap-8 mb-20">
            <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-4 text-white">High-Impact Connections</h3>
              <p className="text-gray-300 leading-relaxed">
                We connect you directly with the professionals who matter, so every conversation moves you closer to your goals.
              </p>
            </div>
            
            <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-4 text-white">Innovation First</h3>
              <p className="text-gray-300 leading-relaxed">
                We continuously evolve our platform with the latest technology and industry insights.
              </p>
            </div>
            
            <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Handshake className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-4 text-white">Human Connection</h3>
              <p className="text-gray-300 leading-relaxed">
                Technology enhances, but human relationships remain at the heart of what we do.
              </p>
            </div>
          </div>

          {/* Our Story */}
          <div className="max-w-5xl mx-auto">
            <h3 className="text-3xl font-bold mb-8 text-center text-white">Our Story</h3>
            <div className="space-y-6 text-lg text-gray-300 leading-relaxed">
              <p>
                Offerloop.ai started as a simple idea between three college friends who felt the pain of recruiting firsthand. After 
                watching our classmates spend countless hours on applications—and coming up short ourselves—we realized the 
                process was broken. With hundreds of applicants for every role, we saw that the only real way in was through 
                genuine connections with people inside the companies.
              </p>
              <p>
                Like many students, we struggled to land internships, felt discouraged, and asked ourselves: why does recruiting 
                have to take so much time and effort? We wanted to make things better, not just for ourselves, but for everyone in 
                our shoes. So we started building a tool to automate the outreach process, helping students spend less time on 
                tedious tasks and more time on meaningful conversations.
              </p>
              <p>
                That's how Offerloop.ai (originally called RecruitEdge) was born: a platform built by students, for students, with 
                one goal—make it easier to connect, stand out, and land great opportunities.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center mt-16">
            <h3 className="text-3xl font-bold mb-6 text-white">Ready to Transform Your Recruiting Journey?</h3>
            <p className="text-xl text-gray-300 mb-8">
              Join thousands of aspiring professionals in discovering their dream opportunities through Offerloop.ai
            </p>
            <button 
              onClick={() => navigate("/signin?mode=signup")}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-8 py-4 rounded-2xl font-semibold text-lg transition-all transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-400 focus-visible:ring-offset-gray-900 shadow-lg shadow-blue-900/30"
            >
              Get Started Today
              <ArrowRight className="inline-block ml-2 h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6 bg-gray-800/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-gray-300">
              Have more questions? We're here to help!
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                question: "How does Offerloop.ai work?",
                answer: "Offerloop.ai streamlines your job search by automating applications, tracking responses, and connecting you with relevant opportunities. Our AI matches your profile with suitable positions and handles the repetitive tasks so you can focus on preparing for interviews."
              },
              {
                question: "What makes Offerloop.ai different?",
                answer: "We focus on quality over quantity. Instead of sending generic applications everywhere, we use smart matching to connect you with roles that truly fit your skills and career goals, resulting in higher response rates and better opportunities."
              },
              {
                question: "Is my data secure?",
                answer: "Absolutely. We use enterprise-grade security measures to protect your personal information and job search data. Your privacy is our top priority, and we never share your information without your explicit consent."
              },
              {
                question: "Can I cancel anytime?",
                answer: "Yes, you can cancel your subscription at any time. There are no long-term contracts or cancellation fees. Your access will continue until the end of your current billing period."
              }
            ].map((faq, index) => (
              <div key={index} className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 overflow-hidden">
                <button
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-700/30 transition-colors"
                  onClick={() => toggleFaq(index)}
                >
                  <span className="text-lg font-semibold">{faq.question}</span>
                  <ChevronDown 
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      openFaq === index ? 'rotate-180' : ''
                    }`} 
                  />
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-6">
                    <p className="text-gray-300 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 border-t border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-4 mb-8">
                <span className="text-2xl font-bold">
                  Offer<span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">loop</span>.ai
                </span>
              </div>
              
              <p className="text-gray-400 leading-relaxed mb-8">
                Fundamentally changing how you recruit by taking the tedious, repetitive work out of the process. 
                Connect with professionals and build the career you're excited about.
              </p>
              
              <div>
                <h4 className="font-semibold mb-4 text-white">Follow Us</h4>
                <div className="flex items-center gap-4">
                  <a href="#" className="w-12 h-12 bg-gray-700 hover:bg-blue-600 rounded-full flex items-center justify-center transition-colors group">
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
                    </svg>
                  </a>
                  <a href="#" className="w-12 h-12 bg-gray-700 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors group">
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </a>
                  <a href="#" className="w-12 h-12 bg-gray-700 hover:bg-blue-600 rounded-full flex items-center justify-center transition-colors group">
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </a>
                  <a href="#" className="w-12 h-12 bg-gray-700 hover:bg-purple-600 rounded-full flex items-center justify-center transition-colors group">
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.59-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4 text-white">Company</h3>
              <ul className="space-y-3 text-gray-400">
                <li><a href="#about" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="/careers" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="/blog" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="/press" className="hover:text-white transition-colors">Press</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4 text-white">Support</h3>
              <ul className="space-y-3 text-gray-400">
                <li><a href="/contact" className="hover:text-white transition-colors">Contact Us</a></li>
                <li><a href="/help" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 pt-8 text-center">
            <p className="text-gray-400">
              © {new Date().getFullYear()} Offerloop.ai. All rights reserved. Connecting talent with opportunity through intelligent recruiting solutions.
            </p>
          </div>
        </div>
      </footer>
      <div className="fixed bottom-6 right-6 z-50 animate-pulse">
        <div className="bg-gray-900/95 backdrop-blur-sm border-2 border-blue-400/50 rounded-full px-4 py-2 flex items-center gap-2 shadow-xl shadow-blue-500/30">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500 rounded-full blur-sm opacity-50"></div>
            <Sparkles className="relative h-4 w-4 text-blue-400" />
          </div>
          <span className="text-sm font-semibold text-blue-300">BETA</span>
        </div>
      </div>
    </div>
  );
};

export default Index;
