import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import PriceChart from './PriceChart';

const COMMODITIES = [
  { symbol: 'GC=F', name: 'Gold', unit: 'oz' },
  { symbol: 'SI=F', name: 'Silver', unit: 'oz' },
  { symbol: 'CL=F', name: 'Crude Oil', unit: 'bbl' },
  { symbol: 'NG=F', name: 'Natural Gas', unit: 'MMBtu' },
  { symbol: 'HG=F', name: 'Copper', unit: 'lb' },
];

function CommoditiesPage() {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const fetchQuotes = useCallback(() => {
    setError(null);
    setLoading(true);
    Promise.all(
      COMMODITIES.map(c =>
        api.get(`/api/stocks/${encodeURIComponent(c.symbol)}/quote`)
          .then(res => ({ symbol: c.symbol, data: res.data }))
          .catch(() => ({ symbol: c.symbol, data: null }))
      )
    ).then(results => {
      const map = {};
      results.forEach(r => { if (r.data) map[r.symbol] = r.data; });
      setQuotes(map);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load commodity prices.');
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
          <h1 className="text-2xl font-bold text-gray-900">Commodities</h1>
          <p className="text-sm text-gray-500 mt-1">Live prices for major commodities (USD)</p>
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

      {/* Commodity Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {COMMODITIES.map(c => {
          const q = quotes[c.symbol];
          const isSelected = selected === c.symbol;
          const price = q?.price || q?.regularMarketPrice || 0;
          const changePct = q?.change_percent ?? q?.regularMarketChangePercent ?? 0;
          const change = q?.change ?? q?.regularMarketChange ?? 0;
          const isPositive = changePct >= 0;

          return (
            <button
              key={c.symbol}
              type="button"
              onClick={() => setSelected(isSelected ? null : c.symbol)}
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
                  <div className="text-sm text-gray-500 font-medium">{c.name}</div>
                  <div className="text-xl font-bold text-gray-900 mt-1">
                    ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">per {c.unit}</div>
                  <div className={`text-sm font-semibold mt-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Chart Section */}
      {selected && (
        <PriceChart
          symbol={selected}
          title={`${COMMODITIES.find(c => c.symbol === selected)?.name} Price Chart`}
          decimals={2}
        />
      )}

      {/* Disclaimer */}
      <div className="text-xs text-gray-400 text-center mt-6">
        Data sourced from Yahoo Finance. Prices are for informational purposes only and may be delayed.
        Not financial advice.
      </div>
    </div>
  );
}

export default CommoditiesPage;
