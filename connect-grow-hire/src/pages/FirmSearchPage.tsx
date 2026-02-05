import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useScout } from "@/contexts/ScoutContext";
import {
  History, Loader2, AlertCircle, ArrowUp, Download, Trash2, Building2, Search,
  CheckCircle, Users, Globe, Bookmark, ArrowRight, X, ChevronRight, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { apiService } from "@/services/api";
import type { Firm, FirmSearchResult, SearchHistoryItem } from "@/services/api";
import FirmSearchResults from "@/components/FirmSearchResults";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { StickyCTA } from "@/components/StickyCTA";

// Example prompts to show users
const EXAMPLE_SEARCHES = [
  { id: 1, label: 'Tech startups in SF', query: 'Early-stage tech startups in San Francisco focused on AI/ML' },
  { id: 2, label: 'Healthcare M&A banks', query: 'Mid-sized investment banks in New York focused on healthcare M&A' },
  { id: 3, label: 'Consulting in Chicago', query: 'Management consulting firms in Chicago with 100-500 employees' },
  { id: 4, label: 'Fintech in London', query: 'Series B+ fintech companies in London focused on payments' },
];

// Session storage key for Scout auto-populate
const SCOUT_AUTO_POPULATE_KEY = 'scout_auto_populate';

// Batch options
const BATCH_OPTIONS = [
  { value: 5 },
  { value: 10 },
  { value: 20 },
  { value: 40 },
];

// Helper for quantity messages
const getQuantityMessage = (qty: number) => {
  if (qty === 5) return "Perfect for focused targeting";
  if (qty === 10) return "Great for exploring an industry";
  if (qty === 20) return "Build a solid pipeline";
  return "Maximum discovery — cast a wide net";
};

const FirmSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, checkCredits } = useFirebaseAuth();
  const { openPanelWithSearchHelp } = useScout();
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;

  // Search state
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Firm[]>([]);
  const [parsedFilters, setParsedFilters] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{ current: number, total: number, step: string } | null>(null);
  const [searchComplete, setSearchComplete] = useState(false);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Ref for original button to track visibility
  const originalButtonRef = useRef<HTMLButtonElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState('firm-search');

  // Loading state for saved firms
  const [loadingSavedFirms, setLoadingSavedFirms] = useState(false);
  const [deletingFirmId, setDeletingFirmId] = useState<string | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  // Use a ref to track current results to avoid stale closures
  const resultsRef = useRef<Firm[]>([]);

  // Track deleted firm IDs to prevent them from reappearing
  const deletedFirmIds = useRef<Set<string>>(new Set());

  // Credit system state
  const [batchSize, setBatchSize] = useState<number>(10);
  const [creditsPerFirm] = useState<number>(5);

  // UI polish state
  const [selectedExampleId, setSelectedExampleId] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Validation
  const hasIndustry = query.length > 10;
  const hasLocation = /in\s+\w+|located|based in/i.test(query);
  const isValidQuery = query.length > 20 && hasLocation;

  // Refresh credits when batch size changes to update UI warnings
  useEffect(() => {
    if (checkCredits && user) {
      checkCredits();
    }
  }, [batchSize, checkCredits, user]);

  // Keep resultsRef in sync with results state
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // Handle Scout auto-populate from failed search or chat requests
  useEffect(() => {
    const handleAutoPopulate = () => {
      try {
        const stored = sessionStorage.getItem(SCOUT_AUTO_POPULATE_KEY);
        if (stored) {
          const data = JSON.parse(stored);

          let populateData;
          if (data.search_type === 'firm') {
            if (data.auto_populate) {
              populateData = data.auto_populate;
            } else {
              populateData = data;
            }

            const { industry, location: autoLocation } = populateData;
            let newQuery = '';
            if (industry) newQuery += industry;
            if (autoLocation) newQuery += (newQuery ? ' in ' : '') + autoLocation;

            if (newQuery) {
              setQuery(newQuery);
              sessionStorage.removeItem(SCOUT_AUTO_POPULATE_KEY);

              toast({
                title: "Search pre-filled",
                description: "Scout has filled in your search fields. Click Search to find firms.",
              });
            }
          }
        }
      } catch (e) {
        console.error('[Scout] Auto-populate error:', e);
      }
    };

    handleAutoPopulate();
    window.addEventListener('scout-auto-populate', handleAutoPopulate);
    return () => window.removeEventListener('scout-auto-populate', handleAutoPopulate);
  }, []);

  // Track recently deleted firm IDs to filter them out during reload
  const recentlyDeletedFirmIds = useRef<Set<string>>(new Set());

  // Load all saved firms from Firebase on mount
  const loadAllSavedFirms = useCallback(async () => {
    if (!user) {
      setLoadingSavedFirms(false);
      return;
    }

    setLoadingSavedFirms(true);
    try {
      const history = await apiService.getFirmSearchHistory(100, true);

      const allFirms: Firm[] = [];
      const firmIds = new Set<string>();
      const firmKeys = new Set<string>();

      history.forEach((historyItem: any) => {
        if (historyItem.results && Array.isArray(historyItem.results)) {
          historyItem.results.forEach((firm: Firm) => {
            if (firm.id && deletedFirmIds.current.has(firm.id)) {
              return;
            }

            if (firm.id && recentlyDeletedFirmIds.current.has(firm.id)) {
              return;
            }

            const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;

            if (firm.id) {
              if (!firmIds.has(firm.id)) {
                firmIds.add(firm.id);
                allFirms.push(firm);
              }
            } else {
              if (!firmKeys.has(firmKey)) {
                firmKeys.add(firmKey);
                allFirms.push(firm);
              }
            }
          });
        }
      });

      const filteredFirms = allFirms.filter(firm => {
        if (firm.id && deletedFirmIds.current.has(firm.id)) {
          return false;
        }
        return true;
      });

      if (recentlyDeletedFirmIds.current.size > 0) {
        recentlyDeletedFirmIds.current.clear();
      }

      setResults(filteredFirms);
      loadAttemptedRef.current = false;
    } catch (err) {
      console.error('Failed to load saved firms:', err);
      toast({
        title: "Failed to load firms",
        description: err instanceof Error ? err.message : "Please check your connection and try refreshing.",
        variant: "destructive",
      });
    } finally {
      setLoadingSavedFirms(false);
    }
  }, [user]);

  // Load search history
  const loadHistory = useCallback(async () => {
    if (!user) return;

    setLoadingHistory(true);
    try {
      const history = await apiService.getFirmSearchHistory(10);
      setSearchHistory(history);
    } catch (err) {
      console.error('Failed to load search history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  // Load history on mount
  useEffect(() => {
    loadHistory();
    if (checkCredits) {
      checkCredits();
    }
  }, [loadHistory, checkCredits]);

  // Track if we've attempted to load
  const loadAttemptedRef = useRef(false);

  // Load saved firms when switching to firm-library tab
  useEffect(() => {
    if (activeTab !== 'firm-library') {
      loadAttemptedRef.current = false;
      return;
    }

    if (!user) return;
    if (loadingSavedFirms) return;
    if (loadAttemptedRef.current) return;

    if (resultsRef.current.length > 0) return;

    loadAttemptedRef.current = true;
    loadAllSavedFirms();
  }, [activeTab, user, loadAllSavedFirms, loadingSavedFirms]);

  // Handle search submission
  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery || query;

    if (!q.trim()) {
      setError('Please enter a search query');
      return;
    }

    if (!user) {
      setError('Please sign in to search for firms');
      toast({
        title: "Authentication Required",
        description: "Please sign in to use Firm Search.",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    setSearchComplete(false);

    const estimatedSeconds = 2 + Math.ceil(batchSize / 5) * 2;
    const estimatedTime = estimatedSeconds < 60
      ? `${estimatedSeconds} seconds`
      : `${Math.ceil(estimatedSeconds / 60)} minutes`;

    // Initialize progress with estimated time
    setSearchProgress({ current: 0, total: batchSize, step: `Starting search... (est. ${estimatedTime})` });

    // Simulate progress while waiting (since search is synchronous)
    let simulatedProgressPercent = 0;
    let progressSimulator: NodeJS.Timeout | null = null;
    let progressPollInterval: NodeJS.Timeout | null = null;
    let searchId: string | null = null;
    let isPolling = true;

    // Start simulated progress - convert percentage to actual count
    progressSimulator = setInterval(() => {
      simulatedProgressPercent = Math.min(simulatedProgressPercent + 2, 90); // Cap at 90% until real progress
      const simulatedCount = Math.floor((simulatedProgressPercent / 100) * batchSize);
      setSearchProgress(prev => prev ? {
        ...prev,
        current: Math.max(prev.current, simulatedCount),
        step: prev.step || 'Searching...'
      } : null);
    }, 500); // Update every 500ms

    try {
      const result: FirmSearchResult = await apiService.searchFirms(q, batchSize);

      // Clear simulated progress
      clearInterval(progressSimulator);

      // Get searchId from response and start real progress polling
      if (result.searchId) {
        searchId = result.searchId;

        // Start polling for final status
        progressPollInterval = setInterval(async () => {
          if (!isPolling || !searchId) return;
          try {
            const status = await apiService.getFirmSearchStatus(searchId);
            if (status.success && status.progress) {
              setSearchProgress({
                current: status.progress.current,
                total: status.progress.total,
                step: status.progress.step || 'Searching...'
              });

              // Stop polling if search is complete or failed
              if (status.progress.status === 'completed' || status.progress.status === 'failed') {
                isPolling = false;
                if (progressPollInterval) {
                  clearInterval(progressPollInterval);
                  progressPollInterval = null;
                }
              }
            } else if (status.success === false) {
              // Search not found or expired - stop polling
              isPolling = false;
            }
          } catch (err) {
            // Ignore polling errors
            console.debug('Progress poll error:', err);
          }
        }, 1000);

        // Stop polling after a few seconds (search is likely done)
        setTimeout(() => {
          isPolling = false;
          if (progressPollInterval) {
            clearInterval(progressPollInterval);
            progressPollInterval = null;
          }
        }, 3000);
      }

      setSearchProgress(null);

      if (result.success) {
        setParsedFilters(result.parsedFilters);

        if (result.firms.length === 0) {
          setError('No firms found matching your criteria. Try broadening your search or adjusting the location/industry.');

          openPanelWithSearchHelp({
            searchType: 'firm',
            failedSearchParams: {
              industry: result.parsedFilters?.industry || q,
              location: result.parsedFilters?.location || '',
              size: result.parsedFilters?.size || '',
            },
            errorType: 'no_results',
          });
        } else {
          const newFirms = result.firms;
          setResults(newFirms);
          setSearchComplete(true);

          toast({
            title: result.partialMessage ? "Partial Results" : "Search Complete!",
            description: result.partialMessage
              ? `${result.partialMessage} Used ${result.creditsCharged || 0} credits.`
              : `Found ${result.firms.length} firm${result.firms.length !== 1 ? 's' : ''}. Used ${result.creditsCharged || 0} credits.`,
          });

          if (checkCredits) {
            await checkCredits();
          }
        }

        loadHistory();
      } else if (result.insufficientCredits) {
        setError(result.error || 'Insufficient credits');
        toast({
          title: "Insufficient Credits",
          description: `You need ${result.creditsNeeded} credits but only have ${result.currentCredits}. Please upgrade your plan or reduce batch size.`,
          variant: "destructive",
        });
      } else {
        setError(result.error || 'Search failed. Please try again.');
      }
    } catch (err: any) {
      console.error('Search error:', err);

      if (err.status === 401 || err.message?.includes('Authentication required')) {
        setError('Authentication required. Please sign in again.');
        toast({
          title: "Authentication Required",
          description: "Your session may have expired. Please sign in again.",
          variant: "destructive",
        });
      } else if (err.status === 402 || err.error_code === 'INSUFFICIENT_CREDITS') {
        const creditsNeeded = err.creditsNeeded || err.required || (batchSize * creditsPerFirm);
        const currentCredits = err.currentCredits || err.available || effectiveUser.credits || 0;

        setError(`Insufficient credits. You need ${creditsNeeded} credits but only have ${currentCredits}.`);
        toast({
          title: "Insufficient Credits",
          description: `You need ${creditsNeeded} credits but only have ${currentCredits}. Please upgrade your plan or reduce batch size.`,
          variant: "destructive",
        });

        if (checkCredits) {
          await checkCredits();
        }
      } else if (err.status === 502 || err.error_code === 'EXTERNAL_API_ERROR') {
        const errorMessage = err.message || 'The search service is temporarily unavailable. Please try again in a few minutes.';
        setError(errorMessage);
        toast({
          title: "Service Temporarily Unavailable",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        setError(err.message || 'An unexpected error occurred. Please try again.');
        toast({
          title: "Search Failed",
          description: err.message || "An error occurred. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      // Clean up all intervals
      if (progressSimulator) {
        clearInterval(progressSimulator);
        progressSimulator = null;
      }
      if (progressPollInterval) {
        clearInterval(progressPollInterval);
        progressPollInterval = null;
      }
      setIsSearching(false);
      setSearchProgress(null);
    }
  };

  // Handle "View Contacts" - navigate to contact search with company/location pre-filled
  const handleViewContacts = (firm: Firm) => {
    const params = new URLSearchParams();
    params.set('company', firm.name);

    if (firm.location?.display) {
      params.set('location', firm.location.display);
    } else if (firm.location?.city) {
      const locationParts = [firm.location.city, firm.location.state, firm.location.country].filter(Boolean);
      params.set('location', locationParts.join(', '));
    }

    navigate(`/contact-search?${params.toString()}`);
  };

  // Get unique firm key (helper function)
  const getFirmKey = (firm: Firm): string => {
    return firm.id || `${firm.name}-${firm.location?.display}`;
  };

  // Handle delete firm
  const handleDeleteFirm = async (firm: Firm) => {
    const firmKey = getFirmKey(firm);
    setDeletingFirmId(firmKey);

    try {
      if (firm.id) {
        deletedFirmIds.current.add(firm.id);
        recentlyDeletedFirmIds.current.add(firm.id);
      }

      setResults((prev) => {
        const filtered = prev.filter((f) => {
          if (firm.id && f.id) {
            return f.id !== firm.id;
          }
          const fKey = getFirmKey(f);
          return fKey !== firmKey;
        });
        return filtered;
      });

      const result = await apiService.deleteFirm(firm);

      if (result.success) {
        if (result.deletedCount === 0) {
          if (firm.id) {
            deletedFirmIds.current.delete(firm.id);
            recentlyDeletedFirmIds.current.delete(firm.id);
          }
          setResults((prev) => {
            const exists = prev.some(f => {
              if (firm.id && f.id) {
                return f.id === firm.id;
              }
              return getFirmKey(f) === firmKey;
            });
            if (!exists) {
              return [...prev, firm];
            }
            return prev;
          });
          toast({
            title: "Delete failed",
            description: "Firm not found in database. It may have already been deleted.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Firm deleted",
          description: `Removed from your Firm Library.`,
        });

        if (activeTab === 'firm-library') {
          const reloadAttempts = [1000, 2000, 3000];
          for (const delay of reloadAttempts) {
            setTimeout(async () => {
              try {
                await loadAllSavedFirms();
              } catch (reloadError) {
                console.error('Error reloading firms:', reloadError);
              }
            }, delay);
          }
        }
      } else {
        if (firm.id) {
          deletedFirmIds.current.delete(firm.id);
          recentlyDeletedFirmIds.current.delete(firm.id);
        }
        setResults((prev) => {
          const exists = prev.some(f => {
            if (firm.id && f.id) {
              return f.id === firm.id;
            }
            return getFirmKey(f) === firmKey;
          });
          if (!exists) {
            return [...prev, firm];
          }
          return prev;
        });
        throw new Error(result.error || 'Failed to delete firm');
      }
    } catch (error) {
      console.error('Delete firm error:', error);
      if (firm.id) {
        deletedFirmIds.current.delete(firm.id);
        recentlyDeletedFirmIds.current.delete(firm.id);
      }
      setResults((prev) => {
        const exists = prev.some(f => {
          if (firm.id && f.id) {
            return f.id === firm.id;
          }
          return getFirmKey(f) === firmKey;
        });
        if (!exists) {
          return [...prev, firm];
        }
        return prev;
      });
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingFirmId(null);
    }
  };

  // Handle delete all firms
  const handleDeleteAllFirms = async () => {
    const count = results.length;
    setShowDeleteAllDialog(false);

    try {
      const deletePromises = results.map(firm => apiService.deleteFirm(firm));
      const results_array = await Promise.allSettled(deletePromises);

      const successCount = results_array.filter(
        r => r.status === 'fulfilled' && r.value.success && (r.value.deletedCount || 0) > 0
      ).length;
      const failedCount = count - successCount;

      setResults([]);

      if (failedCount === 0) {
        toast({
          title: "All firms deleted",
          description: `Removed ${successCount} firm${successCount !== 1 ? 's' : ''} from your Firm Library.`,
        });

        if (activeTab === 'firm-library') {
          setTimeout(async () => {
            try {
              await loadAllSavedFirms();
            } catch (reloadError) {
              console.error('Error reloading firms:', reloadError);
            }
          }, 1000);
        }
      } else {
        toast({
          title: "Partial deletion",
          description: `Deleted ${successCount} of ${count} firms. ${failedCount} failed.`,
          variant: "default",
        });

        if (activeTab === 'firm-library') {
          setTimeout(async () => {
            try {
              await loadAllSavedFirms();
            } catch (reloadError) {
              console.error('Error reloading firms:', reloadError);
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.error('Error deleting all firms:', error);
      setResults([]);
      toast({
        title: "Delete error",
        description: "An error occurred while deleting firms.",
        variant: "destructive",
      });

      if (activeTab === 'firm-library') {
        setTimeout(async () => {
          try {
            await loadAllSavedFirms();
          } catch (reloadError) {
            console.error('Error reloading firms:', reloadError);
          }
        }, 1000);
      }
    }
  };

  // Handle clicking a history item
  const handleHistoryClick = (item: SearchHistoryItem) => {
    setQuery(item.query);
    setShowHistory(false);
    handleSearch(item.query);
  };

  // Handle example prompt click
  const handleExampleClick = (searchQuery: string, exampleId: number) => {
    setQuery(searchQuery);
    setSelectedExampleId(exampleId);
    // Briefly emphasize the textarea and auto-focus
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(() => {
        setSelectedExampleId(null);
      }, 150);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  // CSV Export function
  const handleExportCsv = () => {
    if (effectiveUser.tier === 'free') {
      setShowUpgradeDialog(true);
      return;
    }

    if (!results || results.length === 0) {
      return;
    }

    const headers = ['Company Name', 'Website', 'LinkedIn', 'Location', 'Industry'] as const;
    const headerRow = headers.join(',');

    const rows = results.map((firm) => {
      const escapeCsv = (val: string | undefined | null) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const location = firm.location?.display ||
        [firm.location?.city, firm.location?.state, firm.location?.country]
          .filter(Boolean)
          .join(', ');

      return [
        escapeCsv(firm.name),
        escapeCsv(firm.website),
        escapeCsv(firm.linkedinUrl),
        escapeCsv(location),
        escapeCsv(firm.industry)
      ].join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `firms_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle upgrade navigation
  const handleUpgrade = () => {
    setShowUpgradeDialog(false);
    navigate('/pricing');
  };

  const userTier: "free" | "pro" = effectiveUser?.tier === "pro" ? "pro" : "free";
  const maxBatchSize = userTier === 'free' ? 10 : 40;


  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader />

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
                  Find Companies
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
                  Discover companies that match your target criteria and career goals.
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
                    onClick={() => setActiveTab('firm-search')}
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
                      background: activeTab === 'firm-search' ? '#2563EB' : 'transparent',
                      color: activeTab === 'firm-search' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'firm-search' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <Search className="h-4 w-4" />
                    Find Companies
                  </button>

                  <button
                    onClick={() => setActiveTab('firm-library')}
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
                      background: activeTab === 'firm-library' ? '#2563EB' : 'transparent',
                      color: activeTab === 'firm-library' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'firm-library' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <Building2 className="h-4 w-4" />
                    Company Tracker
                    {results.length > 0 && (
                      <span
                        style={{
                          marginLeft: '6px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: activeTab === 'firm-library' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(37, 99, 235, 0.08)',
                          color: activeTab === 'firm-library' ? 'white' : '#2563EB',
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          fontSize: '11px',
                          fontWeight: 600,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {results.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                  {/* TAB 1: Find Companies */}
                  <TabsContent value="firm-search" className="mt-0">
                    {/* Authentication Notice */}
                    {!user && (
                      <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 animate-fadeInUp" style={{ animationDelay: '150ms' }}>
                        <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-700">Please sign in to use Find Companies.</p>
                      </div>
                    )}

                    {/* Main Card */}
                    <div 
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid rgba(37, 99, 235, 0.08)',
                        borderRadius: '14px',
                        padding: '36px 40px',
                        maxWidth: '900px',
                        margin: '0 auto',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
                        animationDelay: '200ms',
                      }}
                      className="overflow-hidden animate-fadeInUp firm-search-form-card"
                    >
                      {/* Simple gray divider instead of gradient */}
                      <div className="h-1 bg-gray-100"></div>

                      <div className="p-8 firm-search-form-content">
                        {/* Card Header with History Button */}
                        <div className="flex items-start justify-between mb-6 firm-search-header-row">
                          <div className="flex items-center gap-4 firm-search-header-content">
                            <div>
                              <h2 className="text-xl font-semibold text-gray-900 firm-search-form-title">What type of companies are you looking for?</h2>
                              <p className="text-gray-600 mt-1 firm-search-form-subtitle">Describe your ideal companies in natural language</p>
                            </div>
                          </div>

                          <button
                            onClick={() => setShowHistory(true)}
                            className="firm-search-history-btn flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition-all"
                          >
                            <History className="w-4 h-4" />
                            History
                          </button>
                        </div>

                        {/* Quick Start Templates */}
                        <div className="mb-6 firm-search-examples">
                          <p className="text-sm text-gray-500 mb-3">Try an example or write your own</p>
                          <div className="flex flex-wrap gap-2 firm-search-example-chips">
                            {EXAMPLE_SEARCHES.map((example) => (
                              <button
                                key={example.id}
                                onClick={() => handleExampleClick(example.query, example.id)}
                                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-sm text-gray-600 
                                         hover:bg-blue-50 hover:text-gray-900 hover:border-blue-200 
                                         transition-all duration-150"
                              >
                                {example.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Enhanced Textarea Input */}
                        <div className="relative firm-search-textarea-wrapper">
                          <textarea
                            ref={textareaRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={() => setSelectedExampleId(null)}
                            placeholder="e.g., Mid-sized investment banks in New York focused on healthcare M&A..."
                            rows={4}
                            disabled={isSearching || !user}
                            className={`w-full p-4 pr-14 text-base border-2 rounded-2xl firm-search-textarea
                                     text-gray-900 placeholder-gray-400 resize-none
                                     transition-all duration-150 disabled:opacity-50
                                     border-gray-200 hover:border-gray-300
                                     focus:border-blue-400 focus:bg-blue-50/20 focus:ring-1 focus:ring-blue-400/20
                                     ${selectedExampleId !== null ? 'bg-blue-50/30 border-blue-300' : ''}`}
                          />

                          {/* Submit button inside textarea */}
                          <button
                            onClick={() => handleSearch()}
                            disabled={!isValidQuery || isSearching || !user}
                            className={`
                            absolute bottom-4 right-4 w-10 h-10 rounded-full
                            flex items-center justify-center transition-all duration-200
                            ${isValidQuery && !isSearching && user
                                ? 'bg-blue-600 text-white shadow-md hover:scale-105'
                                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                              }
                          `}
                          >
                            {isSearching ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <ArrowUp className="w-5 h-5" />
                            )}
                          </button>
                        </div>

                        {/* Helper microcopy */}
                        <p className="mt-2 text-xs text-gray-400">
                          We'll convert this into structured filters automatically.
                        </p>

                        {/* Requirements hint */}
                        <div className="mt-3 flex flex-wrap items-center gap-x-1 text-sm">
                          <span className="text-gray-500">Include</span>
                          <span className={`font-medium ${hasIndustry ? 'text-green-600' : 'text-gray-900'}`}>
                            industry
                            {hasIndustry && <Check className="w-3 h-3 inline ml-0.5" />}
                          </span>
                          <span className="text-gray-400">(required),</span>
                          <span className={`font-medium ${hasLocation ? 'text-green-600' : 'text-gray-900'}`}>
                            location
                            {hasLocation && <Check className="w-3 h-3 inline ml-0.5" />}
                          </span>
                          <span className="text-gray-400">(required),</span>
                          <span className="text-gray-500">and optionally size, focus areas, and keywords.</span>
                        </div>

                        {/* Error Message */}
                        {error && (
                          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-red-700 text-sm">{error}</p>
                          </div>
                        )}

                        {/* Quantity Selector - Enhanced */}
                        <div className="mt-8 pt-8 border-t border-gray-100 firm-search-quantity-section">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2 firm-search-quantity-title">How many companies do you want to find?</h3>
                          <p className="text-gray-600 mb-5 firm-search-quantity-subtitle">Companies are saved to your Company Tracker for easy access.</p>

                          <div className="bg-gray-50 rounded-xl p-6 firm-search-quantity-card">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Quantity:</span>
                              {/* Quantity buttons */}
                              <div className="flex items-center gap-2 firm-search-quantity-buttons flex-1">
                                {BATCH_OPTIONS.map((option) => (
                                  <button
                                    key={option.value}
                                    onClick={() => setBatchSize(option.value)}
                                    disabled={isSearching || option.value > maxBatchSize}
                                    className={`
                                  px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-150 firm-search-quantity-btn flex-1
                                  ${batchSize === option.value
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                      }
                                  ${option.value > maxBatchSize ? 'opacity-50 cursor-not-allowed' : ''}
                                `}
                                  >
                                    {option.value}
                                  </button>
                                ))}
                              </div>
                              <span className="text-sm text-gray-500 whitespace-nowrap min-w-[80px] text-right">
                                {batchSize * creditsPerFirm} credits
                              </span>
                            </div>

                            {/* Insufficient Credits Warning */}
                            {effectiveUser.credits !== undefined && effectiveUser.credits < (batchSize * creditsPerFirm) && (
                              <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Insufficient credits. You need {batchSize * creditsPerFirm} but have {effectiveUser.credits}.
                              </p>
                            )}
                          </div>
                        </div>



                        {/* CTA Button */}
                        <div className="mt-8 firm-search-cta">
                          <button
                            ref={originalButtonRef}
                            onClick={() => handleSearch()}
                            disabled={!isValidQuery || isSearching || !user || (effectiveUser.credits ?? 0) < (batchSize * creditsPerFirm)}
                            className={`
                            w-full md:w-auto px-8 py-4 rounded-full font-semibold text-lg
                            flex items-center justify-center gap-3 mx-auto firm-search-find-btn
                            transition-all duration-200 transform
                            ${(!isValidQuery || isSearching || !user || (effectiveUser.credits ?? 0) < (batchSize * creditsPerFirm))
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-100'
                              }
                          `}
                          >
                            {isSearching ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Searching...
                              </>
                            ) : (
                              <>
                                Find Companies
                                <ArrowRight className="w-5 h-5" />
                              </>
                            )}
                          </button>

                          {/* Validation feedback */}
                          {query && !isValidQuery && (
                            <p className="text-center text-sm text-amber-600 mt-4 flex items-center justify-center gap-1">
                              <AlertCircle className="w-4 h-4" />
                              Please include both an industry and location in your search
                            </p>
                          )}
                        </div>

                        {/* Recent Searches Dropdown */}
                        {searchHistory.length > 0 && !hasSearched && (
                          <div className="mt-6 flex justify-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                                  <History className="w-4 h-4" />
                                  <span>Recent Searches</span>
                                  {searchHistory.length > 0 && (
                                    <span className="text-xs text-gray-400">({searchHistory.length})</span>
                                  )}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" side="bottom" className="w-80">
                                <DropdownMenuLabel>Recent Searches</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {searchHistory.slice(0, 3).map((search) => (
                                  <DropdownMenuItem
                                    key={search.id}
                                    onClick={() => handleHistoryClick(search)}
                                    className="flex flex-col items-start gap-1 py-3 px-3 cursor-pointer"
                                  >
                                    <p className="font-medium text-gray-900 text-sm line-clamp-2 w-full">
                                      {search.query}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {search.resultsCount} companies • {new Date(search.createdAt).toLocaleDateString()}
                                    </p>
                                  </DropdownMenuItem>
                                ))}
                                {searchHistory.length > 3 && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setShowHistory(true)}
                                      className="text-center justify-center"
                                    >
                                      View all ({searchHistory.length})
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* TAB 2: Company Tracker */}
                  <TabsContent value="firm-library" className="mt-0">
                    <div 
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid rgba(37, 99, 235, 0.08)',
                        borderRadius: '14px',
                        padding: '36px 40px',
                        maxWidth: '900px',
                        margin: '0 auto',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
                        animationDelay: '200ms',
                      }}
                      className="overflow-hidden animate-fadeInUp"
                    >
                      <div className="h-1 bg-gray-100"></div>

                      <div className="p-8">
                        {/* Header with actions */}
                        <div className="flex justify-between items-center pb-6 border-b border-gray-100 mb-6">
                          <div>
                            <h2 className="text-xl font-semibold text-gray-900">
                              {results.length} {results.length === 1 ? 'company' : 'companies'} saved
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                              Export your results to CSV for further analysis
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => {
                                loadAttemptedRef.current = false;
                                loadAllSavedFirms();
                              }}
                              variant="outline"
                              size="sm"
                              className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-50"
                              disabled={loadingSavedFirms}
                            >
                              {loadingSavedFirms ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              )}
                              Refresh
                            </Button>
                            {results.length > 0 && (
                              <>
                                <Button
                                  onClick={() => setShowDeleteAllDialog(true)}
                                  variant="outline"
                                  className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete All
                                </Button>
                                <Button
                                  onClick={handleExportCsv}
                                  className={`gap-2 ${effectiveUser.tier === 'free'
                                    ? 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed opacity-60'
                                    : 'bg-gray-900 hover:bg-gray-800'
                                    }`}
                                  disabled={effectiveUser.tier === 'free'}
                                  title={effectiveUser.tier === 'free' ? 'Upgrade to Pro or Elite to export CSV' : 'Export firms to CSV'}
                                >
                                  <Download className="h-4 w-4" />
                                  Export CSV
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Company Results */}
                        {loadingSavedFirms ? (
                          <LoadingSkeleton variant="card" count={3} />
                        ) : results.length > 0 ? (
                          <FirmSearchResults
                            firms={results}
                            onViewContacts={handleViewContacts}
                            onDelete={handleDeleteFirm}
                            deletingId={deletingFirmId}
                          />
                        ) : (
                          <div className="py-12 text-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              <Building2 className="h-8 w-8 text-gray-900" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">No companies yet</h3>
                            <p className="text-sm text-gray-500 mb-6">
                              Use the Find Companies tab to discover companies
                            </p>
                            <button
                              onClick={() => setActiveTab('firm-search')}
                              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:shadow-lg transition-all"
                            >
                              Find Companies
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </main>
        </MainContentWrapper>

        {/* Search History Modal */}
        {showHistory && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Search History</h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 space-y-2">
                {loadingHistory ? (
                  <div className="py-8 text-center">
                    <Loader2 className="h-6 w-6 text-gray-400 animate-spin mx-auto" />
                  </div>
                ) : searchHistory.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No search history yet</p>
                  </div>
                ) : (
                  searchHistory.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleHistoryClick(item)}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer transition-colors"
                    >
                      <div>
                        <p className="font-medium text-gray-900 text-sm line-clamp-2">{item.query}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.resultsCount} results • {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Loading Modal */}
        {isSearching && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
              {/* Animated Icon */}
              <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6 relative">
                <div className="absolute inset-0 bg-gray-200/50 rounded-2xl animate-pulse"></div>
                <Building2 className="w-10 h-10 text-gray-900 relative z-10" />
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Searching for companies</h3>

              {/* Status Message */}
              <p className="text-gray-600 mb-6 text-sm min-h-[20px]">
                {searchProgress?.step || `Finding ${batchSize} companies matching your criteria`}
              </p>

              {/* Progress Bar Container */}
              <div className="mb-4">
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden shadow-inner">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                    style={{
                      width: searchProgress
                        ? `${Math.max(2, Math.min(98, (searchProgress.current / searchProgress.total) * 100))}%`
                        : '10%'
                    }}
                  >
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-loading-shimmer bg-[length:200%_100%]"></div>
                  </div>
                </div>

                {/* Progress Text */}
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="font-medium text-blue-600">
                    {searchProgress
                      ? `${searchProgress.current} of ${searchProgress.total} companies`
                      : 'Starting...'}
                  </span>
                  <span className="text-gray-500">
                    {searchProgress
                      ? `${Math.round((searchProgress.current / searchProgress.total) * 100)}%`
                      : '0%'}
                  </span>
                </div>
              </div>

              {/* Estimated Time */}
              <p className="text-xs text-gray-400 mt-4">
                This usually takes 10-20 seconds
              </p>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {searchComplete && results.length > 0 && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl animate-scaleIn">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-1">Found {results.length} companies!</h3>
              <p className="text-gray-600 mb-2">Matching your criteria</p>
              <p className="text-sm text-blue-600 font-medium mb-6">Saved to your Company Tracker</p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => { setSearchComplete(false); setActiveTab('firm-library'); }}
                  className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:shadow-lg transition-all"
                >
                  View Companies →
                </button>
                <button
                  onClick={() => { setSearchComplete(false); setQuery(''); setHasSearched(false); }}
                  className="px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-full hover:bg-gray-200 transition-colors"
                >
                  Search again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete All Confirmation Dialog */}
        <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete All Companies?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove all {results.length} {results.length === 1 ? 'company' : 'companies'} from your Company Tracker.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAllFirms}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Upgrade Dialog for CSV Export */}
        <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Upgrade to Export CSV</AlertDialogTitle>
              <AlertDialogDescription>
                CSV export is available for Pro and Elite tier users. Upgrade your plan to export your company search results to CSV for further analysis.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleUpgrade}
                className="bg-blue-600 hover:bg-blue-700 focus:ring-blue-600"
              >
                Upgrade to Pro/Elite
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* 1. PAGE CONTAINER - Prevent horizontal overflow */
          .firm-search-page {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .firm-search-container {
            max-width: 100%;
            padding-left: 16px;
            padding-right: 16px;
            box-sizing: border-box;
          }

          /* 2. HEADER - Reduce font size, ensure wrapping */
          .firm-search-title {
            font-size: 1.75rem !important;
            line-height: 1.3;
            word-wrap: break-word;
            overflow-wrap: break-word;
            padding-left: 0;
            padding-right: 0;
          }

          /* 3. SUBTITLE TEXT - Reduce font size */
          .firm-search-subtitle {
            font-size: 0.875rem !important;
            line-height: 1.4;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 4. TAB BAR - Horizontal scroll or fit within viewport */
          .firm-search-tabs {
            width: 100% !important;
            max-width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            padding: 8px !important;
            justify-content: flex-start;
          }

          .firm-search-tabs::-webkit-scrollbar {
            display: none;
          }

          .firm-search-tabs button {
            min-width: fit-content;
            min-height: 44px;
            flex-shrink: 0;
            white-space: nowrap;
          }

          /* 5. FORM CARD - Full width, proper padding */
          .firm-search-form-card {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-form-content {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 6. SECTION HEADING + HISTORY BUTTON ROW - Stack if needed */
          .firm-search-header-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .firm-search-header-content {
            width: 100%;
          }

          .firm-search-form-title {
            font-size: 1.125rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.3;
          }

          .firm-search-form-subtitle {
            font-size: 0.875rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          .firm-search-history-btn {
            width: 100%;
            justify-content: center;
            min-height: 44px;
          }

          /* 7. EXAMPLE CHIPS - Wrap to multiple lines */
          .firm-search-examples {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-example-chips {
            flex-wrap: wrap !important;
            gap: 8px;
            max-width: 100%;
          }

          .firm-search-example-chips button {
            flex-shrink: 0;
            max-width: 100%;
            word-wrap: break-word;
            white-space: normal;
            padding: 8px 12px;
            font-size: 0.875rem;
          }

          /* 8. TEXTAREA - Full width, proper padding */
          .firm-search-textarea-wrapper {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-textarea {
            width: 100% !important;
            max-width: 100%;
            box-sizing: border-box;
            padding: 12px !important;
            padding-right: 48px !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 9. HOW MANY COMPANIES SECTION - Ensure wrapping */
          .firm-search-quantity-section {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-quantity-title {
            font-size: 1.125rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.3;
          }

          .firm-search-quantity-subtitle {
            font-size: 0.875rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          .firm-search-quantity-card {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 10. NUMBER SELECTOR BUTTONS - Ensure all 4 fit or allow scroll */
          .firm-search-quantity-buttons {
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-start;
          }

          .firm-search-quantity-btn {
            min-width: 60px;
            min-height: 44px !important;
            flex: 1 1 calc(25% - 6px);
            max-width: calc(25% - 6px);
            padding: 12px 8px !important;
            font-size: 0.875rem;
          }

          /* 11. COMPANY ICON VISUALIZATION ROW - Constrain to viewport */
          .firm-search-company-icons {
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            max-width: 100%;
            flex-wrap: nowrap;
            padding-bottom: 4px;
          }

          .firm-search-company-icons::-webkit-scrollbar {
            display: none;
          }

          .firm-search-company-icons > div {
            flex-shrink: 0;
          }

          /* 12. WHAT YOU'LL GET SECTION - Stack in 2x2 grid or single column */
          .firm-search-features-section {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-features-title {
            font-size: 0.75rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            padding: 0 8px;
          }

          .firm-search-features-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }

          .firm-search-features-grid > div {
            padding: 12px !important;
            box-sizing: border-box;
          }

          .firm-search-features-grid > div > div {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-features-grid p {
            font-size: 0.75rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 13. FIND COMPANIES CTA BUTTON - Full width */
          .firm-search-cta {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-find-btn {
            width: 100% !important;
            min-height: 48px !important;
            max-width: 100%;
            box-sizing: border-box;
            padding: 14px 16px !important;
          }

          /* GENERAL - Ensure all containers respect max-width */
          .firm-search-page * {
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-page input,
          .firm-search-page textarea,
          .firm-search-page select,
          .firm-search-page button {
            max-width: 100%;
            box-sizing: border-box;
          }

          /* Prevent text overflow */
          .firm-search-page p,
          .firm-search-page h1,
          .firm-search-page h2,
          .firm-search-page h3,
          .firm-search-page span,
          .firm-search-page label {
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
          }

          /* Ensure content doesn't touch screen edge */
          .firm-search-container > * {
            padding-left: 0;
            padding-right: 0;
          }

          /* Additional overflow fixes */
          html, body {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .firm-search-page {
            overflow-x: hidden;
          }

          .firm-search-header {
            padding-left: 16px;
            padding-right: 16px;
          }
        }
      `}</style>
      
      {/* Sticky CTA - Only show on firm-search tab */}
      {activeTab === 'firm-search' && (
        <StickyCTA
          originalButtonRef={originalButtonRef}
          onClick={() => handleSearch()}
          isLoading={isSearching}
          disabled={!isValidQuery || isSearching || !user || (effectiveUser.credits ?? 0) < (batchSize * creditsPerFirm)}
          buttonClassName="rounded-full"
        >
          <span>Find Companies</span>
        </StickyCTA>
      )}
    </SidebarProvider>
  );
};

export default FirmSearchPage;
