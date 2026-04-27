// src/pages/RecruiterSpreadsheetPage.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { VideoDemo } from "@/components/VideoDemo";
import { ProGate } from "@/components/ProGate";
import { apiService, type Recruiter } from "@/services/api";
import { StickyCTA } from "@/components/StickyCTA";
import { firebaseApi, type Recruiter as FirebaseRecruiter } from "../services/firebaseApi";
import {
  Users, Link, Building2, Briefcase, MapPin, FileText, CheckCircle,
  Mail, Sparkles, Check, ArrowRight, ClipboardList, Loader2, Upload, ChevronDown, ChevronUp
} from "lucide-react";
import type { FeedJob } from "@/services/api";
import { getCompanyLogoUrl } from "@/utils/suggestionChips";
import { DEV_MOCK_USER } from "@/lib/devPreview";

const RecruiterSpreadsheetPage: React.FC<{ embedded?: boolean; isDevPreview?: boolean }> = ({ embedded = false, isDevPreview = false }) => {
  const { user: authUser } = useFirebaseAuth();
  const user = isDevPreview ? DEV_MOCK_USER as any : authUser;
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('find-hiring-managers');

  // Resume state
  const [savedResumeUrl, setSavedResumeUrl] = useState<string | null>(null);
  const [savedResumeFileName, setSavedResumeFileName] = useState<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state — pre-fill from URL param if present
  const [jobPostingUrl, setJobPostingUrl] = useState(searchParams.get('jobUrl') || '');
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

  // Recent jobs for chips
  const [recentJobs, setRecentJobs] = useState<FeedJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

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
    if (!user?.uid || isDevPreview) return;
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

  // Fetch recent job feed for chips
  useEffect(() => {
    if (!user?.uid || isDevPreview) return;
    let cancelled = false;
    setJobsLoading(true);
    apiService.getJobFeed().then(data => {
      if (cancelled) return;
      // Combine top_jobs and new_matches, deduplicate, take first 8
      const all = [...(data.top_jobs || []), ...(data.new_matches || [])];
      const seen = new Set<string>();
      const unique: FeedJob[] = [];
      for (const job of all) {
        if (!seen.has(job.job_id) && job.apply_url) {
          seen.add(job.job_id);
          unique.push(job);
        }
        if (unique.length >= 8) break;
      }
      setRecentJobs(unique);
    }).catch(() => {
      // Silently fail — chips are optional
    }).finally(() => {
      if (!cancelled) setJobsLoading(false);
    });
    return () => { cancelled = true; };
  }, [user?.uid]);

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

  const embeddedContent = (
    <>
          <ProGate title="Find Hiring Manager" description="Find the recruiters and hiring managers behind any job posting. Paste a URL and get direct contact info in seconds." videoId="TIERqtjc1tk">
          <main className="px-3 py-6 sm:px-6 sm:py-12" style={{ background: '#FFFFFF', flex: 1, overflowY: 'auto', paddingBottom: '96px' }}>
            <div>

              {/* Header Section — only when standalone */}
              {!embedded && (
              <div className="w-full px-3 py-6 sm:px-6 sm:py-12 !pb-0" style={{ maxWidth: '900px', margin: '0 auto' }}>
                <h1
                  className="text-[28px] sm:text-[42px]"
                  style={{
                    fontFamily: "'Lora', Georgia, serif",
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
                    color: '#6B7280',
                    textAlign: 'center',
                    marginBottom: '28px',
                    lineHeight: 1.5,
                  }}
                >
                  Paste a job posting URL and we'll find the recruiters and hiring managers for that role.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <VideoDemo videoId="TIERqtjc1tk" />
                </div>
              </div>
              )}

              {/* Main Content Area */}
              <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                  {/* TAB 1: Find Hiring Managers */}
                  <TabsContent value="find-hiring-managers" className="mt-0">
                    <div style={{ padding: '0 32px 0', maxWidth: '860px' }}>
                      <input
                        type="file"
                        accept={ACCEPTED_RESUME_TYPES.accept}
                        onChange={handleFileUpload}
                        className="hidden"
                        ref={fileInputRef}
                        disabled={isSearching || isUploadingResume}
                      />

                      {/* Recent Job Chips */}
                      {recentJobs.length > 0 && !jobPostingUrl && !isSearching && (
                        <div style={{ marginBottom: 18 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
                              From your job board
                            </span>
                          </div>
                          <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 10 }}>
                            Find the hiring manager for a role you're interested in
                          </div>
                          <div
                            style={{
                              display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4,
                              scrollbarWidth: 'none',
                            }}
                          >
                            {recentJobs.map(job => {
                              const accentColors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#6366F1'];
                              const accent = accentColors[Math.abs(job.company.charCodeAt(0)) % accentColors.length];
                              // Logo priority: feed logo → domain map → guessed domain favicon
                              const domainGuess = job.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
                              const logoUrl = job.employer_logo || getCompanyLogoUrl(job.company) || `https://www.google.com/s2/favicons?domain=${domainGuess}&sz=128`;
                              const initial = job.company.charAt(0).toUpperCase();

                              return (
                                <button
                                  key={job.job_id}
                                  type="button"
                                  onClick={() => {
                                    setJobPostingUrl(job.apply_url);
                                    setCompany(job.company);
                                    setJobTitle(job.title);
                                    setLocation(job.location || '');
                                  }}
                                  style={{
                                    flex: '0 0 148px', width: 148,
                                    borderRadius: 3, overflow: 'hidden',
                                    background: '#FAFBFF', border: '1px solid #E2E8F0',
                                    cursor: 'pointer', textAlign: 'left',
                                    transition: 'border-color .15s, box-shadow .15s, transform .15s',
                                    fontFamily: 'inherit', padding: 0,
                                  }}
                                  onMouseEnter={e => {
                                    const el = e.currentTarget as HTMLButtonElement;
                                    el.style.borderColor = '#93C5FD';
                                    el.style.boxShadow = '0 2px 8px rgba(59,130,246,0.10)';
                                    el.style.transform = 'scale(1.02)';
                                  }}
                                  onMouseLeave={e => {
                                    const el = e.currentTarget as HTMLButtonElement;
                                    el.style.borderColor = '#E2E8F0';
                                    el.style.boxShadow = 'none';
                                    el.style.transform = 'scale(1)';
                                  }}
                                >
                                  {/* Accent bar */}
                                  <div style={{ height: 3, background: accent }} />

                                  {/* Card body */}
                                  <div style={{ padding: '10px 12px 12px' }}>
                                    {/* Logo */}
                                    <div style={{ marginBottom: 8 }}>
                                      {logoUrl ? (
                                        <img
                                          src={logoUrl}
                                          alt=""
                                          style={{ width: 32, height: 32, borderRadius: 3, objectFit: 'contain', background: '#fff' }}
                                          onError={e => {
                                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                                            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                            if (fallback) fallback.style.display = 'flex';
                                          }}
                                        />
                                      ) : null}
                                      <div style={{
                                        width: 32, height: 32, borderRadius: 3,
                                        background: `${accent}18`, color: accent,
                                        fontSize: 13, fontWeight: 600,
                                        display: logoUrl ? 'none' : 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                      }}>
                                        {initial}
                                      </div>
                                    </div>

                                    {/* Company name */}
                                    <div style={{
                                      fontSize: 13, fontWeight: 500, color: '#0F172A',
                                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                      marginBottom: 3,
                                    }}>
                                      {job.company}
                                    </div>

                                    {/* Job title */}
                                    <div style={{
                                      fontSize: 11, color: '#64748B', lineHeight: 1.35,
                                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden', minHeight: 30,
                                      marginBottom: 8,
                                    }}>
                                      {job.title}
                                    </div>

                                    {/* CTA */}
                                    <div style={{ fontSize: 11, color: '#3B82F6', fontWeight: 500 }}>
                                      Find hiring manager →
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Divider */}
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 12, marginTop: 14,
                          }}>
                            <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                            <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap' }}>or paste a job URL</span>
                            <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                          </div>
                        </div>
                      )}

                      {/* Search input */}
                      <div style={{ marginBottom: 14 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            padding: '16px 20px',
                            border: '1.5px solid transparent',
                            borderRadius: 14,
                            background: '#F0F7FF',
                            transition: 'all .15s',
                            minHeight: 110,
                          }}
                          className="focus-within:border-[#2563EB] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
                        >
                          <Link style={{ width: 16, height: 16, flexShrink: 0, color: '#3B82F6', marginTop: 1 }} />
                          <input
                            type="url"
                            value={jobPostingUrl}
                            onChange={(e) => {
                              setJobPostingUrl(e.target.value);
                              if (e.target.value.trim()) {
                                setShowManualEntry(false);
                              }
                            }}
                            placeholder="Paste a job posting URL (LinkedIn, Greenhouse, Lever, etc.)"
                            disabled={isSearching}
                            style={{
                              flex: 1,
                              border: 'none',
                              background: 'none',
                              fontSize: 14,
                              color: '#0F172A',
                              outline: 'none',
                              fontFamily: 'inherit',
                              lineHeight: 1.5,
                            }}
                          />
                          {jobPostingUrl && isValidUrl(jobPostingUrl) && (
                            <CheckCircle style={{ width: 15, height: 15, flexShrink: 0, color: '#22C55E', marginTop: 1 }} />
                          )}
                        </div>
                      </div>

                      {/* Credit cost pill */}
                      <div style={{ marginBottom: 14 }}>
                        <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-[#FAFBFF] border border-[#E2E8F0] font-medium text-[#0F172A]">
                            {15 * estimatedManagers} credits
                          </span>
                          <span>· finds ~{estimatedManagers} hiring managers</span>
                        </div>
                      </div>

                      {/* Manual entry toggle — subtle text link */}
                      <div style={{ marginBottom: 14 }}>
                        <button
                          type="button"
                          onClick={() => setShowManualEntry(!showManualEntry)}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#64748B',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          {showManualEntry ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
                          {showManualEntry ? 'Hide manual entry' : 'Or enter details manually'}
                        </button>
                      </div>

                      {/* Manual Entry Section - Collapsible */}
                      {showManualEntry && !jobPostingUrl && (
                        <div style={{ marginBottom: 16, paddingTop: 16, borderTop: '0.5px solid #E2E8F0' }}>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', marginBottom: 4 }}>Company</label>
                              <input
                                type="text"
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                                placeholder="e.g. Google"
                                disabled={isSearching}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: '1.5px solid #E2E8F0',
                                  borderRadius: 3,
                                  fontSize: 13,
                                  color: '#0F172A',
                                  background: '#FAFBFF',
                                  outline: 'none',
                                  fontFamily: 'inherit',
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', marginBottom: 4 }}>Job Title</label>
                              <input
                                type="text"
                                value={jobTitle}
                                onChange={(e) => setJobTitle(e.target.value)}
                                placeholder="e.g. Product Manager"
                                disabled={isSearching}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: '1.5px solid #E2E8F0',
                                  borderRadius: 3,
                                  fontSize: 13,
                                  color: '#0F172A',
                                  background: '#FAFBFF',
                                  outline: 'none',
                                  fontFamily: 'inherit',
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', marginBottom: 4 }}>Location</label>
                              <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="e.g. New York, NY"
                                disabled={isSearching}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: '1.5px solid #E2E8F0',
                                  borderRadius: 3,
                                  fontSize: 13,
                                  color: '#0F172A',
                                  background: '#FAFBFF',
                                  outline: 'none',
                                  fontFamily: 'inherit',
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', marginBottom: 4 }}>
                              Job Description <span style={{ color: '#EF4444' }}>*</span>
                            </label>
                            <textarea
                              value={jobDescription}
                              onChange={(e) => setJobDescription(e.target.value)}
                              placeholder="Paste the job description or role summary here."
                              rows={4}
                              disabled={isSearching}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1.5px solid #E2E8F0',
                                borderRadius: 3,
                                fontSize: 13,
                                color: '#0F172A',
                                background: '#FAFBFF',
                                outline: 'none',
                                resize: 'none',
                                fontFamily: 'inherit',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* CTA button */}
                      <button
                        ref={originalButtonRef}
                        onClick={handleFindHiringManagers}
                        disabled={!canSearch}
                        style={{
                          width: '100%',
                          height: 52,
                          borderRadius: 12,
                          background: !canSearch ? '#E2E8F0' : '#2563EB',
                          color: !canSearch ? '#94A3B8' : '#fff',
                          border: 'none',
                          fontSize: 15,
                          fontWeight: 600,
                          cursor: !canSearch ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          transition: 'all .15s',
                          fontFamily: 'inherit',
                        }}
                      >
                        {isSearching ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Finding hiring managers...</span>
                          </>
                        ) : (
                          <>
                            <Users className="w-4 h-4" />
                            <span>Find hiring managers</span>
                          </>
                        )}
                      </button>

                      {/* Resume status — subtle text line below CTA */}
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                        {savedResumeUrl && savedResumeFileName ? (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isSearching || isUploadingResume}
                            style={{
                              fontSize: 11,
                              color: '#94A3B8',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer',
                              background: 'none',
                              border: 'none',
                              fontFamily: 'inherit',
                            }}
                          >
                            <CheckCircle style={{ width: 11, height: 11, color: '#22C55E' }} />
                            Resume: <span style={{ fontWeight: 500 }}>{savedResumeFileName}</span>
                            <span style={{ color: '#3B82F6', marginLeft: 2 }}>
                              {isUploadingResume ? 'Uploading...' : '· Change'}
                            </span>
                          </button>
                        ) : (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                              fontSize: 11,
                              color: '#94A3B8',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer',
                              background: 'none',
                              border: 'none',
                              fontFamily: 'inherit',
                            }}
                          >
                            <Upload style={{ width: 11, height: 11 }} />
                            {isUploadingResume ? 'Uploading...' : 'Upload resume (required for personalized emails)'}
                          </button>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* TAB 2: Hiring Manager Tracker */}
                  <TabsContent value="hiring-manager-tracker" className="mt-0">
                    <div className="animate-fadeInUp" style={{ animationDelay: '200ms', maxWidth: '900px', margin: '0 auto' }}>
                      <div className="py-4">
                        <RecruiterSpreadsheet key={refreshKey} />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </main>
          </ProGate>

        {/* Loading Modal */}
        {isSearching && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-[3px] p-8 max-w-md text-center">
              <div className="w-16 h-16 bg-[#FAFBFF] rounded-[3px] flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-[#0F172A] animate-pulse" />
              </div>
              <h3 className="text-xl font-semibold text-[#0F172A] mb-2" style={{ fontFamily: "'Lora', Georgia, serif" }}>Finding hiring managers...</h3>
              <p className="text-[#6B7280] mb-4">
                {jobPostingUrl
                  ? "Analyzing the job posting and identifying decision makers"
                  : `Searching for hiring managers at ${company}`
                }
              </p>
              <div className="w-full bg-[#E2E8F0] rounded-[3px] h-2">
                <div
                  className="bg-[#3B82F6] h-2 rounded-[3px] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-[#6B7280] mt-3">This usually takes 15-30 seconds</p>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {searchComplete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-[3px] p-8 max-w-md text-center animate-scaleIn">
              <div className="w-16 h-16 bg-green-100 rounded-[3px] flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-[#0F172A] mb-1" style={{ fontFamily: "'Lora', Georgia, serif" }}>Found {managersFound} hiring manager{managersFound !== 1 ? 's' : ''}!</h3>
              <p className="text-[#6B7280] mb-2">{jobTitle || 'Role'} at {company || 'Company'}</p>
              <p className="text-sm text-[#6B7280] font-medium mb-6">Draft emails saved to your Gmail</p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleViewResults}
                  className="px-6 py-3 bg-[#3B82F6] text-white font-semibold rounded-[3px] hover:bg-[#2563EB] transition-all"
                >
                  View Hiring Managers →
                </button>
                <button
                  onClick={resetForm}
                  className="px-6 py-3 bg-[#FAFBFF] text-[#6B7280] font-semibold rounded-[3px] hover:bg-[#EEF2F8] transition-colors"
                >
                  Search again
                </button>
              </div>
            </div>
          </div>
        )}

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
          buttonClassName="rounded-[3px]"
        >
          <span>Find Hiring Managers</span>
        </StickyCTA>
      )}
    </>
  );

  if (embedded) {
    return embeddedContent;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          {embeddedContent}
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default RecruiterSpreadsheetPage;