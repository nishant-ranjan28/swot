// Supabase repository for the signed-in user's watchlist, holdings, alerts and profile.
//
// Every function takes the supabase client first, keeps no module state, never throws,
// and resolves { data?, error } (error is null on success). Mapping and diffing live
// in ./sync; this module only turns their output into queries.
//
// Deletes and updates always filter by user_id too: RLS enforces ownership anyway,
// this is defense in depth (and keeps a mis-scoped query from ever going wide).
import {
  itemAlerts,
  rowsToWatchlist,
  rowsToHoldings,
  isEmptyDiff,
  watchlistToRows,
  holdingToRow,
  alertRow,
} from './sync';

const MARKETS = ['in', 'us'];
const WATCH_KEY = 'user_id,market,symbol';
const ALERT_KEY = 'user_id,market,symbol,condition';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// postgrest-js sends the union of keys for array payloads and, by default, NULL for any
// key a row lacks. defaultToNull: false makes missing keys take the column DEFAULT.
const BULK = { defaultToNull: false };
const PROFILE_FIELDS = ['display_name', 'default_market', 'email_alerts', 'daily_digest', 'digest_market'];

const nowIso = () => new Date().toISOString();

/** Run fn, turning a thrown exception into { error }. */
async function safely(fn) {
  try {
    return await fn();
  } catch (error) {
    return { error };
  }
}

/** Run query thunks in order; stop at the first { error }. */
async function runSteps(steps) {
  for (const step of steps) {
    const { error } = await step();
    if (error) return { error };
  }
  return { error: null };
}

/** Alert rows re-arm on every write: re-setting an alert makes it fire again. */
const armedAlertRow = (userId, market, a) => ({
  ...alertRow(userId, market, a),
  active: true,
  last_triggered_at: null,
});

// ---------------------------------------------------------------------------
// Load

/** @returns {Promise<{ data?: { in: {watchlist, holdings}, us: {watchlist, holdings} }, error }>} */
export function loadAll(client, userId) {
  return safely(async () => {
    const [watch, holdings, alerts] = await Promise.all([
      client.from('watchlist_items').select('*').eq('user_id', userId),
      client.from('holdings').select('*').eq('user_id', userId),
      client.from('price_alerts').select('*').eq('user_id', userId).eq('active', true),
    ]);
    const error = watch.error || holdings.error || alerts.error;
    if (error) return { error };

    const byMarket = (rows, m) => (rows || []).filter((r) => r && r.market === m);
    const data = {};
    for (const m of MARKETS) {
      data[m] = {
        watchlist: rowsToWatchlist(byMarket(watch.data, m), byMarket(alerts.data, m)),
        holdings: rowsToHoldings(byMarket(holdings.data, m)),
      };
    }
    return { data, error: null };
  });
}

/**
 * Refetch one collection for one market (used to recover a single key after a failed
 * write without touching the others).
 * @param {'watchlist'|'holdings'} collection
 * @returns {Promise<{ data?: Array, error }>} mapped watchlist (alerts merged) or holdings
 */
export function loadCollection(client, userId, market, collection) {
  return safely(async () => {
    if (collection === 'holdings') {
      const { data, error } = await client.from('holdings').select('*').eq('user_id', userId).eq('market', market);
      if (error) return { error };
      return { data: rowsToHoldings(data), error: null };
    }
    const [watch, alerts] = await Promise.all([
      client.from('watchlist_items').select('*').eq('user_id', userId).eq('market', market),
      client.from('price_alerts').select('*').eq('user_id', userId).eq('market', market).eq('active', true),
    ]);
    const error = watch.error || alerts.error;
    if (error) return { error };
    return { data: rowsToWatchlist(watch.data, alerts.data), error: null };
  });
}

// ---------------------------------------------------------------------------
// Apply diffs (from sync.diffWatchlist / sync.diffHoldings)

/**
 * Steps, stopping at the first error: upsert items, upsert alerts, delete cleared
 * alerts on kept symbols (one query each), delete all alerts of removed symbols
 * (one query), delete removed items. Empty steps are skipped.
 * @returns {Promise<{ error }>}
 */
export function applyWatchlistDiff(client, userId, market, diff) {
  return safely(async () => {
    if (isEmptyDiff(diff)) return { error: null };
    const { insertItems = [], upsertAlerts = [], deleteAlerts = [], deleteSymbols = [] } = diff;
    const steps = [];

    if (insertItems.length) {
      const rows = watchlistToRows(insertItems, userId, market);
      steps.push(() => client.from('watchlist_items').upsert(rows, { ...BULK, onConflict: WATCH_KEY }));
    }
    if (upsertAlerts.length) {
      const rows = upsertAlerts.map((a) => armedAlertRow(userId, market, a));
      steps.push(() => client.from('price_alerts').upsert(rows, { ...BULK, onConflict: ALERT_KEY }));
    }
    const removed = new Set(deleteSymbols);
    for (const { symbol, condition } of deleteAlerts.filter((a) => !removed.has(a.symbol))) {
      steps.push(() =>
        client
          .from('price_alerts')
          .delete()
          .eq('user_id', userId)
          .eq('market', market)
          .eq('symbol', symbol)
          .eq('condition', condition),
      );
    }
    if (deleteSymbols.length) {
      steps.push(() =>
        client.from('price_alerts').delete().eq('user_id', userId).eq('market', market).in('symbol', deleteSymbols),
      );
      steps.push(() =>
        client.from('watchlist_items').delete().eq('user_id', userId).eq('market', market).in('symbol', deleteSymbols),
      );
    }
    return runSteps(steps);
  });
}

/**
 * Steps, stopping at the first error: insert, update each (by id), delete (by ids).
 * Empty steps are skipped.
 * @returns {Promise<{ error }>}
 */
export function applyHoldingsDiff(client, userId, market, diff) {
  return safely(async () => {
    if (isEmptyDiff(diff)) return { error: null };
    const { insert = [], update = [], delete: ids = [] } = diff;
    const steps = [];

    if (insert.length) {
      const rows = insert.map((h) => holdingToRow(h, userId, market));
      steps.push(() => client.from('holdings').insert(rows, BULK));
    }
    for (const h of update) {
      // eslint-disable-next-line no-unused-vars
      const { id, user_id, ...patch } = holdingToRow(h, userId, market);
      steps.push(() => client.from('holdings').update(patch).eq('id', h.id).eq('user_id', userId));
    }
    if (ids.length) {
      steps.push(() => client.from('holdings').delete().eq('user_id', userId).in('id', ids));
    }
    return runSteps(steps);
  });
}

// ---------------------------------------------------------------------------
// Profile

/** @returns {Promise<{ data: object|null, error }>} */
export function getProfile(client, userId) {
  return safely(() => client.from('profiles').select('*').eq('id', userId).maybeSingle());
}

/**
 * Update user-editable profile fields only; server-owned ones (imported_at,
 * welcome_sent_at, id, ...) are dropped. No allowed keys → no query.
 * @returns {Promise<{ data: object|null, error }>} the updated profile
 */
export function updateProfile(client, userId, patch) {
  return safely(async () => {
    const allowed = {};
    for (const k of PROFILE_FIELDS) {
      if (patch && patch[k] !== undefined) allowed[k] = patch[k];
    }
    if (!Object.keys(allowed).length) return { data: null, error: null };
    return client.from('profiles').update(allowed).eq('id', userId).select().maybeSingle();
  });
}

/** Set profiles.imported_at (used by "Skip" and at the end of importLocal). */
export function markImported(client, userId) {
  return safely(async () => {
    const { error } = await client.from('profiles').update({ imported_at: nowIso() }).eq('id', userId);
    return { error: error || null };
  });
}

// ---------------------------------------------------------------------------
// Guest → account import

/**
 * A UUID (version 8 layout) derived from (userId, id): the same user importing the same
 * guest holding always gets the same id, and two users never get the same one.
 * Falls back to a random UUID where SubtleCrypto is unavailable.
 */
async function derivedHoldingId(userId, id) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return crypto.randomUUID();
  const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${id}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The guest holdings importLocal sends, in order: demo samples and empty entries
 * dropped, a repeated valid-UUID id kept once (first wins). `guestId` says whether the
 * holding's own id is a UUID (otherwise the import gives it a fresh one). Shared with
 * the import dialog so its counts match what is actually sent.
 * @returns {{ holding: object, guestId: boolean }[]}
 */
export function importableHoldings(holdings) {
  const out = [];
  const ids = new Set();
  for (const h of holdings || []) {
    if (!h || h.isDemo) continue;
    // Skip rows the holdings table would reject (symbol NOT NULL, quantity/buy_price > 0):
    // one bad legacy row must not fail the whole import.
    if (!h.symbol || !(Number(h.quantity) > 0) || !(Number(h.buyPrice) > 0)) continue;
    const guestId = typeof h.id === 'string' && UUID_RE.test(h.id);
    if (guestId) {
      if (ids.has(h.id)) continue;
      ids.add(h.id);
    }
    out.push({ holding: h, guestId });
  }
  return out;
}

/**
 * Upsert guest localStorage data ({ in: {watchlist, holdings}, us: {...} }) into the
 * account, then mark the profile imported. Upserts on the unique keys (holdings on id),
 * so running it twice doesn't duplicate. Demo holdings are skipped; holdings without a
 * valid UUID id get a fresh one (the column is uuid), so those rows aren't idempotent.
 * Valid UUID ids this user doesn't already own are replaced by an id derived from
 * (user, id) — see the comment in the body. Counts are the rows actually sent.
 * @returns {Promise<{ counts?: { watchlist, holdings, alerts }, error }>}
 */
export function importLocal(client, userId, local) {
  return safely(async () => {
    const watchRows = [];
    const alertRows = [];
    const holdingRows = [];
    const guestIdRows = new Set(); // indexes of holdingRows whose id came from guest data

    for (const m of MARKETS) {
      const { watchlist = [], holdings = [] } = (local && local[m]) || {};

      // watchlistToRows dedupes by symbol (first wins); derive alerts from the same winners.
      const seen = new Set();
      for (const item of watchlist || []) {
        if (!item || !item.symbol || seen.has(item.symbol)) continue;
        seen.add(item.symbol);
        for (const { condition, target } of itemAlerts(item)) {
          alertRows.push(armedAlertRow(userId, m, { symbol: item.symbol, name: item.name ?? null, condition, target }));
        }
      }
      watchRows.push(...watchlistToRows(watchlist, userId, m));

      for (const { holding: h, guestId } of importableHoldings(holdings)) {
        const id = guestId ? h.id : crypto.randomUUID();
        if (guestId) guestIdRows.add(holdingRows.length);
        holdingRows.push(holdingToRow({ ...h, id }, userId, m));
      }
    }

    // The same guest data can be imported by two accounts (sign in as A, import, sign
    // out, sign in as B on the same browser). holdings is keyed on id alone, and under
    // RLS B can't see A's row with that id: ON CONFLICT (id) DO UPDATE then hits a row
    // the UPDATE policy hides and Postgres raises, failing B's whole import. So keep only
    // the ids this user already owns (a re-import updates those in place) and give every
    // other one an id derived from (user, id): unique to this user, stable across
    // re-imports. RLS can't tell "someone else's" from "nobody's", hence both get one.
    const withOwnedIds = async () => {
      const rows = holdingRows.filter((_, i) => guestIdRows.has(i));
      if (!rows.length) return { error: null };
      const ids = rows.map((r) => r.id);
      const { data, error } = await client.from('holdings').select('id').eq('user_id', userId).in('id', ids);
      if (error) return { error };
      const owned = new Set((data || []).map((r) => r.id));
      for (const row of rows) {
        if (!owned.has(row.id)) row.id = await derivedHoldingId(userId, row.id);
      }
      return { error: null };
    };

    const steps = [];
    if (watchRows.length) steps.push(() => client.from('watchlist_items').upsert(watchRows, { ...BULK, onConflict: WATCH_KEY }));
    if (alertRows.length) steps.push(() => client.from('price_alerts').upsert(alertRows, { ...BULK, onConflict: ALERT_KEY }));
    if (holdingRows.length) {
      steps.push(withOwnedIds);
      steps.push(() => client.from('holdings').upsert(holdingRows, { ...BULK, onConflict: 'id' }));
    }
    steps.push(() => markImported(client, userId));

    const { error } = await runSteps(steps);
    if (error) return { error };
    return {
      counts: { watchlist: watchRows.length, holdings: holdingRows.length, alerts: alertRows.length },
      error: null,
    };
  });
}
