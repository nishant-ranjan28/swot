// Safety net for the restyle: the displayed calculator numbers must not change.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import api from '../api';
import { ThemeProvider } from '../context/ThemeContext';
import CalculatorPage from './CalculatorPage';

vi.mock('../api', () => ({ default: { get: vi.fn() }, API_BASE_URL: '' }));

const SIP_RESPONSE = {
  total_invested: 300000,
  current_value: 412345.67,
  total_return: 112345.67,
  total_return_pct: 37.45,
  cagr: 12.34,
  investments: [
    { date: '2021-01-01', invested: 5000, current_value: 5000 },
    { date: '2023-06-01', invested: 150000, current_value: 180000 },
    { date: '2026-01-01', invested: 300000, current_value: 412345.67 },
  ],
};

// 504 trading days (2 years) rising linearly from 100 to 200.
const HISTORY = Array.from({ length: 504 }, (_, i) => ({
  date: `2024-${String((i % 12) + 1).padStart(2, '0')}-01`,
  close: 100 + (100 * i) / 503,
}));

beforeAll(() => {
  // jsdom has no canvas: a no-op 2D context keeps the chart effects from throwing.
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx);
});

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/stocks/sip/')) return Promise.resolve({ data: SIP_RESPONSE });
    if (url.includes('/history')) return Promise.resolve({ data: { data: HISTORY } });
    return Promise.resolve({ data: { results: [] } });
  });
});

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <CalculatorPage />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

// A stat reads as "<label><value>[<sub>]" in document text, whatever the markup.
const text = () => document.body.textContent.replace(/\s+/g, ' ');
const expectStat = (...parts) => expect(text()).toContain(parts.join(''));

test('SIP with default inputs shows the same invested/value/returns', async () => {
  renderAt('/calculators?tool=sip');
  fireEvent.click(screen.getByRole('button', { name: 'RELIANCE' }));
  await waitFor(() => expect(text()).toContain('Total Invested'));
  expect(api.get).toHaveBeenCalledWith('/api/stocks/sip/RELIANCE.NS?amount=5000&years=5');
  expectStat('Total Invested', '₹3.00 L');
  expectStat('Current Value', '₹4.12 L');
  expectStat('Total Returns', '+37.45%', '₹1.12 L');
  expectStat('CAGR', '12.34%');
});

test('Lumpsum with default inputs computes the same returns', async () => {
  renderAt('/calculators?tool=lumpsum');
  fireEvent.click(screen.getByRole('button', { name: 'RELIANCE' }));
  await waitFor(() => expect(text()).toContain('Current Value'));
  expect(api.get).toHaveBeenCalledWith('/api/stocks/RELIANCE.NS/history?range=5y');
  expectStat('Invested', '₹1.00 L');
  expectStat('Current Value', '₹2.00 L');
  expectStat('Returns', '+100.00%', '₹1.00 L');
  expectStat('CAGR', '41.42%');
  expect(text()).toContain('Buy: ₹100.00 | Now: ₹200.00 | Units: 1000.00');
});

test('EMI with default inputs (after switching tabs) shows the same EMI', () => {
  renderAt('/calculators?tool=sip');
  fireEvent.click(screen.getByRole('button', { name: 'EMI Calculator' }));
  expectStat('Monthly EMI', '₹17,357');
  expectStat('Total Interest', '₹21.66 L');
  expectStat('Total Payment', '₹41.66 L');
  expectStat('Principal', '₹20.00 L');
  expect(text()).toContain('Principal: 48%');
  expect(text()).toContain('Interest: 52%');
});

test('CAGR, Goal and Compound Interest defaults are unchanged', () => {
  renderAt('/calculators?tool=cagr');
  expectStat('CAGR', '14.87%');
  expectStat('Total Return', '100.00%');
  expectStat('Multiplier', '2.00x');

  fireEvent.click(screen.getByRole('button', { name: 'Goal Planner' }));
  expectStat('Monthly SIP Needed', '₹4,348');
  expectStat('Total Investment', '₹5.22 L');
  expectStat('Wealth Gain', '₹4.78 L');
  expectStat('Target', '₹10.00 L');
  expect(text()).toContain('Investment: 52%');
  expect(text()).toContain('Growth: 48%');

  fireEvent.click(screen.getByRole('button', { name: 'Compound Interest' }));
  expectStat('Maturity Amount', '₹7.07 L');
  expectStat('Interest Earned', '₹2.07 L');
  expectStat('Effective Return', '41.48%');
});

test('Compare calls both APIs and shows the same SIP vs lumpsum numbers', async () => {
  renderAt('/calculators?tool=compare');
  fireEvent.click(screen.getByRole('button', { name: 'RELIANCE' }));
  await waitFor(() => expect(text()).toContain('wins by'));
  expect(api.get).toHaveBeenCalledWith('/api/stocks/sip/RELIANCE.NS?amount=5000&years=5');
  expect(api.get).toHaveBeenCalledWith('/api/stocks/RELIANCE.NS/history?range=5y');
  // Lumpsum invests the SIP total (₹3,00,000) at 100 → 3000 units, worth 3000 × 200 = ₹6,00,000.
  // Return 100%; CAGR over 504/252 = 2 years is √2 − 1 = 41.42%.
  expectStat('Invested', '₹3.00 L', 'Value', '₹6.00 L', 'Returns', '100.00%', 'CAGR', '41.42%');
  // SIP side straight from the mocked API.
  expectStat('Invested', '₹3.00 L', 'Value', '₹4.12 L', 'Returns', '37.45%', 'CAGR', '12.34%');
  // 6,00,000 − 4,12,345.67 = 1,87,654.33 → ₹1.88 L.
  expect(text()).toContain('Lumpsum wins by ₹1.88 L');
});

test('SIP uses the period chosen in the select', async () => {
  renderAt('/calculators?tool=sip');
  fireEvent.change(screen.getByRole('combobox', { name: /period/i }), { target: { value: '10' } });
  expect(screen.getByDisplayValue('10 Years')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'RELIANCE' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/stocks/sip/RELIANCE.NS?amount=5000&years=10'));
});

test('EMI recalculates when the rate changes', () => {
  renderAt('/calculators?tool=emi');
  const rate = screen.getByDisplayValue('8.5');
  fireEvent.change(rate, { target: { value: '10' } });
  expect(screen.getByDisplayValue('10')).toBe(rate);
  // P = 20,00,000, r = 10%/12, n = 240: EMI = 19,300.43 → ceil ₹19,301;
  // total payment 46,32,103.90 → ₹46.32 L; interest 26,32,103.90 → ₹26.32 L.
  expectStat('Monthly EMI', '₹19,301');
  expectStat('Total Interest', '₹26.32 L');
  expectStat('Total Payment', '₹46.32 L');
  expect(text()).toContain('Principal: 43%');
  expect(text()).toContain('Interest: 57%');
});
