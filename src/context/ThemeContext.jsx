import { createContext, useContext, useLayoutEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const ThemeContext = createContext(null);

function applyThemeClass(isDark) {
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('stockpulse_theme', 'dark');
  const isDark = theme === 'dark';

  // Flip <html> before the re-render so children that read CSS variables
  // during render (useChartTheme) see the new theme's values.
  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    applyThemeClass(next === 'dark');
    setTheme(next);
  };

  useLayoutEffect(() => applyThemeClass(isDark), [isDark]);

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
