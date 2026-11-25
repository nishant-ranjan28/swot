import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import api from '../api';
import MutualFundPage from './MutualFundPage';
import { ThemeProvider } from '../context/ThemeContext';

vi.mock('../api', () => ({ default: { get: vi.fn() } }));

beforeEach(() => api.get.mockReset());

test.each(['../stocks/AAPL?range=max#', '123,456', 'https://evil.example'])('rejects an invalid scheme identifier from upstream data: %s', async (code) => {
  api.get.mockResolvedValue({ data: { funds: [{ scheme_code: code, scheme_name: 'Test Fund' }] } });
  render(<ThemeProvider><MutualFundPage /></ThemeProvider>);
  fireEvent.click(await screen.findByText('Test Fund'));
  expect(await screen.findByText('Invalid fund code')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith('/api/mf/top', { params: { category: 'all' } });
});

test('a numeric scheme identifier still loads NAV, holdings and chart history', async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/api/mf/top'
    ? { funds: [{ scheme_code: 119551, scheme_name: 'Test Fund' }] }
    : {} }));
  render(<ThemeProvider><MutualFundPage /></ThemeProvider>);
  fireEvent.click(await screen.findByText('Test Fund'));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/mf/119551/history', { params: { period: '1y' } }));
  expect(api.get).toHaveBeenCalledWith('/api/mf/119551/nav');
  expect(api.get).toHaveBeenCalledWith('/api/mf/119551/holdings');
});
