/**
 * CoverLetterPage - Cover letter generation workspace
 * 
 * Route: /write/cover-letter, /write/cover-letter-library
 * Tabs: Cover Letter Generator, Cover Letter Library
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
  PenLine, 
  Download, 
  ChevronDown, 
  ChevronUp,
  Eye,
  ArrowRight,
  Sparkles,
  FileText
} from 'lucide-react';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { toast } from '@/hooks/use-toast';
import { 
  generateCoverLetter, 
  getCoverLetterLibrary,
  getLibraryEntry,
  type LibraryEntry
} from '@/services/coverLetterWorkshop';

// Stripe-style Tabs Component with animated underline (matches Find People page)
interface StripeTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { id: string; label: string }[];
}

const StripeTabs: React.FC<StripeTabsProps> = ({ activeTab, onTabChange, tabs }) => {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Update indicator position when active tab changes
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
      {/* Tab buttons */}
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
      
      {/* Full-width divider line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gray-200" />
      
      {/* Animated underline indicator - sits on top of divider */}
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

// PDF Preview Component
interface PDFPreviewProps {
  pdfUrl?: string | null;
  pdfBase64?: string | null;
  title?: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ pdfUrl, pdfBase64, title = 'PDF Preview' }) => {
  const src = pdfBase64 
    ? `data:application/pdf;base64,${pdfBase64}` 
    : pdfUrl || '';
  
  if (!src) {
    return (
      <div className="border border-gray-200 rounded-lg p-8 bg-gray-50 text-center">
        <PenLine className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No cover letter to preview</p>
      </div>
    );
  }
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <iframe
        src={src}
        className="w-full h-[500px]"
        title={title}
      />
    </div>
  );
};

export default function CoverLetterPage() {
  const { user, isLoading: authLoading, updateCredits } = useFirebaseAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine active tab from route
  const activeTab = location.pathname === '/write/cover-letter-library' ? 'cover-letter-library' : 'cover-letter-generator';

  // Handle tab change - navigate to the appropriate route
  const handleTabChange = (tabId: string) => {
    if (tabId === 'cover-letter-library') {
      navigate('/write/cover-letter-library');
    } else {
      navigate('/write/cover-letter');
    }
  };
  
  // Job context state
  const [jobUrl, setJobUrl] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [showManualInputs, setShowManualInputs] = useState(false);
  const [jobUrlError, setJobUrlError] = useState<string | null>(null);
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [generatedPdfBase64, setGeneratedPdfBase64] = useState<string | null>(null);
  
  // Library state
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<LibraryEntry | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  // Error state
  const [error, setError] = useState<string | null>(null);

  // Load library
  const loadLibrary = useCallback(async () => {
    if (!user?.uid) return;
    
    setIsLoadingLibrary(true);
    try {
      const result = await getCoverLetterLibrary();
      if (result.status === 'ok' && result.entries) {
        setLibraryEntries(result.entries);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [user?.uid]);

  // Load library when tab changes
  useEffect(() => {
    if (activeTab === 'cover-letter-library') {
      loadLibrary();
    }
  }, [activeTab, loadLibrary]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/signin');
    }
  }, [user, authLoading, navigate]);

  // Check if we can generate
  const canGenerate = 
    jobUrl.trim() || 
    (jobTitle.trim() && company.trim() && locationInput.trim() && jobDescription.trim());

  // Handle Generate Cover Letter
  const handleGenerate = async () => {
    setError(null);
    setJobUrlError(null);
    
    // Build request params
    const params: {
      job_url?: string;
      job_title?: string;
      company?: string;
      location?: string;
      job_description?: string;
    } = {};
    
    if (jobUrl.trim()) {
      params.job_url = jobUrl.trim();
    }
    
    if (jobTitle.trim()) params.job_title = jobTitle.trim();
    if (company.trim()) params.company = company.trim();
    if (locationInput.trim()) params.location = locationInput.trim();
    if (jobDescription.trim()) params.job_description = jobDescription.trim();
    
    setIsGenerating(true);
    
    try {
      const result = await generateCoverLetter(params);
      
      if (result.status === 'error') {
        // Handle specific errors
        if (result.error_code === 'insufficient_credits') {
          setError('You don\'t have enough credits. Please upgrade your plan to continue.');
          toast({
            title: 'Insufficient Credits',
            description: 'Please upgrade your plan to generate more cover letters.',
            variant: 'destructive',
          });
        } else if (result.error_code === 'no_resume') {
          setError('Please upload your resume in Account Settings first.');
        } else if (result.parsed_job) {
          // URL was parsed but manual fields missing
          setJobUrlError('Job URL parsed, but some fields are missing. Please fill in the required fields.');
          setShowManualInputs(true);
          // Auto-fill what we got
          if (result.parsed_job.job_title) setJobTitle(result.parsed_job.job_title);
          if (result.parsed_job.company) setCompany(result.parsed_job.company);
          if (result.parsed_job.location) setLocationInput(result.parsed_job.location);
          if (result.parsed_job.job_description) setJobDescription(result.parsed_job.job_description);
        } else if (params.job_url && !params.job_title) {
          // URL parsing failed completely
          setJobUrlError('Could not read job URL. Please use manual inputs.');
          setShowManualInputs(true);
        } else {
          setError(result.message || 'Failed to generate cover letter.');
          toast({
            title: 'Error',
            description: result.message || 'Failed to generate cover letter.',
            variant: 'destructive',
          });
        }
        return;
      }
      
      // Success!
      setGeneratedText(result.cover_letter_text || null);
      setGeneratedPdfBase64(result.pdf_base64 || null);
      
      // Auto-fill fields from parsed job
      if (result.parsed_job) {
        if (result.parsed_job.job_title && !jobTitle) setJobTitle(result.parsed_job.job_title);
        if (result.parsed_job.company && !company) setCompany(result.parsed_job.company);
        if (result.parsed_job.location && !locationInput) setLocationInput(result.parsed_job.location);
      }
      
      // Update credits
      if (result.credits_remaining !== undefined && updateCredits) {
        await updateCredits(result.credits_remaining);
      }
      
      toast({
        title: 'Cover Letter Generated',
        description: 'Your cover letter has been created and saved to your library.',
      });
      
    } catch (err: any) {
      setError(err.message || 'Failed to generate cover letter.');
      toast({
        title: 'Error',
        description: err.message || 'Failed to generate cover letter.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Download PDF
  const handleDownload = () => {
    if (!generatedPdfBase64) return;
    
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${generatedPdfBase64}`;
    link.download = `${jobTitle.replace(/\s+/g, '_') || 'cover'}_letter.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: 'Download Started',
      description: 'Your cover letter is being downloaded.',
    });
  };

  // Handle View library entry
  const handleViewEntry = async (entry: LibraryEntry) => {
    if (entry.pdf_base64) {
      setPreviewEntry(entry);
      return;
    }
    
    setIsLoadingPreview(true);
    try {
      const result = await getLibraryEntry(entry.id);
      if (result.status === 'ok' && result.entry) {
        setPreviewEntry(result.entry);
      } else {
        toast({
          title: 'Error',
          description: result.message || 'Failed to load cover letter preview.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to load cover letter preview.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Handle Download library entry
  const handleDownloadEntry = async (entry: LibraryEntry) => {
    let pdfBase64 = entry.pdf_base64;
    
    if (!pdfBase64) {
      try {
        const result = await getLibraryEntry(entry.id);
        if (result.status === 'ok' && result.entry?.pdf_base64) {
          pdfBase64 = result.entry.pdf_base64;
        } else {
          toast({
            title: 'Error',
            description: 'Failed to download cover letter.',
            variant: 'destructive',
          });
          return;
        }
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to download cover letter.',
          variant: 'destructive',
        });
        return;
      }
    }
    
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${pdfBase64}`;
    link.download = `${entry.display_name || 'cover_letter'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: 'Download Started',
      description: 'Your cover letter is being downloaded.',
    });
  };

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

  if (!user) {
    return null; // Will redirect via useEffect
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader title="" />

          <main className="bg-white min-h-screen">
            {/* Page Content Container - matches Find People page */}
            <div className="max-w-5xl mx-auto px-8 pt-10 pb-4">
              <h1 className="text-[28px] font-semibold text-gray-900 mb-4">
                Write Cover Letters
              </h1>

              {/* Stripe-style Tabs */}
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <StripeTabs 
                  activeTab={activeTab} 
                  onTabChange={handleTabChange}
                  tabs={[
                    { id: 'cover-letter-generator', label: 'Cover Letter Generator' },
                    { id: 'cover-letter-library', label: 'Cover Letter Library' },
                  ]}
                />

                {/* Content area with proper spacing from divider */}
                <div className="pb-8 pt-6">
                  {/* Error display */}
                  {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                      <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                      <div className="flex-1">
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                      <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">×</button>
                    </div>
                  )}

                  <TabsContent value="cover-letter-generator" className="mt-0">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Left Column - Job Context Form */}
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Details</h2>
                        
                        <div className="space-y-4">
                          {/* Job URL Input */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Job Posting URL <span className="text-gray-400">(optional)</span>
                            </label>
                            <Input
                              type="url"
                              value={jobUrl}
                              onChange={(e) => {
                                setJobUrl(e.target.value);
                                setJobUrlError(null);
                              }}
                              placeholder="https://linkedin.com/jobs/..."
                              disabled={isGenerating}
                            />
                            {jobUrlError && (
                              <p className="mt-1 text-sm text-amber-600">{jobUrlError}</p>
                            )}
                          </div>
                          
                          {/* Toggle for manual inputs */}
                          <button
                            type="button"
                            onClick={() => setShowManualInputs(!showManualInputs)}
                            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                            disabled={isGenerating}
                          >
                            {showManualInputs ? (
                              <>
                                <ChevronUp className="h-4 w-4" />
                                Hide manual inputs
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-4 w-4" />
                                Use manual inputs instead
                              </>
                            )}
                          </button>
                          
                          {/* Manual Input Fields */}
                          {showManualInputs && (
                            <div className="space-y-4 pt-2 border-t border-gray-100">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Job Title <span className="text-red-500">*</span>
                                </label>
                                <Input
                                  type="text"
                                  value={jobTitle}
                                  onChange={(e) => setJobTitle(e.target.value)}
                                  placeholder="e.g., Software Engineer"
                                  disabled={isGenerating}
                                />
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Company <span className="text-red-500">*</span>
                                </label>
                                <Input
                                  type="text"
                                  value={company}
                                  onChange={(e) => setCompany(e.target.value)}
                                  placeholder="e.g., Google"
                                  disabled={isGenerating}
                                />
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Location <span className="text-red-500">*</span>
                                </label>
                                <Input
                                  type="text"
                                  value={locationInput}
                                  onChange={(e) => setLocationInput(e.target.value)}
                                  placeholder="e.g., San Francisco, CA"
                                  disabled={isGenerating}
                                />
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Job Description <span className="text-red-500">*</span>
                                </label>
                                <Textarea
                                  value={jobDescription}
                                  onChange={(e) => setJobDescription(e.target.value)}
                                  placeholder="Paste the full job description here..."
                                  className="min-h-[150px]"
                                  disabled={isGenerating}
                                />
                              </div>
                            </div>
                          )}
                          
                          {/* Generate Button */}
                          <Button
                            onClick={handleGenerate}
                            disabled={!canGenerate || isGenerating}
                            className="w-full bg-blue-600 hover:bg-blue-700"
                          >
                            {isGenerating ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-4 w-4 mr-2" />
                                Generate Cover Letter (5 credits)
                              </>
                            )}
                          </Button>
                          
                          <p className="text-xs text-gray-500 text-center">
                            Your resume from Account Settings will be used to personalize the cover letter.
                          </p>
                        </div>
                      </div>

                      {/* Right Column - Preview */}
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-semibold text-gray-900">Preview</h2>
                          {generatedPdfBase64 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleDownload}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </Button>
                          )}
                        </div>
                        
                        <PDFPreview
                          pdfBase64={generatedPdfBase64}
                          title="Generated Cover Letter"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="cover-letter-library" className="mt-0">
                    {isLoadingLibrary ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                      </div>
                    ) : libraryEntries.length === 0 ? (
                      <div className="text-center py-16">
                        <PenLine className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Saved Cover Letters</h3>
                        <p className="text-gray-500 max-w-md mx-auto mb-6">
                          Your generated cover letters will appear here.
                        </p>
                        <Button
                          onClick={() => handleTabChange('cover-letter-generator')}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Create a Cover Letter
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column - Library List */}
                        <div className="space-y-4">
                          <h2 className="text-lg font-semibold text-gray-900">
                            Saved Cover Letters ({libraryEntries.length})
                          </h2>
                          
                          {libraryEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className={`border rounded-lg p-4 bg-white transition-colors cursor-pointer ${
                                previewEntry?.id === entry.id 
                                  ? 'border-blue-500 ring-1 ring-blue-500' 
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => handleViewEntry(entry)}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                  <FileText className="h-8 w-8 text-blue-500 flex-shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <h4 className="font-medium text-gray-900 truncate">{entry.display_name}</h4>
                                    <p className="text-sm text-gray-600 mt-0.5">
                                      {entry.job_title} at {entry.company}
                                    </p>
                                    {entry.location && (
                                      <p className="text-sm text-gray-500">{entry.location}</p>
                                    )}
                                    <span className="text-xs text-gray-400 mt-2 block">
                                      {new Date(entry.created_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewEntry(entry);
                                    }}
                                    className="text-gray-600"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadEntry(entry);
                                    }}
                                    className="text-gray-600"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Right Column - Preview Panel */}
                        <div>
                          <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
                          
                          {isLoadingPreview ? (
                            <div className="border border-gray-200 rounded-lg p-8 bg-gray-50 text-center">
                              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
                              <p className="text-sm text-gray-500 mt-2">Loading preview...</p>
                            </div>
                          ) : previewEntry ? (
                            <div className="space-y-4">
                              <PDFPreview
                                pdfBase64={previewEntry.pdf_base64}
                                title={previewEntry.display_name}
                              />
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleDownloadEntry(previewEntry)}
                                  className="flex-1"
                                  variant="outline"
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download PDF
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="border border-gray-200 rounded-lg p-8 bg-gray-50 text-center">
                              <Eye className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                              <p className="text-gray-500">
                                Click on a cover letter to preview it
                              </p>
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
    </SidebarProvider>
  );
}
