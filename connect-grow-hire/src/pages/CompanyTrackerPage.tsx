// src/pages/CompanyTrackerPage.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Trash2, RefreshCw } from 'lucide-react';
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
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { apiService } from '@/services/api';
import type { Firm } from '@/services/api';
import FirmSearchResults from '@/components/FirmSearchResults';
import { toast } from '@/hooks/use-toast';

export default function CompanyTrackerPage() {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;

  // State
  const [results, setResults] = useState<Firm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingFirmId, setDeletingFirmId] = useState<string | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  
  const loadAttemptedRef = useRef(false);

  // Load all saved firms from Firebase
  const loadAllSavedFirms = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const history = await apiService.getFirmSearchHistory(100);
      const allFirms: Firm[] = [];
      const seenFirmIds = new Set<string>();

      for (const historyItem of history) {
        try {
          const searchData = await apiService.getFirmSearchById(historyItem.id);
          if (searchData && searchData.firms) {
            for (const firm of searchData.firms) {
              const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;
              if (!seenFirmIds.has(firmKey)) {
                seenFirmIds.add(firmKey);
                allFirms.push({
                  ...firm,
                  searchId: historyItem.id,
                });
              }
            }
          }
        } catch (err) {
          console.error(`Failed to load search ${historyItem.id}:`, err);
        }
      }

      setResults(allFirms);
    } catch (err) {
      console.error('Failed to load saved firms:', err);
      toast({
        title: "Error loading companies",
        description: "Failed to load your saved companies. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Load saved firms on mount
  useEffect(() => {
    if (user && !loadAttemptedRef.current) {
      loadAttemptedRef.current = true;
      loadAllSavedFirms();
    }
  }, [user, loadAllSavedFirms]);

  // Handle viewing contacts for a firm
  const handleViewContacts = (firm: Firm) => {
    const params = new URLSearchParams();
    if (firm.name) params.set('company', firm.name);
    if (firm.location?.display) params.set('location', firm.location.display);
    navigate(`/contact-search?${params.toString()}`);
  };

  // Handle deleting a single firm
  const handleDeleteFirm = async (firm: Firm) => {
    if (!firm.searchId) {
      toast({
        title: "Cannot delete",
        description: "This firm cannot be deleted because it's missing search information.",
        variant: "destructive",
      });
      return;
    }

    setDeletingFirmId(firm.id || firm.name);
    try {
      await apiService.deleteFirmFromSearch(firm.searchId, firm.id || firm.name);
      
      // Remove from local state
      setResults(prev => prev.filter(f => {
        const currentKey = f.id || `${f.name}-${f.location?.display}`;
        const deletedKey = firm.id || `${firm.name}-${firm.location?.display}`;
        return currentKey !== deletedKey;
      }));

      toast({
        title: "Company deleted",
        description: `${firm.name} has been removed from your tracker.`,
      });

      // Reload to ensure sync
      setTimeout(() => loadAllSavedFirms(), 500);
    } catch (error) {
      console.error('Failed to delete firm:', error);
      toast({
        title: "Delete failed",
        description: "Failed to delete the company. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingFirmId(null);
    }
  };

  // Handle deleting all firms
  const handleDeleteAllFirms = async () => {
    setShowDeleteAllDialog(false);
    
    try {
      const history = await apiService.getFirmSearchHistory(100);
      
      for (const historyItem of history) {
        try {
          await apiService.deleteFirmSearch(historyItem.id);
        } catch (err) {
          console.error(`Failed to delete search ${historyItem.id}:`, err);
        }
      }

      setResults([]);
      toast({
        title: "All companies deleted",
        description: "Your company tracker has been cleared.",
      });

      // Reload to verify
      setTimeout(() => loadAllSavedFirms(), 500);
    } catch (error) {
      console.error('Failed to delete all firms:', error);
      toast({
        title: "Delete failed",
        description: "Failed to delete all companies. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle CSV export
  const handleExportCsv = () => {
    if (effectiveUser.tier === 'free') {
      setShowUpgradeDialog(true);
      return;
    }

    if (results.length === 0) return;

    const headers = ['Name', 'Industry', 'Location', 'Size', 'Description', 'Website'];
    const csvContent = [
      headers.join(','),
      ...results.map(firm => [
        `"${(firm.name || '').replace(/"/g, '""')}"`,
        `"${(firm.industry || '').replace(/"/g, '""')}"`,
        `"${(firm.location?.display || '').replace(/"/g, '""')}"`,
        `"${(firm.employeeCount || '').replace(/"/g, '""')}"`,
        `"${(firm.description || '').replace(/"/g, '""')}"`,
        `"${(firm.websiteUrl || '').replace(/"/g, '""')}"`,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `company_tracker_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: "Export successful",
      description: `Exported ${results.length} companies to CSV.`,
    });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          
          <main className="bg-white min-h-screen company-tracker-page">
            <div className="max-w-5xl mx-auto px-8 pt-10 pb-8 company-tracker-container">
              <h1 className="text-[28px] font-semibold text-gray-900 mb-2 company-tracker-title">
                Company Tracker
              </h1>
              
              <p className="text-gray-500 text-sm mb-6 company-tracker-subtitle">
                All companies you've found and saved.
              </p>

              {/* Controls */}
              <div className="flex items-center justify-between gap-4 mb-6 company-tracker-controls-row">
                <span className="text-sm text-gray-500 company-tracker-count">
                  {results.length} {results.length === 1 ? 'company' : 'companies'} saved
                </span>

                <div className="flex items-center gap-2 company-tracker-action-buttons">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      loadAttemptedRef.current = false;
                      loadAllSavedFirms();
                    }}
                    disabled={isLoading}
                    className="gap-2 border-gray-300 hover:border-gray-400"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Refresh
                  </Button>
                  
                  {results.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleteAllDialog(true)}
                        className="gap-2 text-red-600 border-gray-300 hover:border-red-300 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportCsv}
                        disabled={effectiveUser.tier === 'free'}
                        className="gap-2 border-gray-300 hover:border-gray-400"
                        title={effectiveUser.tier === 'free' ? 'Upgrade to Pro or Elite to export CSV' : 'Export to CSV'}
                      >
                        <Download className="h-4 w-4" />
                        Export CSV
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Content */}
              {isLoading ? (
                <div className="py-12 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                </div>
              ) : results.length > 0 ? (
                <FirmSearchResults
                  firms={results}
                  onViewContacts={handleViewContacts}
                  onDelete={handleDeleteFirm}
                  deletingId={deletingFirmId}
                />
              ) : (
                <div className="border border-gray-200 rounded-lg p-12 text-center bg-white">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <p className="text-gray-900 font-medium mb-2">No companies saved yet</p>
                  <p className="text-sm text-gray-500 mb-6">
                    Use the Find Companies page to discover and save companies
                  </p>
                  <Button
                    onClick={() => navigate('/firm-search')}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Find Companies
                  </Button>
                </div>
              )}
            </div>
          </main>
        </MainContentWrapper>
      </div>

      {/* Delete All Confirmation Dialog */}
      <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Companies?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all {results.length} {results.length === 1 ? 'company' : 'companies'} from your tracker. 
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
              CSV export is available for Pro and Elite tier users. Upgrade your plan to export your companies to CSV.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => navigate('/pricing')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Upgrade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* 1. PAGE CONTAINER */
          .company-tracker-page {
            overflow-x: hidden;
            width: 100%;
            max-width: 100vw;
          }

          .company-tracker-container {
            width: 100%;
            max-width: 100vw;
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 2. HEADER ELEMENTS */
          .company-tracker-title {
            width: 100%;
            max-width: 100%;
            font-size: 1.5rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            margin: 0 0 8px 0 !important;
            padding: 0;
            box-sizing: border-box;
          }

          .company-tracker-subtitle {
            width: 100%;
            max-width: 100%;
            font-size: 0.875rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            margin: 0 0 16px 0 !important;
            padding: 0;
            box-sizing: border-box;
          }

          /* 3. ACTION BUTTONS ROW */
          .company-tracker-controls-row {
            width: 100%;
            max-width: 100%;
            padding: 0;
            box-sizing: border-box;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin: 0 0 16px 0 !important;
          }

          .company-tracker-count {
            width: 100%;
            flex-basis: 100%;
            margin-bottom: 8px;
          }

          .company-tracker-action-buttons {
            width: 100%;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-start;
          }

          .company-tracker-action-buttons button {
            flex: 1 1 auto;
            min-width: fit-content;
            box-sizing: border-box;
          }
        }
      `}</style>
    </SidebarProvider>
  );
}
