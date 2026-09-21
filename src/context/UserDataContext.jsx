// Watchlist + holdings for both markets, from localStorage (guests) or Supabase (signed in).
//
// useWatchlist(market) / useHoldings(market) return [items, setItems], the same shape as
// useLocalStorage, so pages don't care which mode they're in.
//
// Account mode is optimistic and batched. Per collection+market ("in:watchlist", ...):
//   - a setter updates state at once and (re)starts a FLUSH_DELAY timer;
//   - a flush diffs `synced` (the last state the server confirmed, or what was loaded)
//     against the current state and applies the diff with the repository;
//   - flushes for one key run one at a time; a flush requested meanwhile runs right after;
//   - on { error }: toast, then refetch just that collection+market from the server;
//     other keys' pending timers and in-flight writes carry on untouched.
// Pending changes are flushed immediately on pagehide / visibilitychange→hidden, on
// sign-out / user switch and on unmount (best effort).
//
// All mutable account bookkeeping lives on a per-user "session" object, so results that
// arrive after a sign-out or user switch are simply dropped.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useOptionalAuth } from './AuthContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { loadAll, loadCollection, applyWatchlistDiff, applyHoldingsDiff } from '@/lib/userDataRepo';
import { diffWatchlist, diffHoldings, isEmptyDiff } from '@/lib/sync';

export const FLUSH_DELAY = 400;
const SAVE_FAILED = "Couldn't save your changes — reloaded from your account";
const LOAD_FAILED = "Couldn't load your account data";

const MARKETS = ['in', 'us'];
const COLLECTIONS = {
  watchlist: { diff: diffWatchlist, apply: applyWatchlistDiff, storageKey: (m) => `stockpulse_watchlist_${m}` },
  holdings: { diff: diffHoldings, apply: applyHoldingsDiff, storageKey: (m) => `stockpulse_portfolio_${m}` },
};
const KEYS = MARKETS.flatMap((market) => Object.keys(COLLECTIONS).map((coll) => [market, coll]));
const keyOf = (market, coll) => `${market}:${coll}`;
const EMPTY = [];
const NOOP = () => {};

const UserDataContext = createContext(null);

function newSession(client, userId) {
  return {
    client,
    userId,
    active: true,
    state: null, // { in: { watchlist, holdings }, us: { ... } } once loaded
    synced: {}, // key -> array last confirmed by the server
    epoch: 0, // bumped on every full load; in-flight flushes from an older epoch are dropped
    keyEpochs: {}, // key -> bumped when that key alone is reloaded (same effect, one key)
    timers: new Map(),
    inflight: new Map(),
    again: new Set(),
  };
}

function toState(data) {
  const state = {};
  for (const m of MARKETS) {
    state[m] = { watchlist: data?.[m]?.watchlist ?? [], holdings: data?.[m]?.holdings ?? [] };
  }
  return state;
}

export function UserDataProvider({ children, flushDelay = FLUSH_DELAY }) {
  const auth = useOptionalAuth();
  const client = auth?.client ?? null;
  const userId = auth?.user?.id ?? null;
  const authLoading = !!auth?.loading;

  // { userId, status: 'ready'|'error', data } for the current account; null while loading.
  const [account, setAccount] = useState(null);
  const sessionRef = useRef(null);
  // The load-failure toast's Retry button; points at the latest reload().
  const retryRef = useRef(null);
  const toastLoadFailed = useCallback(() => {
    toast.error(LOAD_FAILED, { action: { label: 'Retry', onClick: () => retryRef.current?.() } });
  }, []);

  const load = useCallback(async (session) => {
    const { data, error } = await loadAll(session.client, session.userId);
    if (!session.active) return { error: null };
    if (error) {
      toastLoadFailed();
      if (!session.state) setAccount({ userId: session.userId, status: 'error', data: null });
      return { error };
    }
    const state = toState(data);
    session.epoch += 1;
    session.state = state;
    session.synced = {};
    for (const [m, coll] of KEYS) session.synced[keyOf(m, coll)] = state[m][coll];
    setAccount({ userId: session.userId, status: 'ready', data: state });
    return { error: null };
  }, [toastLoadFailed]);

  // Refetch one collection+market after its write failed. Runs inside that key's flush,
  // so no other write for the key is in flight; other keys are left alone.
  const loadKey = useCallback(
    async (session, market, coll) => {
      const epoch = session.epoch;
      const { data, error } = await loadCollection(session.client, session.userId, market, coll);
      // Signed out, or a full reload replaced everything meanwhile.
      if (!session.active || session.epoch !== epoch || !session.state) return;
      if (error) {
        toastLoadFailed();
        return;
      }
      const k = keyOf(market, coll);
      session.keyEpochs[k] = (session.keyEpochs[k] ?? 0) + 1;
      const state = { ...session.state, [market]: { ...session.state[market], [coll]: data } };
      session.state = state;
      session.synced[k] = data;
      setAccount({ userId: session.userId, status: 'ready', data: state });
    },
    [toastLoadFailed],
  );

  const flushKey = useCallback(
    (session, market, coll) => {
      const k = keyOf(market, coll);
      clearTimeout(session.timers.get(k));
      session.timers.delete(k);
      const running = session.inflight.get(k);
      if (running) {
        session.again.add(k);
        return running;
      }
      const { diff: diffFn, apply } = COLLECTIONS[coll];
      const run = async () => {
        do {
          session.again.delete(k);
          if (!session.state) return;
          const snapshot = session.state[market][coll];
          const synced = session.synced[k];
          if (snapshot === synced) continue;
          const diff = diffFn(synced, snapshot);
          if (isEmptyDiff(diff)) {
            session.synced[k] = snapshot;
            continue;
          }
          const epoch = session.epoch;
          const keyEpoch = session.keyEpochs[k];
          const { error } = await apply(session.client, session.userId, market, diff);
          // Signed out / unmounted, or a reload replaced state and synced meanwhile.
          if (!session.active || session.epoch !== epoch || session.keyEpochs[k] !== keyEpoch) return;
          if (error) {
            toast.error(SAVE_FAILED);
            await loadKey(session, market, coll);
            return;
          }
          session.synced[k] = snapshot;
        } while (session.again.has(k) && session.active);
      };
      const p = run().finally(() => session.inflight.delete(k));
      session.inflight.set(k, p);
      return p;
    },
    [loadKey],
  );

  const flushSession = useCallback(
    (session) => Promise.all(KEYS.map(([m, coll]) => flushKey(session, m, coll))).then(() => undefined),
    [flushKey],
  );

  // Keyed on the user id: TOKEN_REFRESHED hands out new user objects for the same user.
  useEffect(() => {
    if (!client || !userId) return undefined;
    const session = newSession(client, userId);
    sessionRef.current = session;
    // load() only sets state after awaiting the fetch (subscribing to an external source).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(session);
    return () => {
      flushSession(session); // best effort; starts the writes synchronously
      session.active = false;
      session.timers.forEach(clearTimeout);
      session.timers.clear();
      if (sessionRef.current === session) sessionRef.current = null;
      setAccount(null);
    };
  }, [client, userId, load, flushSession]);

  useEffect(() => {
    const flushNow = () => {
      if (sessionRef.current) flushSession(sessionRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flushSession]);

  const update = useCallback(
    (market, coll, value) => {
      const session = sessionRef.current;
      if (!session || !session.state) return; // still loading (or load failed)
      const prev = session.state[market][coll];
      const next = typeof value === 'function' ? value(prev) : value;
      if (next === prev) return;
      const state = { ...session.state, [market]: { ...session.state[market], [coll]: next } };
      session.state = state;
      setAccount({ userId: session.userId, status: 'ready', data: state });

      const k = keyOf(market, coll);
      clearTimeout(session.timers.get(k));
      session.timers.set(
        k,
        setTimeout(() => {
          session.timers.delete(k);
          flushKey(session, market, coll);
        }, flushDelay),
      );
    },
    [flushKey, flushDelay],
  );

  const flush = useCallback(() => (sessionRef.current ? flushSession(sessionRef.current) : Promise.resolve()), [flushSession]);

  // Full refetch (import dialog, Retry). Writes everything pending first, waiting for
  // in-flight flushes, so no edit is lost to the replace. Never call this from inside a
  // flush: it would wait on itself.
  const reload = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return { error: null };
    await flushSession(session);
    return load(session);
  }, [flushSession, load]);
  useEffect(() => {
    retryRef.current = reload;
  }, [reload]);

  const mode = userId ? 'account' : 'guest';
  const current = account && account.userId === userId ? account : null;
  let status = 'ready';
  if (authLoading) status = 'loading';
  else if (mode === 'account') status = current ? current.status : 'loading';
  const data = mode === 'account' && current?.status === 'ready' ? current.data : null;

  const value = useMemo(
    () => ({ mode, status, data, update, flush, reload }),
    [mode, status, data, update, flush, reload],
  );
  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

const GUEST_STATUS = { mode: 'guest', status: 'ready' };
const noopAsync = () => Promise.resolve({ error: null });

/** { mode: 'guest'|'account', status: 'loading'|'ready'|'error' }. Guest outside the provider. */
export function useUserDataStatus() {
  const ctx = useContext(UserDataContext);
  return useMemo(() => (ctx ? { mode: ctx.mode, status: ctx.status } : GUEST_STATUS), [ctx]);
}

/**
 * { flush, reload, retry }: write pending changes now / flush then refetch the account
 * data. retry is reload, for recovering from status 'error'.
 */
export function useUserDataActions() {
  const ctx = useContext(UserDataContext);
  return useMemo(() => {
    const reload = ctx?.reload ?? noopAsync;
    return { flush: ctx?.flush ?? noopAsync, reload, retry: reload };
  }, [ctx]);
}

function useCollection(coll, market) {
  const ctx = useContext(UserDataContext);
  // Always called (hooks can't be conditional); used as-is in guest mode.
  const [local, setLocal] = useLocalStorage(COLLECTIONS[coll].storageKey(market), EMPTY);
  const update = ctx?.update;
  const setAccountItems = useCallback((value) => update?.(market, coll, value), [update, market, coll]);

  if (!ctx) return [local, setLocal];
  // Auth still loading (might be a user), or account data loading / failed: show nothing
  // and ignore edits. Guest storage is only written once we know there's no user.
  if (ctx.status !== 'ready') return [EMPTY, NOOP];
  if (ctx.mode === 'guest') return [local, setLocal];
  return [ctx.data ? ctx.data[market][coll] : EMPTY, setAccountItems];
}

/** [watchlist, setWatchlist] for a market; setter takes a value or an updater. */
export function useWatchlist(market) {
  return useCollection('watchlist', market);
}

/** [holdings, setHoldings] for a market; setter takes a value or an updater. */
export function useHoldings(market) {
  return useCollection('holdings', market);
}
