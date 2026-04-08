import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const CATEGORIES = ['All', 'Equity Large Cap', 'Equity Mid Cap', 'Equity Small Cap', 'ELSS', 'Debt', 'Hybrid', 'Index'];

const PERIODS = [
  { value: '1y', label: '1Y' },
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
  { value: 'max', label: 'Max' },
];

function NavChart({ schemeCode, period }) {
  const canvasRef = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!schemeCode) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/api/mf/${schemeCode}/history?period=${period}`)
      .then(res => {
        if (!cancelled) {
          const data = (res.data.data || [])
            .filter(d => d.nav != null)
            ; // data is already oldest-first from backend
          setChartData(data);
        }
      })
      .catch(() => { if (!cancelled) setError('Failed to load NAV history'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [schemeCode, period]);

  useEffect(() => {
    if (!chartData || chartData.length < 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    const navs = chartData.map(d => d.nav);
    const minN = Math.min(...navs) * 0.995;
    const maxN = Math.max(...navs) * 1.005;
    const range = maxN - minN || 1;

    const pad = { top: 20, right: 20, bottom: 30, left: 70 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      const val = maxN - (range / 4) * i;
      ctx.fillStyle = '#999';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(2), pad.left - 5, y + 3);
    }

    // Gradient
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    const isUp = navs[navs.length - 1] >= navs[0];
    gradient.addColorStop(0, isUp ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    const gap = cW / (navs.length - 1);

    ctx.beginPath();
    navs.forEach((n, i) => {
      const x = pad.left + gap * i;
      const y = pad.top + ((maxN - n) / range) * cH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + gap * (navs.length - 1), pad.top + cH);
    ctx.lineTo(pad.left, pad.top + cH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.strokeStyle = isUp ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    navs.forEach((n, i) => {
      const x = pad.left + gap * i;
      const y = pad.top + ((maxN - n) / range) * cH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // X-axis labels
    ctx.fillStyle = '#999';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(chartData.length / 6));
    for (let i = 0; i < chartData.length; i += step) {
      const x = pad.left + gap * i;
      ctx.fillText(chartData[i].date, x, H - 8);
    }
  }, [chartData]);

  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded" />;
  if (error) return <div className="text-red-500 text-center py-4">{error}</div>;
  if (!chartData || chartData.length === 0) return <div className="text-gray-400 text-center py-4">No history data available</div>;

  return (
    <canvas
      ref={canvasRef}
      className="w-full bg-white rounded-lg border border-gray-200"
      style={{ height: '320px' }}
    />
  );
}

function MFOverlapTool() {
  const [query1, setQuery1] = useState('');
  const [query2, setQuery2] = useState('');
  const [results1, setResults1] = useState([]);
  const [results2, setResults2] = useState([]);
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [fund1, setFund1] = useState(null);
  const [fund2, setFund2] = useState(null);
  const [overlap, setOverlap] = useState(null);
  const [loading, setLoading] = useState(false);
  const db1 = useRef(null);
  const db2 = useRef(null);

  const searchFunds = (query, setResults, setShow) => {
    if (query.trim().length < 2) { setResults([]); setShow(false); return; }
    const ref = setResults === setResults1 ? db1 : db2;
    clearTimeout(ref.current);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/api/mf/search?q=${encodeURIComponent(query)}`);
        setResults(res.data.results || []);
        setShow(true);
      } catch { setResults([]); }
    }, 400);
    ref.current = timer;
  };

  const checkOverlap = async () => {
    if (!fund1 || !fund2) return;
    setLoading(true);
    setOverlap(null);
    try {
      const res = await api.get(`/api/mf/overlap?codes=${fund1.scheme_code},${fund2.scheme_code}`);
      setOverlap(res.data);
    } catch {
      setOverlap(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Portfolio Overlap Checker</h2>
        <p className="text-sm text-gray-500 mb-4">Compare stock holdings between two mutual funds</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          {/* Fund 1 */}
          <div className="relative">
            <label className="block text-xs text-gray-500 font-medium mb-1">Fund A</label>
            <input
              type="text"
              value={query1}
              onChange={e => { setQuery1(e.target.value); setFund1(null); searchFunds(e.target.value, setResults1, setShow1); }}
              placeholder="Search fund..."
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none"
            />
            {fund1 && <div className="text-xs text-purple-600 mt-1 truncate">{fund1.scheme_name}</div>}
            {show1 && results1.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {results1.map(r => (
                  <button key={r.scheme_code} type="button"
                    onClick={() => { setFund1(r); setQuery1(r.scheme_name); setShow1(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-purple-50 text-xs border-b border-gray-50"
                  >{r.scheme_name}</button>
                ))}
              </div>
            )}
          </div>

          {/* Fund 2 */}
          <div className="relative">
            <label className="block text-xs text-gray-500 font-medium mb-1">Fund B</label>
            <input
              type="text"
              value={query2}
              onChange={e => { setQuery2(e.target.value); setFund2(null); searchFunds(e.target.value, setResults2, setShow2); }}
              placeholder="Search fund..."
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none"
            />
            {fund2 && <div className="text-xs text-purple-600 mt-1 truncate">{fund2.scheme_name}</div>}
            {show2 && results2.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {results2.map(r => (
                  <button key={r.scheme_code} type="button"
                    onClick={() => { setFund2(r); setQuery2(r.scheme_name); setShow2(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-purple-50 text-xs border-b border-gray-50"
                  >{r.scheme_name}</button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={checkOverlap}
            disabled={!fund1 || !fund2 || loading}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Analyzing...' : 'Check Overlap'}
          </button>
        </div>
      </div>

      {/* Results */}
      {overlap && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-purple-700">{overlap.overlap_pct?.toFixed(1)}%</div>
              <div className="text-xs text-gray-500 mt-1">Portfolio Overlap</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-blue-700">{overlap.common_count}</div>
              <div className="text-xs text-gray-500 mt-1">Common Stocks</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-gray-700">{overlap.holdings?.length || 0}</div>
              <div className="text-xs text-gray-500 mt-1">Shown Below</div>
            </div>
          </div>

          {/* Common Holdings Table */}
          {overlap.holdings?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <th className="text-left px-3 py-2 font-medium">Stock</th>
                    <th className="text-right px-3 py-2 font-medium">Fund A Weight</th>
                    <th className="text-center px-3 py-2 font-medium">Overlap</th>
                    <th className="text-right px-3 py-2 font-medium">Fund B Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overlap.holdings.map((h, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-900 font-medium">{h.name}</td>
                      <td className="px-3 py-2 text-right text-blue-600">{h.weight1?.toFixed(2)}%</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <div className="h-2 bg-blue-400 rounded-l" style={{ width: `${Math.min(h.weight1 * 8, 40)}px` }} />
                          <div className="h-2 bg-green-400 rounded-r" style={{ width: `${Math.min(h.weight2 * 8, 40)}px` }} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-green-600">{h.weight2?.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MutualFundPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [topFunds, setTopFunds] = useState([]);
  const [loadingTop, setLoadingTop] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedFund, setSelectedFund] = useState(null);
  const [navPeriod, setNavPeriod] = useState('1y');
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'overlap'
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);

  // Fetch top funds
  useEffect(() => {
    setLoadingTop(true);
    const cat = activeCategory === 'All' ? 'all' : activeCategory;
    api.get(`/api/mf/top?category=${encodeURIComponent(cat)}`)
      .then(res => setTopFunds(res.data.funds || []))
      .catch(() => setTopFunds([]))
      .finally(() => setLoadingTop(false));
  }, [activeCategory]);

  // Search autocomplete
  useEffect(() => {
    if (selectedFund) return; // Skip search when fund is already selected
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/mf/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(res.data.results || []);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, selectedFund]);

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

  const selectFund = (fund) => {
    setSelectedFund(fund);
    setSearchQuery(fund.scheme_name);
    setShowDropdown(false);
    setSearchResults([]);
    setNavPeriod('1y');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mutual Funds</h1>
          <p className="text-sm text-gray-500 mt-1">Search, analyze and compare Indian mutual funds</p>
        </div>
        <button
          onClick={() => { setActiveTab(activeTab === 'overlap' ? 'browse' : 'overlap'); setSelectedFund(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'overlap' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {activeTab === 'overlap' ? 'Back to Funds' : 'Portfolio Overlap'}
        </button>
      </div>

      {/* Overlap Tool */}
      {activeTab === 'overlap' && <MFOverlapTool />}

      {/* Browse mode: search + funds */}
      {activeTab === 'browse' && (<>
      <div className="mb-6 relative" ref={dropdownRef}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setSelectedFund(null); }}
          onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
          placeholder="Search mutual funds (e.g., HDFC Mid Cap, SBI Small Cap)"
          className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
        />
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-72 overflow-y-auto">
            {searchResults.map((r) => (
              <button
                key={r.scheme_code}
                type="button"
                onClick={() => selectFund(r)}
                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
              >
                <div className="text-sm text-gray-900">{r.scheme_name}</div>
                <div className="text-xs text-gray-400">Code: {r.scheme_code}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Fund Detail */}
      {selectedFund && (
        <FundDetail
          schemeCode={selectedFund.scheme_code}
          schemeName={selectedFund.scheme_name}
          period={navPeriod}
          setPeriod={setNavPeriod}
          onBack={() => { setSelectedFund(null); setSearchQuery(''); }}
        />
      )}

      {/* Category Filter */}
      {!selectedFund && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Top Funds Grid */}
          {loadingTop ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-28" />
              ))}
            </div>
          ) : topFunds.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topFunds.map(fund => (
                <button
                  key={fund.scheme_code}
                  type="button"
                  onClick={() => selectFund(fund)}
                  className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all text-left"
                >
                  <div className="text-xs text-blue-600 font-medium mb-1">{fund.category}</div>
                  <div className="text-sm font-semibold text-gray-900 line-clamp-2 mb-2">{fund.scheme_name}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-gray-900">
                      {fund.nav != null ? `₹${fund.nav.toFixed(2)}` : 'N/A'}
                    </span>
                    <span className="text-xs text-gray-400">NAV</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              No funds found for this category
            </div>
          )}
        </>
      )}
      </>)}

      {/* Disclaimer */}
      <div className="mt-8 text-xs text-gray-400 text-center">
        Data sourced from AMFI via mftool. NAV values may be delayed by 1 business day. Not financial advice.
        {' '}Mutual fund investments are subject to market risks.
      </div>
    </div>
  );
}

function FundDetail({ schemeCode, schemeName, period, setPeriod, onBack }) {
  const [nav, setNav] = useState(null);
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState(null);
  const [loadingHoldings, setLoadingHoldings] = useState(true);

  useEffect(() => {
    setLoading(true);
    setLoadingHoldings(true);
    api.get(`/api/mf/${schemeCode}/nav`)
      .then(res => setNav(res.data))
      .catch(() => setNav(null))
      .finally(() => setLoading(false));
    api.get(`/api/mf/${schemeCode}/holdings`)
      .then(res => setHoldings(res.data))
      .catch(() => setHoldings(null))
      .finally(() => setLoadingHoldings(false));
  }, [schemeCode]);

  const formatCr = (val) => {
    if (!val) return '-';
    if (val >= 1e9) return `₹${(val / 1e10).toFixed(0)} Cr`;
    if (val >= 1e7) return `₹${(val / 1e7).toFixed(1)} Cr`;
    return `₹${(val / 1e5).toFixed(1)} L`;
  };

  return (
    <div className="mb-6 space-y-4">
      {/* Fund Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">{schemeName}</h2>
            <div className="text-xs text-gray-400 mt-0.5">Scheme Code: {schemeCode}</div>
            {!loading && nav && (
              <div className="flex flex-wrap gap-3 mt-3">
                {nav.category && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{nav.category}</span>}
                {nav.risk_label && <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded">{nav.risk_label}</span>}
                {nav.expense_ratio != null && <span className="text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded">Expense: {nav.expense_ratio}%</span>}
                {nav.aum && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">AUM: {formatCr(nav.aum)}</span>}
              </div>
            )}
          </div>
          {!loading && nav && (
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">₹{nav.nav?.toFixed(4)}</div>
              <div className="text-xs text-gray-500">NAV as of {nav.nav_date}</div>
            </div>
          )}
          {loading && (
            <div className="animate-pulse">
              <div className="h-7 w-24 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-20 bg-gray-200 rounded" />
            </div>
          )}
        </div>

        {/* Returns */}
        {!loading && nav?.returns && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4 pt-4 border-t border-gray-100">
            {[
              { label: '1M', val: nav.returns.return_1m },
              { label: '3M', val: nav.returns.return_3m },
              { label: '6M', val: nav.returns.return_6m },
              { label: '1Y', val: nav.returns.return_1y },
              { label: '3Y', val: nav.returns.return_3y },
              { label: '5Y', val: nav.returns.return_5y },
            ].map(r => (
              <div key={r.label} className="text-center">
                <div className="text-[10px] text-gray-400">{r.label}</div>
                <div className={`text-sm font-bold ${(r.val || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {r.val != null ? `${r.val > 0 ? '+' : ''}${r.val.toFixed(1)}%` : '-'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Period Selector + Chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">NAV History</h3>
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  period === p.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <NavChart schemeCode={schemeCode} period={period} />
      </div>

      {/* Holdings */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Top Holdings</h3>
          {holdings?.month && <span className="text-xs text-gray-400">As of {holdings.month}</span>}
        </div>
        {loadingHoldings ? (
          <div className="animate-pulse space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded w-3/4" />)}
          </div>
        ) : holdings?.holdings?.length > 0 ? (
          <>
            {/* Allocation summary */}
            <div className="flex gap-3 mb-4">
              {holdings.equity_pct != null && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-xs text-gray-600">Equity {holdings.equity_pct}%</span>
                </div>
              )}
              {holdings.debt_pct != null && holdings.debt_pct > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-xs text-gray-600">Debt {holdings.debt_pct}%</span>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Stock</th>
                    <th className="text-left px-3 py-2 font-medium">Sector</th>
                    <th className="text-right px-3 py-2 font-medium">Weight</th>
                    <th className="text-right px-3 py-2 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {holdings.holdings.map((h, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-3 py-2 text-gray-900 font-medium">{h.name}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{h.sector || '-'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((h.weight || 0) * 10, 100)}%` }} />
                          </div>
                          <span className="text-gray-700 font-medium">{h.weight?.toFixed(2)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 text-xs">{formatCr(h.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-sm text-center py-4">Holdings data not available for this fund</p>
        )}
      </div>

      {/* Back button */}
      <button
        onClick={onBack}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        &larr; Back to all funds
      </button>
    </div>
  );
}

export default MutualFundPage;
