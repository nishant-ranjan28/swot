import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import StockSearch from './StockSearch';
import { useMarket } from '../context/MarketContext';

const formatNumber = (num) => {
  if (!num) return 'N/A';
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e7) return `${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `${(num / 1e5).toFixed(2)}L`;
  return num.toLocaleString('en-IN');
};

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

const MARKET_CONFIG = {
  in: { timezone: 'Asia/Kolkata', label: 'IST', openH: 9, openM: 15, closeH: 15, closeM: 30 },
  us: { timezone: 'America/New_York', label: 'ET', openH: 9, openM: 30, closeH: 16, closeM: 0 },
};

const MarketStatus = () => {
  const { market } = useMarket();
  const [status, setStatus] = useState({ isOpen: false, text: '', time: '' });

  useEffect(() => {
    const checkStatus = () => {
      const config = MARKET_CONFIG[market] || MARKET_CONFIG.in;
      const now = new Date();
      const local = new Date(now.toLocaleString('en-US', { timeZone: config.timezone }));
      const hours = local.getHours();
      const minutes = local.getMinutes();
      const day = local.getDay();
      const timeInMinutes = hours * 60 + minutes;
      const marketOpen = config.openH * 60 + config.openM;
      const marketClose = config.closeH * 60 + config.closeM;
      const isWeekday = day >= 1 && day <= 5;
      const isOpen = isWeekday && timeInMinutes >= marketOpen && timeInMinutes <= marketClose;

      const timeStr = local.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone });

      if (!isWeekday) {
        setStatus({ isOpen: false, text: 'Weekend - Market Closed', time: `${config.label} ${timeStr}` });
      } else if (timeInMinutes < marketOpen) {
        const minsToOpen = marketOpen - timeInMinutes;
        const h = Math.floor(minsToOpen / 60);
        const m = minsToOpen % 60;
        setStatus({ isOpen: false, text: `Pre-market - Opens in ${h}h ${m}m`, time: `${config.label} ${timeStr}` });
      } else if (isOpen) {
        const minsToClose = marketClose - timeInMinutes;
        const h = Math.floor(minsToClose / 60);
        const m = minsToClose % 60;
        setStatus({ isOpen: true, text: `Market Open - Closes in ${h}h ${m}m`, time: `${config.label} ${timeStr}` });
      } else {
        setStatus({ isOpen: false, text: 'Market Closed', time: `${config.label} ${timeStr}` });
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [market]);

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

const IndexCard = ({ index }) => {
  const isPositive = index.change >= 0;
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="text-sm text-gray-500 font-medium">{index.name}</div>
      <div className="text-xl font-bold text-gray-900 mt-1">
        {index.price?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className={`text-sm font-semibold mt-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? '+' : ''}{index.change?.toFixed(2)} ({isPositive ? '+' : ''}{index.change_percent?.toFixed(2)}%)
      </div>
    </div>
  );
};

const PriceRangeBar = ({ low, high, current, currencySymbol = '₹' }) => {
  if (!low || !high || !current || high === low) return null;
  const position = Math.min(Math.max(((current - low) / (high - low)) * 100, 0), 100);
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
        <span>{currencySymbol}{low.toFixed(0)}</span>
        <span className="text-[10px] text-gray-300">52W Range</span>
        <span>{currencySymbol}{high.toFixed(0)}</span>
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

const StockCard = ({ stock }) => {
  const isPositive = stock.change >= 0;
  return (
    <Link
      to={`/stock/${stock.symbol}`}
      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 block"
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-900 truncate">{stock.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">{stock.symbol?.replace('.NS', '')}</div>
        </div>
        <div className="text-right ml-3">
          <div className="text-sm font-bold text-gray-900">
            {stock.currency === 'USD' ? '$' : '₹'}{stock.price?.toLocaleString(stock.currency === 'USD' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={`text-xs font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{stock.change_percent?.toFixed(2)}%
          </div>
        </div>
      </div>
      <PriceRangeBar low={stock.week52_low} high={stock.week52_high} current={stock.price} currencySymbol={stock.currency === 'USD' ? '$' : '₹'} />
      <div className="mt-2 flex justify-between text-xs text-gray-400">
        <span>Vol: {formatNumber(stock.volume)}</span>
        <span>MCap: {formatNumber(stock.market_cap)}</span>
      </div>
    </Link>
  );
};

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
    <div className="flex justify-between">
      <div>
        <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-16"></div>
      </div>
      <div className="text-right">
        <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-12 ml-auto"></div>
      </div>
    </div>
    <div className="mt-3 h-1.5 bg-gray-200 rounded-full"></div>
    <div className="mt-2 flex justify-between">
      <div className="h-3 bg-gray-200 rounded w-16"></div>
      <div className="h-3 bg-gray-200 rounded w-20"></div>
    </div>
  </div>
);

const NewsCard = ({ article }) => (
  <a
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
);

const SECTORS_BY_MARKET = {
  in: ['All', 'Banking', 'IT', 'Energy', 'Auto', 'FMCG', 'Pharma', 'Metals'],
  us: ['All', 'Tech', 'Finance', 'Healthcare', 'Consumer', 'Energy', 'Industrial'],
};

const STOCK_SECTORS = {
  // India
  'RELIANCE.NS': 'Energy', 'TCS.NS': 'IT', 'HDFCBANK.NS': 'Banking', 'INFY.NS': 'IT',
  'ICICIBANK.NS': 'Banking', 'HINDUNILVR.NS': 'FMCG', 'SBIN.NS': 'Banking', 'BHARTIARTL.NS': 'Telecom',
  'ITC.NS': 'FMCG', 'KOTAKBANK.NS': 'Banking', 'LT.NS': 'Infra', 'TMCV.NS': 'Auto',
  'AXISBANK.NS': 'Banking', 'BAJFINANCE.NS': 'Finance', 'MARUTI.NS': 'Auto', 'WIPRO.NS': 'IT',
  'ADANIENT.NS': 'Energy', 'TATAPOWER.NS': 'Energy', 'TATASTEEL.NS': 'Metals', 'HCLTECH.NS': 'IT',
  // US
  'AAPL': 'Tech', 'MSFT': 'Tech', 'GOOGL': 'Tech', 'AMZN': 'Consumer', 'NVDA': 'Tech',
  'META': 'Tech', 'TSLA': 'Consumer', 'BRK-B': 'Finance', 'JPM': 'Finance', 'V': 'Finance',
  'UNH': 'Healthcare', 'JNJ': 'Healthcare', 'WMT': 'Consumer', 'MA': 'Finance', 'PG': 'Consumer',
  'HD': 'Consumer', 'DIS': 'Consumer', 'NFLX': 'Tech', 'CRM': 'Tech', 'AMD': 'Tech',
};

const HomePage = () => {
  const { market, currency, marketLabel } = useMarket();
  const [indices, setIndices] = useState([]);
  const [trendingStocks, setTrendingStocks] = useState([]);
  const [loadingIndices, setLoadingIndices] = useState(true);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [gainers, setGainers] = useState([]);
  const [losers, setLosers] = useState([]);
  const [news, setNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [activeSector, setActiveSector] = useState('All');
  const [sentiment, setSentiment] = useState(null);
  const [globalIndices, setGlobalIndices] = useState([]);
  const [loadingGlobal, setLoadingGlobal] = useState(true);

  useEffect(() => {
    setLoadingIndices(true);
    setLoadingStocks(true);
    setLoadingNews(true);
    setSentiment(null);
    setActiveSector('All');

    api.get(`/api/stocks/indices?market=${market}`)
      .then((res) => setIndices(res.data.indices || []))
      .catch((err) => console.error('Failed to load indices:', err))
      .finally(() => setLoadingIndices(false));

    api.get(`/api/stocks/trending?market=${market}`)
      .then((res) => {
        const stocks = res.data.stocks || [];
        setTrendingStocks(stocks);
        const sorted = [...stocks].sort((a, b) => (b.change_percent || 0) - (a.change_percent || 0));
        setGainers(sorted.filter(s => s.change_percent > 0).slice(0, 5));
        setLosers(sorted.filter(s => s.change_percent < 0).reverse().slice(0, 5));
      })
      .catch((err) => console.error('Failed to load trending:', err))
      .finally(() => setLoadingStocks(false));

    api.get(`/api/stocks/news?market=${market}`)
      .then((res) => setNews((res.data.articles || []).slice(0, 4)))
      .catch((err) => console.error('Failed to load news:', err))
      .finally(() => setLoadingNews(false));

    api.get(`/api/stocks/sentiment?market=${market}`)
      .then((res) => setSentiment(res.data))
      .catch((err) => console.error('Failed to load sentiment:', err));

    // Global indices — always fetched regardless of market toggle
    setLoadingGlobal(true);
    api.get('/api/stocks/indices?market=global')
      .then((res) => setGlobalIndices(res.data.indices || []))
      .catch((err) => console.error('Failed to load global indices:', err))
      .finally(() => setLoadingGlobal(false));
  }, [market]);

  const filteredStocks = activeSector === 'All'
    ? trendingStocks
    : trendingStocks.filter(s => STOCK_SECTORS[s.symbol] === activeSector);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-6">
        {/* Hero Section */}
        <div className="text-center py-6 md:py-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            StockPulse
          </h1>
          <p className="text-gray-500 text-base md:text-lg mb-4">
            Search any {marketLabel} stock for in-depth analysis, financials, and more
          </p>
          <div className="mb-4">
            <MarketStatus />
          </div>
          <div className="max-w-2xl mx-auto">
            <StockSearch className="w-full" />
          </div>
        </div>

        {/* Market Indices */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Market Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {loadingIndices
              ? [...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl p-4 shadow-sm animate-pulse">
                    <div className="h-3 bg-gray-200 rounded w-20 mb-2"></div>
                    <div className="h-5 bg-gray-200 rounded w-28 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                  </div>
                ))
              : indices.map((idx) => <IndexCard key={idx.symbol} index={idx} />)
            }
          </div>
        </section>

        {/* Market Sentiment */}
        {sentiment && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Market Sentiment</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Sentiment Gauge */}
              <div className="text-center">
                <div className="relative w-24 h-24 mx-auto">
                  <svg width="96" height="96" className="-rotate-90">
                    <circle cx="48" cy="48" r="38" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                    <circle cx="48" cy="48" r="38" fill="none"
                      stroke={sentiment.score >= 55 ? '#16a34a' : sentiment.score >= 45 ? '#eab308' : '#dc2626'}
                      strokeWidth="8"
                      strokeDasharray={`${((Number.isFinite(sentiment.score) ? sentiment.score : 50) / 100) * 2 * Math.PI * 38} ${2 * Math.PI * 38}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold" style={{
                      color: sentiment.score >= 55 ? '#16a34a' : sentiment.score >= 45 ? '#eab308' : '#dc2626'
                    }}>{sentiment.score}</span>
                  </div>
                </div>
                <div className={`text-sm font-bold mt-1 ${
                  sentiment.overall.includes('Bullish') ? 'text-green-600' :
                  sentiment.overall.includes('Bearish') ? 'text-red-600' : 'text-yellow-600'
                }`}>{sentiment.overall}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">Sentiment Score</div>
              </div>

              {/* India VIX */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 font-medium">{sentiment.vix?.name || 'VIX'} (Fear Gauge)</div>
                <div className="text-xl font-bold text-gray-900 mt-1">{sentiment.vix?.value?.toFixed(2)}</div>
                <div className={`text-xs font-semibold ${sentiment.vix?.change >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {sentiment.vix?.change >= 0 ? '+' : ''}{sentiment.vix?.change?.toFixed(2)}
                </div>
                <div className={`text-xs font-medium mt-1 px-2 py-0.5 rounded-full inline-block ${
                  sentiment.vix?.signal === 'Extreme Fear' ? 'bg-red-100 text-red-700' :
                  sentiment.vix?.signal === 'Fear' ? 'bg-orange-100 text-orange-700' :
                  sentiment.vix?.signal === 'Neutral' ? 'bg-yellow-100 text-yellow-700' :
                  sentiment.vix?.signal === 'Greed' ? 'bg-green-100 text-green-700' :
                  'bg-green-200 text-green-800'
                }`}>{sentiment.vix?.signal}</div>
                <div className="text-[10px] text-gray-400 mt-1">High VIX = High Fear</div>
              </div>

              {/* NIFTY Trend */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 font-medium">{sentiment.index?.name || 'Index'} Trend</div>
                <div className="space-y-1.5 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">50 DMA</span>
                    <span className={`text-xs font-semibold ${sentiment.index?.above_50dma ? 'text-green-600' : 'text-red-600'}`}>
                      {sentiment.index?.above_50dma ? 'Above' : 'Below'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">200 DMA</span>
                    <span className={`text-xs font-semibold ${sentiment.index?.above_200dma ? 'text-green-600' : 'text-red-600'}`}>
                      {sentiment.index?.above_200dma ? 'Above' : 'Below'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">From 52W High</span>
                    <span className="text-xs font-semibold text-red-600">-{sentiment.index?.pct_from_52w_high}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">From 52W Low</span>
                    <span className="text-xs font-semibold text-green-600">+{sentiment.index?.pct_from_52w_low}%</span>
                  </div>
                </div>
              </div>

              {/* Market Breadth */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 font-medium">Market Breadth</div>
                <div className="mt-2">
                  <div className="flex h-4 rounded-full overflow-hidden">
                    <div className="bg-green-500" style={{ width: `${sentiment.breadth?.pct || 50}%` }}></div>
                    <div className="bg-red-500" style={{ width: `${100 - (sentiment.breadth?.pct || 50)}%` }}></div>
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-xs text-green-600 font-semibold">{sentiment.breadth?.gainers} Advancing</span>
                    <span className="text-xs text-red-600 font-semibold">{sentiment.breadth?.losers} Declining</span>
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 mt-2">
                  Based on {sentiment.breadth?.total} tracked stocks
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Global Markets */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Global Markets</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {loadingGlobal
              ? [...Array(5)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl p-4 shadow-sm animate-pulse">
                    <div className="h-3 bg-gray-200 rounded w-20 mb-2"></div>
                    <div className="h-5 bg-gray-200 rounded w-28 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                  </div>
                ))
              : globalIndices.map((idx) => <IndexCard key={idx.symbol} index={idx} />)
            }
          </div>
        </section>

        {/* Top Gainers & Losers + Latest News side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gainers & Losers */}
          <div className="lg:col-span-2">
            {!loadingStocks && (gainers.length > 0 || losers.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {gainers.length > 0 && (
                  <section>
                    <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                      <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                      Top Gainers
                    </h2>
                    <div className="space-y-2">
                      {gainers.map((stock) => (
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
                            <div className="text-sm font-bold">{currency}{stock.price?.toFixed(2)}</div>
                            <div className="text-xs font-semibold text-green-600">+{stock.change_percent?.toFixed(2)}%</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {losers.length > 0 && (
                  <section>
                    <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                      <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                      Top Losers
                    </h2>
                    <div className="space-y-2">
                      {losers.map((stock) => (
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
                            <div className="text-sm font-bold">{currency}{stock.price?.toFixed(2)}</div>
                            <div className="text-xs font-semibold text-red-600">{stock.change_percent?.toFixed(2)}%</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>

          {/* Latest News */}
          <section>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Latest News</h2>
              <Link to="/news" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                View all
              </Link>
            </div>
            {loadingNews ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
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
              <div className="space-y-3">
                {news.map((article, idx) => (
                  <NewsCard key={idx} article={article} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Popular Stocks with Sector Filter */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Popular Stocks</h2>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {(SECTORS_BY_MARKET[market] || SECTORS_BY_MARKET.in).map((sector) => (
                <button
                  key={sector}
                  onClick={() => setActiveSector(sector)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    activeSector === sector
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {sector}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {loadingStocks
              ? [...Array(8)].map((_, i) => <SkeletonCard key={i} />)
              : filteredStocks.length > 0
                ? filteredStocks.map((stock) => <StockCard key={stock.symbol} stock={stock} />)
                : (
                  <div className="col-span-full text-center py-8 text-gray-400 text-sm">
                    No stocks found in {activeSector} sector
                  </div>
                )
            }
          </div>
        </section>

        {/* Quick Links */}
        <section className="pb-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Explore</h2>
            <div className="flex flex-wrap gap-2">
              {(market === 'us'
                ? ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'NFLX', 'AMD']
                : ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'TMCV', 'SBIN', 'ITC', 'WIPRO', 'ADANIENT', 'BAJFINANCE']
              ).map((sym) => (
                <Link
                  key={sym}
                  to={`/stock/${market === 'us' ? sym : `${sym}.NS`}`}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-blue-100 hover:text-blue-700 transition-colors"
                >
                  {sym}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <style>{`
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
};

export default HomePage;
