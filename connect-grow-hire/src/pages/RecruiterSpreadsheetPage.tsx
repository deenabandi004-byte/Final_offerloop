// src/pages/RecruiterSpreadsheetPage.tsx
import React from 'react';
import RecruiterSpreadsheet from '@/components/RecruiterSpreadsheet';
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PageHeaderActions } from "@/components/PageHeaderActions";
import { Users } from "lucide-react";

const RecruiterSpreadsheetPage: React.FC = () => {
  return (
    <SidebarProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Header */}
          <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground">
                    Recruiter Spreadsheet
                  </h1>
                </div>
              </div>
              <PageHeaderActions />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
            <div className="w-full p-6 min-w-0">
              <RecruiterSpreadsheet />
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default RecruiterSpreadsheetPage;

