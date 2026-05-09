// src/pages/ContactDirectory.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { AppHeader } from '@/components/AppHeader';
import ContactDirectoryComponent from '@/components/ContactDirectory';

const ContactDirectory: React.FC = () => {
  const navigate = useNavigate();
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          
          <main style={{ background: '#FAFBFF', flex: 1, overflowY: 'auto' }} className="networking-tracker-page">
            {/* Page Header Container */}
            <div className="w-full px-3 py-6 sm:px-6 sm:py-12 networking-tracker-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
              <button
                onClick={() => navigate('/find')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#6B7280',
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  padding: '0 0 16px 0',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#3B82F6'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#6B7280'; }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Find People
              </button>
              <h1
                className="text-[28px] sm:text-[42px] networking-tracker-title"
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
                Contact Spreadsheet
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
                All contacts you've found, saved, or contacted.
              </p>
              
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
