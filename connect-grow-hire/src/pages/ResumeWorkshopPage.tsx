/**
 * ResumeWorkshopPage - Resume optimization workspace
 * 
 * Route: /write/resume, /write/resume-library
 * Linear flow: Resume Preview → Score → Job Context → Actions
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppHeader } from '@/components/AppHeader';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  AlertCircle, 
  FileText, 
  Download, 
  ChevronDown,
  ChevronUp,
  Upload,
  Eye,
  ArrowRight,
  X,
  Link,
  Briefcase,
  Building2,
  MapPin,
  Sparkles,
  FolderOpen,
  CheckCircle,
  Copy,
  Check,
  Wrench
} from 'lucide-react';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { toast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { 
  tailorResume,
  getResumeLibrary,
  getLibraryEntry,
  deleteLibraryEntry,
  type TailorResult,
  type SuggestionItem,
  type ExperienceSuggestion,
  type SkillsSuggestion,
  type KeywordSuggestion,
  type LibraryEntry
} from '@/services/resumeWorkshop';

// PDF Preview Component
interface PDFPreviewProps {
  pdfUrl?: string | null;
  pdfBase64?: string | null;
  title?: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ pdfUrl, pdfBase64, title = 'PDF Preview' }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoadingBlob, setIsLoadingBlob] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  // Fetch PDF as blob when pdfUrl changes (skip if pdfBase64 is provided)
  useEffect(() => {
    if (pdfBase64) {
      // If we have base64, no need to fetch blob
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
      setIsLoadingBlob(false);
      return;
    }

    if (!pdfUrl) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
      setIsLoadingBlob(false);
      return;
    }

    // Fetch PDF as blob to bypass Content-Disposition header
    setIsLoadingBlob(true);
    
    fetch(pdfUrl)
      .then(response => response.blob())
      .then(blob => {
        // Clean up previous blob URL if it exists
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        // Force correct MIME type - Firebase returns application/octet-stream
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        blobUrlRef.current = url;
        setBlobUrl(url);
        setIsLoadingBlob(false);
      })
      .catch(err => {
        console.error('Failed to fetch PDF as blob:', err);
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
        setBlobUrl(null);
        setIsLoadingBlob(false);
      });

    // Cleanup: revoke object URL when component unmounts or URL changes
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [pdfUrl, pdfBase64]);

  // Determine the source URL - NEVER use pdfUrl directly, only blobUrl or base64
  const src = pdfBase64 
    ? `data:application/pdf;base64,${pdfBase64}` 
    : blobUrl || null;

  if (!src) {
    if (isLoadingBlob && pdfUrl) {
      return (
        <div className="border border-gray-200 rounded-xl p-8 bg-gray-50 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading PDF preview...</p>
        </div>
      );
    }
    return (
      <div className="border border-gray-200 rounded-xl p-8 bg-gray-50 text-center">
        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No resume to preview</p>
      </div>
    );
  }
  
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <iframe
        src={src}
        className="w-full h-[500px]"
        title={title}
      />
    </div>
  );
};

// Suggestion Card Component
interface SuggestionCardProps {
  current: string;
  suggested: string;
  why: string;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ current, suggested, why }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(suggested);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Current</p>
        <p className="text-sm text-gray-500">{current}</p>
      </div>
      
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Suggested</p>
        <p className="text-sm text-gray-900">{suggested}</p>
      </div>
      
      <div className="flex items-end justify-between pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-400 flex-1 pr-4">{why}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          className="rounded-lg"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

// Main Component
export default function ResumeWorkshopPage() {
  const { user, isLoading: authLoading, updateCredits } = useFirebaseAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const activeTab = location.pathname === '/write/resume-library' ? 'resume-library' : 'resume-workshop';

  const handleTabChange = (tabId: string) => {
    if (tabId === 'resume-library') {
      navigate('/write/resume-library');
    } else {
      navigate('/write/resume');
    }
  };
  
  // Resume data state
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [isLoadingResume, setIsLoadingResume] = useState(true);
  
  // Job context inputs
  const [jobUrl, setJobUrl] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jobLocation, setJobLocation] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [showManualInputs, setShowManualInputs] = useState(false);
  const [urlParseError, setUrlParseError] = useState<string | null>(null);
  
  // Tailor results - section-by-section suggestions
  const [tailorResults, setTailorResults] = useState<TailorResult | null>(null);
  const [isTailoring, setIsTailoring] = useState(false);
  
  // Library state
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<LibraryEntry | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  // Error state
  const [error, setError] = useState<string | null>(null);

  // Load user's resume
  const loadResume = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoadingResume(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        setResumeUrl(data.resumeUrl || null);
        setResumeFileName(data.resumeFileName || null);
      }
    } catch (err) {
      console.error('Failed to load resume:', err);
    } finally {
      setIsLoadingResume(false);
    }
  }, [user?.uid]);

  // Load resume library
  const loadLibrary = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoadingLibrary(true);
    try {
      const result = await getResumeLibrary();
      if (result.status === 'ok' && result.entries) {
        setLibraryEntries(result.entries);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [user?.uid]);

  useEffect(() => { loadResume(); }, [loadResume]);
  useEffect(() => { if (activeTab === 'resume-library') loadLibrary(); }, [activeTab, loadLibrary]);

  // Check if job context is provided
  const hasJobUrl = jobUrl.trim().length > 0;
  const hasJobDescription = jobDescription.trim().length > 0;
  const hasManualFields = hasJobDescription; // Only job description is required for manual entry
  const hasJobContext = hasJobUrl || hasManualFields;
  
  // Helper to get missing fields message
  const getMissingFieldsMessage = () => {
    if (hasJobUrl) return null;
    if (!hasJobDescription) return 'Missing: Job Description';
    return null;
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

  // Handle Tailor Resume
  const handleTailor = async () => {
    if (!user) return;
    
    // Validate job context - only job description is required for manual entry
    if (!jobUrl && !jobDescription.trim()) {
      toast({
        title: "Missing job details",
        description: "Please enter a job URL or provide a job description.",
        variant: "destructive",
      });
      return;
    }
    
    setIsTailoring(true);
    setTailorResults(null);
    setUrlParseError(null);
    setError(null);
    
    try {
      const result = await tailorResume({
        job_url: jobUrl || undefined,
        job_title: jobTitle || undefined,
        company: company || undefined,
        location: jobLocation || undefined,
        job_description: jobDescription || undefined,
      });
      
      if (result.status === 'error') {
        const message = result.message || 'Failed to analyze resume';
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        });
        
        if (message.includes("URL") || message.includes("parse")) {
          setUrlParseError(message);
        }
        return;
      }
      
      setTailorResults(result);
      
      if (result.credits_remaining !== undefined && updateCredits) {
        await updateCredits(result.credits_remaining);
      }
      
      toast({
        title: "Analysis complete!",
        description: `Your resume scored ${result.score}/100 for this role.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to analyze resume";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      
      if (message.includes("URL") || message.includes("parse")) {
        setUrlParseError(message);
      }
    } finally {
      setIsTailoring(false);
    }
  };

  const handleStartOver = () => {
    setTailorResults(null);
    setJobUrl('');
    setJobTitle('');
    setCompany('');
    setJobLocation('');
    setJobDescription('');
    setUrlParseError(null);
    setError(null);
  };


  // Library handlers
  const handleViewEntry = async (entry: LibraryEntry) => {
    if (entry.pdf_base64) { setPreviewEntry(entry); return; }
    setIsLoadingPreview(true);
    try {
      const result = await getLibraryEntry(entry.id);
      if (result.status === 'ok' && result.entry) setPreviewEntry(result.entry);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to load preview.', variant: 'destructive' });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDownloadEntry = async (entry: LibraryEntry) => {
    let pdfBase64 = entry.pdf_base64;
    if (!pdfBase64) {
      const result = await getLibraryEntry(entry.id);
      if (result.status === 'ok' && result.entry?.pdf_base64) pdfBase64 = result.entry.pdf_base64;
    }
    if (pdfBase64) {
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `${entry.display_name}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: 'Download Started', description: 'Your resume is being downloaded.' });
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await deleteLibraryEntry(entryId);
      setLibraryEntries(prev => prev.filter(e => e.id !== entryId));
      if (previewEntry?.id === entryId) setPreviewEntry(null);
      toast({ title: 'Deleted', description: 'Resume removed from library.' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
    }
  };

  // Score helpers
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreBadgeStyles = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-700';
    if (score >= 60) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    return 'Needs Work';
  };

  // Auth loading
  if (authLoading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full text-foreground">
          <AppSidebar />
          <MainContentWrapper>
            <AppHeader title="" />
            <main className="bg-gradient-to-b from-slate-50 via-white to-white min-h-screen">
              <div className="max-w-7xl mx-auto px-6 pt-10 pb-4">
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
                </div>
              </div>
            </main>
          </MainContentWrapper>
        </div>
      </SidebarProvider>
    );
  }

  if (!user) return null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          <main className="bg-gradient-to-b from-slate-50 via-white to-white min-h-screen">
            <div className="max-w-7xl mx-auto px-6 pt-10 pb-8">
              
              {/* Inspiring Header Section */}
              <div className="text-center mb-8 animate-fadeInUp">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Write Resumes
                </h1>
                <p className="text-gray-600 text-lg">
                  Optimize your resume to stand out and pass ATS screening.
                </p>
              </div>

              {/* Pill-style Tabs */}
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit mx-auto mb-8 animate-fadeInUp" style={{ animationDelay: '100ms' }}>
                  <button
                    onClick={() => handleTabChange('resume-workshop')}
                    className={`
                      flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                      ${activeTab === 'resume-workshop' 
                        ? 'bg-white text-cyan-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <Wrench className="w-4 h-4" />
                    Resume Workshop
                  </button>
                  
                  <button
                    onClick={() => handleTabChange('resume-library')}
                    className={`
                      flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                      ${activeTab === 'resume-library' 
                        ? 'bg-white text-cyan-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <FolderOpen className="w-4 h-4" />
                    Resume Library
                    {libraryEntries.length > 0 && (
                      <span className="ml-1 px-2 py-0.5 bg-cyan-100 text-cyan-700 text-xs font-semibold rounded-full">
                        {libraryEntries.length}
                      </span>
                    )}
                  </button>
                </div>

                <div className="animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                  {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                      <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                      <div className="flex-1"><p className="text-sm text-red-700">{error}</p></div>
                      <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">×</button>
                    </div>
                  )}

                  <TabsContent value="resume-workshop" className="mt-0">
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                      {/* Left Column - Resume Preview (3/5 width) */}
                      <div className="lg:col-span-3">
                          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-500 to-cyan-600"></div>
                            
                            <div className="p-6">
                              {/* Header */}
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-cyan-600" />
                                  </div>
                                  <div>
                                    <h2 className="font-semibold text-gray-900">Your Resume</h2>
                                    {resumeFileName && (
                                      <p className="text-sm text-gray-500">{resumeFileName}</p>
                                    )}
                                  </div>
                                </div>
                                
                                <button 
                                  onClick={() => navigate('/account-settings')}
                                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                                >
                                  <Upload className="w-4 h-4" />
                                  Upload New
                                </button>
                              </div>
                              
                              {/* PDF Viewer */}
                              {isLoadingResume ? (
                                <div className="border border-gray-200 rounded-xl p-8 bg-gray-50 text-center">
                                  <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mx-auto" />
                                </div>
                              ) : !resumeUrl ? (
                                <div 
                                  onClick={() => navigate('/account-settings')}
                                  className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-cyan-400 hover:bg-cyan-50/50 transition-all"
                                >
                                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                  <p className="font-medium text-gray-700 mb-2">No resume uploaded yet</p>
                                  <p className="text-sm text-gray-500 mb-4">Upload your resume to get started</p>
                                  <span className="px-4 py-2 bg-cyan-100 text-cyan-700 rounded-full text-sm font-medium">
                                    Upload Resume
                                  </span>
                                </div>
                              ) : (
                                <PDFPreview pdfUrl={resumeUrl} title={resumeFileName || 'Your Resume'} />
                              )}
                            </div>
                          </div>
                        </div>

                      {/* Right Column - Job Inputs or Results (2/5 width) */}
                      <div className="lg:col-span-2 space-y-6">
                        {!tailorResults ? (
                          <>
                            {/* Job Description Card */}
                            {resumeUrl && (
                            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                              <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-500 to-cyan-600"></div>
                              
                              <div className="p-6">
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center">
                                    <Briefcase className="w-5 h-5 text-cyan-600" />
                                  </div>
                                  <div>
                                    <h3 className="font-semibold text-gray-900">Job Description</h3>
                                    <p className="text-sm text-gray-500">For tailoring your resume</p>
                                  </div>
                                </div>
                                
                                <p className="text-sm text-gray-600 mb-4">
                                  Provide either a job description URL or fill out the manual fields.
                                </p>
                                
                                {/* Job Posting URL Input */}
                                <div className="mb-4">
                                  <label className="block text-sm font-medium text-gray-700 mb-2">Job Posting URL</label>
                                  <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                      <Link className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                      type="url"
                                      value={jobUrl}
                                      onChange={(e) => { setJobUrl(e.target.value); setUrlParseError(null); }}
                                      placeholder="https://linkedin.com/jobs/..."
                                      disabled={isTailoring}
                                      className={`block w-full pl-9 pr-10 py-3 border rounded-xl
                                                 text-gray-900 placeholder-gray-400 text-sm
                                                 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500
                                                 hover:border-gray-300 transition-all disabled:opacity-50
                                                 ${urlParseError ? 'border-red-300' : 'border-gray-200'}`}
                                    />
                                    {jobUrl && isValidUrl(jobUrl) && (
                                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                      </div>
                                    )}
                                  </div>
                                  {urlParseError && <p className="text-sm text-red-600 mt-1">{urlParseError}</p>}
                                </div>
                                
                                {/* Expandable Manual Entry */}
                                <div className="border-t border-gray-100 pt-4">
                                  <button
                                    onClick={() => setShowManualInputs(!showManualInputs)}
                                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                                    disabled={isTailoring}
                                  >
                                    {showManualInputs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    Or enter job details manually
                                  </button>
                                  
                                  {showManualInputs && (
                                    <div className="mt-4 space-y-4">
                                      {hasJobUrl && (
                                        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                                          <p className="text-xs text-blue-700">
                                            💡 Job URL detected. You can still edit the fields below or leave them to use the parsed values.
                                          </p>
                                        </div>
                                      )}
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Company</label>
                                        <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Building2 className="h-4 w-4 text-gray-400" />
                                          </div>
                                          <input
                                            type="text"
                                            value={company}
                                            onChange={(e) => setCompany(e.target.value)}
                                            placeholder="e.g. Google"
                                            disabled={isTailoring}
                                            className="block w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                                                       focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:bg-gray-50"
                                          />
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Job Title</label>
                                        <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Briefcase className="h-4 w-4 text-gray-400" />
                                          </div>
                                          <input
                                            type="text"
                                            value={jobTitle}
                                            onChange={(e) => setJobTitle(e.target.value)}
                                            placeholder="e.g. Product Manager"
                                            disabled={isTailoring}
                                            className="block w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                                                       focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:bg-gray-50"
                                          />
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                                        <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <MapPin className="h-4 w-4 text-gray-400" />
                                          </div>
                                          <input
                                            type="text"
                                            value={jobLocation}
                                            onChange={(e) => setJobLocation(e.target.value)}
                                            placeholder="e.g. San Francisco, CA"
                                            disabled={isTailoring}
                                            className="block w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                                                       focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:bg-gray-50"
                                          />
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Job Description</label>
                                        <textarea
                                          value={jobDescription}
                                          onChange={(e) => setJobDescription(e.target.value)}
                                          placeholder="Paste the job description here..."
                                          rows={4}
                                          disabled={isTailoring}
                                          className="block w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none
                                                     focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:bg-gray-50"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Action Buttons Card */}
                          {resumeUrl && (
                            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                              <div className="h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600"></div>
                              
                              <div className="p-6">
                                <h3 className="font-semibold text-gray-900 mb-4">Resume Actions</h3>
                                
                                <div className="space-y-3">
                                  {/* Tailor Resume Button */}
                                  <button
                                    onClick={handleTailor}
                                    disabled={isTailoring || !resumeUrl || !hasJobContext}
                                    className={`
                                      w-full py-4 px-6 rounded-xl font-semibold transition-all duration-200
                                      flex items-center justify-center gap-3
                                      ${hasJobContext && !isTailoring
                                        ? 'text-white bg-gradient-to-r from-purple-600 to-indigo-500 shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-100'
                                        : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                                      }
                                    `}
                                  >
                                    {isTailoring ? (
                                      <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-5 h-5" />
                                    )}
                                    {isTailoring ? 'Analyzing...' : 'Tailor Resume (5 credits)'}
                                  </button>
                                  
                                  {!hasJobContext && (
                                    <div className="text-xs text-gray-500 text-center space-y-1">
                                      <p>Requires a job description to tailor your resume</p>
                                      {getMissingFieldsMessage() && (
                                        <p className="text-amber-600 font-medium">
                                          {getMissingFieldsMessage()}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                {/* Cost info */}
                                <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                                  <p className="text-sm text-gray-500">
                                    Costs <span className="font-semibold text-gray-700">5 credits</span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                          </>
                        ) : (
                          <>
                            {/* Results Section */}
                            <div className="space-y-6">
                              {/* Score Card */}
                              <div className="flex items-center justify-between py-4 border-b border-gray-200">
                                <div>
                                  <p className="text-sm text-gray-500">Match Score for</p>
                                  <p className="font-medium text-gray-900">
                                    {tailorResults.job_context.job_title} at {tailorResults.job_context.company}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className={`text-3xl font-semibold ${getScoreColor(tailorResults.score)}`}>
                                    {tailorResults.score}
                                  </span>
                                  <span className="text-gray-400">/100</span>
                                </div>
                              </div>
                              
                              {/* Instructions */}
                              <p className="text-sm text-gray-500">
                                Copy the suggestions below into your resume. Each is tailored for this role.
                              </p>
                              
                              {/* Section-by-section suggestions */}
                              <div className="space-y-6">
                                {/* Summary Section */}
                                {tailorResults.sections.summary && (
                                  <div>
                                    <h3 className="text-sm font-medium text-gray-700 mb-3">Professional Summary</h3>
                                    <SuggestionCard
                                      current={tailorResults.sections.summary.current}
                                      suggested={tailorResults.sections.summary.suggested}
                                      why={tailorResults.sections.summary.why}
                                    />
                                  </div>
                                )}
                                
                                {/* Experience Section */}
                                {tailorResults.sections.experience && tailorResults.sections.experience.length > 0 && (
                                  <div className="space-y-4">
                                    <h3 className="text-sm font-medium text-gray-700">Experience</h3>
                                    {tailorResults.sections.experience.map((exp, index) => (
                                      <div key={index} className="space-y-3">
                                        <p className="text-sm text-gray-600">{exp.role} @ {exp.company}</p>
                                        {exp.bullets.map((bullet, bulletIndex) => (
                                          <SuggestionCard
                                            key={bulletIndex}
                                            current={bullet.current}
                                            suggested={bullet.suggested}
                                            why={bullet.why}
                                          />
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Skills Section */}
                                {tailorResults.sections.skills && (
                                  <div>
                                    <h3 className="text-sm font-medium text-gray-700 mb-3">Skills</h3>
                                    <div className="border border-gray-200 rounded-lg p-4 bg-white">
                                      {tailorResults.sections.skills.add.length > 0 && (
                                        <div className="mb-4">
                                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Add</p>
                                          <div className="space-y-2">
                                            {tailorResults.sections.skills.add.map((item, i) => (
                                              <div key={i} className="flex items-start gap-2 text-sm">
                                                <span className="text-blue-500">+</span>
                                                <span className="font-medium text-gray-900">{item.skill}</span>
                                                <span className="text-gray-500">— {item.reason}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {tailorResults.sections.skills.remove.length > 0 && (
                                        <div>
                                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Consider Removing</p>
                                          <div className="space-y-2">
                                            {tailorResults.sections.skills.remove.map((item, i) => (
                                              <div key={i} className="flex items-start gap-2 text-sm">
                                                <span className="text-gray-400">−</span>
                                                <span className="text-gray-600">{item.skill}</span>
                                                <span className="text-gray-400">— {item.reason}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Keywords Section */}
                                {tailorResults.sections.keywords && tailorResults.sections.keywords.length > 0 && (
                                  <div>
                                    <h3 className="text-sm font-medium text-gray-700 mb-3">Missing Keywords</h3>
                                    <div className="border border-gray-200 rounded-lg p-4 bg-white">
                                      <div className="space-y-2">
                                        {tailorResults.sections.keywords.map((kw, i) => (
                                          <div key={i} className="flex items-start gap-3 text-sm">
                                            <code className="text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded text-xs">{kw.keyword}</code>
                                            <span className="text-gray-500">{kw.where_to_add}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              {/* Start Over button */}
                              <Button
                                variant="outline"
                                onClick={handleStartOver}
                                className="w-full rounded-xl"
                              >
                                Tailor for a Different Job
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="resume-library" className="mt-0">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                      <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-500 to-cyan-600"></div>
                      
                      <div className="p-6">
                        {isLoadingLibrary ? (
                          <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
                          </div>
                        ) : libraryEntries.length === 0 ? (
                          <div className="text-center py-12">
                            <div className="w-16 h-16 bg-cyan-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              <FileText className="h-8 w-8 text-cyan-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Saved Resumes</h3>
                            <p className="text-gray-500 max-w-md mx-auto mb-6">
                              Tailored resumes will appear here after you apply recommendations.
                            </p>
                            <button 
                              onClick={() => handleTabChange('resume-workshop')} 
                              className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-teal-500 text-white font-semibold rounded-full hover:shadow-lg transition-all"
                            >
                              Go to Resume Workshop
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <h2 className="text-lg font-semibold text-gray-900">Saved Resumes ({libraryEntries.length})</h2>
                              {libraryEntries.map(entry => (
                                <div
                                  key={entry.id}
                                  className={`border rounded-xl p-4 bg-white transition-colors cursor-pointer ${
                                    previewEntry?.id === entry.id ? 'border-cyan-500 ring-1 ring-cyan-500' : 'border-gray-200 hover:border-cyan-300'
                                  }`}
                                  onClick={() => handleViewEntry(entry)}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                      <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="h-5 w-5 text-cyan-600" />
                                      </div>
                                      <div>
                                        <h4 className="font-medium text-gray-900">{entry.display_name}</h4>
                                        <p className="text-sm text-gray-600">{entry.job_title} at {entry.company}</p>
                                        <div className="flex items-center gap-3 mt-2">
                                          <span className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleDateString()}</span>
                                          {entry.score && (
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                              entry.score >= 80 ? 'bg-green-100 text-green-700' :
                                              entry.score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                            }`}>Score: {entry.score}</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleViewEntry(entry); }} className="rounded-lg">
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleDownloadEntry(entry); }} className="rounded-lg">
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            <div>
                              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
                              {isLoadingPreview ? (
                                <div className="border border-gray-200 rounded-xl p-8 bg-gray-50 text-center">
                                  <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mx-auto" />
                                </div>
                              ) : previewEntry ? (
                                <div className="space-y-4">
                                  <PDFPreview pdfBase64={previewEntry.pdf_base64} title={previewEntry.display_name} />
                                  <Button variant="outline" className="w-full rounded-xl" onClick={() => handleDownloadEntry(previewEntry)}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download PDF
                                  </Button>
                                </div>
                              ) : (
                                <div className="border border-gray-200 rounded-xl p-8 bg-gray-50 text-center">
                                  <Eye className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                                  <p className="text-gray-500">Click on a resume to preview it</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </main>
        </MainContentWrapper>
      </div>
      
    </SidebarProvider>
  );
}
