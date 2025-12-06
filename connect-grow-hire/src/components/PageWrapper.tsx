import { ReactNode } from 'react';
import { DynamicGradientBackground } from './background/DynamicGradientBackground';

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
}

export const PageWrapper = ({ children, className = '' }: PageWrapperProps) => (
  <div className={`min-h-screen text-foreground bg-background transition-colors duration-300 ${className}`}>
    <DynamicGradientBackground />
    <div className="relative z-10">
      {children}
    </div>
  </div>
);
