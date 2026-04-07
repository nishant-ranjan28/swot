import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useLocalStorage } from '../hooks/useLocalStorage';
import Sparkline from './Sparkline';

const formatNumber = (num) => {
  if (num == null || isNaN(num)) return '-';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)} L`;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6B7280',
];

const todayStr = () => new Date().toISOString().split('T')[0];

const PieChart = ({ holdings, liveData }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.parentElement.clientWidth;
    const displaySize = Math.min(size, 280);
    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;
    ctx.scale(dpr, dpr);

    const cx = displaySize / 2;
    const cy = displaySize / 2;
    const outerR = displaySize / 2 - 10;
    const innerR = outerR * 0.55;

    // Compute values
    const items = holdings.map((h) => {
      const price = liveData[h.symbol]?.price || h.buyPrice;
      return { symbol: h.symbol, name: h.name, value: price * h.quantity };
    });
    items.sort((a, b) => b.value - a.value);

    let slices = [];
    if (items.length <= 8) {
      slices = items;
    } else {
      slices = items.slice(0, 8);
      const othersValue = items.slice(8).reduce((s, i) => s + i.value, 0);
      slices.push({ symbol: 'OTHERS', name: 'Others', value: othersValue });
    }

    const total = slices.reduce((s, i) => s + i.value, 0);
    if (total === 0) {
      ctx.clearRect(0, 0, displaySize, displaySize);
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data', cx, cy);
      return;
    }

    ctx.clearRect(0, 0, displaySize, displaySize);
    let startAngle = -Math.PI / 2;

    slices.forEach((slice, i) => {
      const sweepAngle = (slice.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sweepAngle);
      ctx.arc(cx, cy, innerR, startAngle + sweepAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      startAngle += sweepAngle;
    });

    // Center text
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${slices.length} stocks`, cx, cy);
  }, [holdings, liveData]);

  return <canvas ref={canvasRef} className="mx-auto" />;
};

const PieLegend = ({ holdings, liveData }) => {
  const items = holdings.map((h) => {
    const price = liveData[h.symbol]?.price || h.buyPrice;
    return { symbol: h.symbol, name: h.name, value: price * h.quantity };
  });
  items.sort((a, b) => b.value - a.value);

  let slices = [];
  if (items.length <= 8) {
    slices = items;
  } else {
    slices = items.slice(0, 8);
    const othersValue = items.slice(8).reduce((s, i) => s + i.value, 0);
    slices.push({ symbol: 'OTHERS', name: 'Others', value: othersValue });
  }

  const total = slices.reduce((s, i) => s + i.value, 0);

  return (
    <div className="flex flex-wrap gap-2 mt-3 justify-center">
      {slices.map((s, i) => (
        <div key={s.symbol} className="flex items-center gap-1.5 text-xs text-gray-700">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: COLORS[i % COLORS.length] }}
          />
          <span className="truncate max-w-[90px]">{s.name}</span>
          <span className="text-gray-400">{total > 0 ? ((s.value / total) * 100).toFixed(1) : 0}%</span>
        </div>
      ))}
    </div>
  );
};

const PortfolioPage = () => {
  const [holdings, setHoldings] = useLocalStorage('stockpulse_portfolio', []);
  const [watchlist] = useLocalStorage('stockpulse_watchlist', []);
  const [liveData, setLiveData] = useState({});
  const [sparklineData, setSparklineData] = useState({});
  const [loading, setLoading] = useState(false);

  // Add holding form state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyDate, setBuyDate] = useState(todayStr());
  const [addError, setAddError] = useState('');

  // Sort
  const [sortBy, setSortBy] = useState('value');

  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);

  // Fetch live prices and sparkline data
  const fetchLivePrices = useCallback(async (list, watchlistItems) => {
    if ((!list || list.length === 0) && (!watchlistItems || watchlistItems.length === 0)) return;
    setLoading(true);
    try {
      const holdingSymbols = (list || []).map(h => h.symbol);
      const watchlistSyms = (watchlistItems || []).map(w => w.symbol);
      const symbols = [...new Set([...holdingSymbols, ...watchlistSyms])];
      const sparkResults = {};
      const results = await Promise.all(
        symbols.map(async (sym) => {
          try {
            const [quoteRes, overviewRes, histRes] = await Promise.all([
              api.get(`/api/stocks/${sym}/quote`),
              api.get(`/api/stocks/${sym}/overview`).catch(() => ({ data: {} })),
              api.get(`/api/stocks/${sym}/history?range=5d`).catch(() => ({ data: null })),
            ]);
            if (histRes.data && Array.isArray(histRes.data)) {
              sparkResults[sym] = histRes.data.map((d) => d.close).filter((v) => v != null);
            } else if (histRes.data && Array.isArray(histRes.data.prices)) {
              sparkResults[sym] = histRes.data.prices.map((d) => d.close).filter((v) => v != null);
            }
            return { symbol: sym, data: { ...quoteRes.data, sector: overviewRes.data?.sector } };
          } catch {
            return { symbol: sym, data: null };
          }
        })
      );
      const map = {};
      results.forEach(({ symbol, data }) => {
        if (data) {
          map[symbol] = {
            price: data.price || 0,
            change: data.change || 0,
            changePercent: data.change_percent || 0,
            name: data.name || symbol,
            sector: data.sector || 'Other',
          };
        }
      });
      setLiveData(map);
      setSparklineData(sparkResults);
    } catch (err) {
      console.error('Error fetching live prices:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLivePrices(holdings, watchlist);
  }, [holdings, watchlist, fetchLivePrices]);

  // Search autocomplete
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/stocks/search?q=${encodeURIComponent(searchQuery)}`);
        const results = res.data.results || [];
        setSearchResults(results.slice(0, 6));
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

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

  const handleSelectStock = (stock) => {
    setSelectedStock(stock);
    setSearchQuery(stock.name || stock.symbol);
    setShowDropdown(false);
  };

  const handleAddHolding = () => {
    setAddError('');
    if (!selectedStock) {
      setAddError('Please search and select a stock.');
      return;
    }
    const bp = parseFloat(buyPrice);
    const qty = parseInt(quantity, 10);
    if (!bp || bp <= 0) {
      setAddError('Enter a valid buy price.');
      return;
    }
    if (!qty || qty <= 0) {
      setAddError('Enter a valid quantity.');
      return;
    }
    const newHolding = {
      symbol: selectedStock.symbol,
      name: selectedStock.name || selectedStock.symbol,
      buyPrice: bp,
      quantity: qty,
      buyDate: buyDate || todayStr(),
      id: crypto.randomUUID(),
    };
    setHoldings((prev) => [...prev, newHolding]);
    setSelectedStock(null);
    setSearchQuery('');
    setBuyPrice('');
    setQuantity('');
    setBuyDate(todayStr());
  };

  const handleDelete = (id) => {
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  };

  // Summaries
  const totalInvested = holdings.reduce((s, h) => s + h.buyPrice * h.quantity, 0);
  const totalCurrent = holdings.reduce((s, h) => {
    const price = liveData[h.symbol]?.price || h.buyPrice;
    return s + price * h.quantity;
  }, 0);
  const totalPL = totalCurrent - totalInvested;
  const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const dayPL = holdings.reduce((s, h) => {
    const change = liveData[h.symbol]?.change || 0;
    return s + change * h.quantity;
  }, 0);

  // Sorted holdings
  const sortedHoldings = [...holdings].sort((a, b) => {
    const priceA = liveData[a.symbol]?.price || a.buyPrice;
    const priceB = liveData[b.symbol]?.price || b.buyPrice;
    const valA = priceA * a.quantity;
    const valB = priceB * b.quantity;
    const plPctA = a.buyPrice > 0 ? ((priceA - a.buyPrice) / a.buyPrice) * 100 : 0;
    const plPctB = b.buyPrice > 0 ? ((priceB - b.buyPrice) / b.buyPrice) * 100 : 0;
    const allocA = totalCurrent > 0 ? valA / totalCurrent : 0;
    const allocB = totalCurrent > 0 ? valB / totalCurrent : 0;

    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'value':
        return valB - valA;
      case 'pl':
        return plPctB - plPctA;
      case 'allocation':
        return allocB - allocA;
      default:
        return 0;
    }
  });

  const plColor = (val) => (val >= 0 ? 'text-green-600' : 'text-red-600');
  const plBg = (val) => (val >= 0 ? 'bg-green-50' : 'bg-red-50');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Portfolio Tracker</h1>
        <p className="text-sm text-gray-500 mt-1">Track your virtual stock portfolio performance</p>
      </div>

      {/* Add Holding Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add Holding</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          {/* Stock search */}
          <div className="lg:col-span-2 relative" ref={dropdownRef}>
            <label className="block text-xs text-gray-500 font-medium mb-1">Stock</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedStock(null);
              }}
              placeholder="Search stock..."
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              autoComplete="off"
            />
            {showDropdown && searchResults.length > 0 && (
              <ul className="absolute z-50 bg-white border border-gray-200 rounded-lg w-full max-h-52 overflow-auto mt-1 shadow-lg">
                {searchResults.map((stock) => (
                  <li key={stock.symbol}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm focus:outline-none border-b border-gray-100 last:border-b-0"
                      onClick={() => handleSelectStock(stock)}
                    >
                      <span className="font-medium text-gray-900">{stock.name}</span>
                      <span className="text-gray-400 ml-2 text-xs">{stock.symbol}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Buy Price */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Buy Price</label>
            <input
              type="number"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              min="1"
              step="1"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Buy Date */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Buy Date</label>
            <input
              type="date"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
              max={todayStr()}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        {addError && <p className="text-red-500 text-xs mt-2">{addError}</p>}
        <button
          onClick={handleAddHolding}
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors focus:outline-none"
        >
          Add Holding
        </button>
      </div>

      {/* Empty state */}
      {holdings.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="text-gray-300 text-5xl mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-gray-500 text-lg font-medium">No holdings yet.</p>
          <p className="text-gray-400 text-sm mt-1">Add your first stock above.</p>
        </div>
      )}

      {holdings.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">Total Invested</div>
              <div className="text-lg sm:text-xl font-bold text-gray-900">
                {formatNumber(totalInvested)}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">Current Value</div>
              <div className="text-lg sm:text-xl font-bold text-gray-900">
                {loading ? '...' : formatNumber(totalCurrent)}
              </div>
            </div>
            <div className={`rounded-xl border border-gray-200 p-4 shadow-sm ${plBg(totalPL)}`}>
              <div className="text-xs text-gray-500 mb-1">Total P&L</div>
              <div className={`text-lg sm:text-xl font-bold ${plColor(totalPL)}`}>
                {loading ? '...' : `${totalPL >= 0 ? '+' : ''}${formatNumber(totalPL)}`}
              </div>
              <div className={`text-xs font-medium ${plColor(totalPLPercent)}`}>
                {loading ? '' : `${totalPLPercent >= 0 ? '+' : ''}${totalPLPercent.toFixed(2)}%`}
              </div>
            </div>
            <div className={`rounded-xl border border-gray-200 p-4 shadow-sm ${plBg(dayPL)}`}>
              <div className="text-xs text-gray-500 mb-1">Day's P&L</div>
              <div className={`text-lg sm:text-xl font-bold ${plColor(dayPL)}`}>
                {loading ? '...' : `${dayPL >= 0 ? '+' : ''}${formatNumber(dayPL)}`}
              </div>
            </div>
          </div>

          {/* Allocation Chart + Sort */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm lg:col-span-1">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Allocation</h2>
              <PieChart holdings={holdings} liveData={liveData} />
              <PieLegend holdings={holdings} liveData={liveData} />
            </div>

            {/* Sort + Holdings Table */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Holdings ({holdings.length})</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Sort:</span>
                  {[
                    { key: 'name', label: 'Name' },
                    { key: 'value', label: 'Value' },
                    { key: 'pl', label: 'P&L%' },
                    { key: 'allocation', label: 'Alloc' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setSortBy(opt.key)}
                      className={`text-xs px-2 py-1 rounded-md transition-colors focus:outline-none ${
                        sortBy === opt.key
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                        <th className="text-left px-4 py-3 font-medium">Stock</th>
                        <th className="text-right px-3 py-3 font-medium">Qty</th>
                        <th className="text-right px-3 py-3 font-medium">Avg Buy</th>
                        <th className="text-right px-3 py-3 font-medium">CMP</th>
                        <th className="text-center px-3 py-3 font-medium">5D</th>
                        <th className="text-right px-3 py-3 font-medium">Invested</th>
                        <th className="text-right px-3 py-3 font-medium">Current</th>
                        <th className="text-right px-3 py-3 font-medium">P&L</th>
                        <th className="text-right px-3 py-3 font-medium">Day Chg</th>
                        <th className="text-right px-3 py-3 font-medium">Alloc%</th>
                        <th className="px-3 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedHoldings.map((h) => {
                        const live = liveData[h.symbol];
                        const currentPrice = live?.price || h.buyPrice;
                        const invested = h.buyPrice * h.quantity;
                        const current = currentPrice * h.quantity;
                        const pl = current - invested;
                        const plPct = invested > 0 ? (pl / invested) * 100 : 0;
                        const dayChange = (live?.change || 0) * h.quantity;
                        const alloc = totalCurrent > 0 ? (current / totalCurrent) * 100 : 0;

                        return (
                          <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <Link
                                to={`/stock/${h.symbol}`}
                                className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                              >
                                {h.name}
                              </Link>
                              <div className="text-xs text-gray-400">{h.symbol}</div>
                            </td>
                            <td className="text-right px-3 py-3 text-gray-700">{h.quantity}</td>
                            <td className="text-right px-3 py-3 text-gray-700">
                              {h.buyPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="text-right px-3 py-3 font-medium text-gray-900">
                              {loading ? '...' : currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex justify-center">
                                {sparklineData[h.symbol] && sparklineData[h.symbol].length >= 2 ? (
                                  <Sparkline data={sparklineData[h.symbol]} />
                                ) : (
                                  <div className="w-[80px] h-[30px] bg-gray-100 rounded animate-pulse" />
                                )}
                              </div>
                            </td>
                            <td className="text-right px-3 py-3 text-gray-600">
                              {formatNumber(invested)}
                            </td>
                            <td className="text-right px-3 py-3 text-gray-900 font-medium">
                              {loading ? '...' : formatNumber(current)}
                            </td>
                            <td className="text-right px-3 py-3">
                              <div className={`font-medium ${plColor(pl)}`}>
                                {loading ? '...' : `${pl >= 0 ? '+' : ''}${formatNumber(pl)}`}
                              </div>
                              <div className={`text-xs ${plColor(plPct)}`}>
                                {loading ? '' : `${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%`}
                              </div>
                            </td>
                            <td className={`text-right px-3 py-3 text-xs font-medium ${plColor(dayChange)}`}>
                              {loading ? '...' : `${dayChange >= 0 ? '+' : ''}${formatNumber(dayChange)}`}
                            </td>
                            <td className="text-right px-3 py-3 text-gray-600 text-xs">
                              {alloc.toFixed(1)}%
                            </td>
                            <td className="px-3 py-3">
                              <button
                                onClick={() => handleDelete(h.id)}
                                className="text-gray-400 hover:text-red-500 transition-colors focus:outline-none"
                                title="Remove holding"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {sortedHoldings.map((h) => {
                  const live = liveData[h.symbol];
                  const currentPrice = live?.price || h.buyPrice;
                  const invested = h.buyPrice * h.quantity;
                  const current = currentPrice * h.quantity;
                  const pl = current - invested;
                  const plPct = invested > 0 ? (pl / invested) * 100 : 0;
                  const dayChange = (live?.change || 0) * h.quantity;
                  const alloc = totalCurrent > 0 ? (current / totalCurrent) * 100 : 0;

                  return (
                    <div key={h.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <Link
                            to={`/stock/${h.symbol}`}
                            className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                          >
                            {h.name}
                          </Link>
                          <div className="text-xs text-gray-400">{h.symbol}</div>
                        </div>
                        <button
                          onClick={() => handleDelete(h.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors focus:outline-none"
                          title="Remove holding"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      {/* Sparkline */}
                      <div className="mb-3">
                        {sparklineData[h.symbol] && sparklineData[h.symbol].length >= 2 ? (
                          <Sparkline data={sparklineData[h.symbol]} width={120} height={32} />
                        ) : (
                          <div className="w-[120px] h-[32px] bg-gray-100 rounded animate-pulse" />
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-gray-400">Qty</span>
                          <div className="text-gray-800 font-medium">{h.quantity}</div>
                        </div>
                        <div>
                          <span className="text-gray-400">Avg Buy</span>
                          <div className="text-gray-800 font-medium">{h.buyPrice.toFixed(2)}</div>
                        </div>
                        <div>
                          <span className="text-gray-400">CMP</span>
                          <div className="text-gray-900 font-medium">
                            {loading ? '...' : currentPrice.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-400">Invested</span>
                          <div className="text-gray-700">{formatNumber(invested)}</div>
                        </div>
                        <div>
                          <span className="text-gray-400">Current</span>
                          <div className="text-gray-900 font-medium">{loading ? '...' : formatNumber(current)}</div>
                        </div>
                        <div>
                          <span className="text-gray-400">Alloc</span>
                          <div className="text-gray-700">{alloc.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                        <div>
                          <span className="text-xs text-gray-400 mr-1">P&L:</span>
                          <span className={`text-sm font-medium ${plColor(pl)}`}>
                            {loading ? '...' : `${pl >= 0 ? '+' : ''}${formatNumber(pl)} (${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%)`}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-400 mr-1">Day:</span>
                          <span className={`text-xs font-medium ${plColor(dayChange)}`}>
                            {loading ? '...' : `${dayChange >= 0 ? '+' : ''}${formatNumber(dayChange)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== OPTIMIZE PORTFOLIO SECTION ===== */}
      {(() => {
        const uniqueSymbols = [...new Set(holdings.map(h => h.symbol))];
        if (uniqueSymbols.length < 2) return null;
        return (
          <OptimizePortfolio
            symbols={uniqueSymbols}
            totalInvested={totalInvested}
            holdings={holdings}
            liveData={liveData}
            totalCurrent={totalCurrent}
          />
        );
      })()}

      {/* ===== RISK ANALYSIS SECTION ===== */}
      {(() => {
        const uniqueSymbols = [...new Set(holdings.map(h => h.symbol))];
        if (uniqueSymbols.length < 2) return null;
        return <RiskAnalysis symbols={uniqueSymbols} />;
      })()}

      {/* ===== INSIGHTS SECTION (only when portfolio has data and prices loaded) ===== */}
      {holdings.length > 0 && !loading && Object.keys(liveData).length > 0 && (
        <PortfolioInsights holdings={holdings} liveData={liveData} watchlist={watchlist} />
      )}
    </div>
  );
};

// ===== Risk Analysis Component =====
const RiskAnalysis = ({ symbols }) => {
  const [riskData, setRiskData] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState('');

  const handleAnalyze = async () => {
    setRiskLoading(true);
    setRiskError('');
    setRiskData(null);
    try {
      const res = await api.get('/api/portfolio/risk', {
        params: { symbols: symbols.join(',') },
      });
      setRiskData(res.data);
    } catch (err) {
      setRiskError(err.response?.data?.error || 'Risk analysis failed. Please try again.');
    } finally {
      setRiskLoading(false);
    }
  };

  const getCorrelationColor = (val) => {
    if (val === 1) return 'bg-gray-100 text-gray-700';
    if (val >= 0.7) return 'bg-red-100 text-red-700';
    if (val >= 0.4) return 'bg-orange-100 text-orange-700';
    if (val >= 0.1) return 'bg-yellow-50 text-yellow-700';
    if (val >= -0.1) return 'bg-green-50 text-green-700';
    return 'bg-green-100 text-green-800';
  };

  const getDiversificationLabel = (ratio) => {
    if (ratio >= 1.5) return { text: 'Well Diversified', color: 'text-green-600', bg: 'bg-green-50' };
    if (ratio >= 1.2) return { text: 'Moderately Diversified', color: 'text-yellow-600', bg: 'bg-yellow-50' };
    return { text: 'Low Diversification', color: 'text-red-600', bg: 'bg-red-50' };
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mt-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Risk Analysis</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Portfolio risk metrics using 2 years of historical data
          </p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={riskLoading}
          className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors focus:outline-none"
        >
          {riskLoading ? 'Analyzing...' : 'Analyze Risk'}
        </button>
      </div>

      {riskError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700">{riskError}</p>
        </div>
      )}

      {riskLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600"></div>
          <span className="ml-3 text-sm text-gray-500">Running risk analysis...</span>
        </div>
      )}

      {riskData && !riskLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-xs text-blue-500 font-medium">Annual Return</div>
              <div className={`text-lg font-bold ${riskData.annual_return_pct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {riskData.annual_return_pct >= 0 ? '+' : ''}{riskData.annual_return_pct}%
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-xs text-amber-500 font-medium">Volatility</div>
              <div className="text-lg font-bold text-amber-700">{riskData.annual_volatility_pct}%</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-xs text-green-500 font-medium">Sharpe Ratio</div>
              <div className={`text-lg font-bold ${riskData.sharpe_ratio >= 1 ? 'text-green-700' : riskData.sharpe_ratio >= 0 ? 'text-yellow-700' : 'text-red-700'}`}>
                {riskData.sharpe_ratio}
              </div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-xs text-red-500 font-medium">VaR (95%)</div>
              <div className="text-lg font-bold text-red-700">{riskData.var_95_daily_pct}%</div>
              <div className="text-[10px] text-red-400">Daily</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-3">
              <div className="text-xs text-orange-500 font-medium">Max Drawdown</div>
              <div className="text-lg font-bold text-orange-700">{riskData.max_drawdown_pct}%</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="text-xs text-purple-500 font-medium">Beta</div>
              <div className="text-lg font-bold text-purple-700">
                {riskData.beta != null ? riskData.beta : 'N/A'}
              </div>
            </div>
          </div>

          {/* Diversification Ratio */}
          {(() => {
            const d = getDiversificationLabel(riskData.diversification_ratio);
            return (
              <div className={`${d.bg} rounded-lg p-3 mb-6 flex items-center justify-between`}>
                <div>
                  <span className="text-xs text-gray-500 font-medium">Diversification Ratio</span>
                  <div className={`text-lg font-bold ${d.color}`}>
                    {riskData.diversification_ratio}x
                  </div>
                </div>
                <span className={`text-sm font-medium ${d.color} px-3 py-1 rounded-full ${d.bg}`}>
                  {d.text}
                </span>
              </div>
            );
          })()}

          {/* Risk Contribution */}
          {riskData.risk_contribution && riskData.risk_contribution.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Risk Contribution</h3>
              <div className="space-y-2">
                {riskData.risk_contribution.map((rc) => {
                  const maxContrib = Math.max(...riskData.risk_contribution.map(r => Math.abs(r.contribution_pct)));
                  const barWidth = maxContrib > 0 ? (Math.abs(rc.contribution_pct) / maxContrib) * 100 : 0;
                  const isNeg = rc.contribution_pct < 0;
                  return (
                    <div key={rc.symbol} className="flex items-center gap-3">
                      <div className="w-24 text-xs text-gray-700 font-medium truncate flex-shrink-0">
                        {rc.symbol.replace('.NS', '').replace('.BO', '')}
                      </div>
                      <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isNeg ? 'bg-green-400' : 'bg-rose-400'}`}
                          style={{ width: `${Math.min(barWidth, 100)}%` }}
                        />
                      </div>
                      <div className={`w-16 text-right text-xs font-medium ${isNeg ? 'text-green-600' : 'text-gray-700'}`}>
                        {rc.contribution_pct}%
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Shows each stock's marginal contribution to total portfolio variance
              </p>
            </div>
          )}

          {/* Correlation Matrix */}
          {riskData.correlation && Object.keys(riskData.correlation).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Correlation Matrix</h3>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="px-2 py-1.5 text-left text-gray-500 font-medium"></th>
                      {riskData.symbols.map((sym) => (
                        <th key={sym} className="px-2 py-1.5 text-center text-gray-500 font-medium whitespace-nowrap">
                          {sym.replace('.NS', '').replace('.BO', '')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {riskData.symbols.map((rowSym) => (
                      <tr key={rowSym}>
                        <td className="px-2 py-1.5 text-gray-700 font-medium whitespace-nowrap">
                          {rowSym.replace('.NS', '').replace('.BO', '')}
                        </td>
                        {riskData.symbols.map((colSym) => {
                          const val = riskData.correlation[rowSym]?.[colSym];
                          return (
                            <td
                              key={colSym}
                              className={`px-2 py-1.5 text-center font-medium rounded ${getCorrelationColor(val ?? 0)}`}
                            >
                              {val != null ? val.toFixed(2) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
                <span className="inline-block w-3 h-3 rounded bg-green-100"></span> Low
                <span className="inline-block w-3 h-3 rounded bg-yellow-50 border border-yellow-200"></span> Moderate
                <span className="inline-block w-3 h-3 rounded bg-red-100"></span> High
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-700">
              <strong>Disclaimer:</strong> Risk metrics are based on historical data and may not predict
              future performance. VaR and CVaR are daily figures at 95% confidence. Diversification ratio
              above 1.0 indicates diversification benefit. Always consult a qualified financial advisor.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

// ===== Optimize Portfolio Component =====
const OptimizePortfolio = ({ symbols, totalInvested, holdings, liveData, totalCurrent }) => {
  const [optResult, setOptResult] = useState(null);
  const [optLoading, setOptLoading] = useState(false);
  const [optError, setOptError] = useState('');

  const handleOptimize = async () => {
    setOptLoading(true);
    setOptError('');
    setOptResult(null);
    try {
      const amount = Math.max(totalInvested, 10000);
      const res = await api.get('/api/portfolio/optimize', {
        params: { symbols: symbols.join(','), amount: Math.round(amount) },
      });
      setOptResult(res.data);
    } catch (err) {
      setOptError(err.response?.data?.error || 'Optimization failed. Please try again.');
    } finally {
      setOptLoading(false);
    }
  };

  // Compute current weights per symbol
  const currentWeights = {};
  holdings.forEach((h) => {
    const price = liveData[h.symbol]?.price || h.buyPrice;
    const val = price * h.quantity;
    currentWeights[h.symbol] = (currentWeights[h.symbol] || 0) + val;
  });
  Object.keys(currentWeights).forEach((sym) => {
    currentWeights[sym] = totalCurrent > 0 ? (currentWeights[sym] / totalCurrent) * 100 : 0;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mt-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Portfolio Optimization</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Mean-Variance optimization (Max Sharpe Ratio) using 2 years of historical data
          </p>
        </div>
        <button
          onClick={handleOptimize}
          disabled={optLoading}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors focus:outline-none"
        >
          {optLoading ? 'Optimizing...' : 'Optimize Portfolio'}
        </button>
      </div>

      {optError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700">{optError}</p>
        </div>
      )}

      {optLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-3 text-sm text-gray-500">Running optimization...</span>
        </div>
      )}

      {optResult && !optLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-indigo-50 rounded-lg p-3">
              <div className="text-xs text-indigo-500 font-medium">Expected Return</div>
              <div className="text-lg font-bold text-indigo-700">{optResult.expected_return}%</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-xs text-amber-500 font-medium">Volatility</div>
              <div className="text-lg font-bold text-amber-700">{optResult.volatility}%</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-xs text-green-500 font-medium">Sharpe Ratio</div>
              <div className="text-lg font-bold text-green-700">{optResult.sharpe_ratio}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 font-medium">Leftover Cash</div>
              <div className="text-lg font-bold text-gray-700">
                {formatNumber(optResult.leftover_cash)}
              </div>
            </div>
          </div>

          {/* Allocation Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="text-left px-4 py-3 font-medium">Stock</th>
                  <th className="text-right px-3 py-3 font-medium">Current Wt%</th>
                  <th className="text-right px-3 py-3 font-medium">Optimal Wt%</th>
                  <th className="text-right px-3 py-3 font-medium">Suggested Shares</th>
                  <th className="text-right px-3 py-3 font-medium">Price</th>
                  <th className="text-right px-4 py-3 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {optResult.allocations.map((a) => {
                  const curWt = currentWeights[a.symbol] || 0;
                  const diff = a.weight - curWt;
                  return (
                    <tr key={a.symbol} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{a.symbol}</td>
                      <td className="text-right px-3 py-3 text-gray-600">{curWt.toFixed(1)}%</td>
                      <td className="text-right px-3 py-3">
                        <span className="font-medium text-gray-900">{a.weight.toFixed(1)}%</span>
                        {Math.abs(diff) > 0.5 && (
                          <span className={`ml-1 text-xs ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ({diff > 0 ? '+' : ''}{diff.toFixed(1)}%)
                          </span>
                        )}
                      </td>
                      <td className="text-right px-3 py-3 text-gray-700">{a.shares}</td>
                      <td className="text-right px-3 py-3 text-gray-600">{a.price.toFixed(2)}</td>
                      <td className="text-right px-4 py-3 font-medium text-gray-900">
                        {formatNumber(a.value)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Disclaimer */}
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-700">
              <strong>Disclaimer:</strong> This optimization is for educational purposes only and does not
              constitute financial advice. Past performance does not guarantee future results. The Max Sharpe
              optimization assumes normally distributed returns and may not reflect real-world constraints
              such as taxes, transaction costs, or liquidity. Always consult a qualified financial advisor
              before making investment decisions.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

// ===== Portfolio Insights Component =====
const PortfolioInsights = ({ holdings, liveData, watchlist }) => {
  const [news, setNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [analysts, setAnalysts] = useState({});
  const [loadingAnalysts, setLoadingAnalysts] = useState(true);

  // All unique symbols from portfolio + watchlist
  const portfolioSymbols = [...new Set(holdings.map(h => h.symbol))];
  const symbolsKey = useMemo(() => portfolioSymbols.slice().sort((a, b) => a.localeCompare(b)).join(','), [holdings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch news for portfolio stocks
  useEffect(() => {
    if (portfolioSymbols.length === 0) return;
    const fetchNews = async () => {
      setLoadingNews(true);
      const allArticles = [];
      const seen = new Set();
      // Fetch news for top 5 holdings by value
      const sorted = [...holdings].sort((a, b) => {
        const aVal = (liveData[a.symbol]?.price || a.buyPrice) * a.quantity;
        const bVal = (liveData[b.symbol]?.price || b.buyPrice) * b.quantity;
        return bVal - aVal;
      });
      const topSymbols = sorted.slice(0, 5).map(h => h.symbol);

      await Promise.all(topSymbols.map(async (sym) => {
        try {
          const res = await api.get(`/api/stocks/news/${sym}`);
          (res.data.articles || []).forEach(a => {
            if (!seen.has(a.title)) {
              seen.add(a.title);
              allArticles.push({ ...a, forStock: sym.replace('.NS', '').replace('.BO', '') });
            }
          });
        } catch {}
      }));
      allArticles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
      setNews(allArticles.slice(0, 8));
      setLoadingNews(false);
    };
    fetchNews();
  }, [symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch analyst data for portfolio stocks
  useEffect(() => {
    if (portfolioSymbols.length === 0) return;
    const fetchAnalysts = async () => {
      setLoadingAnalysts(true);
      const data = {};
      await Promise.all(portfolioSymbols.map(async (sym) => {
        try {
          const res = await api.get(`/api/stocks/${sym}/analysts`);
          data[sym] = res.data;
        } catch {}
      }));
      setAnalysts(data);
      setLoadingAnalysts(false);
    };
    fetchAnalysts();
  }, [symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Price alerts from watchlist
  const alertsTriggered = (watchlist || []).filter(w => {
    const price = liveData[w.symbol]?.price;
    if (!price) return false;
    return (w.alertHigh && price >= w.alertHigh) || (w.alertLow && price <= w.alertLow);
  });

  const alertsNearby = (watchlist || []).filter(w => {
    const price = liveData[w.symbol]?.price;
    if (!price) return false;
    const nearHigh = w.alertHigh && Math.abs((price - w.alertHigh) / w.alertHigh) < 0.03;
    const nearLow = w.alertLow && Math.abs((price - w.alertLow) / w.alertLow) < 0.03;
    return (nearHigh || nearLow) && !alertsTriggered.some(a => a.symbol === w.symbol);
  });

  // Sector performance
  const sectorMap = {};
  holdings.forEach(h => {
    const data = liveData[h.symbol];
    if (!data) return;
    const sector = data.sector || 'Other';
    if (!sectorMap[sector]) sectorMap[sector] = { invested: 0, current: 0, dayChange: 0 };
    sectorMap[sector].invested += h.buyPrice * h.quantity;
    sectorMap[sector].current += (data.price || h.buyPrice) * h.quantity;
    sectorMap[sector].dayChange += (data.change || 0) * h.quantity;
  });

  const sectors = Object.entries(sectorMap).map(([name, data]) => ({
    name,
    invested: data.invested,
    current: data.current,
    pl: data.current - data.invested,
    plPct: ((data.current - data.invested) / data.invested) * 100,
    dayChange: data.dayChange,
    allocation: 0,
  }));
  const totalCurrent = sectors.reduce((sum, s) => sum + s.current, 0);
  sectors.forEach(s => { s.allocation = totalCurrent > 0 ? (s.current / totalCurrent) * 100 : 0; });
  sectors.sort((a, b) => b.current - a.current);

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

  const recColors = {
    strong_buy: 'bg-green-100 text-green-700',
    buy: 'bg-green-50 text-green-600',
    hold: 'bg-yellow-100 text-yellow-700',
    sell: 'bg-red-100 text-red-700',
    underperform: 'bg-red-100 text-red-700',
    strong_sell: 'bg-red-200 text-red-800',
  };

  return (
    <div className="space-y-6 mt-6">
      <h2 className="text-lg font-bold text-gray-900">Portfolio Insights</h2>

      {/* Price Alert Triggers */}
      {(alertsTriggered.length > 0 || alertsNearby.length > 0) && (
        <div className="space-y-3">
          {alertsTriggered.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Price Alerts Triggered
              </h3>
              <div className="space-y-2">
                {alertsTriggered.map(w => {
                  const price = liveData[w.symbol]?.price;
                  const hitHigh = w.alertHigh && price >= w.alertHigh;
                  const hitLow = w.alertLow && price <= w.alertLow;
                  return (
                    <Link key={w.symbol} to={`/stock/${w.symbol}`}
                      className="flex justify-between items-center bg-white rounded-lg p-2 hover:bg-red-50 transition-colors">
                      <div>
                        <span className="text-sm font-semibold text-gray-900">{w.name || w.symbol}</span>
                        <span className="text-xs text-gray-500 ml-2">{w.symbol.replace('.NS', '')}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold">₹{price?.toFixed(2)}</div>
                        <div className="text-xs text-red-600">
                          {hitHigh && `Crossed target ₹${w.alertHigh}`}
                          {hitLow && `Fell below ₹${w.alertLow}`}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {alertsNearby.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">Approaching Alert Targets</h3>
              <div className="space-y-2">
                {alertsNearby.map(w => {
                  const price = liveData[w.symbol]?.price;
                  const nearHigh = w.alertHigh && Math.abs(price - w.alertHigh);
                  const nearLow = w.alertLow && Math.abs(price - w.alertLow);
                  return (
                    <Link key={w.symbol} to={`/stock/${w.symbol}`}
                      className="flex justify-between items-center bg-white rounded-lg p-2 hover:bg-amber-50 transition-colors">
                      <span className="text-sm font-medium text-gray-900">{w.name || w.symbol}</span>
                      <span className="text-xs text-amber-700">
                        ₹{price?.toFixed(2)} — {nearHigh < nearLow ? `₹${nearHigh?.toFixed(2)} from ₹${w.alertHigh} target` : `₹${nearLow?.toFixed(2)} from ₹${w.alertLow} floor`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sector Performance */}
      {sectors.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Your Sector Performance</h3>
          <div className="space-y-3">
            {sectors.map(s => (
              <div key={s.name} className="flex items-center gap-3">
                <div className="w-28 text-sm text-gray-700 font-medium truncate">{s.name}</div>
                <div className="flex-1">
                  <div className="flex h-5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.pl >= 0 ? 'bg-green-400' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(s.allocation, 100)}%` }}
                    ></div>
                  </div>
                </div>
                <div className="w-16 text-right text-xs text-gray-500">{s.allocation.toFixed(1)}%</div>
                <div className={`w-20 text-right text-xs font-semibold ${s.pl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {s.plPct >= 0 ? '+' : ''}{s.plPct.toFixed(1)}%
                </div>
                <div className={`w-24 text-right text-xs ${s.dayChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Today: {s.dayChange >= 0 ? '+' : ''}₹{Math.abs(s.dayChange).toFixed(0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analyst Recommendations */}
      {!loadingAnalysts && Object.keys(analysts).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Analyst Recommendations for Your Holdings</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {portfolioSymbols.map(sym => {
              const data = analysts[sym];
              if (!data) return null;
              const name = holdings.find(h => h.symbol === sym)?.name || sym;
              const price = liveData[sym]?.price;
              const targetDiff = data.target_mean_price && price
                ? ((data.target_mean_price - price) / price * 100).toFixed(1) : null;
              return (
                <Link key={sym} to={`/stock/${sym}`}
                  className="bg-gray-50 rounded-lg p-3 hover:bg-blue-50 transition-colors block">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{name}</div>
                      <div className="text-[10px] text-gray-400">{sym.replace('.NS', '')}</div>
                    </div>
                    {data.recommendation && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${recColors[data.recommendation] || 'bg-gray-100 text-gray-600'}`}>
                        {data.recommendation.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  {data.target_mean_price && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Target: ₹{data.target_mean_price.toFixed(0)}</span>
                      {targetDiff && (
                        <span className={parseFloat(targetDiff) >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          {parseFloat(targetDiff) >= 0 ? '+' : ''}{targetDiff}% upside
                        </span>
                      )}
                    </div>
                  )}
                  {data.number_of_analysts && (
                    <div className="text-[10px] text-gray-400 mt-1">{data.number_of_analysts} analysts</div>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-2">
            <p className="text-[10px] text-amber-600">Analyst ratings are for informational purposes only and do not constitute financial advice.</p>
          </div>
        </div>
      )}

      {/* Portfolio Stock News */}
      {!loadingNews && news.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-800">News for Your Stocks</h3>
            <Link to="/news" className="text-xs text-blue-600 hover:text-blue-800 font-medium">All news</Link>
          </div>
          <div className="space-y-2">
            {news.map((article, idx) => (
              <a key={idx} href={article.url} target="_blank" rel="noopener noreferrer"
                className="flex gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group">
                {article.image ? (
                  <div className="w-16 h-12 flex-shrink-0 rounded overflow-hidden bg-gray-100">
                    <img src={article.image} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                  </div>
                ) : (
                  <div className="w-16 h-12 flex-shrink-0 rounded bg-gray-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900 font-medium group-hover:text-blue-600 transition-colors line-clamp-1">{article.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">{article.forStock}</span>
                    <span className="text-[10px] text-gray-400">{article.source} · {formatDate(article.published_at)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioPage;
