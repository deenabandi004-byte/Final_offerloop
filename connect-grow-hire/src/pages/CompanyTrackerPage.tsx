import React, { Suspense } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { AppHeader } from '@/components/AppHeader';

const FirmSearchPage = React.lazy(() => import('./FirmSearchPage'));

export default function CompanyTrackerPage() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />

          <main style={{ background: '#FAFBFF', flex: 1, overflowY: 'auto' }}>
            <div className="w-full px-3 py-6 sm:px-6 sm:py-12" style={{ maxWidth: '900px', margin: '0 auto' }}>
              <h1
                className="text-[28px] sm:text-[42px]"
                style={{
                  fontFamily: "'Lora', Georgia, serif",
                  fontWeight: 400,
                  letterSpacing: '-0.025em',
                  color: '#0F172A',
                  textAlign: 'center',
                  marginBottom: '10px',
                  lineHeight: 1.1,
                }}
              >
                Company Tracker
              </h1>

              <p
                style={{
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: '16px',
                  color: '#6B7280',
                  textAlign: 'center',
                  marginBottom: '28px',
                  lineHeight: 1.5,
                }}
              >
                All companies you've researched and saved from your searches.
              </p>

              <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>}>
                <FirmSearchPage embedded initialTab="firm-library" />
              </Suspense>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
