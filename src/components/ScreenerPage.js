import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const formatNumber = (num) => {
  if (num == null) return 'N/A';
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e7) return `${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `${(num / 1e5).toFixed(2)}L`;
  return num.toLocaleString('en-IN');
};

const formatVal = (val, suffix = '') => {
  if (val == null) return '-';
  return `${typeof val === 'number' ? val.toFixed(2) : val}${suffix}`;
};

const FILTER_GROUPS = [
  {
    label: 'Valuation',
    filters: [
      { key: 'market_cap_range', label: 'Market Cap', options: [
        { label: 'All', value: 'all' },
        { label: 'Large Cap (>1L Cr)', value: 'large' },
        { label: 'Mid Cap (25K-1L Cr)', value: 'mid' },
        { label: 'Small Cap (<25K Cr)', value: 'small' },
      ]},
      { key: 'pe_range', label: 'P/E Ratio', options: [
        { label: 'All', value: 'all' },
        { label: '< 10 (Deep Value)', value: '<10' },
        { label: '10 - 20', value: '10-20' },
        { label: '20 - 40', value: '20-40' },
        { label: '> 40 (Growth)', value: '>40' },
      ]},
      { key: 'pb_range', label: 'P/B Ratio', options: [
        { label: 'All', value: 'all' },
        { label: '< 1 (Below Book)', value: '<1' },
        { label: '1 - 3', value: '1-3' },
        { label: '3 - 5', value: '3-5' },
        { label: '> 5', value: '>5' },
      ]},
      { key: 'peg_range', label: 'PEG Ratio', options: [
        { label: 'All', value: 'all' },
        { label: '< 1 (Undervalued)', value: '<1' },
        { label: '1 - 2', value: '1-2' },
        { label: '> 2 (Overvalued)', value: '>2' },
      ]},
      { key: 'ev_ebitda_range', label: 'EV/EBITDA', options: [
        { label: 'All', value: 'all' },
        { label: '< 10', value: '<10' },
        { label: '10 - 20', value: '10-20' },
        { label: '> 20', value: '>20' },
      ]},
    ],
  },
  {
    label: 'Profitability',
    filters: [
      { key: 'roe_range', label: 'ROE %', options: [
        { label: 'All', value: 'all' },
        { label: '> 20% (Excellent)', value: '>20' },
        { label: '> 15%', value: '>15' },
        { label: '> 10%', value: '>10' },
        { label: '< 0% (Loss)', value: '<0' },
      ]},
      { key: 'profit_margin_range', label: 'Profit Margin', options: [
        { label: 'All', value: 'all' },
        { label: '> 20% (High)', value: '>20' },
        { label: '> 10%', value: '>10' },
        { label: '> 0%', value: '>0' },
        { label: '< 0% (Loss)', value: '<0' },
      ]},
    ],
  },
  {
    label: 'Growth',
    filters: [
      { key: 'rev_growth_range', label: 'Revenue Growth', options: [
        { label: 'All', value: 'all' },
        { label: '> 20% (High)', value: '>20' },
        { label: '> 10%', value: '>10' },
        { label: '> 0%', value: '>0' },
        { label: '< 0% (Declining)', value: '<0' },
      ]},
    ],
  },
  {
    label: 'Dividends',
    filters: [
      { key: 'div_yield_range', label: 'Dividend Yield', options: [
        { label: 'All', value: 'all' },
        { label: '> 5% (High)', value: '>5' },
        { label: '> 3%', value: '>3' },
        { label: '> 1%', value: '>1' },
        { label: 'No Dividend', value: '0' },
      ]},
    ],
  },
  {
    label: 'Analyst',
    filters: [
      { key: 'recommendation_range', label: 'Recommendation', options: [
        { label: 'All', value: 'all' },
        { label: 'Strong Buy', value: 'strong_buy' },
        { label: 'Buy', value: 'buy' },
        { label: 'Hold', value: 'hold' },
        { label: 'Sell / Underperform', value: 'sell' },
      ]},
    ],
  },
];

const COLUMNS = [
  { key: 'name', label: 'Company', sticky: true },
  { key: 'sector', label: 'Sector' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'change_percent', label: 'Chg%', align: 'right' },
  { key: 'market_cap', label: 'MCap', align: 'right' },
  { key: 'pe_ratio', label: 'P/E', align: 'right' },
  { key: 'pb_ratio', label: 'P/B', align: 'right' },
  { key: 'dividend_yield', label: 'Div%', align: 'right' },
  { key: 'eps', label: 'EPS', align: 'right' },
  { key: 'book_value', label: 'BV', align: 'right' },
  { key: 'week52_high', label: '52W H', align: 'right' },
  { key: 'week52_low', label: '52W L', align: 'right' },
  { key: 'volume', label: 'Volume', align: 'right' },
  { key: 'recommendation', label: 'Rating', align: 'center' },
];

const RatingBadge = ({ rating }) => {
  const colors = {
    buy: 'bg-green-50 text-green-600', strong_buy: 'bg-green-100 text-green-700',
    hold: 'bg-yellow-100 text-yellow-700', sell: 'bg-red-100 text-red-700',
    underperform: 'bg-red-100 text-red-700', strong_sell: 'bg-red-200 text-red-800',
  };
  if (!rating) return <span className="text-gray-300">-</span>;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${colors[rating] || 'bg-gray-100 text-gray-600'}`}>
      {rating.replace('_', ' ')}
    </span>
  );
};

const ScreenerPage = () => {
  const [stocks, setStocks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({});
  const [sortKey, setSortKey] = useState('market_cap');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedGroups, setExpandedGroups] = useState({ Valuation: true });
  const [searchTerm, setSearchTerm] = useState('');
  const [resultSize, setResultSize] = useState(50);
  const [filterLogic, setFilterLogic] = useState('AND');

  const fetchStocks = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('size', resultSize);
    params.set('sort', sortKey === 'market_cap' ? 'intradaymarketcap' : sortKey);
    params.set('sort_dir', sortDir);
    params.set('logic', filterLogic);

    // Add active filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        params.set(key, value);
      }
    });

    api.get(`/api/stocks/screener?${params.toString()}`)
      .then((res) => {
        setStocks(res.data.stocks || []);
        setTotal(res.data.total || 0);
      })
      .catch(() => setError('Failed to load screener data'))
      .finally(() => setLoading(false));
  }, [filters, resultSize, sortKey, sortDir, filterLogic]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleGroup = (label) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const activeFilterCount = Object.values(filters).filter((v) => v && v !== 'all').length;

  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  // Local text search on loaded results
  const displayedStocks = useMemo(() => {
    if (!searchTerm) return stocks;
    const term = searchTerm.toLowerCase();
    return stocks.filter(s =>
      s.name?.toLowerCase().includes(term) || s.symbol?.toLowerCase().includes(term)
    );
  }, [stocks, searchTerm]);

  // Local sort
  const sortedStocks = useMemo(() => {
    return [...displayedStocks].sort((a, b) => {
      let aVal = a[sortKey]; let bVal = b[sortKey];
      if (aVal == null) return 1; if (bVal == null) return -1;
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [displayedStocks, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const renderCell = (stock, col) => {
    const val = stock[col.key];
    switch (col.key) {
      case 'name':
        return (
          <Link to={`/stock/${stock.symbol}`} className="hover:text-blue-600 transition-colors">
            <div className="text-sm font-semibold text-gray-900">{stock.name}</div>
            <div className="text-[10px] text-gray-400">{stock.symbol}</div>
          </Link>
        );
      case 'price': return <span className="font-medium">₹{val?.toFixed(2)}</span>;
      case 'change_percent':
        return <span className={`font-semibold ${val >= 0 ? 'text-green-600' : 'text-red-600'}`}>{val >= 0 ? '+' : ''}{val?.toFixed(2)}%</span>;
      case 'market_cap': return formatNumber(val);
      case 'volume': return formatNumber(val);
      case 'week52_high': case 'week52_low': return val ? `₹${val.toFixed(2)}` : '-';
      case 'recommendation': return <RatingBadge rating={val} />;
      default: return formatVal(val, col.key.includes('yield') ? '%' : '');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1400px] mx-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Screener</h1>
            <p className="text-sm text-gray-500 mt-1">
              Search across {total.toLocaleString('en-IN')}+ Indian stocks with real-time filters
            </p>
          </div>
          <select value={resultSize} onChange={(e) => setResultSize(parseInt(e.target.value))}
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
            <option value={50}>Show 50</option>
            <option value={100}>Show 100</option>
            <option value={200}>Show 200</option>
          </select>
        </div>

        {/* Search + Clear */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="text" placeholder="Search in results by name or symbol..."
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {/* AND/OR toggle */}
            {activeFilterCount >= 2 && (
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setFilterLogic('AND')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors focus:outline-none ${
                    filterLogic === 'AND' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                  }`}>AND</button>
                <button onClick={() => setFilterLogic('OR')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors focus:outline-none ${
                    filterLogic === 'OR' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                  }`}>OR</button>
              </div>
            )}
            {activeFilterCount > 0 && (
              <button onClick={clearFilters}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium focus:outline-none">
                Clear all ({activeFilterCount})
              </button>
            )}
          </div>
        </div>

        {/* Filter Groups */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {FILTER_GROUPS.map((group) => (
            <div key={group.label} className="border-b border-gray-100 last:border-0">
              <button onClick={() => toggleGroup(group.label)}
                className="w-full flex justify-between items-center px-4 py-3 hover:bg-gray-50 transition-colors focus:outline-none">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{group.label}</span>
                  {group.filters.some((f) => filters[f.key] && filters[f.key] !== 'all') && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  )}
                </div>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedGroups[group.label] ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedGroups[group.label] && (
                <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {group.filters.map((filter) => (
                    <div key={filter.key}>
                      <label className="block text-[10px] text-gray-500 font-medium mb-1 uppercase tracking-wide">{filter.label}</label>
                      <select value={filters[filter.key] || 'all'} onChange={(e) => setFilter(filter.key, e.target.value)}
                        className={`w-full px-2 py-1.5 border rounded-md text-xs bg-white transition-colors ${
                          filters[filter.key] && filters[filter.key] !== 'all' ? 'border-blue-400 ring-1 ring-blue-100' : 'border-gray-200'
                        }`}>
                        {filter.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Results info */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">
            {loading ? 'Searching...' : `${sortedStocks.length} stocks shown (${total.toLocaleString('en-IN')} matched)`}
          </span>
          <span className="text-[10px] text-gray-400">Click column headers to sort</span>
        </div>

        {/* Table */}
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-600">{error}</p>
            <button onClick={fetchStocks} className="mt-2 text-sm text-blue-600 underline focus:outline-none">Retry</button>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="space-y-3 animate-pulse">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-4 bg-gray-200 rounded w-40"></div>
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {COLUMNS.map((col) => (
                      <th key={col.key} onClick={() => handleSort(col.key)}
                        className={`px-3 py-2.5 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                        } ${col.sticky ? 'sticky left-0 bg-gray-50 z-10' : ''}`}>
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {sortKey === col.key && (
                            <svg className={`w-3 h-3 ${sortDir === 'asc' ? '' : 'rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                              <path d="M5.293 7.707a1 1 0 011.414 0L10 11.001l3.293-3.294a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                            </svg>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedStocks.map((stock) => (
                    <tr key={stock.symbol} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                      {COLUMNS.map((col) => (
                        <td key={col.key}
                          className={`px-3 py-2 whitespace-nowrap ${
                            col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                          } ${col.sticky ? 'sticky left-0 bg-white z-10' : ''}`}>
                          {renderCell(stock, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {sortedStocks.length === 0 && (
                    <tr><td colSpan={COLUMNS.length} className="text-center py-8 text-gray-400">
                      No stocks match your filters.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScreenerPage;
