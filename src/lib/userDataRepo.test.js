import { describe, expect, test, vi, afterEach } from 'vitest';
import { createFakeSupabase } from '../test/fakeSupabase';
import {
  loadAll,
  loadCollection,
  applyWatchlistDiff,
  applyHoldingsDiff,
  getProfile,
  updateProfile,
  importLocal,
  markImported,
} from './userDataRepo';

const UID = 'user-1';
const OTHER = 'user-2';

const emptyWatchDiff = () => ({ insertItems: [], deleteSymbols: [], upsertAlerts: [], deleteAlerts: [] });
const emptyHoldDiff = () => ({ insert: [], update: [], delete: [] });

const holding = (id, extra = {}) => ({
  id,
  symbol: 'TCS',
  name: 'TCS Ltd',
  buyPrice: 3500,
  quantity: 2,
  buyDate: '2026-01-02',
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe('loadAll', () => {
  function seeded() {
    return createFakeSupabase({
      tables: {
        watchlist_items: [
          { id: 'w1', user_id: UID, market: 'in', symbol: 'INFY', name: 'Infosys', added_at: '2026-02-01T00:00:00Z' },
          { id: 'w2', user_id: UID, market: 'in', symbol: 'TCS', name: 'TCS', added_at: '2026-01-01T00:00:00Z' },
          { id: 'w3', user_id: UID, market: 'us', symbol: 'AAPL', name: 'Apple', added_at: '2026-01-05T00:00:00Z' },
          { id: 'w4', user_id: OTHER, market: 'in', symbol: 'HDFC', name: 'HDFC', added_at: '2026-01-01T00:00:00Z' },
        ],
        holdings: [
          { id: 'h1', user_id: UID, market: 'us', symbol: 'AAPL', name: 'Apple', buy_price: '150.5', quantity: '3', buy_date: '2026-01-10' },
          { id: 'h2', user_id: OTHER, market: 'us', symbol: 'MSFT', name: 'MS', buy_price: '300', quantity: '1', buy_date: null },
        ],
        price_alerts: [
          { id: 'a1', user_id: UID, market: 'in', symbol: 'TCS', condition: 'above', target: '4000', active: true },
          { id: 'a2', user_id: UID, market: 'in', symbol: 'TCS', condition: 'below', target: '3000', active: false },
          { id: 'a3', user_id: UID, market: 'us', symbol: 'AAPL', condition: 'below', target: 140, active: true },
          { id: 'a4', user_id: OTHER, market: 'in', symbol: 'INFY', condition: 'above', target: 9999, active: true },
        ],
      },
    });
  }

  test('groups by market, merges active alerts, filters by user', async () => {
    const client = seeded();
    const { data, error } = await loadAll(client, UID);
    expect(error).toBeNull();
    expect(data).toEqual({
      in: {
        watchlist: [
          { symbol: 'TCS', name: 'TCS', alertHigh: 4000, alertLow: null, addedAt: '2026-01-01T00:00:00Z' },
          { symbol: 'INFY', name: 'Infosys', alertHigh: null, alertLow: null, addedAt: '2026-02-01T00:00:00Z' },
        ],
        holdings: [],
      },
      us: {
        watchlist: [{ symbol: 'AAPL', name: 'Apple', alertHigh: null, alertLow: 140, addedAt: '2026-01-05T00:00:00Z' }],
        holdings: [{ id: 'h1', symbol: 'AAPL', name: 'Apple', buyPrice: 150.5, quantity: 3, buyDate: '2026-01-10' }],
      },
    });
  });

  test('issues 3 selects filtered by user_id, alerts also by active', async () => {
    const client = seeded();
    await loadAll(client, UID);
    expect(client.calls).toHaveLength(3);
    const byTable = Object.fromEntries(client.calls.map((c) => [c.table, c]));
    for (const t of ['watchlist_items', 'holdings', 'price_alerts']) {
      expect(byTable[t].op).toBe('select');
      expect(byTable[t].filters).toContainEqual({ type: 'eq', column: 'user_id', value: UID });
    }
    expect(byTable.price_alerts.filters).toContainEqual({ type: 'eq', column: 'active', value: true });
  });

  test('empty tables give empty markets', async () => {
    const { data, error } = await loadAll(createFakeSupabase(), UID);
    expect(error).toBeNull();
    expect(data).toEqual({ in: { watchlist: [], holdings: [] }, us: { watchlist: [], holdings: [] } });
  });

  test('returns { error } when one query fails', async () => {
    const client = seeded();
    client.failNext = true;
    const res = await loadAll(client, UID);
    expect(res.error).toEqual({ message: 'boom' });
    expect(res.data).toBeUndefined();
  });

  test('never throws, even if the client does', async () => {
    const client = { from: () => { throw new Error('kaput'); } };
    const res = await loadAll(client, UID);
    expect(res.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
describe('loadCollection', () => {
  function seeded() {
    return createFakeSupabase({
      tables: {
        watchlist_items: [
          { id: 'w1', user_id: UID, market: 'in', symbol: 'INFY', name: 'Infosys', added_at: '2026-02-01T00:00:00Z' },
          { id: 'w2', user_id: UID, market: 'in', symbol: 'TCS', name: 'TCS', added_at: '2026-01-01T00:00:00Z' },
          { id: 'w3', user_id: UID, market: 'us', symbol: 'AAPL', name: 'Apple', added_at: '2026-01-05T00:00:00Z' },
          { id: 'w4', user_id: OTHER, market: 'in', symbol: 'HDFC', name: 'HDFC', added_at: '2026-01-01T00:00:00Z' },
        ],
        holdings: [
          { id: 'h1', user_id: UID, market: 'us', symbol: 'AAPL', name: 'Apple', buy_price: '150.5', quantity: '3', buy_date: '2026-01-10' },
          { id: 'h2', user_id: OTHER, market: 'us', symbol: 'MSFT', name: 'MS', buy_price: '300', quantity: '1', buy_date: null },
          { id: 'h3', user_id: UID, market: 'in', symbol: 'TCS', name: 'TCS', buy_price: '10', quantity: '1', buy_date: null },
        ],
        price_alerts: [
          { id: 'a1', user_id: UID, market: 'in', symbol: 'TCS', condition: 'above', target: '4000', active: true },
          { id: 'a2', user_id: UID, market: 'in', symbol: 'TCS', condition: 'below', target: '3000', active: false },
          { id: 'a3', user_id: UID, market: 'us', symbol: 'AAPL', condition: 'below', target: 140, active: true },
          { id: 'a4', user_id: OTHER, market: 'in', symbol: 'HDFC', condition: 'above', target: 9999, active: true },
        ],
      },
    });
  }

  test('watchlist: this user and market only, with active alerts merged', async () => {
    const client = seeded();
    const { data, error } = await loadCollection(client, UID, 'in', 'watchlist');
    expect(error).toBeNull();
    expect(data).toEqual([
      { symbol: 'TCS', name: 'TCS', alertHigh: 4000, alertLow: null, addedAt: '2026-01-01T00:00:00Z' },
      { symbol: 'INFY', name: 'Infosys', alertHigh: null, alertLow: null, addedAt: '2026-02-01T00:00:00Z' },
    ]);
    expect(client.calls.map((c) => c.table).sort()).toEqual(['price_alerts', 'watchlist_items']);
    for (const c of client.calls) {
      expect(c.op).toBe('select');
      expect(c.filters).toEqual(expect.arrayContaining([
        { type: 'eq', column: 'user_id', value: UID },
        { type: 'eq', column: 'market', value: 'in' },
      ]));
    }
  });

  test('holdings: one select, this user and market only', async () => {
    const client = seeded();
    const { data, error } = await loadCollection(client, UID, 'us', 'holdings');
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 'h1', symbol: 'AAPL', name: 'Apple', buyPrice: 150.5, quantity: 3, buyDate: '2026-01-10' }]);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].table).toBe('holdings');
  });

  test('returns { error } when a query fails, and never throws', async () => {
    const client = seeded();
    client.failNext = true;
    expect(await loadCollection(client, UID, 'in', 'watchlist')).toEqual({ error: { message: 'boom' } });
    const broken = { from: () => { throw new Error('kaput'); } };
    const res = await loadCollection(broken, UID, 'in', 'holdings');
    expect(res.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
describe('applyWatchlistDiff', () => {
  const fullDiff = () => ({
    insertItems: [{ symbol: 'TCS', name: 'TCS Ltd', alertHigh: 4000, alertLow: null, addedAt: '2026-03-01T00:00:00Z' }],
    upsertAlerts: [{ symbol: 'TCS', name: 'TCS Ltd', condition: 'above', target: 4000 }],
    deleteAlerts: [
      { symbol: 'WIPRO', condition: 'below' }, // cleared on a kept symbol
      { symbol: 'INFY', condition: 'above' }, // removed symbol: folded into one query
      { symbol: 'INFY', condition: 'below' },
    ],
    deleteSymbols: ['INFY'],
  });

  test('runs the steps in order with the expected calls', async () => {
    const client = createFakeSupabase();
    const res = await applyWatchlistDiff(client, UID, 'in', fullDiff());
    expect(res).toEqual({ error: null });
    expect(client.calls.map((c) => [c.op, c.table])).toEqual([
      ['upsert', 'watchlist_items'],
      ['upsert', 'price_alerts'],
      ['delete', 'price_alerts'],
      ['delete', 'price_alerts'],
      ['delete', 'watchlist_items'],
    ]);
    const [items, alerts, delCleared, delRemovedAlerts, delItems] = client.calls;

    expect(items.options).toEqual({ onConflict: 'user_id,market,symbol', defaultToNull: false });
    expect(items.values).toEqual([
      { user_id: UID, market: 'in', symbol: 'TCS', name: 'TCS Ltd', added_at: '2026-03-01T00:00:00Z' },
    ]);

    expect(alerts.options).toEqual({ onConflict: 'user_id,market,symbol,condition', defaultToNull: false });
    expect(alerts.values).toEqual([
      { user_id: UID, market: 'in', symbol: 'TCS', name: 'TCS Ltd', condition: 'above', target: 4000, active: true, last_triggered_at: null },
    ]);

    expect(delCleared.filters).toEqual([
      { type: 'eq', column: 'user_id', value: UID },
      { type: 'eq', column: 'market', value: 'in' },
      { type: 'eq', column: 'symbol', value: 'WIPRO' },
      { type: 'eq', column: 'condition', value: 'below' },
    ]);
    expect(delRemovedAlerts.filters).toEqual([
      { type: 'eq', column: 'user_id', value: UID },
      { type: 'eq', column: 'market', value: 'in' },
      { type: 'in', column: 'symbol', value: ['INFY'] },
    ]);

    expect(delItems.filters).toEqual([
      { type: 'eq', column: 'user_id', value: UID },
      { type: 'eq', column: 'market', value: 'in' },
      { type: 'in', column: 'symbol', value: ['INFY'] },
    ]);
  });

  test('applies to the tables and only touches this user and market', async () => {
    const client = createFakeSupabase({
      tables: {
        watchlist_items: [
          { id: 'w1', user_id: UID, market: 'in', symbol: 'INFY' },
          { id: 'w2', user_id: UID, market: 'us', symbol: 'INFY' },
          { id: 'w3', user_id: OTHER, market: 'in', symbol: 'INFY' },
        ],
        price_alerts: [
          { id: 'a1', user_id: UID, market: 'in', symbol: 'INFY', condition: 'above', target: 1 },
          { id: 'a2', user_id: OTHER, market: 'in', symbol: 'INFY', condition: 'above', target: 1 },
        ],
      },
    });
    await applyWatchlistDiff(client, UID, 'in', fullDiff());
    expect(client.tables.watchlist_items.map((r) => r.id).sort()).toEqual(['w2', 'w3', expect.any(String)].sort());
    expect(client.tables.watchlist_items.find((r) => r.user_id === UID && r.market === 'in').symbol).toBe('TCS');
    expect(client.tables.price_alerts.map((r) => [r.user_id, r.symbol])).toEqual([
      [OTHER, 'INFY'],
      [UID, 'TCS'],
    ]);
  });

  test('re-setting an alert re-arms it', async () => {
    const client = createFakeSupabase({
      tables: {
        price_alerts: [
          { id: 'a1', user_id: UID, market: 'in', symbol: 'TCS', condition: 'above', target: 10, active: false, last_triggered_at: '2026-01-01T00:00:00Z' },
        ],
      },
    });
    const diff = { ...emptyWatchDiff(), upsertAlerts: [{ symbol: 'TCS', name: null, condition: 'above', target: 20 }] };
    await applyWatchlistDiff(client, UID, 'in', diff);
    expect(client.tables.price_alerts).toEqual([
      expect.objectContaining({ id: 'a1', target: 20, active: true, last_triggered_at: null }),
    ]);
  });

  test('mixed batches leave missing added_at to the DB default (defaultToNull: false)', async () => {
    const client = createFakeSupabase();
    const diff = { ...emptyWatchDiff(), insertItems: [{ symbol: 'A' }, { symbol: 'B', addedAt: '2026-01-01T00:00:00Z' }] };
    await applyWatchlistDiff(client, UID, 'us', diff);
    const [a, b] = client.calls[0].values;
    expect('added_at' in a).toBe(false);
    expect(b.added_at).toBe('2026-01-01T00:00:00Z');
    expect(client.calls[0].options.defaultToNull).toBe(false);
  });

  test('skips steps whose arrays are empty', async () => {
    const client = createFakeSupabase();
    await applyWatchlistDiff(client, UID, 'in', { ...emptyWatchDiff(), upsertAlerts: [{ symbol: 'X', condition: 'above', target: 1 }] });
    expect(client.calls.map((c) => [c.op, c.table])).toEqual([['upsert', 'price_alerts']]);
  });

  test('an empty diff makes no calls', async () => {
    const client = { from: vi.fn() };
    expect(await applyWatchlistDiff(client, UID, 'in', emptyWatchDiff())).toEqual({ error: null });
    expect(await applyWatchlistDiff(client, UID, 'in', undefined)).toEqual({ error: null });
    expect(client.from).not.toHaveBeenCalled();
  });

  test('an error in step 1 stops the later steps', async () => {
    const client = createFakeSupabase();
    client.failNext = true;
    const res = await applyWatchlistDiff(client, UID, 'in', fullDiff());
    expect(res).toEqual({ error: { message: 'boom' } });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].table).toBe('watchlist_items');
  });
});

// ---------------------------------------------------------------------------
describe('applyHoldingsDiff', () => {
  test('insert, update each, delete — expected calls', async () => {
    const client = createFakeSupabase({
      tables: {
        holdings: [
          { id: 'h2', user_id: UID, market: 'in', symbol: 'TCS', buy_price: 1, quantity: 1 },
          { id: 'h3', user_id: UID, market: 'in', symbol: 'INFY', buy_price: 1, quantity: 1 },
        ],
      },
    });
    const diff = {
      insert: [holding('h1')],
      update: [holding('h2', { quantity: 5 })],
      delete: ['h3'],
    };
    const res = await applyHoldingsDiff(client, UID, 'in', diff);
    expect(res).toEqual({ error: null });
    expect(client.calls.map((c) => [c.op, c.table])).toEqual([
      ['insert', 'holdings'],
      ['update', 'holdings'],
      ['delete', 'holdings'],
    ]);
    const [ins, upd, del] = client.calls;
    expect(ins.options).toEqual({ defaultToNull: false });
    expect(ins.values).toEqual([
      { id: 'h1', user_id: UID, market: 'in', symbol: 'TCS', name: 'TCS Ltd', buy_price: 3500, quantity: 2, buy_date: '2026-01-02' },
    ]);
    expect(upd.values).toEqual({ market: 'in', symbol: 'TCS', name: 'TCS Ltd', buy_price: 3500, quantity: 5, buy_date: '2026-01-02' });
    expect(upd.filters).toEqual([
      { type: 'eq', column: 'id', value: 'h2' },
      { type: 'eq', column: 'user_id', value: UID },
    ]);
    expect(del.filters).toEqual([
      { type: 'eq', column: 'user_id', value: UID },
      { type: 'in', column: 'id', value: ['h3'] },
    ]);
    expect(client.tables.holdings.map((r) => [r.id, r.quantity])).toEqual([
      ['h2', 5],
      ['h1', 2],
    ]);
  });

  test('one update call per updated holding', async () => {
    const client = createFakeSupabase();
    await applyHoldingsDiff(client, UID, 'us', { ...emptyHoldDiff(), update: [holding('a'), holding('b')] });
    expect(client.calls.map((c) => [c.op, c.filters[0].value])).toEqual([
      ['update', 'a'],
      ['update', 'b'],
    ]);
  });

  test('delete never touches another user', async () => {
    const client = createFakeSupabase({
      tables: { holdings: [{ id: 'h1', user_id: OTHER, market: 'in', symbol: 'X', buy_price: 1, quantity: 1 }] },
    });
    await applyHoldingsDiff(client, UID, 'in', { ...emptyHoldDiff(), delete: ['h1'] });
    expect(client.tables.holdings).toHaveLength(1);
  });

  test('an empty diff makes no calls', async () => {
    const client = { from: vi.fn() };
    expect(await applyHoldingsDiff(client, UID, 'in', emptyHoldDiff())).toEqual({ error: null });
    expect(client.from).not.toHaveBeenCalled();
  });

  test('an error in step 1 stops the later steps', async () => {
    const client = createFakeSupabase();
    client.failNext = true;
    const res = await applyHoldingsDiff(client, UID, 'in', { insert: [holding('h1')], update: [holding('h2')], delete: ['h3'] });
    expect(res).toEqual({ error: { message: 'boom' } });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].op).toBe('insert');
  });

  test('an error in one update stops the remaining updates and the delete', async () => {
    const client = createFakeSupabase();
    const from = client.from;
    let n = 0;
    client.from = (table) => {
      n += 1;
      if (n === 2) client.failNext = true; // insert ok, first update fails
      return from(table);
    };
    const diff = { insert: [holding('z')], update: [holding('a'), holding('b')], delete: ['c'] };
    const res = await applyHoldingsDiff(client, UID, 'in', diff);
    expect(res.error).toEqual({ message: 'boom' });
    expect(client.calls.map((c) => c.op)).toEqual(['insert', 'update']);
  });
});

// ---------------------------------------------------------------------------
describe('profile', () => {
  test('getProfile selects by id with maybeSingle', async () => {
    const client = createFakeSupabase({
      tables: { profiles: [{ id: UID, display_name: 'Nish' }, { id: OTHER, display_name: 'X' }] },
    });
    const res = await getProfile(client, UID);
    expect(res).toEqual({ data: { id: UID, display_name: 'Nish' }, error: null });
    expect(client.calls[0]).toMatchObject({
      table: 'profiles',
      op: 'select',
      single: 'maybeSingle',
      filters: [{ type: 'eq', column: 'id', value: UID }],
    });
  });

  test('getProfile returns data: null when there is no row', async () => {
    expect(await getProfile(createFakeSupabase(), UID)).toEqual({ data: null, error: null });
  });

  test('updateProfile sends only allowed keys and returns the updated row', async () => {
    const client = createFakeSupabase({ tables: { profiles: [{ id: UID, display_name: 'Old', email_alerts: true }] } });
    const res = await updateProfile(client, UID, {
      display_name: 'New',
      default_market: 'us',
      email_alerts: false,
      daily_digest: false,
      digest_market: 'us',
      imported_at: '2020-01-01T00:00:00Z',
      welcome_sent_at: '2020-01-01T00:00:00Z',
      id: 'hacker',
      created_at: 'x',
    });
    expect(res.error).toBeNull();
    const call = client.calls[0];
    expect(call.op).toBe('update');
    expect(call.values).toEqual({
      display_name: 'New',
      default_market: 'us',
      email_alerts: false,
      daily_digest: false,
      digest_market: 'us',
    });
    expect(call.filters).toEqual([{ type: 'eq', column: 'id', value: UID }]);
    expect(res.data).toMatchObject({ id: UID, display_name: 'New', email_alerts: false });
  });

  test('updateProfile with no allowed keys makes no call', async () => {
    const client = { from: vi.fn() };
    expect(await updateProfile(client, UID, { imported_at: 'x', id: 'y' })).toEqual({ data: null, error: null });
    expect(client.from).not.toHaveBeenCalled();
  });

  test('markImported sets imported_at to an ISO string for this user only', async () => {
    const client = createFakeSupabase({ tables: { profiles: [{ id: UID, imported_at: null }, { id: OTHER, imported_at: null }] } });
    const res = await markImported(client, UID);
    expect(res.error).toBeNull();
    expect(client.calls[0]).toMatchObject({ table: 'profiles', op: 'update', filters: [{ type: 'eq', column: 'id', value: UID }] });
    const at = client.tables.profiles[0].imported_at;
    expect(new Date(at).toISOString()).toBe(at);
    expect(client.tables.profiles[1].imported_at).toBeNull();
  });

  test('markImported surfaces errors', async () => {
    const client = createFakeSupabase();
    client.failNext = true;
    expect((await markImported(client, UID)).error).toEqual({ message: 'boom' });
  });
});

// ---------------------------------------------------------------------------
describe('importLocal', () => {
  const H1 = '11111111-1111-4111-8111-111111111111';
  const HUS = '22222222-2222-4222-8222-222222222222';
  const UUID = /^[0-9a-f-]{36}$/i;
  const local = () => ({
    in: {
      watchlist: [
        { symbol: 'TCS', name: 'TCS Ltd', alertHigh: 4000, alertLow: '3000', addedAt: '2026-01-01T00:00:00Z' },
        { symbol: 'TCS', name: 'dup', alertHigh: 1, alertLow: null },
        { symbol: 'INFY', name: 'Infosys', alertHigh: -5, alertLow: 0 }, // no valid alerts
      ],
      holdings: [holding(H1), holding(H1, { quantity: 99 }), holding('demo', { isDemo: true })],
    },
    us: {
      watchlist: [{ symbol: 'TCS', name: 'TCS (US)', alertHigh: null, alertLow: 5, addedAt: '2026-01-02T00:00:00Z' }],
      holdings: [holding(undefined, { symbol: 'AAPL' })],
    },
  });

  const newClient = () => createFakeSupabase({ tables: { profiles: [{ id: UID, imported_at: null }] } });

  test('counts what was sent: dedupes per market, merges alerts, skips demo', async () => {
    const client = newClient();
    const res = await importLocal(client, UID, local());
    expect(res.error).toBeNull();
    // watchlist: in TCS, in INFY, us TCS = 3; holdings: h1 + generated = 2;
    // alerts: in TCS above+below, us TCS below = 3
    expect(res.counts).toEqual({ watchlist: 3, holdings: 2, alerts: 3 });
  });

  test('uses the unique-constraint keys and sets imported_at last', async () => {
    const client = newClient();
    await importLocal(client, UID, local());
    expect(client.calls.map((c) => [c.op, c.table, c.options])).toEqual([
      ['upsert', 'watchlist_items', { onConflict: 'user_id,market,symbol', defaultToNull: false }],
      ['upsert', 'price_alerts', { onConflict: 'user_id,market,symbol,condition', defaultToNull: false }],
      ['select', 'holdings', undefined],
      ['upsert', 'holdings', { onConflict: 'id', defaultToNull: false }],
      ['update', 'profiles', undefined],
    ]);
    // Which of the guest's UUID ids does this user already own?
    expect(client.calls[2].filters).toEqual([
      { type: 'eq', column: 'user_id', value: UID },
      { type: 'in', column: 'id', value: [H1] },
    ]);
    expect(client.calls[4].filters).toEqual([{ type: 'eq', column: 'id', value: UID }]);
    const alerts = client.calls[1].values;
    expect(alerts).toEqual([
      { user_id: UID, market: 'in', symbol: 'TCS', name: 'TCS Ltd', condition: 'above', target: 4000, active: true, last_triggered_at: null },
      { user_id: UID, market: 'in', symbol: 'TCS', name: 'TCS Ltd', condition: 'below', target: 3000, active: true, last_triggered_at: null },
      { user_id: UID, market: 'us', symbol: 'TCS', name: 'TCS (US)', condition: 'below', target: 5, active: true, last_triggered_at: null },
    ]);
    const holdings = client.calls[3].values;
    // H1 isn't owned by this user yet, so it gets an id derived from (user, H1).
    expect(holdings.map((h) => h.id)).toEqual([expect.stringMatching(UUID), expect.stringMatching(UUID)]);
    expect(holdings[0].id).not.toBe(H1);
    expect(holdings[0].quantity).toBe(2); // first occurrence wins
    expect(holdings.some((h) => h.id === 'demo')).toBe(false);
    const at = client.tables.profiles[0].imported_at;
    expect(new Date(at).toISOString()).toBe(at);
  });

  test('is idempotent: calling twice leaves no duplicates', async () => {
    const client = newClient();
    const data = local();
    data.us.holdings[0].id = HUS; // id-less holdings get a fresh UUID each call
    await importLocal(client, UID, data);
    const res = await importLocal(client, UID, data);
    expect(res.error).toBeNull();
    expect(client.tables.watchlist_items).toHaveLength(3);
    expect(client.tables.price_alerts).toHaveLength(3);
    expect(client.tables.holdings).toHaveLength(2);
  });

  test('keeps holding ids this user already owns (re-import updates them in place)', async () => {
    const client = createFakeSupabase({
      tables: {
        profiles: [{ id: UID, imported_at: null }],
        holdings: [{ id: H1, user_id: UID, market: 'in', symbol: 'TCS', name: 'TCS Ltd', buy_price: 3500, quantity: 2, buy_date: null }],
      },
    });
    const res = await importLocal(client, UID, { in: { holdings: [holding(H1, { quantity: 7 })] } });
    expect(res.error).toBeNull();
    expect(client.tables.holdings).toHaveLength(1);
    expect(client.tables.holdings[0]).toMatchObject({ id: H1, user_id: UID, quantity: 7 });
  });

  test("a holding id another account owns gets a new id: no error, the other user's row untouched", async () => {
    // The fake has no RLS; a row with the same id owned by 'A' stands in for the row
    // user A created when they imported this same guest data earlier.
    const aRow = { id: H1, user_id: 'A', market: 'in', symbol: 'TCS', name: 'TCS Ltd', buy_price: 3500, quantity: 2, buy_date: '2026-01-02' };
    const client = createFakeSupabase({
      tables: { profiles: [{ id: 'A', imported_at: null }, { id: 'B', imported_at: null }], holdings: [{ ...aRow }] },
    });
    const data = { in: { holdings: [holding(H1, { quantity: 5 })] } };

    const res = await importLocal(client, 'B', data);
    expect(res.error).toBeNull();
    expect(client.tables.holdings.find((r) => r.user_id === 'A')).toEqual(aRow);
    const bRows = client.tables.holdings.filter((r) => r.user_id === 'B');
    expect(bRows).toHaveLength(1);
    expect(bRows[0].id).toMatch(UUID);
    expect(bRows[0].id).not.toBe(H1);
    expect(bRows[0].quantity).toBe(5);

    // B re-importing is still idempotent (the new id is derived, not random).
    expect((await importLocal(client, 'B', data)).error).toBeNull();
    expect(client.tables.holdings.filter((r) => r.user_id === 'B')).toHaveLength(1);
    expect(client.tables.holdings.find((r) => r.user_id === 'A')).toEqual(aRow);
  });

  test('user A imports, then user B imports the same local data: disjoint rows, no error', async () => {
    const client = createFakeSupabase({
      tables: { profiles: [{ id: 'A', imported_at: null }, { id: 'B', imported_at: null }] },
    });
    const data = local();
    data.us.holdings[0].id = HUS;
    expect((await importLocal(client, 'A', data)).error).toBeNull();
    const aRows = client.tables.holdings.filter((r) => r.user_id === 'A').map((r) => ({ ...r }));
    expect(aRows).toHaveLength(2);

    expect((await importLocal(client, 'B', data)).error).toBeNull();
    expect(client.tables.holdings.filter((r) => r.user_id === 'A')).toEqual(aRows);
    const bIds = client.tables.holdings.filter((r) => r.user_id === 'B').map((r) => r.id);
    expect(bIds).toHaveLength(2);
    expect(bIds.some((id) => aRows.some((r) => r.id === id))).toBe(false);
  });

  test('regenerates non-UUID holding ids (the column is uuid)', async () => {
    const client = newClient();
    await importLocal(client, UID, { in: { holdings: [holding('1712345678'), holding(12345)] } });
    const ids = client.calls[0].values.map((h) => h.id);
    expect(ids).toEqual([expect.stringMatching(UUID), expect.stringMatching(UUID)]);
    expect(ids[0]).not.toBe(ids[1]);
  });

  test('skips empty tables and still marks imported', async () => {
    const client = newClient();
    const res = await importLocal(client, UID, {
      in: { watchlist: [{ symbol: 'X' }], holdings: [holding('d', { isDemo: true })] },
    });
    expect(res).toEqual({ counts: { watchlist: 1, holdings: 0, alerts: 0 }, error: null });
    expect(client.calls.map((c) => c.table)).toEqual(['watchlist_items', 'profiles']);
  });

  test('an error stops the import before imported_at is set', async () => {
    const client = newClient();
    client.failNext = true;
    const res = await importLocal(client, UID, local());
    expect(res.error).toEqual({ message: 'boom' });
    expect(client.calls).toHaveLength(1);
    expect(client.tables.profiles[0].imported_at).toBeNull();
  });
});

describe('importLocal skips holdings the database would reject', () => {
  test('drops holdings with no symbol or non-positive quantity/price instead of failing', async () => {
    const client = createFakeSupabase({ session: { user: { id: UID } }, tables: { profiles: [{ id: UID }] } });
    const good = '5f2b8a0e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
    const local = {
      in: {
        watchlist: [],
        holdings: [
          { id: good, symbol: 'TCS.NS', name: 'TCS', quantity: 2, buyPrice: 3500, buyDate: '2024-01-02' },
          { id: 'no-symbol', quantity: 1, buyPrice: 10 },
          { id: 'zero-qty', symbol: 'INFY.NS', quantity: 0, buyPrice: 10 },
          { id: 'neg-price', symbol: 'WIPRO.NS', quantity: 1, buyPrice: -5 },
        ],
      },
      us: { watchlist: [], holdings: [] },
    };
    const { counts, error } = await importLocal(client, UID, local);
    expect(error).toBeNull();
    expect(counts.holdings).toBe(1);
    expect(client.tables.holdings.map((h) => h.symbol)).toEqual(['TCS.NS']);
  });
});
