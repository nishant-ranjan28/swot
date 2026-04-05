import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

// ---------- helpers ----------

const formatNumber = (num) => {
  if (num == null || isNaN(num)) return 'N/A';
  const abs = Math.abs(num);
  if (abs >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (abs >= 1e7) return `${(num / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${(num / 1e5).toFixed(2)}L`;
  return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

const fmt = (val, suffix = '') => {
  if (val == null || val === undefined) return 'N/A';
  if (typeof val === 'string') return val;
  return `${val.toFixed(2)}${suffix}`;
};

const pctFmt = (val) => {
  if (val == null) return 'N/A';
  // values from the API may already be in percent (like ROE 0.18 meaning 18%)
  // or may already be in percent form. We detect by magnitude.
  const display = Math.abs(val) < 1 && Math.abs(val) > 0 ? val * 100 : val;
  return `${display.toFixed(2)}%`;
};

// ---------- metric definitions ----------
// Each metric: { label, key: fn(summaryData) => value, format, bestIs }
// bestIs: 'high' | 'low' | 'none'

const extract = (data, path) => {
  if (!data) return null;
  const parts = path.split('.');
  let val = data;
  for (const p of parts) {
    val = val?.[p];
    if (val === undefined || val === null) return null;
  }
  return val;
};

const METRIC_SECTIONS = [
  {
    title: 'Price',
    metrics: [
      { label: 'Current Price', key: (d) => extract(d, 'quote.price'), format: (v) => v != null ? `₹${fmt(v)}` : 'N/A', bestIs: 'none' },
      { label: 'Day Change %', key: (d) => extract(d, 'quote.change_percent'), format: (v) => fmt(v, '%'), bestIs: 'high' },
      { label: '52W High', key: (d) => extract(d, 'quote.week52_high') ?? extract(d, 'overview.fifty_two_week_high'), format: (v) => v != null ? `₹${fmt(v)}` : 'N/A', bestIs: 'none' },
      { label: '52W Low', key: (d) => extract(d, 'quote.week52_low') ?? extract(d, 'overview.fifty_two_week_low'), format: (v) => v != null ? `₹${fmt(v)}` : 'N/A', bestIs: 'none' },
    ],
  },
  {
    title: 'Valuation',
    metrics: [
      { label: 'Market Cap', key: (d) => extract(d, 'quote.market_cap') ?? extract(d, 'overview.market_cap'), format: (v) => v != null ? `₹${formatNumber(v)}` : 'N/A', bestIs: 'high' },
      { label: 'P/E', key: (d) => extract(d, 'financials.pe_ratio'), format: (v) => fmt(v), bestIs: 'low' },
      { label: 'Forward P/E', key: (d) => extract(d, 'financials.forward_pe'), format: (v) => fmt(v), bestIs: 'low' },
      { label: 'P/B', key: (d) => extract(d, 'financials.price_to_book'), format: (v) => fmt(v), bestIs: 'low' },
      { label: 'EV/EBITDA', key: (d) => extract(d, 'financials.ev_ebitda'), format: (v) => fmt(v), bestIs: 'low' },
      { label: 'PEG', key: (d) => extract(d, 'financials.peg_ratio'), format: (v) => fmt(v), bestIs: 'low' },
    ],
  },
  {
    title: 'Profitability',
    metrics: [
      { label: 'ROE', key: (d) => extract(d, 'financials.return_on_equity'), format: pctFmt, bestIs: 'high' },
      { label: 'ROA', key: (d) => extract(d, 'financials.return_on_assets'), format: pctFmt, bestIs: 'high' },
      { label: 'Profit Margin', key: (d) => extract(d, 'financials.profit_margin'), format: pctFmt, bestIs: 'high' },
      { label: 'Operating Margin', key: (d) => extract(d, 'financials.operating_margin'), format: pctFmt, bestIs: 'high' },
      { label: 'Gross Margin', key: (d) => extract(d, 'financials.gross_margin'), format: pctFmt, bestIs: 'high' },
    ],
  },
  {
    title: 'Growth',
    metrics: [
      { label: 'Revenue Growth', key: (d) => extract(d, 'financials.revenue_growth'), format: pctFmt, bestIs: 'high' },
      { label: 'Earnings Growth', key: (d) => extract(d, 'financials.earnings_growth'), format: pctFmt, bestIs: 'high' },
    ],
  },
  {
    title: 'Financial Health',
    metrics: [
      { label: 'Debt/Equity', key: (d) => extract(d, 'financials.debt_to_equity'), format: (v) => fmt(v), bestIs: 'low' },
      { label: 'Current Ratio', key: (d) => extract(d, 'financials.current_ratio'), format: (v) => fmt(v), bestIs: 'high' },
    ],
  },
  {
    title: 'Dividends',
    metrics: [
      { label: 'Dividend Yield', key: (d) => extract(d, 'financials.dividend_yield'), format: pctFmt, bestIs: 'high' },
      { label: 'Payout Ratio', key: (d) => extract(d, 'financials.payout_ratio'), format: pctFmt, bestIs: 'none' },
    ],
  },
  {
    title: 'Analyst',
    metrics: [
      { label: 'Recommendation', key: (d) => extract(d, 'financials.recommendation'), format: (v) => v ?? 'N/A', bestIs: 'none' },
      { label: 'Target Price', key: (d) => extract(d, 'financials.target_mean_price'), format: (v) => v != null ? `₹${fmt(v)}` : 'N/A', bestIs: 'high' },
    ],
  },
];

const PRESETS = [
  { label: 'IT Giants', symbols: ['TCS.NS', 'INFY.NS', 'WIPRO.NS', 'HCLTECH.NS'] },
  { label: 'Banks', symbols: ['HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'KOTAKBANK.NS'] },
  { label: 'Auto', symbols: ['TMCV.NS', 'MARUTI.NS', 'M&M.NS', 'EICHERMOT.NS'] },
];

const MAX_STOCKS = 4;
const MIN_STOCKS = 2;

// ---------- autocomplete input ----------

const StockInput = ({ value, onChange, onSelect, onRemove, canRemove }) => {
  const [query, setQuery] = useState(value?.symbol || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setQuery(value?.symbol || '');
  }, [value]);

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    onChange(null); // clear selected stock when typing

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/stocks/search?q=${encodeURIComponent(q)}`);
        const stocks = (res.data.results || []).slice(0, 6);
        setResults(stocks);
        setOpen(stocks.length > 0);
      } catch {
        setResults([]);
      }
    }, 350);
  };

  const pick = (stock) => {
    setQuery(stock.symbol);
    setOpen(false);
    setResults([]);
    onSelect(stock);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex items-center gap-1">
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-colors"
          placeholder="Search stock..."
          value={query}
          onChange={handleChange}
          autoComplete="off"
        />
        {canRemove && (
          <button
            onClick={onRemove}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors focus:outline-none"
            title="Remove stock"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
          {results.map((s) => (
            <li key={s.symbol}>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors focus:outline-none"
                onClick={() => pick(s)}
              >
                <span className="font-medium text-gray-900">{s.symbol}</span>
                <span className="text-gray-500 ml-2">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ---------- determine best value in a row ----------

const getBestIndex = (values, bestIs) => {
  if (bestIs === 'none') return -1;
  const nums = values.map((v) => (typeof v === 'number' ? v : null));
  const valid = nums.filter((n) => n != null);
  if (valid.length < 2) return -1;
  const target = bestIs === 'high' ? Math.max(...valid) : Math.min(...valid);
  return nums.indexOf(target);
};

// ---------- main component ----------

const ComparePage = () => {
  const [slots, setSlots] = useState([null, null]); // selected stock objects {symbol, name}
  const [data, setData] = useState({}); // symbol -> summary data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addSlot = () => {
    if (slots.length < MAX_STOCKS) setSlots((prev) => [...prev, null]);
  };

  const removeSlot = (idx) => {
    if (slots.length <= MIN_STOCKS) return;
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSlot = (idx, stock) => {
    setSlots((prev) => {
      const next = [...prev];
      next[idx] = stock;
      return next;
    });
  };

  const selectedSymbols = slots.filter(Boolean).map((s) => s.symbol);
  const canCompare = selectedSymbols.length >= 2;

  const fetchComparison = useCallback(async (symbols) => {
    if (!symbols || symbols.length < 2) return;
    setLoading(true);
    setError('');
    try {
      const resolved = symbols.map(sym => sym.includes('.') ? sym : `${sym}.NS`);
      const results = await Promise.all(
        resolved.map((sym) =>
          api.get(`/api/stocks/${encodeURIComponent(sym)}/summary`)
            .then(res => ({ symbol: sym, data: res.data, ok: true }))
            .catch(() => ({ symbol: sym, data: null, ok: false }))
        )
      );
      const newData = {};
      const failed = [];
      results.forEach(({ symbol, data: d, ok }) => {
        if (ok && d) {
          newData[symbol] = d;
        } else {
          failed.push(symbol.replace('.NS', ''));
        }
      });
      setData(newData);
      if (failed.length > 0 && Object.keys(newData).length < 2) {
        setError(`Could not fetch data for: ${failed.join(', ')}. Try different stocks.`);
      } else if (failed.length > 0) {
        setError(`Note: ${failed.join(', ')} not available. Showing remaining stocks.`);
      }
    } catch (err) {
      setError('Failed to fetch stock data. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCompare = () => {
    fetchComparison(selectedSymbols);
  };

  const handlePreset = (preset) => {
    const newSlots = preset.symbols.map((sym) => ({ symbol: sym, name: sym }));
    setSlots(newSlots);
    fetchComparison(preset.symbols);
  };

  const removeStockColumn = (symbol) => {
    setSlots((prev) => {
      const next = prev.filter((s) => s?.symbol !== symbol);
      while (next.length < MIN_STOCKS) next.push(null);
      return next;
    });
    setData((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
  };

  const comparedSymbols = Object.keys(data);
  const hasResults = comparedSymbols.length >= 2;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Comparison</h1>
            <p className="text-sm text-gray-500 mt-1">Compare 2-4 stocks side by side on key metrics</p>
          </div>
          <Link
            to="/"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium focus:outline-none"
          >
            Back to Home
          </Link>
        </div>

        {/* Quick Presets */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Compare</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors focus:outline-none"
              >
                {preset.label}
                <span className="ml-1 text-blue-400 text-xs">({preset.symbols.join(', ')})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Stock Selectors */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Select Stocks</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {slots.map((slot, idx) => (
              <StockInput
                key={idx}
                value={slot}
                onChange={(stock) => updateSlot(idx, stock)}
                onSelect={(stock) => updateSlot(idx, stock)}
                onRemove={() => removeSlot(idx)}
                canRemove={slots.length > MIN_STOCKS}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            {slots.length < MAX_STOCKS && (
              <button
                onClick={addSlot}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors focus:outline-none"
              >
                + Add Stock
              </button>
            )}
            <button
              onClick={handleCompare}
              disabled={!canCompare || loading}
              className={`px-6 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${
                canCompare && !loading
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {loading ? 'Comparing...' : 'Compare'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* Comparison Table */}
        {hasResults && !loading && (
          <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                {/* Header row with stock names */}
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40 min-w-[160px]">
                      Metric
                    </th>
                    {comparedSymbols.map((sym) => {
                      const quote = data[sym]?.quote;
                      return (
                        <th key={sym} className="px-4 py-3 text-center min-w-[140px]">
                          <div className="flex items-center justify-center gap-1">
                            <Link
                              to={`/stock/${sym}`}
                              className="text-blue-600 hover:text-blue-800 font-bold text-sm focus:outline-none"
                            >
                              {sym}
                            </Link>
                            <button
                              onClick={() => removeStockColumn(sym)}
                              className="ml-1 p-0.5 text-gray-300 hover:text-red-500 transition-colors focus:outline-none"
                              title="Remove"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {quote?.name && (
                            <div className="text-[11px] text-gray-400 font-normal mt-0.5 truncate max-w-[140px]">
                              {quote.name}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {METRIC_SECTIONS.map((section) => (
                    <React.Fragment key={section.title}>
                      {/* Section header */}
                      <tr>
                        <td
                          colSpan={comparedSymbols.length + 1}
                          className="sticky left-0 z-10 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 uppercase tracking-wider"
                        >
                          {section.title}
                        </td>
                      </tr>

                      {/* Metric rows */}
                      {section.metrics.map((metric) => {
                        const rawValues = comparedSymbols.map((sym) => metric.key(data[sym]));
                        const bestIdx = getBestIndex(rawValues, metric.bestIs);

                        return (
                          <tr key={metric.label} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                            <td className="sticky left-0 z-10 bg-white px-4 py-2.5 text-sm text-gray-700 font-medium whitespace-nowrap">
                              {metric.label}
                            </td>
                            {rawValues.map((val, i) => {
                              const isBest = i === bestIdx;
                              return (
                                <td
                                  key={comparedSymbols[i]}
                                  className={`px-4 py-2.5 text-sm text-center font-medium ${
                                    isBest ? 'text-green-700 bg-green-50' : 'text-gray-900'
                                  }`}
                                >
                                  {metric.format(val)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Disclaimer */}
            <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
              <p className="text-[11px] text-gray-400 text-center">
                Green highlights indicate the best value in each row. Data sourced from market feeds and may be delayed.
              </p>
            </div>
          </div>

          {/* Verdict & Summary */}
          <ComparisonVerdict data={data} symbols={comparedSymbols} />
          </>
        )}
      </main>
    </div>
  );
};

// ===== Verdict Component =====
const ComparisonVerdict = ({ data, symbols }) => {
  if (!data || symbols.length < 2) return null;

  // Score each stock across categories
  const scores = {};
  symbols.forEach(sym => { scores[sym] = { valuation: 0, profitability: 0, growth: 0, health: 0, momentum: 0, total: 0, wins: 0 }; });

  const compete = (getter, category, lowerBetter = false) => {
    const vals = symbols.map(sym => ({ sym, val: getter(data[sym]) })).filter(v => v.val != null && !isNaN(v.val));
    if (vals.length < 2) return;
    vals.sort((a, b) => lowerBetter ? a.val - b.val : b.val - a.val);
    vals.forEach((v, i) => {
      const pts = i === 0 ? 3 : i === 1 ? 1 : 0;
      scores[v.sym][category] += pts;
      scores[v.sym].total += pts;
      if (i === 0) scores[v.sym].wins += 1;
    });
  };

  // Valuation (lower is better)
  compete(d => d?.financials?.pe_ratio, 'valuation', true);
  compete(d => d?.financials?.forward_pe, 'valuation', true);
  compete(d => d?.financials?.price_to_book, 'valuation', true);
  compete(d => d?.financials?.peg_ratio, 'valuation', true);

  // Profitability (higher is better)
  compete(d => d?.financials?.return_on_equity, 'profitability');
  compete(d => d?.financials?.return_on_assets, 'profitability');
  compete(d => d?.financials?.profit_margin, 'profitability');
  compete(d => d?.financials?.operating_margin, 'profitability');
  compete(d => d?.financials?.gross_margin, 'profitability');

  // Growth (higher is better)
  compete(d => d?.financials?.revenue_growth, 'growth');
  compete(d => d?.financials?.earnings_growth, 'growth');

  // Health (lower debt, higher ratio is better)
  compete(d => d?.financials?.debt_to_equity, 'health', true);

  // Momentum (higher is better)
  compete(d => d?.quote?.change_percent, 'momentum');

  // Rank stocks
  const ranked = symbols
    .map(sym => ({
      sym,
      name: data[sym]?.quote?.name || sym.replace('.NS', ''),
      price: data[sym]?.quote?.price,
      ...scores[sym],
    }))
    .sort((a, b) => b.total - a.total);

  const winner = ranked[0];
  const categories = ['valuation', 'profitability', 'growth', 'health', 'momentum'];
  const catLabels = { valuation: 'Valuation', profitability: 'Profitability', growth: 'Growth', health: 'Financial Health', momentum: 'Momentum' };

  // Generate insights
  const insights = [];
  symbols.forEach(sym => {
    const d = data[sym];
    const name = d?.quote?.name || sym.replace('.NS', '');
    const pe = d?.financials?.pe_ratio;
    const roe = d?.financials?.return_on_equity;
    const de = d?.financials?.debt_to_equity;
    const pm = d?.financials?.profit_margin;
    const rg = d?.financials?.revenue_growth;

    if (pe && pe < 15) insights.push({ sym, text: `${name} has an attractive P/E of ${pe.toFixed(1)}, suggesting good value.`, type: 'positive' });
    if (pe && pe > 40) insights.push({ sym, text: `${name} trades at a premium P/E of ${pe.toFixed(1)}, priced for high growth.`, type: 'neutral' });
    if (roe && roe > 0.20) insights.push({ sym, text: `${name} has excellent ROE of ${(roe * 100).toFixed(1)}%, generating strong returns.`, type: 'positive' });
    if (de && de > 150) insights.push({ sym, text: `${name} has high debt/equity of ${de.toFixed(0)}%, which carries risk.`, type: 'negative' });
    if (de != null && de < 30) insights.push({ sym, text: `${name} has very low debt (D/E: ${de.toFixed(0)}%), indicating strong balance sheet.`, type: 'positive' });
    if (pm && pm > 0.20) insights.push({ sym, text: `${name} has strong profit margins of ${(pm * 100).toFixed(1)}%.`, type: 'positive' });
    if (rg && rg > 0.15) insights.push({ sym, text: `${name} is growing revenue at ${(rg * 100).toFixed(1)}% — strong momentum.`, type: 'positive' });
    if (rg && rg < 0) insights.push({ sym, text: `${name}'s revenue is declining (${(rg * 100).toFixed(1)}%), a concern.`, type: 'negative' });
  });

  const maxTotal = Math.max(...ranked.map(r => r.total));

  return (
    <div className="space-y-4 mt-6">
      {/* Winner Banner */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Overall Winner</div>
            <div className="text-xl font-bold text-green-800">{winner.name}</div>
            <div className="text-sm text-green-600 mt-0.5">Won {winner.wins} out of {symbols.length > 2 ? '13' : '13'} metric comparisons</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-800">₹{winner.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <Link to={`/stock/${winner.sym}`} className="text-xs text-green-600 hover:text-green-800 font-medium">
              View detailed analysis →
            </Link>
          </div>
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Score Breakdown</h3>
        <div className="space-y-3">
          {ranked.map((stock, idx) => (
            <div key={stock.sym} className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                idx === 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {idx + 1}
              </div>
              <div className="w-32 text-sm font-medium text-gray-900 truncate">{stock.name}</div>
              <div className="flex-1">
                <div className="h-6 bg-gray-100 rounded-full overflow-hidden flex">
                  {categories.map(cat => {
                    const pct = maxTotal > 0 ? (stock[cat] / maxTotal) * 100 : 0;
                    const colors = {
                      valuation: 'bg-blue-400', profitability: 'bg-green-400',
                      growth: 'bg-purple-400', health: 'bg-amber-400', momentum: 'bg-cyan-400',
                    };
                    return pct > 0 ? (
                      <div key={cat} className={`h-full ${colors[cat]}`}
                        style={{ width: `${pct}%` }}
                        title={`${catLabels[cat]}: ${stock[cat]} pts`}
                      ></div>
                    ) : null;
                  })}
                </div>
              </div>
              <div className="w-12 text-right text-sm font-bold text-gray-900">{stock.total} pts</div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-100">
          {categories.map(cat => {
            const colors = { valuation: 'bg-blue-400', profitability: 'bg-green-400', growth: 'bg-purple-400', health: 'bg-amber-400', momentum: 'bg-cyan-400' };
            return (
              <span key={cat} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`w-3 h-3 rounded ${colors[cat]}`}></span>
                {catLabels[cat]}
              </span>
            );
          })}
        </div>
      </div>

      {/* Category Winners */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {categories.map(cat => {
          const catWinner = [...ranked].sort((a, b) => b[cat] - a[cat])[0];
          const colors = {
            valuation: 'border-blue-200 bg-blue-50', profitability: 'border-green-200 bg-green-50',
            growth: 'border-purple-200 bg-purple-50', health: 'border-amber-200 bg-amber-50',
            momentum: 'border-cyan-200 bg-cyan-50',
          };
          const textColors = {
            valuation: 'text-blue-700', profitability: 'text-green-700',
            growth: 'text-purple-700', health: 'text-amber-700', momentum: 'text-cyan-700',
          };
          return (
            <div key={cat} className={`rounded-lg border p-3 text-center ${colors[cat]}`}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{catLabels[cat]}</div>
              <div className={`text-sm font-bold mt-1 ${textColors[cat]}`}>{catWinner.name}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{catWinner[cat]} pts</div>
            </div>
          );
        })}
      </div>

      {/* Key Insights */}
      {insights.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Key Insights</h3>
          <div className="space-y-2">
            {insights.slice(0, 8).map((insight, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  insight.type === 'positive' ? 'bg-green-500' : insight.type === 'negative' ? 'bg-red-500' : 'bg-yellow-500'
                }`}></span>
                <p className="text-sm text-gray-700">{insight.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs text-amber-700">
          <span className="font-semibold">Disclaimer:</span> This comparison and scoring is algorithmically generated based on publicly available financial metrics. It is not investment advice. Different investors may weight categories differently based on their strategy. Always do your own research.
        </p>
      </div>
    </div>
  );
};

export default ComparePage;
