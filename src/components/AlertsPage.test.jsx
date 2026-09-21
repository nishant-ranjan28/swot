import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import * as repo from '@/lib/userDataRepo';
import { AuthProvider } from '@/context/AuthContext';
import { UserDataProvider, useUserDataStatus, useWatchlist } from '@/context/UserDataContext';
import { MarketProvider } from '@/context/MarketContext';
import { createFakeSupabase } from '@/test/fakeSupabase';
import AlertsPage from './AlertsPage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
// loadAll is what UserDataContext.reload() refetches with: counting its calls shows the
// page asked the watchlist state to reload.
vi.mock('@/lib/userDataRepo', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadAll: vi.fn(actual.loadAll),
    createAlert: vi.fn(actual.createAlert),
    listAlerts: vi.fn(actual.listAlerts),
    deleteAlert: vi.fn(actual.deleteAlert),
  };
});

const USER = { id: 'u1', email: 'asha@example.com' };

const alertRow = (id, extra = {}) => ({
  id,
  user_id: 'u1',
  market: 'in',
  symbol: 'TCS.NS',
  name: 'TCS',
  condition: 'above',
  target: 4000,
  active: true,
  last_triggered_at: null,
  created_at: '2026-09-01T10:00:00Z',
  ...extra,
});

function Where() {
  const { pathname, state } = useLocation();
  return (
    <>
      <div data-testid="where">{pathname}</div>
      <div data-testid="from">{state?.from ?? ''}</div>
    </>
  );
}

// Sets alertHigh on a watchlist item through the user data context: the edit stays
// pending (unflushed) until something flushes it.
function WatchlistProbe({ symbol, alertHigh }) {
  const { status } = useUserDataStatus();
  const [items, setItems] = useWatchlist('in');
  if (status !== 'ready' || !items.length) return null;
  return (
    <button
      type="button"
      onClick={() => setItems((list) => list.map((i) => (i.symbol === symbol ? { ...i, alertHigh } : i)))}
    >
      Edit watchlist alert
    </button>
  );
}

function renderAlerts(client, { flushDelay, probe } = {}) {
  render(
    <MarketProvider>
      <AuthProvider client={client}>
        <UserDataProvider flushDelay={flushDelay}>
          {probe}
          <MemoryRouter initialEntries={['/alerts']}>
            <Routes>
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="*" element={<Where />} />
            </Routes>
          </MemoryRouter>
        </UserDataProvider>
      </AuthProvider>
    </MarketProvider>,
  );
}

const signedIn = (tables = {}) => createFakeSupabase({ session: { user: USER }, tables });

const section = (name) => screen.getByRole('region', { name });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

test('shows the not-configured state without a Supabase client', () => {
  renderAlerts(null);
  expect(screen.getByText("Accounts aren't configured on this deployment.")).toBeInTheDocument();
});

test('guest: sign-in prompt with Sign in (from=/alerts) and Go to Watchlist', async () => {
  renderAlerts(createFakeSupabase());
  expect(await screen.findByText('Sign in to get email alerts')).toBeInTheDocument();
  expect(screen.getByText(/set price targets on your watchlist, or sign in/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to Watchlist' })).toHaveAttribute('href', '/watchlist');
  fireEvent.click(screen.getByRole('link', { name: 'Sign in' }));
  expect(screen.getByTestId('where')).toHaveTextContent('/login');
  expect(screen.getByTestId('from')).toHaveTextContent('/alerts');
});

test('lists active, triggered and history from the tables', async () => {
  renderAlerts(
    signedIn({
      price_alerts: [
        alertRow('a1', { target: 2500, symbol: 'RELIANCE.NS', name: 'Reliance' }),
        alertRow('a2', { market: 'us', symbol: 'AAPL', condition: 'below', target: 180 }),
        alertRow('a3', { condition: 'pct_up', target: 5, active: false, last_triggered_at: '2026-09-02T05:00:00Z' }),
        // inactive but never triggered: in neither list
        alertRow('a4', { symbol: 'INFY.NS', condition: 'pct_down', target: 3, active: false }),
      ],
      alert_events: [{ id: 'e1', alert_id: 'a3', user_id: 'u1', price: 4100, triggered_at: '2026-09-02T05:00:00Z', emailed: true }],
    }),
  );
  await screen.findByText('Above ₹2,500');

  const active = section('Active');
  expect(within(active).getByText('RELIANCE.NS')).toBeInTheDocument();
  expect(within(active).getByText('Above ₹2,500')).toBeInTheDocument();
  expect(within(active).getByText('Below $180')).toBeInTheDocument();
  expect(within(active).queryByText('Up 5% today')).not.toBeInTheDocument();

  const triggered = section('Triggered');
  expect(within(triggered).getByText('Up 5% today')).toBeInTheDocument();
  expect(within(triggered).queryByText('Above ₹2,500')).not.toBeInTheDocument();
  expect(within(triggered).queryByText('Down 3% today')).not.toBeInTheDocument();
  expect(screen.queryByText('INFY.NS')).not.toBeInTheDocument();

  const history = section('History');
  expect(within(history).getByText('Up 5% today')).toBeInTheDocument();
  expect(within(history).getByText('₹4,100')).toBeInTheDocument();
});

test('empty lists show friendly empty states', async () => {
  renderAlerts(signedIn());
  expect(await screen.findByText('No active alerts')).toBeInTheDocument();
  expect(screen.getByText('Nothing has triggered yet')).toBeInTheDocument();
});

test('creating an above alert inserts the row, refreshes the lists and reloads user data', async () => {
  const client = signedIn();
  renderAlerts(client);
  await screen.findByText('No active alerts');
  await waitFor(() => expect(repo.loadAll).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'reliance' } });
  fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'above' } });
  fireEvent.change(screen.getByLabelText(/^Target/), { target: { value: '2500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add alert' }));

  await waitFor(() => expect(within(section('Active')).getByText('Above ₹2,500')).toBeInTheDocument());
  expect(client.tables.price_alerts).toEqual([
    expect.objectContaining({ user_id: 'u1', market: 'in', symbol: 'RELIANCE.NS', condition: 'above', target: 2500, active: true }),
  ]);
  await waitFor(() => expect(repo.loadAll).toHaveBeenCalledTimes(2));
  expect(toast.success).toHaveBeenCalled();
  expect(screen.getByLabelText('Symbol')).toHaveValue('');
});

test('in market: a bare symbol gets .NS, and the hint says so', async () => {
  const client = signedIn();
  renderAlerts(client);
  await screen.findByText('No active alerts');
  expect(screen.getByText(/we add \.NS/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: ' tcs ' } });
  expect(screen.getByText('Saved as TCS.NS')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'sbin.bo' } });
  expect(screen.getByText('Saved as SBIN.BO')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Target/), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add alert' }));
  await waitFor(() => expect(client.tables.price_alerts?.[0]).toMatchObject({ symbol: 'SBIN.BO' }));
});

test('us market: no suffix is added', async () => {
  const client = signedIn();
  renderAlerts(client);
  await screen.findByText('No active alerts');
  fireEvent.click(screen.getByRole('button', { name: 'US' }));
  expect(screen.getByRole('button', { name: 'US' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByText(/we add \.NS/i)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'aapl' } });
  fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'below' } });
  fireEvent.change(screen.getByLabelText(/^Target/), { target: { value: '180' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add alert' }));
  await waitFor(() => expect(within(section('Active')).getByText('Below $180')).toBeInTheDocument());
  expect(client.tables.price_alerts[0]).toMatchObject({ market: 'us', symbol: 'AAPL', condition: 'below' });
});

test('validation: 0 or negative target and an empty symbol are rejected inline, nothing is saved', async () => {
  const client = signedIn();
  renderAlerts(client);
  await screen.findByText('No active alerts');

  fireEvent.click(screen.getByRole('button', { name: 'Add alert' }));
  const errors = await screen.findAllByRole('alert');
  expect(errors.map((e) => e.textContent)).toEqual(['Enter a symbol', 'Target must be greater than 0']);

  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'TCS' } });
  fireEvent.change(screen.getByLabelText(/^Target/), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add alert' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Target must be greater than 0');
  expect(screen.getByLabelText(/^Target/)).toHaveAttribute('aria-invalid', 'true');

  fireEvent.change(screen.getByLabelText(/^Target/), { target: { value: '-5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add alert' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Target must be greater than 0');

  expect(repo.createAlert).not.toHaveBeenCalled();
  expect(client.tables.price_alerts ?? []).toHaveLength(0);
});

test('a failed create shows an error toast and keeps the form', async () => {
  const client = signedIn();
  renderAlerts(client);
  await screen.findByText('No active alerts');
  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'TCS' } });
  fireEvent.change(screen.getByLabelText(/^Target/), { target: { value: '10' } });
  client.failNext = true;
  fireEvent.click(screen.getByRole('button', { name: 'Add alert' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(screen.getByLabelText('Symbol')).toHaveValue('TCS');
});

test('re-arm moves a triggered alert back to active and reloads user data', async () => {
  const client = signedIn({
    price_alerts: [alertRow('a3', { condition: 'pct_up', target: 5, active: false, last_triggered_at: '2026-09-02T05:00:00Z' })],
  });
  renderAlerts(client);
  await screen.findByRole('button', { name: 'Re-arm TCS.NS Up 5% today' });
  await waitFor(() => expect(repo.loadAll).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Re-arm TCS.NS Up 5% today' }));
  await waitFor(() => expect(within(section('Active')).getByText('Up 5% today')).toBeInTheDocument());
  expect(client.tables.price_alerts[0]).toMatchObject({ active: true, last_triggered_at: null });
  expect(screen.getByText('Nothing has triggered yet')).toBeInTheDocument();
  await waitFor(() => expect(repo.loadAll).toHaveBeenCalledTimes(2));
});

test('delete removes the alert and reloads user data', async () => {
  const client = signedIn({ price_alerts: [alertRow('a1')] });
  renderAlerts(client);
  await screen.findByText('Above ₹4,000');
  await waitFor(() => expect(repo.loadAll).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Delete TCS.NS Above ₹4,000' }));
  await waitFor(() => expect(screen.getByText('No active alerts')).toBeInTheDocument());
  expect(client.tables.price_alerts).toEqual([]);
  await waitFor(() => expect(repo.loadAll).toHaveBeenCalledTimes(2));
});

test('history shows Done or Queued per event', async () => {
  renderAlerts(
    signedIn({
      price_alerts: [
        alertRow('a1', { active: false, last_triggered_at: '2026-09-02T05:00:00Z' }),
        alertRow('a2', { market: 'us', symbol: 'AAPL', condition: 'below', target: 180, active: false, last_triggered_at: '2026-09-03T05:00:00Z' }),
      ],
      alert_events: [
        { id: 'e1', alert_id: 'a1', user_id: 'u1', price: 4010, triggered_at: '2026-09-02T05:00:00Z', emailed: true },
        { id: 'e2', alert_id: 'a2', user_id: 'u1', price: 179.5, triggered_at: '2026-09-03T05:00:00Z', emailed: false },
      ],
    }),
  );
  const history = await waitFor(() => section('History'));
  const rows = await within(history).findAllByRole('row');
  // header + 2 events, newest first
  expect(rows).toHaveLength(3);
  expect(within(rows[1]).getByText('AAPL')).toBeInTheDocument();
  expect(within(rows[1]).getByText('$179.50')).toBeInTheDocument();
  expect(within(rows[1]).getByText('Queued')).toBeInTheDocument();
  expect(within(rows[2]).getByText('TCS.NS')).toBeInTheDocument();
  const done = within(rows[2]).getByText('Done');
  expect(done).toHaveAttribute('title', 'Emailed, or skipped because email alerts are off');
  expect(screen.queryByText('Emailed')).not.toBeInTheDocument();
  expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  // email alerts on (the profile default): no note
  expect(screen.queryByText(/email alerts are off/i, { selector: 'p' })).not.toBeInTheDocument();
});

test('history notes when email alerts are off, with a link to Settings', async () => {
  renderAlerts(
    signedIn({
      profiles: [{ id: 'u1', email_alerts: false }],
      alert_events: [{ id: 'e1', alert_id: 'gone', user_id: 'u1', price: 4100, triggered_at: '2026-09-02T05:00:00Z', emailed: true }],
    }),
  );
  const history = await waitFor(() => section('History'));
  expect(await within(history).findByText(/Email alerts are off — triggers are recorded but not emailed\./)).toBeInTheDocument();
  expect(within(history).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
});

test('an event whose alert was deleted shows its price without a currency symbol', async () => {
  renderAlerts(
    signedIn({
      alert_events: [{ id: 'e1', alert_id: 'gone', user_id: 'u1', price: 4100, triggered_at: '2026-09-02T05:00:00Z', emailed: false }],
    }),
  );
  const history = await waitFor(() => section('History'));
  expect(await within(history).findByText('Deleted alert')).toBeInTheDocument();
  expect(within(history).getByText('4,100')).toBeInTheDocument();
  expect(within(history).queryByText('₹4,100')).not.toBeInTheDocument();
});

test('a load failure shows a toast and an error state that retries', async () => {
  const client = signedIn({ price_alerts: [alertRow('a1')] });
  repo.listAlerts.mockResolvedValueOnce({ error: { message: 'boom' } });
  renderAlerts(client);
  expect(await screen.findByText("Couldn't load your alerts.")).toBeInTheDocument();
  expect(toast.error).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Above ₹4,000')).toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// Pending watchlist edits (the same price_alerts rows) are written before the page
// reads or writes, so a late flush can't undo what was done here.

const watchedTcs = (extra = {}) => ({
  watchlist_items: [{ id: 'w1', user_id: 'u1', market: 'in', symbol: 'TCS.NS', name: 'Tata Consultancy', added_at: '2026-09-01T10:00:00Z' }],
  price_alerts: [alertRow('a1')],
  ...extra,
});
const LONG_DELAY = 60_000; // the pending edit never flushes on its own during the test

test('deleting an alert with a pending watchlist edit to it: the row stays deleted', async () => {
  const client = signedIn(watchedTcs());
  renderAlerts(client, { flushDelay: LONG_DELAY, probe: <WatchlistProbe symbol="TCS.NS" alertHigh={4500} /> });
  await screen.findByText('Above ₹4,000');
  fireEvent.click(await screen.findByRole('button', { name: 'Edit watchlist alert' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete TCS.NS Above ₹4,000' }));
  await waitFor(() => expect(screen.getByText('No active alerts')).toBeInTheDocument());
  await waitFor(() => expect(repo.loadAll).toHaveBeenCalledTimes(2));
  await act(() => new Promise((r) => setTimeout(r, 20)));
  expect(client.tables.price_alerts).toEqual([]);
  expect(screen.getByText('No active alerts')).toBeInTheDocument();
});

test('creating an alert over a pending watchlist edit: the target set here wins', async () => {
  const client = signedIn(watchedTcs());
  renderAlerts(client, { flushDelay: LONG_DELAY, probe: <WatchlistProbe symbol="TCS.NS" alertHigh={4500} /> });
  await screen.findByText('Above ₹4,000');
  fireEvent.click(await screen.findByRole('button', { name: 'Edit watchlist alert' }));
  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'tcs' } });
  fireEvent.change(screen.getByLabelText(/^Target/), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add alert' }));
  await waitFor(() => expect(within(section('Active')).getByText('Above ₹5,000')).toBeInTheDocument());
  await waitFor(() => expect(repo.loadAll).toHaveBeenCalledTimes(2));
  await act(() => new Promise((r) => setTimeout(r, 20)));
  expect(client.tables.price_alerts).toEqual([expect.objectContaining({ symbol: 'TCS.NS', condition: 'above', target: 5000, active: true })]);
});

test('creating an alert for a watched symbol passes the watchlist name', async () => {
  const client = signedIn(watchedTcs({ price_alerts: [] }));
  renderAlerts(client);
  await screen.findByText('No active alerts');
  await waitFor(() => expect(repo.loadAll).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'tcs' } });
  fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'pct_up' } });
  fireEvent.change(screen.getByLabelText(/^Target/), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add alert' }));
  await waitFor(() => expect(within(section('Active')).getByText('Tata Consultancy')).toBeInTheDocument());
  expect(repo.createAlert).toHaveBeenCalledWith(client, 'u1', expect.objectContaining({ symbol: 'TCS.NS', name: 'Tata Consultancy' }));
  expect(client.tables.price_alerts[0]).toMatchObject({ symbol: 'TCS.NS', name: 'Tata Consultancy', condition: 'pct_up' });
});

test('a create rejected by validation shows its message', async () => {
  const client = signedIn();
  renderAlerts(client);
  await screen.findByText('No active alerts');
  repo.createAlert.mockResolvedValueOnce({ error: { message: 'Choose a condition', invalid: true } });
  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'TCS' } });
  fireEvent.change(screen.getByLabelText(/^Target/), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add alert' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Choose a condition'));
});

test('a failed database write keeps the generic message', async () => {
  const client = signedIn();
  renderAlerts(client);
  await screen.findByText('No active alerts');
  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'TCS' } });
  fireEvent.change(screen.getByLabelText(/^Target/), { target: { value: '10' } });
  client.failNext = true;
  fireEvent.click(screen.getByRole('button', { name: 'Add alert' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the alert — try again"));
});

test('concurrent row actions: one finishing does not re-enable the other', async () => {
  const client = signedIn({ price_alerts: [alertRow('a1'), alertRow('a2', { symbol: 'INFY.NS', name: 'Infosys' })] });
  let release;
  repo.deleteAlert.mockImplementationOnce(
    (...args) => new Promise((resolve) => (release = () => resolve(repo.deleteAlert(...args)))),
  );
  renderAlerts(client);
  const first = await screen.findByRole('button', { name: 'Delete TCS.NS Above ₹4,000' });
  fireEvent.click(first);
  await waitFor(() => expect(first).toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Delete INFY.NS Above ₹4,000' }));
  await waitFor(() => expect(screen.queryByText('INFY.NS')).not.toBeInTheDocument());
  await waitFor(() => expect(repo.loadAll).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('button', { name: 'Delete TCS.NS Above ₹4,000' })).toBeDisabled();
  await act(async () => release());
  await waitFor(() => expect(screen.getByText('No active alerts')).toBeInTheDocument());
  expect(client.tables.price_alerts).toEqual([]);
});
