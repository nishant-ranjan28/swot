import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from './useLocalStorage';

beforeEach(() => localStorage.clear());

test('re-reads the stored value when the key changes', () => {
  localStorage.setItem('list_in', JSON.stringify(['TCS.NS']));
  localStorage.setItem('list_us', JSON.stringify(['AAPL']));
  const { result, rerender } = renderHook(({ k }) => useLocalStorage(k, []), { initialProps: { k: 'list_in' } });
  expect(result.current[0]).toEqual(['TCS.NS']);

  rerender({ k: 'list_us' });
  expect(result.current[0]).toEqual(['AAPL']);

  rerender({ k: 'list_empty' });
  expect(result.current[0]).toEqual([]);
});

test('after a key change the setter writes to the new key only', () => {
  localStorage.setItem('list_in', JSON.stringify(['TCS.NS']));
  const { result, rerender } = renderHook(({ k }) => useLocalStorage(k, []), { initialProps: { k: 'list_in' } });
  rerender({ k: 'list_us' });
  act(() => result.current[1]((prev) => [...prev, 'MSFT']));
  expect(result.current[0]).toEqual(['MSFT']);
  expect(JSON.parse(localStorage.getItem('list_us'))).toEqual(['MSFT']);
  expect(JSON.parse(localStorage.getItem('list_in'))).toEqual(['TCS.NS']);
});

test('instances sharing a key stay in sync, including after a key change', async () => {
  const a = renderHook(({ k }) => useLocalStorage(k, []), { initialProps: { k: 'list_in' } });
  const b = renderHook(() => useLocalStorage('list_us', []));
  a.rerender({ k: 'list_us' });
  await act(async () => {
    a.result.current[1](['NVDA']);
  });
  expect(b.result.current[0]).toEqual(['NVDA']);
  await act(async () => {
    b.result.current[1](['NVDA', 'AMD']);
  });
  expect(a.result.current[0]).toEqual(['NVDA', 'AMD']);
});

test('a market switch shows the new key at once and an updater never copies the old list over', () => {
  localStorage.setItem('stockpulse_watchlist_in', JSON.stringify([{ symbol: 'TCS.NS' }]));
  localStorage.setItem('stockpulse_watchlist_us', JSON.stringify([{ symbol: 'AAPL' }]));
  const seen = [];
  const { result, rerender } = renderHook(({ m }) => {
    const tuple = useLocalStorage(`stockpulse_watchlist_${m}`, []);
    seen.push(tuple[0].map((i) => i.symbol).join());
    return tuple;
  }, { initialProps: { m: 'in' } });
  seen.length = 0;
  rerender({ m: 'us' });
  // No committed render ever showed the IN list under the US key.
  expect(seen.at(-1)).toBe('AAPL');
  expect(result.current[0]).toEqual([{ symbol: 'AAPL' }]);
  act(() => result.current[1]((prev) => [...prev, { symbol: 'MSFT' }]));
  expect(JSON.parse(localStorage.getItem('stockpulse_watchlist_us')).map((i) => i.symbol)).toEqual(['AAPL', 'MSFT']);
  expect(JSON.parse(localStorage.getItem('stockpulse_watchlist_in')).map((i) => i.symbol)).toEqual(['TCS.NS']);
});

test('another tab clearing localStorage (storage event with key null) resets to the initial value', () => {
  localStorage.setItem('list_in', JSON.stringify(['TCS.NS']));
  const { result } = renderHook(() => useLocalStorage('list_in', []));
  localStorage.clear();
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: window.localStorage }));
  });
  expect(result.current[0]).toEqual([]);
});

test('ignores storage events from sessionStorage', () => {
  localStorage.setItem('list_in', JSON.stringify(['TCS.NS']));
  const { result } = renderHook(() => useLocalStorage('list_in', []));
  localStorage.setItem('list_in', JSON.stringify(['CHANGED']));
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'list_in', storageArea: window.sessionStorage }));
  });
  expect(result.current[0]).toEqual(['TCS.NS']);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'list_in', storageArea: window.localStorage }));
  });
  expect(result.current[0]).toEqual(['CHANGED']);
});

test('a re-read with an unchanged stored string keeps the same value identity', async () => {
  localStorage.setItem('list_in', JSON.stringify(['TCS.NS']));
  const a = renderHook(() => useLocalStorage('list_in', []));
  const b = renderHook(() => useLocalStorage('list_in', []));
  const before = a.result.current[0];
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'list_in', storageArea: window.localStorage }));
  });
  expect(a.result.current[0]).toBe(before);

  await act(async () => {
    b.result.current[1](['INFY.NS']);
  });
  const afterWrite = a.result.current[0];
  expect(afterWrite).toEqual(['INFY.NS']);
  // Same content written again: A must not get a new array.
  await act(async () => {
    b.result.current[1](['INFY.NS']);
  });
  expect(a.result.current[0]).toBe(afterWrite);
});

test('a setItem failure (quota / blocked storage) logs, keeps the in-memory update and does not crash', () => {
  localStorage.setItem('list_in', JSON.stringify(['TCS.NS']));
  const { result } = renderHook(() => useLocalStorage('list_in', []));
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  try {
    act(() => result.current[1]((prev) => [...prev, 'INFY.NS']));
    expect(result.current[0]).toEqual(['TCS.NS', 'INFY.NS']);
    expect(error).toHaveBeenCalled();
  } finally {
    setItem.mockRestore();
    error.mockRestore();
  }
  expect(JSON.parse(localStorage.getItem('list_in'))).toEqual(['TCS.NS']);
});

test("a stale setter from before a key change writes its own key and leaves the new key's state alone", () => {
  localStorage.setItem('list_in', JSON.stringify([{ symbol: 'TCS.NS' }]));
  localStorage.setItem('list_us', JSON.stringify([{ symbol: 'AAPL' }]));
  const { result, rerender } = renderHook(({ k }) => useLocalStorage(k, []), { initialProps: { k: 'list_in' } });
  const staleSet = result.current[1];
  rerender({ k: 'list_us' });
  const usValue = result.current[0];
  act(() => staleSet([{ symbol: 'INFY.NS' }]));
  expect(JSON.parse(localStorage.getItem('list_in'))).toEqual([{ symbol: 'INFY.NS' }]);
  expect(JSON.parse(localStorage.getItem('list_us'))).toEqual([{ symbol: 'AAPL' }]);
  // Same value identity: the US state was never replaced (and re-parsed) behind our back.
  expect(result.current[0]).toBe(usValue);
});
