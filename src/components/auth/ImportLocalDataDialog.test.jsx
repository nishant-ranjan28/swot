import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import * as repo from '@/lib/userDataRepo';
import { AuthProvider } from '@/context/AuthContext';
import { UserDataProvider, useUserDataActions } from '@/context/UserDataContext';
import { createFakeSupabase } from '@/test/fakeSupabase';
import ImportLocalDataDialog, { countGuestData, readGuestData } from './ImportLocalDataDialog';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/lib/userDataRepo', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    importLocal: vi.fn(actual.importLocal),
    markImported: vi.fn(actual.markImported),
    getProfile: vi.fn(actual.getProfile),
  };
});
vi.mock('@/context/UserDataContext', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useUserDataActions: vi.fn(actual.useUserDataActions) };
});

const USER = { id: 'u1', email: 'asha@example.com' };
const profile = (imported_at = null) => ({
  id: 'u1',
  display_name: null,
  default_market: 'in',
  email_alerts: true,
  daily_digest: true,
  digest_market: 'in',
  imported_at,
  created_at: '2026-09-01T00:00:00.000Z',
});

const WATCH_IN = [
  { symbol: 'TCS.NS', name: 'TCS', alertHigh: 4000, alertLow: 3000 },
  { symbol: 'INFY.NS', name: 'Infosys', alertHigh: '' },
];
const WATCH_US = [{ symbol: 'AAPL', name: 'Apple', alertLow: 150 }];
const HOLD_IN = [
  { id: 'demo-1', symbol: 'RELIANCE.NS', quantity: 1, buyPrice: 1, isDemo: true },
  { id: '0b8f3f3e-6a55-4f6e-9d0e-0a0c7f0c2b11', symbol: 'HDFCBANK.NS', name: 'HDFC Bank', quantity: 5, buyPrice: 1500, buyDate: '2026-01-01' },
];
const HOLD_US = [{ id: '5d1d2f2e-1b1a-4c1e-8f7e-2b6c0d9a4e21', symbol: 'MSFT', name: 'Microsoft', quantity: 2, buyPrice: 300, buyDate: '2026-02-01' }];

function seedLocal() {
  localStorage.setItem('stockpulse_watchlist_in', JSON.stringify(WATCH_IN));
  localStorage.setItem('stockpulse_watchlist_us', JSON.stringify(WATCH_US));
  localStorage.setItem('stockpulse_portfolio_in', JSON.stringify(HOLD_IN));
  localStorage.setItem('stockpulse_portfolio_us', JSON.stringify(HOLD_US));
}

const clientWith = (p = profile()) =>
  createFakeSupabase({ session: { user: USER }, tables: { profiles: p ? [p] : [] } });

function renderDialog(client, { path = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider client={client}>
        <UserDataProvider>
          <ImportLocalDataDialog />
        </UserDataProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const BODY = 'Import 3 watchlist stocks, 2 holdings and 3 price alerts from this browser into your account.';

/** Let the fake client and repo promises resolve. */
async function settle() {
  for (let i = 0; i < 5; i++) await act(() => Promise.resolve());
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

test('appears with the counts from guest localStorage (demo holdings excluded)', async () => {
  seedLocal();
  renderDialog(clientWith());
  expect(await screen.findByRole('dialog', { name: 'Bring your local data?' })).toBeInTheDocument();
  expect(screen.getByText(BODY)).toBeInTheDocument();
});

test('Import sends the local data, toasts, then reloads the account data', async () => {
  seedLocal();
  const order = [];
  const reload = vi.fn(async () => {
    order.push('reload');
    return { error: null };
  });
  useUserDataActions.mockReturnValue({ flush: vi.fn(), reload });
  repo.importLocal.mockImplementationOnce(async (...args) => {
    const res = await vi.importActual('@/lib/userDataRepo').then((m) => m.importLocal(...args));
    order.push('importLocal');
    return res;
  });
  const client = clientWith();
  renderDialog(client);
  fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
  await waitFor(() => expect(reload).toHaveBeenCalled());
  expect(order).toEqual(['importLocal', 'reload']);
  const [, userId, local] = repo.importLocal.mock.calls[0];
  expect(userId).toBe('u1');
  expect(local.in.watchlist).toEqual(WATCH_IN);
  expect(local.us.watchlist).toEqual(WATCH_US);
  expect(local.in.holdings.map((h) => h.symbol)).toEqual(['HDFCBANK.NS']);
  expect(local.us.holdings.map((h) => h.symbol)).toEqual(['MSFT']);
  expect(toast.success).toHaveBeenCalled();
  expect(client.tables.watchlist_items).toHaveLength(3);
  expect(client.tables.profiles[0].imported_at).not.toBeNull();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  // Guest data is never modified.
  expect(JSON.parse(localStorage.getItem('stockpulse_portfolio_in'))).toEqual(HOLD_IN);
});

test('a failed import keeps the dialog open and shows an error', async () => {
  seedLocal();
  repo.importLocal.mockResolvedValueOnce({ error: { message: 'boom' } });
  renderDialog(clientWith());
  fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('Skip marks the profile imported and closes', async () => {
  seedLocal();
  const client = clientWith();
  renderDialog(client);
  fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
  await waitFor(() => expect(repo.markImported).toHaveBeenCalledWith(client, 'u1'));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(client.tables.profiles[0].imported_at).not.toBeNull();
  expect(repo.importLocal).not.toHaveBeenCalled();
});

test('Esc closes without marking anything', async () => {
  seedLocal();
  const client = clientWith();
  renderDialog(client);
  const dialog = await screen.findByRole('dialog');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(repo.markImported).not.toHaveBeenCalled();
  expect(client.tables.profiles[0].imported_at).toBeNull();
});

test('does not appear when the profile was already imported', async () => {
  seedLocal();
  renderDialog(clientWith(profile('2026-09-01T00:00:00.000Z')));
  await waitFor(() => expect(repo.getProfile).toHaveBeenCalled());
  await settle();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('does not appear when there is no local data (demo-only holdings count as none)', async () => {
  localStorage.setItem('stockpulse_portfolio_in', JSON.stringify([HOLD_IN[0]]));
  renderDialog(clientWith());
  await waitFor(() => expect(repo.getProfile).toHaveBeenCalled());
  await settle();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('does not appear while the profile has not loaded (no row)', async () => {
  seedLocal();
  renderDialog(clientWith(null));
  await waitFor(() => expect(repo.getProfile).toHaveBeenCalled());
  await settle();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('asks only once per session per user', async () => {
  seedLocal();
  const first = renderDialog(clientWith());
  const dialog = await screen.findByRole('dialog');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  first.unmount();

  renderDialog(clientWith());
  await waitFor(() => expect(repo.getProfile).toHaveBeenCalledTimes(1));
  await settle();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('guests and deployments without Supabase see nothing', async () => {
  seedLocal();
  const { container } = renderDialog(null);
  await settle();
  expect(container).toBeEmptyDOMElement();
  renderDialog(createFakeSupabase());
  await settle();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(repo.getProfile).not.toHaveBeenCalled();
});

describe('user changes', () => {
  const U2 = { id: 'u2', email: 'ben@example.com' };
  const twoUsers = () =>
    createFakeSupabase({
      session: { user: USER },
      tables: { profiles: [profile(), { ...profile('2026-09-01T00:00:00.000Z'), id: 'u2' }] },
    });

  test('switching to another user clears the offer, and it stays gone on switching back', async () => {
    seedLocal();
    const client = twoUsers();
    renderDialog(client);
    await screen.findByRole('dialog');
    act(() => client.auth._emit('SIGNED_OUT', null));
    act(() => client.auth._emit('SIGNED_IN', { user: U2 }));
    await waitFor(() => expect(repo.getProfile).toHaveBeenCalledWith(client, 'u2'));
    await settle();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => client.auth._emit('SIGNED_IN', { user: USER }));
    await settle();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('does not reappear after signing out and back in as the same user in this session', async () => {
    seedLocal();
    const client = clientWith();
    renderDialog(client);
    await screen.findByRole('dialog');
    act(() => client.auth._emit('SIGNED_OUT', null));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    act(() => client.auth._emit('SIGNED_IN', { user: USER }));
    await settle();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('password recovery', () => {
  test('does not prompt on /reset-password', async () => {
    seedLocal();
    renderDialog(clientWith(), { path: '/reset-password' });
    await settle();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Not marked as asked: it can still prompt once the user leaves the page.
    expect(sessionStorage.getItem('stockpulse_import_prompted_u1')).toBeNull();
  });

  test('does not prompt after a PASSWORD_RECOVERY event', async () => {
    seedLocal();
    const client = createFakeSupabase({ tables: { profiles: [profile()] } });
    renderDialog(client);
    await settle();
    act(() => client.auth._emit('PASSWORD_RECOVERY', { user: USER }));
    await settle();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('stockpulse_import_prompted_u1')).toBeNull();
  });
});

describe('holding count matches importLocal', () => {
  const A = '0b8f3f3e-6a55-4f6e-9d0e-0a0c7f0c2b11';

  test('skips symbol-less holdings and counts a repeated guest id once, like importLocal', async () => {
    localStorage.setItem(
      'stockpulse_portfolio_in',
      JSON.stringify([
        { id: A, symbol: 'HDFCBANK.NS', quantity: 5, buyPrice: 1500 },
        { id: A, symbol: 'HDFCBANK.NS', quantity: 99, buyPrice: 1500 },
        { id: 'legacy-1', quantity: 1, buyPrice: 1 },
        { id: 'legacy-2', quantity: 2, buyPrice: 1 },
        { id: 'demo-1', symbol: 'RELIANCE.NS', quantity: 1, buyPrice: 1, isDemo: true },
        null,
      ]),
    );
    renderDialog(clientWith());
    expect(
      await screen.findByText('Import 1 holding from this browser into your account.'),
    ).toBeInTheDocument();
  });

  test('countGuestData equals the counts importLocal reports', async () => {
    const holdings = [
      { id: A, symbol: 'HDFCBANK.NS', quantity: 5, buyPrice: 1500 },
      { id: A, symbol: 'HDFCBANK.NS', quantity: 99, buyPrice: 1500 },
      { id: 'legacy-1', symbol: 'TCS.NS', quantity: 1, buyPrice: 1 },
      { id: 'legacy-1', symbol: 'TCS.NS', quantity: 2, buyPrice: 1 },
      { id: 'demo-1', symbol: 'RELIANCE.NS', quantity: 1, buyPrice: 1, isDemo: true },
    ];
    localStorage.setItem('stockpulse_portfolio_in', JSON.stringify(holdings));
    localStorage.setItem('stockpulse_watchlist_us', JSON.stringify(WATCH_US));
    const local = readGuestData();
    const actual = await vi.importActual('@/lib/userDataRepo');
    const { counts, error } = await actual.importLocal(clientWith(), 'u1', local);
    expect(error).toBeNull();
    expect(countGuestData(local)).toEqual(counts);
  });
});
