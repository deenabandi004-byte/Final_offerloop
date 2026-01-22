// src/pages/RecruiterSpreadsheetPage.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import RecruiterSpreadsheet from '@/components/RecruiterSpreadsheet';
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from "@/hooks/use-toast";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { apiService, type Recruiter } from "@/services/api";
import { firebaseApi, type Recruiter as FirebaseRecruiter } from "../services/firebaseApi";
import { 
  Users, Link, Building2, Briefcase, MapPin, FileText, CheckCircle, 
  Mail, Sparkles, Check, ArrowRight, ClipboardList, Loader2, Upload
} from "lucide-react";

const RecruiterSpreadsheetPage = () => {
  const { user } = useFirebaseAuth();
  const [activeTab, setActiveTab] = useState('find-hiring-managers');
  
  // Resume state
  const [savedResumeUrl, setSavedResumeUrl] = useState<string | null>(null);
  const [savedResumeFileName, setSavedResumeFileName] = useState<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form state
  const [jobPostingUrl, setJobPostingUrl] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [location, setLocation] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchComplete, setSearchComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [estimatedManagers] = useState(2);
  const [managersFound, setManagersFound] = useState(0);

  // Tracker count (would come from API in real implementation)
  const [trackerCount, setTrackerCount] = useState(0);
  // Refresh key to force RecruiterSpreadsheet to reload when changed
  const [refreshKey, setRefreshKey] = useState(0);

  // Validate parsed job title - reject common error messages from JS-required pages
  const isValidJobTitle = (title: string | undefined | null): boolean => {
    if (!title || title.trim().length === 0) return false;
    
    const invalidPatterns = [
      'javascript is disabled',
      'javascript is required',
      'enable javascript',
      'please enable javascript',
      'browser not supported',
      'loading...',
      'please wait',
    ];
    
    const lowerTitle = title.toLowerCase().trim();
    return !invalidPatterns.some(pattern => lowerTitle.includes(pattern));
  };

  // URL validation
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Load saved resume from Firestore
  const loadSavedResume = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        setSavedResumeUrl(data.resumeUrl || null);
        setSavedResumeFileName(data.resumeFileName || null);
      }
    } catch (error) {
      console.error('Failed to load saved resume:', error);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadSavedResume();
  }, [loadSavedResume]);

  // Save resume to account settings
  const saveResumeToAccountSettings = async (file: File) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }
    setIsUploadingResume(true);
    try {
      const storageRef = ref(storage, `resumes/${user.uid}/${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        resumeUrl: downloadUrl,
        resumeFileName: file.name,
        resumeUpdatedAt: new Date().toISOString(),
      });
      setSavedResumeUrl(downloadUrl);
      setSavedResumeFileName(file.name);
      toast({
        title: "Resume saved",
        description: "Your resume has been uploaded and saved to your account.",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save resume';
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUploadingResume(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isValidResumeFile(file)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, DOCX, or DOC file.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }
    try {
      await saveResumeToAccountSettings(file);
    } catch (error) {
      // Error handled in saveResumeToAccountSettings
    }
    event.target.value = '';
  };

  // Check if form is valid
  const hasValidInput = jobPostingUrl.trim() || (company.trim() && jobTitle.trim() && location.trim() && jobDescription.trim());
  const canSearch = savedResumeUrl && hasValidInput && !isSearching;

  // Handle search
  const handleFindHiringManagers = async () => {
    if (!canSearch || !user) return;
    setIsSearching(true);
    setProgress(0);
    
    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      let companyName = company;
      let jobTitleValue = jobTitle;
      let locationValue = location;
      let description = jobDescription;

      // Priority 1: Parse job URL if provided
      if (jobPostingUrl && jobPostingUrl.trim()) {
        try {
          const parseResponse = await apiService.parseJobUrl({ url: jobPostingUrl });
          if (parseResponse.job) {
            if (parseResponse.job.company && !companyName) {
              companyName = parseResponse.job.company;
            }
            const parsedTitle = parseResponse.job.title;
            if (parsedTitle && !jobTitleValue && isValidJobTitle(parsedTitle)) {
              jobTitleValue = parsedTitle;
            }
            if (parseResponse.job.location && !locationValue) {
              locationValue = parseResponse.job.location;
            }
            if (parseResponse.job.description && !description) {
              description = parseResponse.job.description;
            }
          } else if (parseResponse.error) {
            console.warn('Failed to parse job URL:', parseResponse.error);
            toast({
              title: "Could not parse job URL",
              description: "Please paste the job description instead.",
              variant: "default"
            });
          }
        } catch (error) {
          console.error('Error parsing job URL:', error);
        }
      }

      // Validate we have required fields
      if (!companyName) {
        toast({
          title: "Company name required",
          description: "Please provide a company name or paste a job URL.",
          variant: "destructive",
        });
        clearInterval(progressInterval);
        setIsSearching(false);
        return;
      }

      // Call the API
      const response = await apiService.findHiringManagers({
        company: companyName,
        jobTitle: jobTitleValue,
        jobDescription: description,
        location: locationValue,
        jobUrl: jobPostingUrl || undefined,
        maxResults: estimatedManagers,
        generateEmails: true,
        createDrafts: true,
      });

      console.log('🔍 API Response:', JSON.stringify(response, null, 2));
      console.log('🔍 Hiring managers found:', response.hiringManagers?.length);
      console.log('🔍 First manager raw:', response.hiringManagers?.[0]);

      clearInterval(progressInterval);
      setProgress(100);

      if (response.error) {
        toast({
          title: "Error finding hiring managers",
          description: response.error,
          variant: "destructive",
        });
        setIsSearching(false);
        return;
      }

      // Save hiring managers to tracker
      if (response.hiringManagers && response.hiringManagers.length > 0) {
        try {
          // Convert API format to Firebase format
          const firebaseRecruiters: Omit<FirebaseRecruiter, 'id'>[] = response.hiringManagers.map((manager: any) => {
            // Build base object with required fields
            const recruiter: Omit<FirebaseRecruiter, 'id'> = {
              firstName: manager.FirstName || manager.firstName || manager.first_name || '',
              lastName: manager.LastName || manager.lastName || manager.last_name || '',
              linkedinUrl: manager.LinkedIn || manager.linkedin || manager.linkedinUrl || manager.linkedin_url || '',
              email: manager.Email || manager.email || manager.WorkEmail || manager.work_email || '',
              company: manager.Company || manager.company || companyName,
              jobTitle: manager.Title || manager.title || manager.jobTitle || manager.job_title || '',
              location: `${manager.City || manager.city || ''}${(manager.City || manager.city) && (manager.State || manager.state) ? ', ' : ''}${manager.State || manager.state || ''}`.trim() || '',
              dateAdded: new Date().toISOString(),
              status: 'Not Contacted',
            };

            // Only add optional fields if they have values (Firestore rejects undefined)
            const phone = manager.Phone || manager.phone;
            const workEmail = manager.WorkEmail || manager.work_email || manager.workEmail;
            const personalEmail = manager.PersonalEmail || manager.personal_email || manager.personalEmail;
            const associatedJobTitle = jobTitleValue;
            const associatedJobUrl = jobPostingUrl;

            if (phone) recruiter.phone = phone;
            if (workEmail) recruiter.workEmail = workEmail;
            if (personalEmail) recruiter.personalEmail = personalEmail;
            if (associatedJobTitle && isValidJobTitle(associatedJobTitle)) {
              recruiter.associatedJobTitle = associatedJobTitle;
            }
            if (associatedJobUrl) recruiter.associatedJobUrl = associatedJobUrl;

            return recruiter;
          });

          console.log('📋 Converted to Firebase format:', JSON.stringify(firebaseRecruiters, null, 2));

          // Check for duplicates before saving
          const existingRecruiters = await firebaseApi.getRecruiters(user.uid);
          const existingEmails = new Set(existingRecruiters.map(r => r.email).filter(Boolean));
          const existingLinkedIns = new Set(existingRecruiters.map(r => r.linkedinUrl).filter(Boolean));

          const newRecruiters = firebaseRecruiters.filter(r => {
            const hasEmail = r.email && existingEmails.has(r.email);
            const hasLinkedIn = r.linkedinUrl && existingLinkedIns.has(r.linkedinUrl);
            return !hasEmail && !hasLinkedIn;
          });

          console.log('💾 About to save these recruiters:', newRecruiters.length, JSON.stringify(newRecruiters, null, 2));

          if (newRecruiters.length > 0) {
            await firebaseApi.bulkCreateRecruiters(user.uid, newRecruiters);
            setTrackerCount(prev => prev + newRecruiters.length);
            console.log(`✅ Saved ${newRecruiters.length} hiring manager(s) to tracker`);
            
            // Trigger refresh of RecruiterSpreadsheet component
            setRefreshKey(prev => prev + 1);
            
            // Switch to tracker tab to show the saved hiring managers
            setActiveTab('hiring-manager-tracker');
          } else {
            console.log('⚠️ All hiring managers were duplicates, nothing saved');
          }
        } catch (error) {
          console.error('Error saving hiring managers to tracker:', error);
          toast({
            title: "Error saving to tracker",
            description: "Hiring managers were found but couldn't be saved. Please try again.",
            variant: "destructive",
          });
        }
      } else {
        console.log('⚠️ No hiring managers in response to save');
      }

      // Show success message
      const foundCount = response.hiringManagers?.length || 0;
      const savedCount = response.hiringManagers?.length || 0;
      setManagersFound(foundCount);
      
      if (foundCount > 0) {
        toast({
          title: `Found ${foundCount} hiring manager${foundCount !== 1 ? 's' : ''}!`,
          description: response.draftsCreated && response.draftsCreated.length > 0
            ? `${savedCount} saved to tracker. Draft emails saved to your Gmail.`
            : `${savedCount} saved to tracker.`,
        });
      } else {
        toast({
          title: "No hiring managers found",
          description: "Try adjusting your search criteria or company name.",
          variant: "default",
        });
      }

      setIsSearching(false);
      setSearchComplete(true);
    } catch (error) {
      clearInterval(progressInterval);
      setIsSearching(false);
      const errorMessage = error instanceof Error ? error.message : 'Failed to find hiring managers';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleViewResults = () => {
    setSearchComplete(false);
    setActiveTab('hiring-manager-tracker');
  };

  const resetForm = () => {
    setSearchComplete(false);
    setJobPostingUrl('');
    setCompany('');
    setJobTitle('');
    setLocation('');
    setJobDescription('');
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader title="" />

          <main className="bg-gradient-to-b from-slate-50 via-white to-white min-h-screen">
            <div className="max-w-4xl mx-auto px-6 pt-10 pb-8">
              
              {/* Inspiring Header Section */}
              <div className="text-center mb-8 animate-fadeInUp">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Find Hiring Managers
                </h1>
                <p className="text-gray-600 text-lg">
                  Connect directly with the people who make hiring decisions.
                </p>
              </div>

              {/* Pill-style Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit mx-auto mb-8 animate-fadeInUp" style={{ animationDelay: '100ms' }}>
                  <button
                    onClick={() => setActiveTab('find-hiring-managers')}
                    className={`
                      flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                      ${activeTab === 'find-hiring-managers' 
                        ? 'bg-white text-rose-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <Users className="w-4 h-4" />
                    Find Hiring Managers
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('hiring-manager-tracker')}
                    className={`
                      flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                      ${activeTab === 'hiring-manager-tracker' 
                        ? 'bg-white text-rose-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <ClipboardList className="w-4 h-4" />
                    Hiring Manager Tracker
                    {trackerCount > 0 && (
                      <span className="ml-1 px-2 py-0.5 bg-rose-100 text-rose-700 text-xs font-semibold rounded-full">
                        {trackerCount}
                      </span>
                    )}
                  </button>
                </div>

                {/* TAB 1: Find Hiring Managers */}
                <TabsContent value="find-hiring-managers" className="mt-0">
                  {/* Main Card */}
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                    {/* Rose/pink gradient accent at top */}
                    <div className="h-1 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600"></div>
                    
                    <div className="p-8">
                      {/* Card Header with Icon */}
                      <div className="text-center mb-8">
                        <div className="w-14 h-14 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                          <Users className="w-7 h-7 text-rose-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Who are you trying to reach?</h2>
                        <p className="text-gray-600 max-w-lg mx-auto">
                          Paste a job posting URL or enter the role details manually to find the right hiring managers.
                        </p>
                      </div>

                      {/* Primary Method - Job Posting URL */}
                      <div className="mb-8">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Primary Method</span>
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-xs font-medium rounded-full">Recommended</span>
                        </div>
                        
                        <div className="bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 rounded-2xl p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                              <Link className="w-5 h-5 text-rose-600" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900">Job Posting URL</h3>
                              <p className="text-sm text-gray-600">Fastest way — we'll extract all the details automatically</p>
                            </div>
                          </div>
                          
                          <div className="relative">
                            <input
                              type="url"
                              value={jobPostingUrl}
                              onChange={(e) => setJobPostingUrl(e.target.value)}
                              placeholder="Paste the job posting URL (LinkedIn, Greenhouse, Lever, etc.)"
                              disabled={isSearching}
                              className="w-full pl-4 pr-12 py-4 text-base border-2 border-rose-200 rounded-xl
                                         text-gray-900 placeholder-gray-400 bg-white
                                         focus:ring-2 focus:ring-rose-500 focus:border-rose-500
                                         hover:border-rose-300 transition-all disabled:opacity-50"
                            />
                            
                            {jobPostingUrl && isValidUrl(jobPostingUrl) && (
                              <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              </div>
                            )}
                          </div>
                          
                          {/* Supported platforms */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-500">Supports:</span>
                            {['LinkedIn', 'Greenhouse', 'Lever', 'Workday', 'Indeed'].map((platform) => (
                              <span 
                                key={platform}
                                className="px-2 py-0.5 bg-white/70 text-gray-600 text-xs rounded-full"
                              >
                                {platform}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* OR Divider */}
                      <div className="relative py-6">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center">
                          <span className="px-4 bg-white text-sm text-gray-500">Or enter details manually</span>
                        </div>
                      </div>

                      {/* Manual Method Section */}
                      <div className={`transition-all duration-300 ${jobPostingUrl ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Manual Method</span>
                          <span className="text-xs text-gray-400">(if no job posting URL)</span>
                        </div>
                        
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                          <p className="text-sm text-gray-600 mb-5">
                            Use this if a job posting URL isn't available. We'll use these details to identify the most relevant hiring managers.
                          </p>
                          
                          {/* Three-column grid for Company, Job Title, Location */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Company <span className="text-red-500">*</span>
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Building2 className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                  type="text"
                                  value={company}
                                  onChange={(e) => setCompany(e.target.value)}
                                  placeholder="e.g. Google, Stripe"
                                  disabled={!!jobPostingUrl || isSearching}
                                  className="block w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl
                                             text-gray-900 placeholder-gray-400 text-sm
                                             focus:ring-2 focus:ring-rose-500 focus:border-rose-500
                                             hover:border-gray-300 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                                />
                              </div>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Job Title <span className="text-red-500">*</span>
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Briefcase className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                  type="text"
                                  value={jobTitle}
                                  onChange={(e) => setJobTitle(e.target.value)}
                                  placeholder="e.g. Product Manager"
                                  disabled={!!jobPostingUrl || isSearching}
                                  className="block w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl
                                             text-gray-900 placeholder-gray-400 text-sm
                                             focus:ring-2 focus:ring-rose-500 focus:border-rose-500
                                             hover:border-gray-300 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                                />
                              </div>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Location <span className="text-red-500">*</span>
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <MapPin className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                  type="text"
                                  value={location}
                                  onChange={(e) => setLocation(e.target.value)}
                                  placeholder="e.g. New York, NY"
                                  disabled={!!jobPostingUrl || isSearching}
                                  className="block w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl
                                             text-gray-900 placeholder-gray-400 text-sm
                                             focus:ring-2 focus:ring-rose-500 focus:border-rose-500
                                             hover:border-gray-300 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                                />
                              </div>
                            </div>
                          </div>
                          
                          {/* Job Description textarea */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Job Description <span className="text-red-500">*</span>
                            </label>
                            <textarea
                              value={jobDescription}
                              onChange={(e) => setJobDescription(e.target.value)}
                              placeholder="Paste the job description or role summary here. This helps us identify the correct hiring managers."
                              rows={4}
                              disabled={!!jobPostingUrl || isSearching}
                              className="block w-full px-4 py-3 border border-gray-200 rounded-xl
                                         text-gray-900 placeholder-gray-400 text-sm resize-none
                                         focus:ring-2 focus:ring-rose-500 focus:border-rose-500
                                         hover:border-gray-300 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>

                      {/* What You'll Get Section */}
                      <div className="mt-8 pt-8 border-t border-gray-100">
                        <h3 className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wide mb-6">What you'll get</h3>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-4">
                            <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                              <Users className="w-5 h-5 text-rose-600" />
                            </div>
                            <p className="font-medium text-gray-900 text-sm">2 Hiring Managers</p>
                            <p className="text-xs text-gray-500">Relevant decision makers</p>
                          </div>
                          
                          <div className="text-center p-4">
                            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                              <Mail className="w-5 h-5 text-green-600" />
                            </div>
                            <p className="font-medium text-gray-900 text-sm">Verified Emails</p>
                            <p className="text-xs text-gray-500">Professional work emails</p>
                          </div>
                          
                          <div className="text-center p-4">
                            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                              <Sparkles className="w-5 h-5 text-purple-600" />
                            </div>
                            <p className="font-medium text-gray-900 text-sm">AI Draft Emails</p>
                            <p className="text-xs text-gray-500">Personalized outreach</p>
                          </div>
                          
                          <div className="text-center p-4">
                            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                              <ClipboardList className="w-5 h-5 text-blue-600" />
                            </div>
                            <p className="font-medium text-gray-900 text-sm">Auto-Saved</p>
                            <p className="text-xs text-gray-500">To Gmail & Tracker</p>
                          </div>
                        </div>
                      </div>

                      {/* Cost Summary & CTA */}
                      <div className="mt-8">
                        {/* Cost summary */}
                        <div className="bg-gradient-to-r from-rose-50 to-pink-50 rounded-xl p-4 mb-6 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                              <Users className="w-5 h-5 text-rose-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                This will find <span className="text-rose-600 font-bold">{estimatedManagers}</span> hiring managers
                              </p>
                              <p className="text-sm text-gray-600">
                                Cost: <span className="font-semibold">{15 * estimatedManagers} credits</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* CTA Button */}
                        <button
                          onClick={handleFindHiringManagers}
                          disabled={!canSearch}
                          className={`
                            w-full md:w-auto px-8 py-4 rounded-full font-semibold text-lg
                            flex items-center justify-center gap-3 mx-auto
                            transition-all duration-200 transform
                            ${!canSearch
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-gradient-to-r from-rose-600 to-pink-500 text-white shadow-lg shadow-rose-500/30 hover:shadow-xl hover:shadow-rose-500/40 hover:scale-105 active:scale-100'
                            }
                          `}
                        >
                          {isSearching ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Finding...
                            </>
                          ) : (
                            <>
                              Find Hiring Managers
                              <ArrowRight className="w-5 h-5" />
                            </>
                          )}
                        </button>
                        
                        {/* Value props below button */}
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
                          <span className="flex items-center gap-1.5">
                            <Check className="w-4 h-4 text-green-500" />
                            Draft emails saved to Gmail
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Check className="w-4 h-4 text-green-500" />
                            Auto-saved to Hiring Manager Tracker
                          </span>
                        </div>

                        {/* Resume required message */}
                        {!savedResumeUrl && (
                          <p className="text-center text-sm text-amber-600 mt-4">
                            Please upload your resume to continue
                          </p>
                        )}
                      </div>

                      {/* Resume Section - Elevated */}
                      <div className="mt-8 pt-8 border-t border-gray-100">
                        <input
                          type="file"
                          accept={ACCEPTED_RESUME_TYPES.accept}
                          onChange={handleFileUpload}
                          className="hidden"
                          ref={fileInputRef}
                          disabled={isSearching || isUploadingResume}
                        />
                        
                        {savedResumeUrl && savedResumeFileName ? (
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center">
                                <FileText className="w-6 h-6 text-blue-600" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-gray-900">Resume on file</p>
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" />
                                    Active
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">{savedResumeFileName}</p>
                                <p className="text-xs text-gray-500 mt-0.5">Improves match quality and email personalization</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isSearching || isUploadingResume}
                              className="text-blue-600 text-sm font-medium hover:text-blue-800 hover:underline transition-colors disabled:opacity-50"
                            >
                              {isUploadingResume ? "Uploading..." : "Change"}
                            </button>
                          </div>
                        ) : (
                          <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-rose-400 hover:bg-rose-50/50 transition-all cursor-pointer"
                          >
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mx-auto mb-3">
                              <Upload className="w-6 h-6 text-gray-400" />
                            </div>
                            <p className="font-medium text-gray-700 mb-1">
                              {isUploadingResume ? "Uploading..." : "Upload your resume"}
                            </p>
                            <p className="text-sm text-gray-500">Required • Improves match quality and email personalization</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* TAB 2: Hiring Manager Tracker */}
                <TabsContent value="hiring-manager-tracker" className="mt-0">
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                    <div className="h-1 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600"></div>
                    
                    <div className="p-8">
                      <RecruiterSpreadsheet key={refreshKey} />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </MainContentWrapper>

        {/* Loading Modal */}
        {isSearching && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl">
              <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-rose-600 animate-pulse" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Finding hiring managers...</h3>
              <p className="text-gray-600 mb-4">
                {jobPostingUrl 
                  ? "Analyzing the job posting and identifying decision makers"
                  : `Searching for hiring managers at ${company}`
                }
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-rose-500 to-pink-500 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 mt-3">This usually takes 15-30 seconds</p>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {searchComplete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl animate-scaleIn">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-1">Found {managersFound} hiring manager{managersFound !== 1 ? 's' : ''}!</h3>
              <p className="text-gray-600 mb-2">{jobTitle || 'Role'} at {company || 'Company'}</p>
              <p className="text-sm text-rose-600 font-medium mb-6">Draft emails saved to your Gmail</p>
              
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button 
                  onClick={handleViewResults}
                  className="px-6 py-3 bg-gradient-to-r from-rose-600 to-pink-500 text-white font-semibold rounded-full hover:shadow-lg transition-all"
                >
                  View Hiring Managers →
                </button>
                <button 
                  onClick={resetForm}
                  className="px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-full hover:bg-gray-200 transition-colors"
                >
                  Search again
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarProvider>
  );
};

export default RecruiterSpreadsheetPage;
