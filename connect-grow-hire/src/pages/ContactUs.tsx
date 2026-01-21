import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AppHeader } from "@/components/AppHeader";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  Clock, 
  MessageCircle,
  Send,
  CheckCircle,
  X,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  MapPin,
  Building2,
  PenSquare,
  ExternalLink
} from "lucide-react";

const ContactUs = () => {
  const navigate = useNavigate();
  
  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const canSubmit = firstName && lastName && email && subject && message && message.length <= 1000;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    
    setIsSubmitting(true);
    setSubmittedEmail(email);
    
    // Simulate API call - replace with actual API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsSubmitting(false);
    setFormSubmitted(true);
    
    // Reset form
    setFirstName('');
    setLastName('');
    setEmail('');
    setSubject('');
    setMessage('');
  };

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

              {/* Header Section */}
              <div className="text-center mb-12 animate-fadeInUp" style={{ animationDelay: '50ms' }}>
                {/* Icon */}
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/30">
                  <MessageCircle className="w-8 h-8 text-white" />
                </div>
                
                <h1 className="text-4xl font-bold text-gray-900 mb-4">Contact Us</h1>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  Have questions about Offerloop? We'd love to hear from you. Send us a message and we'll respond within 1 business day.
                </p>
              </div>

              {/* Main Content - Two Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 animate-fadeInUp" style={{ animationDelay: '100ms' }}>
                
                {/* Left Column - Contact Form (3/5 width) */}
                <div className="lg:col-span-3">
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    {/* Gradient accent */}
                    <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-600"></div>
                    
                    <div className="p-8">
                      {/* Card Header */}
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                          <PenSquare className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-gray-900">Send us a message</h2>
                          <p className="text-sm text-gray-500">We'll get back to you as soon as possible</p>
                        </div>
                      </div>
                      
                      {/* Form */}
                      <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Name Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              First Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              placeholder="John"
                              required
                              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400
                                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none
                                         hover:border-gray-300 transition-all"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Last Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              placeholder="Doe"
                              required
                              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400
                                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none
                                         hover:border-gray-300 transition-all"
                            />
                          </div>
                        </div>
                        
                        {/* Email */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                              <Mail className="w-5 h-5 text-gray-400" />
                            </div>
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="john@example.com"
                              required
                              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400
                                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none
                                         hover:border-gray-300 transition-all"
                            />
                          </div>
                        </div>
                        
                        {/* Subject */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Subject <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <select
                              value={subject}
                              onChange={(e) => setSubject(e.target.value)}
                              required
                              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 appearance-none
                                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none
                                         hover:border-gray-300 transition-all cursor-pointer"
                            >
                              <option value="">Select a topic...</option>
                              <option value="general">General Inquiry</option>
                              <option value="support">Technical Support</option>
                              <option value="billing">Billing & Subscription</option>
                              <option value="feedback">Feedback & Suggestions</option>
                              <option value="partnership">Partnership Opportunities</option>
                              <option value="bug">Report a Bug</option>
                              <option value="other">Other</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                          </div>
                        </div>
                        
                        {/* Message */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Message <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                            placeholder="How can we help you?"
                            rows={5}
                            required
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 resize-none
                                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none
                                       hover:border-gray-300 transition-all"
                          />
                          <p className={`text-xs mt-2 text-right ${message.length >= 900 ? 'text-amber-500' : 'text-gray-400'}`}>
                            {message.length}/1000 characters
                          </p>
                        </div>
                        
                        {/* Submit Button */}
                        <button
                          type="submit"
                          disabled={isSubmitting || !canSubmit}
                          className={`
                            w-full py-4 rounded-xl font-semibold text-base
                            flex items-center justify-center gap-3
                            transition-all duration-200
                            ${!canSubmit || isSubmitting
                              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                              : 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-100'
                            }
                          `}
                        >
                          {isSubmitting ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send className="w-5 h-5" />
                              Send Message
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
                
                {/* Right Column - Contact Info (2/5 width) */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Get in Touch Card */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-6">Get in Touch</h3>
                      
                      <div className="space-y-4">
                        {/* Support Email */}
                        <a 
                          href="mailto:support@offerloop.ai"
                          className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-blue-50 hover:border-blue-200 border border-transparent transition-all group"
                        >
                          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                            <Mail className="w-6 h-6 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900">Support</p>
                            <p className="text-sm text-gray-500 group-hover:text-blue-600 transition-colors truncate">support@offerloop.ai</p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </a>
                        
                        {/* Phone */}
                        <a 
                          href="tel:+15036161981"
                          className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-green-50 hover:border-green-200 border border-transparent transition-all group"
                        >
                          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center group-hover:bg-green-200 transition-colors">
                            <Phone className="w-6 h-6 text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900">Phone</p>
                            <p className="text-sm text-gray-500 group-hover:text-green-600 transition-colors">(503) 616-1981</p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </a>
                        
                        {/* Response Time */}
                        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                            <Clock className="w-6 h-6 text-amber-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">Response Time</p>
                            <p className="text-sm text-gray-500">We typically reply within 1 business day</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Connect with Us Card */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Connect with Us</h3>
                      <p className="text-sm text-gray-500 mb-5">
                        Follow us for updates and insights about recruiting and career development.
                      </p>
                      
                      <div className="flex items-center gap-3">
                        {/* LinkedIn */}
                        <a 
                          href="https://linkedin.com/company/offerloop-ai"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-[#0077B5] hover:text-white text-gray-600 transition-all"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                          </svg>
                        </a>
                        
                        {/* Instagram */}
                        <a 
                          href="https://instagram.com/offerloop.ai"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gradient-to-br hover:from-purple-500 hover:via-pink-500 hover:to-orange-500 hover:text-white text-gray-600 transition-all"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                          </svg>
                        </a>
                        
                        {/* Twitter/X */}
                        <a 
                          href="https://twitter.com/offerloop"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-black hover:text-white text-gray-600 transition-all"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                        </a>
                        
                        {/* TikTok */}
                        <a 
                          href="https://tiktok.com/@offerloop"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-black hover:text-white text-gray-600 transition-all"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
                          </svg>
                        </a>
                      </div>
                    </div>
                  </div>
                  
                  {/* Quick Help Card */}
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border border-blue-100 overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                          <HelpCircle className="w-5 h-5 text-blue-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Quick Help</h3>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-4">
                        Find answers to common questions before reaching out.
                      </p>
                      
                      <div className="space-y-2">
                        <button 
                          onClick={() => navigate('/pricing')}
                          className="flex items-center justify-between w-full p-3 bg-white rounded-xl hover:shadow-sm transition-all group text-left"
                        >
                          <span className="text-sm text-gray-700 group-hover:text-blue-600">Pricing & Plans</span>
                          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                        </button>
                        
                        <button 
                          onClick={() => navigate('/about')}
                          className="flex items-center justify-between w-full p-3 bg-white rounded-xl hover:shadow-sm transition-all group text-left"
                        >
                          <span className="text-sm text-gray-700 group-hover:text-blue-600">About Offerloop</span>
                          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                        </button>
                        
                        <button 
                          onClick={() => navigate('/privacy')}
                          className="flex items-center justify-between w-full p-3 bg-white rounded-xl hover:shadow-sm transition-all group text-left"
                        >
                          <span className="text-sm text-gray-700 group-hover:text-blue-600">Privacy & Security</span>
                          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                </div>
              </div>

              {/* Location Section */}
              <section className="mt-12 animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-2">
                    {/* Map Placeholder */}
                    <div className="bg-gradient-to-br from-gray-100 to-gray-200 h-64 md:h-auto flex items-center justify-center">
                      <div className="text-center p-8">
                        <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">Map coming soon</p>
                      </div>
                      {/* When map is added: */}
                      {/* <iframe src="google-maps-embed-url" className="w-full h-full" /> */}
                    </div>
                    
                    {/* Location Info */}
                    <div className="p-8">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-blue-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Our Location</h3>
                      </div>
                      
                      <p className="text-gray-600 mb-4">
                        We're based in sunny Los Angeles, building the future of recruiting from the USC campus.
                      </p>
                      
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-gray-900 font-medium">University of Southern California</p>
                            <p className="text-sm text-gray-500">Los Angeles, CA 90007</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-6 pt-6 border-t border-gray-100">
                        <p className="text-sm text-gray-500">
                          💡 We're a remote-first team, but love meeting up for coffee in LA!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              
            </div>
          </main>
        </MainContentWrapper>
      </div>
      
      {/* Success Modal */}
      {formSubmitted && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeInUp">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl animate-scaleIn">
            {/* Close button */}
            <button 
              onClick={() => setFormSubmitted(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            
            <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">Message Sent!</h3>
            <p className="text-gray-600 text-center mb-6">
              Thanks for reaching out. We've received your message and will get back to you within 1 business day.
            </p>
            
            <div className="bg-blue-50 rounded-xl p-4 mb-6">
              <p className="text-sm text-blue-700 text-center">
                We've sent a confirmation to <span className="font-medium">{submittedEmail}</span>
              </p>
            </div>
            
            <button 
              onClick={() => setFormSubmitted(false)}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </SidebarProvider>
  );
};

export default ContactUs;
