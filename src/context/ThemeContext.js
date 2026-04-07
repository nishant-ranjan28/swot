import React, { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('stockpulse_theme', 'light');
  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const isDark = theme === 'dark';
  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      <div className={isDark ? 'dark' : ''}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
