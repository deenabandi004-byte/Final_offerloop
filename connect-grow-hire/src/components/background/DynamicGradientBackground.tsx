import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';

export const DynamicGradientBackground: React.FC = () => {
  const { theme } = useTheme();

  return (
    <div
      className={theme === 'light' ? 'light-gradient-bg' : 'dark-gradient-bg'}
      aria-hidden="true"
    />
  );
};
