import { type MouseEventHandler, type ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  variant?: 'default' | 'light';
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export const GlassCard = ({
  children,
  className = '',
  glow = false,
  variant = 'default',
  onClick,
}: GlassCardProps) => {
  const baseClass = variant === 'light' ? 'glass-card-light' : 'glass-card';
  const glowClass = glow ? 'glow-teal' : '';

  return (
    <div className={`${baseClass} ${glowClass} ${className}`} onClick={onClick}>
      {children}
    </div>
  );
};
