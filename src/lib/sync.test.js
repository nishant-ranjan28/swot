import { describe, expect, test } from 'vitest';
import {
  normalizeAlert,
  itemAlerts,
  rowsToWatchlist,
  rowsToHoldings,
  diffWatchlist,
  diffHoldings,
  isEmptyDiff,
  watchlistToRows,
  holdingToRow,
  alertRow,
} from './sync';

const UID = 'user-1';

const item = (symbol, extra = {}) => ({
  symbol,
  name: `${symbol} Ltd`,
  alertHigh: null,
  alertLow: null,
  addedAt: '2026-09-01T00:00:00.000Z',
  ...extra,
});

const holding = (id, extra = {}) => ({
  id,
  symbol: 'TCS.NS',
  name: 'TCS',
  buyPrice: 3500,
  quantity: 10,
  buyDate: '2026-09-01',
  ...extra,
});

describe('normalizeAlert', () => {
  test('numbers pass through', () => {
    expect(normalizeAlert(12.5)).toBe(12.5);
  });
  test('numeric strings become numbers', () => {
    expect(normalizeAlert('12.5')).toBe(12.5);
    expect(normalizeAlert(' 7 ')).toBe(7);
  });
  test("'', null and undefined mean no alert", () => {
    expect(normalizeAlert('')).toBeNull();
    expect(normalizeAlert(null)).toBeNull();
    expect(normalizeAlert(undefined)).toBeNull();
  });
  test('0 and "0" are not valid alerts', () => {
    expect(normalizeAlert(0)).toBeNull();
    expect(normalizeAlert('0')).toBeNull();
  });
  test('NaN, Infinity and junk strings are not valid alerts', () => {
    expect(normalizeAlert(NaN)).toBeNull();
    expect(normalizeAlert(Infinity)).toBeNull();
    expect(normalizeAlert('abc')).toBeNull();
  });
  test('negative targets are not valid alerts (a price alert must be positive)', () => {
    expect(normalizeAlert(-5)).toBeNull();
    expect(normalizeAlert('-0.01')).toBeNull();
    expect(normalizeAlert(-Infinity)).toBeNull();
  });
});

describe('itemAlerts', () => {
  test('maps alertHigh/alertLow to above/below with normalized targets', () => {
    expect(itemAlerts(item('A', { alertHigh: '150', alertLow: 90 }))).toEqual([
      { condition: 'above', target: 150 },
      { condition: 'below', target: 90 },
    ]);
  });
  test('drops cleared, zero, negative and junk targets', () => {
    expect(itemAlerts(item('A', { alertHigh: -1, alertLow: '' }))).toEqual([]);
    expect(itemAlerts(item('A', { alertHigh: 0, alertLow: 'abc' }))).toEqual([]);
    expect(itemAlerts(item('A', { alertLow: 5 }))).toEqual([{ condition: 'below', target: 5 }]);
  });
  test('tolerates missing items', () => {
    expect(itemAlerts(null)).toEqual([]);
    expect(itemAlerts(undefined)).toEqual([]);
  });
});

describe('rowsToWatchlist', () => {
  test('merges active alerts and sorts by added_at ascending', () => {
    const watchRows = [
      { symbol: 'B.NS', name: 'B', added_at: '2026-09-03T00:00:00Z', market: 'in', user_id: UID },
      { symbol: 'A.NS', name: 'A', added_at: '2026-09-01T00:00:00Z', market: 'in', user_id: UID },
      { symbol: 'C.NS', name: 'C', added_at: '2026-09-02T00:00:00Z', market: 'in', user_id: UID },
    ];
    const alertRows = [
      { symbol: 'A.NS', condition: 'above', target: '120.5', active: true },
      { symbol: 'A.NS', condition: 'below', target: 90, active: true },
      { symbol: 'B.NS', condition: 'above', target: 500, active: false },
      { symbol: 'C.NS', condition: 'below', target: 10, active: true },
      { symbol: 'C.NS', condition: 'pct_up', target: 5, active: true },
      { symbol: 'ZZZ.NS', condition: 'above', target: 1, active: true },
    ];
    expect(rowsToWatchlist(watchRows, alertRows)).toEqual([
      { symbol: 'A.NS', name: 'A', alertHigh: 120.5, alertLow: 90, addedAt: '2026-09-01T00:00:00Z' },
      { symbol: 'C.NS', name: 'C', alertHigh: null, alertLow: 10, addedAt: '2026-09-02T00:00:00Z' },
      { symbol: 'B.NS', name: 'B', alertHigh: null, alertLow: null, addedAt: '2026-09-03T00:00:00Z' },
    ]);
  });

  test('inactive alert is ignored', () => {
    const out = rowsToWatchlist(
      [{ symbol: 'X', name: 'X', added_at: '2026-09-01T00:00:00Z' }],
      [{ symbol: 'X', condition: 'above', target: 5, active: false }],
    );
    expect(out[0].alertHigh).toBeNull();
  });

  test('alertRows is optional', () => {
    expect(rowsToWatchlist([{ symbol: 'X', name: 'X', added_at: '2026-09-01T00:00:00Z' }])).toEqual([
      { symbol: 'X', name: 'X', alertHigh: null, alertLow: null, addedAt: '2026-09-01T00:00:00Z' },
    ]);
  });

  test('rows with missing added_at keep input order, after dated rows', () => {
    const out = rowsToWatchlist([
      { symbol: 'N1', name: null },
      { symbol: 'D2', added_at: '2026-09-02T00:00:00Z' },
      { symbol: 'N2' },
      { symbol: 'D1', added_at: '2026-09-01T00:00:00Z' },
    ]);
    expect(out.map((i) => i.symbol)).toEqual(['D1', 'D2', 'N1', 'N2']);
    expect(out[2]).toEqual({ symbol: 'N1', name: null, alertHigh: null, alertLow: null, addedAt: null });
  });

  test('ties on added_at keep input order', () => {
    const t = '2026-09-01T00:00:00Z';
    const out = rowsToWatchlist([
      { symbol: 'B', added_at: t },
      { symbol: 'A', added_at: t },
    ]);
    expect(out.map((i) => i.symbol)).toEqual(['B', 'A']);
  });

  test('empty input gives empty array', () => {
    expect(rowsToWatchlist([], [])).toEqual([]);
    expect(rowsToWatchlist(null, null)).toEqual([]);
  });
});

describe('rowsToHoldings', () => {
  test('maps snake_case rows and converts numerics', () => {
    expect(
      rowsToHoldings([
        {
          id: 'h1',
          user_id: UID,
          market: 'in',
          symbol: 'TCS.NS',
          name: 'TCS',
          buy_price: '3500.50',
          quantity: '10',
          buy_date: '2026-09-01',
          created_at: '2026-09-01T00:00:00Z',
        },
        { id: 'h2', symbol: 'INFY.NS', name: 'Infosys', buy_price: 1500, quantity: 2, buy_date: null },
      ]),
    ).toEqual([
      { id: 'h1', symbol: 'TCS.NS', name: 'TCS', buyPrice: 3500.5, quantity: 10, buyDate: '2026-09-01' },
      { id: 'h2', symbol: 'INFY.NS', name: 'Infosys', buyPrice: 1500, quantity: 2, buyDate: null },
    ]);
  });

  test('empty input gives empty array', () => {
    expect(rowsToHoldings([])).toEqual([]);
    expect(rowsToHoldings(undefined)).toEqual([]);
  });
});

describe('diffWatchlist', () => {
  test('no change gives empty arrays', () => {
    const list = [item('A'), item('B', { alertHigh: 10 })];
    const diff = diffWatchlist(list, list.map((i) => ({ ...i })));
    expect(diff).toEqual({ insertItems: [], deleteSymbols: [], upsertAlerts: [], deleteAlerts: [] });
    expect(isEmptyDiff(diff)).toBe(true);
  });

  test('handles null/undefined inputs', () => {
    expect(diffWatchlist(undefined, null)).toEqual({
      insertItems: [],
      deleteSymbols: [],
      upsertAlerts: [],
      deleteAlerts: [],
    });
  });

  test('add without alerts', () => {
    const added = item('A');
    const diff = diffWatchlist([], [added]);
    expect(diff.insertItems).toEqual([added]);
    expect(diff.upsertAlerts).toEqual([]);
    expect(diff.deleteSymbols).toEqual([]);
    expect(diff.deleteAlerts).toEqual([]);
  });

  test('add with alerts upserts them', () => {
    const added = item('A', { alertHigh: 150, alertLow: '90' });
    const diff = diffWatchlist([item('B')], [item('B'), added]);
    expect(diff.insertItems).toEqual([{ ...added, alertLow: 90 }]);
    expect(diff.upsertAlerts).toEqual([
      { symbol: 'A', name: 'A Ltd', condition: 'above', target: 150 },
      { symbol: 'A', name: 'A Ltd', condition: 'below', target: 90 },
    ]);
    expect(isEmptyDiff(diff)).toBe(false);
  });

  test('remove deletes item and both alert conditions', () => {
    const diff = diffWatchlist([item('A'), item('B', { alertHigh: 5 })], [item('A')]);
    expect(diff.insertItems).toEqual([]);
    expect(diff.deleteSymbols).toEqual(['B']);
    expect(diff.deleteAlerts).toEqual([
      { symbol: 'B', condition: 'above' },
      { symbol: 'B', condition: 'below' },
    ]);
    expect(diff.upsertAlerts).toEqual([]);
  });

  test('alert set upserts', () => {
    const diff = diffWatchlist([item('A')], [item('A', { alertHigh: 200 })]);
    expect(diff.upsertAlerts).toEqual([{ symbol: 'A', name: 'A Ltd', condition: 'above', target: 200 }]);
    expect(diff.deleteAlerts).toEqual([]);
    expect(diff.insertItems).toEqual([]);
  });

  test('alert change upserts new target', () => {
    const diff = diffWatchlist([item('A', { alertLow: 50 })], [item('A', { alertLow: 45.5 })]);
    expect(diff.upsertAlerts).toEqual([{ symbol: 'A', name: 'A Ltd', condition: 'below', target: 45.5 }]);
    expect(diff.deleteAlerts).toEqual([]);
  });

  test('alert clear deletes (null, empty string and 0 all clear)', () => {
    for (const cleared of [null, '', 0, undefined]) {
      const diff = diffWatchlist(
        [item('A', { alertHigh: 200, alertLow: 50 })],
        [item('A', { alertHigh: cleared, alertLow: 50 })],
      );
      expect(diff.deleteAlerts).toEqual([{ symbol: 'A', condition: 'above' }]);
      expect(diff.upsertAlerts).toEqual([]);
    }
  });

  test('numeric string equal to previous number is not a change', () => {
    const diff = diffWatchlist([item('A', { alertHigh: 12.5 })], [item('A', { alertHigh: '12.5' })]);
    expect(isEmptyDiff(diff)).toBe(true);
  });

  test('a negative target clears the alert', () => {
    const diff = diffWatchlist([item('A', { alertHigh: 200 })], [item('A', { alertHigh: -200 })]);
    expect(diff.deleteAlerts).toEqual([{ symbol: 'A', condition: 'above' }]);
    expect(diff.upsertAlerts).toEqual([]);
  });

  test('null to 0 or empty string is not a change', () => {
    const diff = diffWatchlist([item('A')], [item('A', { alertHigh: 0, alertLow: '' })]);
    expect(isEmptyDiff(diff)).toBe(true);
  });

  test('duplicate symbols in next are deduped by first occurrence', () => {
    const first = item('A', { alertHigh: 10 });
    const dup = item('A', { alertHigh: 99, name: 'Dup' });
    const diff = diffWatchlist([], [first, dup]);
    expect(diff.insertItems).toEqual([first]);
    expect(diff.upsertAlerts).toEqual([{ symbol: 'A', name: 'A Ltd', condition: 'above', target: 10 }]);
  });

  test('existing symbol duplicated in next is not deleted or re-inserted', () => {
    const diff = diffWatchlist([item('A')], [item('A'), item('A', { alertHigh: 3 })]);
    expect(isEmptyDiff(diff)).toBe(true);
  });
});

describe('diffHoldings', () => {
  test('no change gives empty arrays', () => {
    const list = [holding('h1'), holding('h2')];
    const diff = diffHoldings(list, list.map((h) => ({ ...h })));
    expect(diff).toEqual({ insert: [], update: [], delete: [] });
    expect(isEmptyDiff(diff)).toBe(true);
  });

  test('handles null/undefined inputs', () => {
    expect(diffHoldings(null, undefined)).toEqual({ insert: [], update: [], delete: [] });
  });

  test('add', () => {
    const h2 = holding('h2', { symbol: 'INFY.NS' });
    const diff = diffHoldings([holding('h1')], [holding('h1'), h2]);
    expect(diff).toEqual({ insert: [h2], update: [], delete: [] });
  });

  test('edit each field produces an update', () => {
    const edits = [
      { symbol: 'X.NS' },
      { name: 'Other' },
      { buyPrice: 3600 },
      { quantity: 11 },
      { buyDate: '2026-01-01' },
      { buyDate: null },
    ];
    for (const edit of edits) {
      const next = holding('h1', edit);
      expect(diffHoldings([holding('h1')], [next])).toEqual({ insert: [], update: [next], delete: [] });
    }
  });

  test('remove', () => {
    const diff = diffHoldings([holding('h1'), holding('h2')], [holding('h2')]);
    expect(diff).toEqual({ insert: [], update: [], delete: ['h1'] });
  });

  test('numbers compare as Numbers', () => {
    const diff = diffHoldings([holding('h1')], [holding('h1', { quantity: '10', buyPrice: '3500.00' })]);
    expect(isEmptyDiff(diff)).toBe(true);
  });

  test('buyDate null and undefined are equal', () => {
    const diff = diffHoldings([holding('h1', { buyDate: null })], [holding('h1', { buyDate: undefined })]);
    expect(isEmptyDiff(diff)).toBe(true);
  });

  test('demo items are ignored', () => {
    const demo = holding('demo-1', { isDemo: true });
    expect(isEmptyDiff(diffHoldings([], [demo]))).toBe(true);
    expect(isEmptyDiff(diffHoldings([demo], []))).toBe(true);
    const real = holding('h1');
    expect(diffHoldings([demo], [demo, real])).toEqual({ insert: [real], update: [], delete: [] });
  });

  test('duplicate ids in next are deduped by first occurrence', () => {
    const a = holding('h1');
    const b = holding('h1', { quantity: 99 });
    expect(diffHoldings([], [a, b])).toEqual({ insert: [a], update: [], delete: [] });
  });

  test('items without an id are skipped', () => {
    const noId = holding(undefined);
    expect(isEmptyDiff(diffHoldings([], [noId]))).toBe(true);
  });
});

describe('isEmptyDiff', () => {
  test('works for both diff kinds', () => {
    expect(isEmptyDiff({ insertItems: [], deleteSymbols: [], upsertAlerts: [], deleteAlerts: [] })).toBe(true);
    expect(isEmptyDiff({ insertItems: [], deleteSymbols: ['A'], upsertAlerts: [], deleteAlerts: [] })).toBe(false);
    expect(isEmptyDiff({ insert: [], update: [], delete: [] })).toBe(true);
    expect(isEmptyDiff({ insert: [], update: [], delete: ['h1'] })).toBe(false);
  });
  test('null/undefined count as empty', () => {
    expect(isEmptyDiff(null)).toBe(true);
    expect(isEmptyDiff(undefined)).toBe(true);
  });
});

describe('row mappers', () => {
  test('watchlistToRows maps camelCase to snake_case with user_id and market', () => {
    expect(watchlistToRows([item('A', { alertHigh: 5 })], UID, 'in')).toEqual([
      { user_id: UID, market: 'in', symbol: 'A', name: 'A Ltd', added_at: '2026-09-01T00:00:00.000Z' },
    ]);
  });

  test('watchlistToRows omits undefined keys and dedupes symbols', () => {
    const rows = watchlistToRows([{ symbol: 'A' }, { symbol: 'A', name: 'dup' }], UID, 'us');
    expect(rows).toEqual([{ user_id: UID, market: 'us', symbol: 'A' }]);
    expect(Object.keys(rows[0])).toEqual(['user_id', 'market', 'symbol']);
  });

  test('watchlistToRows handles empty input', () => {
    expect(watchlistToRows([], UID, 'in')).toEqual([]);
    expect(watchlistToRows(undefined, UID, 'in')).toEqual([]);
  });

  test('holdingToRow keeps id, converts numbers and drops isDemo', () => {
    expect(holdingToRow(holding('h1', { quantity: '10', isDemo: false }), UID, 'in')).toEqual({
      id: 'h1',
      user_id: UID,
      market: 'in',
      symbol: 'TCS.NS',
      name: 'TCS',
      buy_price: 3500,
      quantity: 10,
      buy_date: '2026-09-01',
    });
  });

  test('holdingToRow omits undefined keys but keeps null', () => {
    const row = holdingToRow({ id: 'h1', symbol: 'X', buyPrice: 1, quantity: 2, buyDate: null }, UID, 'us');
    expect(row).toEqual({ id: 'h1', user_id: UID, market: 'us', symbol: 'X', buy_price: 1, quantity: 2, buy_date: null });
    expect('name' in row).toBe(false);
  });

  test('alertRow maps an upsertAlerts entry', () => {
    expect(alertRow(UID, 'in', { symbol: 'A', name: 'A Ltd', condition: 'above', target: '150' })).toEqual({
      user_id: UID,
      market: 'in',
      symbol: 'A',
      name: 'A Ltd',
      condition: 'above',
      target: 150,
    });
  });

  test('alertRow omits undefined name', () => {
    const row = alertRow(UID, 'us', { symbol: 'A', condition: 'below', target: 9 });
    expect(row).toEqual({ user_id: UID, market: 'us', symbol: 'A', condition: 'below', target: 9 });
    expect('name' in row).toBe(false);
  });

  test('round trip: rowsToHoldings(holdingToRow(h)) equals h', () => {
    const h = holding('11111111-2222-3333-4444-555555555555');
    const [back] = rowsToHoldings([holdingToRow(h, UID, 'in')]);
    expect(back).toEqual(h);
  });

  test('round trip holds with null buyDate', () => {
    const h = holding('h9', { buyDate: null });
    expect(rowsToHoldings([holdingToRow(h, UID, 'us')])[0]).toEqual(h);
  });

  test('round trip: rowsToWatchlist(watchlistToRows + alertRow) equals items', () => {
    const items = [item('A', { alertHigh: 10, alertLow: 5 }), item('B', { addedAt: '2026-09-02T00:00:00.000Z' })];
    const { upsertAlerts } = diffWatchlist([], items);
    const alertRows = upsertAlerts.map((a) => ({ ...alertRow(UID, 'in', a), active: true }));
    expect(rowsToWatchlist(watchlistToRows(items, UID, 'in'), alertRows)).toEqual(items);
  });
});
