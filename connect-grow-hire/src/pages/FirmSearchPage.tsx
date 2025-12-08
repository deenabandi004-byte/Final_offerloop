import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BackToHomeButton } from "@/components/BackToHomeButton";
import { CreditPill } from "@/components/credits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { Search, Sheet, History, Loader2, AlertCircle, ArrowUp, Download } from "lucide-react";
// ScoutBubble removed - now using ScoutHeaderButton in PageHeaderActions
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
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

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState('firm-search');

  // Loading state for saved firms
  const [loadingSavedFirms, setLoadingSavedFirms] = useState(true);
  const [deletingFirmId, setDeletingFirmId] = useState<string | null>(null);

  // Credit system state
  const [batchSize, setBatchSize] = useState<number>(10);
  const [batchOptions] = useState<number[]>([5, 10, 20, 40]);
  const [creditsPerFirm] = useState<number>(5);

  // Load all saved firms from Firebase on mount
  const loadAllSavedFirms = useCallback(async () => {
    if (!user) {
      setLoadingSavedFirms(false);
      return;
    }

    setLoadingSavedFirms(true);
    try {
      console.log('📥 Loading all saved firms from Firebase...');
      const history = await apiService.getFirmSearchHistory(50);

      // Extract all unique firms from all searches
      const allFirms: Firm[] = [];
      const firmIds = new Set<string>();

      for (const historyItem of history) {
        try {
          const searchData = await apiService.getFirmSearchById(historyItem.id);
          if (searchData && searchData.firms) {
            searchData.firms.forEach((firm: Firm) => {
              const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;
              if (!firmIds.has(firmKey)) {
                firmIds.add(firmKey);
                allFirms.push(firm);
              }
            });
          }
        } catch (err) {
          console.error(`Failed to load search ${historyItem.id}:`, err);
        }
      }

      console.log(`✅ Loaded ${allFirms.length} unique firms from Firebase`);
      setResults(allFirms);
    } catch (err) {
      console.error('❌ Failed to load saved firms:', err);
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

  // Load saved firms and history on mount
  useEffect(() => {
    loadAllSavedFirms();
    loadHistory();
  }, [loadAllSavedFirms, loadHistory]);

  // Reload saved firms when switching to Firm Library tab
  useEffect(() => {
    if (activeTab === 'firm-library' && user) {
      loadAllSavedFirms();
    }
  }, [activeTab, user, loadAllSavedFirms]);

  // Handle search submission
  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery || query;

    if (!q.trim()) {
      setError('Please enter a search query');
      return;
    }

    setIsSearching(true);
    setError(null);
    setHasSearched(true);

    try {
      const result: FirmSearchResult = await apiService.searchFirms(q, batchSize);

      if (result.success) {
        setParsedFilters(result.parsedFilters);

        if (result.firms.length === 0) {
          setError('No firms found matching your criteria. Try broadening your search or adjusting the location/industry.');
        } else {
          // Merge new firms with existing ones (avoid duplicates)
          const existingFirmKeys = new Set(
            results.map(f => f.id || `${f.name}-${f.location?.display}`)
          );

          const newFirms = result.firms.filter(firm => {
            const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;
            return !existingFirmKeys.has(firmKey);
          });

          setResults(prev => [...newFirms, ...prev]);

          toast({
            title: "Search Complete!",
            description: `Found ${result.firms.length} firms. Used ${result.creditsCharged || 0} credits.`,
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
      setError(err.message || 'An unexpected error occurred. Please try again.');
      toast({
        title: "Search Failed",
        description: err.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
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
      // Remove from local state
      setResults((prev) => 
        prev.filter((f) => getFirmKey(f) !== firmKey)
      );
      
      toast({
        title: "Firm deleted",
        description: "Removed from your Firm Library.",
      });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingFirmId(null);
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

  // CSV Export function
  const handleExportCsv = () => {
    if (!results || results.length === 0) {
      return;
    }

    const headers = [
      'Company Name',
      'Website',
      'LinkedIn',
      'Location',
      'Industry',
      'Employees',
      'Founded'
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
        escapeCsv(firm.industry),
        escapeCsv(firm.employeeCount?.toString()),
        escapeCsv(firm.founded?.toString())
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
                            disabled={isSearching || !query.trim()}
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
                          disabled={isSearching || !query.trim() || (effectiveUser.credits ?? 0) < (batchSize * creditsPerFirm)}
                          className="w-full h-12 text-white font-semibold"
                          style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
                        >
                          {isSearching ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Searching...
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

                    {/* Loading State */}
                    {isSearching && (
                      <Card className="bg-white border-border">
                        <CardContent className="p-6">
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
                  {loadingSavedFirms ? (
                    <Card className="bg-white border-border">
                      <CardContent className="p-6">
                        <LoadingSkeleton variant="card" count={5} />
                      </CardContent>
                    </Card>
                  ) : (
                  <div className="space-y-4">
                    {/* Export CSV Button */}
                    {results.length > 0 && (
                      <div className="flex justify-between items-center bg-white rounded-lg border border-border p-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {results.length} firm{results.length !== 1 ? 's' : ''} saved
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Export your results to CSV for further analysis
                          </p>
                        </div>
                        <Button
                          onClick={handleExportCsv}
                          className="gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                          <Download className="h-4 w-4" />
                          Export CSV
                        </Button>
                      </div>
                    )}

                    {/* Loading State */}
                    {loadingSavedFirms ? (
                      <Card className="bg-white border-border">
                        <CardContent className="p-6">
                          <LoadingSkeleton variant="card" count={5} />
                        </CardContent>
                      </Card>
                    ) : results.length > 0 ? (
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
                  )}
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
      </div>
    </SidebarProvider>
  );
};

export default FirmSearchPage;
