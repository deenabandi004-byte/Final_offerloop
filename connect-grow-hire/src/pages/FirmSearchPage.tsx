import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BackToHomeButton } from "@/components/BackToHomeButton";
import { CreditPill } from "@/components/credits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { Search, Sheet, History, Loader2, AlertCircle, ArrowUp, Download, Trash2 } from "lucide-react";
// ScoutBubble removed - now using ScoutHeaderButton in PageHeaderActions
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
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
import { PageHeaderActions } from "@/components/PageHeaderActions";

// Example prompts to show users
const EXAMPLE_PROMPTS = [
  "Investment banks in New York focused on healthcare M&A",
  "Mid-sized consulting firms in San Francisco",
  "Venture capital firms in Boston focused on biotech",
  "Large private equity firms in Chicago",
  "Software companies in Austin with 50-200 employees"
];

const FirmSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, checkCredits } = useFirebaseAuth();
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
  const [searchProgress, setSearchProgress] = useState<{current: number, total: number, step: string} | null>(null);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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
  const [batchOptions] = useState<number[]>([5, 10, 20, 40]);
  const [creditsPerFirm] = useState<number>(5);

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

  // Track recently deleted firm IDs to filter them out during reload
  const recentlyDeletedFirmIds = useRef<Set<string>>(new Set());
  
  // Load all saved firms from Firebase on mount
  // OPTIMIZED: Only load recent searches, not all 50
  const loadAllSavedFirms = useCallback(async () => {
    console.log('🚀 loadAllSavedFirms called', { hasUser: !!user, userId: user?.uid });
    
    if (!user) {
      console.log('❌ No user, skipping load');
      setLoadingSavedFirms(false);
      return;
    }

    setLoadingSavedFirms(true);
    try {
      console.log('📥 Loading saved firms from Firebase...');
      // Request history with firms included - use higher limit to get all searches
      // This ensures we get all firms, not just from the last 10 searches
      const history = await apiService.getFirmSearchHistory(100, true);
      console.log('📦 History received:', { historyLength: history.length, history });

      // Extract all unique firms from recent searches
      const allFirms: Firm[] = [];
      const firmIds = new Set<string>();
      const firmKeys = new Set<string>(); // Track both ID and name+location keys

      // Extract firms from history (now included in response)
      history.forEach((historyItem: any, index: number) => {
        console.log(`🔍 Processing history item ${index}:`, {
          hasResults: !!historyItem.results,
          resultsIsArray: Array.isArray(historyItem.results),
          resultsLength: historyItem.results?.length || 0
        });
        
        if (historyItem.results && Array.isArray(historyItem.results)) {
          historyItem.results.forEach((firm: Firm) => {
            // Skip if this firm was deleted (defensive check)
            if (firm.id && deletedFirmIds.current.has(firm.id)) {
              console.log(`⏭️ Skipping deleted firm: ${firm.id} (${firm.name})`);
              return;
            }
            
            // Skip if this firm was recently deleted (defensive check)
            if (firm.id && recentlyDeletedFirmIds.current.has(firm.id)) {
              console.log(`⏭️ Skipping recently deleted firm: ${firm.id} (${firm.name})`);
              return;
            }
            
            // Use ID as primary key if available, otherwise use name+location
            const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;
            
            // Deduplicate: prefer ID-based matching, but also check name+location
            if (firm.id) {
              if (!firmIds.has(firm.id)) {
                firmIds.add(firm.id);
                allFirms.push(firm);
              }
            } else {
              // No ID - use name+location as key
              if (!firmKeys.has(firmKey)) {
                firmKeys.add(firmKey);
                allFirms.push(firm);
              }
            }
          });
        }
      });

      console.log(`✅ Loaded ${allFirms.length} unique firms from ${history.length} recent searches`);
      
      // Filter out any firms that are marked as deleted (defensive check)
      const filteredFirms = allFirms.filter(firm => {
        if (firm.id && deletedFirmIds.current.has(firm.id)) {
          console.log(`🚫 Filtering out deleted firm from results: ${firm.id} (${firm.name})`);
          return false;
        }
        return true;
      });
      
      if (filteredFirms.length < allFirms.length) {
        console.log(`🧹 Filtered out ${allFirms.length - filteredFirms.length} deleted firms from results`);
      }
      
      // Clear recently deleted IDs after a successful reload (they should be gone from Firebase now)
      if (recentlyDeletedFirmIds.current.size > 0) {
        console.log(`🧹 Clearing ${recentlyDeletedFirmIds.current.size} recently deleted firm IDs from tracking`);
        recentlyDeletedFirmIds.current.clear();
      }
      
      setResults(filteredFirms);
      loadAttemptedRef.current = false; // Reset on success so we can reload if needed
    } catch (err) {
      console.error('❌ Failed to load saved firms:', err);
      // Don't reset loadAttemptedRef on error - this prevents infinite retries
      // User can manually refresh if needed
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
    // Refresh credits on mount to ensure UI shows current balance
    if (checkCredits) {
      checkCredits();
    }
  }, [loadHistory, checkCredits]);


  // Track if we've attempted to load (to prevent infinite retries on errors)
  const loadAttemptedRef = useRef(false);
  
  // Load saved firms when switching to firm-library tab (only if results are empty)
  // This prevents overwriting new search results, but loads library when needed
  useEffect(() => {
    // Only proceed if we're on the firm-library tab
    if (activeTab !== 'firm-library') {
      loadAttemptedRef.current = false; // Reset when switching away
      return;
    }

    // Must have a user to load saved firms
    if (!user) {
      console.log('⏭️ No user, cannot load saved firms');
      return;
    }

    // Don't load if already loading
    if (loadingSavedFirms) {
      console.log('⏭️ Already loading saved firms, skipping');
      return;
    }

    // Don't retry if we've already attempted and failed
    if (loadAttemptedRef.current) {
      console.log('⏭️ Load already attempted, skipping to prevent infinite retry');
      return;
    }

    // Only load if results are empty (don't overwrite fresh search results)
    // Since deletions persist to Firebase, we can safely reload and get the current state
    if (resultsRef.current.length > 0) {
      console.log('⏭️ Results already populated, skipping load to preserve search results');
      return;
    }

    // All conditions met - load saved firms
    console.log('📚 ✅ Loading saved firms for firm-library tab (all conditions met)');
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

    // Check if user is authenticated
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
    
    // Estimate time: ~2s for ChatGPT name generation + ~2s per batch of 5 firms (parallel)
    const estimatedSeconds = 2 + Math.ceil(batchSize / 5) * 2;
    const estimatedTime = estimatedSeconds < 60 
      ? `${estimatedSeconds} seconds` 
      : `${Math.ceil(estimatedSeconds / 60)} minutes`;
    
    setSearchProgress({current: 0, total: batchSize, step: `Generating firm names... (est. ${estimatedTime})`});

    try {
      const result: FirmSearchResult = await apiService.searchFirms(q, batchSize);
      
      // Clear progress on success
      setSearchProgress(null);

      if (result.success) {
        setParsedFilters(result.parsedFilters);

        if (result.firms.length === 0) {
          setError('No firms found matching your criteria. Try broadening your search or adjusting the location/industry.');
        } else {
          // For new searches, replace results. For library view, merge with existing.
          // Since we're on the search tab, replace the results to show only this search
          const newFirms = result.firms;
          
          // Replace results with new search results ONLY
          // This ensures we show exactly what was requested, not accumulated history
          setResults(newFirms);

          // Show toast with partial result message if applicable
          const toastDescription = result.partialMessage 
            ? `${result.partialMessage} Used ${result.creditsCharged || 0} credits.`
            : `Found ${result.firms.length} firm${result.firms.length !== 1 ? 's' : ''}. Used ${result.creditsCharged || 0} credits.`;

          toast({
            title: result.partialMessage ? "Partial Results" : "Search Complete!",
            description: toastDescription,
            variant: result.partialMessage ? "default" : "default",
          });

          if (checkCredits) {
            await checkCredits();
          }

          // Auto-switch to Firm Library tab when results come in
          setActiveTab('firm-library');
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
      
      // Handle authentication errors (401 status)
      if (err.status === 401 || err.message?.includes('Authentication required')) {
        setError('Authentication required. Please sign in again.');
        toast({
          title: "Authentication Required",
          description: "Your session may have expired. Please sign in again.",
          variant: "destructive",
        });
        // Optionally redirect to sign in
        // navigate('/signin');
      } else if (err.status === 402 || err.error_code === 'INSUFFICIENT_CREDITS') {
        const creditsNeeded = err.creditsNeeded || err.required || (batchSize * creditsPerFirm);
        const currentCredits = err.currentCredits || err.available || effectiveUser.credits || 0;
        
        setError(`Insufficient credits. You need ${creditsNeeded} credits but only have ${currentCredits}.`);
        toast({
          title: "Insufficient Credits",
          description: `You need ${creditsNeeded} credits but only have ${currentCredits}. Please upgrade your plan or reduce batch size.`,
          variant: "destructive",
        });
        
        // Refresh credits to update UI
        if (checkCredits) {
          await checkCredits();
        }
      } else if (err.status === 502 || err.error_code === 'EXTERNAL_API_ERROR') {
        // Handle external API errors (service temporarily unavailable)
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
      console.log('🗑️ Deleting firm:', { 
        firmId: firm.id, 
        firmName: firm.name, 
        firmLocation: firm.location?.display,
        firmKey 
      });
      
      // Track this firm ID as deleted to prevent it from reappearing
      if (firm.id) {
        deletedFirmIds.current.add(firm.id);
        recentlyDeletedFirmIds.current.add(firm.id);
        console.log(`📝 Tracking deleted firm ID: ${firm.id}`);
      }
      
      // Remove from local state IMMEDIATELY for responsive UI (optimistic update)
      setResults((prev) => {
        const filtered = prev.filter((f) => {
          // Match by ID if both have IDs, otherwise match by name+location
          if (firm.id && f.id) {
            return f.id !== firm.id;
          }
          // Fallback to name+location matching
          const fKey = getFirmKey(f);
          return fKey !== firmKey;
        });
        console.log(`🗑️ Removed firm from local state (optimistic): ${prev.length} -> ${filtered.length}`);
        return filtered;
      });
      
      // Delete from Firebase
      const result = await apiService.deleteFirm(firm);
      
      console.log('🗑️ Delete result:', result);
      
      if (result.success) {
        if (result.deletedCount === 0) {
          // No firms were actually deleted from Firebase
          console.warn('⚠️ Delete API returned success but deletedCount is 0 - firm not found in Firebase!');
          // Remove from tracking since it wasn't actually deleted
          if (firm.id) {
            deletedFirmIds.current.delete(firm.id);
            recentlyDeletedFirmIds.current.delete(firm.id);
          }
          // Re-add to local state since it wasn't actually deleted
          setResults((prev) => {
            // Check if firm is already in the list
            const exists = prev.some(f => {
              if (firm.id && f.id) {
                return f.id === firm.id;
              }
              return getFirmKey(f) === firmKey;
            });
            if (!exists) {
              console.log('🔄 Re-adding firm to local state (wasn\'t actually deleted)');
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
          description: `Removed from your Firm Library (${result.deletedCount} occurrence${result.deletedCount > 1 ? 's' : ''} removed).`,
        });
        
        // Reload saved firms to ensure UI reflects Firebase state
        // Use a longer delay to ensure Firebase has fully processed the deletion
        if (activeTab === 'firm-library') {
          console.log('🔄 Reloading saved firms after deletion to sync with Firebase...');
          // Try multiple reloads with increasing delays to handle eventual consistency
          const reloadAttempts = [1000, 2000, 3000];
          for (const delay of reloadAttempts) {
            setTimeout(async () => {
              try {
                console.log(`🔄 Reload attempt after ${delay}ms...`);
                await loadAllSavedFirms();
                console.log(`✅ Reloaded saved firms after ${delay}ms`);
              } catch (reloadError) {
                console.error(`❌ Error reloading firms after ${delay}ms:`, reloadError);
                // Don't show error toast - deletion was successful, just reload failed
              }
            }, delay);
          }
        }
      } else {
        // Remove from tracking if deletion failed
        if (firm.id) {
          deletedFirmIds.current.delete(firm.id);
          recentlyDeletedFirmIds.current.delete(firm.id);
        }
        // Re-add to local state since deletion failed
        setResults((prev) => {
          const exists = prev.some(f => {
            if (firm.id && f.id) {
              return f.id === firm.id;
            }
            return getFirmKey(f) === firmKey;
          });
          if (!exists) {
            console.log('🔄 Re-adding firm to local state (deletion failed)');
            return [...prev, firm];
          }
          return prev;
        });
        throw new Error(result.error || 'Failed to delete firm');
      }
    } catch (error) {
      console.error('❌ Delete firm error:', error);
      // Remove from tracking if deletion failed
      if (firm.id) {
        deletedFirmIds.current.delete(firm.id);
        recentlyDeletedFirmIds.current.delete(firm.id);
      }
      // Re-add to local state since deletion failed
      setResults((prev) => {
        const exists = prev.some(f => {
          if (firm.id && f.id) {
            return f.id === firm.id;
          }
          return getFirmKey(f) === firmKey;
        });
        if (!exists) {
          console.log('🔄 Re-adding firm to local state (error during deletion)');
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
      // Delete each firm from Firebase
      // Use Promise.allSettled to handle partial failures gracefully
      const deletePromises = results.map(firm => apiService.deleteFirm(firm));
      const results_array = await Promise.allSettled(deletePromises);
      
      const successCount = results_array.filter(
        r => r.status === 'fulfilled' && r.value.success && (r.value.deletedCount || 0) > 0
      ).length;
      const failedCount = count - successCount;
      
      // Clear local state immediately for responsive UI
      setResults([]);
      
      if (failedCount === 0) {
        toast({
          title: "All firms deleted",
          description: `Removed ${successCount} firm${successCount !== 1 ? 's' : ''} from your Firm Library.`,
        });
        
        // Reload to ensure UI is in sync with Firebase (should result in empty array if all deleted)
        if (activeTab === 'firm-library') {
          console.log('🔄 Reloading saved firms after delete all to verify Firebase state...');
          setTimeout(async () => {
            try {
              await loadAllSavedFirms();
              console.log('✅ Reloaded saved firms after delete all');
            } catch (reloadError) {
              console.error('❌ Error reloading firms after delete all:', reloadError);
            }
          }, 1000);
        }
      } else {
        toast({
          title: "Partial deletion",
          description: `Deleted ${successCount} of ${count} firms. ${failedCount} failed. Please refresh to see current state.`,
          variant: "default",
        });
        
        // Still reload to get accurate state
        if (activeTab === 'firm-library') {
          setTimeout(async () => {
            try {
              await loadAllSavedFirms();
            } catch (reloadError) {
              console.error('❌ Error reloading firms after partial delete:', reloadError);
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.error('Error deleting all firms:', error);
      // Still clear local state even if some deletions failed
      setResults([]);
      toast({
        title: "Delete error",
        description: "An error occurred while deleting firms. Please refresh the page to see the current state.",
        variant: "destructive",
      });
      
      // Try to reload to get accurate state
      if (activeTab === 'firm-library') {
        setTimeout(async () => {
          try {
            await loadAllSavedFirms();
          } catch (reloadError) {
            console.error('❌ Error reloading firms after delete error:', reloadError);
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
  const handleExampleClick = (prompt: string) => {
    setQuery(prompt);
    handleSearch(prompt);
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  // CSV Export function - only for Pro and Elite tiers
  const handleExportCsv = () => {
    // Check if user is on free tier
    if (effectiveUser.tier === 'free') {
      setShowUpgradeDialog(true);
      return;
    }

    if (!results || results.length === 0) {
      return;
    }

    const headers = [
      'Company Name',
      'Website',
      'LinkedIn',
      'Location',
      'Industry'
    ] as const;

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
    <SidebarProvider className="bg-transparent">
      <div className="flex min-h-screen w-full bg-transparent text-foreground">
        <AppSidebar />

        <div className="flex-1 bg-transparent">
          <header className="h-16 flex items-center justify-between border-b border-gray-100/30 px-6 bg-transparent shadow-sm relative z-20">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-foreground hover:bg-secondary" />
              <h1 className="text-xl font-semibold">Firm Search</h1>
            </div>
            <PageHeaderActions />
          </header>

          <main className="p-8 bg-transparent">
            <div className="max-w-7xl mx-auto bg-transparent">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full bg-transparent">
                <div className="flex justify-center mb-8">
                  <TabsList className="h-14 tabs-container-gradient border border-border grid grid-cols-2 max-w-lg w-full rounded-xl p-1 bg-white">
                    <TabsTrigger
                      value="firm-search"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <Search className="h-5 w-5 mr-2" />
                      Firm Search
                    </TabsTrigger>
                    <TabsTrigger
                      value="firm-library"
                      className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                    >
                      <Sheet className="h-5 w-5 mr-2" />
                      Firm Library ({results.length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* TAB 1: Firm Search */}
                <TabsContent value="firm-search" className="bg-transparent">
                  <div className="mx-auto max-w-6xl">
                    <Card className="bg-white border-border shadow-sm rounded-2xl">
                      <CardContent className="p-8 space-y-6">
                        {/* Header Section */}
                        <div className="space-y-2">
                          <h1 className="text-3xl font-semibold text-foreground">Firm Search</h1>
                          <p className="text-sm text-muted-foreground">
                            Discover companies that match your career interests.
                          </p>
                        </div>

                        {/* Authentication Notice */}
                        {!user && (
                          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                            <p className="text-sm text-yellow-600 flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <span>Please sign in to use Firm Search.</span>
                            </p>
                          </div>
                        )}

                        {/* Prompt Section */}
                        <div className="space-y-4 pt-4 border-t border-border">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-xl text-foreground">
                              Describe the firms you're looking for
                            </CardTitle>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowHistory(!showHistory)}
                              className="border-input text-foreground hover:bg-secondary"
                            >
                              <History className="h-4 w-4 mr-2" />
                              History
                            </Button>
                          </div>
                        <div className="relative">
                          <textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="e.g., Mid-sized investment banks in New York focused on healthcare M&A..."
                            rows={4}
                            className="min-h-[120px] w-full rounded-xl bg-white border border-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent resize-none disabled:opacity-50"
                            disabled={isSearching}
                          />
                          <button
                            onClick={() => handleSearch()}
                            disabled={isSearching || !query.trim() || !user}
                            className="absolute bottom-3 right-3 p-2 bg-primary rounded-full hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white"
                          >
                            {isSearching ? (
                              <Loader2 className="h-5 w-5 animate-spin text-white" />
                            ) : (
                              <ArrowUp className="h-5 w-5 text-white" />
                            )}
                          </button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Include <span className="text-destructive">*industry*</span> (required), <span className="text-destructive">*location*</span> (required), and optionally size, focus areas, and any key words you want for best results.
                        </p>

                        {/* Batch Size Section */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-border">
                          <div className="space-y-1">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Firm Batch Size
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Choose how many firms to pull per search.
                            </p>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="inline-flex items-center gap-2 rounded-full bg-white/50 p-1 border border-input">
                              {batchOptions.map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => setBatchSize(option)}
                                  disabled={isSearching || option > maxBatchSize}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${
                                    batchSize === option
                                      ? 'text-white'
                                      : 'text-muted-foreground hover:text-foreground'
                                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                                  style={batchSize === option ? { background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' } : undefined}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <div className="font-medium text-foreground">
                                {batchSize * creditsPerFirm} credits
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {creditsPerFirm} credits per firm
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Insufficient Credits Warning */}
                        {effectiveUser.credits !== undefined && effectiveUser.credits < (batchSize * creditsPerFirm) && (
                          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                            <p className="text-xs text-red-400 flex items-start gap-2">
                              <span>⚠️ Warning:</span>
                              <span>Insufficient credits. You need {batchSize * creditsPerFirm} credits but only have {effectiveUser.credits}.</span>
                            </p>
                          </div>
                        )}

                        <Button
                          onClick={() => handleSearch()}
                          disabled={isSearching || !query.trim() || !user || (effectiveUser.credits ?? 0) < (batchSize * creditsPerFirm)}
                          className="w-full h-12 text-white font-semibold"
                          style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
                        >
                          {isSearching ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {searchProgress?.step || 'Searching...'}
                            </>
                          ) : (
                            'Search Firms'
                          )}
                        </Button>
                        </div>

                        {/* Examples Section */}
                        {!hasSearched && (
                          <div className="space-y-3 pt-4 border-t border-border">
                            <h3 className="text-sm font-medium text-foreground">
                              Examples you can try
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              Click an example to fill in the search description.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {EXAMPLE_PROMPTS.map((example, index) => (
                                <button
                                  key={index}
                                  type="button"
                                  onClick={() => handleExampleClick(example)}
                                  className="whitespace-nowrap rounded-full border border-border bg-white px-3 py-1.5 text-xs text-foreground hover:bg-secondary hover:text-foreground transition-colors"
                                >
                                  {example}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Error Message */}
                    {error && (
                      <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg flex items-start space-x-3">
                        <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-red-200">{error}</p>
                        </div>
                      </div>
                    )}

                    {/* Parsed Filters Display */}
                    {parsedFilters && hasSearched && !error && (
                      <div className="p-4 bg-blue-900/30 border border-blue-500/50 rounded-lg">
                        <p className="text-sm text-blue-200">
                          <span className="font-medium">Searching for:</span>{' '}
                          {parsedFilters.size && parsedFilters.size !== 'none' && (
                            <span className="capitalize">{parsedFilters.size}-sized </span>
                          )}
                          <span className="capitalize">{parsedFilters.industry}</span> firms in{' '}
                          <span>{parsedFilters.location}</span>
                          {parsedFilters.keywords?.length > 0 && (
                            <span> focused on {parsedFilters.keywords.join(', ')}</span>
                          )}
                        </p>
                      </div>
                    )}

                    {/* Loading State with Progress */}
                    {isSearching && (
                      <Card className="bg-white border-border">
                        <CardContent className="p-6 space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                {searchProgress?.step || 'Searching...'}
                              </span>
                              {searchProgress && (
                                <span className="text-muted-foreground">
                                  {searchProgress.current}/{searchProgress.total}
                                </span>
                              )}
                            </div>
                            {searchProgress && (
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                  style={{ 
                                    width: `${(searchProgress.current / searchProgress.total) * 100}%` 
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <LoadingSkeleton variant="card" count={3} />
                        </CardContent>
                      </Card>
                    )}

                    {/* Success Message */}
                    {hasSearched && !isSearching && results.length > 0 && (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                        <p className="text-green-600">
                          <span className="font-medium">✓ Found {results.length} firms!</span> Switch to the "Firm Library" tab to view results and export to CSV.
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* TAB 2: Firm Library */}
                <TabsContent value="firm-library" className="!bg-white">
                  <div className="space-y-4">
                    {/* Export CSV and Delete All Buttons */}
                    <div className="flex justify-between items-center bg-white rounded-lg border border-border p-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {results.length} firm{results.length !== 1 ? 's' : ''} saved
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Export your results to CSV for further analysis
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => {
                            console.log('🔄 Manual refresh triggered');
                            loadAttemptedRef.current = false; // Reset attempt flag for manual refresh
                            loadAllSavedFirms();
                          }}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={loadingSavedFirms}
                        >
                          {loadingSavedFirms ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
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
                              className={`gap-2 ${
                                effectiveUser.tier === 'free' 
                                  ? 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed opacity-60' 
                                  : 'bg-blue-600 hover:bg-blue-700'
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

                    {/* Firm Results */}
                    {results.length > 0 ? (
                      <FirmSearchResults
                        firms={results}
                        onViewContacts={handleViewContacts}
                        onDelete={handleDeleteFirm}
                        deletingId={deletingFirmId}
                      />
                    ) : (
                      <Card className="bg-white border-border p-12 text-center">
                        <Sheet className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                        <p className="text-foreground mb-2">No firms to display yet</p>
                        <p className="text-sm text-muted-foreground">
                          Switch to the "Firm Search" tab to find companies
                        </p>
                      </Card>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>

        {/* Search History Sidebar */}
        {showHistory && (
          <>
            <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-border z-50">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Search History</h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto h-full pb-20">
                {loadingHistory ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin mx-auto" />
                  </div>
                ) : searchHistory.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No search history yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {searchHistory.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleHistoryClick(item)}
                        className="w-full p-4 text-left hover:bg-secondary transition-colors"
                      >
                        <p className="text-sm font-medium text-foreground line-clamp-2">
                          {item.query}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground">
                            {item.resultsCount} firms found
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Overlay for history sidebar */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-40"
              onClick={() => setShowHistory(false)}
            />
          </>
        )}

        {/* Delete All Confirmation Dialog */}
        <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete All Firms?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove all {results.length} firm{results.length !== 1 ? 's' : ''} from your Firm Library. 
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
                CSV export is available for Pro and Elite tier users. Upgrade your plan to export your firm search results to CSV for further analysis.
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
    </SidebarProvider>
  );
};

export default FirmSearchPage;
