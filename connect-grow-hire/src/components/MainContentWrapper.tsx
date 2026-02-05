import React from 'react';
import { cn } from '@/lib/utils';

interface MainContentWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * MainContentWrapper - White elevated container that sits on the blue app background
 * 
 * This component provides:
 * - White background
 * - Large rounded corners
 * - Subtle shadow for elevation
 * - Proper spacing from viewport edges
 */
export function MainContentWrapper({ children, className }: MainContentWrapperProps) {
  return (
    <div className="flex-1 flex flex-col p-3 min-h-0">
      <div 
        className={cn(
          "flex-1 flex flex-col rounded-2xl shadow-sm overflow-hidden min-h-0",
          className
        )}
        style={{ background: '#F8FAFF' }}
      >
        {children}
      </div>
    </div>
  );
}
