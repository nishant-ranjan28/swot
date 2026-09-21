import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import App from './App';
import { MarketProvider } from './context/MarketContext';
import { ThemeProvider } from './context/ThemeContext';
import { StockProvider } from './context/StockContext';

vi.mock('./api', () => {
  const get = vi.fn(() => new Promise(() => {})); // never resolves: no network in tests
  return { default: { get }, API_BASE_URL: '' };
});
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MarketProvider>
        <ThemeProvider>
          <StockProvider>
            <App />
          </StockProvider>
        </ThemeProvider>
      </MarketProvider>
    </MemoryRouter>,
  );
}

test('renders app shell with brand name', () => {
  renderAt('/');
  expect(screen.getAllByText(/StockPulse/i).length).toBeGreaterThan(0);
  expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument();
});

test('renders glossary route', async () => {
  renderAt('/glossary');
  expect(await screen.findByRole('heading', { name: /stock glossary/i })).toBeInTheDocument();
});

test('without Supabase there is no auth UI, and /login explains accounts are off', async () => {
  renderAt('/login');
  expect(await screen.findByText("Accounts aren't configured on this deployment.")).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
