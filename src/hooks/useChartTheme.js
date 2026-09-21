import { useMemo } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { readCssVar, withAlpha } from '@/lib/color';

// Resolved colors for canvas/JS chart libs that can't use CSS variables.
// Theme tokens must stay hex: withAlpha() only derives translucent fills from hex.
// Recomputed when the theme flips; ThemeProvider applies the .dark class in a layout effect first.
export function useChartTheme() {
  const { isDark } = useTheme();
  return useMemo(() => {
    const gain = readCssVar('--gain', isDark ? '#22c55e' : '#15803d');
    const loss = readCssVar('--loss', isDark ? '#ef4444' : '#dc2626');
    return {
      isDark,
      background: readCssVar('--card', isDark ? '#141416' : '#ffffff'),
      text: readCssVar('--muted-foreground', isDark ? '#9a9aa3' : '#6b6b73'),
      grid: readCssVar('--border', isDark ? '#26262b' : '#e4e4e7'),
      foreground: readCssVar('--foreground', isDark ? '#ededee' : '#0b0b0c'),
      primary: readCssVar('--primary', isDark ? '#fdd458' : '#eab308'),
      warning: readCssVar('--warning', isDark ? '#facc15' : '#a16207'),
      gain,
      loss,
      gainArea: withAlpha(gain, 0.3),
      lossArea: withAlpha(loss, 0.3),
      series: [1, 2, 3, 4, 5].map(i => readCssVar(`--chart-${i}`, '#888888')),
      // Categorical palette: the 5 theme chart tokens plus fixed hues that read on both themes.
      palette: [
        ...[1, 2, 3, 4, 5].map(i => readCssVar(`--chart-${i}`, '#888888')),
        '#ec4899', '#06b6d4', '#f97316', '#94a3b8',
      ],
    };
  }, [isDark]);
}
