import React, { useState, useEffect, useMemo } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BackToHomeButton } from "@/components/BackToHomeButton";
import { CreditPill } from "@/components/credits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { Search, FileText, Upload, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
// ScoutBubble removed - now using ScoutHeaderButton in PageHeaderActions
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ContactDirectoryComponent from "@/components/ContactDirectory";
import { Progress } from "@/components/ui/progress";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { apiService, isErrorResponse } from "@/services/api";
import { firebaseApi } from "../services/firebaseApi";
import type { Contact as ContactApi } from '../services/firebaseApi';
import { toast } from "@/hooks/use-toast";
import { TIER_CONFIGS } from "@/lib/constants";
import { logActivity, generateContactSearchSummary } from "@/utils/activityLogger";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { PageHeaderActions } from "@/components/PageHeaderActions";

const ContactSearchPage: React.FC = () => {
  const { user, checkCredits, updateCredits } = useFirebaseAuth();
  const navigate = useNavigate();
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;

  const userTier: "free" | "pro" = useMemo(() => {
    if (effectiveUser?.tier === "pro") return "pro";
    const max = Number(effectiveUser?.maxCredits ?? 0);
    const credits = Number(effectiveUser?.credits ?? 0);
    if (max >= 1800 || credits > 150) return "pro";
    return "free";
  }, [effectiveUser?.tier, effectiveUser?.maxCredits, effectiveUser?.credits]);

  function isSearchResult(x: any): x is { contacts: any[]; successful_drafts?: number } {
    return x && Array.isArray(x.contacts);
  }

  // Form state
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [collegeAlumni, setCollegeAlumni] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [searchComplete, setSearchComplete] = useState(false);
  const [lastResults, setLastResults] = useState<any[]>([]);
  const [lastSearchStats, setLastSearchStats] = useState<{
    successful_drafts: number;
    total_contacts: number;
  } | null>(null);
  const hasResults = lastResults.length > 0;

  // Batch size state
  const [batchSize, setBatchSize] = useState<number>(1);
  
  const maxBatchSize = useMemo(() => {
    const tierMax = userTier === 'free' ? 3 : 8;
    const creditMax = Math.floor((effectiveUser.credits ?? 0) / 15);
    return Math.min(tierMax, creditMax);
  }, [userTier, effectiveUser.credits]);

  useEffect(() => {
    if (batchSize > maxBatchSize) {
      setBatchSize(Math.max(1, maxBatchSize));
    }
  }, [maxBatchSize, batchSize]);

  // Gmail state
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("contact-search");

  const currentTierConfig = TIER_CONFIGS[userTier];

  // Helper functions
  const stripUndefined = <T extends Record<string, any>>(obj: T) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

  const getUserProfileData = async () => {
    if (!user) return null;
    try {
      if (user?.uid) {
        const professionalInfo = await firebaseApi.getProfessionalInfo(user.uid);
        if (professionalInfo) {
          return {
            name: `${professionalInfo.firstName || ""} ${professionalInfo.lastName || ""}`.trim() || user.name || "",
            university: professionalInfo.university || "",
            major: professionalInfo.fieldOfStudy || "",
            year: professionalInfo.graduationYear || "",
            graduationYear: professionalInfo.graduationYear || "",
            degree: professionalInfo.currentDegree || "",
            careerInterests: professionalInfo.targetIndustries || [],
          };
        }
      }
      const professionalInfo = localStorage.getItem("professionalInfo");
      const resumeData = localStorage.getItem("resumeData");
      const prof = professionalInfo ? JSON.parse(professionalInfo) : {};
      const resume = resumeData ? JSON.parse(resumeData) : {};
      return {
        name: `${(prof.firstName || "")} ${(prof.lastName || "")}`.trim() || resume.name || user.name || "",
        university: prof.university || resume.university || "",
        major: prof.fieldOfStudy || resume.major || "",
        year: prof.graduationYear || resume.year || "",
        graduationYear: prof.graduationYear || resume.year || "",
        degree: prof.currentDegree || resume.degree || "",
        careerInterests: prof.targetIndustries || [],
      };
    } catch {
      return null;
    }
  };

  const autoSaveToDirectory = async (contacts: any[], searchLocation?: string) => {
    if (!user) return;
    try {
      const today = new Date().toLocaleDateString('en-US');
      const mapped: Omit<ContactApi, 'id'>[] = contacts.map((c: any) => {
        const derivedLocation = [c.City ?? '', c.State ?? ''].filter(Boolean).join(', ') || c.location || searchLocation || '';
        return stripUndefined({
          firstName: c.FirstName ?? c.firstName ?? '',
          lastName: c.LastName ?? c.lastName ?? '',
          linkedinUrl: c.LinkedIn ?? c.linkedinUrl ?? '',
          email: c.Email ?? c.email ?? '',
          company: c.Company ?? c.company ?? '',
          jobTitle: c.Title ?? c.jobTitle ?? '',
          college: c.College ?? c.college ?? '',
          location: derivedLocation,
          firstContactDate: today,
          status: 'Not Contacted',
          lastContactDate: today,
          emailSubject: c.email_subject ?? c.emailSubject ?? undefined,
          emailBody: c.email_body ?? c.emailBody ?? undefined,
          gmailThreadId: c.gmailThreadId ?? c.gmail_thread_id ?? undefined,
          gmailMessageId: c.gmailMessageId ?? c.gmail_message_id ?? undefined,
          gmailDraftId: c.gmailDraftId ?? c.gmail_draft_id ?? undefined,
          gmailDraftUrl: c.gmailDraftUrl ?? c.gmail_draft_url ?? undefined,
          hasUnreadReply: false,
          notificationsMuted: false,
        });
      });
      await firebaseApi.bulkCreateContacts(user.uid, mapped);
    } catch (error) {
      console.error('Error in autoSaveToDirectory:', error);
      throw error;
    }
  };

  const checkNeedsGmailConnection = async (): Promise<boolean> => {
    try {
      if (!user) return false;
      const { auth } = await import('../lib/firebase');
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return false;
      const token = await firebaseUser.getIdToken(true);
      const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5001' : 'https://www.offerloop.ai';
      const response = await fetch(`${API_BASE_URL}/api/google/gmail/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return true;
      const data = await response.json();
      return !data.connected;
    } catch (error) {
      console.error("Error checking Gmail status:", error);
      return true;
    }
  };

  const initiateGmailOAuth = async () => {
    try {
      const { auth } = await import('../lib/firebase');
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken(true);
      const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5001' : 'https://www.offerloop.ai';
      const response = await fetch(`${API_BASE_URL}/api/google/oauth/start`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.authUrl) {
        sessionStorage.setItem('gmail_oauth_return', window.location.pathname);
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error("Error initiating Gmail OAuth:", error);
    }
  };

  const generateAndDraftEmailsBatch = async (contacts: any[]) => {
    const { auth } = await import("../lib/firebase");
    const idToken = await auth.currentUser?.getIdToken(true);
    const API_BASE_URL = window.location.hostname === "localhost" ? "http://localhost:5001" : "https://www.offerloop.ai";
    const userProfile = await getUserProfileData();
    const res = await fetch(`${API_BASE_URL}/api/emails/generate-and-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ contacts, resumeText: "", userProfile, careerInterests: userProfile?.careerInterests || [] }),
    });
    const ct = res.headers.get("content-type") || "";
    const raw = await res.text();
    const data = raw ? (ct.includes("application/json") ? JSON.parse(raw) : { raw }) : {};
    if (res.status === 401) {
      if ((data as any)?.needsAuth && (data as any)?.authUrl) {
        window.location.href = (data as any).authUrl;
        return null;
      }
      throw new Error((data as any).error || "Gmail session expired — please reconnect.");
    }
    if (!res.ok) {
      throw new Error((data as any).error || `HTTP ${res.status}: ${res.statusText}`);
    }
    return data;
  };

  // Check Gmail status on mount
  useEffect(() => {
    const checkGmailStatus = async () => {
      if (!user) return;
      try {
        const connected = await checkNeedsGmailConnection();
        setGmailConnected(!connected);
      } catch {
        setGmailConnected(false);
      }
    };
    checkGmailStatus();
  }, [user]);

  // Scout job title suggestion handler
  const handleJobTitleSuggestion = (title: string, company?: string, location?: string) => {
    setJobTitle(title);
    if (company) setCompany(company);
    if (location) setLocation(location);
  };

  // File upload handler
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
      toast({ title: "Resume uploaded", description: file.name });
    }
  };

  // Search handler
  const handleSearch = async () => {
    if (!jobTitle.trim() || !location.trim()) {
      toast({
        title: "Missing Required Fields",
        description: "Please enter both job title and location.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to search for contacts.",
        variant: "destructive",
      });
      navigate("/signin");
      return;
    }

    const currentCredits = checkCredits ? await checkCredits() : (effectiveUser.credits ?? 0);
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
    setSearchComplete(false);

    try {
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

        const result = await apiService.runFreeSearch(searchRequest);
        if (!isSearchResult(result)) {
          toast({
            title: "Search Failed",
            description: (result as any)?.error || "Please try again.",
            variant: "destructive",
          });
          return;
        }

        const creditsUsed = result.contacts.length * 15;
        const newCredits = Math.max(0, currentCredits - creditsUsed);
        if (updateCredits) await updateCredits(newCredits).catch(() => {});

        setLastResults(result.contacts);
        setLastSearchStats({
          successful_drafts: result.successful_drafts ?? 0,
          total_contacts: result.contacts.length,
        });

        setProgressValue(100);
        setSearchComplete(true);

        // Log activity for contact search
        if (user?.uid && result.contacts.length > 0) {
          try {
            const summary = generateContactSearchSummary({
              jobTitle: jobTitle.trim(),
              company: company.trim() || undefined,
              location: location.trim(),
              college: collegeAlumni.trim() || undefined,
              contactCount: result.contacts.length,
            });
            await logActivity(user.uid, 'contactSearch', summary, {
              jobTitle: jobTitle.trim(),
              company: company.trim() || '',
              location: location.trim(),
              collegeAlumni: collegeAlumni.trim() || '',
              contactCount: result.contacts.length,
              tier: 'free',
            });
          } catch (error) {
            console.error('Failed to log contact search activity:', error);
          }
        }

        try {
          await autoSaveToDirectory(result.contacts, location.trim());
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. ${newCredits} credits remaining.`,
            duration: 5000,
          });
        } catch (error) {
          console.error("Failed to save contacts:", error);
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits.`,
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
            if (checkCredits) await checkCredits();
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
        if (updateCredits) await updateCredits(newCredits);

        setLastResults(result.contacts);
        setLastSearchStats({
          successful_drafts: result.successful_drafts,
          total_contacts: result.contacts.length,
        });

        setProgressValue(100);
        setSearchComplete(true);
        
        // Log activity for contact search
        if (user?.uid && result.contacts.length > 0) {
          try {
            const summary = generateContactSearchSummary({
              jobTitle: jobTitle.trim(),
              company: company.trim() || undefined,
              location: location.trim(),
              college: collegeAlumni.trim() || undefined,
              contactCount: result.contacts.length,
            });
            await logActivity(user.uid, 'contactSearch', summary, {
              jobTitle: jobTitle.trim(),
              company: company.trim() || '',
              location: location.trim(),
              collegeAlumni: collegeAlumni.trim() || '',
              contactCount: result.contacts.length,
              tier: 'pro',
            });
          } catch (error) {
            console.error('Failed to log contact search activity:', error);
          }
        }
        
        try {
          await generateAndDraftEmailsBatch(result.contacts);
        } catch (emailError: any) {
          if (emailError?.needsAuth || emailError?.require_reauth) {
            const authUrl = emailError.authUrl;
            if (authUrl) {
              window.location.href = authUrl;
              return;
            }
          }
        }

        try {
          await autoSaveToDirectory(result.contacts, location.trim());
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits. ${newCredits} credits remaining.`,
            duration: 5000,
          });
        } catch (error) {
          console.error('Failed to save contacts:', error);
          toast({
            title: "Search Complete!",
            description: `Found ${result.contacts.length} contacts. Used ${creditsUsed} credits.`,
            variant: "destructive",
            duration: 5000,
          });
        }
      }
    } catch (error: any) {
      console.error("Search failed:", error);
      if (error?.needsAuth || error?.require_reauth) {
        const authUrl = error.authUrl;
        if (authUrl) {
          toast({
            title: "Gmail Connection Expired",
            description: error.message || "Please reconnect your Gmail account to create drafts.",
            variant: "destructive",
            duration: 5000,
          });
          if (error.contacts && error.contacts.length > 0) {
            try {
              await autoSaveToDirectory(error.contacts, location.trim());
            } catch (saveError) {
              console.error("Failed to save contacts before redirect:", saveError);
            }
          }
          window.location.href = authUrl;
          return;
        }
      }
      toast({
        title: "Search Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
        duration: 5000,
      });
      setSearchComplete(false);
    } finally {
      setIsSearching(false);
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

  // CSV Export function for Contact Search Results (currently unused)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExportCsv = () => {
    if (!lastResults || lastResults.length === 0) {
      return;
    }

    // Define CSV headers based on Contact interface
    const headers = [
      'First Name',
      'Last Name',
      'Email',
      'Work Email',
      'Personal Email',
      'LinkedIn',
      'Job Title',
      'Company',
      'City',
      'State',
      'College',
      'Phone',
      'Email Subject',
      'Email Body'
    ] as const;

    const headerRow = headers.join(',');

    // Map contacts to CSV rows
    const rows = lastResults.map((contact: any) => {
      const escapeCsv = (val: string | undefined | null) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escapeCsv(contact.FirstName || contact.firstName),
        escapeCsv(contact.LastName || contact.lastName),
        escapeCsv(contact.Email || contact.email),
        escapeCsv(contact.WorkEmail || contact.workEmail),
        escapeCsv(contact.PersonalEmail || contact.personalEmail),
        escapeCsv(contact.LinkedIn || contact.linkedinUrl),
        escapeCsv(contact.Title || contact.jobTitle),
        escapeCsv(contact.Company || contact.company),
        escapeCsv(contact.City || contact.city),
        escapeCsv(contact.State || contact.state),
        escapeCsv(contact.College || contact.college),
        escapeCsv(contact.Phone || contact.phone),
        escapeCsv(contact.email_subject || contact.emailSubject),
        escapeCsv(contact.email_body || contact.emailBody)
      ].join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `contacts_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "CSV Exported!",
      description: `Exported ${lastResults.length} contacts to CSV.`,
    });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-transparent text-foreground">
        <AppSidebar />

        <div className="flex-1">
          <header className="h-16 flex items-center justify-between border-b border-gray-100/30 px-6 bg-transparent shadow-sm relative z-20">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-foreground hover:bg-secondary" />
              <h1 className="text-xl font-semibold">Contact Search</h1>
            </div>
            <PageHeaderActions onJobTitleSuggestion={handleJobTitleSuggestion} />
          </header>

          <main className="p-8 bg-transparent">
            <div className="max-w-5xl mx-auto">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex justify-center mb-8">
                  <TabsList className="h-14 tabs-container-gradient border border-border grid grid-cols-2 max-w-lg w-full rounded-xl p-1 bg-white">
                    <TabsTrigger
                      value="contact-search"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <Search className="h-5 w-5 mr-2" />
                      Contact Search
                    </TabsTrigger>
                    <TabsTrigger
                      value="contact-library"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <FileText className="h-5 w-5 mr-2" />
                      Contact Library
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="contact-search" className="mt-6">
                  {/* Gmail Connection Status */}
                  <Card className="mb-6 bg-white border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${gmailConnected ? 'bg-blue-500' : 'bg-yellow-500'}`} />
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {gmailConnected ? 'Gmail Connected' : 'Gmail Not Connected'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {gmailConnected 
                                ? 'Email drafts will be created in your Gmail' 
                                : 'Connect Gmail to create email drafts automatically'}
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={() => initiateGmailOAuth()}
                          variant={gmailConnected ? "outline" : "default"}
                          size="sm"
                          className={gmailConnected 
                            ? "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50" 
                            : " text-white shadow-sm"}
                          style={!gmailConnected ? { background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' } : undefined}
                        >
                          {gmailConnected ? 'Reconnect' : 'Connect Gmail'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white border-border">
                    <CardHeader className="border-b border-border">
                      <CardTitle className="text-xl text-foreground">
                        Professional Search Filters<span className="text-sm text-muted-foreground">- I want to network with...</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium mb-2 text-foreground">
                            Job Title <span className="text-destructive">*</span>
                          </label>
                          <AutocompleteInput
                            value={jobTitle}
                            onChange={setJobTitle}
                            placeholder="e.g. Analyst, unsure of exact title in company? Ask Scout"
                            dataType="job_title"
                            disabled={isSearching}
                            className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-purple-500 hover:border-purple-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 text-foreground">Company</label>
                          <AutocompleteInput
                            value={company}
                            onChange={setCompany}
                            placeholder="e.g. Google, Meta, or any preferred firm"
                            dataType="company"
                            disabled={isSearching}
                            className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-purple-500 hover:border-purple-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 text-foreground">
                            Location <span className="text-destructive">*</span>
                          </label>
                          <AutocompleteInput
                            value={location}
                            onChange={setLocation}
                            placeholder="e.g. Los Angeles, CA, New York, NY, city of office"
                            dataType="location"
                            disabled={isSearching}
                            className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-purple-500 hover:border-purple-400 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 text-foreground">
                            College Alumni
                          </label>
                          <AutocompleteInput
                            value={collegeAlumni}
                            onChange={setCollegeAlumni}
                            placeholder="e.g. Stanford, USC, preferred college they attended"
                            dataType="school"
                            disabled={isSearching}
                            className="bg-white border-input text-foreground placeholder:text-muted-foreground focus:border-purple-500 hover:border-purple-400 transition-colors"
                          />
                        </div>
                      </div>

                      <div className="col-span-1 lg:col-span-2 mt-4">
                        <div className="flex items-center gap-2 mb-4">
                          <label className="text-sm font-medium text-foreground">
                            Email Batch Size
                          </label>
                          <span className="text-sm text-muted-foreground">
                            - Choose how many contacts to generate per search
                          </span>
                        </div>

                        <div className="bg-muted/30 rounded-xl p-6 border border-border shadow-lg">
                          <div className="flex items-center gap-6">
                            <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-400/40 rounded-xl px-4 py-3 min-w-[70px] text-center shadow-inner">
                              <span className="text-2xl font-bold bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">
                                {batchSize}
                              </span>
                            </div>

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
                                    [&::-webkit-slider-thumb]:shadow-[0_0_20px_rgba(59,130,246,0.6)] 
                                    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-400
                                    [&::-webkit-slider-thumb]:hover:shadow-[0_0_25px_rgba(59,130,246,0.8)] 
                                    [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-200
                                    [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 
                                    [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white
                                    [&::-moz-range-thumb]:shadow-[0_0_20px_rgba(59,130,246,0.6)] 
                                    [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-400"
                                  style={{
                                    background: `linear-gradient(to right, 
                                      rgba(59, 130, 246, 0.8) 0%, 
                                      rgba(96, 165, 250, 0.8) ${((batchSize - 1) / (maxBatchSize - 1)) * 100}%, 
                                      rgba(55, 65, 81, 0.3) ${((batchSize - 1) / (maxBatchSize - 1)) * 100}%, 
                                      rgba(55, 65, 81, 0.3) 100%)`
                                  }}
                                />

                                <div className="flex justify-between text-xs text-muted-foreground mt-3 font-medium">
                                  <span>1</span>
                                  <span>{maxBatchSize}</span>
                                </div>
                              </div>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl px-4 py-3 min-w-[100px] border border-blue-400/20">
                              <div className="text-center">
                                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{batchSize * 15}</span>
                                <span className="text-sm text-blue-600/70 dark:text-blue-400/70 ml-2">credits</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {maxBatchSize < (userTier === 'free' ? 3 : 8) && (
                          <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                            <p className="text-xs text-yellow-700 flex items-start gap-2">
                              <span>Warning</span>
                              <span>Limited by available credits. Maximum: {maxBatchSize} contacts.</span>
                            </p>
                          </div>
                        )}
                      </div>

                      {userTier === "pro" && (
                        <div className="mb-6">
                          <label className="block text-sm font-medium mb-2 text-foreground">
                            Resume <span className="text-destructive">*</span> (Required for Pro tier AI similarity matching)
                          </label>
                          <div className="border-2 border-dashed border-input rounded-lg p-4 text-center hover:border-purple-400 transition-colors bg-muted/30">
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
                              className={`cursor-pointer ${isSearching ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                              <p className="text-sm text-foreground mb-1">
                                {uploadedFile
                                  ? uploadedFile.name
                                  : "Upload resume for AI similarity matching (Required for Pro)"}
                              </p>
                              <p className="text-xs text-muted-foreground">PDF only, max 10MB</p>
                            </label>
                          </div>
                        </div>
                      )}

                      <div className="space-y-4 mt-8">
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
                          className=" text-white font-medium px-8 transition-all hover:scale-105 shadow-sm"
                          style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
                        >
                          {isSearching ? "Searching..." : "Find Contacts"}
                        </Button>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Download className="h-4 w-4" />
                            <span>Up to {currentTierConfig.maxContacts} contacts + emails</span>
                          </div>
                          <span className="text-muted-foreground">•</span>
                          <span>Auto-saved to Contact Library</span>
                        </div>
                      </div>

                      {(isSearching || searchComplete) && (
                        <Card className="mt-6 bg-white border-border">
                          <CardContent className="p-6">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-foreground">
                                  {searchComplete ? (
                                    <span className="text-green-600 font-semibold">
                                      Search completed successfully!
                                    </span>
                                  ) : (
                                    `Searching with ${currentTierConfig.name} tier...`
                                  )}
                                </span>
                                <span className={searchComplete ? "text-green-600 font-bold" : "text-primary"}>
                                  {progressValue}%
                                </span>
                              </div>
                              <Progress value={progressValue} className="h-2" />
                              {searchComplete && (
                                <div className="mt-2 text-sm text-green-600">
                                  Check your Contact Library to view and manage your new contacts.
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {isSearching && !hasResults && (
                        <Card className="mt-6 bg-white border-border">
                          <CardContent className="p-6">
                            <LoadingSkeleton variant="contacts" count={3} />
                          </CardContent>
                        </Card>
                      )}

                      {hasResults && lastSearchStats && (
                        <div className="mt-4 p-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 border-2 border-green-500/50 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-base font-semibold text-green-700">
                              Search Completed Successfully!
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-3">
                            <div className="bg-blue-50 dark:bg-blue-500/10 rounded p-2 border border-blue-200/50 dark:border-blue-400/20">
                              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{lastResults.length}</div>
                              <div className="text-xs text-blue-600/70 dark:text-blue-400/70">Contacts Found</div>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-500/10 rounded p-2 border border-blue-200/50 dark:border-blue-400/20">
                              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{lastResults.length}</div>
                              <div className="text-xs text-blue-600/70 dark:text-blue-400/70">Email Drafts</div>
                            </div>
                          </div>
                          <div className="text-sm text-blue-700 mt-3 flex items-center">
                            <span className="mr-2">Saved</span>
                            All contacts saved to your Contact Library
                          </div>
                          <button 
                            onClick={() => setActiveTab('contact-library')}
                            className="mt-3 text-sm text-blue-600 hover:text-blue-700 underline"
                          >
                            View in Contact Library
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="contact-library" className="mt-6">
                  <ContactDirectoryComponent />
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ContactSearchPage;

