import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { useChartTheme } from './useChartTheme';

function Probe() {
  const t = useChartTheme();
  const { toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{`${t.isDark}|${t.gain}|${t.gainArea}`}</button>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.setProperty('--gain', '#22c55e');
});

test('returns resolved colors and recomputes on theme toggle', () => {
  render(<ThemeProvider><Probe /></ThemeProvider>);
  const btn = screen.getByRole('button');
  expect(btn).toHaveTextContent('true|#22c55e|rgba(34, 197, 94, 0.3)');
  document.documentElement.style.setProperty('--gain', '#16a34a');
  act(() => btn.click());
  expect(btn).toHaveTextContent('false|#16a34a|rgba(22, 163, 74, 0.3)');
});

test('exposes a 9-color categorical palette', () => {
  function P() { return <span>{useChartTheme().palette.length}</span>; }
  render(<ThemeProvider><P /></ThemeProvider>);
  expect(screen.getByText('9')).toBeInTheDocument();
});
