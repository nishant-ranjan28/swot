import { useState, useCallback, useEffect, useRef } from 'react';

// Instances sharing a key re-read after any of them writes, so e.g. the app-level alert
// checker sees watchlist edits made on the Watchlist page (it used to read localStorage
// directly on every check). The native `storage` event covers other tabs.
const listeners = new Map(); // key -> Set<reread fn>

function notify(key, source) {
  listeners.get(key)?.forEach((fn) => {
    if (fn !== source) fn();
  });
}

// State is { key, raw, value }: the value, the key it belongs to and the stored string it
// was parsed from. The key lets a key change (e.g. a market switch) re-read during render
// instead of showing the previous key's value; `raw` lets a re-read of an unchanged string
// keep the same value identity, so consumers' effects don't re-fire.
function readEntry(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return { key, raw, value: raw ? JSON.parse(raw) : fallback };
  } catch {
    return { key, raw: null, value: fallback };
  }
}

export function useLocalStorage(key, initialValue) {
  const [state, setState] = useState(() => readEntry(key, initialValue));
  let current = state;
  if (state.key !== key) {
    current = readEntry(key, initialValue);
    setState(current);
  }
  const initialRef = useRef(initialValue);
  const selfRef = useRef(null);

  useEffect(() => {
    initialRef.current = initialValue;
  });

  useEffect(() => {
    const reread = () => {
      setState((prev) => {
        // A listener for an old key can fire before its effect is cleaned up.
        if (prev.key !== key) return prev;
        let raw;
        try {
          raw = window.localStorage.getItem(key);
        } catch {
          return prev;
        }
        if (prev.raw === raw) return prev;
        try {
          return { key, raw, value: raw ? JSON.parse(raw) : initialRef.current };
        } catch {
          return prev; // keep the current value
        }
      });
    };
    selfRef.current = reread;
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(reread);
    const onStorage = (e) => {
      if (e.storageArea !== window.localStorage) return;
      // key null: another tab called localStorage.clear().
      if (e.key === key || e.key === null) reread();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.get(key)?.delete(reread);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);

  const setValue = useCallback((value) => {
    try {
      setState(prev => {
        // A stale setter (captured before a key change) still writes its own key, but
        // must not replace the new key's state; prev may be the old key's entry
        // otherwise, so never build on it.
        const stale = prev.key !== key;
        const base = stale ? readEntry(key, initialRef.current).value : prev.value;
        const valueToStore = value instanceof Function ? value(base) : value;
        const raw = JSON.stringify(valueToStore);
        let stored = true;
        try {
          window.localStorage.setItem(key, raw);
        } catch (error) {
          // Quota exceeded or storage blocked: keep the change in memory for this session.
          stored = false;
          console.error('localStorage error:', error);
        }
        // Outside the updater/render: other instances re-read in a microtask.
        if (stored) queueMicrotask(() => notify(key, selfRef.current));
        return stale ? prev : { key, raw, value: valueToStore };
      });
    } catch (error) {
      console.error('localStorage error:', error);
    }
  }, [key]);

  return [current.value, setValue];
}
