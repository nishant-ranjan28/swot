import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useLocalStorage } from '../hooks/useLocalStorage';

const MAX_WATCHLIST = 20;

const SORT_OPTIONS = [
  { key: 'addedAt', label: 'Recently Added' },
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price' },
  { key: 'changePercent', label: 'Change%' },
];

const SkeletonRow = () => (
  <tr className="animate-pulse">
    <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-28"></div><div className="h-3 bg-gray-200 rounded w-16 mt-1"></div></td>
    <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
    <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
    <td className="px-4 py-3"><div className="h-1.5 bg-gray-200 rounded-full w-28"></div></td>
    <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
    <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8"></div></td>
    <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8"></div></td>
  </tr>
);

const PriceRangeBar = ({ low, high, current }) => {
  if (!low || !high || !current || high === low) return <span className="text-xs text-gray-400">N/A</span>;
  const position = Math.min(Math.max(((current - low) / (high - low)) * 100, 0), 100);
  return (
    <div className="w-28">
      <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
        <span>{low.toFixed(0)}</span>
        <span>{high.toFixed(0)}</span>
      </div>
      <div className="relative h-1.5 bg-gray-200 rounded-full">
        <div
          className="absolute h-1.5 bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 rounded-full"
          style={{ width: '100%' }}
        ></div>
        <div
          className="absolute w-2.5 h-2.5 bg-white border-2 border-blue-500 rounded-full -top-0.5 shadow-sm"
          style={{ left: `calc(${position}% - 5px)` }}
        ></div>
      </div>
    </div>
  );
};

const WatchlistPage = () => {
  const [watchlist, setWatchlist] = useLocalStorage('stockpulse_watchlist', []);
  const [quotes, setQuotes] = useState({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [sortBy, setSortBy] = useState('addedAt');
  const [alerts, setAlerts] = useState([]);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  // Fetch live quotes for all watchlist stocks
  const fetchQuotes = useCallback(async (list) => {
    if (list.length === 0) return;
    setLoadingQuotes(true);
    const results = {};
    await Promise.all(
      list.map(async (item) => {
        try {
          const res = await api.get(`/api/stocks/${item.symbol}/quote`);
          results[item.symbol] = res.data;
        } catch {
          results[item.symbol] = null;
        }
      })
    );
    setQuotes(results);
    setLoadingQuotes(false);
  }, []);

  useEffect(() => {
    fetchQuotes(watchlist);
  }, [watchlist, fetchQuotes]);

  // Check price alerts when quotes load
  useEffect(() => {
    if (Object.keys(quotes).length === 0) return;
    const triggered = [];
    watchlist.forEach((item) => {
      const q = quotes[item.symbol];
      if (!q || !q.price) return;
      if (item.alertHigh && q.price >= item.alertHigh) {
        triggered.push(`${item.name || item.symbol.replace('.NS', '')} crossed \u20B9${item.alertHigh} target!`);
      }
      if (item.alertLow && q.price <= item.alertLow) {
        triggered.push(`${item.name || item.symbol.replace('.NS', '')} fell below \u20B9${item.alertLow}!`);
      }
    });
    setAlerts(triggered);
  }, [quotes, watchlist]);

  // Debounced search
  useEffect(() => {
    if (searchInput.trim().length === 0) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/stocks/search?q=${searchInput}`);
        setSearchResults((res.data.results || []).slice(0, 6));
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addToWatchlist = (stock) => {
    if (watchlist.length >= MAX_WATCHLIST) return;
    if (watchlist.some((w) => w.symbol === stock.symbol)) return;
    setWatchlist([
      ...watchlist,
      { symbol: stock.symbol, name: stock.name, alertHigh: null, alertLow: null, addedAt: new Date().toISOString() },
    ]);
    setSearchInput('');
    setShowDropdown(false);
    setSearchResults([]);
  };

  const removeFromWatchlist = (symbol) => {
    setWatchlist(watchlist.filter((w) => w.symbol !== symbol));
    setQuotes((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
  };

  const updateAlert = (symbol, field, value) => {
    const numVal = value === '' ? null : parseFloat(value);
    setWatchlist(watchlist.map((w) => (w.symbol === symbol ? { ...w, [field]: numVal } : w)));
  };

  // Sorted watchlist
  const sortedWatchlist = [...watchlist].sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'price') {
      const pa = quotes[a.symbol]?.price || 0;
      const pb = quotes[b.symbol]?.price || 0;
      return pb - pa;
    }
    if (sortBy === 'changePercent') {
      const ca = quotes[a.symbol]?.change_percent || 0;
      const cb = quotes[b.symbol]?.change_percent || 0;
      return cb - ca;
    }
    // addedAt - most recent first
    return new Date(b.addedAt) - new Date(a.addedAt);
  });

  const alreadyInWatchlist = (symbol) => watchlist.some((w) => w.symbol === symbol);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Watchlist</h1>
            <p className="text-sm text-gray-500 mt-1">
              {watchlist.length} / {MAX_WATCHLIST} stocks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 font-medium">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Alert Banner */}
        {alerts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-amber-800">Price Alerts Triggered</h3>
                <ul className="mt-1 space-y-0.5">
                  {alerts.map((msg, i) => (
                    <li key={i} className="text-sm text-amber-700">{msg}</li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => setAlerts([])}
                className="ml-auto text-amber-400 hover:text-amber-600 focus:outline-none"
                aria-label="Dismiss alerts"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Add Stock Section */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Stock to Watchlist</h2>
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg p-3 pl-10 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Search for stocks (e.g., Reliance, TCS, HDFC)..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                autoComplete="off"
                disabled={watchlist.length >= MAX_WATCHLIST}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); setSearchResults([]); setShowDropdown(false); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  aria-label="Clear search"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
            {watchlist.length >= MAX_WATCHLIST && (
              <p className="text-xs text-red-500 mt-1">Watchlist is full (max {MAX_WATCHLIST} stocks).</p>
            )}

            {showDropdown && searchResults.length > 0 && (
              <ul className="absolute z-50 bg-white border border-gray-200 rounded-lg w-full max-h-64 overflow-auto mt-2 shadow-lg">
                {searchResults.map((stock) => {
                  const exists = alreadyInWatchlist(stock.symbol);
                  return (
                    <button
                      key={stock.symbol}
                      disabled={exists}
                      className={`p-3 flex justify-between items-center w-full text-left border-b border-gray-100 last:border-b-0 transition-colors focus:outline-none ${
                        exists ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-gray-50'
                      }`}
                      onClick={() => !exists && addToWatchlist(stock)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="font-medium text-gray-900 text-sm">{stock.name}</span>
                        <span className="text-xs text-gray-500">({stock.symbol})</span>
                      </div>
                      {exists ? (
                        <span className="text-xs text-gray-400 font-medium ml-2">Added</span>
                      ) : (
                        <svg className="w-5 h-5 text-blue-500 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Watchlist Table */}
        {watchlist.length === 0 ? (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 text-base">Your watchlist is empty. Search and add stocks above.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Stock</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Price</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Change</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">52W Range</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Alert High</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Alert Low</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingQuotes && Object.keys(quotes).length === 0
                    ? watchlist.map((_, i) => <SkeletonRow key={i} />)
                    : sortedWatchlist.map((item) => {
                        const q = quotes[item.symbol];
                        const price = q?.price;
                        const change = q?.change;
                        const changePercent = q?.change_percent;
                        const isPositive = (change || 0) >= 0;
                        const low52 = q?.week52_low || q?.fiftyTwoWeekLow;
                        const high52 = q?.week52_high || q?.fiftyTwoWeekHigh;
                        const highTriggered = item.alertHigh && price && price >= item.alertHigh;
                        const lowTriggered = item.alertLow && price && price <= item.alertLow;

                        return (
                          <tr key={item.symbol} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <Link to={`/stock/${item.symbol}`} className="hover:text-blue-600 transition-colors">
                                <div className="font-semibold text-gray-900 text-sm">{item.name}</div>
                                <div className="text-xs text-gray-500">{item.symbol?.replace('.NS', '')}</div>
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {price != null ? (
                                <span className="font-bold text-gray-900">
                                  {'\u20B9'}{price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-gray-400">--</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {change != null ? (
                                <div>
                                  <span className={`font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                    {isPositive ? '+' : ''}{change.toFixed(2)}
                                  </span>
                                  <div className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                    ({isPositive ? '+' : ''}{changePercent?.toFixed(2)}%)
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400">--</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-center">
                                <PriceRangeBar low={low52} high={high52} current={price} />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  value={item.alertHigh ?? ''}
                                  onChange={(e) => updateAlert(item.symbol, 'alertHigh', e.target.value)}
                                  placeholder="--"
                                  className={`w-20 text-xs text-center border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                    highTriggered ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
                                  }`}
                                />
                                {highTriggered && (
                                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  value={item.alertLow ?? ''}
                                  onChange={(e) => updateAlert(item.symbol, 'alertLow', e.target.value)}
                                  placeholder="--"
                                  className={`w-20 text-xs text-center border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                    lowTriggered ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
                                  }`}
                                />
                                {lowTriggered && (
                                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => removeFromWatchlist(item.symbol)}
                                className="text-gray-400 hover:text-red-500 transition-colors focus:outline-none"
                                aria-label={`Remove ${item.name}`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Watchlist News */}
        {watchlist.length > 0 && <WatchlistNews watchlist={watchlist} />}
      </main>
    </div>
  );
};

// ===== Watchlist News Component =====
const WatchlistNews = ({ watchlist }) => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (watchlist.length === 0) return;
    const fetchNews = async () => {
      setLoading(true);
      const allArticles = [];
      const seen = new Set();
      const symbols = watchlist.slice(0, 8).map(w => w.symbol);

      await Promise.all(symbols.map(async (sym) => {
        try {
          const res = await api.get(`/api/stocks/news/${sym}`);
          const stockLabel = sym.replace('.NS', '').replace('.BO', '');
          (res.data.articles || []).forEach(a => {
            if (!seen.has(a.title)) {
              seen.add(a.title);
              allArticles.push({ ...a, forStock: stockLabel });
            }
          });
        } catch {}
      }));
      allArticles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
      setNews(allArticles.slice(0, 10));
      setLoading(false);
    };
    fetchNews();
  }, [watchlist]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffH = Math.floor((now - date) / (1000 * 60 * 60));
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mt-6">
        <div className="h-4 bg-gray-200 rounded w-48 mb-4 animate-pulse"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-16 h-12 bg-gray-200 rounded flex-shrink-0"></div>
              <div className="flex-1">
                <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-2 bg-gray-200 rounded w-1/3"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (news.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mt-6">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-800">News for Your Watchlist</h3>
        <Link to="/news" className="text-xs text-blue-600 hover:text-blue-800 font-medium">All news</Link>
      </div>
      <div className="space-y-2">
        {news.map((article, idx) => (
          <a key={idx} href={article.url} target="_blank" rel="noopener noreferrer"
            className="flex gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group">
            {article.image ? (
              <div className="w-16 h-12 flex-shrink-0 rounded overflow-hidden bg-gray-100">
                <img src={article.image} alt="" className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
            ) : (
              <div className="w-16 h-12 flex-shrink-0 rounded bg-gray-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                    d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-900 font-medium group-hover:text-blue-600 transition-colors line-clamp-1">
                {article.title}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">
                  {article.forStock}
                </span>
                <span className="text-[10px] text-gray-400">
                  {article.source} · {formatDate(article.published_at)}
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>

      <style>{`
        .line-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
};

export default WatchlistPage;
