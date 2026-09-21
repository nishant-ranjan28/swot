import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useMarket } from '../context/MarketContext';

const FILTER_TABS = ['This Week', 'Next Week', 'This Month'];

function getDateGroup(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
  const endOfNextWeek = new Date(endOfWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

  const d = new Date(dateStr + 'T00:00:00');
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (d <= endOfWeek) return 'This Week';
  if (d <= endOfNextWeek) return 'Next Week';
  return 'Later';
}

function isInFilterRange(dateStr, filter) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');

  if (filter === 'This Week') {
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    return d >= today && d <= endOfWeek;
  }
  if (filter === 'Next Week') {
    const startOfNextWeek = new Date(today);
    startOfNextWeek.setDate(today.getDate() + (7 - today.getDay()) + 1);
    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
    return d >= startOfNextWeek && d <= endOfNextWeek;
  }
  if (filter === 'This Month') {
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return d >= today && d <= endOfMonth;
  }
  return true;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const SkeletonCard = () => (
  <div className="animate-pulse bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
  </div>
);

const EarningsCalendarPage = () => {
  const { market } = useMarket();
  const [earnings, setEarnings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('This Month');

  useEffect(() => {
    const fetchEarnings = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.get(`/api/stocks/earnings-calendar?market=${market}`);
        setEarnings(res.data.earnings || []);
      } catch (err) {
        console.error('Error fetching earnings calendar:', err);
        setError('Unable to load earnings calendar. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEarnings();
  }, [market]);

  const filtered = earnings.filter(e => isInFilterRange(e.date, activeFilter));

  // Group by date group
  const grouped = {};
  filtered.forEach(e => {
    const group = getDateGroup(e.date);
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(e);
  });

  const groupOrder = ['Today', 'Tomorrow', 'This Week', 'Next Week', 'Later'];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Earnings Calendar</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Upcoming earnings announcements for top {market === 'us' ? 'US' : 'Indian'} stocks</p>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {FILTER_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeFilter === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="font-medium">No upcoming earnings found for this period</p>
          <p className="text-sm mt-1">Try selecting a different time range</p>
        </div>
      )}

      {/* Grouped Results */}
      {!isLoading && !error && groupOrder.map(group => {
        const items = grouped[group];
        if (!items || items.length === 0) return null;
        return (
          <div key={group} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{group}</h2>
            <div className="space-y-2">
              {items.map((e, i) => (
                <div key={`${e.symbol}-${i}`} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/stock/${e.symbol}`}
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:underline truncate block"
                    >
                      {e.name}
                    </Link>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{e.symbol}</span>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <div className="text-sm text-gray-700 dark:text-gray-300">{formatDate(e.date)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {e.eps_estimate != null ? `EPS Est: ${e.eps_estimate}` : 'EPS Est: N/A'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EarningsCalendarPage;
