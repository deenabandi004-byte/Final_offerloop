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
          
          <main className="bg-white min-h-screen hiring-manager-tracker-page">
            {/* Page Header Container - Matching Find People exactly */}
            <div className="max-w-5xl mx-auto px-8 pt-10 pb-8 hiring-manager-tracker-container">
              <h1 className="text-[28px] font-semibold text-gray-900 mb-2 hiring-manager-tracker-title">
                Hiring Manager Tracker
              </h1>
              
              {/* Helper text */}
              <p className="text-gray-500 text-sm mb-6 hiring-manager-tracker-subtitle">
                All hiring managers you've found, saved, or contacted.
              </p>
              
              {/* Recruiter Spreadsheet Component */}
              <RecruiterSpreadsheet />
            </div>
          </main>
        </MainContentWrapper>
      </div>

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* 1. MAIN PAGE CONTAINER */
          .hiring-manager-tracker-page {
            overflow-x: hidden;
            width: 100%;
            max-width: 100vw;
          }

          .hiring-manager-tracker-container {
            width: 100%;
            max-width: 100vw;
            padding: 16px !important;
            margin: 0;
            box-sizing: border-box;
          }

          /* 2. HEADER SECTION */
          .hiring-manager-tracker-title {
            width: 100%;
            max-width: 100%;
            font-size: 1.5rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            margin: 0 0 8px 0 !important;
            padding: 0;
            box-sizing: border-box;
          }

          .hiring-manager-tracker-subtitle {
            width: 100%;
            max-width: 100%;
            font-size: 0.875rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            margin: 0 0 16px 0 !important;
            padding: 0;
            box-sizing: border-box;
          }
        }
      `}</style>
    </SidebarProvider>
  );
}
