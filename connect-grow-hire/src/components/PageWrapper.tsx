import { ReactNode } from 'react';

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
}

export const PageWrapper = ({ children, className = '' }: PageWrapperProps) => (
  <div className={`min-h-screen text-foreground bg-transparent transition-colors duration-300 ${className}`}>
    <div className="relative z-10">
      {children}
    </div>
  </div>
);
