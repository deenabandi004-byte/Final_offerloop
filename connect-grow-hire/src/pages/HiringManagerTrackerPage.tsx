// src/pages/HiringManagerTrackerPage.tsx
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { AppHeader } from '@/components/AppHeader';
import RecruiterSpreadsheet from '@/components/RecruiterSpreadsheet';

export default function HiringManagerTrackerPage() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          
          <main className="bg-white min-h-screen">
            {/* Page Header Container - Matching Find People exactly */}
            <div className="max-w-5xl mx-auto px-8 pt-10 pb-8">
              <h1 className="text-[28px] font-semibold text-gray-900 mb-2">
                Hiring Manager Tracker
              </h1>
              
              {/* Helper text */}
              <p className="text-gray-500 text-sm mb-6">
                All hiring managers you've found, saved, or contacted.
              </p>
              
              {/* Recruiter Spreadsheet Component */}
              <RecruiterSpreadsheet />
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
