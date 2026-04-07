import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import PriceChart from './PriceChart';

const FOREX_PAIRS = [
  { symbol: 'USDINR=X', name: 'USD/INR', base: 'USD', quote: 'INR' },
  { symbol: 'EURUSD=X', name: 'EUR/USD', base: 'EUR', quote: 'USD' },
  { symbol: 'GBPUSD=X', name: 'GBP/USD', base: 'GBP', quote: 'USD' },
  { symbol: 'USDJPY=X', name: 'USD/JPY', base: 'USD', quote: 'JPY' },
  { symbol: 'EURINR=X', name: 'EUR/INR', base: 'EUR', quote: 'INR' },
];

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'JPY'];

function CurrencyConverter({ rates }) {
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('INR');
  const [amount, setAmount] = useState('1');

  // Build a rate map: everything relative to USD
  const rateToUSD = {};
  rateToUSD['USD'] = 1;
  Object.entries(rates).forEach(([sym, data]) => {
    const price = data?.price || data?.regularMarketPrice || 0;
    if (!price) return;
    if (sym === 'USDINR=X') { rateToUSD['INR'] = 1 / price; }
    if (sym === 'EURUSD=X') { rateToUSD['EUR'] = price; }
    if (sym === 'GBPUSD=X') { rateToUSD['GBP'] = price; }
    if (sym === 'USDJPY=X') { rateToUSD['JPY'] = 1 / price; }
  });
  // EURINR can be derived, but let's ensure we have it
  if (!rateToUSD['EUR'] && rates['EURINR=X']) {
    const eurInr = rates['EURINR=X']?.price || rates['EURINR=X']?.regularMarketPrice || 0;
    const usdInr = rates['USDINR=X']?.price || rates['USDINR=X']?.regularMarketPrice || 0;
    if (eurInr && usdInr) rateToUSD['EUR'] = eurInr / usdInr;
  }

  const convert = () => {
    const fromRate = rateToUSD[fromCurrency];
    const toRate = rateToUSD[toCurrency];
    if (!fromRate || !toRate) return null;
    const usdAmount = parseFloat(amount) * fromRate;
    return usdAmount / toRate;
  };

  const result = convert();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Currency Converter</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            min="0"
            step="any"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">From</label>
          <select
            value={fromCurrency}
            onChange={e => setFromCurrency(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">To</label>
          <select
            value={toCurrency}
            onChange={e => setToCurrency(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">Converted Amount</div>
          <div className="text-xl font-bold text-gray-900">
            {result !== null && !isNaN(result)
              ? result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
              : '--'}
          </div>
          <div className="text-xs text-gray-400">{toCurrency}</div>
        </div>
      </div>
    </div>
  );
}

function ForexPage() {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const fetchQuotes = useCallback(() => {
    setError(null);
    setLoading(true);
    Promise.all(
      FOREX_PAIRS.map(p =>
        api.get(`/api/stocks/${encodeURIComponent(p.symbol)}/quote`)
          .then(res => ({ symbol: p.symbol, data: res.data }))
          .catch(() => ({ symbol: p.symbol, data: null }))
      )
    ).then(results => {
      const map = {};
      results.forEach(r => { if (r.data) map[r.symbol] = r.data; });
      setQuotes(map);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load forex rates.');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Forex Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Live exchange rates for major currency pairs</p>
        </div>
        <button
          onClick={fetchQuotes}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Rate Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {FOREX_PAIRS.map(p => {
          const q = quotes[p.symbol];
          const isSelected = selected === p.symbol;
          const price = q?.price || q?.regularMarketPrice || 0;
          const changePct = q?.change_percent ?? q?.regularMarketChangePercent ?? 0;
          const change = q?.change ?? q?.regularMarketChange ?? 0;
          const isPositive = changePct >= 0;

          return (
            <button
              key={p.symbol}
              type="button"
              onClick={() => setSelected(isSelected ? null : p.symbol)}
              className={`rounded-xl p-4 shadow-sm border cursor-pointer transition-all hover:shadow-md text-left ${
                isSelected
                  ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                  : 'bg-white border-gray-100'
              }`}
            >
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-3 bg-gray-200 rounded w-16 mb-2" />
                  <div className="h-5 bg-gray-200 rounded w-20 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-14" />
                </div>
              ) : (
                <>
                  <div className="text-sm text-gray-500 font-medium">{p.name}</div>
                  <div className="text-xl font-bold text-gray-900 mt-1">
                    {price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                  </div>
                  <div className={`text-sm font-semibold mt-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {isPositive ? '+' : ''}{change.toFixed(4)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Currency Converter */}
      {!loading && Object.keys(quotes).length > 0 && (
        <div className="mb-6">
          <CurrencyConverter rates={quotes} />
        </div>
      )}

      {/* Chart Section */}
      {selected && (
        <PriceChart
          symbol={selected}
          title={`${FOREX_PAIRS.find(p => p.symbol === selected)?.name} Chart`}
          decimals={4}
        />
      )}

      {/* Disclaimer */}
      <div className="text-xs text-gray-400 text-center mt-6">
        Data sourced from Yahoo Finance. Exchange rates are for informational purposes only and may be delayed.
        Not financial advice.
      </div>
    </div>
  );
}

export default ForexPage;
