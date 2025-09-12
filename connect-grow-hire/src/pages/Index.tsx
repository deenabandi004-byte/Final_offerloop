import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Check, Send, Calendar, Handshake, BarChart, Users, Target, MessageSquare, TrendingUp, Zap } from 'lucide-react';

const Index = () => {
  const [openFaq, setOpenFaq] = useState(null);
  const navigate = useNavigate();

  const toggleFaq = (index) => {
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
                onClick={() => navigate("/home")}
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
          <div className="flex items-center gap-6">
            <button 
              onClick={() => navigate("/signin")}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Sign In
            </button>
            <button 
              onClick={() => navigate("/onboarding/resume-upload")}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Sign Up
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="max-w-4xl mx-auto mb-24">
            <h1 className="text-6xl lg:text-8xl font-bold tracking-tight mb-12">
              Offerloop <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Fundamentally</span> changes how you recruit
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-300 mb-16 leading-relaxed max-w-4xl mx-auto">
              We take the tedious, repetitive work out of recruiting. Spend less time stuck behind a screen and more time connecting with professionals and living your life.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 hover:border-blue-500/50 transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mb-6 mx-auto">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Instant Outreach</h3>
              <p className="text-gray-400 leading-relaxed">
                Outreach in a single click - curated emails that show up instantly in your email drafts.
              </p>
            </div>
            
            <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 hover:border-purple-500/50 transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 mx-auto">
                <Calendar className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Personal Mentorship</h3>
              <p className="text-gray-400 leading-relaxed">
                Schedule calls with current analysts and analyst interns to better prepare for recruiting.
              </p>
            </div>
            
            <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 hover:border-purple-500/50 transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 mx-auto">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Meaningful Connections</h3>
              <p className="text-gray-400 leading-relaxed">
                Maximize your ability to get and prepare for coffee chats.
              </p>
            </div>

            <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 hover:border-orange-500/50 transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl flex items-center justify-center mb-6 mx-auto">
                <BarChart className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Progress Tracking</h3>
              <p className="text-gray-400 leading-relaxed">
                Monitor your recruitment pipeline with detailed analytics and insights to optimize your process.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Smart Filter Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Smart Filter
            </h2>
            <p className="text-xl text-gray-300">
              Access 2 billion+ professionals with intelligent filtering and AI-powered personalizations.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div>
              <h3 className="text-3xl font-bold mb-6 text-blue-400">2 Billion+ Professionals</h3>
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
            <div className="relative rounded-2xl overflow-hidden border border-blue-500/30">
              <img 
                src="/images/network-globe.jpg" 
                alt="Global professional network visualization" 
                className="w-full h-80 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent flex items-end justify-center pb-8">
                <div className="text-center">
                  <div className="text-4xl font-bold text-white mb-2">2B+</div>
                  <div className="text-lg text-gray-200">Professional Contacts</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="relative rounded-2xl overflow-hidden border border-purple-500/30">
              <img 
                src="/images/ai-personalization.png" 
                alt="AI-powered personalization engine visualization" 
                className="w-full h-80 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent flex items-end justify-center pb-8">
                <div className="text-center">
                  <div className="text-4xl font-bold text-white mb-2">AI Powered</div>
                  <div className="text-lg text-gray-200">Personalization Engine</div>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-3xl font-bold mb-6 text-purple-400">AI Personalizations</h3>
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
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Why Choose Offerloop.ai?
            </h2>
            <p className="text-xl text-gray-300">
              Everything you need to streamline your recruiting process and land the best opportunities – in less time.
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
              <div className="w-full h-64 bg-gray-700/50 rounded-xl flex items-center justify-center">
                <Users className="w-16 h-16 text-gray-400" />
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl p-8 backdrop-blur-sm border border-gray-700 md:order-1">
              <div className="w-full h-64 bg-gray-700/50 rounded-xl flex items-center justify-center">
                <MessageSquare className="w-16 h-16 text-gray-400" />
              </div>
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
              <div className="w-full h-64 bg-gray-700/50 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-16 h-16 text-gray-400" />
              </div>
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
                Offerloop.ai started as a simple idea between two college friends who felt the pain of recruiting firsthand. After 
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
              onClick={() => navigate("/onboarding/resume-upload")}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all transform hover:scale-105"
            >
              Get Started Today
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
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
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
              © 2024 Offerloop.ai. All rights reserved. Connecting talent with opportunity through intelligent recruiting solutions.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;