// src/context/ThemeContext.test.jsx
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext';

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

test('defaults to dark and puts class on <html>', () => {
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(screen.getByRole('button')).toHaveTextContent('dark');
  expect(document.documentElement).toHaveClass('dark');
});

test('respects stored light preference and toggles', () => {
  localStorage.setItem('stockpulse_theme', JSON.stringify('light'));
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(document.documentElement).not.toHaveClass('dark');
  act(() => screen.getByRole('button').click());
  expect(document.documentElement).toHaveClass('dark');
  expect(JSON.parse(localStorage.getItem('stockpulse_theme'))).toBe('dark');
});
