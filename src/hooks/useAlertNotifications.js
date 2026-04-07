import { useEffect, useRef, useCallback } from 'react';
import api from '../api';

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

export function useAlertNotifications() {
  const intervalRef = useRef(null);

  const checkAlerts = useCallback(async () => {
    // Check both market watchlists for alerts
    const inRaw = localStorage.getItem('stockpulse_watchlist_in');
    const usRaw = localStorage.getItem('stockpulse_watchlist_us');
    // Also check legacy key for backward compatibility
    const legacyRaw = localStorage.getItem('stockpulse_watchlist');
    let watchlist = [];
    try { if (inRaw) watchlist = watchlist.concat(JSON.parse(inRaw)); } catch { /* ignore */ }
    try { if (usRaw) watchlist = watchlist.concat(JSON.parse(usRaw)); } catch { /* ignore */ }
    try { if (legacyRaw) watchlist = watchlist.concat(JSON.parse(legacyRaw)); } catch { /* ignore */ }
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

  return { checkAlerts, requestPermission };
}
