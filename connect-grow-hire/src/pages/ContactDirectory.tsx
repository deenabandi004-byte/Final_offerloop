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
          
          <main className="bg-white min-h-screen">
            {/* Page Header Container - Matching Find People exactly */}
            <div className="max-w-5xl mx-auto px-8 pt-10 pb-8">
              <h1 className="text-[28px] font-semibold text-gray-900 mb-4">
                Networking Tracker
              </h1>
              
              {/* Contact Directory Component */}
              <ContactDirectoryComponent />
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default ContactDirectory;
