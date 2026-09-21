import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import AppShell from './AppShell';
import api from '../../api';
import { MarketProvider } from '../../context/MarketContext';
import { ThemeProvider } from '../../context/ThemeContext';

vi.mock('../../api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { results: [{ name: 'Apple Inc.', symbol: 'AAPL' }] } })) },
  API_BASE_URL: '',
}));

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderShell(path = '/', element = <Where />) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MarketProvider>
        <ThemeProvider>
          <AppShell>
            <Routes><Route path="*" element={element} /></Routes>
          </AppShell>
        </ThemeProvider>
      </MarketProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => localStorage.clear());

test('sidebar shows groups and marks active link', () => {
  renderShell('/screener');
  const nav = screen.getByRole('navigation', { name: /main/i });
  expect(within(nav).getByText('Research')).toBeInTheDocument();
  expect(within(nav).getByRole('link', { name: /screener/i })).toHaveAttribute('aria-current', 'page');
});

test('sidebar collapse persists', () => {
  renderShell();
  fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
  expect(JSON.parse(localStorage.getItem('stockpulse_sidebar_collapsed'))).toBe(true);
});

test('cmd+k opens palette, selecting a page navigates', async () => {
  renderShell('/');
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
  const input = await screen.findByPlaceholderText(/search stocks or pages/i);
  fireEvent.change(input, { target: { value: 'glossary' } });
  fireEvent.click(await screen.findByRole('option', { name: /glossary/i }));
  expect(screen.getByTestId('where')).toHaveTextContent('/glossary');
});

test('palette stock search navigates to stock page', async () => {
  renderShell('/');
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  fireEvent.change(await screen.findByPlaceholderText(/search stocks or pages/i), { target: { value: 'apple' } });
  fireEvent.click(await screen.findByRole('option', { name: /AAPL/ }, { timeout: 2000 }));
  expect(screen.getByTestId('where')).toHaveTextContent('/stock/AAPL');
});

test('market toggle switches market', () => {
  renderShell('/');
  fireEvent.click(screen.getByRole('button', { name: 'US' }));
  expect(screen.getByTestId('where')).toHaveTextContent('/us');
});

test('brand link has an accessible name', () => {
  renderShell('/screener');
  expect(screen.getByRole('link', { name: 'StockPulse home' })).toHaveAttribute('href', '/');
});

test('server stock results are not hidden by fuzzy filtering', async () => {
  api.get.mockImplementationOnce(() => Promise.resolve({ data: { results: [{ symbol: 'INFY.NS', name: 'Infosys Limited' }] } }));
  renderShell('/');
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
  fireEvent.change(await screen.findByPlaceholderText(/search stocks or pages/i), { target: { value: 'infosis' } });
  expect(await screen.findByRole('option', { name: /INFY\.NS/ }, { timeout: 2000 })).toBeInTheDocument();
});

test('does not flash "No results." while stock search is pending', async () => {
  renderShell('/');
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
  fireEvent.change(await screen.findByPlaceholderText(/search stocks or pages/i), { target: { value: 'zzqq' } });
  expect(screen.queryByText('No results.')).not.toBeInTheDocument();
});

test('closing the palette with Escape resets the query', async () => {
  renderShell('/');
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
  const input = await screen.findByPlaceholderText(/search stocks or pages/i);
  fireEvent.change(input, { target: { value: 'glossary' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByPlaceholderText(/search stocks or pages/i)).not.toBeInTheDocument());
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
  expect(await screen.findByPlaceholderText(/search stocks or pages/i)).toHaveValue('');
});

test("pressing '/' while typing in an input does not open the palette", () => {
  renderShell('/', <input aria-label="page input" />);
  const input = screen.getByLabelText('page input');
  input.focus();
  fireEvent.keyDown(input, { key: '/' });
  expect(screen.queryByPlaceholderText(/search stocks or pages/i)).not.toBeInTheDocument();
});
