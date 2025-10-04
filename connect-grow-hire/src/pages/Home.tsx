import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import React from "react";
import { Upload, Download, Crown, ChevronRight, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import ScoutChatbot from "@/components/ScoutChatbot";
import LockedFeatureOverlay from "@/components/LockedFeatureOverlay";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { firebaseApi } from "../services/firebaseApi";
import { useFirebaseMigration } from "../hooks/useFirebaseMigration";
import { apiService, isErrorResponse } from "@/services/api";
import { CreditPill } from "../components/credits";

const BACKEND_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:5001"
    : "https://www.offerloop.ai";

// Tiers (UI text only)
const TIER_CONFIGS = {
  free: {
    maxContacts: 3,  // Changed from 8
    minContacts: 1,  // NEW
    name: "Free",
    credits: 120,
    description: "Try out platform risk free - up to 3 contacts + Email drafts",
    coffeeChat: true,
    interviewPrep: false,
    timeSavedMinutes: 200,
    usesResume: false,
  },
  pro: {
    maxContacts: 8,  // Changed from 56
    minContacts: 1,  // NEW
    name: "Pro",
    credits: 840,
    description: "Everything in free plus advanced features - up to 8 contacts + Resume matching",
    coffeeChat: true,
    interviewPrep: true,
    timeSavedMinutes: 1200,
    usesResume: true,
  },
};

const Home = () => {
  const { user: firebaseUser, updateCredits, checkCredits } = useFirebaseAuth();
  const { migrationComplete } = useFirebaseMigration();
  const currentUser = firebaseUser;

  // cute wave anim for Scout image
  const waveKeyframes = `
    @keyframes wave {
      0%, 100% { transform: rotate(-8deg); }
      50% { transform: rotate(8deg); }
    }
  `;
  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = waveKeyframes;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, [waveKeyframes]);

  const navigate = useNavigate();
  const { toast } = useToast();

  const effectiveUser =
    currentUser || ({
      credits: 0,
      maxCredits: 0,
      name: "User",
      email: "user@example.com",
      tier: "free",
    } as const);

  // Resolve tier even if backend hasn't set user.tier yet
  const userTier: "free" | "pro" = React.useMemo(() => {
  // 1) explicit
    if (effectiveUser?.tier === "pro") return "pro";
  // 2) infer from allowances (treat >= 840 max as Pro)
    const max = Number(effectiveUser?.maxCredits ?? 0);
    const credits = Number(effectiveUser?.credits ?? 0);
    if (max >= 840 || credits > 120) return "pro";
  // 3) fall back
    return "free";
  }, [effectiveUser?.tier, effectiveUser?.maxCredits, effectiveUser?.credits]);


  // Form state
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [collegeAlumni, setCollegeAlumni] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [jobPostUrl, setJobPostUrl] = useState("");
  const [isScoutChatOpen, setIsScoutChatOpen] = useState(false);
  // Batch size state
const [batchSize, setBatchSize] = useState<number>(1);

// Calculate max batch size based on tier AND credits
const maxBatchSize = React.useMemo(() => {
  const tierMax = userTier === 'free' ? 3 : 8;
  const creditMax = Math.floor((effectiveUser.credits ?? 0) / 15);
  return Math.min(tierMax, creditMax);
}, [userTier, effectiveUser.credits]);

// Reset batch size when it exceeds new max
useEffect(() => {
  if (batchSize > maxBatchSize) {
    setBatchSize(Math.max(1, maxBatchSize));
  }
}, [maxBatchSize, batchSize]);

  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [searchComplete, setSearchComplete] = useState(false); // NEW STATE
  const [lastResults, setLastResults] = useState<any[]>([]);
  const [lastResultsTier, setLastResultsTier] = useState<"free" | "pro" | string>("");
  const [lastSearchStats, setLastSearchStats] = useState<{
    successful_drafts: number;
    total_contacts: number;
  } | null>(null);
  const hasResults = lastResults.length > 0;

  const currentTierConfig = TIER_CONFIGS[userTier];
  useEffect(() => {
    if (firebaseUser?.needsOnboarding) {
      navigate('/onboarding');
   }
  }, [firebaseUser, navigate]);

  // Refresh credits on mount
  useEffect(() => {
    if (firebaseUser && checkCredits) {
      checkCredits();
    }
  }, [firebaseUser]);

  // Build a minimal user profile from onboarding/local storage
  const getUserProfileData = async () => {
    if (!currentUser) return null;
    try {
      if (firebaseUser?.uid) {
        const professionalInfo = await firebaseApi.getProfessionalInfo(firebaseUser.uid);
        if (professionalInfo) {
          const userProfile = {
            name:
              `${professionalInfo.firstName || ""} ${professionalInfo.lastName || ""}`.trim() ||
              currentUser.name ||
              "",
            university: professionalInfo.university || "",
            major: professionalInfo.fieldOfStudy || "",
            year: professionalInfo.graduationYear || "",
            graduationYear: professionalInfo.graduationYear || "",
            degree: professionalInfo.currentDegree || "",
            careerInterests: professionalInfo.targetIndustries || [],
          };
          return userProfile;
        }
      }
      const professionalInfo = localStorage.getItem("professionalInfo");
      const resumeData = localStorage.getItem("resumeData");
      const prof = professionalInfo ? JSON.parse(professionalInfo) : {};
      const resume = resumeData ? JSON.parse(resumeData) : {};
      const userProfile = {
        name:
          `${(prof.firstName || "")} ${(prof.lastName || "")}`.trim() ||
          resume.name ||
          currentUser.name ||
          "",
        university: prof.university || resume.university || "",
        major: prof.fieldOfStudy || resume.major || "",
        year: prof.graduationYear || resume.year || "",
        graduationYear: prof.graduationYear || resume.year || "",
        degree: prof.currentDegree || resume.degree || "",
        careerInterests: prof.targetIndustries || [],
      };
      return userProfile;
    } catch {
      return null;
    }
  };

  // Auto-save to contact library (Firebase)
  const autoSaveToDirectory = async (contacts: any[]) => {
    try {
      if (!currentUser || contacts.length === 0) return;
      const mapped = contacts.map((c) => ({
        firstName: c.FirstName || "",
        lastName: c.LastName || "",
        linkedinUrl: c.LinkedIn || c.linkedinUrl || "",
        email: c.Email || c.WorkEmail || c.PersonalEmail || "",
        company: c.Company || "",
        jobTitle: c.Title || c.jobTitle || "",
        college: c.College || "",
        location: [c.City, c.State].filter(Boolean).join(", "),
        emailSubject: c.email_subject || "",
        emailBody: c.email_body || "",
      }));
      await firebaseApi.bulkCreateContacts(currentUser.uid, mapped);
    } catch (error) {
      console.error("Auto-save failed:", error);
      throw error;
    }
  };

  // Backend health check (optional)
  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then((res) => res.json())
      .then((data) => {
        if (data.tiers && data.tiers.includes("free") && data.tiers.includes("pro")) {
          console.log("✅ Backend using Free/Pro tier system");
        }
      })
      .catch(() => {
        toast({
          title: "Backend Connection Failed",
          description: "Please ensure the backend server is running on port 5001",
          variant: "destructive",
        });
      });
  }, [toast]);

  const handleSearch = async () => {
    if (!jobTitle.trim() || !location.trim()) {
      toast({
        title: "Missing Required Fields",
        description: "Please enter both job title and location.",
        variant: "destructive",
      });
      return;
    }

    if (!currentUser) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to search for contacts.",
        variant: "destructive",
      });
      navigate("/signin");
      return;
    }

    const currentCredits = await checkCredits();
    if (currentCredits < 15) {
      toast({
        title: "Insufficient Credits",
        description: `You have ${currentCredits} credits. You need at least 15 credits to search.`,
        variant: "destructive",
      });
      return;
    }

    if (userTier === "pro" && !uploadedFile) {
      toast({
        title: "Resume Required",
        description: "Pro tier requires a resume upload for similarity matching.",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setProgressValue(0);
    setSearchComplete(false); // Reset completion state

    try {
      // Progress animation - make it reach 90% then wait
      [15, 35, 60, 85, 90].forEach((value, index) => {
        setTimeout(() => setProgressValue(value), index * 600);
      });

      const userProfile = await getUserProfileData();

      if (userTier === "free") {
        const searchRequest = {
          jobTitle: jobTitle.trim(),
          company: company.trim() || "",
          location: location.trim(),
          saveToDirectory: false,
          userProfile,
          careerInterests: userProfile?.careerInterests || [],
          collegeAlumni: (collegeAlumni || '').trim(),
          batchSize: batchSize,
        };
        console.log('Sending search request with batchSize:', batchSize)
        const result = await apiService.runFreeSearch(searchRequest);
        if (isErrorResponse(result)) {
          if (result.error?.includes("Insufficient credits")) {
            toast({
              title: "Insufficient Credits",
              description: result.error,
              variant: "destructive",
            });
            await checkCredits();
            return;
          }
          toast({
            title: "Search Failed",
            description: result.error || "Please try again.",
            variant: "destructive",
          });
          return;
        }

        const creditsUsed = result.contacts.length * 15;
        const newCredits = Math.max(0, currentCredits - creditsUsed);
        await updateCredits(newCredits);

        setLastResults(result.contacts);
        setLastResultsTier("free");
        setLastSearchStats({
          successful_drafts: result.successful_drafts,
          total_contacts: result.contacts.length,
        });

        // Mark as complete and show success
        setProgressValue(100);
        setSearchComplete(true);

        try {
          await autoSaveToDirectory(result.contacts);
          toast({
            title: "✅ Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. ${newCredits} credits remaining.`,
            duration: 5000,
          });
        } catch {
          toast({
            title: "✅ Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. (Warning: Failed to save to Contact Library)`,
            variant: "destructive",
            duration: 5000,
          });
        }
      } else if (userTier === "pro") {
        const proRequest = {
          jobTitle: jobTitle.trim(),
          company: company.trim() || "",
          location: location.trim(),
          resume: uploadedFile!,
          saveToDirectory: false,
          userProfile,
          careerInterests: userProfile?.careerInterests || [],
          collegeAlumni: (collegeAlumni || '').trim(),
          batchSize: batchSize,
        };

        const result = await apiService.runProSearch(proRequest);
        if (isErrorResponse(result)) {
          if (result.error?.includes("Insufficient credits")) {
            toast({
              title: "Insufficient Credits",
              description: result.error,
              variant: "destructive",
            });
            await checkCredits();
            return;
          }
          toast({
            title: "Search Failed",
            description: result.error || "Please try again.",
            variant: "destructive",
          });
          return;
        }

        const creditsUsed = result.contacts.length * 15;
        const newCredits = Math.max(0, currentCredits - creditsUsed);
        await updateCredits(newCredits);

        setLastResults(result.contacts);
        setLastResultsTier("pro");
        setLastSearchStats({
          successful_drafts: result.successful_drafts,
          total_contacts: result.contacts.length,
        });

        // Mark as complete and show success
        setProgressValue(100);
        setSearchComplete(true);

        try {
          await autoSaveToDirectory(result.contacts);
          toast({
            title: "✅ Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. ${newCredits} credits remaining.`,
            duration: 5000,
          });
        } catch {
          toast({
            title: "✅ Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. (Warning: Failed to save to Contact Library)`,
            variant: "destructive",
            duration: 5000,
          });
        }
      }
    } catch (error) {
      console.error("Search failed:", error);
      toast({
        title: "❌ Search Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
        duration: 5000,
      });
      setSearchComplete(false);
    } finally {
      setIsSearching(false);
      // Keep showing 100% for 2 seconds if successful
      if (searchComplete) {
        setTimeout(() => {
          setProgressValue(0);
          setSearchComplete(false);
        }, 2000);
      } else {
        setTimeout(() => setProgressValue(0), 500);
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please upload a PDF smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }
      setUploadedFile(file);
      toast({
        title: "Resume Uploaded",
        description: "Resume will be used for similarity matching in Pro tier.",
      });
    } else {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
    }
  };

  const handleCoffeeChatSubmit = () => {
    if (!linkedinUrl.trim()) {
      toast({
        title: "Missing LinkedIn URL",
        description: "Please enter a LinkedIn profile URL.",
        variant: "destructive",
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
        variant: "destructive",
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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-900 text-white">
        <AppSidebar />

        <div className={`flex-1 transition-all duration-300 ${isScoutChatOpen ? "mr-80" : ""}`}>
          {/* Header */}
          <header className="h-16 flex items-center justify-between border-b border-gray-800 px-6 bg-gray-900/80 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-white hover:bg-gray-800/50" />
              <h1 className="text-xl font-semibold">AI-Powered Candidate Search</h1>
            </div>

            {/* Top-right: Credits pill + Upgrade */}
            <div className="flex items-center gap-4">
              <CreditPill
                credits={effectiveUser.credits ?? 0}
                max={effectiveUser.maxCredits ?? 120}
              />
              <Button
                size="sm"
                onClick={() => navigate("/pricing")}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
                Upgrade
              </Button>
            </div>
          </header>

          {/* Scout Chat Shortcut */}
          <div className="px-8 pt-4">
            <div className="max-w-7xl mx-auto">
              <div
                onClick={() => setIsScoutChatOpen(!isScoutChatOpen)}
                className="group cursor-pointer bg-gradient-to-r from-blue-500/10 to-purple-500/10 hover:from-blue-500/20 hover:to-purple-500/20 border border-blue-500/30 hover:border-blue-400/50 rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/20"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden animate-pulse"
                      style={{ backgroundColor: "#fff6e2" }}
                    >
                      <img
                        src="/scout-mascot.png"
                        alt="Scout AI"
                        className="w-10 h-10 object-contain group-hover:scale-110 transition-transform duration-300"
                        style={{
                          animation: "wave 2.5s ease-in-out infinite",
                          transformOrigin: "center bottom",
                        }}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-blue-300 transition-colors">
                        Talk to Scout
                      </h3>
                      <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                        Get help with job titles and search
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
                      {isScoutChatOpen ? "Close" : "Open"}
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
              {/* Tier header */}
              <div className="mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    {userTier === "pro" && <Crown className="h-5 w-5 text-yellow-400" />}
                    <h2 className="text-2xl font-bold text-white">{currentTierConfig.name}</h2>
                  </div>

                  {/* Dynamic credits pill instead of fixed badge */}
                  <CreditPill
                    credits={effectiveUser.credits ?? 0}
                    max={effectiveUser.maxCredits ?? 120}
                  />
                </div>

                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                  <p className="text-sm text-gray-400">{currentTierConfig.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Estimated time saved: {currentTierConfig.timeSavedMinutes} minutes
                  </p>
                </div>
              </div>

              {/* Tabs */}
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

                {/* Find Candidates */}
                <TabsContent value="find-candidates" className="mt-6">
                  <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700">
                    <CardHeader className="border-b border-gray-700">
                      <CardTitle className="text-xl text-white">Professional Search</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
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
                          <label className="block text-sm font-medium mb-2 text-white">
                            College Alumni
                          </label>
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
                      {/* Batch Size Slider */}
                     
                      {/* Batch Size Slider - Premium Design with Thicker Track */}
                      <div className="col-span-1 lg:col-span-2 mt-4">
                        <label className="block text-sm font-medium mb-4 text-white">
                          Batch Size
                        </label>
                        
                        <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50 shadow-lg">
                          <div className="flex items-center gap-6">
                            {/* Current value display */}
                            <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-400/40 rounded-xl px-4 py-3 min-w-[70px] text-center shadow-inner">
                              <span className="text-2xl font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                                {batchSize}
                              </span>
                            </div>
                            
                            {/* Slider container with more top padding */}
                            <div className="flex-1 max-w-[320px] pt-4">
                              <div className="relative">
                                <input
                                  type="range"
                                  min="1"
                                  max={maxBatchSize}
                                  value={batchSize}
                                  onChange={(e) => setBatchSize(Number(e.target.value))}
                                  disabled={isSearching || maxBatchSize < 1}
                                  className="w-full h-3 bg-gray-700/50 rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed 
                                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 
                                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                                    [&::-webkit-slider-thumb]:shadow-[0_0_20px_rgba(168,85,247,0.6)] 
                                    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-purple-400
                                    [&::-webkit-slider-thumb]:hover:shadow-[0_0_25px_rgba(168,85,247,0.8)] 
                                    [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-200
                                    [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 
                                    [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white
                                    [&::-moz-range-thumb]:shadow-[0_0_20px_rgba(168,85,247,0.6)] 
                                    [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-purple-400"
                                  style={{
                                    background: `linear-gradient(to right, 
                                      rgba(168, 85, 247, 0.8) 0%, 
                                      rgba(219, 39, 119, 0.8) ${((batchSize - 1) / (maxBatchSize - 1)) * 100}%, 
                                      rgba(55, 65, 81, 0.3) ${((batchSize - 1) / (maxBatchSize - 1)) * 100}%, 
                                      rgba(55, 65, 81, 0.3) 100%)`
                                  }}
                                />
                                
                                {/* Min/Max labels */}
                                <div className="flex justify-between text-xs text-gray-500 mt-3 font-medium">
                                  <span>1</span>
                                  <span>{maxBatchSize}</span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Credits display - single line */}
                            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl px-4 py-3 min-w-[100px] border border-purple-400/20">
                              <div className="text-center">
                                <span className="text-xl font-bold text-purple-300">{batchSize * 15}</span>
                                <span className="text-sm text-gray-400 ml-2">credits</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Warning if limited by credits */}
                        {maxBatchSize < (userTier === 'free' ? 3 : 8) && (
                          <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                            <p className="text-xs text-yellow-400 flex items-start gap-2">
                              <span>⚠️</span>
                              <span>Limited by available credits. Maximum: {maxBatchSize} contacts.</span>
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Credit Usage Info - Separate from slider */}
                      <div className="col-span-1 lg:col-span-2 mt-6 mb-8">
                        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300">
                              Will use: <span className="font-semibold text-white">{batchSize}</span> contact{batchSize !== 1 ? 's' : ''}
                            </span>
                            <span className="text-sm text-purple-400 font-semibold">
                              {batchSize * 15} credits
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Resume upload (Pro only) */}
                      {userTier === "pro" && (
                        <div className="mb-6">
                          <label className="block text-sm font-medium mb-2 text-white">
                            Resume <span className="text-red-400">*</span> (Required for Pro tier AI
                            similarity matching)
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
                            <label
                              htmlFor="resume-upload"
                              className={`cursor-pointer ${
                                isSearching ? "opacity-50 cursor-not-allowed" : ""
                              }`}
                            >
                              <Upload className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                              <p className="text-sm text-gray-300 mb-1">
                                {uploadedFile
                                  ? uploadedFile.name
                                  : "Upload resume for AI similarity matching (Required for Pro)"}
                              </p>
                              <p className="text-xs text-gray-400">PDF only, max 10MB</p>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Search Button - now tier-aware label & math */}
                      {/* Search Button and Info */}
                      <div className="space-y-4">
                        <Button
                          onClick={handleSearch}
                          disabled={
                            !jobTitle.trim() ||
                            !location.trim() ||
                            isSearching ||
                            (userTier === "pro" && !uploadedFile) ||
                            (effectiveUser.credits ?? 0) < 15
                          }
                          size="lg"
                          className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-medium px-8 transition-all hover:scale-105"
                        >
                          {isSearching ? "Searching..." : `Search ${currentTierConfig.name} Tier`}
                        </Button>

                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <div className="flex items-center gap-2">
                            <Download className="h-4 w-4" />
                            <span>Up to {currentTierConfig.maxContacts} contacts + emails</span>
                          </div>
                          <span className="text-gray-600">•</span>
                          <span>Auto-saved to Contact Library</span>
                        </div>
                      </div>

                      {/* Enhanced Results Summary */}
                      {hasResults && lastSearchStats && (
                        <div className="mt-4 p-4 bg-gradient-to-r from-green-800/30 to-blue-800/30 border-2 border-green-500/50 rounded-lg">
                          <div className="text-base font-semibold text-green-300 mb-2">
                            ✅ Search Completed Successfully!
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-3">
                            <div className="bg-gray-800/50 rounded p-2">
                              <div className="text-2xl font-bold text-white">{lastResults.length}</div>
                              <div className="text-xs text-gray-400">Contacts Found</div>
                            </div>
                            <div className="bg-gray-800/50 rounded p-2">
                              <div className="text-2xl font-bold text-white">{lastResults.length}</div>
                              <div className="text-xs text-gray-400">Email Drafts</div>
                            </div>
                          </div>
                          <div className="text-sm text-blue-300 mt-3 flex items-center">
                            <span className="mr-2">💾</span>
                            All contacts saved to your Contact Library
                          </div>
                          <button 
                            onClick={() => navigate('/contact-directory')}
                            className="mt-3 text-sm text-blue-400 hover:text-blue-300 underline"
                          >
                            View in Contact Library →
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Coffee Chat Prep */}
                <TabsContent value="coffee-chat" className="mt-6">
                  <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700">
                    <CardHeader className="border-b border-gray-700">
                      <CardTitle className="text-xl text-white flex items-center gap-2">
                        Coffee Chat Prep
                        {currentTierConfig.coffeeChat && (
                          <span className="text-green-400 text-xs border border-green-400 rounded px-2 py-0.5">
                            Available
                          </span>
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
                            Generate a PDF with all available information from the LinkedIn profile to
                            help you prepare for your coffee chat.
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

                {/* Interview Prep */}
                <TabsContent value="interview-prep" className="mt-6">
                  <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700">
                    <CardHeader className="border-b border-gray-700">
                      <CardTitle className="text-xl text-white flex items-center gap-2">
                        Interview Prep
                        {currentTierConfig.interviewPrep && (
                          <span className="text-green-400 text-xs border border-green-400 rounded px-2 py-0.5">
                            Available
                          </span>
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
                            Generate a PDF with job analysis and a separate prep section with materials
                            to help you succeed in the interview.
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

              {/* Progress Card - UPDATED */}
              {(isSearching || searchComplete) && (
                <Card className="mb-6 bg-gray-800/50 backdrop-blur-sm border-gray-700">
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">
                          {searchComplete ? (
                            <span className="text-green-400 font-semibold">
                              ✅ Search completed successfully!
                            </span>
                          ) : (
                            `Searching with ${currentTierConfig.name} tier...`
                          )}
                        </span>
                        <span className={searchComplete ? "text-green-400 font-bold" : "text-blue-400"}>
                          {progressValue}%
                        </span>
                      </div>
                      <Progress 
                        value={progressValue} 
                        className="h-2"
                      />
                      {searchComplete && (
                        <div className="mt-2 text-sm text-green-300">
                          Check your Contact Library to view and manage your new contacts.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>

        {/* Scout Drawer */}
        {isScoutChatOpen && (
          <div className="fixed right-0 top-0 h-full w-80 bg-gray-900 shadow-2xl z-40 border-l border-gray-700">
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-blue-500 to-purple-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: "#fff6e2" }}
                    >
                      <img src="/scout-mascot.png" alt="Scout AI" className="w-8 h-8 object-contain" />
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
