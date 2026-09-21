import { createFakeSupabase } from './fakeSupabase';

function seed() {
  return createFakeSupabase({
    tables: {
      watchlist_items: [
        { id: 'w1', user_id: 'u1', market: 'in', symbol: 'TCS', name: 'TCS' },
        { id: 'w2', user_id: 'u1', market: 'us', symbol: 'AAPL', name: 'Apple' },
        { id: 'w3', user_id: 'u2', market: 'in', symbol: 'TCS', name: 'TCS' },
        { id: 'w4', user_id: 'u1', market: 'in', symbol: 'INFY', name: 'Infosys' },
      ],
    },
  });
}

describe('auth', () => {
  test('getSession returns the seeded session and _emit notifies subscribers', async () => {
    const session = { user: { id: 'u1', email: 'a@b.c' } };
    const client = createFakeSupabase({ session });
    const { data } = await client.auth.getSession();
    expect(data.session).toBe(session);

    const cb = vi.fn();
    const { data: sub } = client.auth.onAuthStateChange(cb);
    client.auth._emit('SIGNED_OUT', null);
    expect(cb).toHaveBeenCalledWith('SIGNED_OUT', null);
    expect((await client.auth.getSession()).data.session).toBeNull();

    sub.subscription.unsubscribe();
    client.auth._emit('SIGNED_IN', session);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('auth methods are mocks resolving { data, error: null }', async () => {
    const client = createFakeSupabase();
    await expect(client.auth.signInWithPassword({ email: 'x', password: 'y' })).resolves.toEqual({ data: {}, error: null });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'x', password: 'y' });
  });
});

describe('signOut and requireSession', () => {
  const session = { user: { id: 'u1', email: 'a@b.c' } };

  test('signOut clears the session, then emits SIGNED_OUT (as supabase-js does)', async () => {
    const client = createFakeSupabase({ session });
    let seenDuringEmit;
    client.auth.onAuthStateChange(async (evt, s) => {
      seenDuringEmit = { evt, s, current: (await client.auth.getSession()).data.session };
    });
    await expect(client.auth.signOut()).resolves.toEqual({ error: null });
    await Promise.resolve();
    expect(seenDuringEmit).toEqual({ evt: 'SIGNED_OUT', s: null, current: null });
    expect((await client.auth.getSession()).data.session).toBeNull();
  });

  test('requireSession: writes without a session fail with 42501; reads and signed-in writes work', async () => {
    const client = createFakeSupabase({ session, requireSession: true, tables: { holdings: [] } });
    const row = { id: 'h1', user_id: 'u1', market: 'in', symbol: 'X', quantity: 1, buy_price: 1 };
    expect((await client.from('holdings').insert(row)).error).toBeNull();

    await client.auth.signOut();
    const { data, error } = await client.from('holdings').update({ quantity: 2 }).eq('id', 'h1');
    expect(data).toBeNull();
    expect(error).toEqual({ code: '42501', message: 'new row violates row-level security policy' });
    expect(client.tables.holdings[0].quantity).toBe(1);
    expect((await client.from('holdings').select('*')).error).toBeNull();
  });

  test('requireSession is off by default: writes work with no session', async () => {
    const client = createFakeSupabase();
    expect((await client.from('holdings').insert({ id: 'h1', user_id: 'u1', market: 'in', symbol: 'X', quantity: 1, buy_price: 1 })).error).toBeNull();
  });
});

describe('query builder', () => {
  test('select with chained eq filters', async () => {
    const client = seed();
    const { data, error } = await client.from('watchlist_items').select('*').eq('user_id', 'u1').eq('market', 'in');
    expect(error).toBeNull();
    expect(data.map((r) => r.id)).toEqual(['w1', 'w4']);
  });

  test('select with in filter, single and maybeSingle', async () => {
    const client = seed();
    const res = await client.from('watchlist_items').select().in('symbol', ['AAPL', 'INFY']);
    expect(res.data.map((r) => r.id)).toEqual(['w2', 'w4']);

    const one = await client.from('watchlist_items').select().eq('id', 'w2').single();
    expect(one).toEqual({ data: expect.objectContaining({ symbol: 'AAPL' }), error: null });

    const none = await client.from('watchlist_items').select().eq('id', 'nope').maybeSingle();
    expect(none).toEqual({ data: null, error: null });

    const many = await client.from('watchlist_items').select().eq('symbol', 'TCS').single();
    expect(many.data).toBeNull();
    expect(many.error).toBeTruthy();
  });

  test('unknown table is empty', async () => {
    const client = createFakeSupabase();
    expect(await client.from('holdings').select()).toEqual({ data: [], error: null });
  });

  test('insert adds rows; data is null unless .select() is chained', async () => {
    const client = seed();
    const plain = await client.from('watchlist_items').insert({ user_id: 'u1', market: 'us', symbol: 'MSFT' });
    expect(plain).toEqual({ data: null, error: null });

    const withSelect = await client
      .from('watchlist_items')
      .insert([{ id: 'w9', user_id: 'u1', market: 'us', symbol: 'NVDA' }])
      .select();
    // columns absent from the payload take their DEFAULT (added_at = now), as in Postgres
    expect(withSelect.data).toEqual([{ id: 'w9', user_id: 'u1', market: 'us', symbol: 'NVDA', added_at: expect.any(String) }]);

    const rows = client.tables.watchlist_items;
    expect(rows).toHaveLength(6);
    expect(rows.find((r) => r.symbol === 'MSFT').id).toEqual(expect.any(String));
  });

  test('insert with a duplicate id fails without changing the table', async () => {
    const client = seed();
    const { data, error } = await client.from('watchlist_items').insert({ id: 'w1', user_id: 'u9', market: 'in', symbol: 'X' });
    expect(data).toBeNull();
    expect(error.code).toBe('23505');
    expect(client.tables.watchlist_items).toHaveLength(4);
  });

  test('upsert with onConflict merges into the existing row and inserts new ones', async () => {
    const client = seed();
    const { data, error } = await client
      .from('watchlist_items')
      .upsert(
        [
          { user_id: 'u1', market: 'in', symbol: 'TCS', name: 'Tata Consultancy' },
          { user_id: 'u1', market: 'in', symbol: 'HDFC', name: 'HDFC Bank' },
        ],
        { onConflict: 'user_id,market,symbol' },
      )
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ id: 'w1', user_id: 'u1', market: 'in', symbol: 'TCS', name: 'Tata Consultancy' });

    const rows = client.tables.watchlist_items;
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.id === 'w1').name).toBe('Tata Consultancy');
    expect(rows.find((r) => r.id === 'w3').name).toBe('TCS'); // other user's row untouched
  });

  test('upsert defaults to conflict on id', async () => {
    const client = seed();
    await client.from('watchlist_items').upsert({ id: 'w2', name: 'Apple Inc.' });
    expect(client.tables.watchlist_items).toHaveLength(4);
    expect(client.tables.watchlist_items.find((r) => r.id === 'w2')).toMatchObject({ symbol: 'AAPL', name: 'Apple Inc.' });
  });

  test('update + eq patches only matching rows', async () => {
    const client = seed();
    const { data } = await client.from('watchlist_items').update({ name: 'Renamed' }).eq('user_id', 'u1').eq('market', 'in').select();
    expect(data.map((r) => r.id)).toEqual(['w1', 'w4']);
    const names = Object.fromEntries(client.tables.watchlist_items.map((r) => [r.id, r.name]));
    expect(names).toEqual({ w1: 'Renamed', w2: 'Apple', w3: 'TCS', w4: 'Renamed' });
  });

  test('delete + eq + in removes only matching rows', async () => {
    const client = seed();
    const { data, error } = await client.from('watchlist_items').delete().eq('user_id', 'u1').in('symbol', ['TCS', 'AAPL']);
    expect({ data, error }).toEqual({ data: null, error: null });
    expect(client.tables.watchlist_items.map((r) => r.id)).toEqual(['w3', 'w4']);
  });

  test('failNext fails exactly one operation and leaves tables unchanged', async () => {
    const client = seed();
    client.failNext = true;
    const failed = await client.from('watchlist_items').delete().eq('id', 'w1');
    expect(failed).toEqual({ data: null, error: { message: 'boom' } });
    expect(client.failNext).toBe(false);
    expect(client.tables.watchlist_items).toHaveLength(4);

    const ok = await client.from('watchlist_items').delete().eq('id', 'w1');
    expect(ok.error).toBeNull();
    expect(client.tables.watchlist_items).toHaveLength(3);
  });

  test('calls records every executed query', async () => {
    const client = seed();
    await client.from('watchlist_items').select().eq('user_id', 'u1');
    await client.from('price_alerts').upsert([{ symbol: 'TCS', condition: 'above' }], { onConflict: 'user_id,market,symbol,condition' });
    await client.from('holdings').delete().in('id', ['h1', 'h2']);
    await client.from('holdings').update({ quantity: 2 }).eq('id', 'h3');

    expect(client.calls).toEqual([
      { table: 'watchlist_items', op: 'select', values: undefined, options: undefined, filters: [{ type: 'eq', column: 'user_id', value: 'u1' }], returning: true, single: null },
      {
        table: 'price_alerts',
        op: 'upsert',
        values: [{ symbol: 'TCS', condition: 'above' }],
        options: { onConflict: 'user_id,market,symbol,condition' },
        filters: [],
        returning: false,
        single: null,
      },
      { table: 'holdings', op: 'delete', values: undefined, options: undefined, filters: [{ type: 'in', column: 'id', value: ['h1', 'h2'] }], returning: false, single: null },
      { table: 'holdings', op: 'update', values: { quantity: 2 }, options: undefined, filters: [{ type: 'eq', column: 'id', value: 'h3' }], returning: false, single: null },
    ]);
  });

  test('a builder only executes once even if awaited twice', async () => {
    const client = seed();
    const q = client.from('watchlist_items').insert({ user_id: 'u1', market: 'in', symbol: 'ONCE' });
    await q;
    await q;
    expect(client.tables.watchlist_items.filter((r) => r.symbol === 'ONCE')).toHaveLength(1);
    expect(client.calls).toHaveLength(1);
  });
});

describe('constraints', () => {
  const W = (symbol, extra = {}) => ({ user_id: 'u1', market: 'in', symbol, ...extra });

  test('upsert onConflict must name id or a unique key of the table (42P10)', async () => {
    const client = seed();
    const bad = await client.from('watchlist_items').upsert([W('X')], { onConflict: 'symbol' });
    expect(bad.data).toBeNull();
    expect(bad.error.code).toBe('42P10');
    const holdings = await client.from('holdings').upsert([{ id: 'h1' }], { onConflict: 'user_id,market,symbol' });
    expect(holdings.error.code).toBe('42P10');
    expect(client.tables.watchlist_items).toHaveLength(4);

    // column order and spacing don't matter; id is always a valid target
    expect((await client.from('watchlist_items').upsert([W('X')], { onConflict: 'symbol, user_id,market' })).error).toBeNull();
    expect((await client.from('watchlist_items').upsert({ id: 'w1', name: 'x' }, { onConflict: 'id' })).error).toBeNull();
    const alerts = await client
      .from('price_alerts')
      .upsert([{ user_id: 'u1', market: 'in', symbol: 'TCS', condition: 'above', target: 1 }], { onConflict: 'user_id,market,symbol,condition' });
    expect(alerts.error).toBeNull();
  });

  test('insert colliding with an existing row on a unique key fails with 23505', async () => {
    const client = seed();
    const res = await client.from('watchlist_items').insert([W('NEW'), W('TCS')]);
    expect(res).toEqual({ data: null, error: expect.objectContaining({ code: '23505' }) });
    expect(client.tables.watchlist_items).toHaveLength(4); // NEW not inserted either
  });

  test('insert colliding within the same batch fails with 23505', async () => {
    const client = seed();
    const res = await client.from('watchlist_items').insert([W('NEW', { name: 'a' }), W('NEW', { name: 'b' })]);
    expect(res.error.code).toBe('23505');
    expect(client.tables.watchlist_items).toHaveLength(4);
  });

  test('the same symbol for another user or market is not a collision', async () => {
    const client = seed();
    const res = await client.from('watchlist_items').insert([W('TCS', { user_id: 'u3' }), W('TCS', { market: 'us' })]);
    expect(res.error).toBeNull();
    expect(client.tables.watchlist_items).toHaveLength(6);
  });

  test('an upsert whose new row collides on another unique key fails with 23505', async () => {
    const client = seed();
    const res = await client.from('watchlist_items').upsert([{ id: 'w99', ...W('TCS') }], { onConflict: 'id' });
    expect(res.error.code).toBe('23505');
    expect(client.tables.watchlist_items).toHaveLength(4);
  });

  test('update and delete without a filter fail with 21000', async () => {
    const client = seed();
    const del = await client.from('watchlist_items').delete();
    expect(del).toEqual({ data: null, error: expect.objectContaining({ code: '21000', message: 'DELETE requires a WHERE clause' }) });
    const upd = await client.from('watchlist_items').update({ name: 'x' });
    expect(upd).toEqual({ data: null, error: expect.objectContaining({ code: '21000', message: 'UPDATE requires a WHERE clause' }) });
    expect(client.tables.watchlist_items.map((r) => r.name)).toEqual(['TCS', 'Apple', 'TCS', 'Infosys']);
  });

  test('update that sets a unique key to a taken value fails with 23505', async () => {
    const client = seed();
    const res = await client.from('watchlist_items').update({ symbol: 'TCS' }).eq('id', 'w4');
    expect(res.error.code).toBe('23505');
    expect(client.tables.watchlist_items.find((r) => r.id === 'w4').symbol).toBe('INFY');
  });

  test('NOT NULL columns: a missing value on insert or a null on update fails with 23502', async () => {
    const client = seed();
    const ins = await client.from('watchlist_items').insert({ user_id: 'u1', market: 'in' });
    expect(ins.error).toEqual(expect.objectContaining({ code: '23502' }));
    expect(ins.error.message).toMatch(/symbol/);
    const upd = await client.from('watchlist_items').update({ market: null }).eq('id', 'w1');
    expect(upd.error.code).toBe('23502');
    expect(client.tables.watchlist_items).toHaveLength(4);
    expect(client.tables.watchlist_items[0].market).toBe('in');
  });

  test('unknown tables have no constraints beyond a unique id', async () => {
    const client = createFakeSupabase();
    expect((await client.from('misc').insert({ a: 1 })).error).toBeNull();
    expect((await client.from('misc').insert([{ id: 'x' }, { id: 'x' }])).error.code).toBe('23505');
  });
});

describe('array payloads and defaultToNull', () => {
  test('by default, keys missing from some rows are sent as null (union of keys)', async () => {
    const client = createFakeSupabase();
    const { data, error } = await client
      .from('watchlist_items')
      .insert([
        { user_id: 'u1', market: 'in', symbol: 'A', name: 'Alpha' },
        { user_id: 'u1', market: 'in', symbol: 'B' },
      ])
      .select();
    expect(error).toBeNull();
    expect(data[1].name).toBeNull();
    expect('name' in data[1]).toBe(true);
  });

  test('by default, a NOT NULL column missing from some rows fails with 23502 even if it has a DEFAULT', async () => {
    const client = createFakeSupabase();
    const res = await client.from('watchlist_items').upsert(
      [
        { user_id: 'u1', market: 'in', symbol: 'A', added_at: '2026-01-01T00:00:00Z' },
        { user_id: 'u1', market: 'in', symbol: 'B' },
      ],
      { onConflict: 'user_id,market,symbol' },
    );
    expect(res.error.code).toBe('23502');
    expect(res.error.message).toMatch(/added_at/);
    expect(client.tables.watchlist_items).toHaveLength(0);
  });

  test('defaultToNull: false fills missing keys with the column DEFAULT instead', async () => {
    const client = createFakeSupabase();
    const { data, error } = await client
      .from('watchlist_items')
      .upsert(
        [
          { user_id: 'u1', market: 'in', symbol: 'A', added_at: '2026-01-01T00:00:00Z' },
          { user_id: 'u1', market: 'in', symbol: 'B' },
        ],
        { onConflict: 'user_id,market,symbol', defaultToNull: false },
      )
      .select();
    expect(error).toBeNull();
    expect(data[0].added_at).toBe('2026-01-01T00:00:00Z');
    expect(new Date(data[1].added_at).toISOString()).toBe(data[1].added_at);
    expect(data[1].name).toBeUndefined(); // no DEFAULT and not in the payload: left out, like SQL NULL
  });

  test('per-table defaults for price_alerts, holdings and profiles', async () => {
    const client = createFakeSupabase();
    const BULK = { defaultToNull: false };
    const alert = await client
      .from('price_alerts')
      .insert([{ user_id: 'u1', market: 'in', symbol: 'A', condition: 'above', target: 1 }], BULK)
      .select()
      .single();
    expect(alert.data).toMatchObject({ active: true, last_triggered_at: null, created_at: expect.any(String) });

    const holding = await client
      .from('holdings')
      .insert([{ user_id: 'u1', market: 'in', symbol: 'A', quantity: 1, buy_price: 2 }], BULK)
      .select()
      .single();
    expect(holding.data.created_at).toEqual(expect.any(String));

    const profile = await client.from('profiles').insert([{ id: 'u1' }], BULK).select().single();
    expect(profile.data).toMatchObject({ default_market: 'in', email_alerts: true, daily_digest: true, digest_market: 'in' });
  });

  test('an upsert that hits an existing row only overwrites the payload columns', async () => {
    const client = createFakeSupabase({
      tables: { watchlist_items: [{ id: 'w1', user_id: 'u1', market: 'in', symbol: 'A', name: 'Old', added_at: '2020-01-01T00:00:00Z' }] },
    });
    await client
      .from('watchlist_items')
      .upsert([{ user_id: 'u1', market: 'in', symbol: 'A', name: 'New' }], { onConflict: 'user_id,market,symbol', defaultToNull: false });
    expect(client.tables.watchlist_items).toEqual([
      { id: 'w1', user_id: 'u1', market: 'in', symbol: 'A', name: 'New', added_at: '2020-01-01T00:00:00Z' },
    ]);
  });
});
