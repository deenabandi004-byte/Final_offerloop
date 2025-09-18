import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import React from "react";
import { Upload, Download, Zap, Crown, ExternalLink, MessageCircle, ChevronRight, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import ScoutChatbot from "@/components/ScoutChatbot";
import LockedFeatureOverlay from "@/components/LockedFeatureOverlay";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { firebaseApi } from '../services/firebaseApi';
import { useFirebaseMigration } from '../hooks/useFirebaseMigration';
import { apiService, isErrorResponse } from "@/services/api";
import { CreditPill } from "@/components/credits";

const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001' 
  : 'https://www.offerloop.ai';

// UPDATED: Two tiers only - Free and Pro
const TIER_CONFIGS = {
  free: {
    maxContacts: 8,
    name: 'Free',
    credits: 120, // 8 contacts × 15 credits per contact
    description: 'Try out platform risk free - 8 contacts + Email drafts',
    coffeeChat: true, // Updated: Free now includes basic email drafting
    interviewPrep: false,
    timeSavedMinutes: 200,
    usesResume: false
  },
  pro: {
    maxContacts: 56,
    name: 'Pro',
    credits: 840, // 56 contacts × 15 credits per contact
    description: 'Everything in free plus advanced features - 56 contacts + Resume matching',
    coffeeChat: true,
    interviewPrep: true,
    timeSavedMinutes: 1200,
    usesResume: true
  }
};

const Home = () => {
  // Move the hook calls INSIDE the component
  const { user: firebaseUser, updateUser, updateCredits, checkCredits } = useFirebaseAuth();
  const { migrationComplete } = useFirebaseMigration();
  
  const currentUser = firebaseUser;
  const waveKeyframes = `
    @keyframes wave {
      0%, 100% { transform: rotate(-8deg); }
      50% { transform: rotate(8deg); }
    }
  `;

  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = waveKeyframes;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, [waveKeyframes]);

  const navigate = useNavigate();
  const { toast } = useToast();
  
  const effectiveUser = currentUser || {
    credits: 0,
    maxCredits: 0,
    name: 'User',
    email: 'user@example.com',
    tier: 'free' as const
  };
  
  // UPDATED: Default to 'free' tier
  const [userTier] = useState<'free' | 'pro'>(effectiveUser?.tier || 'free');
  
  // Form state
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [collegeAlumni, setCollegeAlumni] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [jobPostUrl, setJobPostUrl] = useState("");
  const [isScoutChatOpen, setIsScoutChatOpen] = useState(false);
  
  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [lastResults, setLastResults] = useState<any[]>([]);
  const [lastResultsTier, setLastResultsTier] = useState<'free' | 'pro' | string>('');
  const [lastSearchStats, setLastSearchStats] = useState<{successful_drafts: number; total_contacts: number} | null>(null);
  const hasResults = lastResults.length > 0;

  const currentTierConfig = TIER_CONFIGS[userTier];

  // Add credit refresh on mount
  useEffect(() => {
    if (firebaseUser && checkCredits) {
      checkCredits();
    }
  }, [firebaseUser]);

  // NEW: Function to retrieve user profile data from onboarding
  const getUserProfileData = async () => {
    if (!currentUser) return null;
    
    try {
      // Try Firebase first
      if (firebaseUser?.uid) {
        console.log('Fetching user profile from Firebase...');
        const professionalInfo = await firebaseApi.getProfessionalInfo(firebaseUser.uid);
        
        if (professionalInfo) {
          const userProfile = {
            name: `${professionalInfo.firstName || ''} ${professionalInfo.lastName || ''}`.trim() || currentUser.name || '',
            university: professionalInfo.university || '',
            major: professionalInfo.fieldOfStudy || '',
            year: professionalInfo.graduationYear || '',
            graduationYear: professionalInfo.graduationYear || '',
            degree: professionalInfo.currentDegree || '',
            careerInterests: professionalInfo.targetIndustries || []
          };
          console.log('Retrieved user profile from Firebase:', userProfile);
          return userProfile;
        }
      }
      
      // Fallback to localStorage
      console.log('Falling back to localStorage for user profile...');
      const professionalInfo = localStorage.getItem('professionalInfo');
      const resumeData = localStorage.getItem('resumeData');
      
      const prof = professionalInfo ? JSON.parse(professionalInfo) : {};
      const resume = resumeData ? JSON.parse(resumeData) : {};
      
      const userProfile = {
        name: `${prof.firstName || ''} ${prof.lastName || ''}`.trim() || resume.name || currentUser.name || '',
        university: prof.university || resume.university || '',
        major: prof.fieldOfStudy || resume.major || '',
        year: prof.graduationYear || resume.year || '',
        graduationYear: prof.graduationYear || resume.year || '',
        degree: prof.currentDegree || resume.degree || '',
        careerInterests: prof.targetIndustries || []
      };
      
      console.log('Retrieved user profile from localStorage:', userProfile);
      return userProfile;
      
    } catch (error) {
      console.error('Error retrieving user profile:', error);
      return null;
    }
  };

  // Auto-save function
  const autoSaveToDirectory = async (contacts: any[]) => {
    try {
      if (!currentUser || contacts.length === 0) return;
      
      const mapped = contacts.map(c => ({
        firstName: c.FirstName || '',
        lastName: c.LastName || '',
        linkedinUrl: c.LinkedIn || c.linkedinUrl || '',
        email: c.Email || c.WorkEmail || c.PersonalEmail || '',
        company: c.Company || '',
        jobTitle: c.Title || c.jobTitle || '',
        college: c.College || '',
        location: [c.City, c.State].filter(Boolean).join(', '),
        emailSubject: c.email_subject || '',
        emailBody: c.email_body || ''
      }));

      console.log('Auto-saving contacts to directory...');
      const result = await firebaseApi.bulkCreateContacts(currentUser.uid, mapped);
      
      console.log(`Auto-saved: Created ${result.created}, skipped ${result.skipped} duplicates`);
      return result;
      
    } catch (error) {
      console.error('Auto-save failed:', error);
      throw error;
    }
  };

  // Test backend connection on mount
  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then(res => res.json())
      .then(data => {
        console.log('Backend connected:', data);
        // Check if backend is using 2-tier system
        if (data.tiers && data.tiers.includes('free') && data.tiers.includes('pro')) {
          console.log('✅ Backend using Free/Pro tier system');
        }
      })
      .catch(err => {
        console.error('Backend connection failed:', err);
        toast({
          title: "Backend Connection Failed",
          description: "Please ensure the backend server is running on port 5001",
          variant: "destructive"
        });
      });
  }, [toast]);

  const handleSearch = async () => {
    if (!jobTitle.trim() || !location.trim()) {
      toast({
        title: "Missing Required Fields",
        description: "Please enter both job title and location.",
        variant: "destructive"
      });
      return;
    }

    // Check if user is authenticated for API calls
    if (!currentUser) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to search for contacts.",
        variant: "destructive"
      });
      navigate('/signin');
      return;
    }

    // Check credits before searching
    const currentCredits = await checkCredits();
    
    if (currentCredits < 15) {
      toast({
        title: "Insufficient Credits",
        description: `You have ${currentCredits} credits. You need at least 15 credits to search.`,
        variant: "destructive"
      });
      return;
    }

    // Validate resume for Pro tier
    if (userTier === 'pro' && !uploadedFile) {
      toast({
        title: "Resume Required",
        description: "Pro tier requires a resume upload for similarity matching.",
        variant: "destructive"
      });
      return;
    }

    setIsSearching(true);
    setProgressValue(0);
    
    try {
      // Animate progress
      const progressIntervals = [15, 35, 60, 85, 100];
      progressIntervals.forEach((value, index) => {
        setTimeout(() => setProgressValue(value), index * 600);
      });

      // NEW: Get user profile data
      const userProfile = await getUserProfileData();
      console.log('User profile for API request:', userProfile);

      // Use apiService for proper Firebase auth integration
      if (userTier === 'free') {
        const searchRequest = {
          jobTitle: jobTitle.trim(),
          company: company.trim() || '',
          location: location.trim(),
          saveToDirectory: false,
          userProfile: userProfile,
          careerInterests: userProfile?.careerInterests || []
        };

        console.log('Free tier search request with user profile:', searchRequest);

        // Get JSON response with emails included
        const result = await apiService.runFreeSearch(searchRequest);
        
        // Check if it's an error response
        if (isErrorResponse(result)) {
          if (result.error.includes('Insufficient credits')) {
            toast({
              title: "Insufficient Credits",
              description: result.error,
              variant: "destructive"
            });
            await checkCredits(); // Refresh credit display
            return;
          }
          // Handle other errors
          toast({
            title: "Search Failed",
            description: result.error,
            variant: "destructive"
          });
          return;
        }
        
        // Now TypeScript knows result is SearchResponse
        // Update credits based on contacts found
        const creditsUsed = result.contacts.length * 15;
        const newCredits = Math.max(0, currentCredits - creditsUsed);
        await updateCredits(newCredits);
        
        // Set results with email data included
        setLastResults(result.contacts);
        console.log('=== SEARCH RESULTS EMAIL DEBUG ===');
        result.contacts.forEach((contact, index) => {
          console.log(`Result ${index + 1}: ${contact.FirstName} ${contact.LastName}`);
          console.log('  email_subject:', contact.email_subject);
          console.log('  email_body:', contact.email_body ? contact.email_body.substring(0, 100) + '...' : 'null');
          console.log('---');
        });
        console.log('=== END SEARCH DEBUG ===');
        setLastResultsTier('free');
        setLastSearchStats({
          successful_drafts: result.successful_drafts,
          total_contacts: result.contacts.length
        });
        
        // AUTO-SAVE: Automatically save to contact library
        try {
          const saveResult = await autoSaveToDirectory(result.contacts);
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. ${newCredits} credits remaining.`
          });
        } catch (saveError) {
          // Show success but warn about save failure
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. (Warning: Failed to save to Contact Library)`,
            variant: "destructive"
          });
        }
        
      } else if (userTier === 'pro') {
        const proRequest = {
          jobTitle: jobTitle.trim(),
          company: company.trim() || '',
          location: location.trim(),
          resume: uploadedFile!,
          saveToDirectory: false,
          userProfile: userProfile,
          careerInterests: userProfile?.careerInterests || []
        };

        console.log('Pro tier search request with user profile:', proRequest);

        // Get JSON response with emails included
        const result = await apiService.runProSearch(proRequest);
        
        // Check if it's an error response
        if (isErrorResponse(result)) {
          if (result.error.includes('Insufficient credits')) {
            toast({
              title: "Insufficient Credits",
              description: result.error,
              variant: "destructive"
            });
            await checkCredits(); // Refresh credit display
            return;
          }
          // Handle other errors
          toast({
            title: "Search Failed",
            description: result.error,
            variant: "destructive"
          });
          return;
        }
        
        // Update credits based on contacts found
        const creditsUsed = result.contacts.length * 15;
        const newCredits = Math.max(0, currentCredits - creditsUsed);
        await updateCredits(newCredits);
        
        // Set results with email data included
        setLastResults(result.contacts);
        setLastResultsTier('pro');
        setLastSearchStats({
          successful_drafts: result.successful_drafts,
          total_contacts: result.contacts.length
        });
        
        // AUTO-SAVE: Automatically save to contact library
        try {
          const saveResult = await autoSaveToDirectory(result.contacts);
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. ${newCredits} credits remaining.`
          });
        } catch (saveError) {
          // Show success but warn about save failure
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. (Warning: Failed to save to Contact Library)`,
            variant: "destructive"
          });
        }
      }
      
    } catch (error) {
      console.error('Search failed:', error);
      toast({
        title: "Search Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
      setProgressValue(0);
    }
  };
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please upload a PDF smaller than 10MB.",
          variant: "destructive"
        });
        return;
      }
      setUploadedFile(file);
      toast({
        title: "Resume Uploaded",
        description: "Resume will be used for similarity matching in Pro tier."
      });
    } else {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF file.",
        variant: "destructive"
      });
    }
  };

  const handleCoffeeChatSubmit = () => {
    if (!linkedinUrl.trim()) {
      toast({
        title: "Missing LinkedIn URL",
        description: "Please enter a LinkedIn profile URL.",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Coffee Chat Prep Started",
      description: "Generating PDF with available LinkedIn information...",
    });
  };

  const handleInterviewPrepSubmit = () => {
    if (!jobPostUrl.trim()) {
      toast({
        title: "Missing Job Post URL",
        description: "Please enter a job posting URL.",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Interview Prep Started",
      description: "Generating PDF and prep materials...",
    });
  };

  const handleJobTitleSuggestion = (suggestedTitle: string) => {
    setJobTitle(suggestedTitle);
    toast({
      title: "Job Title Updated",
      description: `Set job title to "${suggestedTitle}"`,
    });
  };

  const searchButtonText = () => {
    if (isSearching) return 'Searching...';
    if (effectiveUser.credits < 15) return `Need ${15 - effectiveUser.credits} more credits`;
    const maxContacts = Math.min(currentTierConfig.maxContacts, Math.floor(effectiveUser.credits / 15));
    return `Search ${currentTierConfig.name} (Uses ~${maxContacts * 15} credits)`;
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-900 text-white">
        <AppSidebar />
        
        <div className={`flex-1 transition-all duration-300 ${isScoutChatOpen ? 'mr-80' : ''}`}>
          {/* Header */}
          <header className="h-16 flex items-center justify-between border-b border-gray-800 px-6 bg-gray-900/80 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-white hover:bg-gray-800/50" />
              <h1 className="text-xl font-semibold">AI-Powered Candidate Search</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <CreditPill credits={effectiveUser.credits ?? 0} max={effectiveUser.maxCredits ?? 120} />
              <Button
              size="sm"
              onClick={() => navigate('/pricing')}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
               Upgrade
              </Button>
            </div>
          </header>
          
          {/* Scout Chat Button */}
          <div className="px-8 pt-4">
            <div className="max-w-7xl mx-auto">
              <div 
                onClick={() => setIsScoutChatOpen(!isScoutChatOpen)}
                className="group cursor-pointer bg-gradient-to-r from-blue-500/10 to-purple-500/10 hover:from-blue-500/20 hover:to-purple-500/20 border border-blue-500/30 hover:border-blue-400/50 rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/20"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden animate-pulse" style={{ backgroundColor: '#fff6e2' }}>
                      <img 
                        src="/scout-mascot.png" 
                        alt="Scout AI" 
                        className="w-10 h-10 object-contain group-hover:scale-110 transition-transform duration-300"
                        style={{
                          animation: 'wave 2.5s ease-in-out infinite',
                          transformOrigin: 'center bottom'
                        }}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-blue-300 transition-colors">Talk to Scout</h3>
                      <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">Get help with job titles and search</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
                      {isScoutChatOpen ? 'Close' : 'Open'}
                    </div>
                    <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-full p-2 group-hover:from-blue-400 group-hover:to-purple-400 transition-all duration-300 group-hover:scale-110">
                      {isScoutChatOpen ? (
                        <ChevronRight className="h-5 w-5 text-white" />
                      ) : (
                        <ChevronLeft className="h-5 w-5 text-white" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <main className="p-8">
            <div className="max-w-7xl mx-auto">
              
              {/* Tier Display */}
              <div className="mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    {userTier === 'pro' && <Crown className="h-5 w-5 text-yellow-400" />}
                    <h2 className="text-2xl font-bold text-white">{currentTierConfig.name}</h2>
                  </div>
                  <Badge className="bg-gradient-to-r from-pink-500 to-purple-500 text-white border-0">
                    {currentTierConfig.credits} credits
                  </Badge>
                </div>
                
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                  <p className="text-sm text-gray-400">{currentTierConfig.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Estimated time saved: {currentTierConfig.timeSavedMinutes} minutes
                  </p>
                </div>
              </div>

              {/* Tab Navigation */}
              <Tabs defaultValue="find-candidates" className="mb-8">
                <TabsList className="grid w-full grid-cols-3 bg-gray-800/50 border border-gray-700">
                  <TabsTrigger 
                    value="find-candidates"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white text-gray-300 hover:text-white transition-all"
                  >
                    Professional Search
                  </TabsTrigger>
                  <TabsTrigger 
                    value="coffee-chat"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-blue-500 data-[state=active]:text-white text-gray-300 hover:text-white transition-all"
                  >
                    Coffee Chat Prep
                  </TabsTrigger>
                  <TabsTrigger 
                    value="interview-prep"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white text-gray-300 hover:text-white transition-all"
                  >
                    Interview Prep
                  </TabsTrigger>
                </TabsList>

                {/* Find Candidates Tab Content */}
                <TabsContent value="find-candidates" className="mt-6">
                  <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700">
                    <CardHeader className="border-b border-gray-700">
                      <CardTitle className="text-xl text-white">Professional Search</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      {/* Main Search Inputs with Autocomplete */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium mb-2 text-white">
                            Job Title <span className="text-red-400">*</span>
                          </label>
                          <AutocompleteInput
                            value={jobTitle}
                            onChange={setJobTitle}
                            placeholder="e.g., Software Engineer"
                            dataType="job_title"
                            disabled={isSearching}
                            className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-pink-500 hover:border-purple-400 transition-colors"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium mb-2 text-white">Company</label>
                          <AutocompleteInput
                            value={company}
                            onChange={setCompany}
                            placeholder="e.g., Google (optional)"
                            dataType="company"
                            disabled={isSearching}
                            className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-pink-500 hover:border-purple-400 transition-colors"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium mb-2 text-white">
                            Location <span className="text-red-400">*</span>
                          </label>
                          <AutocompleteInput
                            value={location}
                            onChange={setLocation}
                            placeholder="e.g., San Francisco, CA"
                            dataType="location"
                            disabled={isSearching}
                            className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-pink-500 hover:border-purple-400 transition-colors"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium mb-2 text-white">College Alumni</label>
                          <AutocompleteInput
                            value={collegeAlumni}
                            onChange={setCollegeAlumni}
                            placeholder="e.g., Stanford University (optional)"
                            dataType="school"
                            disabled={isSearching}
                            className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-pink-500 hover:border-purple-400 transition-colors"
                          />
                        </div>
                      </div>

                      {/* Resume Upload for Pro tier only */}
                      {userTier === 'pro' && (
                        <div className="mb-6">
                          <label className="block text-sm font-medium mb-2 text-white">
                            Resume <span className="text-red-400">*</span> (Required for Pro tier AI similarity matching)
                          </label>
                          <div className="border-2 border-dashed border-gray-600 rounded-lg p-4 text-center hover:border-purple-400 transition-colors bg-gray-800/30">
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={handleFileUpload}
                              className="hidden"
                              id="resume-upload"
                              disabled={isSearching}
                            />
                            <label htmlFor="resume-upload" className={`cursor-pointer ${isSearching ? 'opacity-50 cursor-not-allowed' : ''}`}>
                              <Upload className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                              <p className="text-sm text-gray-300 mb-1">
                                {uploadedFile ? uploadedFile.name : 'Upload resume for AI similarity matching (Required for Pro)'}
                              </p>
                              <p className="text-xs text-gray-400">PDF only, max 10MB</p>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Search Button - Updated with credit checking */}
                      <div className="flex items-center justify-between">
                        <Button 
                          onClick={handleSearch}
                          disabled={!jobTitle.trim() || !location.trim() || isSearching || (userTier === 'pro' && !uploadedFile) || effectiveUser.credits < 15}
                          size="lg"
                          className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-medium px-8 transition-all hover:scale-105"
                        >
                          {searchButtonText()}
                        </Button>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-sm text-gray-400">
                            <Download className="h-4 w-4 inline mr-2" />
                            Up to {currentTierConfig.maxContacts} contacts + emails (auto-saved to Contact Library)
                          </div>
                        </div>
                      </div>

                      {/* Results Summary */}
                      {hasResults && lastSearchStats && (
                        <div className="mt-4 p-3 bg-green-800/20 border border-green-600/30 rounded-lg">
                          <div className="text-sm text-green-300">
                            ✅ Found {lastResults.length} contacts from {lastResultsTier} tier search
                          </div>
                          <div className="text-xs text-green-400 mt-1">
                            📧 Generated {lastSearchStats.successful_drafts} personalized Gmail drafts
                          </div>
                          <div className="text-xs text-green-400 mt-1">
                            💾 Contacts automatically saved to your Contact Library
                          </div>
                        </div>
                      )}

                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Coffee Chat Prep Tab Content */}
                <TabsContent value="coffee-chat" className="mt-6">
                  <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700">
                    <CardHeader className="border-b border-gray-700">
                      <CardTitle className="text-xl text-white flex items-center gap-2">
                        Coffee Chat Prep
                        {currentTierConfig.coffeeChat && (
                          <Badge variant="outline" className="text-green-400 border-green-400">
                            Available
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      {currentTierConfig.coffeeChat ? (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-2 text-white">
                              LinkedIn Profile URL
                            </label>
                            <Input
                              value={linkedinUrl}
                              onChange={(e) => setLinkedinUrl(e.target.value)}
                              placeholder="https://linkedin.com/in/username"
                              className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-pink-500"
                            />
                          </div>
                          <p className="text-sm text-gray-400">
                            Generate a PDF with all available information from the LinkedIn profile to help you prepare for your coffee chat.
                          </p>
                          <Button
                            onClick={handleCoffeeChatSubmit}
                            disabled={!linkedinUrl.trim()}
                            className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Generate Coffee Chat PDF
                          </Button>
                        </div>
                      ) : (
                        <LockedFeatureOverlay featureName="Coffee Chat Prep" requiredTier="Free+">
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-2 text-white">
                                LinkedIn Profile URL
                              </label>
                              <Input
                                placeholder="https://linkedin.com/in/username"
                                className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400"
                                disabled
                              />
                            </div>
                            <p className="text-sm text-gray-400">
                              Generate a PDF with all available information from the LinkedIn profile.
                            </p>
                            <Button className="w-full" disabled>
                              <Download className="h-4 w-4 mr-2" />
                              Generate Coffee Chat PDF
                            </Button>
                          </div>
                        </LockedFeatureOverlay>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Interview Prep Tab Content */}
                <TabsContent value="interview-prep" className="mt-6">
                  <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700">
                    <CardHeader className="border-b border-gray-700">
                      <CardTitle className="text-xl text-white flex items-center gap-2">
                        Interview Prep
                        {currentTierConfig.interviewPrep && (
                          <Badge variant="outline" className="text-green-400 border-green-400">
                            Available
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      {currentTierConfig.interviewPrep ? (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-2 text-white">
                              Job Post URL
                            </label>
                            <Input
                              value={jobPostUrl}
                              onChange={(e) => setJobPostUrl(e.target.value)}
                              placeholder="https://company.com/jobs/position"
                              className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-pink-500"
                            />
                          </div>
                          <p className="text-sm text-gray-400">
                            Generate a PDF with job analysis and a separate prep section with materials to help you succeed in the interview.
                          </p>
                          <Button
                            onClick={handleInterviewPrepSubmit}
                            disabled={!jobPostUrl.trim()}
                            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Generate Interview Prep
                          </Button>
                        </div>
                      ) : (
                        <LockedFeatureOverlay featureName="Interview Prep" requiredTier="Pro">
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-2 text-white">
                                Job Post URL
                              </label>
                              <Input
                                placeholder="https://company.com/jobs/position"
                                className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400"
                                disabled
                              />
                            </div>
                            <p className="text-sm text-gray-400">
                              Generate a PDF with job analysis and prep materials.
                            </p>
                            <Button className="w-full" disabled>
                              <Download className="h-4 w-4 mr-2" />
                              Generate Interview Prep
                            </Button>
                          </div>
                        </LockedFeatureOverlay>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Search Progress */}
              {isSearching && (
                <Card className="mb-6 bg-gray-800/50 backdrop-blur-sm border-gray-700">
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">Searching with {currentTierConfig.name} tier...</span>
                        <span className="text-blue-400">{progressValue}%</span>
                      </div>
                      <Progress value={progressValue} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>

        {/* Scout Chatbot */}
        {isScoutChatOpen && (
          <div className="fixed right-0 top-0 h-full w-80 bg-gray-900 shadow-2xl z-40 border-l border-gray-700">
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-blue-500 to-purple-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden" style={{ backgroundColor: '#fff6e2' }}>
                      <img 
                        src="/scout-mascot.png" 
                        alt="Scout AI" 
                        className="w-8 h-8 object-contain"
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Scout AI</h3>
                      <p className="text-xs text-white/80">Job Title Assistant</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsScoutChatOpen(false)}
                    className="text-white/80 hover:text-white hover:bg-white/10"
                  >
                    ×
                  </Button>
                </div>
              </div>
              <div className="flex-1">
                <ScoutChatbot onJobTitleSuggestion={handleJobTitleSuggestion} />
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarProvider>
  );
};

export default Home;