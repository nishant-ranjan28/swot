import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';

const formatINR = (num) => {
  if (num == null) return '-';
  if (num >= 1e7) return `₹${(num / 1e7).toFixed(2)} Cr`;
  if (num >= 1e5) return `₹${(num / 1e5).toFixed(2)} L`;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const TOOLS = [
  { id: 'sip', label: 'SIP Returns', desc: 'Simulate monthly SIP in stocks or mutual funds', icon: '📈' },
  { id: 'lumpsum', label: 'Lumpsum Returns', desc: 'One-time investment return calculator', icon: '💰' },
  { id: 'compare', label: 'SIP vs Lumpsum', desc: 'Compare both strategies side by side', icon: '⚖️' },
  { id: 'cagr', label: 'CAGR Calculator', desc: 'Compound annual growth rate', icon: '📊' },
  { id: 'goal', label: 'Goal Planner', desc: 'Monthly SIP needed to reach a target', icon: '🎯' },
  { id: 'emi', label: 'EMI Calculator', desc: 'Loan EMI calculation', icon: '🏦' },
  { id: 'ci', label: 'Compound Interest', desc: 'FD / RD returns calculator', icon: '🏧' },
];

const POPULAR_STOCKS = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'SBIN.NS'];
const POPULAR_MFS = [
  { symbol: '0P0000XVU7.BO', name: 'Axis ELSS Tax Saver' },
  { symbol: '0P00005WLZ.BO', name: 'HDFC Flexi Cap' },
  { symbol: '0P0001BAYI.BO', name: 'Mirae Asset Large Cap' },
  { symbol: '0P0001BA79.BO', name: 'HDFC Flexi Cap Dir' },
];

const InputField = ({ label, value, onChange, type = 'number', prefix, suffix, ...props }) => (
  <div>
    <label className="block text-xs text-gray-500 font-medium mb-1">{label}</label>
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        className={`w-full border border-gray-200 rounded-lg py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-10' : 'pr-3'}`}
        {...props}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{suffix}</span>}
    </div>
  </div>
);

const ResultCard = ({ label, value, sub, color }) => (
  <div className="bg-gray-50 rounded-lg p-4 text-center">
    <div className="text-xs text-gray-500 mb-1">{label}</div>
    <div className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</div>
    {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
  </div>
);

const GrowthChart = ({ data, width = 600, height = 200 }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: width, h: height });

  useEffect(() => {
    if (containerRef.current) setDims({ w: containerRef.current.offsetWidth, h: height });
    const resize = () => { if (containerRef.current) setDims({ w: containerRef.current.offsetWidth, h: height }); };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [height]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, dims.w, dims.h);

    const pad = { t: 10, r: 10, b: 25, l: 60 };
    const cw = dims.w - pad.l - pad.r;
    const ch = dims.h - pad.t - pad.b;

    const allVals = data.flatMap(d => [d.invested, d.value, ...(d.value2 ? [d.value2] : [])]);
    const minV = 0;
    const maxV = Math.max(...allVals) * 1.05;

    const x = (i) => pad.l + (i / (data.length - 1)) * cw;
    const y = (v) => pad.t + ch - ((v - minV) / (maxV - minV)) * ch;

    // Grid
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(dims.w - pad.r, yy); ctx.stroke();
      ctx.fillStyle = '#9ca3af'; ctx.font = '10px system-ui'; ctx.textAlign = 'right';
      ctx.fillText(formatINR(maxV - (maxV / 4) * i), pad.l - 5, yy + 3);
    }

    // Date labels
    ctx.fillStyle = '#9ca3af'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(data.length / 6));
    for (let i = 0; i < data.length; i += step) {
      ctx.fillText(data[i].label || '', x(i), dims.h - 5);
    }

    // Invested line (blue dashed)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => i === 0 ? ctx.moveTo(x(i), y(d.invested)) : ctx.lineTo(x(i), y(d.invested)));
    ctx.stroke();
    ctx.setLineDash([]);

    // Value line
    const isPos = data[data.length - 1].value >= data[data.length - 1].invested;
    ctx.strokeStyle = isPos ? '#16a34a' : '#dc2626'; ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => i === 0 ? ctx.moveTo(x(i), y(d.value)) : ctx.lineTo(x(i), y(d.value)));
    ctx.stroke();

    // Fill
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = isPos ? '#16a34a' : '#dc2626';
    ctx.beginPath();
    data.forEach((d, i) => i === 0 ? ctx.moveTo(x(i), y(d.value)) : ctx.lineTo(x(i), y(d.value)));
    ctx.lineTo(x(data.length - 1), y(0)); ctx.lineTo(x(0), y(0)); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // Value2 line (for compare mode)
    if (data[0].value2 !== undefined) {
      const isPos2 = data[data.length - 1].value2 >= data[data.length - 1].invested;
      ctx.strokeStyle = isPos2 ? '#f59e0b' : '#ec4899'; ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      data.forEach((d, i) => i === 0 ? ctx.moveTo(x(i), y(d.value2)) : ctx.lineTo(x(i), y(d.value2)));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [data, dims]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <div ref={containerRef}>
      <canvas ref={canvasRef} style={{ width: dims.w, height: dims.h }} />
    </div>
  );
};

// ===== Search Input with Dropdown =====
const SearchInput = ({ label, value, onChange, onSelect, placeholder, searchEndpoint, searchBoth }) => {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (val) => {
    setQuery(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setSuggestions([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(() => {
      const encoded = encodeURIComponent(val.trim());
      if (searchBoth) {
        // Search both stocks and MFs, merge and dedupe
        Promise.all([
          api.get(`/api/stocks/search?q=${encoded}`).catch(() => ({ data: { results: [] } })),
          api.get(`/api/stocks/search/mf?q=${encoded}`).catch(() => ({ data: { results: [] } })),
        ]).then(([stockRes, mfRes]) => {
          const stocks = (stockRes.data.results || []).map(s => ({ ...s, category: 'Stock' }));
          const mfs = (mfRes.data.results || []).map(m => ({ ...m, category: 'Mutual Fund' }));
          const seen = new Set();
          const merged = [...stocks, ...mfs].filter(item => {
            if (seen.has(item.symbol)) return false;
            seen.add(item.symbol);
            return true;
          });
          setSuggestions(merged.slice(0, 10));
          setShowDropdown(merged.length > 0);
        });
      } else {
        api.get(`${searchEndpoint}?q=${encoded}`)
          .then(res => {
            const results = res.data.results || [];
            setSuggestions(results.slice(0, 8));
            setShowDropdown(results.length > 0);
          })
          .catch(() => setSuggestions([]));
      }
    }, 400);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-xs text-gray-500 font-medium mb-1">{label}</label>
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-50 bg-white border border-gray-200 rounded-lg w-full max-h-56 overflow-auto mt-1 shadow-lg">
          {suggestions.map((item) => (
            <li key={item.symbol}>
              <button
                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors focus:outline-none border-b border-gray-50 last:border-0"
                onClick={() => {
                  setQuery(item.name || item.symbol);
                  onChange(item.symbol);
                  onSelect(item);
                  setShowDropdown(false);
                }}
              >
                <div className="flex justify-between items-start">
                  <div className="text-sm font-medium text-gray-900 truncate flex-1">{item.name || item.symbol}</div>
                  {item.category && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ml-2 flex-shrink-0 ${
                      item.category === 'Mutual Fund' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                    }`}>{item.category}</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-400">{item.symbol}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ===== SIP Calculator =====
const SipTool = () => {
  const [symbol, setSymbol] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [amount, setAmount] = useState(5000);
  const [years, setYears] = useState(5);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('stock');

  const calculate = (sym) => {
    const s = sym || symbol;
    if (!s) return;
    const resolved = s.includes('.') ? s : `${s.toUpperCase()}.NS`;
    setLoading(true); setError(null);
    api.get(`/api/stocks/sip/${resolved}?amount=${amount}&years=${years}`)
      .then(res => setResult(res.data))
      .catch(() => setError('Could not calculate. Check the symbol or fund name.'))
      .finally(() => setLoading(false));
  };

  const chartData = result?.investments?.map(inv => ({
    label: inv.date.substring(0, 7),
    invested: inv.invested,
    value: inv.current_value,
  }));

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button onClick={() => { setMode('stock'); setSymbol(''); setDisplayName(''); setResult(null); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium focus:outline-none ${mode === 'stock' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Stocks
        </button>
        <button onClick={() => { setMode('mf'); setSymbol(''); setDisplayName(''); setResult(null); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium focus:outline-none ${mode === 'mf' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Mutual Funds
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {mode === 'stock' ? (
          <SearchInput
            label="Search Stock"
            value={displayName || symbol}
            onChange={(val) => setSymbol(val)}
            onSelect={(item) => { setSymbol(item.symbol); setDisplayName(item.name); }}
            placeholder="Type stock name... e.g. Reliance"
            searchEndpoint="/api/stocks/search"
          />
        ) : (
          <SearchInput
            label="Search Mutual Fund"
            value={displayName || symbol}
            onChange={(val) => setSymbol(val)}
            onSelect={(item) => { setSymbol(item.symbol); setDisplayName(item.name); }}
            placeholder="Type fund name... e.g. HDFC Flexi"
            searchEndpoint="/api/stocks/search/mf"
          />
        )}
        <InputField label="Monthly Amount" value={amount} onChange={setAmount} prefix="₹" min={100} step={500} />
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">Period</label>
          <select value={years} onChange={e => setYears(parseInt(e.target.value))}
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm">
            {[1,2,3,5,7,10,15,20].map(y => <option key={y} value={y}>{y} Years</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={() => calculate()} disabled={loading || !symbol}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </div>

      {/* Quick picks */}
      <div className="flex flex-wrap gap-2">
        {mode === 'stock'
          ? POPULAR_STOCKS.map(s => (
            <button key={s} onClick={() => { setSymbol(s); setDisplayName(s.replace('.NS', '')); calculate(s); }}
              className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-blue-100 hover:text-blue-700 focus:outline-none">
              {s.replace('.NS', '')}
            </button>
          ))
          : POPULAR_MFS.map(mf => (
            <button key={mf.symbol} onClick={() => { setSymbol(mf.symbol); setDisplayName(mf.name); calculate(mf.symbol); }}
              className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-blue-100 hover:text-blue-700 focus:outline-none">
              {mf.name}
            </button>
          ))
        }
      </div>

      {error && <div className="text-red-600 text-sm text-center py-4">{error}</div>}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ResultCard label="Total Invested" value={formatINR(result.total_invested)} />
            <ResultCard label="Current Value" value={formatINR(result.current_value)}
              color={result.total_return >= 0 ? 'text-green-600' : 'text-red-600'} />
            <ResultCard label="Total Returns" value={`${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct}%`}
              sub={formatINR(result.total_return)} color={result.total_return >= 0 ? 'text-green-600' : 'text-red-600'} />
            <ResultCard label="CAGR" value={`${result.cagr}%`}
              color={result.cagr >= 0 ? 'text-green-600' : 'text-red-600'} />
          </div>
          {chartData && <GrowthChart data={chartData} />}
        </div>
      )}
    </div>
  );
};

// ===== Lumpsum Calculator =====
const LumpsumTool = () => {
  const [symbol, setSymbol] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [amount, setAmount] = useState(100000);
  const [years, setYears] = useState(5);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const calculate = (sym) => {
    const s = sym || symbol;
    if (!s) return;
    const resolved = s.includes('.') ? s : `${s.toUpperCase()}.NS`;
    setLoading(true); setError(null);
    api.get(`/api/stocks/${resolved}/history?range=${years}y`)
      .then(res => {
        const data = res.data.data;
        if (!data || data.length < 2) { setError('No data available'); return; }
        const startPrice = data[0].close;
        const endPrice = data[data.length - 1].close;
        const units = amount / startPrice;
        const currentValue = units * endPrice;
        const totalReturn = currentValue - amount;
        const totalReturnPct = (totalReturn / amount) * 100;
        const numYears = data.length / 252;
        const cagr = (Math.pow(currentValue / amount, 1 / numYears) - 1) * 100;

        const chartData = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 60)) === 0).map(d => ({
          label: d.date.substring(0, 7),
          invested: amount,
          value: units * d.close,
        }));

        setResult({ amount, currentValue, totalReturn, totalReturnPct, cagr, startPrice, endPrice, units, chartData, startDate: data[0].date, endDate: data[data.length - 1].date });
      })
      .catch(() => setError('Could not calculate. Check the symbol.'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <SearchInput
          label="Search Stock / Mutual Fund"
          value={displayName || symbol}
          onChange={(val) => setSymbol(val)}
          onSelect={(item) => { setSymbol(item.symbol); setDisplayName(item.name); }}
          placeholder="Type name... e.g. Reliance, HDFC Flexi"
          searchBoth
        />
        <InputField label="Investment Amount" value={amount} onChange={setAmount} prefix="₹" min={1000} step={10000} />
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">Period</label>
          <select value={years} onChange={e => setYears(parseInt(e.target.value))}
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm">
            {[1,2,3,5,7,10].map(y => <option key={y} value={y}>{y} Years</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={() => calculate()} disabled={loading || !symbol}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {POPULAR_STOCKS.map(s => (
          <button key={s} onClick={() => { setSymbol(s); setDisplayName(s.replace('.NS', '')); calculate(s); }}
            className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-blue-100 hover:text-blue-700 focus:outline-none">
            {s.replace('.NS', '')}
          </button>
        ))}
      </div>
      {error && <div className="text-red-600 text-sm text-center py-4">{error}</div>}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ResultCard label="Invested" value={formatINR(result.amount)} />
            <ResultCard label="Current Value" value={formatINR(result.currentValue)}
              color={result.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'} />
            <ResultCard label="Returns" value={`${result.totalReturnPct >= 0 ? '+' : ''}${result.totalReturnPct.toFixed(2)}%`}
              sub={formatINR(result.totalReturn)} color={result.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'} />
            <ResultCard label="CAGR" value={`${result.cagr.toFixed(2)}%`}
              color={result.cagr >= 0 ? 'text-green-600' : 'text-red-600'} />
          </div>
          <div className="text-xs text-gray-400 text-center">
            {result.startDate} to {result.endDate} | Buy: ₹{result.startPrice.toFixed(2)} | Now: ₹{result.endPrice.toFixed(2)} | Units: {result.units.toFixed(2)}
          </div>
          {result.chartData && <GrowthChart data={result.chartData} />}
        </div>
      )}
    </div>
  );
};

// ===== SIP vs Lumpsum Compare =====
const CompareTool = () => {
  const [symbol, setSymbol] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [amount, setAmount] = useState(5000);
  const [years, setYears] = useState(5);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const calculate = (sym) => {
    const s = sym || symbol;
    if (!s) return;
    const resolved = s.includes('.') ? s : `${s.toUpperCase()}.NS`;
    setLoading(true); setError(null);

    Promise.all([
      api.get(`/api/stocks/sip/${resolved}?amount=${amount}&years=${years}`),
      api.get(`/api/stocks/${resolved}/history?range=${years}y`),
    ]).then(([sipRes, histRes]) => {
      const sipData = sipRes.data;
      const histData = histRes.data.data;
      if (!histData || histData.length < 2) { setError('No data'); return; }

      const totalSipInvested = sipData.total_invested;
      const lumpsumAmount = totalSipInvested;
      const startPrice = histData[0].close;
      const endPrice = histData[histData.length - 1].close;
      const lumpsumUnits = lumpsumAmount / startPrice;
      const lumpsumValue = lumpsumUnits * endPrice;
      const lumpsumReturn = ((lumpsumValue - lumpsumAmount) / lumpsumAmount) * 100;
      const lumpsumCagr = (Math.pow(lumpsumValue / lumpsumAmount, 1 / (histData.length / 252)) - 1) * 100;

      // Build chart data
      const chartData = sipData.investments?.filter((_, i) => i % Math.max(1, Math.floor(sipData.investments.length / 50)) === 0)
        .map((inv, idx, arr) => {
          const histIdx = Math.floor((idx / arr.length) * (histData.length - 1));
          const lumpsumVal = lumpsumUnits * histData[histIdx].close;
          return { label: inv.date.substring(0, 7), invested: inv.invested, value: inv.current_value, value2: lumpsumVal };
        });

      setResult({
        sip: { invested: totalSipInvested, value: sipData.current_value, returnPct: sipData.total_return_pct, cagr: sipData.cagr },
        lumpsum: { invested: lumpsumAmount, value: lumpsumValue, returnPct: lumpsumReturn, cagr: lumpsumCagr },
        chartData,
        winner: sipData.current_value > lumpsumValue ? 'SIP' : 'Lumpsum',
      });
    }).catch(() => setError('Could not calculate'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <SearchInput
          label="Search Stock / Mutual Fund"
          value={displayName || symbol}
          onChange={(val) => setSymbol(val)}
          onSelect={(item) => { setSymbol(item.symbol); setDisplayName(item.name); }}
          placeholder="Type name... e.g. Reliance"
          searchEndpoint="/api/stocks/search"
        />
        <InputField label="Monthly SIP Amount" value={amount} onChange={setAmount} prefix="₹" min={100} step={500} />
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">Period</label>
          <select value={years} onChange={e => setYears(parseInt(e.target.value))}
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm">
            {[1,2,3,5,7,10].map(y => <option key={y} value={y}>{y} Years</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={() => calculate()} disabled={loading || !symbol}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Comparing...' : 'Compare'}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {POPULAR_STOCKS.map(s => (
          <button key={s} onClick={() => { setSymbol(s); setDisplayName(s.replace('.NS', '')); calculate(s); }}
            className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-blue-100 hover:text-blue-700 focus:outline-none">
            {s.replace('.NS', '')}
          </button>
        ))}
      </div>
      {error && <div className="text-red-600 text-sm text-center py-4">{error}</div>}
      {result && (
        <div className="space-y-4">
          {result.winner && (
            <div className="text-center py-2">
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                {result.winner} wins by {formatINR(Math.abs(result.sip.value - result.lumpsum.value))}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-800 mb-2">SIP (Monthly ₹{amount.toLocaleString('en-IN')})</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Invested</span><span className="font-medium">{formatINR(result.sip.invested)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Value</span><span className="font-bold text-green-600">{formatINR(result.sip.value)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Returns</span><span className={result.sip.returnPct >= 0 ? 'text-green-600' : 'text-red-600'}>{result.sip.returnPct.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span className="text-gray-600">CAGR</span><span>{result.sip.cagr.toFixed(2)}%</span></div>
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-amber-800 mb-2">Lumpsum ({formatINR(result.lumpsum.invested)})</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Invested</span><span className="font-medium">{formatINR(result.lumpsum.invested)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Value</span><span className="font-bold text-green-600">{formatINR(result.lumpsum.value)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Returns</span><span className={result.lumpsum.returnPct >= 0 ? 'text-green-600' : 'text-red-600'}>{result.lumpsum.returnPct.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span className="text-gray-600">CAGR</span><span>{result.lumpsum.cagr.toFixed(2)}%</span></div>
              </div>
            </div>
          </div>
          {result.chartData && (
            <div>
              <div className="flex gap-4 justify-center mb-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-blue-500 inline-block" style={{borderBottom: '2px dashed #3b82f6'}}></span> Invested</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-green-600 inline-block"></span> SIP Value</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-500 inline-block" style={{borderBottom: '2px dashed #f59e0b'}}></span> Lumpsum Value</span>
              </div>
              <GrowthChart data={result.chartData} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ===== CAGR Calculator =====
const CagrTool = () => {
  const [beginVal, setBeginVal] = useState(100000);
  const [endVal, setEndVal] = useState(200000);
  const [years, setYears] = useState(5);

  const cagr = beginVal > 0 && years > 0 ? (Math.pow(endVal / beginVal, 1 / years) - 1) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InputField label="Beginning Value" value={beginVal} onChange={setBeginVal} prefix="₹" min={1} />
        <InputField label="Ending Value" value={endVal} onChange={setEndVal} prefix="₹" min={1} />
        <InputField label="Number of Years" value={years} onChange={setYears} min={1} max={50} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ResultCard label="CAGR" value={`${cagr.toFixed(2)}%`}
          color={cagr >= 0 ? 'text-green-600' : 'text-red-600'} />
        <ResultCard label="Total Return" value={`${((endVal / beginVal - 1) * 100).toFixed(2)}%`} />
        <ResultCard label="Multiplier" value={`${(endVal / beginVal).toFixed(2)}x`} />
      </div>
    </div>
  );
};

// ===== Goal Planner =====
const GoalTool = () => {
  const [target, setTarget] = useState(1000000);
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState(12);

  const monthlyRate = rate / 100 / 12;
  const months = years * 12;
  const sipNeeded = monthlyRate > 0
    ? target * monthlyRate / (Math.pow(1 + monthlyRate, months) - 1)
    : target / months;
  const totalInvested = sipNeeded * months;
  const wealthGain = target - totalInvested;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InputField label="Target Amount" value={target} onChange={setTarget} prefix="₹" min={1000} step={100000} />
        <InputField label="Time Period (Years)" value={years} onChange={setYears} min={1} max={40} />
        <InputField label="Expected Return % (p.a.)" value={rate} onChange={setRate} suffix="%" min={1} max={30} step={0.5} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ResultCard label="Monthly SIP Needed" value={formatINR(Math.ceil(sipNeeded))} color="text-blue-600" />
        <ResultCard label="Total Investment" value={formatINR(Math.ceil(totalInvested))} />
        <ResultCard label="Wealth Gain" value={formatINR(Math.ceil(wealthGain))} color="text-green-600" />
        <ResultCard label="Target" value={formatINR(target)} />
      </div>
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex h-6 rounded-full overflow-hidden">
          <div className="bg-blue-500" style={{ width: `${(totalInvested / target) * 100}%` }}></div>
          <div className="bg-green-500" style={{ width: `${(wealthGain / target) * 100}%` }}></div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Investment: {((totalInvested / target) * 100).toFixed(0)}%</span>
          <span>Growth: {((wealthGain / target) * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
};

// ===== EMI Calculator =====
const EmiTool = () => {
  const [principal, setPrincipal] = useState(2000000);
  const [rate, setRate] = useState(8.5);
  const [tenure, setTenure] = useState(20);

  const monthlyRate = rate / 100 / 12;
  const months = tenure * 12;
  const emi = monthlyRate > 0
    ? principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1)
    : principal / months;
  const totalPayment = emi * months;
  const totalInterest = totalPayment - principal;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InputField label="Loan Amount" value={principal} onChange={setPrincipal} prefix="₹" min={10000} step={100000} />
        <InputField label="Interest Rate (% p.a.)" value={rate} onChange={setRate} suffix="%" min={1} max={30} step={0.1} />
        <InputField label="Tenure (Years)" value={tenure} onChange={setTenure} min={1} max={30} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ResultCard label="Monthly EMI" value={formatINR(Math.ceil(emi))} color="text-blue-600" />
        <ResultCard label="Total Interest" value={formatINR(Math.ceil(totalInterest))} color="text-red-600" />
        <ResultCard label="Total Payment" value={formatINR(Math.ceil(totalPayment))} />
        <ResultCard label="Principal" value={formatINR(principal)} />
      </div>
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex h-6 rounded-full overflow-hidden">
          <div className="bg-blue-500" style={{ width: `${(principal / totalPayment) * 100}%` }}></div>
          <div className="bg-red-400" style={{ width: `${(totalInterest / totalPayment) * 100}%` }}></div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Principal: {((principal / totalPayment) * 100).toFixed(0)}%</span>
          <span>Interest: {((totalInterest / totalPayment) * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
};

// ===== Compound Interest Calculator =====
const CiTool = () => {
  const [principal, setPrincipal] = useState(500000);
  const [rate, setRate] = useState(7);
  const [years, setYears] = useState(5);
  const [frequency, setFrequency] = useState(4); // quarterly

  const amount = principal * Math.pow(1 + rate / 100 / frequency, frequency * years);
  const interest = amount - principal;

  const chartData = [];
  for (let y = 0; y <= years; y++) {
    const val = principal * Math.pow(1 + rate / 100 / frequency, frequency * y);
    chartData.push({ label: `Yr ${y}`, invested: principal, value: val });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InputField label="Principal Amount" value={principal} onChange={setPrincipal} prefix="₹" min={1000} step={50000} />
        <InputField label="Interest Rate (% p.a.)" value={rate} onChange={setRate} suffix="%" min={1} max={20} step={0.1} />
        <InputField label="Period (Years)" value={years} onChange={setYears} min={1} max={30} />
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">Compounding</label>
          <select value={frequency} onChange={e => setFrequency(parseInt(e.target.value))}
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm">
            <option value={1}>Yearly</option>
            <option value={2}>Half-Yearly</option>
            <option value={4}>Quarterly</option>
            <option value={12}>Monthly</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ResultCard label="Maturity Amount" value={formatINR(Math.ceil(amount))} color="text-green-600" />
        <ResultCard label="Interest Earned" value={formatINR(Math.ceil(interest))} color="text-blue-600" />
        <ResultCard label="Effective Return" value={`${((amount / principal - 1) * 100).toFixed(2)}%`} />
      </div>
      <GrowthChart data={chartData} height={180} />
    </div>
  );
};

// ===== Main Calculator Page =====
const CalculatorPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTool = searchParams.get('tool') || null;

  const setTool = (id) => {
    if (id) {
      setSearchParams({ tool: id });
    } else {
      setSearchParams({});
    }
  };

  const renderTool = () => {
    switch (activeTool) {
      case 'sip': return <SipTool />;
      case 'lumpsum': return <LumpsumTool />;
      case 'compare': return <CompareTool />;
      case 'cagr': return <CagrTool />;
      case 'goal': return <GoalTool />;
      case 'emi': return <EmiTool />;
      case 'ci': return <CiTool />;
      default: return null;
    }
  };

  const activeToolData = TOOLS.find(t => t.id === activeTool);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-3 sm:p-4 md:p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Calculators</h1>
          <p className="text-sm text-gray-500 mt-1">Investment planning and analysis tools</p>
        </div>

        {/* Tool selector grid */}
        {!activeTool ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                onClick={() => setTool(tool.id)}
                className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all text-left focus:outline-none"
              >
                <div className="text-2xl mb-2">{tool.icon}</div>
                <h3 className="text-sm font-bold text-gray-900">{tool.label}</h3>
                <p className="text-xs text-gray-500 mt-1">{tool.desc}</p>
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Back + tool header */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTool(null)}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors focus:outline-none"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{activeToolData?.icon} {activeToolData?.label}</h2>
                <p className="text-xs text-gray-500">{activeToolData?.desc}</p>
              </div>
            </div>

            {/* Tool switcher pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {TOOLS.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => setTool(tool.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors focus:outline-none ${
                    activeTool === tool.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tool.label}
                </button>
              ))}
            </div>

            {/* Calculator content */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
              {renderTool()}
            </div>

            {/* Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700">
                <span className="font-semibold">Disclaimer:</span> These calculators are for informational and educational purposes only. Past performance does not guarantee future results. Calculations are based on historical data and assumed rates. Consult a qualified financial advisor for personalized advice.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CalculatorPage;
