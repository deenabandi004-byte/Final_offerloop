import React, { createContext, useContext, useEffect, useState } from 'react';
import { ThemeProvider as NextThemeProvider, useTheme as useNextTheme } from 'next-themes';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Internal hook that uses next-themes
const useThemeInternal = (): ThemeContextType => {
  const { theme: nextTheme, setTheme: setNextTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Default to dark if theme is undefined or system
  const theme = (nextTheme === 'dark' || nextTheme === 'light' ? nextTheme : 'dark') as Theme;

  const toggleTheme = () => {
    setNextTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const setThemeValue = (newTheme: Theme) => {
    setNextTheme(newTheme);
  };

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return;
    
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
  }, [theme, mounted]);

  return {
    theme,
    toggleTheme,
    setTheme: setThemeValue,
  };
};

// Wrapper component that provides next-themes context
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <NextThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <ThemeProviderInner>{children}</ThemeProviderInner>
    </NextThemeProvider>
  );
};

// Inner provider that uses our custom hook
const ThemeProviderInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useThemeInternal();

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
