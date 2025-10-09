import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { apiService } from "../services/api";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Coffee, Calendar, Building2, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CreditPill } from "@/components/credits";

interface CoffeeChatPrep {
  id: string;
  contactName: string;
  company: string;
  jobTitle: string;
  linkedinUrl: string;
  status: string;
  createdAt: string;
  error?: string;
}

const CoffeeChatLibrary: React.FC = () => {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [preps, setPreps] = useState<CoffeeChatPrep[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadCoffeeChatPreps();
  }, []);

  const loadCoffeeChatPreps = async () => {
    try {
      setLoading(true);
      const result = await apiService.getAllCoffeeChatPreps();
      
      if ('preps' in result && result.preps) {
        setPreps(result.preps);
      } else if ('error' in result) {
        console.error('Failed to load preps:', result.error);
        toast({
          title: "Error",
          description: "Failed to load coffee chat preps",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error loading coffee chat preps:', error);
      toast({
        title: "Error",
        description: "Failed to load coffee chat preps",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (prepId: string) => {
    try {
      setDownloadingId(prepId);
      const blob = await apiService.downloadCoffeeChatPDF(prepId);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `coffee_chat_${prepId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "PDF downloaded successfully",
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Download Failed",
        description: "Could not download the PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (prepId: string, contactName: string) => {
    if (!confirm(`Delete coffee chat prep for ${contactName}?`)) {
      return;
    }

    try {
      setDeletingId(prepId);
      
      // Optimistically remove from UI immediately
      setPreps(currentPreps => currentPreps.filter(prep => prep.id !== prepId));
      
      await apiService.deleteCoffeeChatPrep(prepId);
      
      toast({
        title: "Deleted",
        description: "Coffee Chat Prep deleted successfully",
      });
    } catch (error) {
      console.error('Delete failed:', error);
      
      // If delete fails, reload to restore the item
      await loadCoffeeChatPreps();
      
      toast({
        title: "Delete Failed",
        description: "Could not delete prep. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; text: string }> = {
      completed: { color: 'bg-green-500/10 text-green-400 border-green-500/30', text: 'Completed' },
      processing: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', text: 'Processing' },
      failed: { color: 'bg-red-500/10 text-red-400 border-red-500/30', text: 'Failed' },
    };

    const config = statusConfig[status] || statusConfig.processing;
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs border ${config.color}`}>
        {config.text}
      </span>
    );
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-900 text-white">
        <AppSidebar />

        <div className="flex-1">
          <header className="h-16 flex items-center justify-between border-b border-gray-800 px-6 bg-gray-900/80 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-white hover:bg-gray-800/50" />
              <h1 className="text-xl font-semibold">Coffee Chat Library</h1>
            </div>

            <div className="flex items-center gap-4">
              <CreditPill
                credits={user?.credits ?? 0}
                max={user?.maxCredits ?? 120}
              />
              <Button
                size="sm"
                onClick={() => navigate("/home")}
                className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
              >
                <Coffee className="h-4 w-4 mr-2" />
                New Prep
              </Button>
            </div>
          </header>

          <main className="p-8">
            <div className="max-w-7xl mx-auto">
              {/* Header Section */}
              <div className="mb-8">
                <h2 className="text-3xl font-bold mb-2">Your Coffee Chat Preps</h2>
                <p className="text-gray-400">
                  Access all your generated coffee chat one-pagers and download them anytime.
                </p>
              </div>

              {/* Loading State */}
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              )}

              {/* Empty State */}
              {!loading && preps.length === 0 && (
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Coffee className="h-16 w-16 text-gray-600 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">No Coffee Chat Preps Yet</h3>
                    <p className="text-gray-400 mb-6 text-center max-w-md">
                      Create your first coffee chat prep to get personalized conversation starters and insights.
                    </p>
                    <Button
                      onClick={() => navigate("/home")}
                      className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                    >
                      <Coffee className="h-4 w-4 mr-2" />
                      Create Your First Prep
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Preps Grid */}
              {!loading && preps.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {preps.map((prep) => (
                    <Card
                      key={prep.id}
                      className="bg-gray-800/50 border-gray-700 hover:border-gray-600 transition-all hover:shadow-lg"
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between mb-2">
                          <CardTitle className="text-lg line-clamp-1">
                            {prep.contactName || 'Unknown Contact'}
                          </CardTitle>
                          {getStatusBadge(prep.status)}
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        {/* Contact Details */}
                        <div className="space-y-2">
                          <div className="flex items-start gap-2 text-sm">
                            <Building2 className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="text-gray-300">{prep.company || 'N/A'}</div>
                              <div className="text-gray-500 text-xs">{prep.jobTitle || 'N/A'}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Calendar className="h-4 w-4" />
                            <span>{formatDate(prep.createdAt)}</span>
                          </div>
                        </div>

                        {/* Error Message */}
                        {prep.status === 'failed' && prep.error && (
                          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
                            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>{prep.error}</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="pt-2 flex gap-2">
                          {prep.status === 'completed' && (
                            <Button
                              onClick={() => handleDownload(prep.id)}
                              disabled={downloadingId === prep.id || deletingId === prep.id}
                              className="flex-1 bg-blue-600 hover:bg-blue-700"
                              size="sm"
                            >
                              {downloadingId === prep.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Downloading...
                                </>
                              ) : (
                                <>
                                  <Download className="h-4 w-4 mr-2" />
                                  Download PDF
                                </>
                              )}
                            </Button>
                          )}

                          {prep.status === 'processing' && (
                            <Button
                              disabled
                              className="flex-1 bg-gray-700"
                              size="sm"
                            >
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </Button>
                          )}

                          {prep.status === 'failed' && (
                            <Button
                              onClick={() => navigate('/home')}
                              variant="outline"
                              className="flex-1"
                              size="sm"
                            >
                              Try Again
                            </Button>
                          )}

                          {/* Delete Button - Always show */}
                          <Button
                            onClick={() => handleDelete(prep.id, prep.contactName)}
                            disabled={deletingId === prep.id || downloadingId === prep.id}
                            variant="outline"
                            size="sm"
                            className="text-red-400 hover:text-red-300 border-red-400/30 hover:border-red-400/50"
                          >
                            {deletingId === prep.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default CoffeeChatLibrary;