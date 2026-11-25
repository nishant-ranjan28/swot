import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import api from '../api';
import ScreenerPage from './ScreenerPage';

vi.mock('../api', () => ({ default: { get: vi.fn() } }));
vi.mock('../context/MarketContext', () => ({
  useMarket: () => ({ market: 'in', marketLabel: 'India' }),
}));

test('shows fallback prices with a notice, then clears the notice on recovery', async () => {
  const warning = 'Full-market screening is temporarily unavailable. Showing available prices for popular stocks; fundamental fields may be missing.';
  api.get.mockResolvedValueOnce({ data: {
    stocks: [{ symbol: 'RELIANCE.NS', name: 'Reliance Industries', price: 150 }],
    total: 1, warning,
  } });
  render(<MemoryRouter><ScreenerPage /></MemoryRouter>);
  expect(await screen.findByRole('status')).toHaveTextContent(warning);
  expect(screen.getByText('Reliance Industries')).toBeInTheDocument();
  expect(screen.getByText('₹150.00')).toBeInTheDocument();

  api.get.mockResolvedValue({ data: { stocks: [], total: 0 } });
  fireEvent.change(document.getElementById('screener-pe_range'), { target: { value: '<10' } });
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(await screen.findByText('No stocks match your filters.')).toBeInTheDocument();
});
