import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useLocalStorage } from '../hooks/useLocalStorage';

const COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
  'bg-pink-500', 'bg-indigo-500', 'bg-red-500', 'bg-teal-500',
];

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
};

const MarketStatus = () => {
  const [status, setStatus] = useState({ isOpen: false, text: '', time: '' });

  useEffect(() => {
    const checkStatus = () => {
      const now = new Date();
      const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const hours = ist.getHours();
      const minutes = ist.getMinutes();
      const day = ist.getDay();
      const timeInMinutes = hours * 60 + minutes;
      const marketOpen = 9 * 60 + 15;
      const marketClose = 15 * 60 + 30;
      const isWeekday = day >= 1 && day <= 5;
      const isOpen = isWeekday && timeInMinutes >= marketOpen && timeInMinutes <= marketClose;

      const timeStr = ist.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

      if (!isWeekday) {
        setStatus({ isOpen: false, text: 'Weekend - Market Closed', time: timeStr });
      } else if (timeInMinutes < marketOpen) {
        const minsToOpen = marketOpen - timeInMinutes;
        const h = Math.floor(minsToOpen / 60);
        const m = minsToOpen % 60;
        setStatus({ isOpen: false, text: `Pre-market - Opens in ${h}h ${m}m`, time: timeStr });
      } else if (isOpen) {
        const minsToClose = marketClose - timeInMinutes;
        const h = Math.floor(minsToClose / 60);
        const m = minsToClose % 60;
        setStatus({ isOpen: true, text: `Market Open - Closes in ${h}h ${m}m`, time: timeStr });
      } else {
        setStatus({ isOpen: false, text: 'Market Closed', time: timeStr });
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
      status.isOpen ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
    }`}>
      <span className={`w-2 h-2 rounded-full ${status.isOpen ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
      {status.text}
      <span className="text-gray-400 ml-1">IST {status.time}</span>
    </div>
  );
};

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
    <div className="h-3 bg-gray-200 rounded w-20 mb-2"></div>
    <div className="h-5 bg-gray-200 rounded w-28 mb-2"></div>
    <div className="h-3 bg-gray-200 rounded w-24"></div>
  </div>
);

const SkeletonRow = () => (
  <div className="flex justify-between items-center bg-white rounded-lg p-3 shadow-sm border border-gray-100 animate-pulse">
    <div>
      <div className="h-4 bg-gray-200 rounded w-24 mb-1"></div>
      <div className="h-3 bg-gray-200 rounded w-16"></div>
    </div>
    <div className="text-right">
      <div className="h-4 bg-gray-200 rounded w-20 mb-1"></div>
      <div className="h-3 bg-gray-200 rounded w-12 ml-auto"></div>
    </div>
  </div>
);

const MarketPulsePage = () => {
  const [watchlist] = useLocalStorage('stockpulse_watchlist', []);
  const [portfolio] = useLocalStorage('stockpulse_portfolio', []);

  const [indices, setIndices] = useState([]);
  const [loadingIndices, setLoadingIndices] = useState(true);

  const [watchlistQuotes, setWatchlistQuotes] = useState([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);

  const [trending, setTrending] = useState({ gainers: [], losers: [] });
  const [loadingTrending, setLoadingTrending] = useState(true);

  const [news, setNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(true);

  const [portfolioSummary, setPortfolioSummary] = useState(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);

  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoadingIndices(true);
    setLoadingTrending(true);
    setLoadingNews(true);

    // Indices
    api.get('/api/stocks/indices')
      .then((res) => setIndices(res.data.indices || []))
      .catch((err) => console.error('Failed to load indices:', err))
      .finally(() => setLoadingIndices(false));

    // Trending
    api.get('/api/stocks/trending')
      .then((res) => {
        const stocks = res.data.stocks || [];
        const sorted = [...stocks].sort((a, b) => (b.change_percent || 0) - (a.change_percent || 0));
        setTrending({
          gainers: sorted.filter(s => s.change_percent > 0).slice(0, 5),
          losers: sorted.filter(s => s.change_percent < 0).reverse().slice(0, 5),
        });
      })
      .catch((err) => console.error('Failed to load trending:', err))
      .finally(() => setLoadingTrending(false));

    // News
    api.get('/api/stocks/news')
      .then((res) => setNews((res.data.articles || []).slice(0, 5)))
      .catch((err) => console.error('Failed to load news:', err))
      .finally(() => setLoadingNews(false));

    // Watchlist quotes
    if (watchlist.length > 0) {
      setLoadingWatchlist(true);
      Promise.all(
        watchlist.map(async (item) => {
          const symbol = typeof item === 'string' ? item : item.symbol;
          try {
            const res = await api.get(`/api/stocks/${symbol}/quote`);
            return {
              symbol,
              name: res.data.name || symbol.replace('.NS', ''),
              price: res.data.price,
              change: res.data.change,
              change_percent: res.data.change_percent,
            };
          } catch {
            return { symbol, name: symbol.replace('.NS', ''), price: null, change: 0, change_percent: 0 };
          }
        })
      )
        .then(setWatchlistQuotes)
        .finally(() => setLoadingWatchlist(false));
    }

    // Portfolio summary
    if (portfolio.length > 0) {
      setLoadingPortfolio(true);
      Promise.all(
        portfolio.map(async (holding) => {
          const symbol = typeof holding === 'string' ? holding : holding.symbol;
          const qty = holding.quantity || holding.qty || 1;
          const avgPrice = holding.avgPrice || holding.avg_price || holding.buyPrice || 0;
          try {
            const res = await api.get(`/api/stocks/${symbol}/quote`);
            return {
              symbol,
              name: res.data.name || symbol.replace('.NS', ''),
              quantity: qty,
              avgPrice,
              currentPrice: res.data.price || 0,
              change: res.data.change || 0,
              change_percent: res.data.change_percent || 0,
            };
          } catch {
            return {
              symbol,
              name: symbol.replace('.NS', ''),
              quantity: qty,
              avgPrice,
              currentPrice: avgPrice,
              change: 0,
              change_percent: 0,
            };
          }
        })
      )
        .then((holdings) => {
          const totalInvested = holdings.reduce((sum, h) => sum + h.avgPrice * h.quantity, 0);
          const currentValue = holdings.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0);
          const totalPnL = currentValue - totalInvested;
          const dayPnL = holdings.reduce((sum, h) => sum + (h.change || 0) * h.quantity, 0);
          setPortfolioSummary({ holdings, totalInvested, currentValue, totalPnL, dayPnL });
        })
        .finally(() => setLoadingPortfolio(false));
    }

    setLastUpdated(new Date());
  }, [watchlist, portfolio]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const watchlistGainers = [...watchlistQuotes]
    .filter(s => s.price !== null && s.change_percent > 0)
    .sort((a, b) => b.change_percent - a.change_percent)
    .slice(0, 3);

  const watchlistLosers = [...watchlistQuotes]
    .filter(s => s.price !== null && s.change_percent < 0)
    .sort((a, b) => a.change_percent - b.change_percent)
    .slice(0, 3);

  const hasWatchlist = watchlist.length > 0;
  const hasPortfolio = portfolio.length > 0;
  const showOnboarding = !hasWatchlist && !hasPortfolio;

  const targetIndices = ['NIFTY 50', 'SENSEX', 'NIFTY BANK', 'NIFTY IT'];
  const filteredIndices = indices.filter(idx =>
    targetIndices.some(t => idx.name?.toUpperCase().includes(t.toUpperCase()))
  );
  const displayIndices = filteredIndices.length > 0 ? filteredIndices : indices.slice(0, 4);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Market Pulse</h1>
            <p className="text-sm text-gray-500 mt-1">Your personalized daily market briefing</p>
          </div>
          <div className="flex items-center gap-3">
            <MarketStatus />
            <button
              onClick={fetchAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {lastUpdated && (
          <p className="text-xs text-gray-400 -mt-4">
            Last updated: {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        )}

        {/* Market Overview */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Market Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {loadingIndices
              ? [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
              : displayIndices.map((idx) => {
                  const isPositive = idx.change >= 0;
                  return (
                    <div key={idx.symbol || idx.name} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                      <div className="text-sm text-gray-500 font-medium">{idx.name}</div>
                      <div className="text-xl font-bold text-gray-900 mt-1">
                        {idx.price?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className={`text-sm font-semibold mt-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? '+' : ''}{idx.change?.toFixed(2)} ({isPositive ? '+' : ''}{idx.change_percent?.toFixed(2)}%)
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </section>

        {/* Personalization Onboarding */}
        {showOnboarding && (
          <section className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
            <div className="text-center max-w-lg mx-auto">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Personalize Your Market Pulse</h3>
              <p className="text-sm text-gray-600 mb-4">
                Add stocks to your watchlist and portfolio to see personalized insights here
              </p>
              <div className="flex justify-center gap-3">
                <Link
                  to="/watchlist"
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors focus:outline-none"
                >
                  Set Up Watchlist
                </Link>
                <Link
                  to="/portfolio"
                  className="px-4 py-2 bg-white text-blue-600 text-sm font-medium rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors focus:outline-none"
                >
                  Add Portfolio
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Watchlist + Portfolio row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Watchlist Movers */}
          {hasWatchlist && (
            <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Watchlist Movers</h2>
                <Link to="/watchlist" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  View all
                </Link>
              </div>
              {loadingWatchlist ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {watchlistGainers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span className="text-sm font-medium text-gray-600">Top Gainers</span>
                      </div>
                      <div className="space-y-1.5">
                        {watchlistGainers.map((stock) => (
                          <Link
                            key={stock.symbol}
                            to={`/stock/${stock.symbol}`}
                            className="flex justify-between items-center rounded-lg p-2.5 hover:bg-gray-50 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">{stock.name}</div>
                              <div className="text-xs text-gray-400">{stock.symbol?.replace('.NS', '')}</div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="text-sm font-bold text-gray-900">
                                {'\u20B9'}{stock.price?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div className="text-xs font-semibold text-green-600">
                                +{stock.change_percent?.toFixed(2)}%
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {watchlistLosers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                        <span className="text-sm font-medium text-gray-600">Top Losers</span>
                      </div>
                      <div className="space-y-1.5">
                        {watchlistLosers.map((stock) => (
                          <Link
                            key={stock.symbol}
                            to={`/stock/${stock.symbol}`}
                            className="flex justify-between items-center rounded-lg p-2.5 hover:bg-gray-50 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">{stock.name}</div>
                              <div className="text-xs text-gray-400">{stock.symbol?.replace('.NS', '')}</div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="text-sm font-bold text-gray-900">
                                {'\u20B9'}{stock.price?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div className="text-xs font-semibold text-red-600">
                                {stock.change_percent?.toFixed(2)}%
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {watchlistGainers.length === 0 && watchlistLosers.length === 0 && (
                    <p className="text-sm text-gray-400 col-span-full text-center py-4">No movers in your watchlist today</p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Portfolio Summary */}
          {hasPortfolio && (
            <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Portfolio Summary</h2>
                <Link to="/portfolio" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  View full portfolio
                </Link>
              </div>
              {loadingPortfolio || !portfolioSummary ? (
                <div className="space-y-3 animate-pulse">
                  <div className="grid grid-cols-2 gap-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-3">
                        <div className="h-3 bg-gray-200 rounded w-16 mb-2"></div>
                        <div className="h-5 bg-gray-200 rounded w-24"></div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">Invested</div>
                      <div className="text-base font-bold text-gray-900">
                        {'\u20B9'}{portfolioSummary.totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">Current Value</div>
                      <div className="text-base font-bold text-gray-900">
                        {'\u20B9'}{portfolioSummary.currentValue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">Total P&L</div>
                      <div className={`text-base font-bold ${portfolioSummary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {portfolioSummary.totalPnL >= 0 ? '+' : ''}{'\u20B9'}{portfolioSummary.totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">Day's P&L</div>
                      <div className={`text-base font-bold ${portfolioSummary.dayPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {portfolioSummary.dayPnL >= 0 ? '+' : ''}{'\u20B9'}{portfolioSummary.dayPnL.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>

                  {/* Mini Allocation Bar */}
                  {portfolioSummary.currentValue > 0 && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1.5">Allocation</div>
                      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                        {portfolioSummary.holdings
                          .sort((a, b) => (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity))
                          .slice(0, 8)
                          .map((h, i) => {
                            const pct = ((h.currentPrice * h.quantity) / portfolioSummary.currentValue) * 100;
                            return (
                              <div
                                key={h.symbol}
                                className={`${COLORS[i % COLORS.length]} transition-all`}
                                style={{ width: `${pct}%` }}
                                title={`${h.symbol.replace('.NS', '')}: ${pct.toFixed(1)}%`}
                              ></div>
                            );
                          })}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                        {portfolioSummary.holdings
                          .sort((a, b) => (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity))
                          .slice(0, 8)
                          .map((h, i) => (
                            <div key={h.symbol} className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${COLORS[i % COLORS.length]}`}></span>
                              <span className="text-[10px] text-gray-500">{h.symbol.replace('.NS', '')}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>

        {/* Top Market Movers */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Top Market Movers</h2>
          {loadingTrending ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">{[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}</div>
              <div className="space-y-2">{[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {trending.gainers.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span className="text-sm font-medium text-gray-600">Top 5 Gainers</span>
                  </div>
                  <div className="space-y-2">
                    {trending.gainers.map((stock) => (
                      <Link
                        key={stock.symbol}
                        to={`/stock/${stock.symbol}`}
                        className="flex justify-between items-center bg-white rounded-lg p-3 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{stock.name}</div>
                          <div className="text-xs text-gray-500">{stock.symbol?.replace('.NS', '')}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">{'\u20B9'}{stock.price?.toFixed(2)}</div>
                          <div className="text-xs font-semibold text-green-600">+{stock.change_percent?.toFixed(2)}%</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {trending.losers.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    <span className="text-sm font-medium text-gray-600">Top 5 Losers</span>
                  </div>
                  <div className="space-y-2">
                    {trending.losers.map((stock) => (
                      <Link
                        key={stock.symbol}
                        to={`/stock/${stock.symbol}`}
                        className="flex justify-between items-center bg-white rounded-lg p-3 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{stock.name}</div>
                          <div className="text-xs text-gray-500">{stock.symbol?.replace('.NS', '')}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">{'\u20B9'}{stock.price?.toFixed(2)}</div>
                          <div className="text-xs font-semibold text-red-600">{stock.change_percent?.toFixed(2)}%</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Latest Headlines */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Latest Headlines</h2>
            <Link to="/news" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
              View all news
            </Link>
          </div>
          {loadingNews ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-3 bg-white rounded-lg p-3 shadow-sm animate-pulse">
                  <div className="w-20 h-16 bg-gray-200 rounded-md flex-shrink-0"></div>
                  <div className="flex-1">
                    <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/3"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {news.map((article, idx) => (
                <a
                  key={idx}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 bg-white rounded-lg p-3 shadow-sm border border-gray-100 hover:shadow-md transition-shadow group"
                >
                  {article.image ? (
                    <div className="w-20 h-16 flex-shrink-0 rounded-md overflow-hidden bg-gray-100">
                      <img src={article.image} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                    </div>
                  ) : (
                    <div className="w-20 h-16 flex-shrink-0 rounded-md bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">{article.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-blue-600 font-medium">{article.source}</span>
                      <span className="text-[10px] text-gray-400">{formatDate(article.published_at)}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </main>

      <style>{`
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
};

export default MarketPulsePage;
