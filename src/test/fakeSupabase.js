// In-memory stand-in for a supabase-js v2 client, for tests only.
//
// from(table) mimics the PostgREST query builder: every method returns the builder,
// nothing runs until it is awaited, and awaiting resolves { data, error }.
// Like the real client, insert/upsert/update/delete resolve data: null unless
// .select() is chained, in which case data is the affected rows.
//
// Writes are checked the way Postgres + PostgREST would check them (schema from
// supabase/migrations/20260921000000_init.sql), so a test can't pass on a query the
// real database would reject:
//   - unique keys: `id` plus UNIQUE below. Collisions fail with 23505; an upsert
//     onConflict that is neither `id` nor a unique key fails with 42P10.
//   - NOT NULL below: fails with 23502.
//   - update/delete with no filter fail with 21000 (Supabase's safeupdate).
//   - array payloads: every row gets the union of keys; keys a row lacks are null,
//     or the column DEFAULT with { defaultToNull: false }. Columns outside the
//     payload take their DEFAULT on insert and are left alone on conflict-update.
// A failed write leaves the table unchanged.
//
// Auth: auth.signOut() clears the session and then emits SIGNED_OUT, like supabase-js,
// so anything that reacts to SIGNED_OUT already runs without a session. With
// { requireSession: true } (off by default; also settable as client.requireSession)
// writes made while there is no session fail the way RLS rejects an anonymous write
// (42501); reads still succeed (RLS would just return no rows, which tests don't need).
import { vi } from 'vitest';

const ok = (data) => ({ data, error: null });
const fail = (error) => ({ data: null, error });
const clone = (rows) => rows.map((r) => ({ ...r }));
let nextId = 1;

const now = () => new Date().toISOString();
const UNIQUE = {
  watchlist_items: ['user_id,market,symbol'],
  price_alerts: ['user_id,market,symbol,condition'],
};
const NOT_NULL = {
  profiles: ['id', 'default_market', 'email_alerts', 'daily_digest', 'digest_market', 'created_at'],
  watchlist_items: ['id', 'user_id', 'market', 'symbol', 'added_at'],
  holdings: ['id', 'user_id', 'market', 'symbol', 'quantity', 'buy_price', 'created_at'],
  price_alerts: ['id', 'user_id', 'market', 'symbol', 'condition', 'target', 'active', 'created_at'],
};
const DEFAULTS = {
  profiles: { default_market: 'in', email_alerts: true, daily_digest: true, digest_market: 'in', created_at: now },
  watchlist_items: { added_at: now },
  holdings: { created_at: now },
  price_alerts: { active: true, last_triggered_at: null, created_at: now },
};

export function createFakeSupabase({ session = null, tables = {}, requireSession = false } = {}) {
  const listeners = new Set();
  let currentSession = session;
  const authFn = () => vi.fn(async () => ({ data: {}, error: null }));

  const client = {
    tables,
    calls: [],
    failNext: false,
    requireSession,
    hasSession: () => !!currentSession,
    auth: {
      getSession: vi.fn(async () => ({ data: { session: currentSession }, error: null })),
      onAuthStateChange: vi.fn((cb) => {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      }),
      signInWithPassword: authFn(),
      signUp: authFn(),
      signInWithOAuth: authFn(),
      resetPasswordForEmail: authFn(),
      updateUser: authFn(),
      signOut: vi.fn(async () => {
        client.auth._emit('SIGNED_OUT', null);
        return { error: null };
      }),
      _emit(event, s) {
        currentSession = s;
        listeners.forEach((cb) => cb(event, s));
      },
    },
    from: (table) => createBuilder(client, table),
  };
  return client;
}

function createBuilder(client, table) {
  const q = { op: null, values: undefined, options: undefined, filters: [], returning: false, single: null };
  let promise = null;
  const setOp = (op, values, options) => {
    q.op = op;
    q.values = values;
    q.options = options;
    return builder;
  };

  const builder = {
    select() {
      if (q.op) q.returning = true; // .select() after a mutation: return affected rows
      else setOp('select');
      return builder;
    },
    insert: (rows, options) => setOp('insert', rows, options),
    upsert: (rows, options) => setOp('upsert', rows, options),
    update: (patch, options) => setOp('update', patch, options),
    delete: (options) => setOp('delete', undefined, options),
    eq(column, value) {
      q.filters.push({ type: 'eq', column, value });
      return builder;
    },
    in(column, value) {
      q.filters.push({ type: 'in', column, value });
      return builder;
    },
    single() {
      q.single = 'single';
      return builder;
    },
    maybeSingle() {
      q.single = 'maybeSingle';
      return builder;
    },
    then(resolve, reject) {
      promise ||= Promise.resolve().then(() => run(client, table, q));
      return promise.then(resolve, reject);
    },
  };
  return builder;
}

function matches(row, filters) {
  return filters.every((f) => (f.type === 'eq' ? row[f.column] === f.value : f.value.includes(row[f.column])));
}

const cols = (spec) => spec.split(',').map((c) => c.trim()).filter(Boolean);
const sameCols = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const uniqueKeys = (table) => [['id'], ...(UNIQUE[table] || []).map(cols)];

/** The column DEFAULT (null when the column has none). */
function defaultOf(table, column) {
  const d = DEFAULTS[table]?.[column];
  return typeof d === 'function' ? d() : (d ?? null);
}

/**
 * Shape a write payload like PostgREST: every row carries the union of keys, missing
 * ones set to null, or to the column DEFAULT with defaultToNull: false.
 */
function shapePayload(table, values, options) {
  const input = [].concat(values);
  const union = [...new Set(input.flatMap((r) => Object.keys(r)))];
  const toNull = options?.defaultToNull !== false;
  return input.map((r) => {
    const row = { ...r };
    for (const c of union) if (!(c in row)) row[c] = toNull ? null : defaultOf(table, c);
    return row;
  });
}

/** A new row: payload plus DEFAULTs for columns the payload doesn't mention. */
function newRow(table, payload) {
  const row = { id: `fake-${nextId++}`, ...payload };
  for (const c of Object.keys(DEFAULTS[table] || {})) if (!(c in row)) row[c] = defaultOf(table, c);
  return row;
}

/** Check NOT NULL for the given columns of each row; returns an error or null. */
function notNullError(table, rows, columnsOf) {
  const required = NOT_NULL[table] || [];
  for (const row of rows) {
    for (const c of columnsOf(row)) {
      if (required.includes(c) && (row[c] === null || row[c] === undefined)) {
        return { code: '23502', message: `null value in column "${c}" of relation "${table}" violates not-null constraint` };
      }
    }
  }
  return null;
}

/** Check every unique key over the would-be table; NULLs never collide (as in SQL). */
function uniqueError(table, rows) {
  for (const key of uniqueKeys(table)) {
    const seen = new Set();
    for (const row of rows) {
      if (key.some((c) => row[c] === null || row[c] === undefined)) continue;
      const k = JSON.stringify(key.map((c) => row[c]));
      if (seen.has(k)) {
        return { code: '23505', message: `duplicate key value violates unique constraint on ${table} (${key.join(', ')})` };
      }
      seen.add(k);
    }
  }
  return null;
}

/**
 * Validate a planned write, then apply it in place (callers may hold the array or rows).
 * plan: { inserts: rows to append, patches: [[existingRow, patch]], removes: rows }.
 */
function commit(table, rows, { inserts = [], patches = [], removes = [] }) {
  const patched = new Map(patches.map(([row, patch]) => [row, { ...row, ...patch }]));
  const err =
    notNullError(table, inserts, (r) => [...new Set([...(NOT_NULL[table] || []), ...Object.keys(r)])]) ||
    notNullError(table, patches.map(([, p]) => p), (p) => Object.keys(p)) ||
    uniqueError(table, [...rows.filter((r) => !removes.includes(r)).map((r) => patched.get(r) || r), ...inserts]);
  if (err) return err;
  for (const [row, patch] of patches) Object.assign(row, patch);
  for (let i = rows.length - 1; i >= 0; i--) if (removes.includes(rows[i])) rows.splice(i, 1);
  rows.push(...inserts);
  return null;
}

function run(client, table, q) {
  const op = q.op || 'select';
  client.calls.push({
    table,
    op,
    values: q.values,
    options: q.options,
    filters: q.filters,
    returning: op === 'select' || q.returning,
    single: q.single,
  });
  if (client.failNext) {
    client.failNext = false;
    return fail({ message: 'boom' });
  }
  if (client.requireSession && op !== 'select' && !client.hasSession()) {
    return fail({ code: '42501', message: 'new row violates row-level security policy' });
  }

  const rows = (client.tables[table] ||= []);
  if ((op === 'update' || op === 'delete') && q.filters.length === 0) {
    return fail({ code: '21000', message: `${op.toUpperCase()} requires a WHERE clause` });
  }
  let affected;
  let err = null;

  if (op === 'select') {
    affected = rows.filter((r) => matches(r, q.filters));
  } else if (op === 'insert') {
    affected = shapePayload(table, q.values, q.options).map((r) => newRow(table, r));
    err = commit(table, rows, { inserts: affected });
  } else if (op === 'upsert') {
    const keys = cols(q.options?.onConflict || 'id');
    if (!uniqueKeys(table).some((k) => sameCols(k, keys))) {
      return fail({ code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' });
    }
    const input = shapePayload(table, q.values, q.options);
    const keyOf = (r) => JSON.stringify(keys.map((k) => r[k]));
    if (new Set(input.map(keyOf)).size !== input.length) {
      return fail({ code: '21000', message: 'ON CONFLICT DO UPDATE command cannot affect row a second time' });
    }
    const plan = { inserts: [], patches: [] };
    affected = [];
    for (const r of input) {
      const existing = rows.find((e) => keyOf(e) === keyOf(r));
      if (existing && q.options?.ignoreDuplicates) continue;
      if (existing) {
        plan.patches.push([existing, r]);
        affected.push(existing);
      } else {
        const added = newRow(table, r);
        plan.inserts.push(added);
        affected.push(added);
      }
    }
    err = commit(table, rows, plan);
  } else if (op === 'update') {
    affected = rows.filter((r) => matches(r, q.filters));
    err = commit(table, rows, { patches: affected.map((r) => [r, { ...q.values }]) });
  } else if (op === 'delete') {
    affected = rows.filter((r) => matches(r, q.filters));
    err = commit(table, rows, { removes: affected });
  } else {
    throw new Error(`fakeSupabase: unsupported op ${op}`);
  }
  if (err) return fail(err);

  if (op !== 'select' && !q.returning) return ok(null);
  const data = clone(affected);
  if (!q.single) return ok(data);
  if (data.length === 1) return ok(data[0]);
  if (data.length === 0 && q.single === 'maybeSingle') return ok(null);
  return fail({ code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned (${data.length})` });
}
