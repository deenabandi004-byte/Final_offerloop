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
          
          <main style={{ background: '#F8FAFF', flex: 1, overflowY: 'auto' }} className="hiring-manager-tracker-page">
            {/* Page Header Container */}
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }} className="hiring-manager-tracker-container">
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
                className="hiring-manager-tracker-title"
              >
                Hiring Manager Tracker
              </h1>
              
              {/* Helper text */}
              <p
                style={{
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: '16px',
                  color: '#64748B',
                  textAlign: 'center',
                  marginBottom: '28px',
                  lineHeight: 1.5,
                }}
                className="hiring-manager-tracker-subtitle"
              >
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
