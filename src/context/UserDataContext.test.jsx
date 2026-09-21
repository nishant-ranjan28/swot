import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';
import * as repo from '@/lib/userDataRepo';
import { AuthProvider } from './AuthContext';
import {
  UserDataProvider,
  useWatchlist,
  useHoldings,
  useUserDataStatus,
  useUserDataActions,
  FLUSH_DELAY,
} from './UserDataContext';
import { createFakeSupabase } from '@/test/fakeSupabase';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/lib/userDataRepo', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadAll: vi.fn(actual.loadAll),
    loadCollection: vi.fn(actual.loadCollection),
    applyWatchlistDiff: vi.fn(actual.applyWatchlistDiff),
    applyHoldingsDiff: vi.fn(actual.applyHoldingsDiff),
  };
});

const USER = { id: 'u1', email: 'a@b.c' };
const SESSION = { user: USER, access_token: 't1' };

function seedTables() {
  return {
    watchlist_items: [
      { id: 'w1', user_id: 'u1', market: 'in', symbol: 'TCS.NS', name: 'TCS', added_at: '2026-01-01T00:00:00.000Z' },
      { id: 'w2', user_id: 'u1', market: 'us', symbol: 'AAPL', name: 'Apple', added_at: '2026-01-02T00:00:00.000Z' },
    ],
    price_alerts: [
      { id: 'a1', user_id: 'u1', market: 'in', symbol: 'TCS.NS', condition: 'above', target: 4000, active: true },
    ],
    holdings: [
      { id: 'h1', user_id: 'u1', market: 'in', symbol: 'INFY.NS', name: 'Infosys', buy_price: 1500, quantity: 10, buy_date: '2026-01-05' },
    ],
    profiles: [],
  };
}

const signedInClient = () => createFakeSupabase({ session: SESSION, tables: seedTables() });

function useAll(market) {
  const [watchlist, setWatchlist] = useWatchlist(market);
  const [holdings, setHoldings] = useHoldings(market);
  return { watchlist, setWatchlist, holdings, setHoldings, ...useUserDataStatus(), ...useUserDataActions() };
}

function renderData(client, market = 'in') {
  const wrapper = ({ children }) => (
    <AuthProvider client={client}>
      <UserDataProvider>{children}</UserDataProvider>
    </AuthProvider>
  );
  return renderHook(() => useAll(market), { wrapper });
}

/** Let pending promises (fake client, repo) resolve without firing the debounce. */
async function settle() {
  for (let i = 0; i < 5; i++) await act(() => vi.advanceTimersByTimeAsync(0));
}
const advance = (ms) => act(() => vi.advanceTimersByTimeAsync(ms));

const symbols = (list) => list.map((i) => i.symbol);
const writes = (client, table) => client.calls.filter((c) => c.table === table && c.op !== 'select');

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Guest

test('guest without any provider: the setter writes localStorage under the existing key', () => {
  const { result } = renderHook(() => useWatchlist('in'));
  expect(result.current[0]).toEqual([]);
  act(() => result.current[1]([{ symbol: 'TCS.NS', name: 'TCS' }]));
  expect(result.current[0]).toEqual([{ symbol: 'TCS.NS', name: 'TCS' }]);
  expect(JSON.parse(localStorage.getItem('stockpulse_watchlist_in'))).toEqual([{ symbol: 'TCS.NS', name: 'TCS' }]);
});

test('guest with a null client: hooks read and write localStorage (updater form too)', async () => {
  localStorage.setItem('stockpulse_portfolio_us', JSON.stringify([{ id: 'x', symbol: 'AAPL' }]));
  const { result } = renderData(null, 'us');
  expect(result.current.mode).toBe('guest');
  expect(result.current.status).toBe('ready');
  expect(result.current.holdings).toEqual([{ id: 'x', symbol: 'AAPL' }]);
  act(() => result.current.setHoldings((prev) => [...prev, { id: 'y', symbol: 'MSFT' }]));
  expect(JSON.parse(localStorage.getItem('stockpulse_portfolio_us'))).toHaveLength(2);
  expect(repo.loadAll).not.toHaveBeenCalled();
});

test('guest with a configured client but no session: adding writes localStorage, never Supabase', async () => {
  const client = createFakeSupabase({ tables: seedTables() });
  const { result } = renderData(client);
  await settle();
  expect(result.current.mode).toBe('guest');
  act(() => result.current.setWatchlist([{ symbol: 'HDFC.NS' }]));
  await advance(FLUSH_DELAY * 2);
  expect(JSON.parse(localStorage.getItem('stockpulse_watchlist_in'))).toEqual([{ symbol: 'HDFC.NS' }]);
  expect(client.calls).toHaveLength(0);
});

test('guest hook instances for the same key stay in sync (alert checker sees page edits)', async () => {
  const a = renderHook(() => useWatchlist('in'));
  const b = renderHook(() => useWatchlist('in'));
  act(() => a.result.current[1]([{ symbol: 'TCS.NS', alertHigh: 10 }]));
  await settle();
  expect(b.result.current[0]).toEqual([{ symbol: 'TCS.NS', alertHigh: 10 }]);
});

// ---------------------------------------------------------------------------
// Signed in

test('signed in: initial data comes from the tables, never from guest localStorage', async () => {
  localStorage.setItem('stockpulse_watchlist_in', JSON.stringify([{ symbol: 'GUEST.NS' }]));
  localStorage.setItem('stockpulse_portfolio_in', JSON.stringify([{ id: 'g', symbol: 'GUEST.NS' }]));
  const client = signedInClient();
  const { result } = renderData(client);

  // While auth / account data is loading nothing (least of all guest data) is shown.
  expect(result.current.watchlist).toEqual([]);
  expect(result.current.holdings).toEqual([]);
  expect(result.current.status).toBe('loading');

  await settle();
  expect(result.current.mode).toBe('account');
  expect(result.current.status).toBe('ready');
  expect(result.current.watchlist).toEqual([
    { symbol: 'TCS.NS', name: 'TCS', alertHigh: 4000, alertLow: null, addedAt: '2026-01-01T00:00:00.000Z' },
  ]);
  expect(result.current.holdings).toEqual([
    { id: 'h1', symbol: 'INFY.NS', name: 'Infosys', buyPrice: 1500, quantity: 10, buyDate: '2026-01-05' },
  ]);
  expect(repo.loadAll).toHaveBeenCalledTimes(1);
});

test('signed in: adding an item updates state immediately and upserts watchlist_items after the debounce', async () => {
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'HDFC.NS', name: 'HDFC', alertHigh: null, alertLow: null, addedAt: '2026-02-01T00:00:00.000Z' }]));
  expect(symbols(result.current.watchlist)).toEqual(['TCS.NS', 'HDFC.NS']);
  expect(writes(client, 'watchlist_items')).toHaveLength(0);

  await advance(FLUSH_DELAY);
  const upserts = writes(client, 'watchlist_items');
  expect(upserts).toHaveLength(1);
  expect(upserts[0].op).toBe('upsert');
  expect(upserts[0].values).toEqual([
    { user_id: 'u1', market: 'in', symbol: 'HDFC.NS', name: 'HDFC', added_at: '2026-02-01T00:00:00.000Z' },
  ]);
  expect(client.tables.watchlist_items.map((r) => r.symbol)).toContain('HDFC.NS');
  // Guest storage untouched.
  expect(localStorage.getItem('stockpulse_watchlist_in')).toBeNull();
});

test('signed in: a failed write reloads that collection from the server and shows a toast', async () => {
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'HDFC.NS', name: 'HDFC' }]));
  expect(symbols(result.current.watchlist)).toEqual(['TCS.NS', 'HDFC.NS']);
  client.failNext = true;
  await advance(FLUSH_DELAY);
  await settle();

  expect(toast.error).toHaveBeenCalledWith("Couldn't save your changes — reloaded from your account");
  expect(repo.loadAll).toHaveBeenCalledTimes(1);
  expect(repo.loadCollection).toHaveBeenCalledTimes(1);
  expect(repo.loadCollection.mock.calls[0].slice(1)).toEqual(['u1', 'in', 'watchlist']);
  expect(symbols(result.current.watchlist)).toEqual(['TCS.NS']);
});

const X = { id: '44444444-4444-4444-8444-444444444444', symbol: 'WIPRO.NS', name: 'Wipro', buyPrice: 400, quantity: 3, buyDate: '2026-03-01' };
const SAVE_FAILED = "Couldn't save your changes — reloaded from your account";

test('a failed watchlist write keeps a pending holdings edit: it is still written and stays in state', async () => {
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'HDFC.NS', name: 'HDFC' }]));
  await advance(100);
  act(() => result.current.setHoldings((prev) => [...prev, X])); // its timer fires 100ms after the watchlist's
  client.failNext = true;
  await advance(FLUSH_DELAY - 100); // watchlist flush runs and fails
  await settle();

  expect(toast.error).toHaveBeenCalledWith(SAVE_FAILED);
  expect(symbols(result.current.watchlist)).toEqual(['TCS.NS']);
  expect(symbols(result.current.holdings)).toEqual(['INFY.NS', 'WIPRO.NS']);

  await advance(FLUSH_DELAY);
  await settle();
  expect(client.tables.holdings.map((r) => r.id)).toContain(X.id);
  expect(symbols(result.current.holdings)).toEqual(['INFY.NS', 'WIPRO.NS']);
  expect(toast.error).toHaveBeenCalledTimes(1);
});

test('a holdings write in flight while a watchlist write fails is not dropped, and the next edit is an update', async () => {
  const actual = await vi.importActual('@/lib/userDataRepo');
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  let release;
  repo.applyHoldingsDiff.mockImplementationOnce(
    (...args) => new Promise((resolve) => (release = () => resolve(actual.applyHoldingsDiff(...args)))),
  );
  act(() => result.current.setHoldings((prev) => [...prev, X]));
  await advance(FLUSH_DELAY); // holdings write now in flight
  expect(repo.applyHoldingsDiff).toHaveBeenCalledTimes(1);

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'HDFC.NS', name: 'HDFC' }]));
  client.failNext = true;
  await advance(FLUSH_DELAY);
  await settle();
  expect(toast.error).toHaveBeenCalledWith(SAVE_FAILED);

  await act(async () => release());
  await settle();
  expect(client.tables.holdings.map((r) => r.id)).toContain(X.id);
  expect(symbols(result.current.holdings)).toEqual(['INFY.NS', 'WIPRO.NS']);

  act(() => result.current.setHoldings((prev) => prev.map((h) => (h.id === X.id ? { ...h, quantity: 9 } : h))));
  await advance(FLUSH_DELAY);
  await settle();
  expect(repo.applyHoldingsDiff).toHaveBeenCalledTimes(2);
  const second = repo.applyHoldingsDiff.mock.calls[1][3];
  expect(second.insert).toEqual([]);
  expect(second.update.map((h) => h.id)).toEqual([X.id]);
  expect(client.tables.holdings.find((r) => r.id === X.id).quantity).toBe(9);
  expect(toast.error).toHaveBeenCalledTimes(1); // no PK conflict
});

test('reload() writes a pending edit before refetching', async () => {
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  act(() => result.current.setHoldings((prev) => [...prev, X]));
  await act(() => result.current.reload());

  expect(repo.applyHoldingsDiff).toHaveBeenCalledTimes(1);
  expect(repo.loadAll).toHaveBeenCalledTimes(2);
  expect(repo.applyHoldingsDiff.mock.invocationCallOrder[0]).toBeLessThan(repo.loadAll.mock.invocationCallOrder[1]);
  expect(client.tables.holdings.map((r) => r.id)).toContain(X.id);
  expect(symbols(result.current.holdings)).toEqual(['INFY.NS', 'WIPRO.NS']);
  await advance(FLUSH_DELAY); // the cancelled debounce doesn't write again
  expect(repo.applyHoldingsDiff).toHaveBeenCalledTimes(1);
});

test('reload() waits for an in-flight write before refetching', async () => {
  const actual = await vi.importActual('@/lib/userDataRepo');
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  let release;
  repo.applyHoldingsDiff.mockImplementationOnce(
    (...args) => new Promise((resolve) => (release = () => resolve(actual.applyHoldingsDiff(...args)))),
  );
  act(() => result.current.setHoldings((prev) => [...prev, X]));
  await advance(FLUSH_DELAY);

  let reloaded;
  act(() => {
    reloaded = result.current.reload();
  });
  await settle();
  expect(repo.loadAll).toHaveBeenCalledTimes(1);

  await act(async () => release());
  await act(() => reloaded);
  expect(repo.loadAll).toHaveBeenCalledTimes(2);
  expect(symbols(result.current.holdings)).toEqual(['INFY.NS', 'WIPRO.NS']);
});

test('signing out shows guest localStorage data again (and never touched it)', async () => {
  localStorage.setItem('stockpulse_watchlist_in', JSON.stringify([{ symbol: 'GUEST.NS' }]));
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();
  expect(symbols(result.current.watchlist)).toEqual(['TCS.NS']);

  act(() => client.auth._emit('SIGNED_OUT', null));
  await settle();
  expect(result.current.mode).toBe('guest');
  expect(result.current.watchlist).toEqual([{ symbol: 'GUEST.NS' }]);
  expect(JSON.parse(localStorage.getItem('stockpulse_watchlist_in'))).toEqual([{ symbol: 'GUEST.NS' }]);
});

test('coalescing: three setter calls inside the debounce window make one write', async () => {
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  // Typing "150" into the target input: 1, 15, 150.
  for (const v of [1, 15, 150]) {
    act(() => result.current.setWatchlist((prev) => prev.map((w) => ({ ...w, alertLow: v }))));
    await advance(100);
  }
  // t=300: 450ms after the first keystroke nothing is written; each call restarted the timer.
  await advance(150);
  expect(repo.applyWatchlistDiff).not.toHaveBeenCalled();
  await advance(FLUSH_DELAY);

  expect(repo.applyWatchlistDiff).toHaveBeenCalledTimes(1);
  expect(repo.applyWatchlistDiff.mock.calls[0][3].upsertAlerts).toEqual([
    { symbol: 'TCS.NS', name: 'TCS', condition: 'below', target: 150 },
  ]);
  const alertWrites = writes(client, 'price_alerts');
  expect(alertWrites).toHaveLength(1);
  expect(client.tables.price_alerts.find((a) => a.condition === 'below').target).toBe(150);
});

test('a TOKEN_REFRESHED for the same user does not reload (or clobber optimistic state)', async () => {
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();
  expect(repo.loadAll).toHaveBeenCalledTimes(1);

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'HDFC.NS' }]));
  act(() => client.auth._emit('TOKEN_REFRESHED', { user: { ...USER }, access_token: 't2' }));
  await settle();

  expect(repo.loadAll).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('ready');
  expect(symbols(result.current.watchlist)).toEqual(['TCS.NS', 'HDFC.NS']);
});

test('changes during an in-flight write are flushed afterwards with only the new diff', async () => {
  const actual = await vi.importActual('@/lib/userDataRepo');
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  let release;
  repo.applyWatchlistDiff.mockImplementationOnce(
    (...args) => new Promise((resolve) => (release = () => resolve(actual.applyWatchlistDiff(...args)))),
  );

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'A.NS' }]));
  await advance(FLUSH_DELAY);
  expect(repo.applyWatchlistDiff).toHaveBeenCalledTimes(1);

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'B.NS' }]));
  await advance(FLUSH_DELAY);
  // Still one call: flushes for the same collection+market run one at a time.
  expect(repo.applyWatchlistDiff).toHaveBeenCalledTimes(1);

  await act(async () => release());
  await settle();

  expect(repo.applyWatchlistDiff).toHaveBeenCalledTimes(2);
  expect(symbols(repo.applyWatchlistDiff.mock.calls[0][3].insertItems)).toEqual(['A.NS']);
  const second = repo.applyWatchlistDiff.mock.calls[1][3];
  expect(symbols(second.insertItems)).toEqual(['B.NS']);
  expect(second.deleteSymbols).toEqual([]);
  expect(client.tables.watchlist_items.filter((r) => r.market === 'in').map((r) => r.symbol).sort()).toEqual([
    'A.NS',
    'B.NS',
    'TCS.NS',
  ]);
  expect(toast.error).not.toHaveBeenCalled();
});

test('demo holdings (isDemo) are never written', async () => {
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  const demo = { id: 'demo-TCS.NS', symbol: 'TCS.NS', name: 'TCS', buyPrice: 3000, quantity: 5, buyDate: '2025-01-01', isDemo: true };
  act(() => result.current.setHoldings((prev) => [...prev, demo]));
  await advance(FLUSH_DELAY);
  expect(writes(client, 'holdings')).toHaveLength(0);

  const real = { id: '11111111-1111-4111-8111-111111111111', symbol: 'WIPRO.NS', name: 'Wipro', buyPrice: 400, quantity: 3, buyDate: '2026-03-01' };
  act(() => result.current.setHoldings((prev) => [...prev, real]));
  await advance(FLUSH_DELAY);
  const w = writes(client, 'holdings');
  expect(w).toHaveLength(1);
  expect(w[0].values.map((r) => r.id)).toEqual([real.id]);
  expect(client.tables.holdings.some((r) => r.id === demo.id)).toBe(false);
});

test('holdings: replace with a new array and append with an updater both sync', async () => {
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  const a = { id: '22222222-2222-4222-8222-222222222222', symbol: 'A.NS', name: 'A', buyPrice: 10, quantity: 1, buyDate: '2026-01-01' };
  const b = { id: '33333333-3333-4333-8333-333333333333', symbol: 'B.NS', name: 'B', buyPrice: 20, quantity: 2, buyDate: '2026-01-02' };
  act(() => result.current.setHoldings([a])); // import "replace"
  act(() => result.current.setHoldings((prev) => [...prev, b])); // import "append"
  expect(symbols(result.current.holdings)).toEqual(['A.NS', 'B.NS']);
  await advance(FLUSH_DELAY);

  expect(repo.applyHoldingsDiff).toHaveBeenCalledTimes(1);
  const diff = repo.applyHoldingsDiff.mock.calls[0][3];
  expect(diff.insert.map((h) => h.id)).toEqual([a.id, b.id]);
  expect(diff.delete).toEqual(['h1']);
  expect(client.tables.holdings.map((r) => r.symbol).sort()).toEqual(['A.NS', 'B.NS']);
});

test('pagehide flushes pending changes immediately', async () => {
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'HDFC.NS' }]));
  act(() => window.dispatchEvent(new Event('pagehide')));
  await settle();
  expect(repo.applyWatchlistDiff).toHaveBeenCalledTimes(1);

  await advance(FLUSH_DELAY); // the cancelled debounce doesn't write again
  expect(repo.applyWatchlistDiff).toHaveBeenCalledTimes(1);
});

test('visibilitychange to hidden flushes pending changes', async () => {
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'HDFC.NS' }]));
  const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  spy.mockRestore();
  await settle();
  expect(repo.applyWatchlistDiff).toHaveBeenCalledTimes(1);
});

test('unmount flushes pending changes (best effort)', async () => {
  const client = signedInClient();
  const { result, unmount } = renderData(client);
  await settle();

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'HDFC.NS' }]));
  unmount();
  await settle();
  expect(repo.applyWatchlistDiff).toHaveBeenCalledTimes(1);
  expect(client.tables.watchlist_items.map((r) => r.symbol)).toContain('HDFC.NS');
});

test('flushing on SIGNED_OUT alone is too late: the session is gone, the write fails silently', async () => {
  // Like supabase-js, the fake clears the session before emitting SIGNED_OUT, and with
  // requireSession an anonymous write is rejected the way RLS would reject it.
  const client = createFakeSupabase({ session: SESSION, tables: seedTables(), requireSession: true });
  const { result } = renderData(client);
  await settle();

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'HDFC.NS' }]));
  await act(() => client.auth.signOut());
  await settle();

  // The provider does try (as u1) on the way out...
  expect(repo.applyWatchlistDiff).toHaveBeenCalledTimes(1);
  expect(repo.applyWatchlistDiff.mock.calls[0][1]).toBe('u1');
  // ...but the write is rejected, and the session is already inactive, so nobody hears.
  await expect(repo.applyWatchlistDiff.mock.results[0].value).resolves.toEqual({ error: expect.objectContaining({ code: '42501' }) });
  expect(client.tables.watchlist_items.map((r) => r.symbol)).not.toContain('HDFC.NS');
  expect(toast.error).not.toHaveBeenCalled();
  expect(result.current.mode).toBe('guest');
});

test('await flush() then signOut() saves the edit (why useSignOut flushes first)', async () => {
  const client = createFakeSupabase({ session: SESSION, tables: seedTables(), requireSession: true });
  const { result } = renderData(client);
  await settle();

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'HDFC.NS' }]));
  await act(() => result.current.flush());
  await act(() => client.auth.signOut());
  await settle();

  expect(client.tables.watchlist_items.map((r) => r.symbol)).toContain('HDFC.NS');
  expect(toast.error).not.toHaveBeenCalled();
  expect(result.current.mode).toBe('guest');
});

test('while auth is loading the setter is a no-op: guest localStorage is not written', async () => {
  const client = signedInClient();
  let resolveSession;
  client.auth.getSession.mockImplementation(() => new Promise((r) => (resolveSession = r)));
  const { result } = renderData(client);
  expect(result.current.status).toBe('loading');

  const setter = result.current.setWatchlist;
  act(() => result.current.setWatchlist([{ symbol: 'LEAK.NS' }]));
  act(() => result.current.setHoldings((prev) => [...prev, X]));
  expect(localStorage.getItem('stockpulse_watchlist_in')).toBeNull();
  expect(localStorage.getItem('stockpulse_portfolio_in')).toBeNull();
  expect(result.current.watchlist).toEqual([]);
  expect(result.current.setWatchlist).toBe(setter); // stable no-op

  // Once auth settles on "no user", the guest setter works again.
  await act(async () => resolveSession({ data: { session: null }, error: null }));
  await settle();
  expect(result.current.mode).toBe('guest');
  expect(result.current.status).toBe('ready');
  act(() => result.current.setWatchlist([{ symbol: 'OK.NS' }]));
  expect(JSON.parse(localStorage.getItem('stockpulse_watchlist_in'))).toEqual([{ symbol: 'OK.NS' }]);
});

test('while the account status is "error" the setter is a no-op', async () => {
  const client = signedInClient();
  client.failNext = true;
  const { result } = renderData(client);
  await settle();
  expect(result.current.status).toBe('error');
  act(() => result.current.setWatchlist([{ symbol: 'LEAK.NS' }]));
  await advance(FLUSH_DELAY);
  expect(localStorage.getItem('stockpulse_watchlist_in')).toBeNull();
  expect(writes(client, 'watchlist_items')).toHaveLength(0);
  expect(result.current.watchlist).toEqual([]);
});

test('flush() writes now and reload() refetches', async () => {
  const client = signedInClient();
  const { result } = renderData(client);
  await settle();

  act(() => result.current.setWatchlist((prev) => [...prev, { symbol: 'HDFC.NS' }]));
  await act(() => result.current.flush());
  expect(repo.applyWatchlistDiff).toHaveBeenCalledTimes(1);

  client.tables.watchlist_items.push({ id: 'w9', user_id: 'u1', market: 'in', symbol: 'NEW.NS', name: 'New', added_at: '2026-05-01T00:00:00.000Z' });
  await act(() => result.current.reload());
  expect(repo.loadAll).toHaveBeenCalledTimes(2);
  expect(symbols(result.current.watchlist)).toEqual(['TCS.NS', 'NEW.NS', 'HDFC.NS']); // by added_at; HDFC got DEFAULT now()
});

test('a failed initial load shows a toast and status "error" with empty data', async () => {
  const client = signedInClient();
  client.failNext = true;
  const { result } = renderData(client);
  await settle();
  expect(result.current.status).toBe('error');
  expect(result.current.watchlist).toEqual([]);
  expect(toast.error).toHaveBeenCalled();
});

test('after a failed initial load, retry() from useUserDataActions loads the data', async () => {
  const client = signedInClient();
  client.failNext = true;
  const { result } = renderData(client);
  await settle();
  expect(result.current.status).toBe('error');

  await act(() => result.current.retry());
  expect(result.current.status).toBe('ready');
  expect(symbols(result.current.watchlist)).toEqual(['TCS.NS']);
  expect(repo.loadAll).toHaveBeenCalledTimes(2);
});

test("the load-failure toast has a Retry action that loads the data", async () => {
  const client = signedInClient();
  client.failNext = true;
  const { result } = renderData(client);
  await settle();

  expect(toast.error).toHaveBeenCalledWith("Couldn't load your account data", {
    action: { label: 'Retry', onClick: expect.any(Function) },
  });
  const { onClick } = toast.error.mock.calls[0][1].action;
  await act(async () => onClick());
  await settle();
  expect(result.current.status).toBe('ready');
  expect(symbols(result.current.holdings)).toEqual(['INFY.NS']);
});

test('each market has its own data', async () => {
  const client = signedInClient();
  const { result } = renderData(client, 'us');
  await settle();
  expect(symbols(result.current.watchlist)).toEqual(['AAPL']);
  expect(result.current.holdings).toEqual([]);
});
