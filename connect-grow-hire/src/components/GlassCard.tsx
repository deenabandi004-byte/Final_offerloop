import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  variant?: 'default' | 'light';
}

export const GlassCard = ({ 
  children, 
  className = '', 
  glow = false,
  variant = 'default'
}: GlassCardProps) => {
  const baseClass = variant === 'light' ? 'glass-card-light' : 'glass-card';
  const glowClass = glow ? 'glow-teal' : '';
  
  return (
    <div className={`${baseClass} ${glowClass} ${className}`}>
      {children}
    </div>
  );
};
