import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
import api from '../api';
import { useChartTheme } from '@/hooks/useChartTheme';
import { cn } from '@/lib/utils';
import { selectClass } from '@/lib/select';
import { segmentClass } from '@/lib/segment';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PageContainer from './common/PageContainer';
import PageHeader from './common/PageHeader';
import StatCard from './common/StatCard';

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

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-muted-foreground';

const InputField = ({ label, value, onChange, type = 'number', prefix, suffix, ...props }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
          className={cn('tabular-nums', prefix ? 'pl-7' : 'pl-3', suffix ? 'pr-10' : 'pr-3')}
          {...props}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
};

const SelectField = ({ label, children, ...props }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
      <select id={id} className={cn(selectClass, 'w-full')} {...props}>{children}</select>
    </div>
  );
};

const ResultCard = ({ label, value, sub, color }) => (
  <StatCard label={label} value={<span className={color}>{value}</span>} sub={sub} />
);

// Tone classes for result values (were green/red/blue text).
const tone = (positive) => (positive ? 'text-gain' : 'text-loss');
const EMPHASIS = 'text-foreground dark:text-primary';

const QUICK_PICK_CLASS = 'h-7 px-2 text-xs font-normal';

const GrowthChart = ({ data, width = 600, height = 200 }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: width, h: height });
  const ct = useChartTheme();

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
    ctx.strokeStyle = ct.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(dims.w - pad.r, yy); ctx.stroke();
      ctx.fillStyle = ct.text; ctx.font = '10px system-ui'; ctx.textAlign = 'right';
      ctx.fillText(formatINR(maxV - (maxV / 4) * i), pad.l - 5, yy + 3);
    }

    // Date labels
    ctx.fillStyle = ct.text; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(data.length / 6));
    for (let i = 0; i < data.length; i += step) {
      ctx.fillText(data[i].label || '', x(i), dims.h - 5);
    }

    // Invested line (dashed, chart-2)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = ct.palette[1]; ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => i === 0 ? ctx.moveTo(x(i), y(d.invested)) : ctx.lineTo(x(i), y(d.invested)));
    ctx.stroke();
    ctx.setLineDash([]);

    // Value line
    const isPos = data[data.length - 1].value >= data[data.length - 1].invested;
    ctx.strokeStyle = isPos ? ct.gain : ct.loss; ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => i === 0 ? ctx.moveTo(x(i), y(d.value)) : ctx.lineTo(x(i), y(d.value)));
    ctx.stroke();

    // Fill
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = isPos ? ct.gain : ct.loss;
    ctx.beginPath();
    data.forEach((d, i) => i === 0 ? ctx.moveTo(x(i), y(d.value)) : ctx.lineTo(x(i), y(d.value)));
    ctx.lineTo(x(data.length - 1), y(0)); ctx.lineTo(x(0), y(0)); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // Value2 line (for compare mode)
    if (data[0].value2 !== undefined) {
      const isPos2 = data[data.length - 1].value2 >= data[data.length - 1].invested;
      ctx.strokeStyle = isPos2 ? ct.warning : ct.palette[5]; ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      data.forEach((d, i) => i === 0 ? ctx.moveTo(x(i), y(d.value2)) : ctx.lineTo(x(i), y(d.value2)));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [data, dims, ct]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <div ref={containerRef}>
      <canvas ref={canvasRef} style={{ width: dims.w, height: dims.h }} />
    </div>
  );
};

// ===== Search Input with Dropdown =====
const SearchInput = ({ label, value, onChange, onSelect, placeholder, searchEndpoint, searchBoth }) => {
  const id = useId();
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
      <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
      <Input
        id={id}
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          {suggestions.map((item) => (
            <li key={item.symbol}>
              <button
                type="button"
                className="w-full border-b border-border px-3 py-2 text-left transition-colors last:border-0 hover:bg-muted/50 focus:outline-hidden focus-visible:bg-muted/50"
                onClick={() => {
                  setQuery(item.name || item.symbol);
                  onChange(item.symbol);
                  onSelect(item);
                  setShowDropdown(false);
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 truncate text-sm font-medium">{item.name || item.symbol}</div>
                  {item.category && (
                    <Badge
                      variant={item.category === 'Mutual Fund' ? 'outline' : 'secondary'}
                      className="ml-2 rounded-sm px-1.5 text-[9px]"
                    >{item.category}</Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">{item.symbol}</div>
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
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Instrument type">
        <button type="button" aria-pressed={mode === 'stock'}
          onClick={() => { setMode('stock'); setSymbol(''); setDisplayName(''); setResult(null); }}
          className={segmentClass(mode === 'stock')}>
          Stocks
        </button>
        <button type="button" aria-pressed={mode === 'mf'}
          onClick={() => { setMode('mf'); setSymbol(''); setDisplayName(''); setResult(null); }}
          className={segmentClass(mode === 'mf')}>
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
        <SelectField label="Period" value={years} onChange={e => setYears(parseInt(e.target.value))}>
          {[1,2,3,5,7,10,15,20].map(y => <option key={y} value={y}>{y} Years</option>)}
        </SelectField>
        <div className="flex items-end">
          <Button type="button" onClick={() => calculate()} disabled={loading || !symbol} className="w-full">
            {loading ? 'Calculating...' : 'Calculate'}
          </Button>
        </div>
      </div>

      {/* Quick picks */}
      <div className="flex flex-wrap gap-2">
        {mode === 'stock'
          ? POPULAR_STOCKS.map(s => (
            <Button key={s} type="button" variant="secondary" size="xs" onClick={() => { setSymbol(s); setDisplayName(s.replace('.NS', '')); calculate(s); }}
              className={QUICK_PICK_CLASS}>
              {s.replace('.NS', '')}
            </Button>
          ))
          : POPULAR_MFS.map(mf => (
            <Button key={mf.symbol} type="button" variant="secondary" size="xs" onClick={() => { setSymbol(mf.symbol); setDisplayName(mf.name); calculate(mf.symbol); }}
              className={QUICK_PICK_CLASS}>
              {mf.name}
            </Button>
          ))
        }
      </div>

      {error && <div role="alert" className="py-4 text-center text-sm text-loss">{error}</div>}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ResultCard label="Total Invested" value={formatINR(result.total_invested)} />
            <ResultCard label="Current Value" value={formatINR(result.current_value)}
              color={tone(result.total_return >= 0)} />
            <ResultCard label="Total Returns" value={`${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct}%`}
              sub={formatINR(result.total_return)} color={tone(result.total_return >= 0)} />
            <ResultCard label="CAGR" value={`${result.cagr}%`}
              color={tone(result.cagr >= 0)} />
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
        <SelectField label="Period" value={years} onChange={e => setYears(parseInt(e.target.value))}>
          {[1,2,3,5,7,10].map(y => <option key={y} value={y}>{y} Years</option>)}
        </SelectField>
        <div className="flex items-end">
          <Button type="button" onClick={() => calculate()} disabled={loading || !symbol} className="w-full">
            {loading ? 'Calculating...' : 'Calculate'}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {POPULAR_STOCKS.map(s => (
          <Button key={s} type="button" variant="secondary" size="xs" onClick={() => { setSymbol(s); setDisplayName(s.replace('.NS', '')); calculate(s); }}
            className={QUICK_PICK_CLASS}>
            {s.replace('.NS', '')}
          </Button>
        ))}
      </div>
      {error && <div role="alert" className="py-4 text-center text-sm text-loss">{error}</div>}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ResultCard label="Invested" value={formatINR(result.amount)} />
            <ResultCard label="Current Value" value={formatINR(result.currentValue)}
              color={tone(result.totalReturn >= 0)} />
            <ResultCard label="Returns" value={`${result.totalReturnPct >= 0 ? '+' : ''}${result.totalReturnPct.toFixed(2)}%`}
              sub={formatINR(result.totalReturn)} color={tone(result.totalReturn >= 0)} />
            <ResultCard label="CAGR" value={`${result.cagr.toFixed(2)}%`}
              color={tone(result.cagr >= 0)} />
          </div>
          <div className="text-center text-xs text-muted-foreground tabular-nums">
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
  const ct = useChartTheme();

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

  // Swatch colors follow GrowthChart's rule: each line is judged at its last point against invested.
  const lastPoint = result?.chartData?.[result.chartData.length - 1];
  const sipUp = !lastPoint || lastPoint.value >= lastPoint.invested;
  const lumpsumUp = !lastPoint || lastPoint.value2 >= lastPoint.invested;
  const sipBg = sipUp ? 'bg-gain' : 'bg-loss';
  const lumpsumColor = lumpsumUp ? null : ct.palette[5]; // null → token class (warning)

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
        <SelectField label="Period" value={years} onChange={e => setYears(parseInt(e.target.value))}>
          {[1,2,3,5,7,10].map(y => <option key={y} value={y}>{y} Years</option>)}
        </SelectField>
        <div className="flex items-end">
          <Button type="button" onClick={() => calculate()} disabled={loading || !symbol} className="w-full">
            {loading ? 'Comparing...' : 'Compare'}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {POPULAR_STOCKS.map(s => (
          <Button key={s} type="button" variant="secondary" size="xs" onClick={() => { setSymbol(s); setDisplayName(s.replace('.NS', '')); calculate(s); }}
            className={QUICK_PICK_CLASS}>
            {s.replace('.NS', '')}
          </Button>
        ))}
      </div>
      {error && <div role="alert" className="py-4 text-center text-sm text-loss">{error}</div>}
      {result && (
        <div className="space-y-4">
          {result.winner && (
            <div className="text-center py-2">
              <Badge variant="gain" className="px-3 py-1 text-sm font-semibold tabular-nums">
                {result.winner} wins by {formatINR(Math.abs(result.sip.value - result.lumpsum.value))}
              </Badge>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className={cn('size-2 shrink-0 rounded-full', sipBg)} aria-hidden />SIP (Monthly ₹{amount.toLocaleString('en-IN')})</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Invested</span><span className="font-medium tabular-nums">{formatINR(result.sip.invested)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Value</span><span className="font-bold text-gain tabular-nums">{formatINR(result.sip.value)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Returns</span><span className={cn('tabular-nums', tone(result.sip.returnPct >= 0))}>{result.sip.returnPct.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">CAGR</span><span className="tabular-nums">{result.sip.cagr.toFixed(2)}%</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className={cn('size-2 shrink-0 rounded-full', !lumpsumColor && 'bg-warning')} style={lumpsumColor ? { backgroundColor: lumpsumColor } : undefined} aria-hidden />Lumpsum ({formatINR(result.lumpsum.invested)})</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Invested</span><span className="font-medium tabular-nums">{formatINR(result.lumpsum.invested)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Value</span><span className="font-bold text-gain tabular-nums">{formatINR(result.lumpsum.value)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Returns</span><span className={cn('tabular-nums', tone(result.lumpsum.returnPct >= 0))}>{result.lumpsum.returnPct.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">CAGR</span><span className="tabular-nums">{result.lumpsum.cagr.toFixed(2)}%</span></div>
              </div>
            </div>
          </div>
          {result.chartData && (
            <div>
              <div className="flex gap-4 justify-center mb-2 text-xs">
                <span className="flex items-center gap-1"><span className="inline-block w-4 border-b-2 border-dashed border-chart-2" aria-hidden /> Invested</span>
                <span className="flex items-center gap-1"><span className={cn('inline-block h-0.5 w-4', sipBg)} aria-hidden /> SIP Value</span>
                <span className="flex items-center gap-1"><span className={cn('inline-block w-4 border-b-2 border-dashed', !lumpsumColor && 'border-warning')} style={lumpsumColor ? { borderColor: lumpsumColor } : undefined} aria-hidden /> Lumpsum Value</span>
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
          color={tone(cagr >= 0)} />
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
        <ResultCard label="Monthly SIP Needed" value={formatINR(Math.ceil(sipNeeded))} color={EMPHASIS} />
        <ResultCard label="Total Investment" value={formatINR(Math.ceil(totalInvested))} />
        <ResultCard label="Wealth Gain" value={formatINR(Math.ceil(wealthGain))} color="text-gain" />
        <ResultCard label="Target" value={formatINR(target)} />
      </div>
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex h-6 overflow-hidden rounded-full">
          <div className="bg-chart-2" style={{ width: `${(totalInvested / target) * 100}%` }}></div>
          <div className="bg-gain" style={{ width: `${(wealthGain / target) * 100}%` }}></div>
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-2" aria-hidden />Investment: {((totalInvested / target) * 100).toFixed(0)}%</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-gain" aria-hidden />Growth: {((wealthGain / target) * 100).toFixed(0)}%</span>
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
        <ResultCard label="Monthly EMI" value={formatINR(Math.ceil(emi))} color={EMPHASIS} />
        <ResultCard label="Total Interest" value={formatINR(Math.ceil(totalInterest))} color="text-loss" />
        <ResultCard label="Total Payment" value={formatINR(Math.ceil(totalPayment))} />
        <ResultCard label="Principal" value={formatINR(principal)} />
      </div>
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex h-6 overflow-hidden rounded-full">
          <div className="bg-chart-2" style={{ width: `${(principal / totalPayment) * 100}%` }}></div>
          <div className="bg-loss/70" style={{ width: `${(totalInterest / totalPayment) * 100}%` }}></div>
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-2" aria-hidden />Principal: {((principal / totalPayment) * 100).toFixed(0)}%</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-loss/70" aria-hidden />Interest: {((totalInterest / totalPayment) * 100).toFixed(0)}%</span>
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
        <SelectField label="Compounding" value={frequency} onChange={e => setFrequency(parseInt(e.target.value))}>
          <option value={1}>Yearly</option>
          <option value={2}>Half-Yearly</option>
          <option value={4}>Quarterly</option>
          <option value={12}>Monthly</option>
        </SelectField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ResultCard label="Maturity Amount" value={formatINR(Math.ceil(amount))} color="text-gain" />
        <ResultCard label="Interest Earned" value={formatINR(Math.ceil(interest))} color={EMPHASIS} />
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
    <PageContainer className="max-w-5xl">
      <PageHeader title="Financial Calculators" description="Investment planning and analysis tools" />

      {/* Tool selector grid */}
      {!activeTool ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(tool => (
            <button
              key={tool.id}
              type="button"
              onClick={() => setTool(tool.id)}
              className="rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-foreground/20 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <div className="mb-2 text-2xl" aria-hidden>{tool.icon}</div>
              <h3 className="text-sm font-semibold">{tool.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{tool.desc}</p>
            </button>
          ))}
        </div>
      ) : (
        <>
          {/* Back + tool header */}
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="icon" onClick={() => setTool(null)} aria-label="All calculators">
              <ChevronLeft className="size-5" aria-hidden />
            </Button>
            <div>
              <h2 className="text-lg font-semibold">{activeToolData?.icon} {activeToolData?.label}</h2>
              <p className="text-xs text-muted-foreground">{activeToolData?.desc}</p>
            </div>
          </div>

          {/* Tool switcher pills */}
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-0.5 sm:w-fit" role="group" aria-label="Calculator type">
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                type="button"
                aria-pressed={activeTool === tool.id}
                onClick={() => setTool(tool.id)}
                className={cn(segmentClass(activeTool === tool.id), 'whitespace-nowrap')}
              >
                {tool.label}
              </button>
            ))}
          </div>

          {/* Calculator content */}
          <div className="rounded-xl border border-border bg-card p-4 md:p-6">
            {renderTool()}
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-xs text-foreground/85">
              <span className="font-semibold">Disclaimer:</span> These calculators are for informational and educational purposes only. Past performance does not guarantee future results. Calculations are based on historical data and assumed rates. Consult a qualified financial advisor for personalized advice.
            </p>
          </div>
        </>
      )}
    </PageContainer>
  );
};

export default CalculatorPage;
