import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useMarket } from '../context/MarketContext';

function DealsPage() {
  const { market } = useMarket();
  const [symbol, setSymbol] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  // Search suggestions as user types
  useEffect(() => {
    const query = searchInput.trim();
    if (query.length < 1) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/stocks/search?q=${encodeURIComponent(query)}&market=${market}`);
        setSuggestions(res.data.results || []);
        setShowDropdown(true);
      } catch {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [searchInput, market]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchInsider = async (sym) => {
    setSymbol(sym);
    setSearchInput(sym);
    setShowDropdown(false);
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const res = await api.get(`/api/stocks/${encodeURIComponent(sym)}/insider`);
      setTransactions(res.data.transactions || []);
    } catch (err) {
      if (err.response?.status === 404) {
        setError(`No insider data found for ${sym}`);
      } else {
        setError('Failed to fetch insider transactions');
      }
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const sym = searchInput.trim().toUpperCase();
    if (!sym) return;
    fetchInsider(sym);
  };

  const formatValue = (val) => {
    if (!val && val !== 0) return '-';
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
    return `$${val.toLocaleString()}`;
  };

  const formatShares = (shares) => {
    if (!shares) return '-';
    return shares.toLocaleString();
  };

  const getTransactionColor = (txn) => {
    const lower = (txn || '').toLowerCase();
    if (lower.includes('purchase') || lower.includes('buy') || lower.includes('acquisition')) return 'text-green-400';
    if (lower.includes('sale') || lower.includes('sell') || lower.includes('disposition')) return 'text-red-400';
    return 'text-gray-300';
  };

  const getTransactionBadge = (txn) => {
    const lower = (txn || '').toLowerCase();
    if (lower.includes('purchase') || lower.includes('buy') || lower.includes('acquisition')) return { text: 'BUY', cls: 'bg-green-900/50 text-green-400' };
    if (lower.includes('sale') || lower.includes('sell') || lower.includes('disposition')) return { text: 'SELL', cls: 'bg-red-900/50 text-red-400' };
    return { text: txn || 'OTHER', cls: 'bg-gray-700 text-gray-400' };
  };

  const suggestedSymbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN', 'META', 'NVDA', 'RELIANCE.NS', 'TCS.NS', 'INFY.NS'];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Insider / Bulk / Block Deals</h1>
      <p className="text-gray-400 text-sm mb-6">
        Track insider buying and selling activity for any stock
      </p>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <div className="flex-1 relative" ref={dropdownRef}>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              placeholder="Search by name or symbol (e.g., Apple, AAPL, Reliance)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
            {showDropdown && suggestions.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => fetchInsider(s.symbol)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-700 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <span className="text-white font-medium text-sm">{s.symbol}</span>
                      <span className="text-gray-400 text-xs ml-2">{s.name}</span>
                    </div>
                    <span className="text-gray-500 text-xs">{s.exchange || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !searchInput.trim()}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Loading...' : 'Search'}
          </button>
        </div>
      </form>

      {/* Quick suggestions */}
      {!searched && (
        <div className="mb-6">
          <p className="text-gray-400 text-xs mb-2">Popular symbols:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedSymbols.map((s) => (
              <button
                key={s}
                onClick={() => fetchInsider(s)}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-700 rounded"></div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && !error && searched && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">
            Insider Transactions for <span className="text-blue-400">{symbol}</span>
            <span className="text-gray-500 text-sm font-normal ml-2">({transactions.length} records)</span>
          </h2>

          {transactions.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
              <p className="text-gray-400">No insider transaction data available for {symbol}</p>
              <p className="text-gray-500 text-sm mt-1">Try a US-listed stock like AAPL, MSFT, or TSLA</p>
            </div>
          ) : (
            <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-900/50">
                      <th className="text-left text-gray-400 py-3 px-4">Date</th>
                      <th className="text-left text-gray-400 py-3 px-3">Insider</th>
                      <th className="text-left text-gray-400 py-3 px-3">Relation</th>
                      <th className="text-center text-gray-400 py-3 px-3">Type</th>
                      <th className="text-right text-gray-400 py-3 px-3">Shares</th>
                      <th className="text-right text-gray-400 py-3 px-4">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((txn, i) => {
                      const badge = getTransactionBadge(txn.transaction);
                      return (
                        <tr key={i} className="border-t border-gray-700/50 hover:bg-gray-700/30">
                          <td className="py-3 px-4 text-gray-300">{txn.date || '-'}</td>
                          <td className="py-3 px-3 text-white font-medium">{txn.insider || '-'}</td>
                          <td className="py-3 px-3 text-gray-400">{txn.relation || '-'}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                              {badge.text}
                            </span>
                          </td>
                          <td className={`py-3 px-3 text-right ${getTransactionColor(txn.transaction)}`}>
                            {formatShares(txn.shares)}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-300">
                            {formatValue(txn.value)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info Note */}
      <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 mt-6">
        <p className="text-yellow-500 text-xs">
          Note: Insider transaction data is sourced from Yahoo Finance and may have delays. Indian stocks have limited insider data availability through this source.
        </p>
      </div>
    </div>
  );
}

export default DealsPage;
