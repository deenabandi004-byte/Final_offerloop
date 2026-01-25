// src/pages/ContactDirectory.tsx
import React from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { AppHeader } from '@/components/AppHeader';
import ContactDirectoryComponent from '@/components/ContactDirectory';

const ContactDirectory: React.FC = () => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          
          <main className="bg-white min-h-screen networking-tracker-page">
            {/* Page Header Container - Matching Find People exactly */}
            <div className="max-w-5xl mx-auto px-8 pt-10 pb-8 networking-tracker-container">
              <h1 className="text-[28px] font-semibold text-gray-900 mb-4 networking-tracker-title">
                Networking Tracker
              </h1>
              
              {/* Contact Directory Component */}
              <ContactDirectoryComponent />
            </div>
          </main>
        </MainContentWrapper>
      </div>

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* 1. MAIN PAGE CONTAINER / WRAPPER */
          .networking-tracker-page {
            overflow-x: hidden;
            width: 100%;
            max-width: 100vw;
            padding: 0;
          }

          .networking-tracker-container {
            width: 100%;
            max-width: 100vw;
            padding: 0 !important;
            margin: 0;
            box-sizing: border-box;
          }

          /* 2. HEADER CONTENT WRAPPER - Only target title, let component handle its own padding */
          .networking-tracker-container {
            padding-left: 16px !important;
            padding-right: 16px !important;
            padding-top: 16px !important;
            padding-bottom: 16px !important;
          }

          /* 3. PAGE TITLE */
          .networking-tracker-title {
            width: 100%;
            max-width: 100%;
            font-size: 1.5rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            margin: 0 0 16px 0 !important;
            padding: 0 !important;
            box-sizing: border-box;
          }

          /* Ensure no negative margins or transforms */
          .networking-tracker-title * {
            margin: 0;
            transform: none;
          }
        }
      `}</style>
    </SidebarProvider>
  );
};

export default ContactDirectory;
