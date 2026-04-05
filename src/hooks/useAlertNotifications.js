import { useEffect, useRef, useCallback } from 'react';
import api from '../api';

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const NOTIFIED_KEY = 'stockpulse_notified_alerts';

export function useAlertNotifications() {
  const intervalRef = useRef(null);

  const getNotified = () => {
    try {
      return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
    } catch { return {}; }
  };

  const markNotified = (symbol, type) => {
    const notified = getNotified();
    const today = new Date().toDateString();
    notified[`${symbol}_${type}_${today}`] = true;
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified));
  };

  const wasNotified = (symbol, type) => {
    const notified = getNotified();
    const today = new Date().toDateString();
    return !!notified[`${symbol}_${type}_${today}`];
  };

  const sendNotification = (title, body, symbol) => {
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
  };

  const checkAlerts = useCallback(async () => {
    const watchlistRaw = localStorage.getItem('stockpulse_watchlist');
    if (!watchlistRaw) return;

    let watchlist;
    try { watchlist = JSON.parse(watchlistRaw); } catch { return; }

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

  // Start checking on mount
  useEffect(() => {
    const init = async () => {
      const granted = await requestPermission();
      if (!granted) return;

      // Check immediately
      checkAlerts();

      // Then check periodically
      intervalRef.current = setInterval(checkAlerts, CHECK_INTERVAL);
    };

    init();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkAlerts, requestPermission]);

  return { checkAlerts, requestPermission };
}
