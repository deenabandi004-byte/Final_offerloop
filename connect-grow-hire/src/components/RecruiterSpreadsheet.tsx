import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mail,
  Search,
  RefreshCw,
  Trash2,
  ExternalLink,
  Download,
  User,
  ChevronRight,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { useNavigate } from "react-router-dom";
import { InlineLoadingBar } from "@/components/ui/LoadingBar";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { firebaseApi } from '../services/firebaseApi';
import type { Recruiter } from '../services/firebaseApi';
import { toast } from "@/hooks/use-toast";

const STATUS_OPTIONS = [
  { value: 'Not Contacted', color: '#A0A0A0', label: 'Not Contacted' },
  { value: 'Contacted', color: '#4285F4', label: 'Contacted' },
  { value: 'Followed Up', color: '#FB8C00', label: 'Followed Up' },
  { value: 'Responded', color: '#34A853', label: 'Responded' },
  { value: 'Call Scheduled', color: '#9C27B0', label: 'Call Scheduled' },
  { value: 'Rejected', color: '#EA4335', label: 'Rejected' },
  { value: 'Hired', color: '#FFD700', label: 'Hired' }
];

const RecruiterSpreadsheet: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useFirebaseAuth();

  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [filteredRecruiters, setFilteredRecruiters] = useState<Recruiter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [mailAppDialogOpen, setMailAppDialogOpen] = useState(false);
  const [selectedRecruiterForEmail, setSelectedRecruiterForEmail] = useState<Recruiter | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  
  // Track pending saves to prevent data loss
  const [pendingSaves, setPendingSaves] = useState<Set<string>>(new Set());
  const [saveQueue, setSaveQueue] = useState<Map<string, { recruiterId: string; field: keyof Recruiter; value: string }>>(new Map());
  const saveTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const isUnmountingRef = useRef(false);

  // Swipe hint state
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  const normalizeFromServer = (serverRecruiter: any): Recruiter => ({
    id: serverRecruiter.id,
    firstName: serverRecruiter.firstName || serverRecruiter.first_name || '',
    lastName: serverRecruiter.lastName || serverRecruiter.last_name || '',
    linkedinUrl: serverRecruiter.linkedinUrl || serverRecruiter.linkedin_url || '',
    email: serverRecruiter.email || '',
    company: serverRecruiter.company || '',
    jobTitle: serverRecruiter.jobTitle || serverRecruiter.job_title || '',
    location: serverRecruiter.location || '',
    phone: serverRecruiter.phone || '',
    workEmail: serverRecruiter.workEmail || serverRecruiter.work_email || '',
    personalEmail: serverRecruiter.personalEmail || serverRecruiter.personal_email || '',
    associatedJobId: serverRecruiter.associatedJobId || serverRecruiter.associated_job_id,
    associatedJobTitle: serverRecruiter.associatedJobTitle || serverRecruiter.associated_job_title,
    associatedJobUrl: serverRecruiter.associatedJobUrl || serverRecruiter.associated_job_url,
    dateAdded: serverRecruiter.dateAdded || serverRecruiter.date_added || new Date().toISOString(),
    status: serverRecruiter.status || 'Not Contacted',
    createdAt: serverRecruiter.createdAt || serverRecruiter.created_at,
    updatedAt: serverRecruiter.updatedAt || serverRecruiter.updated_at,
  });

  const loadRecruiters = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (currentUser) {
        console.log('[RecruiterFetch] Fetching recruiters from Firestore');
        const firestoreRecruiters = await firebaseApi.getRecruiters(currentUser.uid);
        console.log('[RecruiterFetch] Loaded recruiters from Firestore:', firestoreRecruiters.length);
        const normalizedRecruiters = firestoreRecruiters.map(normalizeFromServer);
        setRecruiters(normalizedRecruiters);
        console.log('[RecruiterFetch] Normalized and set recruiters:', normalizedRecruiters.length);
      } else {
        console.log('[RecruiterFetch] No user, setting empty array');
        setRecruiters([]);
      }
    } catch (err: any) {
      console.error('[RecruiterFetch] Error loading recruiters:', err);
      setError(err.message || 'Failed to load recruiters');
      setRecruiters([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  // Load recruiters on mount and when user changes - exactly like ContactDirectory
  // This ensures data is always loaded from backend, not from props/state
  useEffect(() => {
    if (currentUser) {
      loadRecruiters();
    } else {
      // Clear recruiters if no user
      setRecruiters([]);
      setFilteredRecruiters([]);
      setIsLoading(false);
    }
  }, [currentUser]);

  // Reload recruiters when page becomes visible (user navigates back)
  // But only if there are no pending saves
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && currentUser && pendingSaves.size === 0) {
        console.log('[RecruiterFetch] Page visible, reloading recruiters');
        loadRecruiters();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentUser, pendingSaves.size]);

  // Warn user before leaving with pending saves
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingSaves.size > 0 || saveQueue.size > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Cleanup: mark as unmounting to prevent new saves
      isUnmountingRef.current = true;
    };
  }, [pendingSaves.size, saveQueue.size]);

  // Save pending changes before unmount
  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
      // Cancel all pending timeouts
      saveTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
      saveTimeoutRef.current.clear();
    };
  }, []);

  // Filter recruiters based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredRecruiters(recruiters);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = recruiters.filter((recruiter) => {
      const searchableText = [
        recruiter.firstName,
        recruiter.lastName,
        recruiter.email,
        recruiter.company,
        recruiter.jobTitle,
        recruiter.location,
        recruiter.associatedJobTitle,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });

    setFilteredRecruiters(filtered);
  }, [searchQuery, recruiters]);

  // Check for horizontal overflow
  useEffect(() => {
    const checkOverflow = () => {
      if (tableContainerRef.current) {
        const hasOverflow = tableContainerRef.current.scrollWidth > tableContainerRef.current.clientWidth;
        setHasHorizontalOverflow(hasOverflow);
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [filteredRecruiters]);

  // Track scroll
  useEffect(() => {
    const handleScroll = () => {
      if (tableContainerRef.current) {
        setHasScrolled(tableContainerRef.current.scrollLeft > 0);
      }
    };

    const container = tableContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const handleCellClick = (row: number, col: string) => {
    setEditingCell({ row, col });
  };

  // Debounced save function
  const saveRecruiterUpdate = useCallback(async (
    recruiterId: string, 
    field: keyof Recruiter, 
    value: string
  ) => {
    if (!currentUser || !recruiterId || isUnmountingRef.current) {
      console.warn('[RecruiterSave] Cannot save: missing user, recruiterId, or unmounting');
      return;
    }

    const saveKey = `${recruiterId}_${field}`;
    setPendingSaves(prev => new Set(prev).add(saveKey));

    try {
      await firebaseApi.updateRecruiter(currentUser.uid, recruiterId, { [field]: value });
      
      // Remove from pending and queue
      setPendingSaves(prev => {
        const next = new Set(prev);
        next.delete(saveKey);
        return next;
      });
      setSaveQueue(prev => {
        const next = new Map(prev);
        next.delete(saveKey);
        return next;
      });

      // Clear timeout if it exists
      const timeout = saveTimeoutRef.current.get(saveKey);
      if (timeout) {
        clearTimeout(timeout);
        saveTimeoutRef.current.delete(saveKey);
      }

      console.log(`[RecruiterSave] ✅ Successfully saved ${field} for recruiter ${recruiterId}`);
    } catch (err) {
      console.error('[RecruiterSave] Error updating recruiter:', err);
      
      // Remove from pending
      setPendingSaves(prev => {
        const next = new Set(prev);
        next.delete(saveKey);
        return next;
      });

      // Show error to user
      toast({
        title: "Failed to save changes",
        description: `Could not save ${field}. Your changes may be lost. Please try again.`,
        variant: "destructive",
      });

      // Reload to get correct state
      await loadRecruiters();
    }
  }, [currentUser, loadRecruiters]);

  const handleCellEdit = (recruiterId: string, field: keyof Recruiter, value: string) => {
    if (!currentUser) {
      toast({
        title: "Not signed in",
        description: "Please sign in to save changes.",
        variant: "destructive",
      });
      return;
    }

    if (!recruiterId) {
      console.error('[RecruiterSave] Cannot save: missing recruiter ID');
      toast({
        title: "Cannot save",
        description: "Recruiter ID is missing. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    // Update UI immediately (optimistic update)
    const updatedRecruiters = recruiters.map((r) =>
      r.id === recruiterId ? { ...r, [field]: value } : r
    );
    setRecruiters(updatedRecruiters);

    // Add to save queue
    const saveKey = `${recruiterId}_${field}`;
    setSaveQueue(prev => new Map(prev).set(saveKey, { recruiterId, field, value }));

    // Clear existing timeout for this field
    const existingTimeout = saveTimeoutRef.current.get(saveKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Debounce: wait 500ms before saving to avoid excessive API calls
    const timeout = setTimeout(() => {
      saveRecruiterUpdate(recruiterId, field, value);
    }, 500);

    saveTimeoutRef.current.set(saveKey, timeout);
  };

  const handleCellBlur = async () => {
    setEditingCell(null);
    
    // Immediately flush any pending saves when cell loses focus
    if (saveQueue.size > 0 && currentUser && !isUnmountingRef.current) {
      const entriesToSave = Array.from(saveQueue.entries());
      
      // Clear all timeouts first
      entriesToSave.forEach(([saveKey]) => {
        const timeout = saveTimeoutRef.current.get(saveKey);
        if (timeout) {
          clearTimeout(timeout);
          saveTimeoutRef.current.delete(saveKey);
        }
      });
      
      // Save all pending changes immediately
      const savePromises = entriesToSave.map(([, saveOp]) =>
        saveRecruiterUpdate(saveOp.recruiterId, saveOp.field, saveOp.value)
      );
      
      // Wait for all saves to complete
      await Promise.allSettled(savePromises);
    }
  };

  const handleEmailClick = (recruiter: Recruiter) => {
    setSelectedRecruiterForEmail(recruiter);
    setMailAppDialogOpen(true);
  };

  const handleMailAppSelect = (app: 'apple' | 'gmail') => {
    if (!selectedRecruiterForEmail) return;

    const email = selectedRecruiterForEmail.email || selectedRecruiterForEmail.workEmail;
    if (!email) {
      alert('No email address available for this recruiter');
      return;
    }

    const subject = encodeURIComponent(`Inquiry about ${selectedRecruiterForEmail.associatedJobTitle || 'position'}`);
    const body = encodeURIComponent(
      `Hi ${selectedRecruiterForEmail.firstName || ''},\n\nI hope this email finds you well...`
    );

    if (app === 'gmail') {
      window.open(`https://mail.google.com/mail/?view=cm&to=${email}&su=${subject}&body=${body}`);
    } else {
      window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    }

    setMailAppDialogOpen(false);
    setSelectedRecruiterForEmail(null);
  };

  const getDisplayName = (recruiter: Recruiter): string => {
    if (recruiter.firstName && recruiter.lastName) {
      return `${recruiter.firstName} ${recruiter.lastName}`;
    }
    if (recruiter.firstName) return recruiter.firstName;
    if (recruiter.lastName) return recruiter.lastName;
    if (recruiter.email) return recruiter.email.split('@')[0];
    if (recruiter.linkedinUrl) {
      const match = recruiter.linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
      return match ? match[1] : 'Unknown Recruiter';
    }
    return 'Unknown Recruiter';
  };

  const handleExportCsv = () => {
    if (!recruiters || recruiters.length === 0) {
      return;
    }

    // Check if user is on free tier
    if (currentUser?.tier === 'free') {
      setShowUpgradeDialog(true);
      return;
    }

    // Define CSV headers
    const headers = [
      'First Name',
      'Last Name',
      'Email',
      'LinkedIn',
      'Title',
      'Company',
      'Location',
      'Phone',
      'Work Email',
      'Personal Email',
      'Associated Job Title',
      'Associated Job URL',
      'Status',
      'Date Added'
    ] as const;

    const headerRow = headers.join(',');

    // Map recruiters to CSV rows
    const rows = recruiters.map((recruiter) => {
      const escapeCsv = (val: string | undefined | null) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escapeCsv(recruiter.firstName),
        escapeCsv(recruiter.lastName),
        escapeCsv(recruiter.email),
        escapeCsv(recruiter.linkedinUrl),
        escapeCsv(recruiter.jobTitle),
        escapeCsv(recruiter.company),
        escapeCsv(recruiter.location),
        escapeCsv(recruiter.phone),
        escapeCsv(recruiter.workEmail),
        escapeCsv(recruiter.personalEmail),
        escapeCsv(recruiter.associatedJobTitle),
        escapeCsv(recruiter.associatedJobUrl),
        escapeCsv(recruiter.status),
        escapeCsv(recruiter.dateAdded)
      ].join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `recruiter_spreadsheet_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearAllRecruiters = async () => {
    if (window.confirm('Are you sure you want to delete all recruiters? This action cannot be undone.')) {
      try {
        if (currentUser) {
          await firebaseApi.clearAllRecruiters(currentUser.uid);
          setRecruiters([]);
        }
      } catch (err) {
        console.error('Error clearing recruiters:', err);
        setError('Failed to clear recruiters');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton variant="contacts" count={5} />
      </div>
    );
  }

  return (
    <div className="space-y-4 recruiter-spreadsheet-page">
      {/* Export CSV Card */}
      {recruiters.length > 0 && (
        <div className="flex justify-between items-center bg-card rounded-lg border border-border p-4 recruiter-info-card">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {recruiters.length} recruiter{recruiters.length !== 1 ? 's' : ''} saved
              </p>
              {pendingSaves.size > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-blue-600">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>Saving {pendingSaves.size} change{pendingSaves.size !== 1 ? 's' : ''}...</span>
                </div>
              )}
              {pendingSaves.size === 0 && saveQueue.size === 0 && recruiters.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>All changes saved</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Export your recruiters to CSV for further analysis
            </p>
          </div>
          <div className="flex gap-2 recruiter-action-buttons">
            <Button
              onClick={handleExportCsv}
              disabled={currentUser?.tier === 'free'}
              className={`gap-2 recruiter-export-btn ${
                currentUser?.tier === 'free' 
                  ? 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed opacity-60' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              title={currentUser?.tier === 'free' ? 'Upgrade to Pro or Elite to export CSV' : 'Export recruiters to CSV'}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadRecruiters}
              disabled={isLoading}
              className="relative overflow-hidden border-border text-foreground hover:bg-secondary recruiter-refresh-btn"
            >
              <RefreshCw className="h-4 w-4" />
              <InlineLoadingBar isLoading={isLoading} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllRecruiters}
              className="text-destructive border-destructive hover:bg-destructive/10 recruiter-delete-btn"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-6 py-3 rounded-lg">
          {error}
        </div>
      )}

      {recruiters.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground mb-2">No recruiters to display yet</p>
          <p className="text-sm text-muted-foreground">
            Recruiters found from "Find Recruiters" will automatically appear here
          </p>
        </div>
      ) : (
        <div className="bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border overflow-hidden recruiter-table-wrapper">
          {/* Results Header */}
          <div className="px-6 py-4 border-b border-border bg-muted recruiter-section-header">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 recruiter-section-header-content">
                <Mail className="h-5 w-5 text-blue-400" />
                <span className="font-medium text-foreground recruiter-section-header-text">
                  {filteredRecruiters.length} {filteredRecruiters.length === 1 ? 'recruiter' : 'recruiters'}
                  {searchQuery && ` (filtered from ${recruiters.length})`}
                </span>
              </div>
              <div className="flex items-center gap-3 recruiter-scroll-hint">
                {hasHorizontalOverflow && !hasScrolled && (
                  <div className="swipe-hint flex items-center gap-1.5 text-sm font-bold text-black">
                    <span>Scroll</span>
                    <ChevronRight className="h-4 w-4 swipe-hint-arrow" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-6 py-4 border-b border-border bg-background recruiter-search-section">
            <div className="relative w-80 recruiter-search-wrapper">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search recruiters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted border-border text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary recruiter-search-input"
              />
            </div>
          </div>

          {/* Empty State for No Search Results */}
          {filteredRecruiters.length === 0 && recruiters.length > 0 && searchQuery && (
            <div className="px-6 py-12 text-center">
              <p className="text-muted-foreground mb-2">No recruiters match your search.</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-sm text-blue-600 hover:text-blue-700 underline"
              >
                Clear search
              </button>
            </div>
          )}

          {/* Table */}
          {filteredRecruiters.length > 0 && (
            <div ref={tableContainerRef} className="overflow-x-auto recruiter-table-container">
              <table className="min-w-full divide-y divide-border recruiter-table">
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Recruiter
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      LinkedIn
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Email
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Company
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Title
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Associated Job
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-background divide-y divide-border">
                  {filteredRecruiters.map((recruiter, index) => {
                    const statusOption = STATUS_OPTIONS.find(opt => opt.value === recruiter.status);
                    const recruiterId = recruiter.id || '';
                    const isSaving = recruiterId && Array.from(pendingSaves).some(key => key.startsWith(recruiterId + '_'));

                    return (
                      <tr
                        key={recruiter.id}
                        className={`hover:bg-secondary transition-colors ${isSaving ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                              <User className="h-5 w-5 text-blue-400" />
                            </div>
                            <div className="ml-4 flex-1">
                              {editingCell?.row === index && editingCell?.col === 'name' ? (
                                <div className="space-y-1">
                                  <Input
                                    value={recruiter.firstName}
                                    onChange={(e) => handleCellEdit(recruiter.id!, 'firstName', e.target.value)}
                                    onBlur={handleCellBlur}
                                    placeholder="First name"
                                    className="text-sm h-8 bg-background border-input text-foreground"
                                    autoFocus
                                  />
                                  <Input
                                    value={recruiter.lastName}
                                    onChange={(e) => handleCellEdit(recruiter.id!, 'lastName', e.target.value)}
                                    onBlur={handleCellBlur}
                                    placeholder="Last name"
                                    className="text-sm h-8 bg-background border-input text-foreground"
                                  />
                                </div>
                              ) : (
                                <div
                                  onClick={() => handleCellClick(index, 'name')}
                                  className="cursor-text"
                                >
                                  <div className="text-sm font-medium text-foreground">
                                    {getDisplayName(recruiter)}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap">
                          {recruiter.linkedinUrl ? (
                            <a
                              href={
                                recruiter.linkedinUrl.startsWith('http')
                                  ? recruiter.linkedinUrl
                                  : `https://${recruiter.linkedinUrl}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline text-sm"
                            >
                              <ExternalLink className="h-4 w-4" />
                              <span className="truncate max-w-[200px]">{recruiter.linkedinUrl.replace(/^https?:\/\//g, '')}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap">
                          {recruiter.email ? (
                            <span className="text-sm text-foreground">{recruiter.email}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingCell?.row === index && editingCell?.col === 'company' ? (
                            <Input
                              value={recruiter.company}
                              onChange={(e) => handleCellEdit(recruiter.id!, 'company', e.target.value)}
                              onBlur={handleCellBlur}
                              className="text-sm h-8 bg-background border-input text-foreground"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => handleCellClick(index, 'company')}
                              className="cursor-text hover:bg-muted rounded px-2 py-1 text-sm text-foreground"
                            >
                              {recruiter.company || <span className="text-muted-foreground">—</span>}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingCell?.row === index && editingCell?.col === 'jobTitle' ? (
                            <Input
                              value={recruiter.jobTitle}
                              onChange={(e) => handleCellEdit(recruiter.id!, 'jobTitle', e.target.value)}
                              onBlur={handleCellBlur}
                              className="text-sm h-8 bg-background border-input text-foreground"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => handleCellClick(index, 'jobTitle')}
                              className="cursor-text hover:bg-muted rounded px-2 py-1 text-sm text-foreground"
                            >
                              {recruiter.jobTitle || <span className="text-muted-foreground">—</span>}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {recruiter.associatedJobTitle ? (
                            <div className="text-sm text-foreground">
                              <div className="font-medium">{recruiter.associatedJobTitle}</div>
                              {recruiter.associatedJobUrl && (
                                <a
                                  href={recruiter.associatedJobUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  View Job
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={recruiter.status}
                            onChange={(e) => handleCellEdit(recruiter.id!, 'status', e.target.value)}
                            className="flex-1 text-xs bg-background border-input text-foreground focus:ring-1 focus:ring-blue-500 cursor-pointer rounded px-2 py-1"
                            style={{ color: statusOption?.color }}
                          >
                            {STATUS_OPTIONS.map(option => (
                              <option
                                key={option.value}
                                value={option.value}
                                style={{ color: option.color, backgroundColor: '#ffffff' }}
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {recruiter.email || recruiter.workEmail ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEmailClick(recruiter)}
                              className="hover:bg-muted text-muted-foreground hover:text-foreground"
                              title={`Email ${getDisplayName(recruiter)}`}
                            >
                              <Mail className="h-4 w-4 text-blue-600" />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          {filteredRecruiters.length > 0 && (
            <div className="px-6 py-4 border-t border-border bg-muted recruiter-helper-text">
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <p className="text-center flex-1 recruiter-helper-text-content">
                  Click on cells to edit recruiter information
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mail App Selection Dialog */}
      {mailAppDialogOpen && selectedRecruiterForEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 border border-border shadow-lg">
            <h3 className="text-xl font-semibold text-foreground mb-4">Choose Email App</h3>
            <p className="text-muted-foreground mb-6">
              Send email to {getDisplayName(selectedRecruiterForEmail)}
            </p>

            <div className="flex gap-3">
              <Button
                onClick={() => handleMailAppSelect('apple')}
                className="flex-1 bg-muted hover:bg-muted/80 text-foreground py-6"
              >
                <div className="flex flex-col items-center gap-2">
                  <Mail className="h-6 w-6" />
                  <span>Apple Mail</span>
                </div>
              </Button>

              <Button
                onClick={() => handleMailAppSelect('gmail')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-6"
              >
                <div className="flex flex-col items-center gap-2">
                  <Mail className="h-6 w-6" />
                  <span>Gmail</span>
                </div>
              </Button>
            </div>

            <Button
              onClick={() => {
                setMailAppDialogOpen(false);
                setSelectedRecruiterForEmail(null);
              }}
              variant="ghost"
              className="w-full mt-4 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Upgrade Dialog for CSV Export */}
      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upgrade to Export CSV</AlertDialogTitle>
            <AlertDialogDescription>
              CSV export is available for Pro and Elite tier users. Upgrade your plan to export your recruiters to CSV for further analysis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => navigate('/pricing')}
              className="bg-blue-600 hover:bg-blue-700 focus:ring-blue-600"
            >
              Upgrade to Pro/Elite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* 1. MAIN PAGE CONTAINER */
          .recruiter-spreadsheet-page {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
            box-sizing: border-box;
          }

          /* 5. INFO CARD */
          .recruiter-info-card {
            width: 100%;
            max-width: calc(100% - 32px);
            margin: 0 16px;
            box-sizing: border-box;
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            padding: 16px !important;
          }

          .recruiter-info-card > div:first-child {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .recruiter-info-card p,
          .recruiter-info-card span {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.75rem !important;
          }

          .recruiter-info-card > div:first-child > div {
            flex-wrap: wrap;
            gap: 8px;
          }

          .recruiter-action-buttons {
            width: 100%;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-start;
          }

          .recruiter-export-btn {
            flex: 1 1 auto;
            min-width: fit-content;
            padding: 8px 12px !important;
            font-size: 0.75rem;
            box-sizing: border-box;
          }

          .recruiter-refresh-btn,
          .recruiter-delete-btn {
            min-width: 44px;
            min-height: 44px;
            padding: 8px !important;
            box-sizing: border-box;
          }

          /* 6. SECTION HEADER */
          .recruiter-section-header {
            width: 100%;
            max-width: 100%;
            padding: 12px 16px !important;
            box-sizing: border-box;
          }

          .recruiter-section-header-content {
            flex: 1;
            min-width: 0;
          }

          .recruiter-section-header-text {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.875rem !important;
          }

          .recruiter-scroll-hint {
            flex-shrink: 0;
          }

          /* 7. SEARCH INPUT */
          .recruiter-search-section {
            width: 100%;
            max-width: 100%;
            padding: 12px 16px !important;
            box-sizing: border-box;
          }

          .recruiter-search-wrapper {
            width: 100%;
            max-width: calc(100% - 32px);
            margin: 0 auto;
            box-sizing: border-box;
          }

          .recruiter-search-input {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          /* 8. ACTION BUTTONS ROW - Already handled in info card above */

          /* 9. SCROLL INDICATOR - Keep within viewport */
          .swipe-hint {
            font-size: 0.75rem !important;
            white-space: nowrap;
          }

          /* 10. TABLE CONTAINER */
          .recruiter-table-wrapper {
            width: 100%;
            max-width: 100vw;
            box-sizing: border-box;
            margin: 0;
            overflow: visible;
          }

          .recruiter-table-container {
            width: 100%;
            overflow-x: auto;
            overflow-y: visible;
            -webkit-overflow-scrolling: touch;
            box-sizing: border-box;
          }

          .recruiter-table {
            min-width: 800px;
            width: 100%;
            box-sizing: border-box;
          }

          /* 11. HELPER TEXT */
          .recruiter-helper-text {
            width: 100%;
            max-width: 100%;
            padding: 12px 16px !important;
            box-sizing: border-box;
          }

          .recruiter-helper-text-content {
            width: 100%;
            text-align: left;
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.75rem !important;
          }

          /* GENERAL - Ensure all elements use box-sizing */
          .recruiter-spreadsheet-page * {
            box-sizing: border-box;
          }

          /* Prevent page-level horizontal scroll */
          .recruiter-spreadsheet-page {
            overflow-x: hidden;
          }
        }
      `}</style>
    </div>
  );
};

export default RecruiterSpreadsheet;

