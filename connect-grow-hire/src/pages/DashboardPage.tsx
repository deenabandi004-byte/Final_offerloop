import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LayoutDashboard, Mail, Calendar as CalendarIcon } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import Header from '@/components/Header';
import { Dashboard } from '@/components/Dashboard';
import { OutboxEmbedded } from '@/components/OutboxEmbedded';
import { Calendar } from '@/components/Calendar';
import { PageHeaderActions } from '@/components/PageHeaderActions';
import { OnboardingWalkthrough } from '@/components/OnboardingWalkthrough';
import { useSearchParams } from 'react-router-dom';

type TabType = 'dashboard' | 'outbox' | 'calendar';

export default function DashboardPage() {
  console.log("📊 [DASHBOARD PAGE] Component rendering");
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(tabParam && ['dashboard', 'outbox', 'calendar'].includes(tabParam) ? tabParam : 'dashboard');

  useEffect(() => {
    if (tabParam && ['dashboard', 'outbox', 'calendar'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const getTabPosition = () => {
    switch (activeTab) {
      case 'dashboard':
        return '4px';
      case 'outbox':
        return 'calc(33.33% + 2px)';
      case 'calendar':
        return 'calc(66.66% + 1px)';
      default:
        return '4px';
    }
  };

  return (
    <SidebarProvider>
      <OnboardingWalkthrough />
      <div className="flex min-h-screen w-full bg-transparent">
        <AppSidebar />
        <div className="flex-1 min-w-0">
          {/* Header with Sidebar Toggle */}
          <header className="h-16 flex items-center justify-between border-b border-gray-100/30 px-6 bg-transparent shadow-sm relative z-20">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-foreground hover:bg-secondary" />
              <h1 className="text-xl font-semibold">Home</h1>
            </div>
            <PageHeaderActions />
          </header>

          <main className="p-6 bg-transparent">
            <div className="max-w-[1280px] mx-auto">
              {/* Tabs */}
              <div className="flex justify-center mb-8">
                <div className="relative grid w-full grid-cols-3 max-w-lg border border-border p-1 rounded-xl h-14 overflow-hidden tabs-container-gradient bg-card">
                  {/* Animated sliding background */}
                  <motion.div
                    className="absolute rounded-lg h-12"
                    style={{ 
                      background: 'linear-gradient(135deg, #3B82F6, #60A5FA)',
                      top: '4px'
                    }}
                    initial={false}
                    animate={{ 
                      left: getTabPosition(),
                      width: 'calc(33.33% - 4px)'
                    }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 400, 
                      damping: 30 
                    }}
                  />
                  
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`relative z-10 gap-2 h-12 font-medium transition-all flex items-center justify-center ${
                      activeTab === 'dashboard'
                        ? 'text-white'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <motion.div
                      whileHover={{ y: activeTab === 'dashboard' ? 0 : -1 }}
                      className="flex items-center gap-2"
                    >
                      <LayoutDashboard className="h-5 w-5" />
                      Dashboard
                    </motion.div>
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('outbox')}
                    className={`relative z-10 gap-2 h-12 font-medium transition-all flex items-center justify-center ${
                      activeTab === 'outbox'
                        ? 'text-white'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <motion.div
                      whileHover={{ y: activeTab === 'outbox' ? 0 : -1 }}
                      className="flex items-center gap-2"
                    >
                      <Mail className="h-5 w-5" />
                      Outbox
                    </motion.div>
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('calendar')}
                    className={`relative z-10 gap-2 h-12 font-medium transition-all flex items-center justify-center ${
                      activeTab === 'calendar'
                        ? 'text-white'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <motion.div
                      whileHover={{ y: activeTab === 'calendar' ? 0 : -1 }}
                      className="flex items-center gap-2"
                    >
                      <CalendarIcon className="h-5 w-5" />
                      Calendar
                    </motion.div>
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'outbox' && <OutboxEmbedded />}
              {activeTab === 'calendar' && <Calendar />}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
