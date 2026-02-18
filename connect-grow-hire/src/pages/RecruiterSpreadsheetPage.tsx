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
import { StickyCTA } from "@/components/StickyCTA";
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
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Ref for original button to track visibility
  const originalButtonRef = useRef<HTMLButtonElement>(null);

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

  // Check if form is valid - only job description is required
  const hasValidInput = jobPostingUrl.trim() || jobDescription.trim();
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

      // Validate we have required fields - only job description is required
      if (!description || !description.trim()) {
        toast({
          title: "Job description required",
          description: "Please provide a job description or paste a job URL.",
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
          // Create a map of email -> draft info for quick lookup
          const draftMap = new Map<string, any>();
          if (response.draftsCreated && Array.isArray(response.draftsCreated)) {
            response.draftsCreated.forEach((draft: any) => {
              const email = draft.recruiter_email || draft.recruiterEmail;
              if (email) {
                draftMap.set(email.toLowerCase(), draft);
              }
            });
          }

          // Convert API format to Firebase format
          const firebaseRecruiters: Omit<FirebaseRecruiter, 'id'>[] = response.hiringManagers.map((manager: any) => {
            // Build base object with required fields
            const managerEmail = manager.Email || manager.email || manager.WorkEmail || manager.work_email || '';
            const recruiter: Omit<FirebaseRecruiter, 'id'> = {
              firstName: manager.FirstName || manager.firstName || manager.first_name || '',
              lastName: manager.LastName || manager.lastName || manager.last_name || '',
              linkedinUrl: manager.LinkedIn || manager.linkedin || manager.linkedinUrl || manager.linkedin_url || '',
              email: managerEmail,
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

            // Match draft info by email and add to recruiter
            if (managerEmail) {
              const draftInfo = draftMap.get(managerEmail.toLowerCase());
              if (draftInfo) {
                if (draftInfo.draft_id) recruiter.gmailDraftId = draftInfo.draft_id;
                if (draftInfo.message_id) recruiter.gmailMessageId = draftInfo.message_id;
                if (draftInfo.draft_url) recruiter.gmailDraftUrl = draftInfo.draft_url;
              }
            }

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

          <main style={{ background: '#F8FAFF', flex: 1, overflowY: 'auto', padding: '48px 24px', paddingBottom: '96px' }}>
            <div>

              {/* Header Section */}
              <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px 0' }}>
                <h1
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: '42px',
                    fontWeight: 400,
                    letterSpacing: '-0.025em',
                    color: '#0F172A',
                    textAlign: 'center',
                    marginBottom: '10px',
                    lineHeight: 1.1,
                  }}
                >
                  Find Hiring Managers
                </h1>
                <p
                  style={{
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontSize: '16px',
                    color: '#64748B',
                    textAlign: 'center',
                    marginBottom: '28px',
                    lineHeight: 1.5,
                  }}
                >
                  Paste a job posting URL and we'll find the recruiters and hiring managers for that role.
                </p>
              </div>

              {/* Navigation Tabs */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '36px' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    gap: '0',
                    background: '#F0F4FD',
                    borderRadius: '12px',
                    padding: '4px',
                    margin: '0 auto',
                  }}
                >
                  <button
                    onClick={() => setActiveTab('find-hiring-managers')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      borderRadius: '9px',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      fontSize: '14px',
                      fontWeight: 500,
                      transition: 'all 0.15s ease',
                      background: activeTab === 'find-hiring-managers' ? '#2563EB' : 'transparent',
                      color: activeTab === 'find-hiring-managers' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'find-hiring-managers' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <Users className="h-4 w-4" />
                    Find Hiring Managers
                  </button>

                  <button
                    onClick={() => setActiveTab('hiring-manager-tracker')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      borderRadius: '9px',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      fontSize: '14px',
                      fontWeight: 500,
                      transition: 'all 0.15s ease',
                      background: activeTab === 'hiring-manager-tracker' ? '#2563EB' : 'transparent',
                      color: activeTab === 'hiring-manager-tracker' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'hiring-manager-tracker' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <ClipboardList className="h-4 w-4" />
                    Hiring Manager Tracker
                    {trackerCount > 0 && (
                      <span
                        style={{
                          marginLeft: '6px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: activeTab === 'hiring-manager-tracker' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(37, 99, 235, 0.08)',
                          color: activeTab === 'hiring-manager-tracker' ? 'white' : '#2563EB',
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          fontSize: '11px',
                          fontWeight: 600,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {trackerCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                  {/* TAB 1: Find Hiring Managers */}
                  <TabsContent value="find-hiring-managers" className="mt-0">
                    {/* Main Card */}
                    <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden animate-fadeInUp recruiter-search-form-card" style={{ animationDelay: '200ms' }}>
                      {/* Simple gray divider */}
                      <div className="h-1 bg-gray-100"></div>

                      <div className="p-8 recruiter-search-form-content">
                        {/* Card Header */}
                        <div className="mb-8">
                          <h2 className="text-xl font-semibold text-gray-900 mb-2">Find Hiring Managers</h2>
                          <p className="text-gray-600">Paste a job posting URL and we'll find the recruiters and hiring managers for that role.</p>
                        </div>

                        {/* Primary Input - Job Posting URL */}
                        <div className="mb-6">
                          <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                              <Link className="h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                            </div>
                            <input
                              type="url"
                              value={jobPostingUrl}
                              onChange={(e) => {
                                setJobPostingUrl(e.target.value);
                                if (e.target.value.trim()) {
                                  setShowManualEntry(false);
                                }
                              }}
                              placeholder="Paste the job posting URL (LinkedIn, Greenhouse, Lever, etc.)"
                              disabled={isSearching}
                              className="w-full pl-12 pr-12 py-4 text-base border-2 border-gray-300 rounded-2xl
                                       text-gray-900 placeholder-gray-400 bg-white
                                       hover:border-gray-400
                                       focus:border-blue-400 focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20
                                       transition-all duration-150 disabled:opacity-50"
                            />
                            {jobPostingUrl && isValidUrl(jobPostingUrl) && (
                              <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              </div>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-gray-400">
                            We'll extract all details automatically from the job posting.
                          </p>
                        </div>

                        {/* Manual Entry Toggle */}
                        <div className="mb-6">
                          <button
                            type="button"
                            onClick={() => setShowManualEntry(!showManualEntry)}
                            className="text-sm text-gray-600 hover:text-blue-700 transition-all duration-150 flex items-center gap-1.5 group underline decoration-gray-300 hover:decoration-blue-400"
                          >
                            {showManualEntry ? (
                              <>
                                <span>Hide manual entry</span>
                              </>
                            ) : (
                              <>
                                <span>Or enter details manually</span>
                                <span className="text-blue-500 opacity-60 group-hover:opacity-100 transition-opacity">→</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Manual Entry Section - Collapsible */}
                        {showManualEntry && !jobPostingUrl && (
                          <div className="mb-8 pt-6 border-t border-gray-100">
                            <p className="text-sm text-gray-600 mb-5">
                              Use this if a job posting URL isn't available.
                            </p>

                            {/* Three-column grid for Company, Job Title, Location */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Company
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
                                    disabled={isSearching}
                                    className="block w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl
                                             text-gray-900 placeholder-gray-400 text-sm
                                             hover:border-gray-300
                                             focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400
                                             transition-all duration-150 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Job Title
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
                                    disabled={isSearching}
                                    className="block w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl
                                             text-gray-900 placeholder-gray-400 text-sm
                                             hover:border-gray-300
                                             focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400
                                             transition-all duration-150 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Location
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
                                    disabled={isSearching}
                                    className="block w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl
                                             text-gray-900 placeholder-gray-400 text-sm
                                             hover:border-gray-300
                                             focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400
                                             transition-all duration-150 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Job Description textarea */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Job Description <span className="text-red-400">*</span>
                              </label>
                              <textarea
                                value={jobDescription}
                                onChange={(e) => setJobDescription(e.target.value)}
                                placeholder="Paste the job description or role summary here."
                                rows={4}
                                disabled={isSearching}
                                className="block w-full px-4 py-3 border border-gray-200 rounded-xl
                                         text-gray-900 placeholder-gray-400 text-sm resize-none
                                         hover:border-gray-300
                                         focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400
                                         transition-all duration-150 disabled:bg-gray-100 disabled:cursor-not-allowed"
                              />
                            </div>
                          </div>
                        )}

                        {/* Reassurance line */}
                        <div className="mb-8 pt-6 border-t border-gray-100">
                          <p className="text-xs text-gray-400 text-center">
                            Draft emails saved automatically to Gmail • Verified emails • Auto-saved to Hiring Manager Tracker
                          </p>
                        </div>

                        {/* Cost & CTA Section */}
                        <div className="mt-8 pt-8 border-t border-gray-100">
                          {/* Cost info - neutral and calm */}
                          <div className="mb-6 text-center">
                            <p className="text-sm text-gray-500">
                              Will find {estimatedManagers} hiring managers • {15 * estimatedManagers} credits
                            </p>
                          </div>

                          {/* CTA Button - Clear and dominant */}
                          <div className="flex justify-center">
                            <button
                              ref={originalButtonRef}
                              onClick={handleFindHiringManagers}
                              disabled={!canSearch}
                              className={`
                            w-full md:w-auto px-8 py-4 rounded-full font-semibold text-lg
                            flex items-center justify-center gap-3
                            transition-all duration-150
                            ${!canSearch
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-100'
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
                          </div>

                          {/* Resume required message */}
                          {!savedResumeUrl && (
                            <p className="text-center text-sm text-gray-500 mt-4">
                              Please upload your resume to continue
                            </p>
                          )}
                        </div>

                        {/* Resume Section - Simple status row */}
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
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <CheckCircle className="w-5 h-5 text-green-500" />
                                <div>
                                  <p className="text-sm font-medium text-gray-900">Resume on file</p>
                                  <p className="text-xs text-gray-500">{savedResumeFileName}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isSearching || isUploadingResume}
                                className="text-sm text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
                              >
                                {isUploadingResume ? "Uploading..." : "Change"}
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={() => fileInputRef.current?.click()}
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                              <Upload className="w-5 h-5 text-gray-400" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                  {isUploadingResume ? "Uploading..." : "Upload your resume"}
                                </p>
                                <p className="text-xs text-gray-500">Required • Improves match quality</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  {/* TAB 2: Hiring Manager Tracker */}
                  <TabsContent value="hiring-manager-tracker" className="mt-0">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                      <div className="h-1 bg-gray-100"></div>

                      <div className="p-8">
                        <RecruiterSpreadsheet key={refreshKey} />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </main>
        </MainContentWrapper>

        {/* Loading Modal */}
        {isSearching && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-gray-900 animate-pulse" />
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
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
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
              <p className="text-sm text-gray-600 font-medium mb-6">Draft emails saved to your Gmail</p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleViewResults}
                  className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:shadow-lg transition-all"
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

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* 1. PAGE/BODY LEVEL - Prevent horizontal overflow */
          html, body {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .recruiter-search-page {
            overflow-x: hidden;
            max-width: 100vw;
          }

          /* 2. ALL MAIN CONTENT CONTAINERS */
          .recruiter-search-container {
            max-width: 100vw;
            width: 100%;
            box-sizing: border-box;
            padding-left: 16px;
            padding-right: 16px;
          }

          /* 3. HEADER SECTION - Ensure padding so text doesn't touch edges */
          .recruiter-search-header {
            padding-left: 16px;
            padding-right: 16px;
            box-sizing: border-box;
          }

          .recruiter-search-title {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 1.75rem !important;
          }

          .recruiter-search-subtitle {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.875rem !important;
          }

          /* 4. TAB BARS - Ensure doesn't overflow */
          .recruiter-search-tabs {
            max-width: 100%;
            width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            padding: 8px !important;
            justify-content: flex-start;
          }

          .recruiter-search-tabs::-webkit-scrollbar {
            display: none;
          }

          .recruiter-search-tabs button {
            min-width: fit-content;
            min-height: 44px;
            flex-shrink: 0;
            white-space: nowrap;
          }

          /* 5. FORM CARDS - Full width with proper padding */
          .recruiter-search-form-card {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .recruiter-search-form-content {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 6. ALL CHILD ELEMENTS - Ensure no fixed widths exceed viewport */
          .recruiter-search-page * {
            max-width: 100%;
            box-sizing: border-box;
          }

          .recruiter-search-page img,
          .recruiter-search-page .recruiter-search-form-card,
          .recruiter-search-page button,
          .recruiter-search-page input,
          .recruiter-search-page textarea,
          .recruiter-search-page select {
            max-width: 100%;
            box-sizing: border-box;
          }

          /* Prevent text overflow */
          .recruiter-search-page p,
          .recruiter-search-page h1,
          .recruiter-search-page h2,
          .recruiter-search-page h3,
          .recruiter-search-page span,
          .recruiter-search-page label {
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
          }
        }
      `}</style>
      
      {/* Sticky CTA - Only show on find-hiring-managers tab */}
      {activeTab === 'find-hiring-managers' && (
        <StickyCTA
          originalButtonRef={originalButtonRef}
          onClick={handleFindHiringManagers}
          isLoading={isSearching}
          disabled={!canSearch}
          buttonClassName="rounded-full"
        >
          <span>Find Hiring Managers</span>
        </StickyCTA>
      )}
    </SidebarProvider>
  );
};

export default RecruiterSpreadsheetPage;
