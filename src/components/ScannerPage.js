import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const formatNumber = (num) => {
  if (!num) return 'N/A';
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e7) return `${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `${(num / 1e5).toFixed(2)}L`;
  return num.toLocaleString('en-IN');
};

const PriceRangeBar = ({ low, high, current, theme }) => {
  if (!low || !high || !current || high === low) return null;
  const position = Math.min(Math.max(((current - low) / (high - low)) * 100, 0), 100);
  const gradientClass = theme === 'green'
    ? 'from-yellow-400 via-green-400 to-green-500'
    : 'from-red-500 via-red-400 to-yellow-400';
  const markerClass = theme === 'green' ? 'border-green-500' : 'border-red-500';

  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
        <span>{low.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</span>
        <span className="text-[10px] text-gray-300">52W Range</span>
        <span>{high.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</span>
      </div>
      <div className="relative h-1.5 bg-gray-200 rounded-full">
        <div
          className={`absolute h-1.5 bg-gradient-to-r ${gradientClass} rounded-full`}
          style={{ width: '100%' }}
        ></div>
        <div
          className={`absolute w-2.5 h-2.5 bg-white border-2 ${markerClass} rounded-full -top-0.5 shadow-sm`}
          style={{ left: `calc(${position}% - 5px)` }}
        ></div>
      </div>
    </div>
  );
};

const StockCard = ({ stock, type }) => {
  const isNearHigh = type === 'high';
  const theme = isNearHigh ? 'green' : 'red';
  const isPositive = (stock.change_percent || 0) >= 0;

  const badgeText = isNearHigh
    ? `${Math.abs(stock.pct_from_high || 0).toFixed(1)}% from 52W High`
    : `${Math.abs(stock.pct_from_low || 0).toFixed(1)}% from 52W Low`;

  const badgeClass = isNearHigh
    ? 'bg-green-50 text-green-700 border-green-200'
    : 'bg-red-50 text-red-700 border-red-200';

  const borderHoverClass = isNearHigh
    ? 'hover:border-green-200'
    : 'hover:border-red-200';

  return (
    <Link
      to={`/stock/${stock.symbol}`}
      className={`bg-white rounded-xl p-4 shadow-sm border border-gray-100 ${borderHoverClass} hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 block`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-900 truncate">{stock.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">{stock.symbol?.replace('.NS', '')}</div>
          {stock.sector && (
            <div className="text-[10px] text-gray-400 mt-0.5">{stock.sector}</div>
          )}
        </div>
        <div className="text-right ml-3">
          <div className="text-sm font-bold text-gray-900">
            {stock.price?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={`text-xs font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{stock.change_percent?.toFixed(2)}%
          </div>
        </div>
      </div>

      <PriceRangeBar low={stock.week52_low} high={stock.week52_high} current={stock.price} theme={theme} />

      <div className="mt-2 flex justify-between items-center">
        <span className="text-xs text-gray-400">MCap: {formatNumber(stock.market_cap)}</span>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${badgeClass}`}>
          {badgeText}
        </span>
      </div>
    </Link>
  );
};

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
    <div className="flex justify-between">
      <div>
        <div className="h-4 bg-gray-200 rounded w-28 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-16 mb-1"></div>
        <div className="h-2 bg-gray-200 rounded w-12"></div>
      </div>
      <div className="text-right">
        <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-12 ml-auto"></div>
      </div>
    </div>
    <div className="mt-3 h-1.5 bg-gray-200 rounded-full"></div>
    <div className="mt-2 flex justify-between">
      <div className="h-3 bg-gray-200 rounded w-20"></div>
      <div className="h-4 bg-gray-200 rounded-full w-28"></div>
    </div>
  </div>
);

const ScannerPage = () => {
  const [activeTab, setActiveTab] = useState('high');
  const [nearHigh, setNearHigh] = useState([]);
  const [nearLow, setNearLow] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/stocks/52week');
      const data = response.data;
      setNearHigh(data.near_high || []);
      setNearLow(data.near_low || []);
    } catch (err) {
      console.error('Failed to load 52-week data:', err);
      setError('Unable to load scanner data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeStocks = activeTab === 'high' ? nearHigh : nearLow;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">52-Week High/Low Scanner</h1>
            <p className="text-gray-500">Stocks trading near their 52-week highs and lows</p>
          </div>

          {/* Tabs */}
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setActiveTab('high')}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'high'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Near 52W High
              {!loading && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === 'high' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {nearHigh.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('low')}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'low'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
              </svg>
              Near 52W Low
              {!loading && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === 'low' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {nearLow.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Info banner */}
        <div className={`rounded-lg p-3 mb-6 text-sm ${
          activeTab === 'high'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {activeTab === 'high'
            ? 'Showing stocks within 5% of their 52-week high, sorted by closest to high first.'
            : 'Showing stocks within 10% of their 52-week low, sorted by closest to low first.'
          }
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center mb-6">
            <svg className="w-10 h-10 mx-auto text-red-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-red-600 mb-2">{error}</p>
            <button
              onClick={fetchData}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : activeStocks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {activeStocks.map((stock) => (
              <StockCard key={stock.symbol} stock={stock} type={activeTab} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No stocks found</h3>
            <p className="text-gray-500 text-sm">
              {activeTab === 'high'
                ? 'No stocks are currently within 5% of their 52-week high.'
                : 'No stocks are currently within 10% of their 52-week low.'
              }
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default ScannerPage;
