import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { AppHeader } from '@/components/AppHeader';
import { Dashboard } from '@/components/Dashboard';

export default function DashboardPage() {
  console.log("📊 [DASHBOARD PAGE] Component rendering");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />

          <main className="flex-1 overflow-y-auto p-6 bg-white">
            <div style={{ width: '100%', minWidth: 'fit-content' }}>
              <div style={{ maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
                {/* Page Title - Matching Find People styling */}
                <h1 className="text-[28px] font-semibold text-gray-900 mb-6">
                  Dashboard
                </h1>
                
                {/* Dashboard Content */}
                <Dashboard />
              </div>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
