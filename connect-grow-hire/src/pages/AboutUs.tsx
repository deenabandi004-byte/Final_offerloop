import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AppHeader } from "@/components/AppHeader";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Users, 
  Lightbulb, 
  Heart, 
  Sparkles, 
  Rocket, 
  Star,
  BookOpen,
  Code,
  User,
  Camera
} from "lucide-react";

const AboutUs = () => {
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          
          <main className="bg-gradient-to-b from-slate-50 via-white to-blue-50 min-h-screen">
            <div className="max-w-5xl mx-auto px-6 py-10">
              
              {/* Back Navigation */}
              <div className="mb-8 animate-fadeInUp">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors group"
                >
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  <span className="font-medium">Back to Dashboard</span>
                </button>
              </div>

              {/* Hero Header */}
              <div className="text-center mb-16 animate-fadeInUp" style={{ animationDelay: '50ms' }}>
                {/* Logo Icon */}
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/30">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                
                <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                  About <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">Offerloop</span>
                </h1>
                
                <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                  Built by students, for students — making networking feel less like work and more like opportunity.
                </p>
              </div>

              {/* Mission Section */}
              <section className="mb-16 animate-fadeInUp" style={{ animationDelay: '100ms' }}>
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Gradient accent */}
                  <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-600"></div>
                  
                  <div className="p-8 md:p-12">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Rocket className="w-5 h-5 text-blue-600" />
                      </div>
                      <h2 className="text-2xl font-bold text-gray-900">Our Mission</h2>
                    </div>
                    
                    <div className="max-w-none">
                      <p className="text-lg text-gray-600 leading-relaxed">
                        To make it easier for students and young professionals to connect, stand out and land better opportunities. By cutting down the time to send emails and prep for calls by <span className="font-bold text-blue-600">90%</span>, we save our users hundreds of hours of work and stress, giving them back time to focus on what matters: learning, growing and enjoying your best years.
                      </p>
                    </div>
                    
                    {/* Stats highlight */}
                    <div className="grid grid-cols-3 gap-6 mt-8 pt-8 border-t border-gray-100">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-blue-600">90%</p>
                        <p className="text-sm text-gray-500 mt-1">Time saved on outreach</p>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-bold text-cyan-600">100+</p>
                        <p className="text-sm text-gray-500 mt-1">Hours given back</p>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-bold text-blue-600">1000s</p>
                        <p className="text-sm text-gray-500 mt-1">Connections made</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Values Section */}
              <section className="mb-16 animate-fadeInUp" style={{ animationDelay: '150ms' }}>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                    <Star className="w-5 h-5 text-purple-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Our Values</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* High-Impact Connections */}
                  <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group">
                    <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-blue-200 transition-colors">
                      <Users className="w-7 h-7 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">High-Impact Connections</h3>
                    <p className="text-gray-600 leading-relaxed">
                      We make it easier to reach the people that can move you forward. Quality over quantity, always.
                    </p>
                  </div>
                  
                  {/* Innovation First */}
                  <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md hover:border-cyan-200 transition-all group">
                    <div className="w-14 h-14 bg-cyan-100 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-cyan-200 transition-colors">
                      <Lightbulb className="w-7 h-7 text-cyan-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">Innovation First</h3>
                    <p className="text-gray-600 leading-relaxed">
                      We're constantly building and refining Offerloop with feedback from students and recruiters to make networking faster, smarter, and more personal.
                    </p>
                  </div>
                  
                  {/* Human Connection */}
                  <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md hover:border-purple-200 transition-all group">
                    <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-purple-200 transition-colors">
                      <Heart className="w-7 h-7 text-purple-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">Human Connection</h3>
                    <p className="text-gray-600 leading-relaxed">
                      AI makes things easier, but people make them meaningful. We keep human connection at the center of everything we create.
                    </p>
                  </div>
                </div>
              </section>

              {/* Founders Section */}
              <section className="mb-16 animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-amber-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Meet the Founders</h2>
                </div>
                
                <div className="bg-gradient-to-br from-blue-50 via-white to-cyan-50 rounded-3xl border border-gray-100 overflow-hidden">
                  <div className="p-8 md:p-12">
                    {/* Founders Photos */}
                    <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-10">
                      {/* Founder 1 */}
                      <div className="text-center">
                        <div className="w-40 h-40 bg-gradient-to-br from-gray-200 to-gray-300 rounded-3xl mb-4 mx-auto overflow-hidden shadow-lg">
                          {/* Placeholder for photo */}
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-16 h-16 text-gray-400" />
                          </div>
                          {/* When photo is added: */}
                          {/* <img src="/founders/sid.jpg" alt="Sid Pagariya" className="w-full h-full object-cover" /> */}
                        </div>
                        <h3 className="font-semibold text-gray-900 text-lg">Sid Pagariya</h3>
                        <p className="text-sm text-gray-500">Co-Founder & CEO</p>
                        <div className="flex items-center justify-center gap-3 mt-3">
                          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600 transition-colors">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                          </a>
                        </div>
                      </div>
                      
                      {/* Connection Line/Icon */}
                      <div className="hidden md:flex items-center">
                        <div className="w-16 h-0.5 bg-gradient-to-r from-blue-300 to-cyan-300"></div>
                        <div className="w-10 h-10 bg-white rounded-full border-2 border-blue-200 flex items-center justify-center mx-2">
                          <Sparkles className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="w-16 h-0.5 bg-gradient-to-r from-cyan-300 to-blue-300"></div>
                      </div>
                      
                      {/* Founder 2 */}
                      <div className="text-center">
                        <div className="w-40 h-40 bg-gradient-to-br from-gray-200 to-gray-300 rounded-3xl mb-4 mx-auto overflow-hidden shadow-lg">
                          {/* Placeholder for photo */}
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-16 h-16 text-gray-400" />
                          </div>
                          {/* When photo is added: */}
                          {/* <img src="/founders/cofounder.jpg" alt="Co-Founder Name" className="w-full h-full object-cover" /> */}
                        </div>
                        <h3 className="font-semibold text-gray-900 text-lg">Nick Wittig</h3>
                        <p className="text-sm text-gray-500">Co-Founder & CTO</p>
                        <div className="flex items-center justify-center gap-3 mt-3">
                          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600 transition-colors">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                          </a>
                        </div>
                      </div>
                    </div>
                    
                    {/* How We Met Story */}
                    <div className="max-w-3xl mx-auto">
                      <div className="flex items-center justify-center gap-2 mb-6">
                        <div className="h-px w-12 bg-gray-300"></div>
                        <span className="text-sm font-medium text-gray-400 uppercase tracking-wider">How We Met</span>
                        <div className="h-px w-12 bg-gray-300"></div>
                      </div>
                      
                      <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                        <p className="text-gray-600 leading-relaxed text-center italic">
                          "We met during our freshman year at USC in a crowded coffee shop, both frantically preparing for the same consulting club case competition. After comparing notes (and complaints about the networking grind), we realized we had the same frustration: why was reaching out to professionals so time-consuming and stressful?
                        </p>
                        <p className="text-gray-600 leading-relaxed text-center italic mt-4">
                          That conversation turned into late-night brainstorming sessions, which turned into a prototype, which turned into Offerloop. We built this because we needed it ourselves — and we knew thousands of other students did too."
                        </p>
                        <div className="flex items-center justify-center gap-2 mt-6">
                          <span className="text-sm text-gray-500">— Sid & Nick, Fall 2024</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Our Story Section */}
              <section className="mb-16 animate-fadeInUp" style={{ animationDelay: '250ms' }}>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Our Story</h2>
                </div>
                
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 md:p-12">
                  <div className="max-w-3xl">
                    <p className="text-lg text-gray-600 leading-relaxed mb-6">
                      Offerloop is a platform built by students, for students and young professionals with one goal: to make it easier to connect with professionals, stand out, and land great opportunities.
                    </p>
                    
                    <p className="text-lg text-gray-600 leading-relaxed mb-6">
                      At USC, we saw countless students spending hours filling out spreadsheets and sending emails, and we went through the same thing ourselves. With so many applicants for every competitive role, networking is essential but the process is slow, stressful, and exhausting. Worst of all it takes away from what's supposed to be the most exciting time of your life.
                    </p>
                    
                    <p className="text-lg text-gray-600 leading-relaxed">
                      We built Offerloop to fix that. Our platform automates the outreach process, helping students spend less time on tedious work and more time building real connections and preparing for what truly matters in their careers.
                    </p>
                  </div>
                  
                  {/* Timeline visual */}
                  <div className="mt-10 pt-10 border-t border-gray-100">
                    <div className="flex flex-col md:flex-row items-center justify-between max-w-2xl mx-auto gap-4 md:gap-0">
                      <div className="text-center">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <Lightbulb className="w-6 h-6 text-blue-600" />
                        </div>
                        <p className="text-sm font-semibold text-gray-900">Fall 2024</p>
                        <p className="text-xs text-gray-500">Idea born</p>
                      </div>
                      
                      <div className="hidden md:block flex-1 h-0.5 bg-gradient-to-r from-blue-200 via-cyan-200 to-green-200 mx-4"></div>
                      
                      <div className="text-center">
                        <div className="w-12 h-12 bg-cyan-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <Code className="w-6 h-6 text-cyan-600" />
                        </div>
                        <p className="text-sm font-semibold text-gray-900">Winter 2025</p>
                        <p className="text-xs text-gray-500">First prototype</p>
                      </div>
                      
                      <div className="hidden md:block flex-1 h-0.5 bg-gradient-to-r from-cyan-200 via-green-200 to-blue-200 mx-4"></div>
                      
                      <div className="text-center">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <Rocket className="w-6 h-6 text-green-600" />
                        </div>
                        <p className="text-sm font-semibold text-gray-900">Spring 2025</p>
                        <p className="text-xs text-gray-500">Beta launch</p>
                      </div>
                      
                      <div className="hidden md:block flex-1 h-0.5 bg-gradient-to-r from-green-200 via-blue-200 to-purple-200 mx-4"></div>
                      
                      <div className="text-center">
                        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <Sparkles className="w-6 h-6 text-purple-600" />
                        </div>
                        <p className="text-sm font-semibold text-gray-900">Now</p>
                        <p className="text-xs text-gray-500">Growing daily</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Team Photo Section */}
              <section className="mb-16 animate-fadeInUp" style={{ animationDelay: '300ms' }}>
                <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-3xl p-1">
                  <div className="bg-white rounded-[22px] p-8 md:p-12">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                      {/* Team Photo Placeholder */}
                      <div className="w-full md:w-1/2">
                        <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center overflow-hidden">
                          {/* Placeholder */}
                          <div className="text-center p-8">
                            <Camera className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-400 text-sm">Team photo coming soon</p>
                          </div>
                          {/* When photo is added: */}
                          {/* <img src="/team/team-photo.jpg" alt="The Offerloop Team" className="w-full h-full object-cover" /> */}
                        </div>
                      </div>
                      
                      {/* Text */}
                      <div className="w-full md:w-1/2">
                        <h3 className="text-2xl font-bold text-gray-900 mb-4">Built at USC, for students everywhere</h3>
                        <p className="text-gray-600 leading-relaxed mb-6">
                          What started as a side project in a dorm room has grown into a platform helping students across the country land their dream opportunities. We're still students ourselves, which means we understand the challenges firsthand.
                        </p>
                        <div className="flex items-center gap-4">
                          <div className="flex -space-x-3">
                            {/* Avatar placeholders */}
                            <div className="w-10 h-10 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center text-white text-sm font-semibold">S</div>
                            <div className="w-10 h-10 bg-cyan-500 rounded-full border-2 border-white flex items-center justify-center text-white text-sm font-semibold">N</div>
                            <div className="w-10 h-10 bg-purple-500 rounded-full border-2 border-white flex items-center justify-center text-white text-sm font-semibold">+</div>
                          </div>
                          <p className="text-sm text-gray-500">And growing...</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* CTA Section */}
              <section className="mb-10 animate-fadeInUp" style={{ animationDelay: '350ms' }}>
                <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-3xl p-8 md:p-12 text-center">
                  <h2 className="text-3xl font-bold text-white mb-4">
                    Ready to Transform Your Recruiting Journey?
                  </h2>
                  <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
                    Join thousands of aspiring professionals in discovering their dream opportunities through Offerloop.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <button 
                      onClick={() => navigate('/signup')}
                      className="px-8 py-4 bg-white text-blue-600 font-semibold rounded-full hover:shadow-lg hover:shadow-white/30 hover:scale-105 transition-all"
                    >
                      Get Started for Free
                    </button>
                    <button 
                      onClick={() => navigate('/dashboard')}
                      className="px-8 py-4 bg-blue-500/30 text-white font-semibold rounded-full border border-white/30 hover:bg-blue-500/50 transition-all"
                    >
                      Back to Dashboard
                    </button>
                  </div>
                  
                  {/* Trust badges */}
                  <div className="mt-10 pt-8 border-t border-white/20">
                    <p className="text-blue-100 text-sm mb-4">Trusted by students at</p>
                    <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8 opacity-80">
                      <span className="text-white/70 font-semibold">USC</span>
                      <span className="text-white/70 font-semibold">UCLA</span>
                      <span className="text-white/70 font-semibold">Stanford</span>
                      <span className="text-white/70 font-semibold">Berkeley</span>
                      <span className="text-white/70 font-semibold">+ more</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Footer */}
              <footer className="text-center py-8 border-t border-gray-100 animate-fadeInUp" style={{ animationDelay: '400ms' }}>
                <p className="text-gray-500 text-sm">
                  Made with ❤️ in Los Angeles
                </p>
                <div className="flex items-center justify-center gap-6 mt-4">
                  <button onClick={() => navigate('/privacy')} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Privacy Policy</button>
                  <button onClick={() => navigate('/terms')} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Terms of Service</button>
                  <a href="mailto:hello@offerloop.ai" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Contact</a>
                </div>
              </footer>
              
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default AboutUs;
