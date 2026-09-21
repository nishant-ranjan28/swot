// Pure mapping + diff between UI state and Supabase rows.
// No Supabase or React imports: the repository applies what these produce.
//
// UI shapes:
//   watchlist item: { symbol, name, alertHigh, alertLow, addedAt }
//   holding:        { id, symbol, name, buyPrice, quantity, buyDate } (+ isDemo for samples)

const CONDITIONS = [
  ['alertHigh', 'above'],
  ['alertLow', 'below'],
];

/**
 * Normalize an alert target to a positive Number or null.
 * '', null, undefined, 0, negatives, NaN, ±Infinity and non-numeric strings mean
 * "no alert": a price target must be positive (a negative "above" would always fire,
 * and WatchlistPage only fires alerts on truthy values, so 0 is inert there).
 */
export function normalizeAlert(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * A watchlist item's valid price alerts.
 * @returns {{ condition: 'above'|'below', target: number }[]}
 */
export function itemAlerts(item) {
  if (!item) return [];
  const out = [];
  for (const [field, condition] of CONDITIONS) {
    const target = normalizeAlert(item[field]);
    if (target !== null) out.push({ condition, target });
  }
  return out;
}

const nullish = (v) => (v === undefined ? null : v);

/** Copy only keys whose value is not undefined. */
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Array → Map keyed by keyFn, first occurrence wins, falsy keys skipped. */
function indexBy(list, keyFn) {
  const map = new Map();
  for (const x of list || []) {
    if (!x) continue;
    const key = keyFn(x);
    if (!key || map.has(key)) continue;
    map.set(key, x);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Rows → UI

/**
 * Merge watchlist_items rows with price_alerts rows into UI items.
 * Sorted by added_at ascending (stable). Rows without a parseable added_at
 * come after dated rows, in their input order. Only active above/below alerts count.
 */
export function rowsToWatchlist(watchRows, alertRows = []) {
  const alerts = new Map(); // symbol -> { above, below }
  for (const a of alertRows || []) {
    if (!a || a.active === false) continue;
    if (a.condition !== 'above' && a.condition !== 'below') continue;
    const target = normalizeAlert(a.target);
    if (target === null) continue;
    const entry = alerts.get(a.symbol) || {};
    entry[a.condition] = target;
    alerts.set(a.symbol, entry);
  }

  const ts = (row) => {
    const t = row.added_at ? Date.parse(row.added_at) : NaN;
    return Number.isNaN(t) ? null : t;
  };

  const rows = (watchRows || []).filter(Boolean);
  const dated = rows.filter((r) => ts(r) !== null).sort((a, b) => ts(a) - ts(b));
  const undated = rows.filter((r) => ts(r) === null);

  return [...dated, ...undated].map((r) => {
    const a = alerts.get(r.symbol) || {};
    return {
      symbol: r.symbol,
      name: nullish(r.name),
      alertHigh: a.above ?? null,
      alertLow: a.below ?? null,
      addedAt: nullish(r.added_at),
    };
  });
}

/** Map holdings rows to UI holdings. */
export function rowsToHoldings(rows) {
  return (rows || []).filter(Boolean).map((r) => ({
    id: r.id,
    symbol: r.symbol,
    name: nullish(r.name),
    buyPrice: Number(r.buy_price),
    quantity: Number(r.quantity),
    buyDate: nullish(r.buy_date),
  }));
}

// ---------------------------------------------------------------------------
// Diffs

/**
 * prev → next watchlist diff, keyed by symbol (first occurrence wins).
 * @returns {{ insertItems: object[], deleteSymbols: string[],
 *   upsertAlerts: {symbol, name, condition, target}[], deleteAlerts: {symbol, condition}[] }}
 */
export function diffWatchlist(prev, next) {
  const prevMap = indexBy(prev, (i) => i.symbol);
  const nextMap = indexBy(next, (i) => i.symbol);
  const diff = { insertItems: [], deleteSymbols: [], upsertAlerts: [], deleteAlerts: [] };

  const targets = (i) => new Map(itemAlerts(i).map((a) => [a.condition, a.target]));

  for (const [symbol, n] of nextMap) {
    const p = prevMap.get(symbol);
    if (!p) {
      const inserted = { ...n };
      for (const [field] of CONDITIONS) {
        if (field in inserted) inserted[field] = normalizeAlert(inserted[field]);
      }
      diff.insertItems.push(inserted);
    }
    const before = targets(p);
    const after = targets(n);
    for (const [, condition] of CONDITIONS) {
      const target = after.get(condition) ?? null;
      if ((before.get(condition) ?? null) === target) continue;
      if (target === null) {
        diff.deleteAlerts.push({ symbol, condition });
      } else {
        diff.upsertAlerts.push({ symbol, name: nullish(n.name), condition, target });
      }
    }
  }

  for (const symbol of prevMap.keys()) {
    if (nextMap.has(symbol)) continue;
    diff.deleteSymbols.push(symbol);
    for (const [, condition] of CONDITIONS) diff.deleteAlerts.push({ symbol, condition });
  }

  return diff;
}

function holdingChanged(a, b) {
  return (
    a.symbol !== b.symbol ||
    nullish(a.name) !== nullish(b.name) ||
    Number(a.buyPrice) !== Number(b.buyPrice) ||
    Number(a.quantity) !== Number(b.quantity) ||
    nullish(a.buyDate) !== nullish(b.buyDate)
  );
}

/**
 * prev → next holdings diff, keyed by id (first occurrence wins).
 * Demo items and items without an id are ignored.
 * @returns {{ insert: object[], update: object[], delete: string[] }}
 */
export function diffHoldings(prev, next) {
  const real = (list) => (list || []).filter((h) => h && !h.isDemo);
  const prevMap = indexBy(real(prev), (h) => h.id);
  const nextMap = indexBy(real(next), (h) => h.id);
  const diff = { insert: [], update: [], delete: [] };

  for (const [id, n] of nextMap) {
    const p = prevMap.get(id);
    if (!p) diff.insert.push(n);
    else if (holdingChanged(p, n)) diff.update.push(n);
  }
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) diff.delete.push(id);
  }
  return diff;
}

/** True when every array in a watchlist or holdings diff is empty. */
export function isEmptyDiff(diff) {
  if (!diff) return true;
  return Object.values(diff).every((v) => !Array.isArray(v) || v.length === 0);
}

// ---------------------------------------------------------------------------
// UI → rows

/** Watchlist items → watchlist_items rows (deduped by symbol, undefined keys omitted). */
export function watchlistToRows(items, userId, market) {
  return [...indexBy(items, (i) => i.symbol).values()].map((i) =>
    compact({
      user_id: userId,
      market,
      symbol: i.symbol,
      name: i.name,
      added_at: i.addedAt,
    }),
  );
}

/** Holding → holdings row. Keeps the client-generated id. */
export function holdingToRow(h, userId, market) {
  return compact({
    id: h.id,
    user_id: userId,
    market,
    symbol: h.symbol,
    name: h.name,
    buy_price: h.buyPrice === undefined ? undefined : Number(h.buyPrice),
    quantity: h.quantity === undefined ? undefined : Number(h.quantity),
    buy_date: h.buyDate,
  });
}

/** An upsertAlerts entry → price_alerts row. */
export function alertRow(userId, market, a) {
  return compact({
    user_id: userId,
    market,
    symbol: a.symbol,
    name: a.name,
    condition: a.condition,
    target: a.target === undefined ? undefined : Number(a.target),
  });
}
