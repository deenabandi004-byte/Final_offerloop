import React from "react";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Coffee, Sparkles, Rocket, Star, ArrowLeft, Calendar, Building2, Download, FileText } from "lucide-react";
import { CreditPill } from "@/components/credits";

const CoffeeChatLibrary: React.FC = () => {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();

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
                variant="outline"
                className="border-gray-600 hover:border-gray-500"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </div>
          </header>

          <main className="p-8">
            <div className="max-w-5xl mx-auto">
              {/* Coming Soon Hero Section */}
              <div className="text-center mb-12">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-blue-500 mb-8 animate-pulse">
                  <Coffee className="h-12 w-12 text-white" />
                </div>
                
                <div className="mb-6">
                  <span className="inline-flex items-center gap-2 bg-gradient-to-r from-green-500 to-blue-500 text-white border-none px-6 py-2 text-lg font-semibold rounded-full mb-6">
                    <Sparkles className="h-5 w-5" />
                    Coming Soon
                  </span>
                </div>
                
                <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Coffee Chat Library
                </h1>
                
                <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
                  Your personal archive of networking prep materials. Access all your coffee chat one-pagers, 
                  company research, and conversation guides in one organized place.
                </p>
                
                <div className="flex items-center justify-center gap-3 text-gray-400 mb-12">
                  <Rocket className="h-5 w-5 text-blue-400" />
                  <span className="text-lg">Launching soon - get ready to network smarter!</span>
                </div>

                {/* Star Rating */}
                <div className="flex justify-center gap-2 mb-12">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-6 w-6 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
              </div>

              {/* Feature Preview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:border-green-500/50 transition-all hover:shadow-lg hover:shadow-green-500/10">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-500/20 to-blue-500/20 border border-green-500/30 flex items-center justify-center mb-4">
                    <FileText className="h-6 w-6 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Organized Archive</h3>
                  <p className="text-sm text-gray-400">
                    All your coffee chat preps in one place, beautifully organized and easy to find.
                  </p>
                </div>

                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:border-blue-500/50 transition-all hover:shadow-lg hover:shadow-blue-500/10">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center mb-4">
                    <Download className="h-6 w-6 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Quick Access</h3>
                  <p className="text-sm text-gray-400">
                    Download any prep material instantly before your networking calls.
                  </p>
                </div>

                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:border-purple-500/50 transition-all hover:shadow-lg hover:shadow-purple-500/10">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center mb-4">
                    <Calendar className="h-6 w-6 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Track History</h3>
                  <p className="text-sm text-gray-400">
                    Review past preps and see who you've connected with over time.
                  </p>
                </div>
              </div>

              {/* Preview Mock Cards */}
              <div className="space-y-4 opacity-30 blur-sm pointer-events-none">
                <h3 className="text-lg font-semibold text-gray-400 mb-4">Preview</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="space-y-2 flex-1">
                          <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                        </div>
                        <div className="h-6 w-20 bg-green-500/20 rounded-full"></div>
                      </div>
                      
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-gray-500" />
                          <div className="h-3 bg-gray-700 rounded w-2/3"></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-500" />
                          <div className="h-3 bg-gray-700 rounded w-1/3"></div>
                        </div>
                      </div>
                      
                      <div className="h-9 bg-blue-500/20 rounded"></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA Section */}
              {/* CTA Section */}
              <div className="mt-16 text-center">
                <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/30 rounded-2xl p-8">
                  <h3 className="text-2xl font-bold text-white mb-4">
                    Ready to Network Smarter?
                  </h3>
                  <p className="text-gray-300 mb-6 max-w-xl mx-auto">
                    When Coffee Chat Library launches, you'll have instant access to all your networking prep materials. 
                    Start building your network today!
                  </p>
                  <Button
                    onClick={() => navigate("/home")}
                    size="lg"
                    className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-semibold px-8 py-6 text-lg"
                  >
                    <Coffee className="h-5 w-5 mr-2" />
                    Start Networking Now
                  </Button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default CoffeeChatLibrary;