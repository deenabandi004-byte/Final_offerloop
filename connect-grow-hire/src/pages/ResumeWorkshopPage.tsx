/**
 * ResumeWorkshopPage - Resume optimization workspace
 * 
 * Route: /write/resume, /write/resume-library
 * Linear flow: Resume Preview → Score → Job Context → Actions
 */
import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppHeader } from '@/components/AppHeader';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  X
} from 'lucide-react';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { toast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { 
  fixResume,
  scoreResume,
  tailorResume,
  applyRecommendation,
  replaceMainResume,
  getResumeLibrary,
  getLibraryEntry,
  deleteLibraryEntry,
  type Recommendation,
  type ScoreCategory,
  type JobContext,
  type LibraryEntry
} from '@/services/resumeWorkshop';

// Stripe-style Tabs Component
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
      setIndicatorStyle({ left: activeTabRef.offsetLeft, width: activeTabRef.offsetWidth });
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
            className={`relative pb-3 text-sm font-medium transition-colors duration-150 focus:outline-none
              ${activeTab === tab.id ? 'text-[#3B82F6]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gray-200" />
      <div
        className="absolute bottom-0 h-[2px] bg-[#3B82F6] transition-all duration-200 ease-out"
        style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
      />
    </div>
  );
};

// PDF Preview Component
interface PDFPreviewProps {
  pdfUrl?: string | null;
  pdfBase64?: string | null;
  title?: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ pdfUrl, pdfBase64, title = 'PDF Preview' }) => {
  const src = pdfBase64 ? `data:application/pdf;base64,${pdfBase64}` : pdfUrl || '';
  if (!src) {
    return (
      <div className="border border-gray-200 rounded-lg p-8 bg-gray-50 text-center">
        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No resume to preview</p>
      </div>
    );
  }
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <iframe src={src} className="w-full h-[500px]" title={title} />
    </div>
  );
};

// Confirmation Modal Component
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

const ReplaceResumeModal: React.FC<ConfirmModalProps> = ({ isOpen, onClose, onConfirm, isLoading }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
        
        <h2 className="text-xl font-semibold text-gray-900 mb-3">
          Replace resume in account settings?
        </h2>
        <p className="text-gray-600 mb-6">
          This will replace your current resume across Offerloop.
        </p>
        
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Replace Resume
          </Button>
        </div>
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
  
  // Score state (inline display)
  const [resumeScore, setResumeScore] = useState<number | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  
  // Job context state
  const [jobUrl, setJobUrl] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [showManualInputs, setShowManualInputs] = useState(false);
  const [jobUrlError, setJobUrlError] = useState<string | null>(null);
  
  // Fix state
  const [isFixing, setIsFixing] = useState(false);
  const [fixedPdfBase64, setFixedPdfBase64] = useState<string | null>(null);
  const [fixedResumeText, setFixedResumeText] = useState<string | null>(null);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  
  // Tailor state
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailoredPdfBase64, setTailoredPdfBase64] = useState<string | null>(null);
  const [tailoredResumeText, setTailoredResumeText] = useState<string | null>(null);
  const [tailorScore, setTailorScore] = useState<number | null>(null);
  const [tailorScoreLabel, setTailorScoreLabel] = useState('');
  const [tailorCategories, setTailorCategories] = useState<ScoreCategory[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [tailorJobContext, setTailorJobContext] = useState<JobContext | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  
  // Results mode
  const [showResults, setShowResults] = useState<'none' | 'fix' | 'tailor'>('none');
  
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
  const hasManualFields = jobTitle.trim() && company.trim() && locationInput.trim() && jobDescription.trim();
  const hasJobContext = hasJobUrl || hasManualFields;

  // Handle Score Resume (inline)
  const handleScore = async () => {
    if (!resumeUrl) return;
    
    setIsScoring(true);
    try {
      const result = await scoreResume();
      if (result.status === 'ok' && result.score !== undefined) {
        setResumeScore(result.score);
      } else if (result.status === 'error') {
        toast({ title: 'Error', description: result.message, variant: 'destructive' });
      }
      
      if (result.credits_remaining !== undefined && updateCredits) {
        await updateCredits(result.credits_remaining);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsScoring(false);
    }
  };

  // Handle Fix Resume
  const handleFix = async () => {
    setError(null);
    if (!resumeUrl) {
      setError('Please upload your resume in Account Settings first.');
      return;
    }
    
    if ((user?.credits ?? 0) < 5) {
      setError('Insufficient credits. You need at least 5 credits.');
      toast({ title: 'Insufficient Credits', description: 'Upgrade your plan for more credits.', variant: 'destructive' });
      return;
    }

    setIsFixing(true);
    
    try {
      const result = await fixResume();
      
      if (result.status === 'error') {
        setError(result.message || 'Fix failed.');
        toast({ title: 'Error', description: result.message, variant: 'destructive' });
        return;
      }
      
      setFixedPdfBase64(result.pdf_base64 || null);
      setFixedResumeText(result.improved_resume_text || null);
      setShowResults('fix');
      
      if (result.credits_remaining !== undefined && updateCredits) {
        await updateCredits(result.credits_remaining);
      }
      
      toast({ title: 'Resume Fixed', description: 'Review your improved resume below.' });
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsFixing(false);
    }
  };

  // Handle Save Fixed Resume
  const handleSaveFixed = async () => {
    if (!fixedPdfBase64 || !fixedResumeText) return;
    
    setIsReplacing(true);
    try {
      const result = await replaceMainResume({
        pdf_base64: fixedPdfBase64,
        resume_text: fixedResumeText,
      });
      
      if (result.status === 'error') {
        toast({ title: 'Error', description: result.message, variant: 'destructive' });
        return;
      }
      
      await loadResume();
      setShowReplaceModal(false);
      setShowResults('none');
      setFixedPdfBase64(null);
      setFixedResumeText(null);
      
      toast({ title: 'Resume Replaced', description: 'Your main resume has been updated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsReplacing(false);
    }
  };

  // Handle Tailor Resume
  const handleTailor = async () => {
    setError(null);
    setJobUrlError(null);
    
    if (!resumeUrl) {
      setError('Please upload your resume in Account Settings first.');
      return;
    }
    
    if (!hasJobContext) {
      setError('Please provide a job description URL or fill in the manual fields.');
      return;
    }
    
    if ((user?.credits ?? 0) < 5) {
      setError('Insufficient credits. You need at least 5 credits.');
      toast({ title: 'Insufficient Credits', description: 'Upgrade your plan for more credits.', variant: 'destructive' });
      return;
    }

    setIsTailoring(true);
    
    try {
      const result = await tailorResume({
        job_url: hasJobUrl ? jobUrl.trim() : undefined,
        job_title: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
        location: locationInput.trim() || undefined,
        job_description: jobDescription.trim() || undefined,
      });
      
      if (result.status === 'error') {
        if (result.error_code === 'URL_PARSE_FAILED') {
          setJobUrlError('Could not read job URL. Please use manual inputs.');
          setShowManualInputs(true);
        } else {
          setError(result.message || 'Tailoring failed.');
          toast({ title: 'Error', description: result.message, variant: 'destructive' });
        }
        return;
      }
      
      setTailorScore(result.score ?? null);
      setTailorScoreLabel(result.score_label || '');
      setTailorCategories(result.categories || []);
      setRecommendations(result.recommendations || []);
      setTailorJobContext(result.job_context || null);
      setShowResults('tailor');
      
      // Auto-fill from parsed job
      if (result.parsed_job) {
        if (result.parsed_job.job_title) setJobTitle(result.parsed_job.job_title);
        if (result.parsed_job.company) setCompany(result.parsed_job.company);
        if (result.parsed_job.location) setLocationInput(result.parsed_job.location);
      }
      
      if (result.credits_remaining !== undefined && updateCredits) {
        await updateCredits(result.credits_remaining);
      }
      
      toast({ title: 'Analysis Complete', description: `Your resume scored ${result.score}/100 for this role.` });
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsTailoring(false);
    }
  };

  // Handle Apply Recommendation
  const handleApplyRecommendation = async (rec: Recommendation) => {
    if (!tailorJobContext) return;
    
    if ((user?.credits ?? 0) < 5) {
      toast({ title: 'Insufficient Credits', description: 'You need at least 5 credits.', variant: 'destructive' });
      return;
    }
    
    setApplyingId(rec.id);
    try {
      const result = await applyRecommendation({
        recommendation: rec,
        job_context: tailorJobContext,
        current_working_resume_text: tailoredResumeText || undefined,
        score: tailorScore || undefined,
      });
      
      if (result.status === 'error') {
        toast({ title: 'Error', description: result.message, variant: 'destructive' });
        return;
      }
      
      setTailoredPdfBase64(result.updated_resume_pdf_base64 || null);
      setTailoredResumeText(result.updated_resume_text || null);
      setRecommendations(prev => prev.filter(r => r.id !== rec.id));
      
      if (result.credits_remaining !== undefined && updateCredits) {
        await updateCredits(result.credits_remaining);
      }
      
      toast({ title: 'Applied', description: 'Recommendation applied and saved to library.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setApplyingId(null);
    }
  };

  // Handle Download
  const handleDownload = (pdfBase64: string, filename: string) => {
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${pdfBase64}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Download Started', description: 'Your resume is being downloaded.' });
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
    if (pdfBase64) handleDownload(pdfBase64, `${entry.display_name}.pdf`);
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

  // Back to form
  const handleBackToForm = () => {
    setShowResults('none');
    setFixedPdfBase64(null);
    setFixedResumeText(null);
    setTailoredPdfBase64(null);
    setTailoredResumeText(null);
    setTailorScore(null);
    setRecommendations([]);
  };

  // Auth loading
  if (authLoading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full text-foreground">
          <AppSidebar />
          <MainContentWrapper>
            <AppHeader title="" />
            <main className="bg-white min-h-screen">
              <div className="max-w-5xl mx-auto px-8 pt-10 pb-4">
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              </div>
            </main>
          </MainContentWrapper>
        </div>
      </SidebarProvider>
    );
  }

  if (!user) return null;

  const isProcessing = isFixing || isTailoring;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          <main className="bg-white min-h-screen">
            <div className="max-w-5xl mx-auto px-8 pt-10 pb-4">
              <h1 className="text-[28px] font-semibold text-gray-900 mb-4">Write Resumes</h1>

              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <StripeTabs 
                  activeTab={activeTab} 
                  onTabChange={handleTabChange}
                  tabs={[
                    { id: 'resume-workshop', label: 'Resume Workshop' },
                    { id: 'resume-library', label: 'Resume Library' },
                  ]}
                />

                <div className="pb-8 pt-6">
                  {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                      <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                      <div className="flex-1"><p className="text-sm text-red-700">{error}</p></div>
                      <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">×</button>
                    </div>
                  )}

                  <TabsContent value="resume-workshop" className="mt-0">
                    {/* Show results or form */}
                    {showResults === 'none' ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column - Resume Preview */}
                        <div>
                          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Resume</h2>
                          {isLoadingResume ? (
                            <div className="border border-gray-200 rounded-lg p-8 bg-gray-50 text-center">
                              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
                            </div>
                          ) : !resumeUrl ? (
                            <div className="border border-gray-200 rounded-lg p-8 bg-gray-50 text-center">
                              <Upload className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                              <p className="text-gray-600 mb-4">No resume uploaded yet</p>
                              <Button onClick={() => navigate('/account-settings')} variant="outline">
                                Upload Resume
                              </Button>
                            </div>
                          ) : (
                            <PDFPreview pdfUrl={resumeUrl} title={resumeFileName || 'Your Resume'} />
                          )}
                        </div>

                        {/* Right Column - Score, Job Context, Actions */}
                        <div className="space-y-6">
                          {/* Resume Score Section - Compact */}
                          {resumeUrl && (
                            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-gray-700">Resume Score</p>
                                  <div className="flex items-baseline gap-1 mt-1">
                                    {resumeScore !== null ? (
                                      <>
                                        <span className={`text-2xl font-bold ${
                                          resumeScore >= 80 ? 'text-green-600' :
                                          resumeScore >= 60 ? 'text-blue-600' :
                                          resumeScore >= 40 ? 'text-yellow-600' : 'text-red-600'
                                        }`}>{resumeScore}</span>
                                        <span className="text-gray-500 text-sm">/ 100</span>
                                      </>
                                    ) : (
                                      <span className="text-gray-400 text-sm">Not scored yet</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">
                                    Overall resume strength based on clarity, impact, structure, and ATS readiness
                                  </p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleScore}
                                  disabled={isScoring || !resumeUrl}
                                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                >
                                  {isScoring ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Score Resume'}
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Job Context Section */}
                          {resumeUrl && (
                            <div>
                              <h2 className="text-lg font-semibold text-gray-900 mb-2">Job Description</h2>
                              <p className="text-sm text-gray-500 mb-4">
                                Provide either a job description URL or fill out the manual fields. You only need one.
                              </p>
                              
                              <div className="space-y-4">
                                {/* Job URL Input */}
                                <div className={hasManualFields && !hasJobUrl ? 'opacity-60' : ''}>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Job Posting URL
                                  </label>
                                  <Input
                                    value={jobUrl}
                                    onChange={(e) => { setJobUrl(e.target.value); setJobUrlError(null); }}
                                    placeholder="https://linkedin.com/jobs/..."
                                    className={jobUrlError ? 'border-red-300' : ''}
                                    disabled={isProcessing}
                                  />
                                  {jobUrlError && <p className="text-sm text-red-600 mt-1">{jobUrlError}</p>}
                                  {hasManualFields && !hasJobUrl && (
                                    <p className="text-xs text-gray-400 mt-1">Using manual fields below instead</p>
                                  )}
                                </div>
                                
                                {/* Toggle for manual inputs */}
                                <button
                                  onClick={() => setShowManualInputs(!showManualInputs)}
                                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                  disabled={isProcessing}
                                >
                                  {showManualInputs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  {showManualInputs ? 'Hide manual inputs' : 'Or enter job details manually'}
                                </button>
                                
                                {/* Manual Inputs */}
                                {showManualInputs && (
                                  <div className={`space-y-4 p-4 bg-gray-50 rounded-lg ${hasJobUrl && !hasManualFields ? 'opacity-60' : ''}`}>
                                    {hasJobUrl && !hasManualFields && (
                                      <p className="text-xs text-gray-400">Using URL above instead</p>
                                    )}
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                                        <Input 
                                          value={jobTitle} 
                                          onChange={(e) => setJobTitle(e.target.value)} 
                                          placeholder="Software Engineer" 
                                          disabled={isProcessing} 
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                                        <Input 
                                          value={company} 
                                          onChange={(e) => setCompany(e.target.value)} 
                                          placeholder="Google" 
                                          disabled={isProcessing} 
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                                      <Input 
                                        value={locationInput} 
                                        onChange={(e) => setLocationInput(e.target.value)} 
                                        placeholder="San Francisco, CA" 
                                        disabled={isProcessing} 
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
                                      <Textarea 
                                        value={jobDescription} 
                                        onChange={(e) => setJobDescription(e.target.value)} 
                                        placeholder="Paste the full job description..." 
                                        className="min-h-[120px]" 
                                        disabled={isProcessing} 
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex gap-3 pt-4">
                                  <Button
                                    onClick={handleFix}
                                    disabled={isProcessing || !resumeUrl}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                                  >
                                    {isFixing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                    Fix Resume
                                  </Button>
                                  
                                  <div className="flex-1">
                                    <Button
                                      onClick={handleTailor}
                                      disabled={isProcessing || !resumeUrl || !hasJobContext}
                                      className={`w-full ${hasJobContext ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}
                                    >
                                      {isTailoring ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                      Tailor Resume
                                    </Button>
                                    {!hasJobContext && (
                                      <p className="text-xs text-gray-400 mt-1 text-center">
                                        Requires a job description to tailor your resume
                                      </p>
                                    )}
                                  </div>
                                </div>
                                
                                <p className="text-xs text-gray-400 text-center">
                                  Each action costs 5 credits
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : showResults === 'fix' ? (
                      /* Fix Results */
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-semibold text-gray-900">Fixed Resume</h2>
                          <Button variant="ghost" onClick={handleBackToForm} className="text-gray-500">
                            ← Back
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div>
                            <h3 className="text-sm font-medium text-gray-700 mb-2">Original</h3>
                            <PDFPreview pdfUrl={resumeUrl} title="Original Resume" />
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-gray-700 mb-2">Improved</h3>
                            {fixedPdfBase64 && (
                              <>
                                <PDFPreview pdfBase64={fixedPdfBase64} title="Fixed Resume" />
                                <div className="flex gap-3 mt-4">
                                  <Button 
                                    onClick={() => setShowReplaceModal(true)} 
                                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                                  >
                                    Save to Account
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    onClick={() => handleDownload(fixedPdfBase64, 'fixed_resume.pdf')}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : showResults === 'tailor' ? (
                      /* Tailor Results */
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-semibold text-gray-900">
                            Tailored for: {tailorJobContext?.job_title} at {tailorJobContext?.company}
                          </h2>
                          <Button variant="ghost" onClick={handleBackToForm} className="text-gray-500">
                            ← Back
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Left - Score & Recommendations */}
                          <div className="space-y-6">
                            {/* Score Card */}
                            {tailorScore !== null && (
                              <div className={`rounded-lg border p-4 ${
                                tailorScore >= 80 ? 'bg-green-50 border-green-200' :
                                tailorScore >= 60 ? 'bg-blue-50 border-blue-200' :
                                tailorScore >= 40 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'
                              }`}>
                                <div className="flex items-baseline gap-2">
                                  <span className={`text-3xl font-bold ${
                                    tailorScore >= 80 ? 'text-green-600' :
                                    tailorScore >= 60 ? 'text-blue-600' :
                                    tailorScore >= 40 ? 'text-yellow-600' : 'text-red-600'
                                  }`}>{tailorScore}</span>
                                  <span className="text-gray-500">/ 100</span>
                                  <span className="text-sm text-gray-600 ml-2">{tailorScoreLabel}</span>
                                </div>
                                <p className="text-sm text-gray-600 mt-2">Job fit score for this role</p>
                              </div>
                            )}
                            
                            {/* Recommendations */}
                            {recommendations.length > 0 && (
                              <div>
                                <h3 className="text-md font-semibold text-gray-900 mb-3">
                                  Recommendations ({recommendations.length})
                                </h3>
                                <p className="text-sm text-gray-500 mb-3">
                                  Apply to generate a tailored version. Each costs 5 credits.
                                </p>
                                <div className="space-y-3">
                                  {recommendations.map(rec => (
                                    <div key={rec.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <h4 className="font-medium text-gray-900 text-sm">{rec.title}</h4>
                                          <p className="text-sm text-gray-600 mt-1">{rec.explanation}</p>
                                          <span className="text-xs text-gray-400">{rec.section}</span>
                                        </div>
                                        <Button
                                          size="sm"
                                          onClick={() => handleApplyRecommendation(rec)}
                                          disabled={applyingId !== null}
                                          className="bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                                        >
                                          {applyingId === rec.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {recommendations.length === 0 && tailoredPdfBase64 && (
                              <div className="text-center py-6 text-gray-500">
                                <p>All recommendations applied!</p>
                              </div>
                            )}
                          </div>
                          
                          {/* Right - Preview */}
                          <div>
                            <h3 className="text-sm font-medium text-gray-700 mb-2">
                              {tailoredPdfBase64 ? 'Tailored Resume' : 'Original Resume'}
                            </h3>
                            <PDFPreview
                              pdfUrl={tailoredPdfBase64 ? undefined : resumeUrl}
                              pdfBase64={tailoredPdfBase64}
                              title={tailoredPdfBase64 ? 'Tailored Resume' : 'Original Resume'}
                            />
                            {tailoredPdfBase64 && (
                              <Button 
                                variant="outline" 
                                className="mt-4 w-full"
                                onClick={() => handleDownload(
                                  tailoredPdfBase64, 
                                  `${tailorJobContext?.job_title?.replace(/\s+/g, '_') || 'tailored'}_resume.pdf`
                                )}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download Tailored Resume
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="resume-library" className="mt-0">
                    {isLoadingLibrary ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                      </div>
                    ) : libraryEntries.length === 0 ? (
                      <div className="text-center py-16">
                        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Saved Resumes</h3>
                        <p className="text-gray-500 max-w-md mx-auto mb-6">
                          Tailored resumes will appear here after you apply recommendations.
                        </p>
                        <Button onClick={() => handleTabChange('resume-workshop')} className="bg-blue-600 hover:bg-blue-700">
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Go to Resume Workshop
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <h2 className="text-lg font-semibold text-gray-900">Saved Resumes ({libraryEntries.length})</h2>
                          {libraryEntries.map(entry => (
                            <div
                              key={entry.id}
                              className={`border rounded-lg p-4 bg-white transition-colors cursor-pointer ${
                                previewEntry?.id === entry.id ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => handleViewEntry(entry)}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                  <FileText className="h-8 w-8 text-blue-500 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <h4 className="font-medium text-gray-900">{entry.display_name}</h4>
                                    <p className="text-sm text-gray-600">{entry.job_title} at {entry.company}</p>
                                    <div className="flex items-center gap-3 mt-2">
                                      <span className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleDateString()}</span>
                                      {entry.score && (
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                          entry.score >= 80 ? 'bg-green-100 text-green-700' :
                                          entry.score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                        }`}>Score: {entry.score}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleViewEntry(entry); }}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleDownloadEntry(entry); }}>
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
                            <div className="border border-gray-200 rounded-lg p-8 bg-gray-50 text-center">
                              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
                            </div>
                          ) : previewEntry ? (
                            <div className="space-y-4">
                              <PDFPreview pdfBase64={previewEntry.pdf_base64} title={previewEntry.display_name} />
                              <Button variant="outline" className="w-full" onClick={() => handleDownloadEntry(previewEntry)}>
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
                              </Button>
                            </div>
                          ) : (
                            <div className="border border-gray-200 rounded-lg p-8 bg-gray-50 text-center">
                              <Eye className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                              <p className="text-gray-500">Click on a resume to preview it</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </main>
        </MainContentWrapper>
      </div>
      
      <ReplaceResumeModal
        isOpen={showReplaceModal}
        onClose={() => setShowReplaceModal(false)}
        onConfirm={handleSaveFixed}
        isLoading={isReplacing}
      />
    </SidebarProvider>
  );
}
