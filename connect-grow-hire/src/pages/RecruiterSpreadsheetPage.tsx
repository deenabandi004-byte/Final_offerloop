// src/pages/RecruiterSpreadsheetPage.tsx
import React, { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react';
import RecruiterSpreadsheet from '@/components/RecruiterSpreadsheet';
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from "@/hooks/use-toast";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import { Mail, Download } from "lucide-react";

// Stripe-style Tabs Component with animated underline
interface StripeTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { id: string; label: string }[];
}

const StripeTabs: React.FC<StripeTabsProps> = ({ activeTab, onTabChange, tabs }) => {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const activeIndex = tabs.findIndex(tab => tab.id === activeTab);
    const activeTabRef = tabRefs.current[activeIndex];
    
    if (activeTabRef) {
      const { offsetLeft, offsetWidth } = activeTabRef;
      setIndicatorStyle({ left: offsetLeft, width: offsetWidth });
    }
  }, [activeTab, tabs]);

  return (
    <div className="relative">
      <div className="flex items-center gap-8">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[index] = el; }}
            onClick={() => onTabChange(tab.id)}
            className={`
              relative pb-3 text-sm font-medium transition-colors duration-150
              focus:outline-none focus-visible:outline-none
              ${activeTab === tab.id 
                ? 'text-[#3B82F6]' 
                : 'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gray-200" />
      <div
        className="absolute bottom-0 h-[2px] bg-[#3B82F6] transition-all duration-200 ease-out"
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
      />
    </div>
  );
};

const RecruiterSpreadsheetPage: React.FC = () => {
  const { user } = useFirebaseAuth();
  const [activeTab, setActiveTab] = useState('find-hiring-managers');
  
  // Resume state
  const [savedResumeUrl, setSavedResumeUrl] = useState<string | null>(null);
  const [savedResumeFileName, setSavedResumeFileName] = useState<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  
  // Form state
  const [jobPostingUrl, setJobPostingUrl] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [location, setLocation] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [estimatedManagers, setEstimatedManagers] = useState(2);

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
      const formData = new FormData();
      formData.append('resume', file);
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
    if (!canSearch) return;
    setIsSearching(true);
    // TODO: Call backend workflow
    // For now, just show a toast
    toast({
      title: "Finding hiring managers...",
      description: "This feature will connect to the backend workflow.",
    });
    setTimeout(() => {
      setIsSearching(false);
      setActiveTab('hiring-manager-tracker');
    }, 2000);
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader />

          <main className="bg-white min-h-screen">
            <div className="max-w-5xl mx-auto px-8 pt-8 pb-16">
              {/* Page Title */}
              <h1 className="text-2xl font-bold text-gray-900 mb-6">Find Hiring Managers</h1>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <StripeTabs 
                  activeTab={activeTab} 
                  onTabChange={setActiveTab}
                  tabs={[
                    { id: 'find-hiring-managers', label: 'Find Hiring Managers' },
                    { id: 'hiring-manager-tracker', label: 'Hiring Manager Tracker' },
                  ]}
                />

                <div className="pb-8 pt-6">
                  {/* TAB 1: Find Hiring Managers */}
                  <TabsContent value="find-hiring-managers" className="mt-0">
                    {/* Section 1: Job Posting URL (Primary) */}
                    <div className="mb-8">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">
                        Primary Method
                      </p>
                      <h2 className="text-lg font-semibold text-gray-900 mb-2">
                        Job posting URL
                      </h2>
                      <p className="text-sm text-gray-500 mb-4">
                        Paste a job posting and we'll find the relevant hiring managers, draft personalized outreach emails, and save everything to your drafts and Hiring Manager Tracker.
                      </p>
                      <input
                        type="text"
                        value={jobPostingUrl}
                        onChange={(e) => setJobPostingUrl(e.target.value)}
                        placeholder="Paste the job posting URL (LinkedIn, Greenhouse, Lever, etc.)"
                        disabled={isSearching}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      />
                    </div>

                    {/* Divider */}
                    <div className="border-t border-gray-200 my-10"></div>

                    {/* Section 2: Manual Details (Backup) */}
                    <div className="mb-8">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">
                        Manual Method (If No Job Posting URL)
                      </p>
                      <h2 className="text-lg font-semibold text-gray-900 mb-2">
                        Manual details
                      </h2>
                      <p className="text-sm text-gray-500 mb-4">
                        Use this if a job posting URL isn't available. We'll use these details to identify the most relevant hiring managers.
                      </p>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium mb-2 text-gray-700">
                            Company <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            placeholder="e.g. Google, Stripe"
                            disabled={isSearching}
                            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2 text-gray-700">
                            Job Title <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={jobTitle}
                            onChange={(e) => setJobTitle(e.target.value)}
                            placeholder="e.g. Product Manager"
                            disabled={isSearching}
                            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2 text-gray-700">
                            Location <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="e.g. New York, NY"
                            disabled={isSearching}
                            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-gray-700">
                          Job Description <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={jobDescription}
                          onChange={(e) => setJobDescription(e.target.value)}
                          placeholder="Paste the job description or role summary here. This helps us identify the correct hiring managers."
                          rows={4}
                          disabled={isSearching}
                          className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 resize-none"
                        />
                      </div>
                    </div>

                    {/* Cost Summary */}
                    <div className="mb-8">
                      <p className="text-sm text-gray-500">
                        This will find <span className="font-medium text-blue-600">{estimatedManagers}</span> hiring {estimatedManagers === 1 ? 'manager' : 'managers'} • Cost: <span className="font-medium text-blue-600">{15 * estimatedManagers}</span> credits
                      </p>
                    </div>

                    {/* Primary CTA */}
                    <div className="mb-6">
                      <Button
                        onClick={handleFindHiringManagers}
                        disabled={!canSearch}
                        size="lg"
                        className="text-white font-medium px-8 transition-all hover:opacity-90"
                        style={{ background: '#3B82F6' }}
                      >
                        {isSearching ? "Finding..." : "Find Hiring Managers"}
                      </Button>
                    </div>

                    {/* Post-Action Helper Text */}
                    <div className="flex items-center gap-6 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span>Draft emails saved to Gmail</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Download className="h-4 w-4 text-gray-400" />
                        <span>Auto-saved to Hiring Manager Tracker</span>
                      </div>
                    </div>

                    {/* Resume Info Block */}
                    <div className="mt-10 pt-8 border-t border-gray-200">
                      <input
                        type="file"
                        accept={ACCEPTED_RESUME_TYPES.accept}
                        onChange={handleFileUpload}
                        className="hidden"
                        id="resume-upload-hm"
                        disabled={isSearching || isUploadingResume}
                      />
                      {savedResumeUrl && savedResumeFileName ? (
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-700">Resume on file</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const input = document.getElementById('resume-upload-hm') as HTMLInputElement;
                                  input?.click();
                                }}
                                disabled={isSearching || isUploadingResume}
                                className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isUploadingResume ? "Uploading..." : "Change"}
                              </button>
                            </div>
                            <p className="text-sm text-gray-500 mt-0.5">{savedResumeFileName}</p>
                            <p className="text-xs text-gray-400 mt-1">Improves match quality and email personalization</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500">No resume on file</span>
                          <button
                            type="button"
                            onClick={() => {
                              const input = document.getElementById('resume-upload-hm') as HTMLInputElement;
                              input?.click();
                            }}
                            disabled={isSearching || isUploadingResume}
                            className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isUploadingResume ? "Uploading..." : "Upload"}
                          </button>
                          <span className="text-xs text-gray-400">· Required to find hiring managers</span>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* TAB 2: Hiring Manager Tracker */}
                  <TabsContent value="hiring-manager-tracker" className="mt-0">
                    <RecruiterSpreadsheet />
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default RecruiterSpreadsheetPage;

