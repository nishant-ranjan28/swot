import { useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { useWatchlist, useUserDataStatus } from '../context/UserDataContext';

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const NOTIFIED_KEY = 'stockpulse_notified_alerts';

function getNotified() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
  } catch { return {}; }
}

function pruneOldNotified(notified) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const pruned = {};
  for (const [key, value] of Object.entries(notified)) {
    // Keys contain a date string as the last segment after the second underscore
    // Format: symbol_type_DateString
    const parts = key.split('_');
    const dateStr = parts.slice(2).join('_');
    const entryTime = new Date(dateStr).getTime();
    if (!isNaN(entryTime) && now - entryTime < sevenDays) {
      pruned[key] = value;
    }
  }
  return pruned;
}

function markNotified(symbol, type) {
  const notified = getNotified();
  const today = new Date().toDateString();
  notified[`${symbol}_${type}_${today}`] = true;
  const pruned = pruneOldNotified(notified);
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(pruned));
}

function wasNotified(symbol, type) {
  const notified = getNotified();
  const today = new Date().toDateString();
  return !!notified[`${symbol}_${type}_${today}`];
}

function sendNotification(title, body, symbol) {
  if (Notification.permission !== 'granted') return;
  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `alert_${symbol}`,
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      window.location.href = `/stock/${symbol}`;
      notification.close();
    };
  } catch (e) {
    console.error('Notification error:', e);
  }
}

const asList = (v) => [].concat(v ?? []);

export function useAlertNotifications() {
  const intervalRef = useRef(null);
  // Both markets through the data hooks (localStorage for guests, Supabase when signed in).
  const [watchlistIn] = useWatchlist('in');
  const [watchlistUs] = useWatchlist('us');
  const { mode, status } = useUserDataStatus();
  // Refs keep checkAlerts (and so the 5-min interval) stable when the watchlists change.
  const watchlistsRef = useRef({ lists: [], guest: false });
  useEffect(() => {
    // Unknown while auth resolves, so the legacy key waits for a known guest.
    watchlistsRef.current = { lists: [watchlistIn, watchlistUs], guest: mode === 'guest' && status === 'ready' };
  }, [watchlistIn, watchlistUs, mode, status]);

  const checkAlerts = useCallback(async () => {
    const { lists, guest } = watchlistsRef.current;
    let watchlist = [];
    for (const list of lists) watchlist = watchlist.concat(asList(list));
    // Also check legacy key for backward compatibility (guests only)
    if (guest) {
      const legacyRaw = localStorage.getItem('stockpulse_watchlist');
      try { if (legacyRaw) watchlist = watchlist.concat(JSON.parse(legacyRaw)); } catch { /* ignore */ }
    }
    if (watchlist.length === 0) return;

    const alertStocks = watchlist.filter(w => w.alertHigh || w.alertLow);
    if (alertStocks.length === 0) return;

    for (const stock of alertStocks) {
      try {
        const res = await api.get(`/api/stocks/${stock.symbol}/quote`);
        const price = res.data?.price;
        if (!price) continue;

        if (stock.alertHigh && price >= stock.alertHigh && !wasNotified(stock.symbol, 'high')) {
          sendNotification(
            `${stock.name || stock.symbol} - Target Reached!`,
            `₹${price.toFixed(2)} crossed your target of ₹${stock.alertHigh}`,
            stock.symbol
          );
          markNotified(stock.symbol, 'high');
        }

        if (stock.alertLow && price <= stock.alertLow && !wasNotified(stock.symbol, 'low')) {
          sendNotification(
            `${stock.name || stock.symbol} - Price Alert!`,
            `₹${price.toFixed(2)} fell below your floor of ₹${stock.alertLow}`,
            stock.symbol
          );
          markNotified(stock.symbol, 'low');
        }
      } catch {}
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }, []);

  useEffect(() => {
    if (!('Notification' in window)) return;

    // Only start checking if permission is already granted.
    // Don't prompt the user on mount — let them trigger from the watchlist page.
    if (Notification.permission === 'granted') {
      checkAlerts();
      intervalRef.current = setInterval(checkAlerts, CHECK_INTERVAL);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkAlerts]);

  // The watchlists can arrive after mount (auth resolving, account data loading) or switch
  // (sign-in / sign-out): check once whenever a mode's data becomes ready. The interval
  // above keeps running undisturbed; the mount check already covered data ready at mount.
  const readyMode = status === 'ready' ? mode : null;
  const lastReadyRef = useRef(readyMode);
  useEffect(() => {
    const changed = readyMode !== null && readyMode !== lastReadyRef.current;
    lastReadyRef.current = readyMode;
    if (changed && 'Notification' in window && Notification.permission === 'granted') checkAlerts();
  }, [readyMode, checkAlerts]);

  return { checkAlerts, requestPermission };
}
