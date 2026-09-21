import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import StockDetailPage from './StockDetailPage';
import { MarketProvider } from '../../context/MarketContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { StockProvider } from '../../context/StockContext';

// Tabs only render once the summary has loaded, so the summary resolves (with no quote);
// every other endpoint never resolves: no network in tests.
vi.mock('../../api', () => {
  const get = vi.fn((url) =>
    url.endsWith('/summary') ? Promise.resolve({ data: {} }) : new Promise(() => {}),
  );
  return { default: { get }, API_BASE_URL: '' };
});

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MarketProvider>
        <ThemeProvider>
          <StockProvider>
            <Routes>
              <Route path="/stock/:symbol" element={<StockDetailPage />} />
            </Routes>
          </StockProvider>
        </ThemeProvider>
      </MarketProvider>
    </MemoryRouter>,
  );
}

test('always renders an h1 with the symbol before the quote loads', () => {
  renderAt('/stock/AAPL');
  expect(screen.getByRole('heading', { level: 1, name: 'AAPL' })).toBeInTheDocument();
});

test('ArrowRight on the active tab selects and focuses the next tab', async () => {
  renderAt('/stock/AAPL?tab=dividends');
  const tablist = await screen.findByRole('tablist', { name: /stock sections/i });
  const active = screen.getByRole('tab', { name: 'Dividends' });
  expect(active).toHaveAttribute('aria-selected', 'true');
  expect(active).toHaveAttribute('tabindex', '0');
  expect(tablist).toBeInTheDocument();

  fireEvent.keyDown(active, { key: 'ArrowRight' });

  const next = screen.getByRole('tab', { name: 'Analysts' });
  expect(next).toHaveAttribute('aria-selected', 'true');
  expect(next).toHaveFocus();
  expect(active).toHaveAttribute('aria-selected', 'false');
  expect(active).toHaveAttribute('tabindex', '-1');
  expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-analysts');
});
