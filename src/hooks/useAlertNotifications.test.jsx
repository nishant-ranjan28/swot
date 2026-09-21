import { renderHook, act, waitFor } from '@testing-library/react';
import api from '../api';
import { AuthProvider } from '../context/AuthContext';
import { UserDataProvider, useWatchlist } from '../context/UserDataContext';
import { useAlertNotifications } from './useAlertNotifications';
import { createFakeSupabase } from '@/test/fakeSupabase';

vi.mock('../api', () => ({ default: { get: vi.fn() }, API_BASE_URL: '' }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const PRICES = { 'TCS.NS': 5000, AAPL: 100, 'OLD.NS': 50, 'GUEST.NS': 10 };
const sent = [];

class FakeNotification {
  static permission = 'granted';
  constructor(title, options) {
    sent.push({ title, tag: options.tag });
  }
}

const quotedSymbols = () => api.get.mock.calls.map(([url]) => url.split('/')[3]);

beforeEach(() => {
  localStorage.clear();
  sent.length = 0;
  vi.stubGlobal('Notification', FakeNotification);
  api.get.mockReset();
  api.get.mockImplementation(async (url) => ({ data: { price: PRICES[url.split('/')[3]] } }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('guest: checks both market watchlists plus the legacy key', async () => {
  localStorage.setItem('stockpulse_watchlist_in', JSON.stringify([{ symbol: 'TCS.NS', alertHigh: 4000 }]));
  localStorage.setItem('stockpulse_watchlist_us', JSON.stringify([{ symbol: 'AAPL', alertLow: 150 }]));
  localStorage.setItem('stockpulse_watchlist', JSON.stringify([{ symbol: 'OLD.NS', alertHigh: 40 }]));
  renderHook(() => useAlertNotifications());
  await waitFor(() => expect(sent).toHaveLength(3));
  expect(quotedSymbols()).toEqual(['TCS.NS', 'AAPL', 'OLD.NS']);
});

test('signed in: sees account alerts from both markets and ignores guest + legacy storage', async () => {
  localStorage.setItem('stockpulse_watchlist_in', JSON.stringify([{ symbol: 'GUEST.NS', alertHigh: 1 }]));
  localStorage.setItem('stockpulse_watchlist', JSON.stringify([{ symbol: 'OLD.NS', alertHigh: 40 }]));
  const client = createFakeSupabase({
    session: { user: { id: 'u1' } },
    tables: {
      watchlist_items: [
        { id: 'w1', user_id: 'u1', market: 'in', symbol: 'TCS.NS', name: 'TCS', added_at: '2026-01-01T00:00:00Z' },
        { id: 'w2', user_id: 'u1', market: 'us', symbol: 'AAPL', name: 'Apple', added_at: '2026-01-02T00:00:00Z' },
      ],
      price_alerts: [
        { id: 'a1', user_id: 'u1', market: 'in', symbol: 'TCS.NS', condition: 'above', target: 4000, active: true },
        { id: 'a2', user_id: 'u1', market: 'us', symbol: 'AAPL', condition: 'below', target: 150, active: true },
      ],
      holdings: [],
    },
  });
  const wrapper = ({ children }) => (
    <AuthProvider client={client}>
      <UserDataProvider>{children}</UserDataProvider>
    </AuthProvider>
  );
  renderHook(() => useAlertNotifications(), { wrapper });
  await waitFor(() => expect(sent).toHaveLength(2));
  expect(new Set(quotedSymbols())).toEqual(new Set(['TCS.NS', 'AAPL']));
});

test('watchlist changes do not restart the 5-minute interval', async () => {
  const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
  const { result } = renderHook(() => ({ alerts: useAlertNotifications(), watch: useWatchlist('in') }));
  const fiveMin = () => setIntervalSpy.mock.calls.filter(([, ms]) => ms === 5 * 60 * 1000).length;
  expect(fiveMin()).toBe(1);
  const checkAlerts = result.current.alerts.checkAlerts;

  act(() => result.current.watch[1]([{ symbol: 'TCS.NS', alertHigh: 4000 }]));
  await waitFor(() => expect(result.current.watch[0]).toHaveLength(1));
  expect(fiveMin()).toBe(1);
  expect(result.current.alerts.checkAlerts).toBe(checkAlerts);

  // ...yet the next check sees the new item.
  await act(async () => {});
  await act(() => result.current.alerts.checkAlerts());
  expect(quotedSymbols()).toEqual(['TCS.NS']);
});
